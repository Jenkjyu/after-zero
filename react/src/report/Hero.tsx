// 统计tab的石墨hero卡+KPI头，替代原来的Kpis.tsx（本轮删除）。复用现有.hero/.summary/
// .kpi/.note-toggle/.footnote类名，不发明新的配色系统。
//
// hero-amt/hero-pill故意不复刻"债务"tab hero已有的"距归零进度"进度条(debts/Summary.tsx的
// hero-prog)——那张hero已经在展示完全相同的一份数据(s.pct/s.paidPrincipal)，"统计"tab的
// hero改用"总额+还清时间"这个组合，跟"债务"tab的hero(总额+进度%)形成差异化定位。
import { useState } from "react";
import type { Debt, Premium, ReportData } from "../types";
import { InfoTip } from "../shared/InfoTip";
import { ExportMenu } from "./ExportMenu";

export interface HeroProps {
  data: ReportData;
  debts: Debt[];
  premium: Premium;
}

export function Hero({ data, debts, premium }: HeroProps) {
  const s = window.summarizeDebts(debts);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="hero">
      <div className="hero-top">
        <div className="hero-label">统计</div>
        <ExportMenu premium={premium} />
      </div>
      <div className="hero-amt num"><span className="cur">¥</span>{window.fmt(data.totalBalance)}</div>
      <div className="hero-pill">预计 {data.payoffDate || "—"} 还清</div>

      <div className="summary" style={{ marginTop: 14 }}>
        <div className="kpi half">
          <div className="v num">{data.avgRate ? data.avgRate.toFixed(2) : "0.00"}%</div>
          <div className="k">
            加权平均利率{" "}
            <InfoTip text="按各笔债务当前余额加权平均后的利率——余额越大的债务，对这个数字的影响越大，不是几笔利率的简单平均。" />
          </div>
        </div>
        <div className="kpi half">
          <div className="v num">¥{window.fmt(s.monthly)}</div>
          <div className="k">经常性月供</div>
        </div>
      </div>

      <button type="button" className="note-toggle" onClick={() => setExpanded((v) => !v)}>
        更多指标
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="summary" style={{ marginTop: 10 }}>
          <div className="kpi">
            <div className="v num">¥{window.fmt(s.paidPrincipal)}</div>
            <div className="k">已还金额</div>
            <div className="kpi-sub num">另付利息 ¥{window.fmt(s.paidInterest)}</div>
          </div>
          <div className="kpi">
            <div className="v num">{s.active}</div>
            <div className="k">在还笔数</div>
          </div>
          <div className="kpi">
            <div className="v num" style={{ color: "var(--good)" }}>{s.settled}</div>
            <div className="k">已结清</div>
          </div>
          <div className="kpi">
            <div className="v num">{s.pct}%</div>
            <div className="k">归零进度</div>
          </div>
        </div>
      )}
    </div>
  );
}
