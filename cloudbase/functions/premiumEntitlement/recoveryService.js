function firstDocument(result) {
  if (!result || result.data == null) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

// CloudBase 查询结果会附带只读的 _id；把文档写回既定 doc id 前必须剥离，
// 否则 set() 会以“不能更新 _id 的值”拒绝整笔事务。
function withoutDocumentId(document) {
  if (!document || typeof document !== "object") return {};
  const { _id, ...writable } = document;
  return writable;
}

// 账户已注销时，优先用重新登录后同一 provider identity 的最小保留凭据恢复。
// 旧版 deleteAccount 曾未保留该凭据：只在 Apple 已验签、用户主动选择恢复购买，且
// 原 After Zero 账号与权益文档均已删除时，才允许从原交易记录补救归属。
async function deletedPurchaseClaimForUser(db, userId, appAccountToken, currentUser) {
  const identities = await db.collection("identities").where({ userId }).get();
  for (const identity of identities.data || []) {
    const claim = firstDocument(await db.collection("premiumTrialClaims").doc(identity._id).get());
    const preserved = claim && claim.preservedPremiumEntitlement;
    if (preserved && preserved.kind === "paid" && (preserved.appAccountTokens || []).includes(appAccountToken)) {
      return { source: "preserved-identity" };
    }
  }

  const priorTransaction = firstDocument(await db.collection("premiumTransactions").where({ appAccountToken }).get());
  // 历史部署故障可能导致交易已经由 Apple 验签、但服务端从未成功写入交易账本。
  // 只能由同一登录身份注销后重建的账号补建：appleLogin/wxLogin 会将这种账号
  // 标为 trialEligible:false。调用方另已限定“恢复购买”并会先完整验证 Apple JWS。
  if (!priorTransaction) {
    if (!currentUser || currentUser.trialEligible !== false) return null;
    return { source: "orphaned-verified-transaction" };
  }
  if (priorTransaction.status === "revoked" || !priorTransaction.userId || priorTransaction.userId === userId) {
    return null;
  }

  const [oldUser, oldEntitlement] = await Promise.all([
    db.collection("users").where({ userId: priorTransaction.userId }).limit(1).get(),
    db.collection("premiumEntitlements").doc(priorTransaction.userId).get(),
  ]);
  if (firstDocument(oldUser) || firstDocument(oldEntitlement)) return null;
  return { source: "deleted-transaction" };
}

module.exports = { deletedPurchaseClaimForUser, firstDocument, withoutDocumentId };
