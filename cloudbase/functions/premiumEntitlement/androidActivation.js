const crypto = require("crypto");
const { firstDocument, withoutDocumentId } = require("./recoveryService");

// 临时、一次性测试码。仅部署在服务端，不会进入 APK；正式分发前由后续发码方案替换。
const TEST_CODE = "0000";
const TEST_CODE_ID = "android-test-" + crypto.createHash("sha256").update(TEST_CODE).digest("hex");
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

function activationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function activateAndroidCode(db, userId, code, now) {
  const submitted = String(code || "").trim();
  const claimantHash = crypto.createHash("sha256").update(userId).digest("hex");
  if (!submitted || submitted.length > 64) throw activationError("ACTIVATION_CODE_INVALID", "激活码无效");
  const result = await db.runTransaction(async (transaction) => {
    const entitlementRef = transaction.collection("premiumEntitlements").doc(userId);
    const current = firstDocument(await entitlementRef.get());
    if (!current) throw activationError("PREMIUM_ENTITLEMENT_MISSING", "账户权益尚未就绪，请重新登录");
    const windowStart = Number(current.androidActivationFailureWindow) || 0;
    const withinWindow = now - windowStart < FAILURE_WINDOW_MS;
    const failures = withinWindow ? Number(current.androidActivationFailures) || 0 : 0;
    if (failures >= MAX_FAILURES) return { error: activationError("ACTIVATION_RATE_LIMITED", "尝试次数过多，请 24 小时后再试") };
    if (submitted !== TEST_CODE) {
      await entitlementRef.set({
        ...withoutDocumentId(current),
        androidActivationFailures: failures + 1,
        androidActivationFailureWindow: withinWindow ? windowStart : now,
      });
      return { error: activationError("ACTIVATION_CODE_INVALID", "激活码无效") };
    }
    if (current.androidActivation) return { entitlement: current };
    const codeRef = transaction.collection("premiumRedeemCodes").doc(TEST_CODE_ID);
    const claimed = firstDocument(await codeRef.get());
    if (claimed && claimed.claimedByHash !== claimantHash) {
      return { error: activationError("ACTIVATION_CODE_USED", "这个测试码已被其他账号使用") };
    }
    if (!claimed) await codeRef.set({ kind: "android-test", claimedByHash: claimantHash, claimedAt: now });
    const next = {
      ...withoutDocumentId(current),
      androidActivation: { codeId: TEST_CODE_ID, activatedAt: now },
      androidActivationFailures: 0,
      androidActivationFailureWindow: null,
      updatedAt: now,
    };
    await entitlementRef.set(next);
    return { entitlement: next };
  });
  const outcome = result && result.result ? result.result : result;
  if (outcome.error) throw outcome.error;
  return outcome.entitlement;
}

module.exports = { activateAndroidCode };
