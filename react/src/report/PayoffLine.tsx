// 负债预测走势——手写SVG折线+面积图，直译自vanilla renderPayoffLine(data)（www/index.html）。
// 坐标/路径数学原样照抄，不做任何"更React"的改写（SVG本身就是声明式标记，JSX直接对应）。
//
// 这轮（统计tab视觉+交互升级）接入chartScrub.ts共享手势：原来两个静态<text>标签（"今天¥X"/
// "date还清"）换成同一套viz-scrub-readout，activeIndex为null时兜底显示今天余额/最终还清日
// （等同于原来的静态效果），拖动/点击图表可以查看曲线中间任意一点的精确值。释放手指后数字
// 停留在最后scrub到的那个点，不自动回弹——这样用户抬手后还能看清刚才划到的数字。
import { useEffect, useRef, useState } from "react";
import type { ReportData } from "../types";
import { attachChartScrub } from "./chartScrub";

export interface PayoffLineProps {
  data: ReportData;
}

export function PayoffLine({ data }: PayoffLineProps) {
  const pts = data.timeline;
  const n = pts.length;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || n < 2) return;
    return attachChartScrub(el, { count: n, onIndexChange: setActiveIndex });
  }, [n]);

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
  const idx = activeIndex !== null ? Math.min(Math.max(activeIndex, 0), n - 1) : null;
  const active = idx !== null ? pts[idx] : null;
  const activeCoord = idx !== null ? coords[idx] : null;
  return (
    <div className="viz-block">
      <div className="viz-title">负债预测走势（按现有还款计划推算）</div>
      <div className="viz-scrub-readout">
        {active
          ? `${active.date} 预计剩余 ¥${window.fmt(active.balance)}`
          : `今天 ¥${window.fmt(pts[0].balance)} · ${pts[n - 1].date} 还清`}
      </div>
      <div ref={chartRef}>
        <svg className="viz-line-svg" viewBox={`0 0 ${W} ${H}`}>
          <path d={area} fill="var(--accent-soft)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} />
          <circle cx={coords[n - 1][0].toFixed(1)} cy={coords[n - 1][1].toFixed(1)} r={3} fill="var(--accent)" />
          {activeCoord && (
            <g>
              <line x1={activeCoord[0].toFixed(1)} y1={padT} x2={activeCoord[0].toFixed(1)} y2={H - padB} stroke="var(--hair)" strokeWidth={1} />
              <circle cx={activeCoord[0].toFixed(1)} cy={activeCoord[1].toFixed(1)} r={4} fill="var(--accent)" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
