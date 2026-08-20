const MAX_BODY_BYTES = 256 * 1024;
const BUNDLE_ID = "io.github.jenkjyu.afterzero";
const PRODUCT_ID = "io.github.jenkjyu.afterzero.premium";

function notificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function firstDocument(result) {
  if (!result || result.data == null) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function parseRequest(event) {
  if (!event || String(event.httpMethod || "").toUpperCase() !== "POST") {
    throw notificationError("METHOD_NOT_ALLOWED", "仅接受 POST 通知");
  }
  let rawBody = event.body;
  if (typeof rawBody !== "string" || rawBody.length === 0) {
    throw notificationError("REQUEST_BODY_INVALID", "通知请求为空");
  }
  if (event.isBase64Encoded) {
    try {
      rawBody = Buffer.from(rawBody, "base64").toString("utf8");
    } catch {
      throw notificationError("REQUEST_BODY_INVALID", "通知请求编码无效");
    }
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    throw notificationError("REQUEST_BODY_TOO_LARGE", "通知请求过大");
  }
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw notificationError("REQUEST_BODY_INVALID", "通知请求不是 JSON");
  }
  if (!payload || typeof payload.signedPayload !== "string" || payload.signedPayload.length < 32) {
    throw notificationError("SIGNED_PAYLOAD_REQUIRED", "通知缺少签名载荷");
  }
  if (payload.signedPayload.length > MAX_BODY_BYTES) {
    throw notificationError("SIGNED_PAYLOAD_TOO_LARGE", "通知签名载荷过大");
  }
  return payload.signedPayload;
}

// 这里只为选择正确的 Apple 验签环境而读取未验签 JWS；随后仍必须完整验签。
function notificationEnvironment(signedPayload) {
  const parts = String(signedPayload).split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw notificationError("SIGNED_PAYLOAD_INVALID", "通知签名格式无效");
  }
  try {
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (value && value.environment === "Sandbox") return "Sandbox";
    if (value && value.environment === "Production") return "Production";
  } catch {
    // Fall through to one consistent public error without echoing untrusted content.
  }
  throw notificationError("NOTIFICATION_ENVIRONMENT_INVALID", "通知环境无效");
}

function notificationAction(notificationType) {
  if (notificationType === "REFUND" || notificationType === "REVOKE") return "revoke";
  if (notificationType === "REFUND_REVERSED") return "restore";
  if (notificationType === "TEST") return "test";
  return "ignore";
}

function transactionIdentity(transaction) {
  if (!transaction || transaction.bundleId !== BUNDLE_ID || transaction.productId !== PRODUCT_ID) {
    throw notificationError("NOTIFICATION_PRODUCT_MISMATCH", "通知不属于 After Zero Premium");
  }
  const transactionId = transaction.transactionId && String(transaction.transactionId);
  const originalTransactionId = transaction.originalTransactionId && String(transaction.originalTransactionId || transaction.transactionId);
  if (!transactionId || !originalTransactionId) {
    throw notificationError("NOTIFICATION_TRANSACTION_INVALID", "通知交易标识无效");
  }
  return { transactionId, originalTransactionId };
}

async function matchingEntitlements(db, transactionId, originalTransactionId) {
  const collection = db.collection("premiumEntitlements");
  const [byTransaction, byOriginal] = await Promise.all([
    collection.where({ transactionId }).get(),
    originalTransactionId === transactionId ? Promise.resolve({ data: [] }) : collection.where({ originalTransactionId }).get(),
  ]);
  const records = [...(byTransaction.data || []), ...(byOriginal.data || [])];
  return [...new Map(records.filter(Boolean).map((record) => [record._id || record.userId, record])).values()];
}

