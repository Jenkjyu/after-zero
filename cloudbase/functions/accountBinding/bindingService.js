const crypto = require("crypto");

const AI_MONTHLY_LIMIT = 50;
const BINDING_INTENT_TTL_MS = 10 * 60 * 1000;

function identityDocumentId(provider, providerUserId) {
  return crypto.createHash("sha256").update(`${provider}:${providerUserId}`, "utf8").digest("hex");
}

function mergeDocumentId(firstUserId, secondUserId) {
  return crypto.createHash("sha256")
    .update([firstUserId, secondUserId].sort().join(":"), "utf8")
    .digest("hex");
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value))];
}

function mergedProviders(...users) {
  return uniqueStrings(users.flatMap((user) => Array.isArray(user && user.providers) ? user.providers : []));
}

function mergedUsageCount(firstCount, secondCount) {
  return Math.min(AI_MONTHLY_LIMIT, Math.max(0, Number(firstCount) || 0) + Math.max(0, Number(secondCount) || 0));
}

function normalizeAccount(user, userId) {
  const providers = uniqueStrings(user && user.providers);
  const provider = providers.length > 1 ? "unified" : providers[0] || "wechat";
  return {
    userId,
    provider,
    providers,
    openid: user && user.openid || "",
    nickname: user && user.nickname || "",
    avatarUrl: user && user.avatarUrl || "",
    email: user && user.email || "",
    loggedInAt: Date.now(),
  };
}

