// 多策略对比规划——2026-08-04新增，第七次做完"React 迁移"之后又一个直接用
// window.simulateRepaymentOrder(calc.js全局纯函数)的新screen，模式完全照抄SimScreen.tsx：
// 全局布尔开关(不需要债务id参数，操作对象是全部在还债务的组合，见shared/state.ts)。
//
// 入口在"统计"tab(react/src/report/Conclusions.tsx，见StrategyCta.tsx)，跟这个文件
// 是完全独立的两棵React树("report"入口 vs "sheets"入口)，跨树触发跟DetailSheet/EditSheet
// 当年的架构问题是同一类。
//
// "自定义顺序"用上下移动按钮而不是拖拽——这批债务列表通常<15项，按钮比touch drag更可靠，
// 也不需要重新实现"在还债务"tab那套为jiggle模式+swipe写的复杂手势状态机(那套代码假设
// 长按进编辑模式、同时还要处理左滑露出按钮，这里只是纯排序，没有那些交互，硬套gestures.ts
// 反而容易出错)。
import { useEffect, useMemo, useState } from "react";
import { closeStrategyScreen, useDebts, useStrategyScreenOpen } from "../shared/state";
import { StrategyChart } from "./StrategyChart";
import type { StrategyChartSeries } from "./StrategyChart";

type SimResult = ReturnType<typeof window.simulateRepaymentOrder>;

interface StrategyDef {
  key: "snowball" | "avalanche" | "custom";
  label: string;
  dotClass: "s1" | "s2" | "s3";
  order: string[];
  sim: SimResult;
}

