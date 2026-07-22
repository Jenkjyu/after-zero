const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });

// 纯Storage上传代理，不碰数据库——这份文件属于哪条备份记录，由客户端在文件全部上传
// 成功后，把这里返回的{fileID,size}连同其它文件一起传给backupCreate一次性写入DB，
// 这个函数本身不需要知道/维护"这条备份记录目前有哪些文件"这件事。
exports.main = async (event) => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo();
  if (!customUserId) return { ok: false, error: "未登录，无法上传" };

  const { backupId, fileId, filename, mime, base64 } = event;
  if (!backupId || !fileId || !filename || !base64) return { ok: false, error: "缺少文件参数" };

  const buffer = Buffer.from(base64, "base64");
  const cloudPath = `backups/${customUserId}/${backupId}/${fileId}-${encodeURIComponent(filename)}`;
  const uploadResult = await app.uploadFile({ cloudPath, fileContent: buffer });
  return { ok: true, fileID: uploadResult.fileID, size: buffer.length };
};
