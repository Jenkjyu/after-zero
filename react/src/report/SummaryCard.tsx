// 统计总结——页面底部的收尾卡片，替代原来那4张平铺的裸<table>明细表（P1删除）。
//
// 设计原则：**只放这一页别处看不到的结论**，不复述上面已经有的数字。逐条的理由：
//   · 利率最高的是哪一笔 —— 上面的条形图默认按余额排（虽然能切到"利率"，但那要用户主动去点），
//     "最贵的钱是哪笔"是这一页最该直接给出的一个结论。
//   · 高息(≥18%)笔数与合计 —— 18%这个阈值不是这里新发明的，是calc.js里rateClass()一直在用的
//     既有分档（.rate-hi），跟债务卡片上的红色严重度色晕是同一条线。
//   · 剩余待付利息合计 —— 全页唯一回答"还要为这些债务再付出多少"的数字。
//   · 距离还清还有多久 —— hero只给了"预计X还清"这个日期，换算成"还有N个月"更有体感。
//
// 刻意**不做"查看全部债务 >"跳转按钮**：tabbar就在屏幕底部、一步可达，为此新增一个跨React树
// 切tab的桥接不划算（切tab目前是vanilla tabbar的职责，React这边没有入口）。
import { useMemo } from "react";
import type { Debt, ReportData } from "../types";

export interface SummaryCardProps {
  data: ReportData;
  /** computeUpcomingPressure 的12个月合计——跟压力图同一份数据，不重复算 */
  totalAhead: number;
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

export function SummaryCard({ data, totalAhead }: SummaryCardProps) {
  const active = data.active;

  const s = useMemo(() => {
    let top: Debt | null = null;
    let highCount = 0, highBalance = 0, restInterest = 0;
    active.forEach((d) => {
      if (!top || (+d.rate || 0) > (+top.rate || 0)) top = d;
      if (window.rateClass(+d.rate || 0) === "rate-hi") { highCount++; highBalance += +d.balance || 0; }
      restInterest += window.remainingInterest(d);
    });
    return { top: top as Debt | null, highCount, highBalance, restInterest: window.r2(restInterest) };
  }, [active]);

  if (!active.length) return null;

  const payoff = data.payoffDate ? window.parseDate(data.payoffDate) : null;
  const monthsLeft = payoff ? monthsBetween(window.today0(), payoff) : null;

  return (
    <div className="viz-block">
      <div className="viz-title">统计总结</div>
      <div className="sumcard-row">
        <span className="k">在还债务</span>
        <span className="v num">{active.length} 笔 · ¥{window.fmt(data.totalBalance)}</span>
      </div>
      {s.top && (
        <div className="sumcard-row">
          <span className="k">利率最高</span>
          <span className="v">
            {window.truncateLabel(s.top.name, 10)}
            <b className={"sumcard-rate " + window.rateClass(+s.top.rate || 0)}>{(+s.top.rate || 0).toFixed(2)}%</b>
          </span>
        </div>
      )}
      <div className="sumcard-row">
        <span className="k">高息债务（年化 ≥18%）</span>
        <span className="v num">
          {s.highCount ? `${s.highCount} 笔 · ¥${window.fmt(s.highBalance)}` : "没有"}
        </span>
      </div>
      <div className="sumcard-row">
        <span className="k">剩余待付利息</span>
        <span className="v num">¥{window.fmt(s.restInterest)}</span>
      </div>
      <div className="sumcard-row">
        <span className="k">未来12个月要还</span>
        <span className="v num">¥{window.fmt(totalAhead)}</span>
      </div>
      <div className="sumcard-row">
        <span className="k">预计还清</span>
        <span className="v num">
          {data.payoffDate ? data.payoffDate + (monthsLeft !== null ? `（约 ${monthsLeft} 个月后）` : "") : "—"}
        </span>
      </div>
      <div className="footnote" style={{ textAlign: "left", marginTop: 10, padding: 0 }}>
        利率由每笔债务的还款计划反推（IRR）；剩余待付利息按现有计划算到还清为止，手动录入且没拆分本金/利息的债务会低估。
      </div>
    </div>
  );
}
