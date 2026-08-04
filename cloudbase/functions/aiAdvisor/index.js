const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

// ===== 每月用量上限（2026-08-04，服务端计数）=====
// 以前是客户端localStorage存"20次/天"，清一下本地数据就绕过了——买断制下AI是持续成本，
// 这个敞口必须在服务端堵住。改成按自然月计：一个用户一个月一条 aiUsage 文档，
// 靠 openid+month 寻址（跟 backups 集合用 openid 做普通字段 + .where() 是同一个模式）。
const AI_MONTHLY_LIMIT = 50;

// 月份串按**北京时间**算，不能直接用 new Date().toISOString()——云函数跑在UTC，
// 月初/月末那几个小时会跟用户手机上看到的月份对不上（用户1号凌晨以为额度该重置了，
// 服务端还停在上个月）。+8小时后再取ISO的前7位即可。
function currentMonth() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7); // "2026-08"
}

// 读这个用户本月已用多少次。集合/文档不存在都返回0（第一次用的人本来就没有记录）。
async function readUsage(openid, month) {
  try {
    const res = await db.collection("aiUsage").where({ openid, month }).limit(1).get();
    const rec = (res.data || [])[0];
    return { used: (rec && rec.count) || 0, id: rec && rec._id };
  } catch (e) {
    // 集合不存在等异常：不能因为计数读不到就把功能整个卡死，放行并记日志（宁可漏计
    // 也不误伤付费用户）——真出问题会在云函数日志里看到，不会静默。
    console.error("[aiUsage] read failed, fail-open:", e && e.message);
    return { used: 0, id: null, degraded: true };
  }
}

// 计数只在**模型真的返回内容之后**才加——调用失败/超时不该扣用户额度。
async function bumpUsage(openid, month, existingId) {
  try {
    if (existingId) {
      await db.collection("aiUsage").doc(existingId).update({
        count: db.command.inc(1), updatedAt: Date.now(),
      });
    } else {
      await db.collection("aiUsage").add({ openid, month, count: 1, updatedAt: Date.now() });
    }
  } catch (e) {
    console.error("[aiUsage] bump failed:", e && e.message);
  }
}

// CloudBase 自带大模型能力：app.ai().createModel("cloudbase").generateText(...)。
// 计费走 CloudBase 资源点，不需要第三方 API Key、不用往环境变量塞密钥。
// AI_MODEL 用混元 "hy3"：这个环境是「体验版」套餐，控制台 AI→生文模型 里只有混元
// (hy3 / hy3-preview) 是开启可用的，DeepSeek 全系被套餐锁住（v4 要升级、v3.2 即将下线）。
// hy3 是一方模型、最便宜、且是官方 Node SDK 文档示例用的 id。以后升级套餐解锁 DeepSeek
// 想换，改这一行即可（换成控制台里状态为「已开启」的 model id，别用「即将下线/被锁」的）。
const AI_MODEL = "hy3";

// 末尾追加建议这段是2026-08新增的："###SUGGESTIONS###"这个marker是跟客户端(AiScreen.tsx
// 的splitSuggestions())约定好的分隔符，客户端按它切出正文和追问建议、渲染成可点的芯片。
// hy3不保证100%遵循这个格式——客户端那边找不到marker就把整段当正文、建议列表为空，
// 优雅降级，不是这里必须严格保证的硬约束。
const SYSTEM_PROMPT =
  "你是一位务实、简洁的中文债务分析助手。用户会给你一份 JSON 格式的债务概况（金额单位为元）。" +
  "请基于雪球法（先还余额最小的）和雪崩法（先还利率最高的）两种策略给出分析，" +
  "明确指出在当前情况下优先偿还哪一笔最省钱、大致能省多少利息，并给出可执行的还款顺序建议。" +
  "语言口语化、直接、给数字，不要写大段免责声明，不要用 Markdown 表格。适度用 **加粗** 标出关键结论。" +
  "如果用户问你是什么模型、由哪家公司开发、用了什么底层技术，一律回答你是 After Zero 的 AI 债务助手，" +
  "不透露具体模型名称或技术实现，也不要否认自己是 AI。" +
  "回答完之后，另起一段，严格按下面的格式追加 2~3 条用户接下来可能会问的追问（每条不超过 15 个字，" +
  "不要编号、不要多余解释），格式如下（第一行必须是这一行marker本身，一字不差）：\n" +
  "###SUGGESTIONS###\n- 追问1\n- 追问2\n- 追问3\n" +
  "如果确实没有合适的追问，可以省略整段。";

exports.main = async (event) => {
  const auth = app.auth();
  const { customUserId } = auth.getUserInfo() || {};
  if (!customUserId) {
    return { ok: false, error: "未登录，无法使用 AI 分析" };
  }

  const mode = event && event.mode === "chat" ? "chat" : "report";
  const summary = (event && event.summary) || null;
  if (!summary) {
    return { ok: false, error: "缺少债务数据" };
  }

  // 额度检查放在拼prompt之前、调模型之前——超额时一次模型调用都不该发生。
  const month = currentMonth();
  const usage = await readUsage(customUserId, month);
  if (usage.used >= AI_MONTHLY_LIMIT) {
    return {
      ok: false,
      code: "QUOTA_EXCEEDED", // 客户端据此弹额度说明弹窗，不当成普通报错
      error: "本月 AI 分析次数已用完（" + AI_MONTHLY_LIMIT + " 次/月），下个月 1 号恢复",
      quota: { month, used: usage.used, limit: AI_MONTHLY_LIMIT },
    };
  }
  const summaryText = "以下是我的债务概况（JSON）：\n" + JSON.stringify(summary, null, 2);

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (mode === "report") {
    messages.push({ role: "user", content: summaryText + "\n\n请生成一份债务分析报告。" });
  } else {
    // 问答：先把债务概况作为上下文，再接历史对话，最后是本次问题
    messages.push({ role: "user", content: summaryText + "\n\n接下来我会就这份债务提问。" });
    messages.push({ role: "assistant", content: "好的，我已了解你的债务情况，请提问。" });
    const history = Array.isArray(event.history) ? event.history : [];
    for (const h of history) {
      if (h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string") {
        messages.push({ role: h.role, content: h.content });
      }
    }
    const question = (event && typeof event.question === "string") ? event.question.trim() : "";
    if (!question) {
      return { ok: false, error: "问题为空" };
    }
    messages.push({ role: "user", content: question });
  }

  try {
    const ai = app.ai();
    const model = ai.createModel("cloudbase");
    const result = await model.generateText({ model: AI_MODEL, messages });
    const text = (result && result.text) || "";
    if (!text) {
      return { ok: false, error: "AI 未返回内容，请稍后再试" };
    }
    // 真的拿到内容了才计数（上面几条失败分支都不扣额度）
    await bumpUsage(customUserId, month, usage.id);
    return { ok: true, text, quota: { month, used: usage.used + 1, limit: AI_MONTHLY_LIMIT } };
  } catch (e) {
    return { ok: false, error: "AI 调用失败：" + (e && e.message ? e.message : String(e)) };
  }
};
