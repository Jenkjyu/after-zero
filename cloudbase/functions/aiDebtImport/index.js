const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");
const {
  PAID_IMPORT_LIMIT,
  importError,
  normalizeDraft,
  publicCredits,
  resolveCreditBucket,
} = require("./importService");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV, timeout: 120000 });
const db = app.database();
const TEXT_MODEL = process.env.AI_IMPORT_TEXT_MODEL || "hy3";
const TRIAL_LIMIT = process.env.AI_IMPORT_TRIAL_LIMIT || "0";
const LEASE_MS = 3 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGES = 20;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

function firstDocument(result) {
  if (!result || result.data == null) return null;
  return Array.isArray(result.data) ? result.data[0] || null : result.data;
}

function withoutId(value) {
  if (!value) return value;
  const { _id, ...rest } = value;
  return rest;
}

function requiredUserId() {
  const { customUserId } = app.auth().getUserInfo() || {};
  if (!customUserId) throw importError("LOGIN_REQUIRED", "请先登录后使用 AI 识图录入");
  return customUserId;
}

async function isMergedSession(userId) {
  const user = firstDocument(await db.collection("users").where({ userId }).limit(1).get());
  return Boolean(user && user.mergedInto);
}

async function entitlementFor(userId) {
  return firstDocument(await db.collection("premiumEntitlements").doc(userId).get());
}

function sessionIdFor(userId, idempotencyKey) {
  return "ais_" + crypto.createHash("sha256").update(`${userId}|${idempotencyKey}`).digest("hex").slice(0, 28);
}

function validFileIds(sessionId, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length < 1 || fileIds.length > MAX_IMAGES) {
    throw importError("AI_IMPORT_IMAGES_INVALID", `请选择 1 至 ${MAX_IMAGES} 张同一笔债务的截图`);
  }
  const marker = `/ai-import/${sessionId}/`;
  const clean = [...new Set(fileIds.filter((value) => typeof value === "string" && value.includes(marker)))];
  if (clean.length !== fileIds.length) throw importError("AI_IMPORT_FILE_SCOPE_INVALID", "截图文件不属于当前识别任务");
  return clean;
}

function uploadExtension(mime) {
  const value = String(mime || "").toLowerCase();
  if (value === "image/png") return "png";
  if (value === "image/webp") return "webp";
  if (value === "image/heic") return "heic";
  if (value === "image/heif") return "heif";
  return "jpg";
}

async function uploadForSession(userId, event, now) {
  const sessionId = String(event && event.sessionId || "");
  const mime = String(event && event.mime || "image/jpeg").toLowerCase();
  const index = Number(event && event.index);
  const encoded = String(event && event.base64 || "").replace(/^data:[^,]+,/, "");
  if (!/^ais_[a-f0-9]{28}$/.test(sessionId) || !Number.isInteger(index) || index < 0 || index >= MAX_IMAGES) {
    throw importError("AI_IMPORT_UPLOAD_INVALID", "图片上传参数无效");
  }
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime) || !encoded) {
    throw importError("AI_IMPORT_UPLOAD_INVALID", "仅支持常见图片格式");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw importError("AI_IMPORT_IMAGE_TOO_LARGE", "图片过大，请压缩后重试");
  }
  const sessionRef = db.collection("aiImportSessions").doc(sessionId);
  const session = firstDocument(await sessionRef.get());
  if (!session || session.userId !== userId || session.status !== "uploading") {
    throw importError("AI_IMPORT_SESSION_NOT_FOUND", "识别任务不存在或已过期");
  }
  const cloudPath = `ai-import/${sessionId}/${String(index + 1).padStart(2, "0")}-${crypto.randomBytes(6).toString("hex")}.${uploadExtension(mime)}`;
  const uploaded = await app.uploadFile({ cloudPath, fileContent: buffer });
  const fileIds = Array.isArray(session.fileIds) ? session.fileIds.slice() : [];
  fileIds.push(uploaded.fileID);
  await sessionRef.set({ ...withoutId(session), fileIds, updatedAt: now, expiresAt: now + SESSION_TTL_MS });
  return { fileID: uploaded.fileID, size: buffer.length };
}

async function cleanupSession(userId, sessionId, now) {
  if (!/^ais_[a-f0-9]{28}$/.test(sessionId)) return { cleaned: 0 };
  const sessionRef = db.collection("aiImportSessions").doc(sessionId);
  const session = firstDocument(await sessionRef.get());
  if (!session || session.userId !== userId) return { cleaned: 0 };
  const fileIds = Array.isArray(session.fileIds) ? session.fileIds.filter(Boolean) : [];
  if (fileIds.length) await app.deleteFile({ fileList: fileIds });
  if (session.status !== "succeeded" && session.status !== "accepted") {
    await sessionRef.set({ ...withoutId(session), status: "failed", fileIds: [], updatedAt: now });
  }
  return { cleaned: fileIds.length };
}

