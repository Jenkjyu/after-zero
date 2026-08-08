// 长按拖拽排序 + 左滑露出"销这期"——原样照抄自 www/index.html 的
// beginDrag/applyDragFrame/autoScrollTick/finishDrag/closeDebtSwipe/openDebtSwipeTo/
// debtSwipeSettle/onCardTouchStart/onCardPointerDown，不借这次迁移"用更React的方式重写"。
// 见 AGENTS.md "React 迁移"一节："手势代码原样照抄，不重新设计"这条决定的理由。
//
// ⚠️ 关键：这里全部用原生 addEventListener + {passive:false}，不用JSX的onTouchMove——
// React的合成触摸事件默认是passive的，合成onTouchMove里调用preventDefault()不会真正
// 阻止原生滚动(这是React众所周知的一个限制)。这正是vanilla当年"必须用Touch Events、
// 且touchmove监听器必须{passive:false}"那条教训在React下的对应体现，处理方式一致：
// 组件里用ref拿到真实DOM节点，在useEffect里手动addEventListener，不走JSX事件prop。
import type { Debt } from "../types";
import type { MutableRefObject } from "react";

export const DEBT_REVEAL = 76;
const JIGGLE_EDGE = 60;
const JIGGLE_MAXSPD = 14;
// 已经在抖动编辑模式里时，"按住不动"再多等这么久就当成"长按退出编辑模式"(等同点"保存")。
// 时间从拖拽真正开始(dragDelay的120ms)之后再算，所以从手指落下到退出总共约570ms。
// 为什么要用第二段计时而不是直接把dragDelay拉长：编辑模式下"按住就能拖"是主操作，不能为了
// 让路给退出手势而让每次拖拽都先等半秒；分成两段之后，想拖的人一动就取消退出计时(见moved)，
// 想退出的人按住别动即可，两个手势互不打扰。
const JIGGLE_EXIT_HOLD = 450;
// 判定"按住没动"的位移容差——手指静止时的自然抖动通常在几px内，8px比拖拽判定的10px阈值
// 略小，保证"稍微动一点就算想拖、不算想退出"。
const JIGGLE_EXIT_SLOP = 8;

interface DragCtx {
  el: HTMLElement;
  cards: HTMLElement[];
  naturalTop: number[];
  minTop: number;
  maxTop: number;
  order: number[];
  k0: number;
  startPageY: number;
  elHeight: number;
  lastClientY: number;
  rafId: number;
}

// vanilla用el.__o把{d,i}直接挂在DOM节点上，finishDrag靠这个反查提交顺序——
// 这里原样复刻同一个技巧(不是引入什么新模式)，card组件在自己的effect里设置这个属性。
export interface CardEl extends HTMLDivElement {
  __o?: { d: Debt };
}

export interface GestureCtx {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  dragCtxRef: MutableRefObject<DragCtx | null>;
  jiggleModeRef: MutableRefObject<boolean>;
  openSwipeRowRef: MutableRefObject<HTMLElement | null>;
  enterJiggle: () => void;
  // 长按退出编辑模式用(等同点"保存")。DebtList里的实现会先finishDrag(ctx,false)丢弃
  // 这次没提交的拖拽、再setJiggleMode(false)。
  exitJiggle: () => void;
  onCommitReorder: (newOrder: Debt[]) => void;
}

export function closeDebtSwipe(ctx: Pick<GestureCtx, "openSwipeRowRef">, row: HTMLElement | null) {
  if (!row) return;
  row.style.transition = "transform .18s ease";
  row.style.transform = "translateX(0)";
  row.dataset.open = "0";
  if (ctx.openSwipeRowRef.current === row) ctx.openSwipeRowRef.current = null;
}

export function openDebtSwipeTo(ctx: Pick<GestureCtx, "openSwipeRowRef">, row: HTMLElement) {
  if (ctx.openSwipeRowRef.current && ctx.openSwipeRowRef.current !== row) closeDebtSwipe(ctx, ctx.openSwipeRowRef.current);
  row.style.transition = "transform .18s ease";
  row.style.transform = "translateX(-" + DEBT_REVEAL + "px)";
  row.dataset.open = "1";
  ctx.openSwipeRowRef.current = row;
}

function debtSwipeSettle(ctx: Pick<GestureCtx, "openSwipeRowRef">, row: HTMLElement, base: number, dx: number) {
  const finalOffset = Math.min(0, Math.max(-DEBT_REVEAL, base + dx));
  if (finalOffset < -DEBT_REVEAL / 2) openDebtSwipeTo(ctx, row);
  else closeDebtSwipe(ctx, row);
}

