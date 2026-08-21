const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deletedPurchaseClaimForUser,
  withoutDocumentId,
} = require("../cloudbase/functions/premiumEntitlement/recoveryService");

function createDb(seed = {}) {
  const documents = new Map(Object.entries(seed));
  const key = (collection, id) => `${collection}/${id}`;
  return {
    collection(collection) {
      return {
        doc(id) {
          return {
            async get() {
              const value = documents.get(key(collection, id));
              return { data: value ? [value] : [] };
            },
          };
        },
        where(query) {
          const request = {
            limit() { return request; },
            async get() {
              const prefix = `${collection}/`;
              const data = [...documents.entries()]
                .filter(([id, value]) => id.startsWith(prefix) && Object.entries(query).every(([name, expected]) => value[name] === expected))
                .map(([, value]) => value);
              return { data };
            },
          };
          return request;
        },
      };
    },
  };
}

test("权益文档写回前剥离 CloudBase 只读 _id，且不修改查询结果", () => {
  const stored = { _id: "u-1", userId: "u-1", kind: "trial", appAccountTokens: ["token-1"] };
  assert.deepEqual(withoutDocumentId(stored), {
    userId: "u-1",
    kind: "trial",
    appAccountTokens: ["token-1"],
  });
  assert.equal(stored._id, "u-1");
});

test("注销后同一登录身份可使用保留的购买 token 恢复", async () => {
  const db = createDb({
    "identities/apple-hash": { _id: "apple-hash", userId: "u-new" },
    "premiumTrialClaims/apple-hash": { preservedPremiumEntitlement: { kind: "paid", appAccountTokens: ["token-old"], paidAiImportUsed: 7 } },
  });
  assert.deepEqual(await deletedPurchaseClaimForUser(db, "u-new", "token-old"), { source: "preserved-identity", paidAiImportUsed: 7 });
});

test("仅在旧账号及权益确实已删除时，才允许旧版遗漏保留凭据的交易恢复", async () => {
  const db = createDb({
    "identities/apple-hash": { _id: "apple-hash", userId: "u-new" },
    "premiumTransactions/t-1": { transactionId: "t-1", userId: "u-deleted", appAccountToken: "token-old", status: "active" },
  });
  assert.deepEqual(await deletedPurchaseClaimForUser(db, "u-new", "token-old"), { source: "deleted-transaction" });
});

test("经 Apple 验签的恢复购买可补建历史遗漏的交易账本", async () => {
  const db = createDb({
    "identities/apple-hash": { _id: "apple-hash", userId: "u-new" },
  });
  assert.deepEqual(
    await deletedPurchaseClaimForUser(db, "u-new", "token-lost", { userId: "u-new", trialEligible: false }),
    { source: "orphaned-verified-transaction" }
  );
  assert.equal(await deletedPurchaseClaimForUser(db, "u-new", "token-lost", { userId: "u-new", trialEligible: true }), null);
});

test("未删除的旧账号或已撤销交易不能借恢复购买转移权益", async () => {
  const activeDb = createDb({
    "premiumTransactions/t-1": { transactionId: "t-1", userId: "u-existing", appAccountToken: "token-old", status: "active" },
    "users/u-existing": { userId: "u-existing" },
  });
  const revokedDb = createDb({
    "premiumTransactions/t-1": { transactionId: "t-1", userId: "u-deleted", appAccountToken: "token-old", status: "revoked" },
  });
  assert.equal(await deletedPurchaseClaimForUser(activeDb, "u-new", "token-old"), null);
  assert.equal(await deletedPurchaseClaimForUser(revokedDb, "u-new", "token-old"), null);
});
