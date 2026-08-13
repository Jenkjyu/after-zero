const { sha256Hex } = require("./verifyAppleToken");

function documentExists(result) {
  if (!result || result.data == null) return false;
  return Array.isArray(result.data) ? result.data.length > 0 : true;
}

async function claimNonceForTicket(db, claims, rawNonce, userId, now) {
  const nonceHash = sha256Hex(rawNonce);
  const replayId = sha256Hex(`${claims.sub}:${nonceHash}`);
  return db.runTransaction(async (transaction) => {
    const ref = transaction.collection("appleLoginNonces").doc(replayId);
    const existing = await ref.get();
    if (documentExists(existing)) {
      const record = Array.isArray(existing.data) ? existing.data[0] : existing.data;
      // 同一份仍有效、已验签的 Apple 凭证只允许为原内部账户补发票据。
      // 这处理“nonce 已落库但 createTicket/网络回传失败”的交付中断，既不会把
      // 凭证转给其他用户，也不会重新创建账户或重置试用资格。
      if (record && record.userId === userId && now < record.expiresAt) {
        return { retry: true };
      }
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
    return { retry: false };
  });
}

module.exports = { claimNonceForTicket, documentExists };
