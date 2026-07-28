// 负债预测走势——手写SVG折线+面积图。
//
// ⚠️X轴按**真实时间比例**排布，不是按数组下标等距。原来是 x = (i/(n-1))*W，导致：
//   · 折线的斜率完全没有意义（同样陡的一段，可能是一个月也可能是两年）
//   · 密集期（多笔债务同期还款、时间线上点多）横向被拉宽，长尾期被压窄
//   · "突然下降后长期水平"这个真实反馈就是这么来的——短期债务集中还完那段点很密占了很宽的
//     画布，剩一笔长债之后每月一个点、本金又小，看起来就是一条长长的缓坡
// 时间比例之后，斜率才真正代表"还债速度"，这是这张图存在的意义。
//
// ⚠️数据是**预测**不是历史：timeline 由 computeReportData() 从"今天的总余额"出发、按现有还款
// 计划里每一期的本金逐笔递减推算出来的。这个App**不保存任何历史余额快照**，所以画不出"原计划
// vs 实际"的对比，也画不出真实的历史曲线。标题和角标必须说清楚这一点，不能把预测包装成历史。
//
// timeline 里可能出现两个日期同为"今天"的点（逾期未销的期次被归到今天，见calc.js里
// computeReportData 的注释）——在时间轴上它们x坐标相同，表现为起点处一条垂直的陡降，
// 这是刻意的：逾期的钱今天就该还。
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

  const W = 300, H = 110;
  const t0 = window.parseDate(pts[0].date)!.getTime();
  const tEnd = window.parseDate(pts[n - 1].date)!.getTime();
  const span = tEnd - t0;
  // span为0是所有未还期次都在今天（全部逾期）这种极端情况——退回等距，不做除零。
  const xFor = (i: number) =>
    span > 0 ? ((window.parseDate(pts[i].date)!.getTime() - t0) / span) * W : (i / (n - 1)) * W;
  const top = window.niceCeil(pts[0].balance) || 1;
  const yFor = (bal: number) => (1 - bal / top) * H;

  const coords = pts.map((p, i) => [xFor(i), yFor(p.balance)] as const);
  const line = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
  const area = line + ` L${coords[n - 1][0].toFixed(1)},${H} L${coords[0][0].toFixed(1)},${H} Z`;
  const idx = activeIndex !== null ? Math.min(Math.max(activeIndex, 0), n - 1) : null;
  const active = idx !== null ? pts[idx] : null;
  const activeCoord = idx !== null ? coords[idx] : null;

  // x轴3个时间刻度：起点(今天)、时间中点、终点(还清)。中点取真实时间的一半，不是数组中位数。
  const midDate = window.fmtDate(new Date(t0 + span / 2)).slice(0, 7);

  return (
    <div className="viz-block">
      <div className="viz-title-row">
        <div className="viz-title">负债余额走势</div>
        <span className="viz-tag">预测</span>
      </div>
      <div className="viz-scrub-readout">
        {active
          ? `${active.date} 预计剩余 ¥${window.fmt(active.balance)}`
          : `今天 ¥${window.fmt(pts[0].balance)} · 预计 ${pts[n - 1].date} 还清`}
      </div>
      <div className="chart">
        <div className="chart-plot" style={{ height: 118 }}>
          {[0, 0.5, 1].map((f) => (
            <div key={f} className="chart-gridline" style={{ bottom: f * 100 + "%" }}>
              <span className="num">{f === 0 ? "0" : window.fmt(top * f)}</span>
            </div>
          ))}
          {/* ⚠️SVG和覆盖在它上面的圆点必须共用同一个坐标系。.chart-plot有34px的刻度槽
              (padding-left)，而绝对定位子元素的百分比是相对**含padding的整宽**算的——
              直接把圆点放在.chart-plot下面用left:X%，左端会偏34px、右端才对得上。
              chart-area这层就是"真正的绘图区"，SVG和圆点都挂在它里面，scrub手势也绑在它
              身上(否则手指落点映射到的索引同样整体偏34px，最左边那个点几乎点不到)。 */}
          <div className="chart-area" ref={chartRef}>
          <svg className="viz-line-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <path d={area} fill="var(--accent-soft)" />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {activeCoord && (
              <line
                x1={activeCoord[0].toFixed(1)} y1={0} x2={activeCoord[0].toFixed(1)} y2={H}
                stroke="var(--text-faint)" strokeWidth={1} vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* 端点/scrub点用HTML圆点而不是SVG circle——preserveAspectRatio="none"会把viewBox
              非等比拉伸，SVG里的圆会被拉成椭圆（路径不受影响，圆才受影响）。 */}
          <span className="chart-dot" style={{ left: `${(coords[n - 1][0] / W) * 100}%`, bottom: `${(1 - coords[n - 1][1] / H) * 100}%` }} />
          {activeCoord && (
            <span className="chart-dot active" style={{ left: `${(activeCoord[0] / W) * 100}%`, bottom: `${(1 - activeCoord[1] / H) * 100}%` }} />
          )}
          </div>
        </div>
        <div className="chart-xaxis chart-xaxis-spread">
          <span>今天</span>
          <span>{midDate}</span>
          <span>{pts[n - 1].date.slice(0, 7)}</span>
        </div>
      </div>
      <div className="footnote" style={{ textAlign: "left", marginTop: 8, padding: 0 }}>
        按现有还款计划推算，不含提前还款；本App不保存历史余额，这条线不是实际走过的轨迹。
      </div>
    </div>
  );
}
