const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

async function isMergedSession(userId) {
  const result = await db.collection("users").where({ userId }).limit(1).get();
  const user = result.data && result.data[0];
  return Boolean(user && user.mergedInto);
}

// 只返回列表要展示的轻量字段(不含debts/docs/premium原始内容)，按创建时间倒序——
// 完整数据只在真正点"恢复"时由backupRestore单独取。
exports.main = async () => {
  const auth = app.auth();
  const { customUserId: userId } = auth.getUserInfo();
  if (!userId) return { ok: false, error: "未登录，无法查看备份" };
  if (await isMergedSession(userId)) return { ok: false, code: "ACCOUNT_MERGED_RELOGIN_REQUIRED", error: "该账号已合并，请重新登录后继续使用" };

  const backups = db.collection("backups");
  const current = await backups
    .where({ userId })
    .orderBy("createdAt", "desc")
    .field({ createdAt: true, totalSizeBytes: true, debtsCount: true, filesCount: true })
    .get();
  const legacy = await backups
    .where({ openid: userId })
    .orderBy("createdAt", "desc")
    .field({ createdAt: true, totalSizeBytes: true, debtsCount: true, filesCount: true })
    .get();
  const seen = new Set();
  const records = [...(current.data || []), ...(legacy.data || [])]
    .filter((record) => record && !seen.has(record._id) && seen.add(record._id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const list = records.map((r) => ({
    id: r._id,
    createdAt: r.createdAt || 0,
    totalSizeBytes: r.totalSizeBytes || 0,
    debtsCount: r.debtsCount || 0,
    filesCount: r.filesCount || 0,
  }));

  return { ok: true, list };
};
