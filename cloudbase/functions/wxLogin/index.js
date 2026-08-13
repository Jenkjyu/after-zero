const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");
const https = require("https");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// AppID/AppSecret 从云函数环境变量读取，绝不写死在这份代码里、绝不进git。
const WX_APPID = process.env.WX_APPID;
const WX_APPSECRET = process.env.WX_APPSECRET;

// 自定义登录私钥：CloudBase控制台"身份认证/登录方式"里启用"自定义登录"后下载得到的JSON文件，
// 里面的三个字段分别存成三个环境变量——同样绝不写死在代码里、绝不进git。
// (没有存成单个JSON字符串的环境变量，是因为CloudBase部署时会把"看起来像JSON"的环境变量值
// 自动解析成对象，导致 Environment.Variables.0.Value 类型校验报错，拆开三个纯字符串就没有这个问题。)
// createTicket()必须用这把私钥初始化的app实例调用，否则会报权限错误。
function getAuthApp() {
  const privateKeyId = process.env.TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID;
  const privateKey = process.env.TCB_CUSTOM_LOGIN_PRIVATE_KEY;
  const envId = process.env.TCB_CUSTOM_LOGIN_ENV_ID;
  if (!privateKeyId || !privateKey || !envId) return null;
  return cloudbase.init({
    env: cloudbase.SYMBOL_CURRENT_ENV,
    credentials: { private_key_id: privateKeyId, private_key: privateKey.replace(/\\n/g, "\n"), env_id: envId },
  });
}

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function identityDocumentId(provider, providerUserId) {
  return crypto.createHash("sha256").update(`${provider}:${providerUserId}`, "utf8").digest("hex");
}

exports.main = async (event) => {
  const code = event && event.code;
  if (!code) return { ok: false, error: "缺少code" };
  if (!WX_APPID || !WX_APPSECRET) {
    return { ok: false, error: "云函数未配置 WX_APPID / WX_APPSECRET 环境变量" };
  }
  const authApp = getAuthApp();
  if (!authApp) {
    return { ok: false, error: "云函数未配置 TCB_CUSTOM_LOGIN_CREDENTIAL 环境变量" };
  }

  // 1. 用code换openid/access_token。
  // 微信的code是一次性、短时效的，换过一次就作废——客户端如果重试，必须让用户重新走一遍微信授权拿新code，不能重试同一个code。
  const tokenResp = await httpGetJSON(
    "https://api.weixin.qq.com/sns/oauth2/access_token" +
      `?appid=${WX_APPID}&secret=${WX_APPSECRET}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  );
  if (tokenResp.errcode) {
    return { ok: false, error: `微信授权失败(${tokenResp.errcode}): ${tokenResp.errmsg}` };
  }
  const { openid, access_token, unionid } = tokenResp;

  // 2. 拿昵称/头像（客户端login()请求时带的是snsapi_userinfo scope，才有权限调这个接口）。
  // 这一步失败不影响登录本身，静默降级成空昵称。
  let nickname = "";
  let avatarUrl = "";
  try {
    const userinfo = await httpGetJSON(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}`
    );
    if (!userinfo.errcode) {
      nickname = userinfo.nickname || "";
      avatarUrl = userinfo.headimgurl || "";
    }
  } catch (e) {
    // ignore
  }

  // 3. 惰性建立provider-neutral身份映射。兼容已有微信用户时，内部userId继续等于旧
  // openid，因此已有备份、AI用量和CloudBase会话归属都不需要搬迁；openid从此只作为
  // 微信provider identity保留，不再由新代码当作通用账号概念。
  const users = db.collection("users");
  const now = Date.now();
  const trialClaimId = identityDocumentId("wechat", openid);
  const trialClaimResult = await db.collection("premiumTrialClaims").doc(trialClaimId).get();
  const trialClaim = trialClaimResult && trialClaimResult.data || null;
  const existing = await users.where({ openid }).get();
  const legacyUserId = openid;
  let userId = legacyUserId;
  if (existing.data.length) {
    const existingUser = existing.data[0];
    // 合并后微信身份仍可重新授权，但必须换到主账号会话，不能继续签发已合并账号的票据。
    userId = existingUser.mergedInto || existingUser.userId || legacyUserId;
    if (!existingUser.mergedInto) {
      const oldProviders = Array.isArray(existingUser.providers) ? existingUser.providers : [];
      await users.doc(existingUser._id).update({
        userId,
        providers: oldProviders.includes("wechat") ? oldProviders : [...oldProviders, "wechat"],
        nickname,
        avatarUrl,
        lastLoginAt: now,
      });
    }
  } else {
    await users.add({
      userId: legacyUserId,
      providers: ["wechat"],
      openid,
      unionid: unionid || "",
      nickname,
      avatarUrl,
      trialEligible: !trialClaim,
      preservedPremiumEntitlement: trialClaim && trialClaim.preservedPremiumEntitlement || null,
      createdAt: now,
      lastLoginAt: now,
    });
  }
  await db.collection("identities").doc(identityDocumentId("wechat", openid)).set({
    provider: "wechat",
    providerUserId: openid,
    userId,
    createdAt: existing.data.length ? (existing.data[0].createdAt || now) : now,
    lastLoginAt: now,
  });
  if (!trialClaim) {
    await db.collection("premiumTrialClaims").doc(trialClaimId).set({ createdAt: now, updatedAt: now });
  }

  // `userId` 可能因账户合并而指向目标账号；返回目标账号资料并为它签发票据，
  // 不能把已合并的旧 users 文档当成仍可使用的独立会话。
  const activeUserResult = await users.where({ userId }).limit(1).get();
  const activeUser = activeUserResult.data && activeUserResult.data[0] || {};
  const providers = Array.isArray(activeUser.providers) && activeUser.providers.length
    ? activeUser.providers
    : ["wechat"];

  // 4. 签发CloudBase自定义登录票据。
  // createTicket只接受一个参数(自定义用户唯一标识)，不支持refresh/expire这类选项——
  // 已对照CloudBase当前"自定义登录"文档核实(docs.cloudbase.net/authentication-v2/method/custom-login)。
  const ticket = await authApp.auth().createTicket(userId);

  return {
    ok: true,
    ticket,
    userId,
    openid,
    account: {
      userId,
      provider: providers.length > 1 ? "unified" : providers[0],
      providers,
      openid: activeUser.openid || openid,
      nickname: activeUser.nickname || nickname,
      avatarUrl: activeUser.avatarUrl || avatarUrl,
      email: activeUser.email || "",
      loggedInAt: now,
    },
  };
};
