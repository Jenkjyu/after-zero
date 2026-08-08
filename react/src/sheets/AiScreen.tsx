// AI 债务助手——第十一步(React迁移收尾)从vanilla的#aiScreen+#aiHistorySheet原样复刻，
// 是这批subpage/sheet里技术上最"干净"的一步：AI_USAGE_KEY(每日用量)/AI_CHATLOG_KEY(历史
// 对话)这两个localStorage键整体移交React所有权(照抄SIM_KEY当年"没有别的地方依赖它，
// 整体移交"的先例)，vanilla唯一保留的是callAiAdvisor()——因为它依赖ensureCbAuthReady/
// cbApp().callFunction这套认证会话状态，不可移植。findAiConv/bumpAiConvTop继续是calc.js
// 全局纯函数，直接window调用不复制逻辑。
//
// "历史对话sheet"(原#aiHistorySheet)完全是这个组件内部的本地状态(historyOpen)，不是
// shared/state.ts里的共享开关——它只从AiScreen自己的header按钮触发，不存在"被多棵独立
// React树共同触发"这个需要提到共享层的理由，跟PremiumScreen的兑换码输入框展开/收起是
// 同一类"组件本地UI状态"。
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { closeAiScreen, useAiScreenOpen } from "../shared/state";
import type { AiChatMessage, AiConversation, AiQuota } from "../types";
import { AiLimitModal } from "./AiLimitModal";

// 2026-08-04：从"客户端20次/天软限"改成"服务端50次/月硬限"。**额度的真正把关在
// aiAdvisor云函数**（见那边的AI_MONTHLY_LIMIT/aiUsage集合）——买断制下AI是持续成本，
// 原来纯客户端计数清一下本地数据就绕过了，敞口必须堵在服务端。
// 这个键的角色也随之变了：不再是权威计数器，而是**服务端返回值的本地缓存**，只用来
// ①欢迎态显示"本月还剩N次" ②发请求前的快路径拦截（省一次必然被拒的往返）。
// 被清掉/篡改最多让客户端多打一次请求，服务端照样拒。
// ⚠️键名沿用不变（硬性铁律第1条），但存的形状从 {date,count} 换成 {month,used,limit}：
// 老数据的 month 是 undefined，跟当前月份对不上，会被当成"没有缓存"直接放行让服务端说话，
// 属于优雅降级，不需要一次性迁移脚本。
const AI_USAGE_KEY = "after-zero-ai-usage-v1";
const AI_CHATLOG_KEY = "after-zero-ai-chatlog-v1";
const AI_CHATLOG_MAX_CONVOS = 50;
const AI_CHATLOG_MAX_MSGS = 40;
// 首次进入AI页面提前展示一次"每日额度+复制提示词退路"说明弹窗用的标记，跟AI_USAGE_KEY/
// AI_CHATLOG_KEY一样是新增的独立键，不复用两者(硬性铁律第1条：各自独立的键，不要合并)。
const AI_LIMIT_NOTICE_KEY = "after-zero-ai-limit-notice-v1";
// 弹窗延迟到魔法棒.wand.cast那0.75s的"施法"动效播完再出现(见www/index.html里.wand.cast
// 的animation-duration)，不然弹窗会正好盖住这个动效最抢眼的那一下。
const LIMIT_NOTICE_DELAY_MS = 900;

// 复制到剪贴板给外部AI助手用的完整提示词——跟服务端aiAdvisor云函数的SYSTEM_PROMPT是
// 同一套"雪球法/雪崩法"分析框架，但去掉了"追问建议marker"这类只有我们自己前端才认识的
// 输出格式要求(粘贴给豆包等外部聊天机器人没有意义)，改成第二人称"帮我分析"的措辞。
function buildCopyPrompt(): string {
  const summary = window.__azBridge.buildAiSummary();
  return "你是一位务实、简洁的中文债务分析助手。以下是我的债务概况（JSON，金额单位为元，"
    + "每笔债务的\"还款计划\"是逐期的日期/金额/本金/利息/是否已还）：\n\n"
    + JSON.stringify(summary, null, 2)
    + "\n\n请基于雪球法（先还余额最小的）和雪崩法（先还利率最高的）两种策略帮我分析，"
    + "明确指出优先该还哪一笔最省钱、大致能省多少利息，并给出可执行的还款顺序建议。"
    + "语言口语化、直接、给数字，不要写大段免责声明。";
}