async function recordNotification(db, notification, transaction, action, now) {
  const notificationUUID = notification.notificationUUID && String(notification.notificationUUID);
  if (!notificationUUID || notificationUUID.length > 255) {
    throw notificationError("NOTIFICATION_UUID_INVALID", "通知标识无效");
  }
  const existing = firstDocument(await db.collection("premiumNotificationEvents").doc(notificationUUID).get());
  if (existing) return { duplicate: true, affectedUsers: 0 };

  const { transactionId, originalTransactionId } = transactionIdentity(transaction);
  const transactionRef = db.collection("premiumTransactions").doc(transactionId);
  const previousTransaction = firstDocument(await transactionRef.get());
  const entitlements = await matchingEntitlements(db, transactionId, originalTransactionId);
  const nowData = {
    transactionId,
    originalTransactionId,
    productId: transaction.productId,
    environment: transaction.environment || notification.environment || "",
    appAccountToken: transaction.appAccountToken ? String(transaction.appAccountToken) : "",
    lastNotificationType: notification.notificationType,
    lastNotificationUUID: notificationUUID,
    lastNotificationAt: now,
  };

  if (action === "revoke") {
    await transactionRef.set({
      ...previousTransaction,
      ...nowData,
      status: "revoked",
      revokedAt: now,
      revocationDate: transaction.revocationDate || now,
      revocationReason: transaction.revocationReason == null ? null : transaction.revocationReason,
    });
  } else {
    await transactionRef.set({
      ...previousTransaction,
      ...nowData,
      status: "active",
      revokedAt: null,
      revocationDate: null,
      revocationReason: null,
      refundReversedAt: now,
    });
  }

  for (const entitlement of entitlements) {
    if (entitlement.source !== "appStore") continue;
    const ref = db.collection("premiumEntitlements").doc(entitlement._id || entitlement.userId);
    if (action === "revoke") {
      await ref.set({
        ...entitlement,
        kind: "expired",
        revokedAt: now,
        revocationDate: transaction.revocationDate || now,
        revocationReason: transaction.revocationReason == null ? null : transaction.revocationReason,
        updatedAt: now,
      });
    } else {
      await ref.set({
        ...entitlement,
        kind: "paid",
        source: "appStore",
        revokedAt: null,
        revocationDate: null,
        revocationReason: null,
        refundReversedAt: now,
        updatedAt: now,
      });
    }
  }
  // 事件最后写入：中途失败时 Apple 的重试仍会继续处理，而重复处理本身是幂等的。
  await db.collection("premiumNotificationEvents").doc(notificationUUID).set({
    notificationUUID,
    notificationType: notification.notificationType,
    subtype: notification.subtype || "",
    environment: notification.environment || "",
    transactionId,
    originalTransactionId,
    action,
    receivedAt: now,
  });
  return { duplicate: false, affectedUsers: entitlements.filter((item) => item.source === "appStore").length };
}

async function handleVerifiedNotification(db, verifier, signedPayload, now = Date.now()) {
  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  const action = notificationAction(notification && notification.notificationType);
  if (action === "test" || action === "ignore") return { action, affectedUsers: 0 };
  const signedTransactionInfo = notification && notification.data && notification.data.signedTransactionInfo;
  if (typeof signedTransactionInfo !== "string" || signedTransactionInfo.length < 32) {
    throw notificationError("NOTIFICATION_TRANSACTION_REQUIRED", "通知缺少交易凭证");
  }
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
  return { action, ...(await recordNotification(db, notification, transaction, action, now)) };
}

async function handleHttpNotification(event, options) {
  try {
    const signedPayload = parseRequest(event);
    const environment = notificationEnvironment(signedPayload);
    const verifier = options.verifierFor(environment);
    const result = await handleVerifiedNotification(options.db, verifier, signedPayload, options.now ? options.now() : Date.now());
    return jsonResponse(200, { ok: true, action: result.action, duplicate: !!result.duplicate });
  } catch (error) {
    const code = error && error.code || "NOTIFICATION_REJECTED";
    console.error("[appStoreNotifications] rejected:", code);
    const statusCode = code === "METHOD_NOT_ALLOWED" ? 405 : 400;
    return jsonResponse(statusCode, { ok: false, code });
  }
}

module.exports = {
  BUNDLE_ID,
  PRODUCT_ID,
  handleHttpNotification,
  handleVerifiedNotification,
  notificationAction,
  notificationEnvironment,
  parseRequest,
  transactionIdentity,
};
