const OFFLINE_MS = 3 * 24 * 60 * 60 * 1000;

function trialAccess(entitlement, now, platform) {
  if (platform === "android" && entitlement.androidActivation) return { active: true, state: "paid", expiresAt: null };
  if (entitlement.kind === "paid" && entitlement.source === "appStore") return { active: true, state: "paid", expiresAt: null };
  const expiresAt = Number(entitlement.trialEndsAt) || 0;
  return { active: expiresAt > now, state: expiresAt > now ? "trial" : "expired", expiresAt };
}

function publicAccess(entitlement, now, platform) {
  return {
    ...trialAccess(entitlement, now, platform),
    appAccountToken: entitlement.appAccountTokens && entitlement.appAccountTokens[0],
    checkedAt: now,
    offlineUntil: now + OFFLINE_MS,
  };
}

module.exports = { publicAccess, trialAccess };