function firstDocument(result) {
  if (!result || result.data == null) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

async function getUserByUserId(db, userId) {
  const result = await db.collection("users").where({ userId }).limit(1).get();
  return firstDocument(result);
}

async function assertCurrentIdentity(db, currentUserId, provider, providerUserId) {
  const identityId = identityDocumentId(provider, providerUserId);
  const identity = firstDocument(await db.collection("identities").doc(identityId).get());
  if (!identity || identity.userId !== currentUserId) {
    const error = new Error("当前登录方式与正在使用的云账号不一致，请重新登录后再试");
    error.code = "CURRENT_REAUTH_MISMATCH";
    throw error;
  }
  return identity;
}

async function createBindingIntent(db, currentUserId, otherUserId, provider, providerUserId, now) {
  const intent = crypto.randomBytes(32).toString("base64url");
  await db.collection("accountBindingIntents").doc(intent).set({
    currentUserId,
    otherUserId,
    provider,
    providerUserId,
    createdAt: now,
    expiresAt: now + BINDING_INTENT_TTL_MS,
  });
  return intent;
}

async function bindIdentity(db, input) {
  const { currentUserId, provider, providerUserId, now } = input;
  const identityId = identityDocumentId(provider, providerUserId);
  const currentUser = await getUserByUserId(db, currentUserId);
  if (!currentUser || currentUser.mergedInto) {
    const error = new Error("当前账号已失效，请重新登录后再绑定");
    error.code = "CURRENT_ACCOUNT_INVALID";
    throw error;
  }
  const existingIdentity = firstDocument(await db.collection("identities").doc(identityId).get());
  if (existingIdentity && existingIdentity.userId && existingIdentity.userId !== currentUserId) {
    return {
      ok: false,
      code: "ACCOUNT_CONFLICT",
      mergeIntent: await createBindingIntent(db, currentUserId, existingIdentity.userId, provider, providerUserId, now),
      error: "该登录方式已属于另一个云账号。确认后会合并双方云备份和 AI 用量；本机账本不会变化。",
    };
  }

  const result = await db.runTransaction(async (transaction) => {
    const userRef = transaction.collection("users").doc(currentUser._id);
    const freshUser = firstDocument(await userRef.get());
    if (!freshUser || freshUser.mergedInto) throw Object.assign(new Error("当前账号已失效，请重新登录"), { code: "CURRENT_ACCOUNT_INVALID" });
    const identityRef = transaction.collection("identities").doc(identityId);
    const freshIdentity = firstDocument(await identityRef.get());
    if (freshIdentity && freshIdentity.userId && freshIdentity.userId !== currentUserId) {
      throw Object.assign(new Error("该登录方式已属于另一个账号，请重新授权后确认合并"), { code: "ACCOUNT_CONFLICT_RACE" });
    }
    const providers = uniqueStrings([...(freshUser.providers || []), provider]);
    await userRef.update({ providers, lastLoginAt: now });
    await identityRef.set({
      provider,
      providerUserId,
      userId: currentUserId,
      createdAt: freshIdentity && freshIdentity.createdAt || now,
      lastLoginAt: now,
    });
    return { ...freshUser, providers, lastLoginAt: now };
  });
  const user = result && result.result ? result.result : result;
  return { ok: true, merged: false, account: normalizeAccount(user, currentUserId) };
}

async function readOwnedRecords(collection, field, userId) {
  const primary = await collection.where({ [field]: userId }).get();
  return primary && primary.data || [];
}

async function mergeAccounts(db, input) {
  const { currentUserId: targetUserId, otherUserId: sourceUserId, provider, now } = input;
  if (!targetUserId || !sourceUserId || targetUserId === sourceUserId) {
    const user = await getUserByUserId(db, targetUserId);
    return { account: normalizeAccount(user, targetUserId), merged: false };
  }

  const users = db.collection("users");
  const backups = db.collection("backups");
  const identities = db.collection("identities");
  const usages = db.collection("aiUsage");
  const entitlements = db.collection("premiumEntitlements");
  const targetUser = await getUserByUserId(db, targetUserId);
  const sourceUser = await getUserByUserId(db, sourceUserId);
  if (!targetUser || !sourceUser) throw new Error("待合并账号不存在，请重新发起绑定");
  if (sourceUser.mergedInto && sourceUser.mergedInto !== targetUserId) {
    throw new Error("待合并账号状态已变化，请重新发起绑定");
  }

  const [sourceBackups, sourceLegacyBackups, sourceIdentities, targetUsages, sourceUsages, sourceLegacyUsages, targetEntitlement, sourceEntitlement] = await Promise.all([
    readOwnedRecords(backups, "userId", sourceUserId),
    readOwnedRecords(backups, "openid", sourceUserId),
    readOwnedRecords(identities, "userId", sourceUserId),
    readOwnedRecords(usages, "userId", targetUserId),
    readOwnedRecords(usages, "userId", sourceUserId),
    readOwnedRecords(usages, "openid", sourceUserId),
    entitlements.doc(targetUserId).get(),
    entitlements.doc(sourceUserId).get(),
  ]);
  const uniqueById = (records) => [...new Map(records.filter(Boolean).map((record) => [record._id, record])).values()];
  const backupRecords = uniqueById([...sourceBackups, ...sourceLegacyBackups]);
  const sourceUsageRecords = uniqueById([...sourceUsages, ...sourceLegacyUsages]);
  const targetUsageRecords = uniqueById(targetUsages);
  if (backupRecords.length + sourceIdentities.length + sourceUsageRecords.length + targetUsageRecords.length > 80) {
    throw new Error("待合并云数据过多，请联系支持处理");
  }
  const mergeId = mergeDocumentId(targetUserId, sourceUserId);

  const result = await db.runTransaction(async (transaction) => {
    const targetRef = transaction.collection("users").doc(targetUser._id);
    const sourceRef = transaction.collection("users").doc(sourceUser._id);
    const freshTarget = firstDocument(await targetRef.get());
    const freshSource = firstDocument(await sourceRef.get());
    if (!freshTarget || freshTarget.mergedInto) throw new Error("当前账号已失效，请重新登录");
    if (!freshSource) throw new Error("待合并账号不存在，请重新发起绑定");
    if (freshSource.mergedInto === targetUserId) return freshTarget;
    if (freshSource.mergedInto) throw new Error("待合并账号状态已变化，请重新发起绑定");

    const providers = mergedProviders(freshTarget, freshSource, { providers: [provider] });
    await targetRef.update({ providers, lastLoginAt: now, mergedAt: now });
    await sourceRef.update({ mergedInto: targetUserId, mergedAt: now, mergeId, disabledAt: now });
    for (const identity of sourceIdentities) {
      const ref = transaction.collection("identities").doc(identity._id);
      const freshIdentity = firstDocument(await ref.get());
      if (freshIdentity && freshIdentity.userId === sourceUserId) await ref.update({ userId: targetUserId, mergedAt: now });
    }
    for (const backup of backupRecords) {
      const ref = transaction.collection("backups").doc(backup._id);
      const freshBackup = firstDocument(await ref.get());
      if (freshBackup && (freshBackup.userId === sourceUserId || freshBackup.openid === sourceUserId)) {
        await ref.update({
          userId: targetUserId,
          mergeSource: {
            userId: sourceUserId,
            provider,
            device: freshBackup.deviceName || freshBackup.deviceId || "",
            mergedAt: now,
            originalCreatedAt: freshBackup.createdAt || 0,
          },
        });
      }
    }
    const allUsage = uniqueById([...targetUsageRecords, ...sourceUsageRecords]);
    const byMonth = new Map();
    for (const usage of allUsage) {
      const month = usage.month;
      if (!month) continue;
      const current = byMonth.get(month) || { target: [], source: [] };
      (usage.userId === targetUserId ? current.target : current.source).push(usage);
      byMonth.set(month, current);
    }
    for (const [month, records] of byMonth) {
      const targetRecord = records.target[0] || null;
      const total = records.target.concat(records.source).reduce((sum, record) => sum + (Number(record.count) || 0), 0);
      if (targetRecord) {
        await transaction.collection("aiUsage").doc(targetRecord._id).update({ count: Math.min(AI_MONTHLY_LIMIT, total), updatedAt: now });
      } else if (total) {
        // 事务里使用确定性的文档 id，避免网络重试时重复 add 同月额度记录。
        const mergedUsageId = crypto.createHash("sha256").update(`${targetUserId}:${month}`, "utf8").digest("hex");
        await transaction.collection("aiUsage").doc(mergedUsageId).set({
          userId: targetUserId,
          month,
          count: Math.min(AI_MONTHLY_LIMIT, total),
          updatedAt: now,
          mergedAt: now,
        });
      }
      for (const record of records.target.slice(1).concat(records.source)) {
        await transaction.collection("aiUsage").doc(record._id).remove();
      }
    }
    // Premium 不能在账户绑定时丢失：已购优先于体验期，同时合并历史 appAccountToken，
    // 使绑定前发起的 Apple 交易仍能被服务端核验。
    const freshTargetEntitlement = firstDocument(await transaction.collection("premiumEntitlements").doc(targetUserId).get()) || firstDocument(targetEntitlement);
    const freshSourceEntitlement = firstDocument(await transaction.collection("premiumEntitlements").doc(sourceUserId).get()) || firstDocument(sourceEntitlement);
    if (freshTargetEntitlement || freshSourceEntitlement) {
      const candidates = [freshTargetEntitlement, freshSourceEntitlement].filter(Boolean);
      const paid = candidates.find((record) => record.kind === "paid");
      // 已退款/撤销的 Apple 买断不是体验期，合并账号时不能把它重新变成可用 Premium。
      const revoked = candidates.find((record) => record.kind === "expired" && record.source === "appStore" && record.revokedAt);
      const tokens = uniqueStrings(candidates.flatMap((record) => record.appAccountTokens || []));
      const nextEntitlement = paid
        ? { ...paid, userId: targetUserId, appAccountTokens: tokens, updatedAt: now, mergedAt: now }
        : revoked
          ? { ...revoked, userId: targetUserId, appAccountTokens: tokens, updatedAt: now, mergedAt: now }
        : {
          ...(freshTargetEntitlement || freshSourceEntitlement),
          userId: targetUserId,
          kind: "trial",
          trialEndsAt: Math.max(...candidates.map((record) => Number(record.trialEndsAt) || 0)),
          appAccountTokens: tokens,
          updatedAt: now,
          mergedAt: now,
        };
      await transaction.collection("premiumEntitlements").doc(targetUserId).set(nextEntitlement);
      if (freshSourceEntitlement) await transaction.collection("premiumEntitlements").doc(sourceUserId).remove();
    }
    await transaction.collection("accountMerges").doc(mergeId).set({
      targetUserId,
      sourceUserId,
      provider,
      completedAt: now,
      status: "complete",
    });
    return { ...freshTarget, providers, lastLoginAt: now };
  });
  const user = result && result.result ? result.result : result;
  return { account: normalizeAccount(user, targetUserId), merged: true };
}

async function confirmMerge(db, input) {
  const { currentUserId, mergeIntent, now } = input;
  const intent = firstDocument(await db.collection("accountBindingIntents").doc(mergeIntent).get());
  if (!intent || intent.currentUserId !== currentUserId || intent.expiresAt < now) {
    const error = new Error("绑定确认已过期，请重新授权");
    error.code = "MERGE_INTENT_EXPIRED";
    throw error;
  }
  const result = await mergeAccounts(db, {
    currentUserId,
    otherUserId: intent.otherUserId,
    provider: intent.provider,
    now,
  });
  await db.collection("accountBindingIntents").doc(mergeIntent).remove();
  return { ok: true, ...result };
}

module.exports = {
  AI_MONTHLY_LIMIT,
  BINDING_INTENT_TTL_MS,
  assertCurrentIdentity,
  bindIdentity,
  confirmMerge,
  identityDocumentId,
  mergeAccounts,
  mergeDocumentId,
  mergedProviders,
  mergedUsageCount,
  normalizeAccount,
};
