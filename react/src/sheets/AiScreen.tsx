// AI 债务顾问——第十一步(React迁移收尾)从vanilla的#aiScreen+#aiHistorySheet原样复刻，
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
import type { AiChatMessage, AiConversation } from "../types";

const AI_USAGE_KEY = "after-zero-ai-usage-v1";
const AI_DAILY_LIMIT = 20;
const AI_CHATLOG_KEY = "after-zero-ai-chatlog-v1";
const AI_CHATLOG_MAX_CONVOS = 50;
const AI_CHATLOG_MAX_MSGS = 40;

interface AiUsage { date: string; count: number }

function loadAiUsage(): AiUsage {
  try {
    const raw = localStorage.getItem(AI_USAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { date: "", count: 0 };
}
function saveAiUsage(u: AiUsage) {
  try { localStorage.setItem(AI_USAGE_KEY, JSON.stringify(u)); } catch { /* ignore */ }
}
function aiUsageToday(): AiUsage {
  const t = window.fmtDate(window.today0());
  const u = loadAiUsage();
  return u.date === t ? u : { date: t, count: 0 };
}
function aiUsageLeft(): number {
  return Math.max(0, AI_DAILY_LIMIT - aiUsageToday().count);
}
function bumpAiUsage() {
  const u = aiUsageToday();
  u.count++;
  saveAiUsage(u);
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

// 极轻量渲染：只处理**加粗**，其余文字交给JSX天然转义(不需要vanilla aiRender()里手动esc()
// 那一步——见CLAUDE.md"统计"一节"JSX的文本插值天然转义"那条既有结论)。
function renderAiText(text: string): ReactNode[] {
  return (text || "").split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{part}</span>;
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

interface DisplayMsg extends AiChatMessage {
  pending?: boolean;
  error?: boolean;
}

export function AiScreen() {
  const isOpen = useAiScreenOpen();
  const [convos, setConvos] = useState<AiConversation[]>(() => loadAiConvos());
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const wandRef = useRef<SVGGElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 每次打开都重置成欢迎态(照抄vanilla openAiScreen())：清空当前会话+输入框+摇一下魔法棒。
  useEffect(() => {
    if (isOpen) {
      setCurrentConvId(null);
      setMessages([]);
      setInput("");
      castWand(wandRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const el = logRef.current;
    if (el && el.lastElementChild) el.lastElementChild.scrollIntoView({ block: "end" });
  }, [messages.length]);

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

  function startNewConversation() {
    setHistoryOpen(false);
    setCurrentConvId(null);
    setMessages([]);
    castWand(wandRef.current);
  }

  function loadConversation(rec: AiConversation) {
    setCurrentConvId(rec.id);
    setMessages(rec.messages.map((m) => ({ role: m.role, content: m.content })));
    setHistoryOpen(false);
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
      castWand(wandRef.current);
    }
  }

  // 统一入口：快捷芯片(生成报告/两个常见问题)和手输都走这里，displayQ是气泡里显示的文字，
  // isReportMode决定调云函数时用mode=report还是mode=chat(report模式question不生效，
  // 但气泡里仍然显示"生成分析报告"这句话，跟用户真的问了这句话视觉上一致)。
  async function composeAndSend(displayQ: string, isReportMode: boolean) {
    if (busy) return;
    if (aiUsageLeft() <= 0) { window.__azBridge.toast("今日 AI 分析次数已用完，明天再来"); return; }
    setBusy(true);

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
    setMessages((prev) => [...prev, { role: "user", content: displayQ }, { role: "assistant", content: "", pending: true }]);

    try {
      const text = await window.__azBridge.callAiAdvisor(isReportMode ? "report" : "chat", isReportMode ? "" : displayQ, contextHistory);
      bumpAiUsage();
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { role: "assistant", content: text } : m)));
      setConvos((prev) => {
        let list = prev.map((c) => {
          if (c.id !== recId) return c;
          let msgs = [...c.messages, { role: "assistant" as const, content: text }];
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
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { role: "assistant", content: msg, error: true } : m)));
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
      setBusy(false);
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

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="aiScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={() => { setHistoryOpen(false); closeAiScreen(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">AI 债务顾问</div>
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
                  <>思考中<span className="ai-typing-dots"><span /><span /><span /></span></>
                ) : m.error ? (
                  <span style={{ color: "var(--critical)" }}>{m.content}</span>
                ) : renderAiText(m.content)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ai-composer">
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="发消息给 AI 债务顾问…"
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
  );
}
