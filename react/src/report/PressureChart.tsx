// 未来12个月还款压力——替代原来的"月还款统计"(MonthlyChart.tsx，本轮删除)。
//
// 为什么换掉旧图：月还款是"按月份统计的离散金额"，旧图默认折线模式在语义上就是错的(折线暗示
// 连续变量)，而且它把4类数据混在一张图里——过去已还 + 过去逾期未还 + 未来待还 + 已结清债务的
// 幽灵待还(那是BUG-1)，没有"今天"这条分界线，也没有任何金额/月份刻度，用户看完得不出结论。
// 这张图只回答一个问题：**接下来12个月，哪个月最难过**。
//
// 数据源 computeUpcomingPressure(debts, 12)：只算在还债务、逾期单独成桶、窗口从当前月起固定
// 12个月、金额拆本金/利息两段(手续费没有独立字段，不做第三段)，见 www/js/calc.js。
//
// ===== 图表规范(照 dataviz skill，逐条对照过 references/marks-and-anatomy.md 和 anti-patterns.md) =====
// · 配色：本金=var(--accent)、利息=var(--accent-mid)，同一个色相的两级(part-whole组合用sequential
//   不用categorical)。**这两级是跑 scripts/validate_palette.js 验出来的，不是眼看挑的**——
//   原来的 --accent-soft 在浅色是 #E7F3F1，对白底对比度只有 1.14:1，等于隐形(旧图靠一条虚线
//   上边框硬撑才看得见)。新的两级在两个模式下都是对底色 ≥3:1、彼此 normal-vision ΔE ≥21。
// · 2px surface gap 分隔堆叠的两段、以及相邻的柱子——**不画描边**(anti-pattern: 用border分隔marks)。
// · 柱子 ≤24px 粗，顶端 4px 圆角、底端方角贴基线。
// · 网格线是 1px 实线(anti-pattern: 虚线网格会被读成"预测/阈值")，颜色一步off-surface。
// · 两个系列 → 图例常驻；直接标注只给峰值一个▲记号，不给每根柱子标数字(anti-pattern)。
// · 文字一律用 text token，绝不穿 series 颜色。
// · 逾期**不做成同一条值轴上的柱子**：①它是status不是时间桶，②逾期金额可能远大于任何单月，
//   混进同一个scale会把12根柱子压扁。改成图表上方一条 --critical 提示行，并明说"未计入下方"。
// · 每个数值都不只靠手势才能读到(anti-pattern: tooltip as the only way to read a value)——
//   Y轴刻度 + 摘要行 + 点击展开的当月债务组成 + 导出Excel/PDF 四条路径都能拿到具体数字。
import { useEffect, useRef, useState } from "react";
import type { UpcomingPressure } from "../types";
import { attachChartScrub } from "./chartScrub";

export interface PressureChartProps {
  data: UpcomingPressure;
}

// Y轴刻度取整到"好看数字"，否则刻度会是 ¥1,733 这种没法快速心算的值。档位要够细——
// 只有 1/2/2.5/5/10 的话，最大月2,760会被抬到5,000，最高的柱子只有半格高，一眼看过去
// 12根柱子全是矮的，白白浪费一半画布。加上1.5/3/4/6/8之后2,760落到3,000，且这些档位
// 的一半(1.5k/2k/3k/4k)也都是整数，中间那条刻度线不会出现1,250这种零头。
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  return (NICE_STEPS.find((s) => n <= s) || 10) * mag;
}

// "2026-08" → "8月"。1月带上年份("27年1月")——12个月的窗口必然跨年，光写"1月"夹在
// "10月"和"4月"中间看不出是哪一年；只在1月这一处标年，不是每个标签都带，避免轴变吵。
function monthLabel(m: string): string {
  const mo = +m.slice(5, 7);
  return mo === 1 ? m.slice(2, 4) + "年1月" : mo + "月";
}

