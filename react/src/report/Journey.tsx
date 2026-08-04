// "还清这件事进行到哪了"——负债余额走势，替代原来的 PayoffLine.tsx。
//
// 跟被替换掉的那版比，三处实质变化：
// ① **三个里程碑（今天/还掉一半/归零）的名称+时间+金额直接标在图上**，不再是图下面
//    一排 flex 文字（那个排布视觉上像图例，读不出"这是曲线上的哪个点"）。
// ② **不画坐标轴**。这是判断不是漏了：三个里程碑已经把"起点多少、中点什么时候、
//    终点归零"三个锚点写在图上，再画 Y 轴刻度和 X 轴时间刻度等于同一份信息写两遍，
//    而且刻度数字会跟里程碑标签抢位置。精确值由拖动读数承担（见 ③）。
// ③ 拖动读数保留（复用 chartScrub.ts，跟原来 PayoffLine 同一套），读数显示在图**上方**
//    一行；拖动时里程碑淡到 0.18，两套标签不会互相打架。是标准的press-and-hold交互：
//    按住跟手，松手/取消立刻恢复占位文字+里程碑正常亮度+无游标，不停在最后碰到的值。
//
// ⚠️X 轴按**真实时间比例**排布，不是按数组下标等距——这条是原来 PayoffLine 修过的
// 一个真实缺陷，必须保留：等距下标会让"两个月"和"两年"在图上一样宽，斜率完全失去意义。
//
// ⚠️数据是**预测**不是历史：timeline 由 computeReportData() 从"今天的总余额"出发、按现有
// 还款计划里每一期的本金逐笔递减推算。这个 App 不保存任何历史余额快照，画不出真实走过的
// 轨迹——这条事实本身没变，但2026-08-05应用户要求删掉了图下方那句提示文案
// （"按现有还款计划推算，不含提前还款…"），页面上不再有文字提示这一点。
//
// ⚠️2026-08-01改过两轮（真机反馈）：
// 第一轮"拖动读数不跟手"——原来拖动读数（活动索引）是React state，每次touchmove都
// setState一次，等于每帧让整个组件重渲染重算全部坐标/折线路径，这些拖拽时其实根本不用
// 变。改成跟pieRotate.ts同一个技巧：按住期间只在"第一次触到"这一刻用state触发一次渲染，
// 把游标/读数这批元素挂进DOM；这之后每一帧都直接改这几个DOM节点的style/文本，不再走
// state。activeIdxRef存"最新触到第几个点"，scrubbedRef同步镜像scrubbed这个state（effect
// 只在n变化时重挂，读不到state闭包，靠这个ref判断"是不是这次按压的第一次触摸"）。
//
// 第二轮修了两个真实问题，都是标准press-and-hold交互该有但当时没做对的：
// ①**索引匹配位置偏移**——chartScrub.ts原来假设点均匀分布在容器宽度里算索引，但这张图
// 的点是按真实时间比例摆放的(前密后疏)，导致"反馈的位置比手指按压的位置偏左"。现在
// 通过xFracFor把渲染用的px()坐标传给chartScrub.ts做真实位置匹配，两套坐标统一。
// ②**松手不回到初始态**——原来"scrubbed"一旦变true就永久停在true，读数/游标松手后
// 依然粘着显示。现在chartScrub.ts新增onEnd回调，松手/取消时把scrubbed/activeIdxRef都
// 重置回初始值，回到占位文字+里程碑正常亮度+无游标的样子，每次按压都是独立的一次
// "press-and-hold-release"，不是"点一下永久定住"。
//
// ⚠️实现②时踩到一个真实的React+命令式DOM冲突（这个项目在DocsScreen.tsx也踩过一次，
// 见CLAUDE.md"档案库PDF预览"一节）：第一版`.jread`的内容一半交给JSX（`{active?...:...}`
// 条件渲染占位文字/读数），一半在拖拽期间被`read.innerHTML=...`直接替换——一旦某次
// touchmove把子节点整个换掉（React并不知情），下次因为state变化（比如松手setScrubbed
// (false)）触发的重渲染，React想把它记忆中的旧子节点挪回占位文字时，那些子节点早已经
// 不在真实DOM里了，报`NotFoundError: The node to be removed is not a child of this
// node`。修法：`.jread`的JSX永远不声明任何children（真正的空div），内容100%交给
// `applyIndex`/`onEnd`两处直接读写`read.innerHTML`，React这边永远不会去碰它的子节点，
// 也就没有"两边都想管"这个冲突。初始占位文字改用`useLayoutEffect`在挂载后立刻写入
// （在浏览器绘制前完成，不会闪一帧空白）。
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { DebtSummary, ReportData } from "../types";
import { attachChartScrub } from "./chartScrub";

