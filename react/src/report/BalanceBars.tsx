// 各债务余额对比——横向条形图，直译自vanilla renderBalanceBars(data)（www/index.html）。
// JSX文本插值自动转义，不需要像vanilla字符串拼接那样手动调esc()，这是纯粹的简化，不是行为变化。
//
// 这轮（统计tab视觉+交互升级）加了轻量点击高亮——离散分类数据（每行本来就是完整的一个值，
// 不是能"划过中间任意一点"的连续序列），普通onClick就够，不需要chartScrub.ts那套Touch
// Events重手势基础设施（那是给MonthlyChart/PayoffLine这类连续时间序列图准备的）。
import { useState } from "react";
import type { ReportData } from "../types";

export interface BalanceBarsProps {
  data: ReportData;
}

export function BalanceBars({ data }: BalanceBarsProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  if (!data.byName.length) {
    return (
      <div className="viz-block">
        <div className="viz-title">各债务余额对比</div>
        <div className="footnote" style={{ textAlign: "left" }}>暂无在还债务</div>
      </div>
    );
  }
  const max = Math.max(...data.byName.map((x) => x.balance)) || 1;
  return (
    <div className="viz-block">
      <div className="viz-title">各债务余额对比</div>
      {data.byName.map((x, i) => {
        const pct = Math.max(2, Math.round((x.balance / max) * 100));
        return (
          <div
            className={"viz-bar-row" + (activeIdx === i ? " active" : "")}
            key={i}
            onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
          >
            <div className="viz-bar-name">{window.truncateLabel(x.name, 10)}</div>
            <div className="viz-bar-track"><div className="viz-bar-fill" style={{ width: pct + "%" }} /></div>
            <div className="viz-bar-val num">¥{window.fmt(x.balance)}</div>
          </div>
        );
      })}
    </div>
  );
}
