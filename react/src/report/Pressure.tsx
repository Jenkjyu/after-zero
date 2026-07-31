// "接下来哪个月最难"——未来还款压力，替代原来的 PressureChart.tsx。
//
// 跟被替换掉的那版比：默认从**堆叠柱**换成**堆叠面积折线**（回答"整体压力曲线什么形状"），
// 柱状那版保留下来做为可切换的第二种画法（回答"逐月分别是多少"）。模式存组件本地 state、
// **不持久化**——重开 App 回到默认的面积图。切换时保留当前选中的月份（换个画法看同一个月，
// 不该把选择清掉）。
//
// ⚠️切换模式时**卡片高度和坐标轴必须纹丝不动**。给"峰值"标注留的头顶空间放在两种模式
// 共用的 .pcanvas（18px），不是只给柱状加——只给一种模式加的话，切过去卡片会整体拉长、
// 刻度线跟着跳（原型阶段真踩过）。也**不能直接给 .achart/.pbars 加 padding**：.achart 里
// 有绝对定位的游标竖线和圆点，它们的 inset/bottom 百分比是相对 **padding box** 算的，
// 一加 padding 整套坐标就偏。所以外壳扛边距，内层绘图区保持纯净的 104px。
//
// ⚠️头顶空间本身不能省：外层 .ascroll 有 overflow-x:auto，而 **overflow-x 一旦不是
// visible，overflow-y 也会被浏览器强制成非 visible**，伸到容器外的标注会被整个裁掉。
//
// ⚠️面积模式的采样点画在 x = i + 0.5、viewBox 宽度取月份数 n —— 正好落在下面 .ahit
// （透明命中格子）和 .axaxis（x 轴刻度）那两排 flex 等分格子的中心，横向滚动时三者永远对齐。
//
// 数据口径（computeUpcomingPressure，见 calc.js）：只算在还债务、逾期单独成桶不混进未来
// 月份、窗口从当前月起 pressureWindowMonths() 个月、金额拆本金/利息两段。
import { useState } from "react";
import type { UpcomingPressure, UpcomingPressureMonth } from "../types";

const P_H = 104;   // 绘图区高度
const P_COL = 26;  // 每个月占的最小宽度，装不下就横向滚动

type PMode = "area" | "bar";

function monthLabel(m: string): string {
  return m.slice(2, 4) + "年" + +m.slice(5, 7) + "月";
}
// x 轴每个刻度只有约 24px，塞不下年份——跨年靠柱子/分隔线表达
function monthTick(m: string): string {
  return String(+m.slice(5, 7));
}
function yuan(n: number): string {
  return "¥" + window.fmt(Math.round(+n || 0));
}

export interface PressureProps {
  data: UpcomingPressure;
}

