// 月还款统计——统计tab新增的第4张图，按月展示已还(actual)/待还(scheduled)两段金额，
// 柱状/折线可切换，共用chartScrub.ts的press+drag连续scrub手势（跟PayoffLine.tsx同一类，
// 是连续时间序列，"读不准确切值"是真实痛点，不是BalanceBars/TypeStack那种离散分类）。
//
// 数据源computeMonthlyRepayment(debts)故意不塞进computeReportData()的返回对象，见calc.js
// 里的注释——那个对象被exportReportXlsx/exportReportPdf按字段名精确解构，新维度必须独立。
import { useEffect, useRef, useState } from "react";
import type { MonthlyRepayment } from "../types";
import { attachChartScrub } from "./chartScrub";

export interface MonthlyChartProps {
  months: MonthlyRepayment[];
}

export function MonthlyChart({ months }: MonthlyChartProps) {
  const [mode, setMode] = useState<"bar" | "line">("bar");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const n = months.length;

  useEffect(() => {
    const el = chartRef.current;
    if (!el || n < 1) return;
    return attachChartScrub(el, { count: n, onIndexChange: setActiveIndex });
  }, [n]);

  if (!n) {
    return (
      <div className="viz-block">
        <div className="viz-title">月还款统计</div>
        <div className="footnote" style={{ textAlign: "left" }}>暂无还款计划数据</div>
      </div>
    );
  }

  const idx = activeIndex !== null ? Math.min(Math.max(activeIndex, 0), n - 1) : n - 1;
  const active = months[idx];
  const maxTotal = Math.max(...months.map((m) => m.actual + m.scheduled)) || 1;

  const W = 300, H = 110, padT = 10, padB = 18;
  const xFor = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const yFor = (v: number) => padT + (1 - v / maxTotal) * (H - padT - padB);
  const actualLine = months.map((m, i) => (i === 0 ? "M" : "L") + xFor(i).toFixed(1) + "," + yFor(m.actual).toFixed(1)).join(" ");
  const scheduledLine = months.map((m, i) => (i === 0 ? "M" : "L") + xFor(i).toFixed(1) + "," + yFor(m.scheduled).toFixed(1)).join(" ");

  return (
    <div className="viz-block">
      <div className="viz-title-row">
        <div className="viz-title">月还款统计</div>
        <div className="viz-mode-toggle">
          <button type="button" className={"viz-mode-btn" + (mode === "bar" ? " active" : "")} aria-label="柱状图" onClick={() => setMode("bar")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 20V10M12 20V4M19 20v-7" />
            </svg>
          </button>
          <button type="button" className={"viz-mode-btn" + (mode === "line" ? " active" : "")} aria-label="折线图" onClick={() => setMode("line")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16 9 9l5 4 6-8" />
            </svg>
          </button>
        </div>
      </div>
      <div className="viz-scrub-readout">
        {active.month} 已还 ¥{window.fmt(active.actual)} 待还 ¥{window.fmt(active.scheduled)}
      </div>
      <div ref={chartRef}>
        {mode === "bar" ? (
          <div className="viz-monthly-bars">
            {months.map((m, i) => {
              const actualH = (m.actual / maxTotal) * 100;
              const scheduledH = (m.scheduled / maxTotal) * 100;
              return (
                <div key={m.month} className={"viz-monthly-col" + (idx === i ? " active" : "")}>
                  <div className="viz-monthly-col-track">
                    <div className="viz-monthly-seg-actual" style={{ height: actualH + "%" }} />
                    <div className="viz-monthly-seg-scheduled" style={{ height: scheduledH + "%", bottom: actualH + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <svg className="viz-line-svg" viewBox={`0 0 ${W} ${H}`}>
            <path d={scheduledLine} fill="none" stroke="var(--accent-soft)" strokeWidth={2} strokeDasharray="4 3" />
            <path d={actualLine} fill="none" stroke="var(--accent)" strokeWidth={2} />
            <g>
              <line x1={xFor(idx).toFixed(1)} y1={padT} x2={xFor(idx).toFixed(1)} y2={H - padB} stroke="var(--hair)" strokeWidth={1} />
              <circle cx={xFor(idx).toFixed(1)} cy={yFor(active.actual).toFixed(1)} r={3.5} fill="var(--accent)" />
              <circle cx={xFor(idx).toFixed(1)} cy={yFor(active.scheduled).toFixed(1)} r={3.5} fill="var(--accent-soft)" />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
