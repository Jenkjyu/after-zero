const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// 不信任客户端传来的任何openid参数——身份完全来自CloudBase已认证的调用上下文
// （客户端signInWithCustomTicket()登录后，customUserId就是wxLogin创建票据时传入的openid）。
exports.main = async () => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo();
  if (!customUserId) {
    return { ok: false, error: "未登录，无法注销" };
  }

  // 先清云备份(backups集合+Storage文件)，再删users文档——云备份的二进制文件真实存在
  // Storage里，注销不清理的话会留下孤儿文件，是隐私缺口，不是可选步骤。云备份现在是
  // "一个用户可以有多条备份记录"的模型（openid是普通字段，不是doc id），要查出这个
  // 用户名下的全部记录逐条清理，不是当年单doc模型那样doc(customUserId)一次搞定。
  const backups = db.collection("backups");
  const backupDocs = await backups.where({ openid: customUserId }).get();
  for (const record of backupDocs.data || []) {
    const fileIDs = (record.files || []).map((f) => f.fileID).filter(Boolean);
    if (fileIDs.length) {
      try {
        await app.deleteFile({ fileList: fileIDs });
      } catch (e) {
        // 单个文件删除失败不阻塞注销流程(比如文件已经不在了)
      }
    }
    await backups.doc(record._id).remove();
  }

  const users = db.collection("users");
  const existing = await users.where({ openid: customUserId }).get();
  if (existing.data.length) {
    await users.doc(existing.data[0]._id).remove();
  }
  return { ok: true };
};
