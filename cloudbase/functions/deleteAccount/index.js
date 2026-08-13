const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

async function isMergedSession(userId) {
  const result = await db.collection("users").where({ userId }).limit(1).get();
  const user = result.data && result.data[0];
  return Boolean(user && user.mergedInto);
}

// 不信任客户端传来的任何provider identity或userId参数——内部userId完全来自CloudBase
// 已认证调用上下文的customUserId。
exports.main = async () => {
  const auth = app.auth();
  const { customUserId: userId } = auth.getUserInfo();
  if (!userId) {
    return { ok: false, error: "未登录，无法注销" };
  }
  if (await isMergedSession(userId)) {
    return { ok: false, code: "ACCOUNT_MERGED_RELOGIN_REQUIRED", error: "该账号已合并，请重新登录后继续使用" };
  }

  // 先清云备份(backups集合+Storage文件)，再删users文档——云备份的二进制文件真实存在
  // Storage里，注销不清理的话会留下孤儿文件，是隐私缺口，不是可选步骤。云备份现在是
  // "一个用户可以有多条备份记录"的模型，要查出这个userId名下的新记录及旧微信
  // openid字段记录逐条清理，不是当年单doc模型那样doc(userId)一次搞定。
  const backups = db.collection("backups");
  const currentBackups = await backups.where({ userId }).get();
  const legacyBackups = await backups.where({ openid: userId }).get();
  const seenBackupIds = new Set();
  const backupDocs = [...(currentBackups.data || []), ...(legacyBackups.data || [])]
    .filter((record) => record && !seenBackupIds.has(record._id) && seenBackupIds.add(record._id));
  for (const record of backupDocs) {
    const fileIDs = (record.files || []).map((f) => f.fileID).filter(Boolean);
    if (fileIDs.length) {
      try {
        await app.deleteFile({ fileList: fileIDs });
      } catch (e) {
        // 单个文件删除失败不阻塞注销流程(比如文件已经不在了)
      }
    }
    await backups.doc(record._id).remove();
  }

  const users = db.collection("users");
  const currentUsers = await users.where({ userId }).get();
  const legacyUsers = await users.where({ openid: userId }).get();
  const seenUserIds = new Set();
  for (const user of [...(currentUsers.data || []), ...(legacyUsers.data || [])]) {
    if (user && !seenUserIds.has(user._id)) {
      seenUserIds.add(user._id);
      await users.doc(user._id).remove();
    }
  }

  const identities = db.collection("identities");
  const identityDocs = await identities.where({ userId }).get();
  // 账户资料、备份和登录映射仍会删除。为落实“不重复赠送体验”且允许用户日后主动恢复购买，
  // 仅保留哈希 identity 对应的最小权益记录，不包含昵称、邮箱、openid 或账本内容。
  const entitlementResult = await db.collection("premiumEntitlements").doc(userId).get();
  const entitlement = entitlementResult && entitlementResult.data || null;
  const preservedPremiumEntitlement = entitlement && entitlement.kind === "paid" ? {
    kind: "paid",
    source: entitlement.source || "appStore",
    transactionId: entitlement.transactionId || null,
    originalTransactionId: entitlement.originalTransactionId || null,
    purchasedAt: entitlement.purchasedAt || null,
    appAccountTokens: Array.isArray(entitlement.appAccountTokens) ? entitlement.appAccountTokens : [],
  } : null;
  for (const identity of identityDocs.data || []) {
    await db.collection("premiumTrialClaims").doc(identity._id).set({
      createdAt: identity.createdAt || Date.now(),
      updatedAt: Date.now(),
      ...(preservedPremiumEntitlement ? { preservedPremiumEntitlement } : {}),
    });
  }
  for (const identity of identityDocs.data || []) {
    await identities.doc(identity._id).remove();
  }
  if (entitlement) await db.collection("premiumEntitlements").doc(userId).remove();

  const appleLoginNonces = db.collection("appleLoginNonces");
  const nonceDocs = await appleLoginNonces.where({ userId }).get();
  for (const nonce of nonceDocs.data || []) {
    await appleLoginNonces.doc(nonce._id).remove();
  }
  return { ok: true };
};
