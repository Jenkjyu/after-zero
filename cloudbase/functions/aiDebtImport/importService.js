const PAID_IMPORT_LIMIT = 25;

function importError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value == null ? "" : value).replace(/[¥￥,，\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

function dateValue(value) {
  const raw = String(value == null ? "" : value).trim().replace(/[./年]/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseJsonText(value) {
  if (value && typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) throw importError("AI_IMPORT_EMPTY", "识别服务未返回草稿");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate || text);
  } catch (_) {
    throw importError("AI_IMPORT_JSON_INVALID", "识别结果格式无效，请重新识别");
  }
}

function textList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const one = String(value || "").trim();
  return one ? [one] : [];
}

const TECHNICAL_REVIEW_TEXT = /(?:\bocr\b|识别(?:失败|结果|过程|到)?|多余字符|噪音|重复(?:截图|期次|出现)?|重叠(?:截图)?|已跳过|未自动(?:标记|抵扣)|低置信度|warning|置信度)/i;

function normalizeReviewItems(value) {
  const list = Array.isArray(value) ? value : textList(value);
  return list.map((item) => {
    if (typeof item === "string") return { text: item.trim(), context: "", category: "", needsReview: true };
    if (!item || typeof item !== "object") return null;
    const text = String(item.text || item.term || item.label || item.note || item.content || "").trim();
    const rawTerm = item.termNumber || item.term;
    const termContext = Number.isInteger(Number(rawTerm)) && Number(rawTerm) > 0 ? `第${Number(rawTerm)}期` : "";
    const context = String(item.context || item.period || item.termLabel || termContext || "").trim();
    return {
      text,
      context,
      category: String(item.category || item.impact || "").trim(),
      needsReview: item.needsReview !== false,
    };
  }).filter((item) => item && item.text && item.needsReview && !TECHNICAL_REVIEW_TEXT.test(item.text));
}

function cleanBusinessNote(value) {
  const note = String(value || "").trim();
  return note && !TECHNICAL_REVIEW_TEXT.test(note) ? note : "";
}

function reviewItemNote(item) {
  const source = `${item.category} ${item.text}`;
  const location = item.context ? `原还款计划${item.context}` : "原还款计划";
  if (/(?:贴息|补贴|减免|优惠|subsidy|discount)/i.test(source)) {
    return `${location}含${item.text}，请核对；系统未自动抵扣。`;
  }
  return `${location}出现“${item.text}”，请核对。`;
}

function normalizeDraft(raw) {
  const parsed = parseJsonText(raw);
  const sourceRows = Array.isArray(parsed.plan) ? parsed.plan : Array.isArray(parsed.rows) ? parsed.rows : [];
  const warnings = textList(parsed.warnings);
  const reviewItems = normalizeReviewItems(parsed.reviewItems || parsed.reviewNotes || parsed.sourceNotes);
  textList(parsed.subsidyNotes || parsed.subsidies).forEach((text) => reviewItems.push({ text, context: "", category: "subsidy", needsReview: true }));
  const sourceStatuses = [];
  const rows = [];
  const seen = new Map();

  for (let index = 0; index < sourceRows.length; index++) {
    const source = sourceRows[index] || {};
    const date = dateValue(source.date || source.planDate || source.repaymentDate);
    const principal = Math.max(0, round2(source.principal));
    const interest = Math.max(0, round2(source.interest || source.fee));
    if (!date || principal + interest <= 0) {
      warnings.push(`第 ${index + 1} 条识别结果缺少有效日期或金额，已跳过`);
      continue;
    }
    const term = Number.isInteger(Number(source.term)) && Number(source.term) > 0 ? Number(source.term) : null;
    const status = String(source.sourceStatus || source.statusText || source.status || "").trim();
    const subsidy = String(source.subsidyNote || source.subsidy || "").trim();
    if (status) sourceStatuses.push(status);
    if (subsidy) reviewItems.push({ text: subsidy, context: term ? `第${term}期` : "", category: "subsidy", needsReview: true });
    const row = { date, amount: round2(principal + interest), principal, interest, paid: false };
    const key = term ? `term:${term}` : `date:${date}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      const existingScore = existing.principal + existing.interest;
      const nextScore = row.principal + row.interest;
      if (nextScore > existingScore) Object.assign(existing, row);
      warnings.push(`${term ? `第 ${term} 期` : date}在重叠截图中重复出现，已合并为一条`);
      continue;
    }
    seen.set(key, row);
    rows.push({ term, row });
  }

  rows.sort((a, b) => (a.term && b.term ? a.term - b.term : a.row.date.localeCompare(b.row.date)));
  if (!rows.length) throw importError("AI_IMPORT_DRAFT_INVALID", "没有识别出有效的还款计划，请检查截图后重试");

  const uniqueStatuses = [...new Set(sourceStatuses.filter(Boolean))];
  const reviewNotes = reviewItems.map(reviewItemNote);
  const notes = [cleanBusinessNote(parsed.notes)]
    .concat(reviewNotes)
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .join("\n");

  return {
    productHint: String(parsed.productHint || parsed.product || parsed.loanProduct || "").trim(),
    funderHint: String(parsed.funderHint || parsed.funder || "").trim(),
    typeHint: String(parsed.typeHint || parsed.type || "").trim(),
    notes,
    warnings: [...new Set(warnings.filter(Boolean))],
    sourceStatuses: uniqueStatuses,
    plan: rows.map((entry) => entry.row),
  };
}

function resolveCreditBucket(entitlement, now, trialLimit) {
  if (entitlement && entitlement.kind === "paid") return { bucket: "paid", limit: PAID_IMPORT_LIMIT };
  const trialEndsAt = Number(entitlement && entitlement.trialEndsAt) || 0;
  const configuredTrialLimit = Math.max(0, Number(trialLimit) || 0);
  if (entitlement && entitlement.kind === "trial" && trialEndsAt > now && configuredTrialLimit > 0) {
    return { bucket: "trial", limit: configuredTrialLimit };
  }
  if (entitlement && entitlement.kind === "trial" && trialEndsAt > now) {
    throw importError("AI_IMPORT_TRIAL_NOT_CONFIGURED", "AI 识图体验额度尚未开放");
  }
  throw importError("PREMIUM_REQUIRED", "请先开通 Premium 后使用 AI 识图录入");
}

function publicCredits(document, bucketInfo) {
  const usedField = bucketInfo.bucket === "paid" ? "paidUsed" : "trialUsed";
  const used = Math.max(0, Number(document && document[usedField]) || 0);
  return { bucket: bucketInfo.bucket, limit: bucketInfo.limit, used, remaining: Math.max(0, bucketInfo.limit - used) };
}

module.exports = {
  PAID_IMPORT_LIMIT,
  dateValue,
  importError,
  normalizeDraft,
  parseJsonText,
  publicCredits,
  resolveCreditBucket,
  round2,
};
