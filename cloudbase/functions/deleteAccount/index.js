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
  const users = db.collection("users");
  const existing = await users.where({ openid: customUserId }).get();
  if (existing.data.length) {
    await users.doc(existing.data[0]._id).remove();
  }
  return { ok: true };
};