// 长按判定时长：未进入编辑模式要完整等500ms，已在编辑模式里用短延迟120ms确认"按住不动"就够。
function dragDelay(jiggleModeRef: MutableRefObject<boolean>) {
  return jiggleModeRef.current ? 120 : 500;
}

// 全程用文档坐标(clientY + scrollY)，边缘自动滚动时不需要重新测量DOM。
// 读containerRef.current.children(真实DOM子节点顺序)而不是React state里的排序数组——
// 跟vanilla读$("debtList").children是同一个理由：拖拽视觉只关心屏幕上实际渲染出的顺序。
function beginDrag(ctx: GestureCtx, el: HTMLElement, clientY: number) {
  const container = ctx.containerRef.current;
  if (!container) return;
  const cards = Array.prototype.slice.call(container.children) as HTMLElement[];
  const scrollY = window.scrollY;
  const naturalTop = cards.map((c) => c.getBoundingClientRect().top + scrollY);
  const k0 = cards.indexOf(el);
  const dragCtx: DragCtx = {
    el, cards, naturalTop,
    minTop: Math.min.apply(null, naturalTop),
    maxTop: Math.max.apply(null, naturalTop),
    order: cards.map((_, i) => i),
    k0,
    startPageY: clientY + scrollY,
    elHeight: el.offsetHeight,
    lastClientY: clientY,
    rafId: 0,
  };
  ctx.dragCtxRef.current = dragCtx;
  el.classList.add("dragging");
  // 拖拽期间其他卡片暂停抖动(.jiggle的keyframe动画会持续覆盖transform，
  // 跟"让位"用的内联transform冲突)，松手后再恢复摆动(由React按jiggleMode重渲染补回)。
  cards.forEach((c) => { if (c !== el) { c.classList.add("shifting"); c.classList.remove("jiggle"); } });
  dragCtx.rafId = requestAnimationFrame(() => autoScrollTick(ctx));
}

// 每次都从naturalTop[]重新算全部卡片该挪多少像素(不是在上一帧基础上累加)，
// 这样来回快速拖拽也不会产生漂移——卡片回到原位时delta自动算出0。
function applyDragFrame(ctx: GestureCtx) {
  const dc = ctx.dragCtxRef.current;
  if (!dc) return;
  const rawTop = dc.naturalTop[dc.k0] + ((dc.lastClientY + window.scrollY) - dc.startPageY);
  const clampedTop = Math.min(dc.maxTop, Math.max(dc.minTop, rawTop));
  const dy = clampedTop - dc.naturalTop[dc.k0];
  dc.el.style.transform = "translateY(" + dy + "px)";
  const centerNow = dc.naturalTop[dc.k0] + dc.elHeight / 2 + dy;
  const order = dc.order;
  let pos = order.indexOf(dc.k0);
  if (pos > 0) {
    const aIdx = order[pos - 1], aMid = dc.naturalTop[aIdx] + dc.cards[aIdx].offsetHeight / 2;
    if (centerNow < aMid) { order.splice(pos, 1); order.splice(pos - 1, 0, dc.k0); pos--; }
  }
  if (pos < order.length - 1) {
    const bIdx = order[pos + 1], bMid = dc.naturalTop[bIdx] + dc.cards[bIdx].offsetHeight / 2;
    if (centerNow > bMid) { order.splice(pos, 1); order.splice(pos + 1, 0, dc.k0); pos++; }
  }
  order.forEach((origIdx, P) => {
    if (origIdx === dc.k0) return;
    dc.cards[origIdx].style.transform = "translateY(" + (dc.naturalTop[P] - dc.naturalTop[origIdx]) + "px)";
  });
}

function autoScrollTick(ctx: GestureCtx) {
  const dc = ctx.dragCtxRef.current;
  if (!dc) return;
  const y = dc.lastClientY, vh = window.innerHeight;
  let spd = 0;
  if (y < JIGGLE_EDGE) spd = -JIGGLE_MAXSPD * (JIGGLE_EDGE - y) / JIGGLE_EDGE;
  else if (y > vh - JIGGLE_EDGE) spd = JIGGLE_MAXSPD * (y - (vh - JIGGLE_EDGE)) / JIGGLE_EDGE;
  if (spd) { window.scrollBy(0, spd); applyDragFrame(ctx); }
  dc.rafId = requestAnimationFrame(() => autoScrollTick(ctx));
}

