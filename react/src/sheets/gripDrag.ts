// 详情窗顶部横杠拖拽——原样照抄vanilla的initGripDrag(www/index.html，见AGENTS.md"React 迁移"
// 一节detailSheet那部分)，只是从"闭包变量+DOM查询"改成"显式state对象+传入ref"，方便单测
// (不依赖真实PointerEvent序列，用普通DOM元素+手造PointerEvent即可)。下拖超过阈值关闭；
// resizable=true(只有detailSheet用)时上拖可以把窗口拉高，用来多看几行还款计划表格。
// 这套逻辑比debts/gestures.ts简单得多——只有一个DOM节点(grip)、4个pointer监听器，
// 没有长按判定/自动滚动/多卡片状态共享，不需要那套ctx-object+decided状态机。
export const GRIP_CLOSE_THRESHOLD = 90;

export interface GripDragState {
  startY: number;
  startH: number;
  dragging: boolean;
}

export function makeGripDragState(): GripDragState {
  return { startY: 0, startH: 0, dragging: false };
}

export function onGripPointerDown(e: PointerEvent, sheet: HTMLElement, grip: HTMLElement, state: GripDragState) {
  state.dragging = true;
  state.startY = e.clientY;
  state.startH = sheet.getBoundingClientRect().height;
  sheet.style.transition = "none";
  if (typeof grip.setPointerCapture === "function") grip.setPointerCapture(e.pointerId);
}

export function onGripPointerMove(e: PointerEvent, sheet: HTMLElement, state: GripDragState, resizable: boolean) {
  if (!state.dragging) return;
  const dy = e.clientY - state.startY;
  if (dy > 0) {
    sheet.style.transform = "translateY(" + dy + "px)";
  } else if (resizable) {
    const minH = window.innerHeight * 0.4;
    const maxH = window.innerHeight * 0.94;
    sheet.style.height = Math.min(maxH, Math.max(minH, state.startH - dy)) + "px";
    sheet.style.transform = "";
  }
}

export function onGripPointerEnd(e: PointerEvent, sheet: HTMLElement, state: GripDragState, onClose: () => void) {
  if (!state.dragging) return;
  state.dragging = false;
  sheet.style.transition = "";
  const dy = e.clientY - state.startY;
  if (dy > GRIP_CLOSE_THRESHOLD) onClose();
  sheet.style.transform = "";
}