// 容器总高 = 上留白 + 绘图区 + 下留白。上下留白是给"今天"和"归零"两个标签用的，
// 绘图区高度单独拿出来，是因为里程碑的 y 要按绘图区算、不能按容器总高算。
const CH = 200, PAD_T = 52, PAD_B = 30;
const PLOT_H = CH - PAD_T - PAD_B;
const PLACEHOLDER_HTML = '<span class="dim">按住曲线左右拖，看任意时间点的余额</span>';

export interface JourneyProps {
  data: ReportData;
  /** 进度百分比要用 summarizeDebts 的口径（已还本金含已结清债务），timeline 只有
   *  "从今天往后"的部分，算不出已经还掉了多少，所以由父组件传进来 */
  s: DebtSummary;
  monthsLeft: number | null;
}

export function Journey({ data, s, monthsLeft }: JourneyProps) {
  const pts = data.timeline;
  const n = pts.length;
  const [scrubbed, setScrubbed] = useState(false);
  const scrubbedRef = useRef(false);
  const activeIdxRef = useRef<number | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const readRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const cursorDotRef = useRef<HTMLSpanElement | null>(null);
  // 每次渲染都刷新——effect只在n变化时重挂，但px/py/pts可能因为data prop更新而变，
  // 这样触摸回调永远能读到"这次渲染"算出来的最新几何，不会因为effect没重挂就读到
  // 过期坐标（同一个考虑见pieRotate.ts关于geometry缓存的注释）。
  const latestRef = useRef<{ pts: typeof pts; px: (i: number) => number; py: (i: number) => number } | null>(null);

  // 挂载后立刻写入占位文字——.jread的JSX永远不声明children（见文件顶部注释），
  // 用useLayoutEffect而不是useEffect是为了在浏览器绘制前完成，不闪一帧空白。
  useLayoutEffect(() => {
    const read = readRef.current;
    if (read) read.innerHTML = PLACEHOLDER_HTML;
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || n < 2) return;
    const applyIndex = (i: number) => {
      const read = readRef.current;
      const latest = latestRef.current;
      if (!read || !latest) return;
      const p = latest.pts[i];
      read.innerHTML = `${p.date} <span class="dim">余额</span> ¥${window.fmt(p.balance)}`;
      const cur = cursorRef.current, dot = cursorDotRef.current;
      if (cur && dot) {
        const leftPct = latest.px(i) + "%";
        cur.style.left = leftPct;
        dot.style.left = leftPct;
        dot.style.top = latest.py(i) + "px";
      }
    };
    return attachChartScrub(el, {
      count: n,
      // 索引匹配必须按真实渲染位置(px返回0~100的百分比，这里转回0~1)，不能假设点
      // 均匀分布——见chartScrub.ts顶部注释，这是"反馈位置比手指位置偏左"那条反馈的根因。
      xFracFor: (i) => {
        const latest = latestRef.current;
        return latest ? latest.px(i) / 100 : 0;
      },
      onIndexChange: (i) => {
        activeIdxRef.current = i;
        applyIndex(i); // .jread每次都直接写，不受cursor/dot要不要挂载的限制
        if (!scrubbedRef.current) {
          scrubbedRef.current = true;
          setScrubbed(true); // 只触发这一次重渲染，把游标这些依赖state的部分挂进DOM
        }
      },
      // 松手/取消：回到拖拽前的初始展示(占位文字+里程碑正常亮度+无游标)，不是停在
      // 最后碰到的那个值——这是标准的press-and-hold交互，真机反馈明确要求过这条。
      onEnd: () => {
        scrubbedRef.current = false;
        activeIdxRef.current = null;
        const read = readRef.current;
        if (read) read.innerHTML = PLACEHOLDER_HTML;
        setScrubbed(false);
      },
    });
  }, [n]);

  if (n < 2 || data.totalBalance <= 0) {
    return (
      <div className="sec">
        <div className="sec-q">还清这件事进行到哪了</div>
        <h2 className="sec-a">暂无足够数据</h2>
        <div className="sec-note">没有在还债务，或者还款计划里没有未还的期次。</div>
      </div>
    );
  }

  const W = 320, H = 100;
  const t0 = window.parseDate(pts[0].date)!.getTime();
  const tEnd = window.parseDate(pts[n - 1].date)!.getTime();
  const span = tEnd - t0;
  // span 为 0 是"所有未还期次都在今天"（全部逾期）这种极端情况——退回等距，不做除零
  const xFor = (i: number) =>
    span > 0 ? ((window.parseDate(pts[i].date)!.getTime() - t0) / span) * W : (i / (n - 1)) * W;
  const top = window.niceCeil(pts[0].balance) || 1;
  const yFor = (bal: number) => (1 - bal / top) * H;

  const coords = pts.map((p, i) => [xFor(i), yFor(p.balance)] as const);
  const line = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
  const area = line + ` L${coords[n - 1][0].toFixed(1)},${H} L${coords[0][0].toFixed(1)},${H} Z`;

  // 容器坐标：x 用百分比（横向自适应），y 用绝对像素（纵向是固定高度）
  const px = (i: number) => (coords[i][0] / W) * 100;
  const py = (i: number) => PAD_T + (coords[i][1] / H) * PLOT_H;
  latestRef.current = { pts, px, py };

  // idx只用来给jcursor/jcursor-dot算"首次挂载那一刻"的初始style——scrubbed为true时
  // activeIdxRef.current必然已经是数字(见onIndexChange，先赋值才setScrubbed)，
  // 这里不再派生active/.jread内容，那部分完全交给applyIndex/onEnd直接写DOM。
  const idx = scrubbed && activeIdxRef.current !== null ? Math.min(Math.max(activeIdxRef.current, 0), n - 1) : null;

  // "还掉一半" = 余额首次跌破当前余额一半的那个点
  let halfIdx = pts.findIndex((p) => p.balance <= pts[0].balance / 2);
  if (halfIdx < 0) halfIdx = Math.floor(n / 2);

  /* ⚠️三个标签按**纵向错开**排，不是按"哪边空放哪边"排。
     后者试过：起点标签放点下方、中点放点上方，结果两者 top 只差 7px、横向又只隔 30%，
     读起来像连成一行的一句话。现在起点在最上、中点在中下、终点在中上，至少差 60px。 */
  const nodes: { i: number; t: string; cls: string; anchor: "above-left" | "below" | "above-right" }[] = [
    { i: 0, t: "今天", cls: "now", anchor: "above-left" },
    { i: halfIdx, t: "还掉一半", cls: "", anchor: "below" },
    { i: n - 1, t: "归零", cls: "", anchor: "above-right" },
  ];

  return (
    <div className="sec">
      <div className="sec-q">还清这件事进行到哪了</div>
      <h2 className="sec-a">
        已经走完 <span className="n">{s.pct}</span>%
        {monthsLeft !== null && <>，还剩 <span className="n">{monthsLeft}</span> 个月</>}
      </h2>
      <div className="plot-box">
        {/* ⚠️永远不声明children——内容100%交给applyIndex/onEnd直接写innerHTML，
            见文件顶部注释：React和命令式DOM写不能在同一个节点上"轮流"管理子节点，
            那会在下次reconcile时报NotFoundError。 */}
        <div className="jread" ref={readRef} />
        <div className={"jchart" + (scrubbed ? " scrubbing" : "")} ref={chartRef} style={{ height: CH }}>
          <svg
            className="jsvg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ top: PAD_T, bottom: PAD_B, height: PLOT_H }}
          >
            <defs>
              <linearGradient id="journeyArea" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                <stop offset="0%" stopColor="var(--ch-line)" stopOpacity="0.26" />
                <stop offset="100%" stopColor="var(--ch-line)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#journeyArea)" />
            <path d={line} fill="none" stroke="var(--ch-line)" strokeWidth={2.4} vectorEffect="non-scaling-stroke" />
          </svg>

          {nodes.map((nd) => {
            const x = px(nd.i), y = py(nd.i), p = pts[nd.i];
            const lab: CSSProperties =
              nd.anchor === "above-left" ? { left: 0, top: y - 50, textAlign: "left" }
              : nd.anchor === "below" ? { left: x + "%", top: y + 16, transform: "translateX(-50%)", textAlign: "center" }
              : { right: 0, top: y - 50, textAlign: "right" };
            const lead: CSSProperties =
              nd.anchor === "below" ? { left: x + "%", top: y, height: 16 } : { left: x + "%", top: y - 12, height: 12 };
            return (
              <span key={nd.t}>
                <span className="jlead" style={lead} />
                <span className={"jdot " + nd.cls} style={{ left: x + "%", top: y }} />
                <span className={"jlab " + nd.cls} style={lab}>
                  <span className="t">{nd.t}</span>
                  <span className="d"> {p.date.slice(0, 7)}</span>
                  <div className="a">¥{window.fmt(p.balance)}</div>
                </span>
              </span>
            );
          })}

          {idx !== null && (
            <>
              <span className="jcursor" ref={cursorRef} style={{ left: px(idx) + "%", top: PAD_T, bottom: PAD_B }} />
              <span className="jcursor-dot" ref={cursorDotRef} style={{ left: px(idx) + "%", top: py(idx) }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
