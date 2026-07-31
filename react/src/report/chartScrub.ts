// 连续时间序列图的press+drag scrub手势。**当前唯一的消费者是 PayoffLine.tsx**——
// 当初是给它和 MonthlyChart.tsx 两张图共用而抽出来的，MonthlyChart已删除，接替它的
// PressureChart 在2026-07-29改成了"横向滚动看更多月份 + 点柱子读数"，横滑让给了原生
// 滚动，不能再叠一层拦截滚动的scrub(两者会直接打架)，所以它不用这个文件。
// 保留这份抽象是因为它依然是"连续序列图怎么读精确值"的标准答案，以后再加同类图表直接复用。
//
// ⚠️必须用原生Touch Events + {passive:false}，不能用JSX的onTouchMove——React合成触摸事件
// 默认passive，preventDefault()不会真正阻止原生滚动，这是这个项目反复踩过的坑（见CLAUDE.md
// "手势代码：原样移植，不重新设计"一节）。
//
// ⚠️2026-08-01改过一轮（第一次）：早期版本touchstart落在图表内就直接判定成scrub、不看
// 方向，导致上下滑页面路过图表时会被当场拦截、页面滚不动("干涉，影响手感"，真机反馈）。
// 现在跟pay/gestures.ts的onPayTouchStart同一套8px阈值方向判断——touchmove里按dx/dy谁先
// 过阈值决定这次触摸是"拖图表"还是"划页面"，纵向占主导就放行给原生滚动、全程不preventDefault。
//
// ⚠️2026-08-01改过第二轮（真机反馈这一轮修的两件事）：
// ①**索引匹配从"假设点均匀分布"改成"按真实渲染位置找最近点"**——旧版nearestIndexForX
// 只看count，按`round(ratio*(count-1))`算索引，隐含假设n个点在容器宽度里均匀分布；但
// Journey.tsx这张图的点是按真实时间比例摆放的(时间轴前密后疏是常态)，均匀假设会让触摸
// 位置跟视觉位置对不上——真机反馈"反馈的位置比手指按压的位置偏左"，根因就是这个：点越靠
// 前密集，同样的触摸比例按"点数"算出来的索引，其真实渲染位置(时间轴意义上)比手指位置更
// 靠前。现在改成要求调用方传入`xFracFor(i)`(每个点的真实位置比例，跟渲染坐标同一套、
// 按i单调不减)，二分查找最近的那个，两套坐标系统一。
// ②**新增onEnd回调**：早期版本touchend/touchcancel只清touchId，没有任何"恢复初始状态"
// 的动作，导致一旦碰过图表，读数/游标会一直粘着显示，直到下次触摸才更新——这不是标准的
// press-and-hold交互。现在松手/取消统一调用opts.onEnd()，恢复到未拖拽前的样子(消费方
// 负责隐藏游标、还原占位文字)。"点一下看数值"这个中间态设计已经被这条新要求取代，不再
// 保留(松手就该回到初始态，不是停留在最后点到的值)。
export function nearestIndexForX(clientX: number, rect: DOMRect, count: number, xFracFor: (i: number) => number): number {
  if (count <= 1) return 0;
  if (rect.width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  // 二分查找第一个 xFracFor(i) >= ratio 的位置，再跟它前一个比谁更近——xFracFor必须
  // 按i单调不减(时间轴天然升序，成立)，不满足这个前提二分查找不成立。
  let lo = 0, hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xFracFor(mid) < ratio) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(xFracFor(lo - 1) - ratio) <= Math.abs(xFracFor(lo) - ratio)) return lo - 1;
  return lo;
}

export interface ChartScrubOpts {
  count: number;
  /** 每个点在图表宽度里的真实位置比例(0~1)，必须跟渲染用的同一套坐标、按i单调不减 */
  xFracFor(i: number): number;
  onIndexChange(i: number): void;
  /** 松手/手势取消时调用(不管这次手势有没有真的触发过scrub)，用来恢复到拖拽前的初始展示 */
  onEnd(): void;
}

// 桌面鼠标（pointerType==='mouse'）落地立即调用一次onIndexChange、pointermove持续调用——
// 鼠标没有跟原生滚动抢的问题，不需要方向判断，纯为桌面浏览器可测。pointermove/pointerup
// 挂在el本身（不是window），跟这个项目pay/gestures.ts的onPayPointerDown同一个惯例。
// 触摸走上面的方向判断版本，见文件顶部2026-08-01那条注释。
export function attachChartScrub(el: HTMLElement, opts: ChartScrubOpts): () => void {
  function indexForClientX(clientX: number): number {
    return nearestIndexForX(clientX, el.getBoundingClientRect(), opts.count, opts.xFracFor);
  }

  let touchId: number | null = null;
  let axis: "x" | "y" | null = null;
  let sx = 0, sy = 0;
  function touchOf(e: TouchEvent): Touch | null {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) return e.changedTouches[i];
    }
    return null;
  }
  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    touchId = e.touches[0].identifier;
    axis = null;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }
  function onTouchMove(e: TouchEvent) {
    const t = touchOf(e);
    if (!t) return;
    if (axis === null) {
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { axis = "y"; return; } // 交给原生滚动
      if (Math.abs(dx) > 8) axis = "x"; else return; // 还没过阈值，先不表态
    }
    if (axis !== "x") return;
    e.preventDefault();
    opts.onIndexChange(indexForClientX(t.clientX));
  }
  function onTouchEnd(e: TouchEvent) {
    if (touchOf(e)) touchId = null;
    axis = null;
    opts.onEnd();
  }
  function onTouchCancel(e: TouchEvent) {
    if (touchOf(e)) touchId = null;
    axis = null;
    opts.onEnd();
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
    if (e.pointerId === pointerId) { pointerId = null; opts.onEnd(); }
  }

  el.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
  el.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
  el.addEventListener("touchend", onTouchEnd as EventListener);
  el.addEventListener("touchcancel", onTouchCancel as EventListener);
  el.addEventListener("pointerdown", onPointerDown as EventListener);
  el.addEventListener("pointermove", onPointerMove as EventListener);
  el.addEventListener("pointerup", onPointerUp as EventListener);
  el.addEventListener("pointercancel", onPointerUp as EventListener);

  return function cleanup() {
    el.removeEventListener("touchstart", onTouchStart as EventListener);
    el.removeEventListener("touchmove", onTouchMove as EventListener);
    el.removeEventListener("touchend", onTouchEnd as EventListener);
    el.removeEventListener("touchcancel", onTouchCancel as EventListener);
    el.removeEventListener("pointerdown", onPointerDown as EventListener);
    el.removeEventListener("pointermove", onPointerMove as EventListener);
    el.removeEventListener("pointerup", onPointerUp as EventListener);
    el.removeEventListener("pointercancel", onPointerUp as EventListener);
  };
}
