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
// · 配色：本金=var(--ch-principal)绿、利息=var(--ch-interest)琥珀。**2026-07-30改过一轮**：
//   原来是同一色相的两级(--accent/--accent-mid)，实测相邻对比只有 3.01(浅)/2.30(深)，
//   深色那档低于相邻填充要求的 3:1，而且对红绿色盲几乎不可分辨。同色两级在浅色下有死结——
//   两者都要 ≥3:1 对白底就只能都很深，反而更闷。改成绿(本金)/琥珀(利息)两个色相之后
//   四项校验全过：相邻 3.10(浅)/3.06(深)、各自对底 ≥3、色盲模拟距离 120(浅)/191(深)
//   ——原来同色系两级的色盲距离近乎 0，红绿色盲基本分不出两段。语义上"利息=成本"也更清楚。
// · 2px surface gap 分隔堆叠的两段、以及相邻的柱子——**不画描边**(anti-pattern: 用border分隔marks)。
// · 柱子 ≤24px 粗，顶端 4px 圆角、底端方角贴基线。
// · 网格线是 1px 实线(anti-pattern: 虚线网格会被读成"预测/阈值")，颜色一步off-surface。
// · 两个系列 → 图例常驻；直接标注只给峰值一个▲记号，不给每根柱子标数字(anti-pattern)。
// · 文字一律用 text token，绝不穿 series 颜色。
// · 逾期**不做成同一条值轴上的柱子**：①它是status不是时间桶，②逾期金额可能远大于任何单月，
//   混进同一个scale会把12根柱子压扁。改成图表上方一条 --critical 提示行，并明说"未计入下方"。
// · 每个数值都不只靠手势才能读到(anti-pattern: tooltip as the only way to read a value)——
//   Y轴刻度 + 摘要行 + 点击展开的当月债务组成 + 导出Excel/PDF 四条路径都能拿到具体数字。
import { useState } from "react";
import type { UpcomingPressure } from "../types";

export interface PressureChartProps {
  data: UpcomingPressure;
}

// 每根柱子在"需要横向滚动"时占的宽度(24px柱身 + 2px间隙)。窗口短、容器装得下时不会用到
// 这个值——轨道是 width:100% + min-width:count*COL_W，装得下就铺满、装不下才溢出滚动。
const COL_W = 26;

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

// "2026-08" → "26年8月"。**每个月都带年份**：窗口现在最长能到60个月、必然跨好几年，
// 只有1月带年份(改之前的写法)的话，滑到后面看到"9月待还"根本分不清是哪一年的9月——
// 真机上第一时间就被指出来了。用两位年份而不是"2026年8月"，是因为这几个标签挤在
// readout行和摘要行里，短一点不容易换行。
// 这个用在readout/摘要行/当月债务组成标题(都有足够宽度)；x轴上用下面的monthTick()，
// 只写月份数字——那里每个刻度只有约24px，塞不下年份，跨年靠柱子上那条竖分隔线区分。
function monthLabel(m: string): string {
  return m.slice(2, 4) + "年" + (+m.slice(5, 7)) + "月";
}
// x轴刻度只写月份数字。12根柱子的间距约24px，"9"/"12"这种1~2字符稳稳放得下，所以**每个月都标**——
// 原来只标i%3===0那4个，"哪根柱子是9月"得靠自己数，是真实的可用性问题。跨年靠1月柱子左边
// 那条竖分隔线表达，不靠把某个标签写成"27年1月"(那个标签宽度是别人的2.5倍，必然撞上邻居)。
function monthTick(m: string): string {
  return String(+m.slice(5, 7));
}

