// 共享锚定浮层——shared/下第一个UI组件(之前只有state.ts这个纯hook文件)。"?"说明弹窗
// (InfoTip.tsx)和"⋮"导出菜单(report/ExportMenu.tsx)都是"点图标→弹出一个贴着图标的小面板→
// 点外面/再点一次关闭"的同一个交互模式，抽成这一个共享组件，避免分别糊两套。
//
// 这里不需要走这个项目"触摸手势必须Touch Events不能Pointer Events"那套重手势基础设施
// (见CLAUDE.md"手势代码：原样移植，不重新设计"一节)——那条硬规则只约束"要拦截原生滚动"的
// 连续拖拽场景(touchmove.preventDefault()逐次否决滚动)。关闭浮层只是"检测到面板外的一次
// 点按就收起"，不需要拦截任何原生行为，普通的pointerdown监听器完全够用，是这个项目第一次
// 出现"轻量浮层"和"重手势"两种不同复杂度touch处理并存的场景，值得在这里写清楚区别，
// 避免以后有人把这个当成"该用Touch Events"的场景误用。
//
// ⚠️面板用createPortal挂到document.body，不是原地渲染——这是Playwright验证report/Hero.tsx
// 时真实踩到的坑，且比想象中更隐蔽：ExportMenu的触发器在.hero-top里，.hero-top和.hero-amt
// 都是.hero的直接子元素、都被".hero > *{position:relative;z-index:1}"这条规则赋予了
// 相同的z-index，各自形成独立的stacking context。一开始以为把面板改成position:fixed+
// JS算视口坐标就够了(逃出.hero的overflow:hidden裁切)，但实测发现"点导出Excel没反应"依然
// 复现——用一个最小复现单独验证后才搞清楚：position:fixed只让元素的"定位参照"跳到视口，
// 不会让它跳出祖先的stacking context，它依然被困在.hero-top这个stacking context里，
// 而DOM顺序更靠后、z-index相同的.hero-amt作为兄弟stacking context会整个画在它上层——
// 哪怕面板视觉坐标已经算到了.hero-amt下方的空白区域，命中测试点到的还是.hero-amt。
// 唯一真正可靠的解法是让面板在DOM树里就不是.hero的后代，用createPortal直接挂到
// document.body，彻底跳出这整条stacking context链，不管以后这个组件被嵌在什么样的容器里
// (哪怕祖先有z-index/stacking context)都不会重蹈这个坑。
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PopoverProps {
  renderTrigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  renderContent: (args: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
}

interface PanelPos {
  top: number;
  left: number;
}

// 面板离视口边缘至少留这么多，别贴边贴到看起来像被裁了
const VIEWPORT_MARGIN = 10;
// 面板跟触发器之间的间隙
const ANCHOR_GAP = 6;

export function Popover({ renderTrigger, renderContent, align = "end", panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  // 每次打开、或打开期间视口滚动/尺寸变化，都重新量一次触发器的位置——这个面板本来就是
  // "点一下即用即关"的短生命周期交互，不需要跟"手势拖拽"那样帧级实时跟手，用普通事件监听
  // 足够，不需要走chartScrub.ts那套Touch Events基础设施。
  //
  // ⚠️定位分两趟，且**必须同时量面板自己的尺寸**：只按触发器的位置算(原来的写法，align==="end"
  // 时直接给right、"start"时直接给left)，面板一旦比触发器到那一侧边缘的距离还宽，就会整块
  // 溢出屏幕外——真机上"加权平均利率"那个问号点开后内容跑到屏幕外就是这么来的。现在改成
  // 算出理想left之后按视口做钳制，纵向放不下时翻到触发器上方；面板尺寸只有渲染出来才量得到，
  // 所以第一趟先以visibility:hidden渲染(不闪)，量完再定位并显示。
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    function updatePos() {
      const root = rootRef.current, panel = panelRef.current;
      if (!root || !panel) return;
      const r = root.getBoundingClientRect();
      const pw = panel.offsetWidth, ph = panel.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;

      // 横向：先按对齐方式算理想位置，再钳进视口。面板比视口还宽时(理论上被CSS的max-width
      // 挡住不会发生)也至少保证左边贴着margin，不会算出负数。
      const ideal = align === "end" ? r.right - pw : r.left;
      const maxLeft = Math.max(VIEWPORT_MARGIN, vw - pw - VIEWPORT_MARGIN);
      const left = Math.min(Math.max(ideal, VIEWPORT_MARGIN), maxLeft);

      // 纵向：默认挂在触发器下方；下方放不下就翻到上方；上下都放不下(面板比视口还高)
      // 就贴着底部margin，让面板自己的滚动/换行去处理。
      let top = r.bottom + ANCHOR_GAP;
      if (top + ph > vh - VIEWPORT_MARGIN) {
        const above = r.top - ph - ANCHOR_GAP;
        top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, vh - ph - VIEWPORT_MARGIN);
      }
      setPos({ top, left });
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, align]);

  // 面板挂在document.body下(portal)，判断"点在面板外"必须把rootRef(触发器)和panelRef
  // (面板本身)两处都算作"面板内"，否则点面板自己内容(比如菜单项)会被误判成"点外面"关闭。
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!(e.target instanceof Node)) return;
      const root = rootRef.current;
      const panel = panelRef.current;
      if ((root && root.contains(e.target)) || (panel && panel.contains(e.target))) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return (
    <div className="popover-root" ref={rootRef}>
      {renderTrigger({ open, toggle })}
      {open && createPortal(
        <div
          ref={panelRef}
          className={"popover-panel" + (panelClassName ? " " + panelClassName : "")}
          // pos为null=还没量过尺寸的第一趟渲染：先放左上角、visibility:hidden，量完立刻
          // 定位并显示。用visibility不用display:none——后者量不到offsetWidth/offsetHeight。
          style={{ top: pos ? pos.top : 0, left: pos ? pos.left : 0, visibility: pos ? "visible" : "hidden" }}
        >
          {renderContent({ close })}
        </div>,
        document.body
      )}
    </div>
  );
}
