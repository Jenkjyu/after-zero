const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// 只返回列表要展示的轻量字段(不含debts/docs/premium原始内容)，按创建时间倒序——
// 完整数据只在真正点"恢复"时由backupRestore单独取。
exports.main = async () => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo();
  if (!customUserId) return { ok: false, error: "未登录，无法查看备份" };

  const backups = db.collection("backups");
  const result = await backups
    .where({ openid: customUserId })
    .orderBy("createdAt", "desc")
    .field({ createdAt: true, totalSizeBytes: true, debtsCount: true, filesCount: true })
    .get();

  const list = (result.data || []).map((r) => ({
    id: r._id,
    createdAt: r.createdAt || 0,
    totalSizeBytes: r.totalSizeBytes || 0,
    debtsCount: r.debtsCount || 0,
    filesCount: r.filesCount || 0,
  }));

  return { ok: true, list };
};
