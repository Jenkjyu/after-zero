const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

async function isMergedSession(userId) {
  const result = await db.collection("users").where({ userId }).limit(1).get();
  const user = result.data && result.data[0];
  return Boolean(user && user.mergedInto);
}

// 同backupRestore：doc id本身不是私密凭证，必须显式核对provider-neutral userId
// （并兼容旧记录openid字段）归属后再允许删除。
exports.main = async (event) => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo();
  if (!customUserId) return { ok: false, error: "未登录，无法删除备份" };
  if (await isMergedSession(customUserId)) return { ok: false, code: "ACCOUNT_MERGED_RELOGIN_REQUIRED", error: "该账号已合并，请重新登录后继续使用" };

  const { backupId } = event;
  if (!backupId) return { ok: false, error: "缺少backupId" };

  const backups = db.collection("backups");
  const result = await backups.doc(backupId).get();
  if (!result.data || !result.data.length) return { ok: true }; // 已经不存在，视为删除成功
  const record = result.data[0];
  if ((record.userId || record.openid) !== customUserId) return { ok: false, error: "无权删除该备份" };

  const fileIDs = (record.files || []).map((f) => f.fileID).filter(Boolean);
  if (fileIDs.length) {
    try {
      await app.deleteFile({ fileList: fileIDs });
    } catch (e) {
      // 文件可能已经不在了，忽略
    }
  }
  await backups.doc(backupId).remove();
  return { ok: true };
};
