const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cloudbase = require("@cloudbase/node-sdk");
const { Environment, SignedDataVerifier } = require("@apple/app-store-server-library");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const BUNDLE_ID = "io.github.jenkjyu.afterzero";
const PRODUCT_ID = "io.github.jenkjyu.afterzero.premium";
const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const OFFLINE_MS = 3 * 24 * 60 * 60 * 1000;

function firstDocument(result) {
  if (!result || result.data == null) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

function requiredUserId() {
  const { customUserId } = app.auth().getUserInfo();
  if (!customUserId) {
    const error = new Error("请先登录");
    error.code = "LOGIN_REQUIRED";
    throw error;
  }
  return customUserId;
}

function rootCertificates() {
  const certDir = path.join(__dirname, "certs");
  return ["AppleRootCA-G2.cer", "AppleRootCA-G3.cer", "AppleComputerRootCertificate.cer"]
    .map((name) => fs.readFileSync(path.join(certDir, name)));
}

function trialAccess(entitlement, now) {
  if (entitlement.kind === "paid") return { active: true, state: entitlement.source === "redeem" ? "redeemed" : "paid", expiresAt: null };
  const expiresAt = Number(entitlement.trialEndsAt) || 0;
  return { active: expiresAt > now, state: expiresAt > now ? "trial" : "expired", expiresAt };
}

function publicAccess(entitlement, now) {
  const access = trialAccess(entitlement, now);
  return {
    ...access,
    appAccountToken: entitlement.appAccountTokens && entitlement.appAccountTokens[0],
    checkedAt: now,
    offlineUntil: now + OFFLINE_MS,
  };
}

async function getUser(userId) {
  return firstDocument(await db.collection("users").where({ userId }).limit(1).get());
}

// 首次服务端读取才授予体验期。login 函数会把删除后不可再次赠送的账号标为
// trialEligible:false；缺省值只兼容这次迁移前已经存在的账号。
async function ensureEntitlement(userId, now) {
  const user = await getUser(userId);
  const result = await db.runTransaction(async (transaction) => {
    const ref = transaction.collection("premiumEntitlements").doc(userId);
    const existing = firstDocument(await ref.get());
    if (existing) return existing;

    const preserved = user && user.preservedPremiumEntitlement;
    const eligible = !preserved && (!user || user.trialEligible !== false);
    const entitlement = {
      userId,
      kind: preserved && preserved.kind === "paid" ? "paid" : (eligible ? "trial" : "expired"),
      trialStartedAt: eligible ? now : null,
      trialEndsAt: eligible ? now + TRIAL_MS : null,
      // 一个账号可能在 Apple/微信账户绑定时合并；保留原 token 才能继续核验
      // 合并前发起的 Apple 购买，同时第一个 token 始终用于以后新的购买。
      appAccountTokens: [crypto.randomUUID()],
      createdAt: now,
      updatedAt: now,
    };
    if (preserved && preserved.kind === "paid") {
      entitlement.source = preserved.source || "appStore";
      entitlement.transactionId = preserved.transactionId || null;
      entitlement.originalTransactionId = preserved.originalTransactionId || null;
      entitlement.purchasedAt = preserved.purchasedAt || null;
      entitlement.appAccountTokens = Array.isArray(preserved.appAccountTokens) && preserved.appAccountTokens.length
        ? preserved.appAccountTokens : entitlement.appAccountTokens;
    }
    await ref.set(entitlement);
    return entitlement;
  });
  return result && result.result ? result.result : result;
}

function verifierFor(payload) {
  const environment = payload && payload.environment === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
  const appAppleId = environment === Environment.PRODUCTION ? Number(process.env.APPLE_APP_STORE_ID) : undefined;
  if (environment === Environment.PRODUCTION && !Number.isFinite(appAppleId)) {
    const error = new Error("服务端尚未配置 App Store 应用 ID");
    error.code = "STOREKIT_SERVER_CONFIG_INVALID";
    throw error;
  }
  return new SignedDataVerifier(rootCertificates(), true, environment, BUNDLE_ID, appAppleId);
}

function decodePayload(jws) {
  const part = String(jws || "").split(".")[1];
  if (!part) throw new Error("Apple 交易格式无效");
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
}

async function verifyTransaction(userId, jws, now) {
  if (typeof jws !== "string" || jws.length < 32) {
    const error = new Error("缺少 Apple 交易凭证");
    error.code = "STOREKIT_TRANSACTION_REQUIRED";
    throw error;
  }
  const entitlement = await ensureEntitlement(userId, now);
  const decoded = await verifierFor(decodePayload(jws)).verifyAndDecodeTransaction(jws);
  if (decoded.bundleId !== BUNDLE_ID || decoded.productId !== PRODUCT_ID) {
    const error = new Error("该交易不属于 After Zero 买断权益");
    error.code = "STOREKIT_PRODUCT_MISMATCH";
    throw error;
  }
  if (decoded.revocationDate) {
    const error = new Error("该购买已退款或被撤销");
    error.code = "STOREKIT_REVOKED";
    throw error;
  }
  const transactionToken = decoded.appAccountToken && String(decoded.appAccountToken);
  if (!transactionToken || !(entitlement.appAccountTokens || []).includes(transactionToken)) {
    const error = new Error("该购买不属于当前 After Zero 账号");
    error.code = "STOREKIT_ACCOUNT_MISMATCH";
    throw error;
  }
  const transactionId = String(decoded.transactionId);
  const result = await db.runTransaction(async (transaction) => {
    const transactionRef = transaction.collection("premiumTransactions").doc(transactionId);
    const claimed = firstDocument(await transactionRef.get());
    if (claimed && claimed.userId && claimed.userId !== userId && !(entitlement.appAccountTokens || []).includes(claimed.appAccountToken)) {
      const error = new Error("该 Apple 购买已绑定到其他 After Zero 账号");
      error.code = "STOREKIT_TRANSACTION_ALREADY_CLAIMED";
      throw error;
    }
    await transactionRef.set({
      transactionId,
      originalTransactionId: String(decoded.originalTransactionId || decoded.transactionId),
      userId,
      productId: decoded.productId,
      environment: decoded.environment,
      purchaseDate: decoded.purchaseDate || now,
      appAccountToken: transactionToken,
      source: "appStore",
      verifiedAt: now,
    });
    const next = {
      ...entitlement,
      kind: "paid",
      source: "appStore",
      transactionId,
      originalTransactionId: String(decoded.originalTransactionId || decoded.transactionId),
      purchasedAt: decoded.purchaseDate || now,
      updatedAt: now,
    };
    await transaction.collection("premiumEntitlements").doc(userId).set(next);
    return next;
  });
  return result && result.result ? result.result : result;
}

async function redeemCode(userId, code, now) {
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!normalized) {
    const error = new Error("请输入兑换码");
    error.code = "REDEEM_CODE_REQUIRED";
    throw error;
  }
  const codeHash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
  const entitlement = await ensureEntitlement(userId, now);
  const result = await db.runTransaction(async (transaction) => {
    const codeRef = transaction.collection("premiumRedeemCodes").doc(codeHash);
    const codeDoc = firstDocument(await codeRef.get());
    if (!codeDoc || codeDoc.status !== "active") {
      const error = new Error("兑换码无效或已被使用");
      error.code = "REDEEM_CODE_INVALID";
      throw error;
    }
    await codeRef.update({ status: "redeemed", redeemedBy: userId, redeemedAt: now });
    const next = { ...entitlement, kind: "paid", source: "redeem", redeemedAt: now, updatedAt: now };
    await transaction.collection("premiumEntitlements").doc(userId).set(next);
    return next;
  });
  return result && result.result ? result.result : result;
}

exports.main = async (event) => {
  try {
    const userId = requiredUserId();
    const now = Date.now();
    const action = event && event.action || "status";
    let entitlement;
    if (action === "verifyTransaction") entitlement = await verifyTransaction(userId, event && event.jws, now);
    else if (action === "redeem") entitlement = await redeemCode(userId, event && event.code, now);
    else if (action === "status") entitlement = await ensureEntitlement(userId, now);
    else return { ok: false, code: "ACTION_INVALID", error: "未知权益操作" };
    return { ok: true, entitlement: publicAccess(entitlement, now) };
  } catch (error) {
    console.error("[premiumEntitlement] failed:", error && error.code, error && error.message);
    return { ok: false, code: error && error.code || "PREMIUM_ENTITLEMENT_FAILED", error: error && error.message || "权益校验失败" };
  }
};
