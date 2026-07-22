const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// 同backupRestore：doc id本身不是私密凭证，必须显式核对record.openid归属再允许删除。
exports.main = async (event) => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo();
  if (!customUserId) return { ok: false, error: "未登录，无法删除备份" };

  const { backupId } = event;
  if (!backupId) return { ok: false, error: "缺少backupId" };

  const backups = db.collection("backups");
  const result = await backups.doc(backupId).get();
  if (!result.data || !result.data.length) return { ok: true }; // 已经不存在，视为删除成功
  const record = result.data[0];
  if (record.openid !== customUserId) return { ok: false, error: "无权删除该备份" };

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
