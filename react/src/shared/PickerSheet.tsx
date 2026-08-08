// 通用的"点开一个底部抽屉、单选一项、当前项带对勾"UI——react/src/debts/SortSheet.tsx(排序方式)
// 和react/src/sheets/GenPanel.tsx(公式生成器的计息方式)共用同一套，不重复实现两份视觉/交互
// 一致的选择器。这套UI原本只在SortSheet里，是为了替代原生<select>在安卓WebView里的两个问题
// 写的：①系统全屏列表跟App视觉完全脱节 ②长按触发文字选中/焦点描边，详见SortSheet.tsx里
// 保留的历史注释。
//
// 面板用createPortal挂到document.body——这里比一般的浮层更有必要，不只是"更省心"：调用方
// (比如嵌在#editSheet表单里的GenPanel)本身可能已经在一个.sheet内部，而.sheet的transform
// 会给position:fixed的子孙元素建立新的containing block——不portal出去的话，这个选择器会被
// 外层.sheet自己的overflow:hidden裁掉、且定位基准变成外层.sheet而不是视口，不portal会直接
// 画错。
//
// 常驻挂载、只切.open类，不是"打开时才创建节点"：.sheet靠transform从translateY(100%)过渡到0
// 做上滑动画，节点是打开那一刻才创建的话它一出生就已经是终态，过渡不会播——跟SortSheet/
// DetailSheet/EditSheet等其它常驻sheet同一个处理方式。
import { createPortal } from "react-dom";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
}

export interface PickerSheetProps<T extends string> {
  open: boolean;
  value: T;
  title: string;
  titleId: string;
  options: PickerOption<T>[];
  onPick(v: T): void;
  onClose(): void;
  // 只有这个选择器嵌在另一个.sheet/.subpage内部、需要把z-index一起提高盖过外层容器时才需要
  // 传——参照AGENTS.md"第十一步"里aiHistorySheet那条"sheet挂在subpage下面必须手动提z-index"
  // 的先例，同时打在.scrim和.sheet两个元素上(两者默认z-index分别是30/31，只提sheet不提
  // scrim的话，遮罩层还是会被z-index更高的外层容器盖住)。
  stackClassName?: string;
}

export function PickerSheet<T extends string>({
  open, value, title, titleId, options, onPick, onClose, stackClassName,
}: PickerSheetProps<T>) {
  const stackCls = stackClassName ? " " + stackClassName : "";
  return createPortal(
    <>
      <div className={"scrim" + stackCls + (open ? " open" : "")} onClick={onClose} />
      <div
        className={"sheet option-sheet" + stackCls + (open ? " open" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="grip" />
        {/* 滚动放在这层、不放在.sheet上——见www/index.html里.sheet那段注释(深色模式圆角露白) */}
        <div className="sheet-scroll">
          <h2 id={titleId}>{title}</h2>
          <div className="option-list">
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  className={"option-item" + (active ? " active" : "")}
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