async function creditContext(userId, now) {
  const entitlement = await entitlementFor(userId);
  const bucketInfo = resolveCreditBucket(entitlement, now, TRIAL_LIMIT);
  const document = firstDocument(await db.collection("aiImportCredits").doc(userId).get()) || { userId };
  return { bucketInfo, document, credits: publicCredits(document, bucketInfo) };
}

async function createSession(userId, event, now) {
  const idempotencyKey = String(event && event.idempotencyKey || "").trim();
  if (!/^[A-Za-z0-9_-]{12,96}$/.test(idempotencyKey)) throw importError("AI_IMPORT_IDEMPOTENCY_INVALID", "识别任务标识无效");
  const sessionId = sessionIdFor(userId, idempotencyKey);
  const ref = db.collection("aiImportSessions").doc(sessionId);
  const existing = firstDocument(await ref.get());
  const context = await creditContext(userId, now);
  if (existing && (existing.status === "succeeded" || existing.status === "accepted") && existing.draft) {
    return { sessionId, status: existing.status, draft: existing.draft, credits: context.credits };
  }
  if (context.credits.remaining <= 0) throw importError("AI_IMPORT_QUOTA_EXCEEDED", "AI 识图录入次数已用完");
  if (existing && existing.status === "failed") {
    await ref.set({
      ...withoutId(existing), status: "uploading", fileIds: [], draft: null, error: null,
      updatedAt: now, expiresAt: now + SESSION_TTL_MS,
    });
  }
  if (!existing) {
    await ref.set({
      sessionId, userId, idempotencyKey, status: "uploading", fileIds: [], draft: null,
      createdAt: now, updatedAt: now, expiresAt: now + SESSION_TTL_MS,
    });
  }
  const session = existing || firstDocument(await ref.get());
  return { sessionId, status: session.status, draft: session.draft || null, credits: context.credits };
}

async function reserveSession(userId, sessionId, fileIds, now) {
  const result = await db.runTransaction(async (transaction) => {
    const sessionRef = transaction.collection("aiImportSessions").doc(sessionId);
    const creditRef = transaction.collection("aiImportCredits").doc(userId);
    const entitlementRef = transaction.collection("premiumEntitlements").doc(userId);
    const session = firstDocument(await sessionRef.get());
    if (!session || session.userId !== userId) throw importError("AI_IMPORT_SESSION_NOT_FOUND", "识别任务不存在或已过期");
    if ((session.status === "succeeded" || session.status === "accepted") && session.draft) return { alreadyDone: true, session };
    const entitlement = firstDocument(await entitlementRef.get());
    const bucketInfo = resolveCreditBucket(entitlement, now, TRIAL_LIMIT);
    const credit = firstDocument(await creditRef.get()) || { userId, paidUsed: 0, trialUsed: 0 };
    const credits = publicCredits(credit, bucketInfo);
    if (credits.remaining <= 0) throw importError("AI_IMPORT_QUOTA_EXCEEDED", "AI 识图录入次数已用完");
    const reservation = credit.reservation || null;
    if (session.status === "processing" && reservation && reservation.sessionId === sessionId && Number(reservation.leaseUntil) > now) {
      throw importError("AI_IMPORT_IN_PROGRESS", "这组截图正在识别，请等待当前任务完成");
    }
    if (reservation && reservation.sessionId !== sessionId && Number(reservation.leaseUntil) > now) {
      throw importError("AI_IMPORT_IN_PROGRESS", "已有一组截图正在识别，请稍后再试");
    }
    const nextCredit = {
      ...withoutId(credit), userId,
      reservation: { sessionId, bucket: bucketInfo.bucket, leaseUntil: now + LEASE_MS },
      updatedAt: now,
    };
    await creditRef.set(nextCredit);
    await sessionRef.set({
      ...withoutId(session), status: "processing", fileIds, error: null,
      creditBucket: bucketInfo.bucket, updatedAt: now, expiresAt: now + SESSION_TTL_MS,
    });
    return { alreadyDone: false, bucketInfo, credits, session: { ...session, fileIds } };
  });
  return result && result.result ? result.result : result;
}

