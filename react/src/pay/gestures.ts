// 还款日卡片左滑露出"标记已还"——原样照抄自 www/index.html 的
// initPaySwipe/closePaySwipe/openPaySwipeTo/paySwipeSettle，不借这次迁移"用更React的方式
// 重写"(同一条决定见CLAUDE.md"在还债务自定义排序"/"React 迁移"两节"手势代码原样照抄"的原则)。
//
// 跟"在还债务"的 debts/gestures.ts 不是同一份代码拆出来的——这里只有滑动，没有长按拖拽排序，
// 是独立的、更简单的一套状态机。vanilla历史上pay的滑动手势其实是更早、更原始的实现，
// debts当年是照抄这份定的模式，不是反过来（见CLAUDE.md"还款提醒页"一节），所以这次移植
// 直接从vanilla的initPaySwipe搬，不去debts/gestures.ts里找可复用的部分。
//
// ⚠️同样必须用原生Touch Events + {passive:false}，不能用JSX的onTouchMove——React合成触摸
// 事件默认passive，preventDefault()不会真正阻止原生滚动，这是React本身的限制。
import type { MutableRefObject } from "react";

export const PAY_REVEAL = 92;

export interface PayGestureCtx {
  openSwipeRowRef: MutableRefObject<HTMLElement | null>;
}

type RowEl = HTMLElement & { __justDragged?: boolean };

export function closePaySwipe(ctx: PayGestureCtx, row: HTMLElement | null) {
  if (!row) return;
  row.style.transition = "transform .18s ease";
  row.style.transform = "translateX(0)";
  row.dataset.open = "0";
  if (ctx.openSwipeRowRef.current === row) ctx.openSwipeRowRef.current = null;
}

export function openPaySwipeTo(ctx: PayGestureCtx, row: HTMLElement) {
  if (ctx.openSwipeRowRef.current && ctx.openSwipeRowRef.current !== row) closePaySwipe(ctx, ctx.openSwipeRowRef.current);
  row.style.transition = "transform .18s ease";
  row.style.transform = "translateX(-" + PAY_REVEAL + "px)";
  row.dataset.open = "1";
  ctx.openSwipeRowRef.current = row;
}

function paySwipeSettle(ctx: PayGestureCtx, row: HTMLElement, base: number, dx: number) {
  const finalOffset = Math.min(0, Math.max(-PAY_REVEAL, base + dx));
  if (finalOffset < -PAY_REVEAL / 2) openPaySwipeTo(ctx, row);
  else closePaySwipe(ctx, row);
}

// 触摸设备：只接管水平轴(touchmove里判定|dy|>8&&|dy|>=|dx|就交还给原生垂直滚动)，
// 不像debts那套还要处理长按拖拽，所以这里没有jiggleMode/dragCtx这些概念。
export function onPayTouchStart(e: TouchEvent, outer: HTMLElement, swipeRow: HTMLElement, ctx: PayGestureCtx) {
  if (e.touches.length !== 1) return;
  const row = swipeRow as RowEl;
  // 每次新手势开始都先清掉上一次留下的标记——真正带位移的滑动不会触发浏览器的click合成，
  // __justDragged不会被"消费"掉，留着不清会误伤下一次正常点击。
  row.__justDragged = false;
  const t0 = e.touches[0];
  const sx = t0.clientX, sy = t0.clientY, id = t0.identifier;
  const base = swipeRow.dataset.open === "1" ? -PAY_REVEAL : 0;
  let axis: "x" | "y" | null = null;

  function tOf(ev: TouchEvent) {
    for (let i = 0; i < ev.changedTouches.length; i++) if (ev.changedTouches[i].identifier === id) return ev.changedTouches[i];
    return null;
  }
  function onMove(ev: TouchEvent) {
    const t = tOf(ev);
    if (!t) return;
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (axis === null) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { axis = "y"; cleanup(); return; }
      if (Math.abs(dx) > 8) axis = "x"; else return;
    }
    ev.preventDefault();
    swipeRow.style.transition = "none";
    swipeRow.style.transform = "translateX(" + Math.min(0, Math.max(-PAY_REVEAL, base + dx)) + "px)";
  }
  function onEnd(ev: TouchEvent) {
    const t = tOf(ev);
    if (!t) return;
    if (axis === "x") { row.__justDragged = true; paySwipeSettle(ctx, swipeRow, base, t.clientX - sx); }
    cleanup();
  }
  function onCancel(ev: TouchEvent) {
    if (!tOf(ev)) return;
    if (axis === "x") closePaySwipe(ctx, swipeRow);
    cleanup();
  }
  function cleanup() {
    outer.removeEventListener("touchmove", onMove as EventListener);
    outer.removeEventListener("touchend", onEnd as EventListener);
    outer.removeEventListener("touchcancel", onCancel as EventListener);
  }
  outer.addEventListener("touchmove", onMove as EventListener, { passive: false });
  outer.addEventListener("touchend", onEnd as EventListener);
  outer.addEventListener("touchcancel", onCancel as EventListener);
}

// 桌面鼠标：Pointer Events没有跟原生滚动抢的问题，纯粹为了桌面浏览器也能测。
export function onPayPointerDown(e: PointerEvent, outer: HTMLElement, swipeRow: HTMLElement, ctx: PayGestureCtx) {
  if (e.pointerType !== "mouse") return;
  const row = swipeRow as RowEl;
  row.__justDragged = false;
  const sx = e.clientX, pid = e.pointerId;
  const base = swipeRow.dataset.open === "1" ? -PAY_REVEAL : 0;
  let moved = false;

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pid) return;
    const dx = ev.clientX - sx;
    if (Math.abs(dx) > 4) moved = true;
    swipeRow.style.transition = "none";
    swipeRow.style.transform = "translateX(" + Math.min(0, Math.max(-PAY_REVEAL, base + dx)) + "px)";
  }
  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pid) return;
    if (moved) { row.__justDragged = true; paySwipeSettle(ctx, swipeRow, base, ev.clientX - sx); }
    cleanup();
  }
  function cleanup() {
    outer.removeEventListener("pointermove", onMove as EventListener);
    outer.removeEventListener("pointerup", onUp as EventListener);
    outer.removeEventListener("pointercancel", onUp as EventListener);
  }
  outer.addEventListener("pointermove", onMove as EventListener);
  outer.addEventListener("pointerup", onUp as EventListener);
  outer.addEventListener("pointercancel", onUp as EventListener);
}
