const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PAID_IMPORT_LIMIT,
  normalizeDraft,
  publicCredits,
  resolveCreditBucket,
} = require("../cloudbase/functions/aiDebtImport/importService");
const fs = require("fs");
const source = fs.readFileSync("cloudbase/functions/aiDebtImport/index.js", "utf8");
const host = fs.readFileSync("www/index.html", "utf8");

test("识图上传随 App 打包 CloudBase Storage 模块", () => {
  assert.match(host, /<script src="js\/cloudbase\.storage\.js"><\/script>/);
  assert.match(fs.readFileSync("www/js/cloudbase.storage.js", "utf8"), /registerStorage/);
});

test("识图图片通过已登录云函数代理上传，不在 App 内直传 Storage", () => {
  assert.match(source, /action === "upload"/);
  assert.match(source, /app\.uploadFile\(\{ cloudPath, fileContent: buffer \}\)/);
  assert.match(host, /action: "upload", sessionId: sessionId/);
  assert.match(host, /action: "cleanup", sessionId: sessionId/);
  assert.doesNotMatch(host, /cbApp\(\)\.uploadFile\(\{/);
  assert.match(source, /existing\.status === "failed"/);
});

test("识图链路使用腾讯云通用印刷体 OCR，再由 hy3 整理，不调用视觉大模型", () => {
  assert.match(source, /GeneralBasicOCR/);
  assert.match(source, /tencentcloud-sdk-nodejs-ocr/);
  assert.match(source, /app\.downloadFile\(\{ fileID \}\)/);
  assert.match(source, /ImageBase64/);
  assert.doesNotMatch(source, /ImageUrl/);
  assert.match(source, /process\.env\.AI_IMPORT_TEXT_MODEL \|\| "hy3"/);
  assert.doesNotMatch(source, /glm-5v-turbo/);
  assert.doesNotMatch(source, /image_url/);
});

test("OCR 上游失败会区分未授权、未开通和图片格式错误，且不保留诊断入口", () => {
  assert.match(source, /AI_IMPORT_OCR_PERMISSION_DENIED/);
  assert.match(source, /AI_IMPORT_OCR_NOT_OPEN/);
  assert.match(source, /AI_IMPORT_OCR_IMAGE_INVALID/);
  assert.doesNotMatch(source, /diagnoseOcrAccess/);
});

test("买断 Premium 独立获得 25 次终身识图额度", () => {
  const bucket = resolveCreditBucket({ kind: "paid" }, Date.now(), 0);
  assert.deepEqual(bucket, { bucket: "paid", limit: PAID_IMPORT_LIMIT });
  assert.deepEqual(publicCredits({ paidUsed: 3, trialUsed: 1 }, bucket), { bucket: "paid", limit: 25, used: 3, remaining: 22 });
});

test("体验额度未确认时不把 25 次买断额度错误发给试用用户", () => {
  assert.throws(
    () => resolveCreditBucket({ kind: "trial", trialEndsAt: Date.now() + 10000 }, Date.now(), 0),
    (error) => error.code === "AI_IMPORT_TRIAL_NOT_CONFIGURED"
  );
});

test("多张重叠截图合并同一期，金额固定按本金加利息，全部保持未还", () => {
  const draft = normalizeDraft({
    productHint: "某消费贷",
    warnings: [],
    plan: [
      { term: 1, date: "2026/09/05", principal: "1,000", interest: 20, amount: 9999, sourceStatus: "已入账" },
      { term: 1, date: "2026-09-05", principal: 1000, interest: 20, amount: 1020, sourceStatus: "已入账" },
      { term: 2, date: "2026-10-05", principal: 900, interest: 18, amount: 918, sourceStatus: "待入账", subsidyNote: "本期贴息 5 元" },
    ],
  });
  assert.equal(draft.plan.length, 2);
  assert.deepEqual(draft.plan[0], { date: "2026-09-05", principal: 1000, interest: 20, amount: 1020, paid: false });
  assert.equal(draft.plan[1].paid, false);
  assert.match(draft.notes, /原还款计划第2期含本期贴息 5 元，请核对；系统未自动抵扣。/);
  assert.ok(draft.sourceStatuses.includes("已入账"));
  assert.ok(!draft.warnings.some((item) => item.includes("未自动标记任何一期为已还")));
  assert.ok(!draft.warnings.some((item) => item.includes("贴息未自动抵扣")));
});

test("业务相关新词进入通用备注，OCR 内部噪音不会进入备注", () => {
  const draft = normalizeDraft({
    notes: "OCR 清洗完成",
    reviewItems: [
      { text: "服务费 12 元", context: "第4期", category: "fee", needsReview: true },
      { text: "OCR 多余字符 0 本金", context: "第4期", category: "ocr", needsReview: true },
    ],
    plan: [{ term: 4, date: "2026-12-05", principal: 100, interest: 2, amount: 102 }],
  });
  assert.equal(draft.notes, "原还款计划第4期出现“服务费 12 元”，请核对。");
});

test("没有有效日期和金额时不生成草稿也不应进入计费成功路径", () => {
  assert.throws(
    () => normalizeDraft({ plan: [{ date: "不确定", principal: 0, interest: 0 }] }),
    (error) => error.code === "AI_IMPORT_DRAFT_INVALID"
  );
});
