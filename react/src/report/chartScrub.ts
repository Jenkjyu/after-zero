// 共享手势逻辑——被 MonthlyChart.tsx（下一步）和 PayoffLine.tsx（本文件下方升级）共用，
// 两者是同一类图表（连续时间序列，"读不准确切值"是真实痛点），照抄两遍Touch Events手势
// 基础设施是这个项目一直避免的重复劳动。
//
// ⚠️必须用原生Touch Events + {passive:false}，不能用JSX的onTouchMove——React合成触摸事件
// 默认passive，preventDefault()不会真正阻止原生滚动，这是这个项目反复踩过的坑（见CLAUDE.md
// "手势代码：原样移植，不重新设计"一节）。这个手势比"长按拖拽排序"简单得多——不需要长按
// 计时器、不需要dx/dy方向判断，touchstart落在图表内直接开始scrub（代价：从图表正上方开始的
// 垂直滑动不会触发页面滚动，这是iOS股票类App图表的标准做法，可接受）。
export function nearestIndexForX(clientX: number, rect: DOMRect, count: number): number {
  if (count <= 1) return 0;
  if (rect.width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * (count - 1));
}

export interface ChartScrubOpts {
  count: number;
  onIndexChange(i: number): void;
}

// touchstart/pointerdown落地立即调用一次onIndexChange（这就是"点击=查看精确值"），
// touchmove/pointermove持续调用（这就是"拖动=连续更新"）——同一条代码路径同时满足两个
// 需求，不需要分开写点击和拖动两套处理。桌面走pointerType==='mouse'网关的Pointer Events，
// 纯为桌面浏览器可测；pointermove/pointerup挂在el本身（不是window），跟这个项目
// pay/gestures.ts的onPayPointerDown同一个惯例。
export function attachChartScrub(el: HTMLElement, opts: ChartScrubOpts): () => void {
  function indexForClientX(clientX: number): number {
    return nearestIndexForX(clientX, el.getBoundingClientRect(), opts.count);
  }

  let touchId: number | null = null;
  function touchOf(e: TouchEvent): Touch | null {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) return e.changedTouches[i];
    }
    return null;
  }
  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    touchId = e.touches[0].identifier;
    opts.onIndexChange(indexForClientX(e.touches[0].clientX));
  }
  function onTouchMove(e: TouchEvent) {
    const t = touchOf(e);
    if (!t) return;
    e.preventDefault();
    opts.onIndexChange(indexForClientX(t.clientX));
  }
  function onTouchEnd(e: TouchEvent) {
    if (touchOf(e)) touchId = null;
  }

  let pointerId: number | null = null;
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    pointerId = e.pointerId;
    opts.onIndexChange(indexForClientX(e.clientX));
  }
  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    opts.onIndexChange(indexForClientX(e.clientX));
  }
  function onPointerUp(e: PointerEvent) {
    if (e.pointerId === pointerId) pointerId = null;
  }

  el.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
  el.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
  el.addEventListener("touchend", onTouchEnd as EventListener);
  el.addEventListener("touchcancel", onTouchEnd as EventListener);
  el.addEventListener("pointerdown", onPointerDown as EventListener);
  el.addEventListener("pointermove", onPointerMove as EventListener);
  el.addEventListener("pointerup", onPointerUp as EventListener);
  el.addEventListener("pointercancel", onPointerUp as EventListener);

  return function cleanup() {
    el.removeEventListener("touchstart", onTouchStart as EventListener);
    el.removeEventListener("touchmove", onTouchMove as EventListener);
    el.removeEventListener("touchend", onTouchEnd as EventListener);
    el.removeEventListener("touchcancel", onTouchEnd as EventListener);
    el.removeEventListener("pointerdown", onPointerDown as EventListener);
    el.removeEventListener("pointermove", onPointerMove as EventListener);
    el.removeEventListener("pointerup", onPointerUp as EventListener);
    el.removeEventListener("pointercancel", onPointerUp as EventListener);
  };
}
