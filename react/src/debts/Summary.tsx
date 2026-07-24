// 石墨hero卡(在还总负债+距归零进度条) + 2x2 KPI网格 + 计算口径说明折叠面板——
// 原样搬自 renderSummary()，聚合数字改由calc.js的summarizeDebts()算(这次迁移新抽出来的
// 纯函数，见www/js/calc.js)，样式全部复用现有全局<style>里的.hero/.kpi/.footnote等类。
import { useState } from "react";
import type { Debt, Premium } from "../types";
import { AiBanner } from "./AiBanner";

export interface SummaryProps {
  debts: Debt[];
  premium: Premium;
  onAiBannerClick: () => void;
}

export function Summary({ debts, premium, onAiBannerClick }: SummaryProps) {
  const s = window.summarizeDebts(debts);
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div id="topSummary">
      <div className="hero" id="heroCard">
        <div className="hero-smoke" aria-hidden="true">
          <span className="hero-puff a" /><span className="hero-puff b" /><span className="hero-puff c" />
        </div>
        <div className="hero-top">
          <div className="hero-label">在还总负债</div>
          <div className="hero-pill">只算本金</div>
        </div>
        <div className="hero-amt num"><span className="cur">¥</span>{window.fmt(s.total)}</div>
        <div className="hero-prog">
          <div className="hero-prog-track"><div className="hero-prog-fill" style={{ width: s.pct + "%" }} /></div>
          <div className="hero-prog-row">
            <span className="l num">已归还本金 ¥{window.fmt(s.paidPrincipal)}</span>
            <span className="r num">已完成 {s.pct}%</span>
          </div>
        </div>
      </div>

      <div className="summary" id="summary">
        <div className="kpi">
          <div className="v num">¥{window.fmt(s.paidPrincipal)}</div>
          <div className="k">已还金额</div>
          <div className="kpi-sub num">另付利息 ¥{window.fmt(s.paidInterest)}</div>
        </div>
        <div className="kpi">
          <div className="v num">¥{window.fmt(s.monthly)}</div>
          <div className="k">经常性月供</div>
          <div className="kpi-sub">不含一次性还清</div>
        </div>
        <div className="kpi">
          <div className="v num">{s.active}</div>
          <div className="k">在还笔数</div>
        </div>
        <div className="kpi">
          <div className="v num" style={{ color: "var(--good)" }}>{s.settled}</div>
          <div className="k">已结清</div>
        </div>
      </div>

      <AiBanner premium={premium} onClick={onAiBannerClick} />

      <button type="button" className="note-toggle" id="sumNoteToggle" onClick={() => setNoteOpen((v) => !v)}>
        计算口径说明
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        className="footnote"
        id="sumNote"
        style={{ display: noteOpen ? "" : "none", marginTop: -2, marginBottom: 16, textAlign: "left", padding: "0 2px" }}
      >
        在还总负债 = 各未结清债务「未还本金」之和（只算本金、不含未来利息/手续费）。<br />
        已还金额 = 各未结清债务「已还期数」的本金之和；另付利息 = 这些已还期数对应的利息/手续费之和（两者都不含已结清的债务）。<br />
        经常性月供 = 各笔下一期应还之和（不含标记为「一次性还清」的借款）。
      </div>
    </div>
  );
}
