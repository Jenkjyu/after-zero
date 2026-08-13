const { sha256Hex } = require("./verifyAppleToken");

function documentExists(result) {
  if (!result || result.data == null) return false;
  return Array.isArray(result.data) ? result.data.length > 0 : true;
}

async function consumeNonceOnce(db, claims, rawNonce, userId, now) {
  const nonceHash = sha256Hex(rawNonce);
  const replayId = sha256Hex(`${claims.sub}:${nonceHash}`);
  await db.runTransaction(async (transaction) => {
    const ref = transaction.collection("appleLoginNonces").doc(replayId);
    const existing = await ref.get();
    if (documentExists(existing)) {
      const error = new Error("Apple 身份令牌已使用，请重新登录");
      error.code = "TOKEN_REPLAYED";
      throw error;
    }
    await ref.set({
      userId,
      appleSubHash: sha256Hex(claims.sub),
      nonceHash,
      createdAt: now,
      expiresAt: claims.exp * 1000,
    });
  });
}

module.exports = { consumeNonceOnce, documentExists };
