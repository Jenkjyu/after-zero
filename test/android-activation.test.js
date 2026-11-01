const test = require("node:test");
const assert = require("node:assert/strict");
const { activateAndroidCode } = require("../cloudbase/functions/premiumEntitlement/androidActivation");
const { trialAccess } = require("../cloudbase/functions/premiumEntitlement/accessService");
const { resolveCreditBucket } = require("../cloudbase/functions/aiDebtImport/importService");

function mockDb() {
  const documents = new Map([["premiumEntitlements/user-a", { _id: "user-a", userId: "user-a", kind: "expired" }],
    ["premiumEntitlements/user-b", { _id: "user-b", userId: "user-b", kind: "trial", trialEndsAt: 100 }]]);
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => ({ data: documents.has(`${name}/${id}`) ? [{ ...documents.get(`${name}/${id}`) }] : [] }),
      set: async (value) => { documents.set(`${name}/${id}`, { ...value, _id: id }); },
    }),
  });
  return {
    runTransaction: async (callback) => ({ result: await callback({ collection }) }),
    get: (name, id) => documents.get(`${name}/${id}`),
    put: (name, id, value) => documents.set(`${name}/${id}`, { ...value, _id: id }),
    remove: (name, id) => documents.delete(`${name}/${id}`),
  };
}

test("安卓测试码只可由一个账号领取，重复领取幂等；iOS 不获得该权益", async () => {
  const db = mockDb();
  const first = await activateAndroidCode(db, "user-a", "0000", 1000);
  assert.equal(trialAccess(first, 1000, "android").active, true);
  assert.equal(trialAccess(first, 1000, "ios").active, false);
  assert.deepEqual(resolveCreditBucket(first, 1000, 0, "android"), { bucket: "paid", limit: 25 });
  assert.throws(() => resolveCreditBucket(first, 1000, 0, "ios"), (error) => error.code === "PREMIUM_REQUIRED");
  assert.equal((await activateAndroidCode(db, "user-a", "0000", 1001)).androidActivation.activatedAt, 1000);
  await assert.rejects(activateAndroidCode(db, "user-b", "0000", 1002), (error) => error.code === "ACTIVATION_CODE_USED");
});

test("错误激活码按账号限速，Apple 已购权益仍独立生效", async () => {
  const db = mockDb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(activateAndroidCode(db, "user-a", "wrong", 1000 + attempt), (error) => error.code === "ACTIVATION_CODE_INVALID");
  }
  await assert.rejects(activateAndroidCode(db, "user-a", "0000", 1005), (error) => error.code === "ACTIVATION_RATE_LIMITED");
  const activated = await activateAndroidCode(db, "user-a", "0000", 1000 + 24 * 60 * 60 * 1000);
  assert.equal(trialAccess(activated, 0, "ios").active, false);
  assert.equal(trialAccess({ kind: "paid", source: "appStore" }, 0, "ios").active, true);
});

test("注销删除权益后，原微信账号仍可重新输入同一个测试码，其他账号不可领取", async () => {
  const db = mockDb();
  await activateAndroidCode(db, "user-a", "0000", 1000);
  db.remove("premiumEntitlements", "user-a");
  db.put("premiumEntitlements", "user-a", { userId: "user-a", kind: "expired" });
  const restored = await activateAndroidCode(db, "user-a", "0000", 2000);
  assert.equal(trialAccess(restored, 2000, "android").active, true);
  await assert.rejects(activateAndroidCode(db, "user-b", "0000", 2001), (error) => error.code === "ACTIVATION_CODE_USED");
});