/** 当前月份串，跟云函数的currentMonth()一样按北京时间算，两边必须一致否则跨月那天会打架 */
function currentMonth(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

/** 读本地缓存；月份对不上（跨月了 / 老格式数据）一律当成"不知道"返回null，让服务端说话 */
function loadAiQuota(): AiQuota | null {
  try {
    const raw = localStorage.getItem(AI_USAGE_KEY);
    if (!raw) return null;
    const q = JSON.parse(raw) as Partial<AiQuota>;
    if (!q || q.month !== currentMonth() || typeof q.used !== "number" || typeof q.limit !== "number") return null;
    return { month: q.month, used: q.used, limit: q.limit };
  } catch { return null; }
}
function saveAiQuota(q: AiQuota) {
  try { localStorage.setItem(AI_USAGE_KEY, JSON.stringify(q)); } catch { /* ignore */ }
}
/** 快路径：只有在**确知**已超额时才拦截；不知道就放行，由服务端裁决 */
function quotaExhaustedLocally(): boolean {
  const q = loadAiQuota();
  return !!q && q.used >= q.limit;
}

function loadAiConvos(): AiConversation[] {
  try {
    const raw = localStorage.getItem(AI_CHATLOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}
function saveAiConvos(list: AiConversation[]) {
  try { localStorage.setItem(AI_CHATLOG_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
function newAiConvId(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 追问建议：system prompt要求模型在正文之后另起一段，用这个固定marker+"- "列表追加
// 2~3条追问建议(见aiAdvisor云函数)。hy3不保证严格遵循这个格式，找不到marker就整段当正文、
// 建议列表为空——这不是错误，只是这次没有追问建议可显示，优雅降级。
const SUGGESTION_MARKER = "###SUGGESTIONS###";

function splitSuggestions(text: string): { body: string; suggestions: string[] } {
  const raw = text || "";
  const idx = raw.indexOf(SUGGESTION_MARKER);
  if (idx === -1) return { body: raw, suggestions: [] };
  const body = raw.slice(0, idx).trim();
  const suggestions = raw.slice(idx + SUGGESTION_MARKER.length)
    .split("\n")
    .map((l) => l.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return { body, suggestions };
}

type AiBlock = { type: "ul" | "ol"; items: string[] } | { type: "p"; text: string };
const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUM_RE = /^\s*\d+[.、]\s+(.*)$/;

// 把AI回复的纯文本(可能含markdown风格的"- "/"1. "列表)切成段落/列表块——列表渲染成真正的
// <ul>/<ol>而不是让"- "原样堆在一起。
function parseAiBlocks(text: string): AiBlock[] {
  const lines = (text || "").split("\n");
  const blocks: AiBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const isNum = NUM_RE.test(lines[i]);
    const isBullet = !isNum && BULLET_RE.test(lines[i]);
    if (isNum || isBullet) {
      const type: "ul" | "ol" = isNum ? "ol" : "ul";
      const re = isNum ? NUM_RE : BULLET_RE;
      const items: string[] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type, items });
      continue;
    }
    const paraLines: string[] = [];
    while (i < lines.length && !BULLET_RE.test(lines[i]) && !NUM_RE.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join("\n") });
  }
  return blocks;
}

// 只处理**加粗**这一种行内样式，其余文字交给JSX天然转义(不需要vanilla aiRender()里手动
// esc()那一步——见AGENTS.md"统计"一节"JSX的文本插值天然转义"那条既有结论)。
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    return m ? <strong key={keyPrefix + i}>{m[1]}</strong> : <span key={keyPrefix + i}>{part}</span>;
  });
}

function renderAiText(text: string): ReactNode[] {
  return parseAiBlocks(text).map((b, bi) => {
    if (b.type === "p") return <p className="ai-msg-p" key={bi}>{renderInline(b.text, bi + "-")}</p>;
    const items = b.items.map((it, ii) => <li key={ii}>{renderInline(it, bi + "-" + ii + "-")}</li>);
    return b.type === "ol"
      ? <ol className="ai-msg-list" key={bi}>{items}</ol>
      : <ul className="ai-msg-list" key={bi}>{items}</ul>;
  });
}

function castWand(el: SVGGElement | null) {
  if (!el) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove("cast");
  void el.getBoundingClientRect(); // 强制reflow，连续两次进入空状态也能重新播放(SVGElement没有offsetWidth)
  el.classList.add("cast");
  const handler = () => { el.removeEventListener("animationend", handler); el.classList.remove("cast"); };
  el.addEventListener("animationend", handler);
}

// 重试所需的完整上下文——失败气泡上的"重试"按钮按msgIndex(不是"最后一条")定位要替换的
// 那条气泡，这样即使用户在失败后又问了新问题(错误气泡不再是最后一条)，旧的重试按钮依然
// 精确对应它自己那条气泡，不会误改到别的消息。
interface RetryCtx {
  msgIndex: number;
  recId: string;
  displayQ: string;
  isReportMode: boolean;
  contextHistory: AiChatMessage[];
}

interface DisplayMsg extends AiChatMessage {
  pending?: boolean;
  error?: boolean;
  retryCtx?: RetryCtx;
  suggestions?: string[];
}

export function AiScreen() {
  const isOpen = useAiScreenOpen();
  const [convos, setConvos] = useState<AiConversation[]>(() => loadAiConvos());
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  // "假流式"：回复其实是一次性整段拿到手的(见callAiAdvisor)，revealState只控制这条消息
  // 显示到第几个字符，营造逐字打出来的观感——message.content本身从一开始就是完整正文，
  // 揭示进度只影响这次渲染截取多少，不影响持久化/历史记录里存的内容。
  const [revealState, setRevealState] = useState<{ msgIndex: number; shown: number } | null>(null);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  // 本月额度（服务端权威值的镜像）。初始从localStorage缓存读，每次云函数返回后刷新。
  // null表示"还不知道"——第一次装App、跨月、或缓存被清掉时都是这个状态，此时不显示
  // 剩余次数（不猜一个可能是错的数字），等第一次真实调用回来自然就有了。
  const [quota, setQuota] = useState<AiQuota | null>(() => loadAiQuota());
  const wandRef = useRef<SVGGElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 打字动画的"这一轮"令牌——单纯按msgIndex判断"这个interval还有效吗"在"切到新对话"这个
  // 场景下不够可靠：新对话的消息数组从头计数，新回复的msgIndex完全可能跟旧对话里正在
  // "打字"到一半的那条撞上同一个数字，两个interval会认错状态互相打架。每次真正重置
  // 会话(新对话/加载历史/删除当前对话)都递增这个令牌，interval发现令牌变了就自杀，
  // 不再靠"msgIndex是否相等"这一个不够强的信号。
  const revealTokenRef = useRef(0);

  // 每次打开都重置成欢迎态(照抄vanilla openAiScreen())：清空当前会话+输入框+摇一下魔法棒。
  useEffect(() => {
    if (isOpen) {
      setCurrentConvId(null);
      setMessages([]);
      setInput("");
      revealTokenRef.current++;
      setRevealState(null);
      castWand(wandRef.current);
      // 首次进入AI页面提前弹一次"每日额度+复制提示词退路"说明——之后真撞到20次/天上限时
      // (composeAndSend/onRetry)还会再弹一次，就算这次没复制、以后额度用完了也还有机会。
      // 延迟到魔法棒0.75s的施法动效播完，不然弹窗会正好盖住这个动效最抢眼的那一下。
      let seen = false;
      try { seen = localStorage.getItem(AI_LIMIT_NOTICE_KEY) === "1"; } catch { /* ignore */ }
      if (!seen) {
        const timer = window.setTimeout(() => {
          setLimitModalOpen(true);
          try { localStorage.setItem(AI_LIMIT_NOTICE_KEY, "1"); } catch { /* ignore */ }
        }, LIMIT_NOTICE_DELAY_MS);
        return () => window.clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const el = logRef.current;
    if (el && el.lastElementChild) el.lastElementChild.scrollIntoView({ block: "end" });
    // revealState.shown也在依赖里：气泡在"打字"过程中持续长高，跟着一起滚，不然长回复
    // 打完字之后底部会停在动画开始那一刻的位置，看不到后面新长出来的内容。
  }, [messages.length, revealState?.shown]);

  useEffect(() => {
    window.__azAiHistorySheetBack = () => {
      if (historyOpen) { setHistoryOpen(false); return true; }
      return false;
    };
    return () => { delete window.__azAiHistorySheetBack; };
  }, [historyOpen]);

  useEffect(() => {
    window.__azAiScreenBack = () => {
      if (isOpen) { setHistoryOpen(false); closeAiScreen(); return true; }
      return false;
    };
    return () => { delete window.__azAiScreenBack; };
  }, [isOpen]);

  // 按小段步进"打字"，不是真的一个字一个字调setState(那样渲染次数太多、观感也不会更好)。
  // prefers-reduced-motion时跳过整个动画，直接让revealState保持null——渲染逻辑里
  // revealState为null(或msgIndex对不上)就直接显示完整content，是天然的降级路径。
  const REVEAL_CHUNK = 3;
  const REVEAL_INTERVAL_MS = 16;
  // ⚠️进度用闭包里的普通变量`shown`记(跟runAdvisor里thinkingSeconds那个interval用
  // Date.now()算elapsed同一个思路)，不能靠setRevealState的函数式updater去算"下一个值该是
  // 多少"——React的updater必须是纯函数，可能被多调用一次做一致性检查，而这里在updater里
  // 顺手调了clearInterval这个副作用，真机上没事，但在这次测试里精确复现过一次updater被
  // 重复调用导致clearInterval形同虚设、interval永不停止的bug(shown卡死在一个小值来回震荡)。
  // 拆开之后setRevealState永远只接收一个算好的普通值，clearInterval只在外层回调(不是
  // updater内部)调用，不再有副作用混进updater。
  function startReveal(msgIndex: number, fullText: string) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!fullText) return;
    const token = ++revealTokenRef.current;
    let shown = 0;
    setRevealState({ msgIndex, shown });
    const timer = window.setInterval(() => {
      if (revealTokenRef.current !== token) { window.clearInterval(timer); return; }
      shown = Math.min(shown + REVEAL_CHUNK, fullText.length);
      if (shown >= fullText.length) {
        window.clearInterval(timer);
        setRevealState(null);
        return;
      }
      setRevealState({ msgIndex, shown });
    }, REVEAL_INTERVAL_MS);
  }

  function startNewConversation() {
    setHistoryOpen(false);
    setCurrentConvId(null);
    setMessages([]);
    revealTokenRef.current++;
    setRevealState(null);
    castWand(wandRef.current);
  }

  function loadConversation(rec: AiConversation) {
    setCurrentConvId(rec.id);
    setMessages(rec.messages.map((m) => ({ role: m.role, content: m.content })));
    setHistoryOpen(false);
    revealTokenRef.current++;
    setRevealState(null);
  }

  async function onDeleteConv(rec: AiConversation, e: MouseEvent) {
    e.stopPropagation();
    const ok = await window.__azBridge.confirmAsync("删除这条对话", "删除后无法恢复，确定继续吗？");
    if (!ok) return;
    setConvos((prev) => {
      const list = prev.filter((c) => c.id !== rec.id);
      saveAiConvos(list);
      return list;
    });
    if (rec.id === currentConvId) {
      setCurrentConvId(null);
      setMessages([]);
      revealTokenRef.current++;
      setRevealState(null);
      castWand(wandRef.current);
    }
  }

  // 真正调云函数、按msgIndex原地更新那一条气泡——composeAndSend(新提问)和onRetry(重试
  // 已失败的那条)共用这一个执行体，区别只是msgIndex/recId/contextHistory从哪来。
  async function runAdvisor(msgIndex: number, recId: string, displayQ: string, isReportMode: boolean, contextHistory: AiChatMessage[]) {
    setBusy(true);
    setThinkingSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setThinkingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    try {
      const res = await window.__azBridge.callAiAdvisor(isReportMode ? "report" : "chat", isReportMode ? "" : displayQ, contextHistory);
      const text = res.text;
      // 用服务端返回的权威额度刷新本地缓存（不再本地自增——服务端才是唯一真相）
      if (res.quota) { setQuota(res.quota); saveAiQuota(res.quota); }
      // 追问建议只在展示层保留(DisplayMsg.suggestions)，持久化进convos的是剥离掉
      // marker之后的干净正文——历史对话reload回来后不会残留字面的"###SUGGESTIONS###"文字，
      // 代价是重新打开一条历史对话不会恢复它当时的追问建议(这是刻意的，见下面显示建议
      // 那段注释)。
      const { body, suggestions } = splitSuggestions(text);
      setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { role: "assistant", content: body, suggestions } : m)));
      startReveal(msgIndex, body);
      setConvos((prev) => {
        let list = prev.map((c) => {
          if (c.id !== recId) return c;
          let msgs = [...c.messages, { role: "assistant" as const, content: body }];
          if (msgs.length > AI_CHATLOG_MAX_MSGS) msgs = msgs.slice(-AI_CHATLOG_MAX_MSGS);
          return { ...c, messages: msgs, updatedAt: Date.now() };
        });
        const rec = window.findAiConv(list, recId);
        if (rec) window.bumpAiConvTop(list, rec);
        if (list.length > AI_CHATLOG_MAX_CONVOS) list = list.slice(0, AI_CHATLOG_MAX_CONVOS);
        saveAiConvos(list);
        return list;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI 分析失败";
      // 服务端判定超额（本地快路径没拦住：缓存被清过/跨月了/多设备用的同一个账号）——
      // 除了照常显示错误气泡，还要把额度说明弹窗弹出来，那里有"复制提示词"这条退路。
      const e = err as { code?: string; quota?: AiQuota };
      if (e && e.quota) { setQuota(e.quota); saveAiQuota(e.quota); }
      if (e && e.code === "QUOTA_EXCEEDED") setLimitModalOpen(true);
      setMessages((prev) => prev.map((m, i) => (i === msgIndex
        ? { role: "assistant", content: msg, error: true, retryCtx: { msgIndex, recId, displayQ, isReportMode, contextHistory } }
        : m)));
      // 这轮失败了：如果是刚创建的新对话、从没成功回复过，就把这条空壳记录撤销掉，不然
      // 历史列表里会出现一条只有用户提问、AI从没真正回过的"僵尸对话"(照抄vanilla逻辑，
      // 失败分支不调用saveAiConvos()——这条记录本来就还没真正持久化过)。
      setConvos((prev) => {
        const rec = window.findAiConv(prev, recId);
        if (rec && rec.messages.length <= 1) {
          setCurrentConvId(null);
          return prev.filter((c) => c.id !== recId);
        }
        return prev;
      });
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  // 统一入口：快捷芯片(生成报告/两个常见问题)、追问建议芯片和手输都走这里，displayQ是
  // 气泡里显示的文字，isReportMode决定调云函数时用mode=report还是mode=chat(report模式
  // question不生效，但气泡里仍然显示"生成分析报告"这句话，跟用户真的问了这句话视觉上一致)。
  async function composeAndSend(displayQ: string, isReportMode: boolean) {
    if (busy) return;
    // 快路径：本地缓存**确知**本月额度已满就直接弹说明弹窗(带"复制提示词"退路)，
    // 省掉一次必然被服务端拒的往返。缓存不确定(跨月/被清过/老格式)时放行，由服务端裁决，
    // 那条路径在runAdvisor的catch里同样会弹这个弹窗。
    if (quotaExhaustedLocally()) { setLimitModalOpen(true); return; }

    const existingRec = currentConvId ? window.findAiConv(convos, currentConvId) : null;
    const contextHistory: AiChatMessage[] = existingRec
      ? existingRec.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }))
      : [];
    const recId = existingRec ? existingRec.id : newAiConvId();
    const messagesWithUser: AiChatMessage[] = [...(existingRec ? existingRec.messages : []), { role: "user", content: displayQ }];

    setConvos((prev) => {
      if (existingRec) return prev.map((c) => (c.id === recId ? { ...c, messages: messagesWithUser } : c));
      const rec: AiConversation = { id: recId, title: displayQ, isReport: isReportMode, updatedAt: Date.now(), messages: messagesWithUser };
      return [rec, ...prev];
    });
    if (!existingRec) setCurrentConvId(recId);
    const msgIndex = messages.length + 1; // 这次append的[user, assistant-pending]里，assistant那条的下标
    setMessages((prev) => [...prev, { role: "user", content: displayQ }, { role: "assistant", content: "", pending: true }]);

    await runAdvisor(msgIndex, recId, displayQ, isReportMode, contextHistory);
  }

  // 失败气泡上的"重试"：原地把那条气泡打回pending、用当时的原始参数重新调用，不重新
  // 追加一条用户提问(避免同一个问题在气泡列表和历史记录里出现两遍)。
  function onRetry(ctx: RetryCtx) {
    if (busy) return;
    // 快路径：本地缓存**确知**本月额度已满就直接弹说明弹窗(带"复制提示词"退路)，
    // 省掉一次必然被服务端拒的往返。缓存不确定(跨月/被清过/老格式)时放行，由服务端裁决，
    // 那条路径在runAdvisor的catch里同样会弹这个弹窗。
    if (quotaExhaustedLocally()) { setLimitModalOpen(true); return; }
    setMessages((prev) => prev.map((m, i) => (i === ctx.msgIndex ? { role: "assistant", content: "", pending: true } : m)));
    runAdvisor(ctx.msgIndex, ctx.recId, ctx.displayQ, ctx.isReportMode, ctx.contextHistory);
  }

  // 弹窗里"复制完整分析提示词"——复制成功后弹窗故意不自动关闭(万一想再读一遍说明或
  // 重新复制一次)，靠用户自己点"知道了"关掉，跟"确认后自动收起"这种一次性操作不是一回事。
  async function onCopyPrompt() {
    try {
      await navigator.clipboard.writeText(buildCopyPrompt());
      window.__azBridge.toast("已复制，可以粘贴给其他AI助手了");
    } catch {
      window.__azBridge.toast("复制失败，请重试");
    }
  }

  function onSendFromInput() {
    const v = input.trim();
    if (!v) { window.__azBridge.toast("请输入你想问的问题"); return; }
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "";
    composeAndSend(v, false);
  }
  function onInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 90) + "px";
  }
  function onInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendFromInput(); }
  }

  const showWelcome = messages.length === 0;
  // 追问建议芯片只挂在"最后一条、已经完成、没出错"的AI回复下面——历史对话里较早的
  // 回复不会显示(避免陈旧建议跟当前对话对不上)，新问题一发出去(变成pending/新的最后一条)
  // 这一组芯片自然消失，不需要额外状态去手动隐藏。
  const lastMsg = messages[messages.length - 1];
  const lastIsRevealing = !!revealState && revealState.msgIndex === messages.length - 1;
  const showSuggestions = !busy && !lastIsRevealing && !!lastMsg && lastMsg.role === "assistant" && !lastMsg.pending && !lastMsg.error
    && !!lastMsg.suggestions && lastMsg.suggestions.length > 0;

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="aiScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={() => { setHistoryOpen(false); closeAiScreen(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">AI 债务助手</div>
        <button type="button" className="subpage-back" aria-label="历史对话" onClick={() => setHistoryOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></svg>
        </button>
      </div>
      <div className="ai-thread">
        {showWelcome ? (
          <div className="ai-welcome" id="aiWelcome">
            <div className="ai-welcome-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M3 8A2.3 2.3 0 0 1 5.3 5.7h7A2.3 2.3 0 0 1 14.6 8v5.5A2.3 2.3 0 0 1 12.3 15.8H8.3l-3.6 2.7a.45.45 0 0 1-.72-.36V15.8A2.3 2.3 0 0 1 1.7 13.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                <g className="wand" ref={wandRef} fill="currentColor">
                  <path d="M21 7L10 0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  <path d="M10 -3.15L11.05 -1.05L13.15 0L11.05 1.05L10 3.15L8.95 1.05L6.85 0L8.95 -1.05Z" />
                  <circle cx={12.6} cy={-2.4} r={0.75} /><circle cx={7.2} cy={1.8} r={0.6} />
                </g>
              </svg>
            </div>
            <h2>有什么想聊的？</h2>
            <p>我能看到你当前的在还债务，可以帮你排优先级、测算利息，或者直接问我一个具体问题。</p>
            {/* quota为null(还不知道)时整行不渲染——不猜一个可能是错的数字给用户看 */}
            {quota && (
              <div className="ai-quota-note">
                本月还剩 <strong>{Math.max(0, quota.limit - quota.used)}</strong> / {quota.limit} 次
              </div>
            )}
            <div className="ai-chips">
              <button type="button" className="ai-chip primary" onClick={() => composeAndSend("生成分析报告", true)}>
                <span className="ai-chip-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V10M12 19V5M20 19v-7" /></svg></span>
                生成分析报告
              </button>
              <button type="button" className="ai-chip" onClick={() => composeAndSend("我该先还哪一笔？", false)}>
                <span className="ai-chip-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={9} /><path d="M12 7v5l3.5 2" /></svg></span>
                我该先还哪一笔？
              </button>
              <button type="button" className="ai-chip" onClick={() => composeAndSend("怎样最快还清所有债务？", false)}>
                <span className="ai-chip-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg></span>
                怎样最快还清所有债务？
              </button>
            </div>
          </div>
        ) : (
          <div id="aiChatLog" className="ai-chat-log" ref={logRef}>
            {messages.map((m, i) => (
              <div key={i} className={"ai-msg " + (m.role === "user" ? "user" : "bot") + (m.pending ? " pending" : "")}>
                {m.pending ? (
                  <>思考中{thinkingSeconds > 0 ? ` ${thinkingSeconds}s` : ""}<span className="ai-typing-dots"><span /><span /><span /></span></>
                ) : m.error ? (
                  <div className="ai-error-wrap">
                    <span style={{ color: "var(--critical)" }}>{m.content}</span>
                    {m.retryCtx && (
                      <button type="button" className="ai-retry-btn" onClick={() => onRetry(m.retryCtx!)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M21 12a9 9 0 1 1-3-6.7M21 3v5h-5" /></svg>
                        重试
                      </button>
                    )}
                  </div>
                ) : renderAiText(revealState && revealState.msgIndex === i ? m.content.slice(0, revealState.shown) : m.content)}
              </div>
            ))}
          </div>
        )}
      </div>
      {showSuggestions && (
        <div className="ai-suggest-row">
          {lastMsg!.suggestions!.map((s, i) => (
            <button key={i} type="button" className="ai-suggest-chip" onClick={() => composeAndSend(s, false)}>{s}</button>
          ))}
        </div>
      )}
      <div className="ai-composer">
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="发消息给 AI 债务助手…"
          value={input}
          onChange={onInputChange}
          onKeyDown={onInputKeyDown}
        />
        <button type="button" className="ai-send-btn" aria-label="发送" disabled={busy} onClick={onSendFromInput}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </div>

      <div className={"scrim" + (historyOpen ? " open" : "")} id="scrimAiHistory" onClick={() => setHistoryOpen(false)} />
      <div className={"sheet" + (historyOpen ? " open" : "")} id="aiHistorySheet" role="dialog" aria-modal="true" aria-labelledby="aiHistoryTitle">
        <div className="grip" />
        {/* 滚动放在这层、不放在.sheet上——.sheet同时有圆角+overflow:auto+transform时
            会被判定成不透明合成滚动层，深色模式下圆角处会露白底(见www/index.html里
            .sheet那段注释)。grip留在这层外面，拖动条永远在顶部不被内容滚走。 */}
        <div className="sheet-scroll">
          <div className="ai-hist-head">
            <h2 id="aiHistoryTitle">历史对话</h2>
            <button type="button" className="ai-hist-new-btn" onClick={startNewConversation}>新对话</button>
          </div>
          <div id="aiHistoryList">
            {convos.length === 0 ? (
              <div className="footnote" style={{ textAlign: "left" }}>还没有历史对话——问过一次之后会出现在这里</div>
            ) : (
              convos.map((rec) => (
                <div className="backup-row" style={{ cursor: "pointer" }} key={rec.id}>
                  <div className="backup-row-main" onClick={() => loadConversation(rec)}>
                    <div className="backup-row-time">{rec.title}</div>
                    <div className="backup-row-sub">{new Date(rec.updatedAt).toLocaleString()} · {rec.messages.length} 条消息</div>
                  </div>
                  <div className="backup-row-actions">
                    <button type="button" className="btn danger" onClick={(e) => onDeleteConv(rec, e)}>删除</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <AiLimitModal open={limitModalOpen} onClose={() => setLimitModalOpen(false)} onCopy={onCopyPrompt} />
    </div>
  );
}
