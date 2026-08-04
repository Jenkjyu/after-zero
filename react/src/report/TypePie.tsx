// "这些债务是什么类型"——可拖拽旋转的甜甜圈，替代原来的 TypeStack.tsx（26px 堆叠条+图例）。
//
// ⚠️标签**贴容器左右边缘 + 折线引线**，不是"沿半径方向直着往外放"。后者试过：扇区转到
// 正左/正右时，标签起点被推到离中心 r+18 处，水平空间只剩 60 多 px，"信用卡分期 27% ¥16,208"
// 根本放不下，饼半径只能压到 62 才不重叠。改成贴边缘之后水平空间跟扇区角度无关，
// 半径能给到 76（大 23%），同侧多个标签按 y 排序做避让。
//
// ⚠️所有几何都在 useEffect 里按容器**实测宽度**算，不写死 viewBox 坐标——真机宽度
// 360/390/412 各不相同，写死的话标签跟扇区会对不上。
//
// ⚠️SVG 的 fill/stroke **不接受 CSS 渐变值**。中心孔和扇区描边不能写 var(--card-grad)
// （那是个 linear-gradient(...)），浏览器解析不了会回退到默认黑色——浅色模式下中心孔
// 和描边全黑。必须给纯色 var(--surface)。
//
// 旋转角度不进 React state：拖拽期间每帧 setState 会让整棵子树重渲染、手势发顿。
// 存在 ref 里，手势回调直接改 DOM（见 pieRotate.ts 的注释）。
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReportData } from "../types";
import { arcPath, attachPieRotate, polar } from "./pieRotate";

const R = 76;        // 甜甜圈外半径
const HUB = 0.58;    // 中心孔 = R × 这个比例
const GAP = 8;       // 标签离容器边缘的间距
const ELBOW = 16;    // 引线斜段的长度（从扇区边缘往外）
const LAB_H = 34;    // 标签盒近似高度，用于同侧避让和上下钳制
const WRAP_H = 262;  // .pie-wrap 高度，跟 CSS 里那条保持一致

export interface TypePieProps {
  data: ReportData;
}

