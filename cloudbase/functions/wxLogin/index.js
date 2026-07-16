const cloudbase = require("@cloudbase/node-sdk");
const https = require("https");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// AppID/AppSecret 从云函数环境变量读取，绝不写死在这份代码里、绝不进git。
const WX_APPID = process.env.WX_APPID;
const WX_APPSECRET = process.env.WX_APPSECRET;

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

exports.main = async (event) => {
  const code = event && event.code;
  if (!code) return { ok: false, error: "缺少code" };
  if (!WX_APPID || !WX_APPSECRET) {
    return { ok: false, error: "云函数未配置 WX_APPID / WX_APPSECRET 环境变量" };
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

  // 3. 按openid在users集合里upsert。
  const users = db.collection("users");
  const now = Date.now();
  const existing = await users.where({ openid }).get();
  if (existing.data.length) {
    await users.doc(existing.data[0]._id).update({ nickname, avatarUrl, lastLoginAt: now });
  } else {
    await users.add({ openid, unionid: unionid || "", nickname, avatarUrl, createdAt: now, lastLoginAt: now });
  }

  // 4. 签发CloudBase自定义登录票据。
  // TODO：这里的票据签发方式(app.auth().createTicket(...))部署前要对照CloudBase当前"自定义登录"文档核实——
  // node-sdk在v1/v2之间对这块API有过调整，不要假设这个方法名/参数形状就是最新的。
  const ticket = await app.auth().createTicket(openid, { refresh: 60 * 60 * 24 * 30 });

  return { ok: true, ticket, openid, nickname, avatarUrl };
};
