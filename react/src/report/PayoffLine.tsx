// 负债预测走势——手写SVG折线+面积图，直译自vanilla renderPayoffLine(data)（www/index.html）。
// 坐标/路径数学原样照抄，不做任何"更React"的改写（SVG本身就是声明式标记，JSX直接对应）。
import type { ReportData } from "../types";

export interface PayoffLineProps {
  data: ReportData;
}

export function PayoffLine({ data }: PayoffLineProps) {
  const pts = data.timeline;
  const n = pts.length;
  if (n < 2 || data.totalBalance <= 0) {
    return (
      <div className="viz-block">
        <div className="viz-title">负债预测走势</div>
        <div className="footnote" style={{ textAlign: "left" }}>暂无足够数据（没有在还债务或还款计划）</div>
      </div>
    );
  }
  const W = 300, H = 110, padT = 10, padB = 18;
  const maxBal = pts[0].balance || 1;
  const coords = pts.map((p, i) => [(i / (n - 1)) * W, padT + (1 - p.balance / maxBal) * (H - padT - padB)] as const);
  const line = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
  const area = line + " L" + coords[n - 1][0].toFixed(1) + "," + (H - padB) + " L0," + (H - padB) + " Z";
  return (
    <div className="viz-block">
      <div className="viz-title">负债预测走势（按现有还款计划推算）</div>
      <svg className="viz-line-svg" viewBox={`0 0 ${W} ${H}`}>
        <path d={area} fill="var(--accent-soft)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <circle cx={coords[n - 1][0].toFixed(1)} cy={coords[n - 1][1].toFixed(1)} r={3} fill="var(--accent)" />
        <text className="viz-line-label" x={4} y={H - 4}>今天 ¥{window.fmt(pts[0].balance)}</text>
        <text className="viz-line-label" x={W} y={H - 4} textAnchor="end">{pts[n - 1].date} 还清</text>
      </svg>
    </div>
  );
}
