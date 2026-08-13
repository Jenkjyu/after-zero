const cloudbase = require("@cloudbase/node-sdk");
const https = require("https");
const { verifyAppleIdentityToken } = require("./verifyAppleToken");
const { assertCurrentIdentity, bindIdentity, confirmMerge } = require("./bindingService");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;
const WX_APPID = process.env.WX_APPID;
const WX_APPSECRET = process.env.WX_APPSECRET;

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

async function verifyWeChatCode(code) {
  if (!code || !WX_APPID || !WX_APPSECRET) throw new Error("微信绑定服务未配置或授权码缺失");
  const response = await httpGetJSON(
    "https://api.weixin.qq.com/sns/oauth2/access_token" +
    `?appid=${WX_APPID}&secret=${WX_APPSECRET}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  );
  if (response.errcode || !response.openid) throw new Error(`微信授权失败(${response.errcode || "unknown"}): ${response.errmsg || "未返回 openid"}`);
  return response.openid;
}

async function verifyCredential(credential) {
  const provider = credential && credential.provider;
  if (provider === "apple") {
    const claims = await verifyAppleIdentityToken(credential.identityToken, credential.rawNonce, APPLE_CLIENT_ID);
    return { provider, providerUserId: claims.sub };
  }
  if (provider === "wechat") {
    return { provider, providerUserId: await verifyWeChatCode(credential.code) };
  }
  const error = new Error("不支持的登录方式");
  error.code = "PROVIDER_INVALID";
  throw error;
}

exports.main = async (event) => {
  try {
    const { customUserId: currentUserId } = app.auth().getUserInfo() || {};
    if (!currentUserId) return { ok: false, code: "LOGIN_REQUIRED", error: "请先登录当前云账号再绑定" };
    const now = Date.now();
    if (event && event.action === "confirmMerge") {
      return await confirmMerge(db, { currentUserId, mergeIntent: event.mergeIntent, now });
    }
    // 绑定必须同时证明：当前云账号所属的已绑定登录方式、以及待绑定的另一登录方式。
    // 仅持有旧 custom ticket 不足以执行绑定，避免遗失设备上的旧会话劫持账户。
    const current = await verifyCredential(event && event.current);
    const target = await verifyCredential(event && event.target);
    if (current.provider === target.provider && current.providerUserId === target.providerUserId) {
      return { ok: false, code: "IDENTITY_ALREADY_CURRENT", error: "该登录方式已经属于当前账号" };
    }
    await assertCurrentIdentity(db, currentUserId, current.provider, current.providerUserId);
    return await bindIdentity(db, {
      currentUserId,
      provider: target.provider,
      providerUserId: target.providerUserId,
      now,
    });
  } catch (error) {
    return {
      ok: false,
      code: error && error.code || "ACCOUNT_BIND_FAILED",
      error: error && error.message || "绑定登录方式失败",
    };
  }
};
