// 提前还款收益模拟器——第八步(React迁移收尾)从vanilla的#simScreen原样复刻。SIM_KEY(模式+
// 上次用的金额)整体移交React所有权，直接读写localStorage(硬性铁律第1条的键名不能改)，跟
// debtSort当年"没有别的地方依赖它，整体移交"是同一个先例——这里不经过__azBridge。
// simulatePrepay()仍然是calc.js全局纯函数，直接window.simulatePrepay(...)调用。
import { useEffect, useState } from "react";
import { closeSimScreen, useDebts, useSimScreenId } from "../shared/state";

const SIM_KEY = "after-zero-simulate-v1";

interface SimPrefs {
  mode: "once" | "recurring";
  extra: number;
}

function loadSimPrefs(): SimPrefs {
  try {
    const raw = localStorage.getItem(SIM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { mode: parsed.mode === "recurring" ? "recurring" : "once", extra: +parsed.extra || 0 };
    }
  } catch (e) { /* ignore */ }
  return { mode: "once", extra: 0 };
}
function saveSimPrefs(prefs: SimPrefs) {
  try { localStorage.setItem(SIM_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
}

interface SimResultView {
  monthsSaved: number;
  interestSaved: number;
  baseMonths: number;
  newMonths: number;
  mode: "once" | "recurring";
  atPeriod: number;
  extra: number;
  monthly: number;
  rate: number;
}

export function SimScreen() {
  const openId = useSimScreenId();
  const debts = useDebts();
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [mode, setMode] = useState<"once" | "recurring">("once");
  const [extra, setExtra] = useState("");
  const [atPeriod, setAtPeriod] = useState("1");
  // result是运行那一刻的快照(含mode/atPeriod/extra)——原vanilla runSimulate()把这几个值
  // 直接拼进结果HTML字符串，用户运行后再改输入框，展示的结果文案不会跟着实时变，这里
  // 同样不从当前mode/extra/atPeriod状态派生展示文案，避免"结果和刚才点算的不一致"。
  const [result, setResult] = useState<SimResultView | null>(null);

  useEffect(() => {
    if (openId !== null) {
      setDisplayId(openId);
      const prefs = loadSimPrefs();
      setMode(prefs.mode);
      setExtra(prefs.extra ? String(prefs.extra) : "");
      setAtPeriod("1");
      setResult(null);
    }
  }, [openId]);

  // 债务在模拟器开着的时候消失(删除/结清后被恢复流程覆盖等)——自动关闭，跟DetailSheet.tsx/
  // EditSheet.tsx同一个模式，按id(不是下标)判断是否还在。这个screen以前没有这层保护，是这次
  // 引入债务id字段后顺手补上的一个小修复，见CLAUDE.md"债务对象加了真正的id字段"一节。
  useEffect(() => {
    if (openId !== null && !debts.some((x) => x.id === openId)) {
      closeSimScreen();
    }
  });

  useEffect(() => {
    window.__azSimScreenBack = () => {
      if (openId !== null) { closeSimScreen(); return true; }
      return false;
    };
    return () => { delete window.__azSimScreenBack; };
  }, [openId]);

  const isOpen = openId !== null;
  const d = displayId !== null ? debts.find((x) => x.id === displayId) : undefined;
  const maxPeriod = d ? (d.terms || 1) : 1;

  function onRun() {
    if (!d) return;
    const extraNum = +extra || 0;
    const atPeriodNum = Math.max(1, Math.min(maxPeriod, Math.round(+atPeriod) || 1));
    if (extraNum <= 0) { window.__azBridge.toast("请输入大于 0 的多还金额"); return; }
    saveSimPrefs({ mode, extra: extraNum });
    const r = window.simulatePrepay(d, mode, atPeriodNum, extraNum);
    if (!r) { window.__azBridge.toast("月供不足以覆盖利息，无法测算"); return; }
    setResult({ ...r, mode, atPeriod: atPeriodNum, extra: extraNum, monthly: d.monthly, rate: d.rate });
  }

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="simScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeSimScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">提前还款模拟器</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="data-card">
          <h3>{d ? d.name : ""}</h3>
          <p>模拟提前多还一笔钱，看看能省多少利息、提前多久还清（按当前月供、推算年化利率测算，实际以银行/平台真实计算为准）。</p>
        </div>
        <div className="premium-tabs" role="tablist" style={{ marginBottom: 14 }}>
          <button type="button" className={"premium-tab" + (mode === "once" ? " active" : "")} role="tab" aria-selected={mode === "once"} onClick={() => setMode("once")}>单次多还</button>
          <button type="button" className={"premium-tab" + (mode === "recurring" ? " active" : "")} role="tab" aria-selected={mode === "recurring"} onClick={() => setMode("recurring")}>每期多还</button>
        </div>
        <div className="field"><label htmlFor="simExtra">多还金额 ¥ <span className="req">*</span></label><input id="simExtra" type="number" step="0.01" min="0" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
        <div className="field"><label htmlFor="simAtPeriod">从第几期开始 <span className="req">*</span></label><input id="simAtPeriod" type="number" min="1" inputMode="numeric" value={atPeriod} onChange={(e) => setAtPeriod(e.target.value)} /></div>
        <button type="button" className="btn primary" style={{ width: "100%" }} onClick={onRun}>开始测算</button>
        <div style={{ marginTop: 18 }}>
          {result && d ? (
            <>
              <div className="summary">
                <div className="kpi half"><div className="v num">{Math.max(0, result.monthsSaved)} 个月</div><div className="k">提前还清</div></div>
                <div className="kpi half"><div className="v num">¥{window.fmt(Math.max(0, result.interestSaved))}</div><div className="k">节省利息</div></div>
              </div>
              <div className="footnote" style={{ textAlign: "left" }}>
                按当前月供 ¥{window.fmt(result.monthly)}、推算年化 {result.rate ? Number(result.rate).toFixed(2) : 0}% 模拟：原计划约 {result.baseMonths} 个月还清；
                {result.mode === "recurring" ? `从第 ${result.atPeriod} 期起每期多还` : `第 ${result.atPeriod} 期多还一次`} ¥{window.fmt(result.extra)} 后，约 {result.newMonths} 个月还清。
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
