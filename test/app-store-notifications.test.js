const test = require("node:test");
const assert = require("node:assert/strict");

const {
  handleHttpNotification,
  notificationEnvironment,
  parseRequest,
} = require("../cloudbase/functions/appStoreNotifications/notificationService");

function encodedPayload(value) {
  return `header.${Buffer.from(JSON.stringify(value)).toString("base64url")}.signature`;
}

function createDb(seed = {}) {
  const documents = new Map(Object.entries(seed));
  const key = (collection, id) => `${collection}/${id}`;
  const db = {
    collection(collection) {
      return {
        doc(id) {
          return {
            async get() {
              const value = documents.get(key(collection, id));
              return { data: value ? [value] : [] };
            },
            async set(value) { documents.set(key(collection, id), { ...value, _id: value._id || id }); },
          };
        },
        where(query) {
          return {
            async get() {
              const prefix = `${collection}/`;
              const data = [...documents.entries()]
                .filter(([id, value]) => id.startsWith(prefix) && Object.entries(query).every(([name, expected]) => value[name] === expected))
                .map(([, value]) => value);
              return { data };
            },
          };
        },
      };
    },
  };
  return { db, documents };
}

function httpEvent(payload, method = "POST") {
  return { httpMethod: method, body: JSON.stringify({ signedPayload: payload }) };
}

test("HTTP 通知拒绝非 POST 和无效签名载荷", async () => {
  assert.throws(() => parseRequest({ httpMethod: "GET", body: "{}" }), /POST/);
  assert.throws(() => notificationEnvironment("not-a-jws"), /签名格式/);
  const response = await handleHttpNotification(httpEvent("bad", "GET"), { db: createDb().db, verifierFor: () => null });
  assert.equal(response.statusCode, 405);
});

test("退款通知将对应已购权益标为失效，并以通知 UUID 去重", async () => {
  const { db, documents } = createDb({
    "premiumTransactions/t-1": { transactionId: "t-1", userId: "u-1", status: "active" },
    "premiumEntitlements/u-1": {
      _id: "u-1", userId: "u-1", kind: "paid", source: "appStore", transactionId: "t-1", originalTransactionId: "o-1",
    },
  });
  const payload = encodedPayload({ environment: "Sandbox" });
  const verifier = {
    async verifyAndDecodeNotification() {
      return { notificationType: "REFUND", notificationUUID: "event-1", environment: "Sandbox", data: { signedTransactionInfo: "transaction-jws-that-is-long-enough-for-validation" } };
    },
    async verifyAndDecodeTransaction() {
      return { bundleId: "io.github.jenkjyu.afterzero", productId: "io.github.jenkjyu.afterzero.premium", transactionId: "t-1", originalTransactionId: "o-1", environment: "Sandbox" };
    },
  };
  const options = { db, verifierFor: (environment) => { assert.equal(environment, "Sandbox"); return verifier; }, now: () => 1234 };
  const first = await handleHttpNotification(httpEvent(payload), options);
  const second = await handleHttpNotification(httpEvent(payload), options);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(JSON.parse(second.body).duplicate, true);
  assert.equal(documents.get("premiumEntitlements/u-1").kind, "expired");
  assert.equal(documents.get("premiumTransactions/t-1").status, "revoked");
});

test("退款撤销反转会恢复同一笔 App Store 买断权益", async () => {
  const { db, documents } = createDb({
    "premiumTransactions/t-1": { transactionId: "t-1", status: "revoked" },
    "premiumEntitlements/u-1": {
      _id: "u-1", userId: "u-1", kind: "expired", source: "appStore", transactionId: "t-1", originalTransactionId: "o-1", revokedAt: 1,
    },
  });
  const verifier = {
    async verifyAndDecodeNotification() {
      return { notificationType: "REFUND_REVERSED", notificationUUID: "event-2", environment: "Sandbox", data: { signedTransactionInfo: "transaction-jws-that-is-long-enough-for-validation" } };
    },
    async verifyAndDecodeTransaction() {
      return { bundleId: "io.github.jenkjyu.afterzero", productId: "io.github.jenkjyu.afterzero.premium", transactionId: "t-1", originalTransactionId: "o-1", environment: "Sandbox" };
    },
  };
  const response = await handleHttpNotification(httpEvent(encodedPayload({ environment: "Sandbox" })), { db, verifierFor: () => verifier, now: () => 5678 });
  assert.equal(response.statusCode, 200);
  assert.equal(documents.get("premiumEntitlements/u-1").kind, "paid");
  assert.equal(documents.get("premiumTransactions/t-1").status, "active");
});

test("通知拒绝其他 App 或商品的交易", async () => {
  const { db } = createDb();
  const verifier = {
    async verifyAndDecodeNotification() {
      return { notificationType: "REFUND", notificationUUID: "event-3", data: { signedTransactionInfo: "transaction-jws-that-is-long-enough-for-validation" } };
    },
    async verifyAndDecodeTransaction() {
      return { bundleId: "com.example.other", productId: "io.github.jenkjyu.afterzero.premium", transactionId: "t-1", originalTransactionId: "o-1" };
    },
  };
  const response = await handleHttpNotification(httpEvent(encodedPayload({ environment: "Sandbox" })), { db, verifierFor: () => verifier });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).code, "NOTIFICATION_PRODUCT_MISMATCH");
});