export function Pressure({ data }: PressureProps) {
  const [mode, setMode] = useState<PMode>("area");
  const [sel, setSel] = useState<number | null>(null);

  const ms = data.months;
  const n = ms.length;
  const hasAny = data.totalAhead > 0 || data.overdue.count > 0;

  if (!n || !hasAny) {
    return (
      <div className="sec">
        <div className="sec-q">接下来哪个月最难</div>
        <h2 className="sec-a">未来没有待还款项</h2>
      </div>
    );
  }

  const top = window.niceCeil(Math.max(...ms.map((m) => m.total))) || 1;
  const idx = sel !== null ? Math.min(Math.max(sel, 0), n - 1) : null;
  const act = idx !== null ? ms[idx] : null;
  const peakIdx = data.peak ? ms.findIndex((m) => m.month === data.peak!.month) : -1;

  // 点同一个月第二次 = 收起明细
  const pick = (i: number) => setSel((cur) => (cur === i ? null : i));

  return (
    <div className="sec">
      <div className="psec-head">
        <div style={{ minWidth: 0 }}>
          <div className="sec-q">接下来哪个月最难</div>
          <h2 className="sec-a">
            {data.peak ? <>{monthLabel(data.peak.month)}要还 <span className="n">{yuan(data.peak.total)}</span></> : "未来还款压力"}
          </h2>
        </div>
        <div className="pmode">
          <button type="button" className={mode === "area" ? "on" : ""} onClick={() => setMode("area")}>面积</button>
          <button type="button" className={mode === "bar" ? "on" : ""} onClick={() => setMode("bar")}>柱状</button>
        </div>
      </div>

      <div className="sec-note">
        未来 <b>{data.months.length}</b> 个月一共要还 <b>{yuan(data.totalAhead)}</b>，平均每月{" "}
        <b>{yuan(data.monthlyAvg)}</b>。
        {data.overdue.count > 0
          ? <>另有 <b>{data.overdue.count}</b> 期已逾期（{yuan(data.overdue.amount)}），未计入下方。</>
          : "目前没有逾期期次。"}
      </div>

      <div className="plot-box">
        <div className="pread">
          {act ? (
            <span className="num">
              {monthLabel(act.month)} {yuan(act.total)}
              <span className="dim">（本金 {yuan(act.principal)} · 利息 {yuan(act.interest)}）</span>
            </span>
          ) : (
            "点任意一个月看它要还哪些债务，再点一次收起"
          )}
        </div>

        <div className="awrap">
          <div className="agrid">
            {[0, 0.5, 1].map((f) => (
              <div key={f} className="gridline" style={{ bottom: f * 100 + "%" }}>
                <span className="num">{f === 0 ? "0" : window.fmt(top * f)}</span>
              </div>
            ))}
          </div>
          <div className="ascroll">
            <div className="atrack" style={{ minWidth: n * P_COL }}>
              <div className="pcanvas">
                {mode === "bar"
                  ? <BarBody ms={ms} top={top} idx={idx} peakIdx={peakIdx} onPick={pick} />
                  : <AreaBody ms={ms} n={n} top={top} idx={idx} act={act} peakIdx={peakIdx} onPick={pick} />}
              </div>
              <div className="axaxis">
                {ms.map((m, i) => (
                  <div key={m.month} className={"axtick" + (i === idx ? " on" : "")}>{monthTick(m.month)}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="legend-inline">
          <span><i style={{ background: "var(--ch-mag)" }} />本金</span>
          <span><i style={{ background: "var(--ch-cost)" }} />利息</span>
        </div>

        {act && act.items.length > 0 && (
          <div className="abd">
            <div className="abd-l">{monthLabel(act.month)}要还的债务</div>
            {act.items.map((it) => (
              <div className="abd-r" key={it.id}>
                <span>{window.truncateLabel(it.name, 12)}</span>
                <span className="num">{yuan(it.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 透明命中层：面积模式没有"这根柱子"这种可点元素，用等分的透明按钮铺满
function HitLayer({ ms, onPick }: { ms: UpcomingPressureMonth[]; onPick(i: number): void }) {
  return (
    <div className="ahit">
      {ms.map((m, i) => (
        <button
          key={m.month}
          type="button"
          aria-label={`${monthLabel(m.month)}待还 ${yuan(m.total)}`}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  );
}

interface BodyProps {
  ms: UpcomingPressureMonth[];
  top: number;
  idx: number | null;
  peakIdx: number;
  onPick(i: number): void;
}

function AreaBody({ ms, n, top, idx, act, peakIdx, onPick }: BodyProps & { n: number; act: UpcomingPressureMonth | null }) {
  const H = P_H;
  const x = (i: number) => i + 0.5;
  const yP = (m: UpcomingPressureMonth) => H - (m.principal / top) * H;
  const yT = (m: UpcomingPressureMonth) => H - (m.total / top) * H;

  const pLine = ms.map((m, i) => (i ? "L" : "M") + x(i).toFixed(2) + " " + yP(m).toFixed(2)).join(" ");
  const tLine = ms.map((m, i) => (i ? "L" : "M") + x(i).toFixed(2) + " " + yT(m).toFixed(2)).join(" ");
  // 本金面积：沿本金线走一遍，再沿基线回来
  const pArea = pLine + ` L${x(n - 1).toFixed(2)} ${H} L${x(0).toFixed(2)} ${H} Z`;
  // 利息带：沿总额线走一遍，再沿本金线倒着回来
  const iArea =
    tLine + " " +
    ms.slice().reverse().map((m, k) => "L" + x(n - 1 - k).toFixed(2) + " " + yP(m).toFixed(2)).join(" ") +
    " Z";

  const lx = idx !== null ? (x(idx) / n) * 100 : 0;

  return (
    <div className="achart">
      <svg viewBox={`0 0 ${n} ${H}`} preserveAspectRatio="none">
        <path d={pArea} fill="var(--ch-mag)" fillOpacity="0.85" />
        <path d={iArea} fill="var(--ch-cost)" fillOpacity="0.85" />
        <path d={pLine} fill="none" stroke="var(--ch-mag)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <path d={tLine} fill="none" stroke="var(--ch-cost)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {act && idx !== null && (
        <>
          <span className="amark" style={{ left: lx + "%" }} />
          {/* 圆点用 HTML 不用 SVG <circle>：preserveAspectRatio="none" 会把圆拉成椭圆 */}
          <span className="adot total" style={{ left: lx + "%", bottom: (1 - yT(act) / H) * 100 + "%" }} />
          {act.principal > 0 && (
            <span className="adot prin" style={{ left: lx + "%", bottom: (1 - yP(act) / H) * 100 + "%" }} />
          )}
        </>
      )}
      {/* 峰值标注：柱状那版靠 .pcol.peak::after 挂在"那根柱子"这个元素上，面积图没有对应
          的 DOM（只有两条连续 path），所以按峰值点坐标单独定位。面积图**比柱状更需要**这个
          标注——连续曲线会把局部起伏平滑掉，肉眼挑不出最高点。 */}
      {peakIdx >= 0 && peakIdx < n && (
        <span
          className={"apeak" + (peakIdx === idx ? " dim" : "")}
          style={{ left: (x(peakIdx) / n) * 100 + "%", bottom: (1 - yT(ms[peakIdx]) / H) * 100 + "%" }}
        >
          峰值
        </span>
      )}
      <HitLayer ms={ms} onPick={onPick} />
    </div>
  );
}

// 柱状模式：改版前那套原样保留（峰值月带标注、选中时其余变暗）。柱子本身就是 <button>，
// 不需要额外的命中层。
function BarBody({ ms, top, idx, peakIdx, onPick }: BodyProps) {
  return (
    <div className="pbars">
      {ms.map((m, i) => {
        const bp = (m.total / top) * 100;
        const split = m.principal + m.interest;
        // ⚠️柱高必须由 total 决定，本金/利息只负责**按比例切分**这根柱子——手动逐行编辑时
        // amount 和 principal+interest 可能对不上（已知的数据模型缺口⑤），各自独立算高度
        // 会让柱子画到 total 之外（实测过 amount=100 而 principal+interest=2194 的例子，
        // 柱高算出来 2194%，整根冲出画布）。
        const pH = split <= 0 ? bp : bp * (m.principal / split);
        const iH = split <= 0 ? 0 : bp * (m.interest / split);
        const cls =
          "pcol" +
          (i === peakIdx ? " peak" : "") +
          (i === idx ? " active" : "") +
          (idx !== null && i !== idx ? " dimmed" : "");
        return (
          <button
            key={m.month}
            type="button"
            className={cls}
            aria-label={`${monthLabel(m.month)}待还 ${yuan(m.total)}`}
            onClick={() => onPick(i)}
          >
            <div className="pstack">
              <div className="seg p" style={{ height: pH + "%" }} />
              <div className={"seg i" + (iH <= 0 ? " zero" : "")} style={{ height: iH + "%" }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
