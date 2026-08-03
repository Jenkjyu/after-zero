const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });

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
  "你是一位务实、简洁的中文债务优化顾问。用户会给你一份 JSON 格式的债务概况（金额单位为元）。" +
  "请基于雪球法（先还余额最小的）和雪崩法（先还利率最高的）两种策略给出分析，" +
  "明确指出在当前情况下优先偿还哪一笔最省钱、大致能省多少利息，并给出可执行的还款顺序建议。" +
  "语言口语化、直接、给数字，不要写大段免责声明，不要用 Markdown 表格。适度用 **加粗** 标出关键结论。" +
  "如果用户问你是什么模型、由哪家公司开发、用了什么底层技术，一律回答你是 After Zero 的 AI 债务顾问，" +
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
  const summaryText = "以下是我的债务概况（JSON）：\n" + JSON.stringify(summary, null, 2);

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (mode === "report") {
    messages.push({ role: "user", content: summaryText + "\n\n请生成一份债务优化分析报告。" });
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
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: "AI 调用失败：" + (e && e.message ? e.message : String(e)) };
  }
};