export function PressureChart({ data }: PressureChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const months = data.months;
  const n = months.length;

  const hasAny = data.totalAhead > 0 || data.overdue.count > 0;
  if (!n || !hasAny) {
    return (
      <div className="viz-block">
        <div className="viz-title">未来还款压力</div>
        <div className="footnote" style={{ textAlign: "left" }}>未来没有待还款项</div>
      </div>
    );
  }

  const idx = activeIndex !== null ? Math.min(Math.max(activeIndex, 0), n - 1) : 0;
  const active = months[idx];
  const top = niceCeil(Math.max(...months.map((m) => m.total))) || 1;
  const peakIdx = data.peak ? months.findIndex((m) => m.month === data.peak!.month) : -1;
  const activeSplit = active.principal + active.interest;

  // ⚠️柱子的总高度必须由 total(=这个月实际要还的钱，也就是Y轴的口径)决定，本金/利息只负责
  // **按比例切分**这根柱子——不能让两段各自按 principal/top、interest/top 独立算高度。
  // 原因：PlanRow 的 amount 和 principal+interest 在正常生成的计划里相等，但手动逐行编辑时
  // PlanRows.tsx 的"金额"输入框是可以单独改的(不联动本金/利息)，两者一旦对不上，独立算高度
  // 会让柱子画到 total/top 之外——实测过一个极端例子：amount=100 而 principal+interest=2194，
  // 柱子高度算出来是 2194%，整根冲出画布(.pchart-stack 没有 overflow:hidden，也不该有——
  // 裁掉只是把错误藏起来)。按比例切分则永远落在 total 之内，且正常数据下结果完全一致。
  function segHeights(m: (typeof months)[number]) {
    const barPct = (m.total / top) * 100;
    const split = m.principal + m.interest;
    if (split <= 0) return { pH: barPct, iH: 0 }; // 只填了金额没拆本息：整根按本金色画
    return { pH: barPct * (m.principal / split), iH: barPct * (m.interest / split) };
  }

  return (
    <div className="viz-block">
      <div className="viz-title-row">
        <div className="viz-title">未来还款压力</div>
        {/* 两个系列必须常驻图例——身份不能只靠颜色区分 */}
        <div className="pchart-legend">
          <span><i className="sw principal" />本金</span>
          <span><i className="sw interest" />利息</span>
        </div>
      </div>

      <div className="pchart-stats">
        <div><div className="k">本月待还</div><div className="v num">¥{window.fmt(months[0].total)}</div></div>
        <div><div className="k">{n}个月共</div><div className="v num">¥{window.fmt(data.totalAhead)}</div></div>
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
          <span className="sub">未计入下方</span>
        </div>
      )}

      <div className="viz-scrub-readout">
        {monthLabel(active.month)}待还 ¥{window.fmt(active.total)}
        {activeSplit > 0 && (
          <span className="dim">（本金 ¥{window.fmt(active.principal)} · 利息 ¥{window.fmt(active.interest)}）</span>
        )}
      </div>

      {/* 窗口不再固定12个月(见calc.js的pressureWindowMonths)，装不下就横向滚动。
          ⚠️柱子和x轴标签必须放在**同一个**滚动容器里——分成两个各自滚动的容器，滑动时
          标签和柱子会错位；而Y轴刻度线/刻度值要留在滚动容器**外面**(.pchart-grid)，
          横滑时刻度是不动的参照系，跟着一起滑就失去意义了。
          手势上这里刻意**不用chartScrub那套Touch Events**：横滑已经被原生滚动占用，
          再叠一层拦截滚动的scrub会直接打架。读数改成点柱子(离散选择，跟BalanceBars/
          TypeStack同一类轻交互)，PayoffLine那张连续折线图继续用scrub，不受影响。 */}
      <div className="pchart">
        <div className="pchart-viewport">
          <div className="pchart-grid">
            {[0, 0.5, 1].map((f) => (
              <div key={f} className="chart-gridline" style={{ bottom: f * 100 + "%" }}>
                <span className="num">{f === 0 ? "0" : window.fmt(top * f)}</span>
              </div>
            ))}
          </div>
          <div className="pchart-scroll">
            <div className="pchart-track" style={{ minWidth: n * COL_W }}>
              <div className="pchart-bars">
                {months.map((m, i) => {
                  const { pH, iH } = segHeights(m);
                  return (
                    <button
                      type="button"
                      key={m.month}
                      aria-label={monthLabel(m.month) + "待还 ¥" + window.fmt(m.total)}
                      onClick={() => setActiveIndex(i === activeIndex ? null : i)}
                      className={
                        "pchart-col" + (i === idx ? " active" : "") + (i === 0 ? " is-current" : "") +
                        // 1月柱子左边一条竖分隔线表示跨年（x轴标签只写月份数字，年份靠这条线区分）
                        (m.month.slice(5, 7) === "01" && i > 0 ? " year-break" : "")
                      }
                    >
                      {i === peakIdx && <span className="pchart-peak" aria-hidden="true" />}
                      <div className="pchart-stack">
                        <div className="seg principal" style={{ height: pH + "%" }} />
                        <div className={"seg interest" + (iH <= 0 ? " zero" : "")} style={{ height: iH + "%" }} />
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* x轴标签band在容器内部，不靠固定高度挤掉它(anti-pattern)。每个月都标(只写数字，
                  约24px的柱距放得下)，跨年靠柱子上那条竖分隔线区分，见monthTick()的注释。 */}
              <div className="chart-xaxis">
                {months.map((m, i) => (
                  <div key={m.month} className={"chart-xtick" + (i === idx ? " active" : "")}>
                    {monthTick(m.month)}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