// commit=true正常松手提交这次重排(调用方把新顺序桥接回vanilla的commitReorder)；
// commit=false被打断/退出编辑模式，丢弃不落盘。
export function finishDrag(ctx: GestureCtx, commit: boolean) {
  const dc = ctx.dragCtxRef.current;
  if (!dc) return;
  cancelAnimationFrame(dc.rafId);
  dc.cards.forEach((c) => {
    c.classList.remove("shifting", "dragging");
    c.style.transform = "";
    if (ctx.jiggleModeRef.current) c.classList.add("jiggle");
  });
  ctx.dragCtxRef.current = null;
  if (!commit) return;
  const newOrder = dc.order.map((origIdx) => (dc.cards[origIdx] as CardEl).__o!.d);
  ctx.onCommitReorder(newOrder);
}

// 触摸设备：Touch Events + {passive:false}——只有touch事件的touchmove.preventDefault()
// 才能"逐次"动态否决原生滚动，Pointer Events做不到(pointermove的preventDefault不影响
// 滚动，滚不滚只由touch-action决定，且touch-action手势中途改不了)。同一个手势要在
// "长按拖拽排序"(纵向)和"左滑露出销这期"(横向)之间做判断：横向优先判成swiping(编辑模式下
// 禁用，这时手势全部让给排序)，纵向则判成"取消长按、交还原生滚动"。全程零位移松手=真正的
// tap，不在这里处理，交给DebtCard自己挂的click监听器接手。
export function onCardTouchStart(e: TouchEvent, el: HTMLElement, row: HTMLElement, ctx: GestureCtx) {
  if (ctx.dragCtxRef.current || e.touches.length !== 1) return;
  (row as CardEl & { __justDragged?: boolean }).__justDragged = false;
  const t0 = e.touches[0];
  const sx = t0.clientX, sy = t0.clientY, id = t0.identifier;
  let timer: ReturnType<typeof setTimeout>;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false, swiping = false, moved = false;
  // 手指落下这一刻是不是已经在编辑模式里——决定这次长按是"进入"还是"退出"。
  // 必须在这里快照，不能等timer回调里再读ctx.jiggleModeRef(那时可能已经被自己改掉了)。
  const wasJiggling = ctx.jiggleModeRef.current;
  const swipeBase = row.dataset.open === "1" ? -DEBT_REVEAL : 0;

  function tOf(ev: TouchEvent) {
    for (let i = 0; i < ev.changedTouches.length; i++) if (ev.changedTouches[i].identifier === id) return ev.changedTouches[i];
    return null;
  }
  function onMove(ev: TouchEvent) {
    const t = tOf(ev);
    if (!t) return;
    if (active) {
      if (!ctx.dragCtxRef.current) { cleanup(); return; }
      ev.preventDefault();
      // 一动就取消"长按退出"计时：这次手势的意图是拖动排序，不是退出编辑模式。
      if (!moved && (Math.abs(t.clientX - sx) > JIGGLE_EXIT_SLOP || Math.abs(t.clientY - sy) > JIGGLE_EXIT_SLOP)) {
        moved = true; clearTimeout(holdTimer);
      }
      ctx.dragCtxRef.current.lastClientY = t.clientY;
      applyDragFrame(ctx);
      return;
    }
    if (swiping) {
      ev.preventDefault();
      row.style.transition = "none";
      row.style.transform = "translateX(" + Math.min(0, Math.max(-DEBT_REVEAL, swipeBase + (t.clientX - sx))) + "px)";
      return;
    }
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!ctx.jiggleModeRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { swiping = true; clearTimeout(timer); onMove(ev); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cleanup();
  }
  function onEnd(ev: TouchEvent) {
    const t = tOf(ev);
    if (!t) return;
    if (active) { finishDrag(ctx, true); cleanup(); return; }
    if (swiping) { (row as CardEl & { __justDragged?: boolean }).__justDragged = true; debtSwipeSettle(ctx, row, swipeBase, t.clientX - sx); cleanup(); return; }
    cleanup();
  }
  function onCancel(ev: TouchEvent) {
    if (!tOf(ev)) return;
    if (active) finishDrag(ctx, false);
    else if (swiping) closeDebtSwipe(ctx, row);
    cleanup();
  }
  function cleanup() {
    clearTimeout(timer);
    clearTimeout(holdTimer);
    el.removeEventListener("touchmove", onMove as EventListener);
    el.removeEventListener("touchend", onEnd as EventListener);
    el.removeEventListener("touchcancel", onCancel as EventListener);
  }
  timer = setTimeout(() => {
    if (swiping) return;
    active = true;
    if (!wasJiggling) ctx.enterJiggle();
    beginDrag(ctx, el, sy);
    if (wasJiggling) holdTimer = setTimeout(exitByHold, JIGGLE_EXIT_HOLD);
  }, dragDelay(ctx.jiggleModeRef));
  // 已在编辑模式里、按住又一直没动 → 当成"长按退出"，等同点"保存"。
  // ⚠️必须把__justDragged标成true：这次手势全程零位移，浏览器松手时**会**补发一个click，
  // 不拦的话DebtCard的click监听器会顺手把这笔债务的详情窗打开(退出编辑模式的同时弹出详情，
  // 明显不是用户想要的)。这跟"还款日左滑"当年那条教训是同一类问题的反面：那次是带位移的
  // 拖拽**不会**补发click导致标记位永远清不掉，这次是零位移**会**补发所以必须主动设上。
  function exitByHold() {
    if (moved || !ctx.dragCtxRef.current) return;
    (row as CardEl & { __justDragged?: boolean }).__justDragged = true;
    ctx.exitJiggle();
    cleanup();
  }
  el.addEventListener("touchmove", onMove as EventListener, { passive: false });
  el.addEventListener("touchend", onEnd as EventListener);
  el.addEventListener("touchcancel", onCancel as EventListener);
}

// 桌面鼠标：Pointer Events，纯为桌面浏览器可测。真机上touchstart和pointerdown都会触发，
// 靠pointerType==='mouse'判断避免两边重复处理。
export function onCardPointerDown(e: PointerEvent, el: HTMLElement, row: HTMLElement, ctx: GestureCtx) {
  if (e.pointerType !== "mouse" || ctx.dragCtxRef.current) return;
  (row as CardEl & { __justDragged?: boolean }).__justDragged = false;
  const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
  let timer: ReturnType<typeof setTimeout>;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false, swiping = false, moved = false;
  const wasJiggling = ctx.jiggleModeRef.current;
  const swipeBase = row.dataset.open === "1" ? -DEBT_REVEAL : 0;

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pid) return;
    if (active) {
      if (!moved && (Math.abs(ev.clientX - sx) > JIGGLE_EXIT_SLOP || Math.abs(ev.clientY - sy) > JIGGLE_EXIT_SLOP)) {
        moved = true; clearTimeout(holdTimer);
      }
      if (ctx.dragCtxRef.current) { ctx.dragCtxRef.current.lastClientY = ev.clientY; applyDragFrame(ctx); }
      return;
    }
    if (swiping) {
      row.style.transition = "none";
      row.style.transform = "translateX(" + Math.min(0, Math.max(-DEBT_REVEAL, swipeBase + (ev.clientX - sx))) + "px)";
      return;
    }
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!ctx.jiggleModeRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { swiping = true; clearTimeout(timer); onMove(ev); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cleanup();
  }
  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pid) return;
    if (active) { finishDrag(ctx, true); cleanup(); return; }
    if (swiping) { (row as CardEl & { __justDragged?: boolean }).__justDragged = true; debtSwipeSettle(ctx, row, swipeBase, ev.clientX - sx); cleanup(); return; }
    cleanup();
  }
  function onCancelP(ev: PointerEvent) {
    if (ev.pointerId !== pid) return;
    if (active) finishDrag(ctx, false);
    else if (swiping) closeDebtSwipe(ctx, row);
    cleanup();
  }
  function cleanup() {
    clearTimeout(timer);
    clearTimeout(holdTimer);
    el.removeEventListener("pointermove", onMove as EventListener);
    el.removeEventListener("pointerup", onUp as EventListener);
    el.removeEventListener("pointercancel", onCancelP as EventListener);
  }
  timer = setTimeout(() => {
    if (swiping) return;
    active = true;
    if (!wasJiggling) ctx.enterJiggle();
    beginDrag(ctx, el, sy);
    if (wasJiggling) holdTimer = setTimeout(exitByHold, JIGGLE_EXIT_HOLD);
  }, dragDelay(ctx.jiggleModeRef));
  // 同touch分支：已在编辑模式里按住不动 → 退出编辑模式，并拦掉随后补发的click。
  function exitByHold() {
    if (moved || !ctx.dragCtxRef.current) return;
    (row as CardEl & { __justDragged?: boolean }).__justDragged = true;
    ctx.exitJiggle();
    cleanup();
  }
  el.addEventListener("pointermove", onMove as EventListener);
  el.addEventListener("pointerup", onUp as EventListener);
  el.addEventListener("pointercancel", onCancelP as EventListener);
}
