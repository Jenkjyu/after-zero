// 排序方式选择器——替代原来那个原生<select>。原生select在安卓WebView里弹出的是系统自带的
// 全屏列表(白底、系统字体、系统圆点)，跟这个App的视觉完全脱节(真机截图能看出是两套设计)，
// 而且长按还会触发系统的文字选中/焦点描边(www/index.html里.sort-sel那几行CSS就是当年为了
// 摁住这些副作用打的补丁)。改成自绘的底部小面板之后那些补丁的必要性也一起消失了。
//
// 为什么是底部sheet不是贴着按钮的popover(shared/Popover.tsx)：11个选项，贴着按钮弹出的
// 小面板放不下，要么滚动要么溢出屏幕——这是跟用户确认过的形态选择。
//
// ⚠️面板用createPortal挂到document.body，理由跟Popover.tsx那段长注释一样：不管这个组件
// 以后被嵌在什么样的容器里(祖先有overflow:hidden或者z-index形成的stacking context)，
// 都不会被裁切/被兄弟节点盖住。这里还多一层考虑——.sheet是position:fixed+z-index:31，
// 要盖过z-index:20的tabbar，挂在body下最省心。
//
// 常驻挂载、只切.open类(不是"打开时才创建节点")：.sheet靠transform从translateY(100%)
// 过渡到0来做上滑动画，如果节点是打开那一刻才创建的，它一出生就已经是终态，过渡不会播。
// 这跟DetailSheet/EditSheet那几个常驻sheet是同一个处理方式。
import { createPortal } from "react-dom";
import type { SortKey } from "../types";

export interface SortOption {
  value: SortKey;
  label: string;
}

export interface SortSheetProps {
  open: boolean;
  value: SortKey;
  options: SortOption[];
  onPick(v: SortKey): void;
  onClose(): void;
}

export function SortSheet({ open, value, options, onPick, onClose }: SortSheetProps) {
  return createPortal(
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={onClose} />
      <div
        className={"sheet sort-sheet" + (open ? " open" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sortSheetTitle"
      >
        <div className="grip" />
        {/* 滚动放在这层、不放在.sheet上——见www/index.html里.sheet那段注释(深色模式圆角露白) */}
        <div className="sheet-scroll">
          <h2 id="sortSheetTitle">排序方式</h2>
          <div className="sort-opt-list">
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  className={"sort-opt" + (active ? " active" : "")}
                  aria-current={active ? "true" : undefined}
                  onClick={() => { onPick(o.value); onClose(); }}
                >
                  <span>{o.label}</span>
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