export function TypePie({ data }: TypePieProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const leadRef = useRef<SVGGElement | null>(null);
  const hubRef = useRef<SVGCircleElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rotRef = useRef(0);

  const list = data.typeList;
  const total = data.totalBalance || 1;

  // 每个扇区的起止角和中点角——旋转时只加 rotRef，这份不变
  const slices: { a0: number; a1: number; mid: number; i: number }[] = [];
  let acc = 0;
  list.forEach((t, i) => {
    const a0 = (acc / total) * 360;
    acc += t.value;
    const a1 = (acc / total) * 360;
    slices.push({ a0, a1, mid: (a0 + a1) / 2, i });
  });

  // useLayoutEffect：首帧就要把扇区和标签画到正确位置，用 useEffect 会先闪一帧空图
  useLayoutEffect(() => {
    const root = rootRef.current, g = gRef.current, leads = leadRef.current;
    const hub = hubRef.current, svg = svgRef.current;
    if (!root || !g || !leads || !hub || !svg) return;

    // ⚠️色块<path>的形状只取决于容器宽度算出的cx/cy，完全不取决于旋转角度——旋转
    // 靠下面render()里单独给<g>设置transform属性实现。layout()只在容器尺寸变化时
    // 才需要重新跑，不能跟每一帧拖拽绑在一起：早前这里跟rotate揉在同一个apply()里，
    // 导致每次touchmove都要销毁重建这些<path>节点，是真机反馈"转色块部分卡、转中心孔/
    // 容器边缘留白不卡"的根因——中心孔和标签走的是setAttribute/改style，没有这层
    // innerHTML重建开销，色块有，所以只有摸在色块上才感觉到卡顿。
    let W = 0, cx = 0, cy = 0, ready = false;
    const layout = () => {
      W = root.clientWidth;
      if (!W) return false;
      cx = W / 2; cy = WRAP_H / 2;
      svg.setAttribute("viewBox", `0 0 ${W} ${WRAP_H}`);
      g.innerHTML = slices
        .map((s) => `<path class="pie-slice" d="${arcPath(cx, cy, R, s.a0, s.a1)}" fill="var(--pie-${s.i + 1})"/>`)
        .join("");
      hub.setAttribute("cx", String(cx));
      hub.setAttribute("cy", String(cy));
      hub.setAttribute("r", String(R * HUB));
      ready = true;
      return true;
    };

    // 每帧拖拽都要跑的部分：只改<g>的transform属性(不碰色块DOM) + 重算标签/引线
    // 位置——这两者本来就要跟着旋转角度连续变化，没法避免每帧重算，但引线是
    // <path>不是要销毁重建的色块，开销小得多。
    const render = () => {
      if (!ready) return;
      const rot = rotRef.current;
      g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);

      // 标签：先按角度算出想待的 y，再按左右分组做避让
      const labs = Array.from(root.querySelectorAll<HTMLElement>(".pie-lab"));
      const items = labs.map((el, i) => {
        const deg = slices[i].mid + rot;
        const rad = ((deg - 90) * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const a = polar(cx, cy, R + 1, deg);
        const b = polar(cx, cy, R + ELBOW, deg);
        return { el, side: cos >= 0 ? "r" : "l", ax: a[0], ay: a[1], bx: b[0], by: b[1], want: cy + sin * (R + ELBOW), y: 0 };
      });
      (["l", "r"] as const).forEach((side) => {
        const grp = items.filter((x) => x.side === side).sort((a, b) => a.want - b.want);
        const minY = LAB_H / 2 + 2, maxY = WRAP_H - LAB_H / 2 - 2;
        let prev = -Infinity;
        grp.forEach((x) => { x.y = Math.max(minY, Math.max(x.want, prev + LAB_H)); prev = x.y; });
        for (let k = grp.length - 1; k >= 0; k--) {          // 顶到底了再从下往上回推
          if (grp[k].y > maxY) grp[k].y = maxY;
          if (k > 0 && grp[k].y - grp[k - 1].y < LAB_H) grp[k - 1].y = grp[k].y - LAB_H;
        }
        grp.forEach((x) => { x.y = Math.max(minY, x.y); });
      });

      leads.innerHTML = items
        .map((x) => {
          const edgeX = x.side === "r" ? W - GAP : GAP;
          const el = x.el;
          el.style.top = x.y - LAB_H / 2 + "px";
          if (x.side === "r") {
            el.style.right = GAP + "px"; el.style.left = "auto"; el.style.textAlign = "right";
            el.classList.add("r");
          } else {
            el.style.left = GAP + "px"; el.style.right = "auto"; el.style.textAlign = "left";
            el.classList.remove("r");
          }
          // 折线引线：扇区边缘 → 斜出一小段 → 水平拉到标签那一侧
          return `<path class="pie-lead" d="M${x.ax.toFixed(1)} ${x.ay.toFixed(1)} L${x.bx.toFixed(1)} ${x.by.toFixed(1)} L${edgeX.toFixed(1)} ${x.y.toFixed(1)}"/>`;
        })
        .join("");
    };

    const full = () => { if (layout()) render(); };

    full();
    const detach = attachPieRotate(root, {
      getRotation: () => rotRef.current,
      onRotate: (deg) => { rotRef.current = deg; render(); },
    });

    /* ⚠️必须用 ResizeObserver，光挂 window resize 不够——四个 tab 的 React 树在启动时
       **同时挂载**，而 #view-report 初始是 display:none，此刻 .pie-wrap 的 clientWidth
       是 0，layout() 第一句就 early-return，什么都画不出来；之后切到统计 tab 只是把
       display 改回 block，既不触发 window resize、也不触发任何 React 重渲染，
       于是饼永远是空的（真实浏览器里实测到：扇区 0 个、引线 0 条，但 jsdom 测试因为
       clientWidth 被打了桩反而是通过的——这类"只在真浏览器里出现"的问题必须靠
       Playwright 那一轮兜住）。ResizeObserver 在元素从 0 宽变成有宽度时会触发，
       正好覆盖这个场景。 */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => full());
      ro.observe(root);
    }
    window.addEventListener("resize", full);
    return () => {
      detach();
      if (ro) ro.disconnect();
      window.removeEventListener("resize", full);
    };
    // slices 的内容只取决于 typeList，用 JSON 做依赖比较，避免每次渲染都重挂手势
  }, [JSON.stringify(list), total]);

  if (!list.length || data.totalBalance <= 0) return null;

  return (
    <div className="sec">
      <div className="sec-q">这些债务是什么类型</div>
      <h2 className="sec-a">
        {list[0].name}占了 <span className="n">{Math.round((list[0].value / total) * 100)}</span>%
      </h2>
      <div className="plot-box">
        <div className="pie-wrap" ref={rootRef} style={{ height: WRAP_H }}>
          <svg className="pie-svg" ref={svgRef}>
            <g ref={gRef} />
            <g ref={leadRef} />
            {/* 纯色，不能用 --card-grad（渐变值 SVG 不接受，会回退成黑色） */}
            <circle className="pie-hub" ref={hubRef} />
          </svg>
          <div className="pie-center">
            <div className="k">总负债</div>
            <div className="v">¥{window.fmt(data.totalBalance)}</div>
          </div>
          {list.map((t, i) => (
            <span className="pie-lab" key={t.name}>
              <span className="n">
                <i style={{ background: `var(--pie-${i + 1})` }} />
                {t.name}
              </span>
              {/* 第二行去掉了 " · " 分隔符并降到 10.5px——这两个是**算过宽度**的：
                  饼半径能做多大卡在"R + GAP + 标签最宽宽度 ≤ 容器宽/2"，
                  实测标签最宽 70.5px，容器半边 163px，R 才能给到 76。 */}
              <span className="v">
                {Math.round((t.value / total) * 100)}% ¥{window.fmt(t.value)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
