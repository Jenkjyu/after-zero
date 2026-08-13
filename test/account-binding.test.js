const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AI_MONTHLY_LIMIT,
  assertCurrentIdentity,
  identityDocumentId,
  mergeAccounts,
  mergedProviders,
  mergedUsageCount,
} = require("../cloudbase/functions/accountBinding/bindingService");

function identityDb(identity) {
  return {
    collection(name) {
      assert.equal(name, "identities");
      return {
        doc() {
          return { get: async () => ({ data: identity ? [identity] : [] }) };
        },
      };
    },
  };
}

function mergeDb(seed) {
  const data = new Map(Object.entries(seed).map(([collection, records]) => [
    collection,
    new Map(records.map((record) => [record._id, { ...record }])),
  ]));
  const collection = (name) => {
    if (!data.has(name)) data.set(name, new Map());
    const records = data.get(name);
    const filtered = (filter) => [...records.values()].filter((record) =>
      Object.entries(filter || {}).every(([key, value]) => record[key] === value)
    );
    return {
      where(filter) {
        const query = {
          limit() { return query; },
          get: async () => ({ data: filtered(filter).map((record) => ({ ...record })) }),
        };
        return query;
      },
      doc(id) {
        return {
          get: async () => ({ data: records.has(id) ? [{ ...records.get(id) }] : [] }),
          set: async (value) => { records.set(id, { ...value, _id: id }); },
          update: async (value) => {
            assert.ok(records.has(id), `${name}/${id} must exist before update`);
            records.set(id, { ...records.get(id), ...value });
          },
          remove: async () => { records.delete(id); },
        };
      },
    };
  };
  return {
    collection,
    runTransaction: async (callback) => ({ result: await callback({ collection }) }),
    record: (name, id) => data.get(name).get(id),
  };
}

test("账户绑定身份映射使用不可猜测且稳定的 provider + providerUserId 哈希", () => {
  assert.equal(identityDocumentId("wechat", "openid-a"), identityDocumentId("wechat", "openid-a"));
  assert.notEqual(identityDocumentId("wechat", "openid-a"), identityDocumentId("apple", "openid-a"));
  assert.notEqual(identityDocumentId("wechat", "openid-a"), "openid-a");
});

test("绑定前必须重新验证的当前身份确实属于当前云账号", async () => {
  await assert.doesNotReject(assertCurrentIdentity(identityDb({ userId: "u_current" }), "u_current", "apple", "apple-sub"));
  await assert.rejects(
    assertCurrentIdentity(identityDb({ userId: "u_other" }), "u_current", "apple", "apple-sub"),
    (error) => error.code === "CURRENT_REAUTH_MISMATCH"
  );
});

test("合并后的 provider 列表去重，AI 当月额度相加但绝不超过上限", () => {
  assert.deepEqual(mergedProviders({ providers: ["apple", "wechat"] }, { providers: ["wechat"] }), ["apple", "wechat"]);
  assert.equal(mergedUsageCount(48, 9), AI_MONTHLY_LIMIT);
  assert.equal(mergedUsageCount(3, 4), 7);
  assert.equal(mergedUsageCount(-3, 4), 4);
});

test("账户合并保留双方备份、迁移身份、封顶当月 AI 用量且可重试", async () => {
  const db = mergeDb({
    users: [
      { _id: "target-doc", userId: "u_target", providers: ["apple"], nickname: "目标" },
      { _id: "source-doc", userId: "u_source", providers: ["wechat"], openid: "wx-source", nickname: "来源" },
    ],
    identities: [{ _id: "wechat-id", userId: "u_source", provider: "wechat", providerUserId: "wx-source" }],
    backups: [{ _id: "backup-source", userId: "u_source", deviceName: "旧 Android", createdAt: 1 }],
    aiUsage: [
      { _id: "usage-target-aug", userId: "u_target", month: "2026-08", count: 48 },
      { _id: "usage-source-aug", userId: "u_source", month: "2026-08", count: 9 },
      { _id: "usage-source-sep", userId: "u_source", month: "2026-09", count: 5 },
    ],
  });
  const now = Date.parse("2026-08-13T00:00:00Z");
  const result = await mergeAccounts(db, { currentUserId: "u_target", otherUserId: "u_source", provider: "wechat", now });
  assert.equal(result.merged, true);
  assert.deepEqual(result.account.providers, ["apple", "wechat"]);
  assert.equal(db.record("users", "source-doc").mergedInto, "u_target");
  assert.equal(db.record("identities", "wechat-id").userId, "u_target");
  assert.equal(db.record("backups", "backup-source").userId, "u_target");
  assert.equal(db.record("backups", "backup-source").mergeSource.device, "旧 Android");
  assert.equal(db.record("aiUsage", "usage-target-aug").count, AI_MONTHLY_LIMIT);
  assert.equal(db.record("aiUsage", "usage-source-aug"), undefined);
  const retry = await mergeAccounts(db, { currentUserId: "u_target", otherUserId: "u_source", provider: "wechat", now: now + 1 });
  assert.equal(retry.merged, true);
  assert.equal(db.record("aiUsage", "usage-target-aug").count, AI_MONTHLY_LIMIT);
});
