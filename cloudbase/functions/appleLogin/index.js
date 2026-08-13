const cloudbase = require("@cloudbase/node-sdk");
const { sha256Hex, verifyAppleIdentityToken } = require("./verifyAppleToken");
const { claimNonceForTicket } = require("./replayGuard");
const { isValidCustomUserId, newAppleUserId, migratedAppleUserId } = require("./userId");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;

function getAuthApp() {
  const privateKeyId = process.env.TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID;
  const privateKey = process.env.TCB_CUSTOM_LOGIN_PRIVATE_KEY;
  const envId = process.env.TCB_CUSTOM_LOGIN_ENV_ID;
  if (!privateKeyId || !privateKey || !envId) return null;
  return cloudbase.init({
    env: cloudbase.SYMBOL_CURRENT_ENV,
    credentials: {
      private_key_id: privateKeyId,
      private_key: privateKey.replace(/\\n/g, "\n"),
      env_id: envId,
    },
  });
}

function cleanDisplayName(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80)
    : "";
}

function firstDocument(result) {
  if (!result || result.data == null) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

async function resolveAppleAccount(claims, displayName, now) {
  const identityId = sha256Hex(`apple:${claims.sub}`);
  const transactionResult = await db.runTransaction(async (transaction) => {
    const identityRef = transaction.collection("identities").doc(identityId);
    // 文档 id 是不可逆哈希；账户删除后只靠它阻止重复体验或恢复已购权益。
    const trialClaimRef = transaction.collection("premiumTrialClaims").doc(identityId);
    const existingIdentity = firstDocument(await identityRef.get());
    if (existingIdentity && existingIdentity.userId) {
      // 合并事务会把来源账号的 identity 映射迁到目标账号；因此这里始终以映射为准，
      // 不会给已合并的来源 userId 签发新票据。
      if (isValidCustomUserId(existingIdentity.userId)) {
        return { userId: existingIdentity.userId, created: false };
      }

      // A pre-release build created 34-character `u_` Apple IDs, which
      // CloudBase refuses when issuing a custom-login ticket. Migrate that
      // provider mapping deterministically so retries resolve to one account.
      const legacyUserId = existingIdentity.userId;
      const userId = migratedAppleUserId(claims.sub);
      const legacyUser = firstDocument(await transaction.collection("users").doc(legacyUserId).get());
      if (legacyUser) await transaction.collection("users").doc(legacyUserId).update({ userId });
      await identityRef.update({ userId, migratedFrom: legacyUserId, migratedAt: now });
      return { userId, created: false };
    }

    const claim = firstDocument(await trialClaimRef.get());
    const userId = newAppleUserId();
    await transaction.collection("users").doc(userId).set({
      userId,
      providers: ["apple"],
      nickname: displayName,
      email: typeof claims.email === "string" ? claims.email : "",
      avatarUrl: "",
      trialEligible: !claim,
      preservedPremiumEntitlement: claim && claim.preservedPremiumEntitlement || null,
      createdAt: now,
      lastLoginAt: now,
    });
    await identityRef.set({
      provider: "apple",
      providerUserId: claims.sub,
      userId,
      createdAt: now,
      lastLoginAt: now,
    });
    if (!claim) await trialClaimRef.set({ createdAt: now, updatedAt: now });
    return { userId, created: true };
  });
  return transactionResult && transactionResult.result
    ? transactionResult.result
    : transactionResult;
}

exports.main = async (event) => {
  const startedAt = Date.now();
  let stage = "verify-token";
  try {
    const identityToken = event && event.identityToken;
    const rawNonce = event && event.rawNonce;
    const authApp = getAuthApp();
    if (!authApp) {
      return { ok: false, code: "SERVER_CONFIG_INVALID", error: "Apple 登录服务未配置自定义登录凭据" };
    }

    const claims = await verifyAppleIdentityToken(identityToken, rawNonce, APPLE_CLIENT_ID);
    const now = Date.now();
    const requestedName = cleanDisplayName(event && event.fullName);
    stage = "resolve-account";
    const accountResolution = await resolveAppleAccount(claims, requestedName, now);
    const userId = accountResolution && accountResolution.userId;
    if (!userId) throw new Error("无法建立内部账户");
    stage = "claim-nonce";
    const nonceClaim = await claimNonceForTicket(db, claims, rawNonce, userId, now);

    stage = "update-account";
    const users = db.collection("users");
    const userResult = await users.where({ userId }).limit(1).get();
    const user = firstDocument(userResult) || {};
    const nickname = user.nickname || requestedName || "Apple 用户";
    const email = typeof claims.email === "string" ? claims.email : (user.email || "");
    await users.doc(user._id || userId).update({
      userId,
      providers: Array.isArray(user.providers) && user.providers.includes("apple")
        ? user.providers
        : [...(Array.isArray(user.providers) ? user.providers : []), "apple"],
      nickname,
      email,
      lastLoginAt: now,
    });
    await db.collection("identities").doc(sha256Hex(`apple:${claims.sub}`)).update({ lastLoginAt: now });

    stage = "create-ticket";
    const ticket = await authApp.auth().createTicket(userId);
    console.info("[appleLogin] success", {
      ms: Date.now() - startedAt,
      retriedTicketDelivery: !!(nonceClaim && nonceClaim.retry),
    });
    return {
      ok: true,
      ticket,
      account: {
        userId,
        provider: "apple",
        providers: ["apple"],
        nickname,
        avatarUrl: "",
        email,
        loggedInAt: now,
      },
    };
  } catch (error) {
    console.error("[appleLogin] failed:", stage, error && error.code, error && error.message);
    return {
      ok: false,
      code: (error && error.code) || "APPLE_LOGIN_FAILED",
      error: (error && error.message) || "Apple 登录失败",
    };
  }
};