async function finishSession(userId, sessionId, draft, now) {
  const result = await db.runTransaction(async (transaction) => {
    const sessionRef = transaction.collection("aiImportSessions").doc(sessionId);
    const creditRef = transaction.collection("aiImportCredits").doc(userId);
    const session = firstDocument(await sessionRef.get());
    const credit = firstDocument(await creditRef.get()) || { userId, paidUsed: 0, trialUsed: 0 };
    if (session && (session.status === "succeeded" || session.status === "accepted") && session.draft) {
      const bucketInfo = { bucket: session.creditBucket, limit: session.creditBucket === "paid" ? PAID_IMPORT_LIMIT : Math.max(0, Number(TRIAL_LIMIT) || 0) };
      return { session, credits: publicCredits(credit, bucketInfo) };
    }
    if (!session || session.userId !== userId || !credit.reservation || credit.reservation.sessionId !== sessionId) {
      throw importError("AI_IMPORT_RESERVATION_LOST", "识别任务已失效，请重新开始");
    }
    const bucket = credit.reservation.bucket;
    const usedField = bucket === "paid" ? "paidUsed" : "trialUsed";
    const nextCredit = { ...withoutId(credit), [usedField]: (Number(credit[usedField]) || 0) + 1, reservation: null, updatedAt: now };
    const nextSession = { ...withoutId(session), status: "succeeded", draft, charged: true, updatedAt: now, expiresAt: now + SESSION_TTL_MS };
    await creditRef.set(nextCredit);
    await sessionRef.set(nextSession);
    const bucketInfo = { bucket, limit: bucket === "paid" ? PAID_IMPORT_LIMIT : Math.max(0, Number(TRIAL_LIMIT) || 0) };
    return { session: nextSession, credits: publicCredits(nextCredit, bucketInfo) };
  });
  return result && result.result ? result.result : result;
}

async function failSession(userId, sessionId, error, now) {
  try {
    await db.runTransaction(async (transaction) => {
      const sessionRef = transaction.collection("aiImportSessions").doc(sessionId);
      const creditRef = transaction.collection("aiImportCredits").doc(userId);
      const session = firstDocument(await sessionRef.get());
      const credit = firstDocument(await creditRef.get()) || { userId };
      if (session && session.status !== "succeeded" && session.status !== "accepted") {
        await sessionRef.set({ ...withoutId(session), status: "failed", error: error.message, updatedAt: now });
      }
      if (credit.reservation && credit.reservation.sessionId === sessionId) {
        await creditRef.set({ ...withoutId(credit), reservation: null, updatedAt: now });
      }
    });
  } catch (releaseError) {
    console.error("[aiDebtImport] release failed", releaseError && releaseError.message);
  }
}

async function downloadImages(fileIds) {
  const buffers = [];
  for (const fileID of fileIds) {
    const result = await app.downloadFile({ fileID });
    const buffer = result && result.fileContent;
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw importError("AI_IMPORT_FILE_DOWNLOAD_FAILED", "无法读取已上传截图");
    }
    buffers.push(buffer);
  }
  return buffers;
}

function createOcrClient() {
  const secretId = process.env.TENCENTCLOUD_SECRETID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
  const token = process.env.TENCENTCLOUD_SESSIONTOKEN;
  if (!secretId || !secretKey || !token) {
    throw importError("AI_IMPORT_OCR_CREDENTIALS_UNAVAILABLE", "腾讯云 OCR 运行凭据不可用，请稍后再试");
  }
  const OcrClient = tencentcloud.ocr.v20181119.Client;
  return new OcrClient({
    credential: { secretId, secretKey, token },
    region: process.env.TENCENTCLOUD_REGION || "ap-guangzhou",
    profile: { httpProfile: { endpoint: "ocr.tencentcloudapi.com" } },
  });
}

function ocrImportError(error, index) {
  const code = String(error && error.code || "");
  if (code === "AuthFailure.UnauthorizedOperation") {
    return importError("AI_IMPORT_OCR_PERMISSION_DENIED", "OCR 服务权限未配置，请联系开发者");
  }
  if (code === "FailedOperation.UnOpenError" || code === "FailedOperation.ServiceNotOpen") {
    return importError("AI_IMPORT_OCR_NOT_OPEN", "OCR 服务尚未开通，请联系开发者");
  }
  if (code === "FailedOperation.ImageDecodeFailed" || code === "InvalidParameterValue.ImageBase64") {
    return importError("AI_IMPORT_OCR_IMAGE_INVALID", `第 ${index + 1} 张截图格式无法识别，请重新选择截图`);
  }
  return importError("AI_IMPORT_OCR_FAILED", `第 ${index + 1} 张截图识别失败，请稍后重试`);
}

function ocrText(response, index) {
  const lines = Array.isArray(response && response.TextDetections)
    ? response.TextDetections.map((item) => String(item && item.DetectedText || "").trim()).filter(Boolean)
    : [];
  if (!lines.length) throw importError("AI_IMPORT_OCR_EMPTY", `第 ${index + 1} 张截图未识别出文字，请检查图片后重试`);
  return `【截图 ${index + 1}】\n${lines.join("\n")}`;
}

