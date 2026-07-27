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
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface PopoverProps {
  renderTrigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  renderContent: (args: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
}

export function Popover({ renderTrigger, renderContent, align = "end", panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  function toggle() {
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return (
    <div className="popover-root" ref={rootRef}>
      {renderTrigger({ open, toggle })}
      {open && (
        <div className={"popover-panel align-" + align + (panelClassName ? " " + panelClassName : "")}>
          {renderContent({ close })}
        </div>
      )}
    </div>
  );
}