export function StrategyCompareScreen() {
  const isOpen = useStrategyScreenOpen();
  const debts = useDebts();
  // simulateRepaymentOrder只需要{id,balance,rate,monthly}，直接传完整Debt对象没问题
  // (结构类型兼容，多余字段被忽略)。
  const active = useMemo(() => debts.filter((d) => window.isActive(d)), [debts]);

  const [extraInput, setExtraInput] = useState("");
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  // ran是运行那一刻的快照(extra+自定义顺序)——跟SimScreen.tsx同一个既有约定："结果是
  // 运行那一刻的快照"，用户点了"开始对比"之后再改输入框，已经显示的结果不会跟着实时变，
  // 避免用户以为看到的数字反映的是当前输入框的值。
  const [ran, setRan] = useState<{ extra: number; order: string[] } | null>(null);

  // 每次打开重置：清空额外投入、自定义顺序默认=当前在还债务的数组顺序、清空上次的结果。
  useEffect(() => {
    if (isOpen) {
      setExtraInput("");
      setCustomOrder(active.map((d) => d.id));
      setRan(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    window.__azStrategyScreenBack = () => {
      if (isOpen) { closeStrategyScreen(); return true; }
      return false;
    };
    return () => { delete window.__azStrategyScreenBack; };
  }, [isOpen]);

  function moveOrder(idx: number, dir: -1 | 1) {
    setCustomOrder((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp;
      return next;
    });
  }

  function onRun() {
    if (active.length < 2) return;
    setRan({ extra: Math.max(0, +extraInput || 0), order: customOrder });
  }

  const strategies: StrategyDef[] = useMemo(() => {
    if (!ran) return [];
    const snowOrder = window.snowballOrder(active);
    const avaOrder = window.avalancheOrder(active);
    return [
      { key: "snowball", label: "雪球法·先还余额最小的", dotClass: "s1", order: snowOrder,
        sim: window.simulateRepaymentOrder(active, snowOrder, ran.extra) },
      { key: "avalanche", label: "雪崩法·先还利率最高的", dotClass: "s2", order: avaOrder,
        sim: window.simulateRepaymentOrder(active, avaOrder, ran.extra) },
      { key: "custom", label: "你排的自定义顺序", dotClass: "s3", order: ran.order,
        sim: window.simulateRepaymentOrder(active, ran.order, ran.extra) },
    ];
    // active在ran快照生成的那一刻就已经决定了排序内容，这里重新读最新的active是故意的——
    // 如果用户在结果展示期间改了债务数据(比如还了一期)，对比结果应该跟着刷新到最新余额，
    // 不应该停留在"运行那一刻"的旧数字上；ran只固定"额外投入"和"自定义顺序"这两个用户输入。
  }, [ran, active]);

  const valid = strategies.filter((s): s is StrategyDef & { sim: NonNullable<SimResult> } => !!s.sim);
  const allFailed = ran !== null && valid.length === 0;
  const bestKey = valid.length
    ? valid.reduce((a, b) => (a.sim.totalInterest <= b.sim.totalInterest ? a : b)).key
    : null;
  const today = window.today0();

  const chartSeries: StrategyChartSeries[] = valid.map((s) => ({
    key: s.key,
    dotClass: s.dotClass,
    points: [
      { month: 0, balance: active.reduce((sum, d) => sum + (+d.balance || 0), 0) },
      ...s.sim.monthly.map((m) => ({ month: m.month, balance: m.balance })),
    ],
  }));
  const chartLabels: Record<string, string> = { snowball: "雪球法", avalanche: "雪崩法", custom: "自定义" };

  return (
    <div className={"subpage" + (isOpen ? " open" : "")} id="strategyCompareScreen">
      <div className="subpage-header">
        <button type="button" className="subpage-back" aria-label="返回" onClick={closeStrategyScreen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="subpage-title">多策略对比规划</div>
        <div className="subpage-header-spacer" />
      </div>
      <div className="subpage-body">
        <div className="data-card">
          <h3>该按什么顺序还？</h3>
          <p>对比雪球法（先还余额最小的，见效快、容易坚持）、雪崩法（先还利率最高的，总利息最省）和你自己排的顺序——一笔还完，它的月供会自动滚去加速下一笔（雪球效应）。</p>
        </div>

        {active.length < 2 ? (
          <div className="footnote" style={{ textAlign: "left" }}>
            至少要有 2 笔在还债务才有"顺序"可比——你现在{active.length === 0 ? "没有在还债务" : "只有 1 笔在还债务"}。
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="stratExtra">每月额外投入 ¥（不分给哪笔，整体滚给排在最前的那笔，不填按 0 算）</label>
              <input id="stratExtra" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0" value={extraInput} onChange={(e) => setExtraInput(e.target.value)} />
            </div>

            <div className="field">
              <label>自定义顺序（上下移动排列，越靠前越优先集中火力还）</label>
              <div>
                {customOrder.map((id, idx) => {
                  const d = active.find((x) => x.id === id);
                  if (!d) return null;
                  return (
                    <div className="strat-order-row" key={id}>
                      <span className="strat-order-idx">{idx + 1}</span>
                      <span className="strat-order-name">{d.name || "未命名"}</span>
                      <span className="strat-order-bal">¥{window.fmt(d.balance)}</span>
                      <span className="strat-order-moves">
                        <button type="button" className="strat-order-btn" aria-label="上移" disabled={idx === 0} onClick={() => moveOrder(idx, -1)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                        </button>
                        <button type="button" className="strat-order-btn" aria-label="下移" disabled={idx === customOrder.length - 1} onClick={() => moveOrder(idx, 1)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button type="button" className="btn primary" style={{ width: "100%" }} onClick={onRun}>对比这三种策略</button>

            {allFailed && (
              <div className="footnote" style={{ textAlign: "left", marginTop: 12 }}>
                有一笔债务的月供覆盖不了它自己的利息，本金永远还不完，没法测算——先去把那笔债务的月供调高一些再来试。
              </div>
            )}

            {valid.length > 0 && (
              <div style={{ marginTop: 18 }}>
                {strategies.map((s) => {
                  if (!s.sim) {
                    return (
                      <div className="strat-result-row" key={s.key}>
                        <span className={"strat-dot " + s.dotClass} />
                        <span className="strat-result-name">{s.label}</span>
                        <span className="strat-result-nums"><div className="k">月供不够利息，无法测算</div></span>
                      </div>
                    );
                  }
                  const payoffDate = window.fmtDate(window.addMonths(today, s.sim.months));
                  return (
                    <div className={"strat-result-row" + (s.key === bestKey ? " best" : "")} key={s.key}>
                      <span className={"strat-dot " + s.dotClass} />
                      <span className="strat-result-name">
                        {s.label}
                        {s.key === bestKey && <span className="best-badge">总利息最省</span>}
                      </span>
                      <span className="strat-result-nums">
                        <div className="kk">总利息</div>
                        <div className="v">¥{window.fmt(s.sim.totalInterest)}</div>
                        <div className="k">{payoffDate} 还清 · {s.sim.months} 个月</div>
                      </span>
                    </div>
                  );
                })}

                {valid.length > 1 && (
                  <div className="footnote" style={{ textAlign: "left", marginTop: 10 }}>
                    {(() => {
                      const worst = valid.reduce((a, b) => (a.sim.totalInterest >= b.sim.totalInterest ? a : b));
                      const best = valid.find((s) => s.key === bestKey)!;
                      const saved = worst.sim.totalInterest - best.sim.totalInterest;
                      const monthsSaved = worst.sim.months - best.sim.months;
                      if (saved <= 0.5 && Math.abs(monthsSaved) < 1) return "这三种顺序在你当前的数据下差别不大。";
                      return `按${best.label.split("·")[0]}排序，比最费的那种顺序省 ¥${window.fmt(saved)} 利息${monthsSaved > 0 ? `、早 ${monthsSaved} 个月还清` : ""}。`;
                    })()}
                  </div>
                )}

                {chartSeries.length > 0 && <StrategyChart series={chartSeries} labels={chartLabels} />}

                <div className="footnote" style={{ textAlign: "left" }}>
                  测算按当前各笔债务的剩余本金/推算年化利率/月供做标准等额本息模拟，不追等本等费/先息后本等生成方式各自的逐行数学，实际以银行/平台真实计算为准。
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