async function recognizeImages(fileIds) {
  const images = await downloadImages(fileIds);
  const ocr = createOcrClient();
  const extractedParts = [];
  for (let index = 0; index < images.length; index++) {
    let response;
    try {
      response = await ocr.GeneralBasicOCR({ ImageBase64: images[index].toString("base64") });
    } catch (error) {
      console.error("[aiDebtImport] OCR failed", error && error.code, error && error.requestId);
      throw ocrImportError(error, index);
    }
    extractedParts.push(ocrText(response, index));
  }

  const ai = app.ai();
  const organizer = ai.createModel("cloudbase");
  const prompt =
    "把以下同一笔债务的多张截图提取结果合并成严格 JSON，不要 Markdown。JSON 结构：" +
    '{"productHint":"","funderHint":"","typeHint":"","notes":"","reviewItems":[{"text":"","context":"","category":"","needsReview":true}],"warnings":[],"plan":[{"term":1,"date":"YYYY-MM-DD","principal":0,"interest":0,"amount":0,"sourceStatus":"","subsidyNote":""}]}。' +
    "重叠截图的同一期只保留一条；只把可能影响金额、日期、费用或还款状态的原图业务信息写入 reviewItems，保留原文和期数/上下文；贴息、服务费、减免等都按同一规则记录，不要只识别某一个固定词。OCR 清洗过程、重复合并、置信度、‘未自动标记’等内部信息不要写入 notes 或 reviewItems。不确定但与账务有关时保留原文，不要自行解释；不得把已入账映射成已还；不得输出 paid、年化利率或还款方式。金额字段按截图提取，服务端会再以本金加利息校准。\n\nOCR 提取结果：\n" + extractedParts.join("\n\n");
  const organized = await organizer.generateText({ model: TEXT_MODEL, messages: [{ role: "user", content: prompt }] });
  return normalizeDraft(organized && organized.text);
}

async function recognize(userId, event, now) {
  const sessionId = String(event && event.sessionId || "");
  const fileIds = validFileIds(sessionId, event && event.fileIds);
  const reservation = await reserveSession(userId, sessionId, fileIds, now);
  if (reservation.alreadyDone) {
    const context = await creditContext(userId, now);
    return { sessionId, status: "succeeded", draft: reservation.session.draft, credits: context.credits };
  }
  try {
    const draft = await recognizeImages(fileIds);
    const finished = await finishSession(userId, sessionId, draft, Date.now());
    return { sessionId, status: "succeeded", draft: finished.session.draft, credits: finished.credits };
  } catch (error) {
    await failSession(userId, sessionId, error, Date.now());
    throw error;
  } finally {
    app.deleteFile({ fileList: fileIds }).catch((error) => console.error("[aiDebtImport] temp cleanup failed", error && error.message));
  }
}

exports.main = async (event) => {
  try {
    const userId = requiredUserId();
    if (await isMergedSession(userId)) throw importError("ACCOUNT_MERGED_RELOGIN_REQUIRED", "该账号已合并，请重新登录后继续使用");
    const now = Date.now();
    const action = event && event.action || "status";
    if (action === "create") return { ok: true, ...(await createSession(userId, event, now)) };
    if (action === "upload") return { ok: true, ...(await uploadForSession(userId, event, now)) };
    if (action === "recognize") return { ok: true, ...(await recognize(userId, event, now)) };
    if (action === "status") {
      const context = await creditContext(userId, now);
      const sessionId = String(event && event.sessionId || "");
      const session = sessionId ? firstDocument(await db.collection("aiImportSessions").doc(sessionId).get()) : null;
      return { ok: true, credits: context.credits, session: session && session.userId === userId ? session : null };
    }
    if (action === "complete") {
      const sessionId = String(event && event.sessionId || "");
      const session = firstDocument(await db.collection("aiImportSessions").doc(sessionId).get());
      if (!session || session.userId !== userId || session.status !== "succeeded") throw importError("AI_IMPORT_SESSION_NOT_FOUND", "识别草稿不存在");
      await db.collection("aiImportSessions").doc(sessionId).update({ status: "accepted", acceptedAt: now, updatedAt: now });
      return { ok: true };
    }
    if (action === "cleanup") {
      const sessionId = String(event && event.sessionId || "");
      return { ok: true, ...(await cleanupSession(userId, sessionId, now)) };
    }
    throw importError("ACTION_INVALID", "未知识图任务操作");
  } catch (error) {
    console.error("[aiDebtImport] failed", error && error.code, error && error.message);
    return { ok: false, code: error && error.code || "AI_IMPORT_FAILED", error: error && error.message || "识图录入失败" };
  }
};