export function PressureChart({ data }: PressureChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const months = data.months;
  const n = months.length;

  useEffect(() => {
    const el = plotRef.current;
    if (!el || n < 1) return;
    return attachChartScrub(el, { count: n, onIndexChange: setActiveIndex });
  }, [n]);

  const hasAny = data.totalAhead > 0 || data.overdue.count > 0;
  if (!n || !hasAny) {
    return (
      <div className="viz-block">
        <div className="viz-title">未来12个月还款压力</div>
        <div className="footnote" style={{ textAlign: "left" }}>未来12个月没有待还款项</div>
      </div>
    );
  }

  const idx = activeIndex !== null ? Math.min(Math.max(activeIndex, 0), n - 1) : 0;
  const active = months[idx];
  const top = niceCeil(Math.max(...months.map((m) => m.total))) || 1;
  const peakIdx = data.peak ? months.findIndex((m) => m.month === data.peak!.month) : -1;

  return (
    <div className="viz-block">
      <div className="viz-title-row">
        <div className="viz-title">未来12个月还款压力</div>
        {/* 两个系列必须常驻图例——身份不能只靠颜色区分 */}
        <div className="pchart-legend">
          <span><i className="sw principal" />本金</span>
          <span><i className="sw interest" />利息</span>
        </div>
      </div>

      <div className="pchart-stats">
        <div><div className="k">本月待还</div><div className="v num">¥{window.fmt(months[0].total)}</div></div>
        <div><div className="k">12个月共</div><div className="v num">¥{window.fmt(data.totalAhead)}</div></div>
        <div><div className="k">月均</div><div className="v num">¥{window.fmt(data.monthlyAvg)}</div></div>
        <div>
          <div className="k">压力最大</div>
          <div className="v num">{data.peak ? monthLabel(data.peak.month) + " ¥" + window.fmt(data.peak.total) : "—"}</div>
        </div>
      </div>

      {data.overdue.count > 0 && (
        <div className="pchart-overdue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5v.01" />
          </svg>
          已逾期 {data.overdue.count} 期 · ¥{window.fmt(data.overdue.amount)}
          <span className="sub">未计入下方12个月</span>
        </div>
      )}

      <div className="viz-scrub-readout">
        {monthLabel(active.month)}待还 ¥{window.fmt(active.total)}
        <span className="dim">（本金 ¥{window.fmt(active.principal)} · 利息 ¥{window.fmt(active.interest)}）</span>
      </div>

      <div className="pchart">
        <div className="pchart-plot" ref={plotRef}>
          {[0, 0.5, 1].map((f) => (
            <div key={f} className="pchart-gridline" style={{ bottom: f * 100 + "%" }}>
              <span className="num">{f === 0 ? "0" : window.fmt(top * f)}</span>
            </div>
          ))}
          <div className="pchart-bars">
            {months.map((m, i) => {
              const pH = (m.principal / top) * 100;
              const iH = (m.interest / top) * 100;
              return (
                <div
                  key={m.month}
                  className={
                    "pchart-col" + (i === idx ? " active" : "") + (i === 0 ? " is-current" : "")
                  }
                >
                  {i === peakIdx && <span className="pchart-peak" aria-hidden="true" />}
                  <div className="pchart-stack">
                    <div className="seg principal" style={{ height: pH + "%" }} />
                    <div className={"seg interest" + (iH <= 0 ? " zero" : "")} style={{ height: iH + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* x轴标签band在容器内部，不靠固定高度挤掉它(anti-pattern)。12根柱子只标4个，
            选择性标注，避免相邻标签撞在一起。当前月和被选中的那一根总是标出来。 */}
        <div className="pchart-xaxis">
          {months.map((m, i) => (
            <div key={m.month} className={"pchart-xtick" + (i === idx ? " active" : "")}>
              {i % 3 === 0 || i === idx ? monthLabel(m.month) : ""}
            </div>
          ))}
        </div>
      </div>

      {active.items.length > 0 && (
        <div className="pchart-breakdown">
          <div className="preview-label" style={{ margin: "0 2px 6px" }}>
            {monthLabel(active.month)}要还的债务
          </div>
          {active.items.map((it) => (
            <div key={it.id} className="pchart-bd-row">
              <span>{window.truncateLabel(it.name, 12)}</span>
              <span className="num">¥{window.fmt(it.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
