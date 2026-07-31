// 甜甜圈的拖拽旋转手势——按角度增量转，抬手后带一点惯性。
//
// ⚠️必须用原生 Touch Events + {passive:false}，不能用 JSX 的 onTouchMove——React 合成
// 触摸事件默认 passive，preventDefault() 不会真正阻止原生滚动，这是这个项目反复踩过的坑
// （见 CLAUDE.md"手势代码：原样移植，不重新设计"一节）。这里跟 chartScrub.ts 是同一类
// 处理：touchstart 落在饼上就接管，touchmove 逐次 preventDefault 挡掉纵向滚动。
// 代价是从饼正上方开始的垂直滑动不会滚页面——饼只占一小块高度，可接受。
//
// 旋转角度不走 React state：拖拽期间每帧 setState 会触发整棵子树重渲染，手势会顿。
// 改成回调里直接改 DOM（外层组件把 transform 和标签坐标的更新函数传进来）。

export interface PieRotateOpts {
  /** 每次角度变化时调用，参数是新的绝对角度（度） */
  onRotate(deg: number): void;
  /** 读当前角度——惯性动画要在上一帧的基础上继续加 */
  getRotation(): number;
}

export function attachPieRotate(el: HTMLElement, opts: PieRotateOpts): () => void {
  let dragging = false;
  let lastAng = 0;
  let vel = 0;
  let raf = 0;

  function angOf(clientX: number, clientY: number): number {
    const b = el.getBoundingClientRect();
    return (Math.atan2(clientY - (b.top + b.height / 2), clientX - (b.left + b.width / 2)) * 180) / Math.PI;
  }
  function start(cx: number, cy: number) {
    dragging = true;
    lastAng = angOf(cx, cy);
    vel = 0;
    cancelAnimationFrame(raf);
  }
  function move(cx: number, cy: number) {
    if (!dragging) return;
    const a = angOf(cx, cy);
    let d = a - lastAng;
    // 跨越 ±180° 那条线时，原始差值会跳 360——不修正的话饼会突然反向猛转一圈
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    opts.onRotate(opts.getRotation() + d);
    vel = d;
    lastAng = a;
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    const spin = () => {
      vel *= 0.94;
      if (Math.abs(vel) < 0.08) return;
      opts.onRotate(opts.getRotation() + vel);
      raf = requestAnimationFrame(spin);
    };
    spin();
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    start(e.touches[0].clientX, e.touches[0].clientY);
  }
  function onTouchMove(e: TouchEvent) {
    if (!dragging) return;
    e.preventDefault();
    move(e.touches[0].clientX, e.touches[0].clientY);
  }
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;   // 触摸走上面那套，避免两边重复处理
    start(e.clientX, e.clientY);
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === "mouse") move(e.clientX, e.clientY);
  }
  function onPointerUp(e: PointerEvent) {
    if (e.pointerType === "mouse") end();
  }

  el.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
  el.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
  el.addEventListener("touchend", end);
  el.addEventListener("touchcancel", end);
  el.addEventListener("pointerdown", onPointerDown as EventListener);
  el.addEventListener("pointermove", onPointerMove as EventListener);
  el.addEventListener("pointerup", onPointerUp as EventListener);
  el.addEventListener("pointercancel", onPointerUp as EventListener);

  return function cleanup() {
    cancelAnimationFrame(raf);
    el.removeEventListener("touchstart", onTouchStart as EventListener);
    el.removeEventListener("touchmove", onTouchMove as EventListener);
    el.removeEventListener("touchend", end);
    el.removeEventListener("touchcancel", end);
    el.removeEventListener("pointerdown", onPointerDown as EventListener);
    el.removeEventListener("pointermove", onPointerMove as EventListener);
    el.removeEventListener("pointerup", onPointerUp as EventListener);
    el.removeEventListener("pointercancel", onPointerUp as EventListener);
  };
}

/** 0° 指向 12 点、顺时针为正 */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  // 只有一个类型时是整圆——SVG 的 arc 画不出 360°，要用两段或者这种"差一点点"的写法
  if (a1 - a0 >= 359.99) {
    return `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} Z`;
  }
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${cx},${cy} L${p0[0].toFixed(2)},${p0[1].toFixed(2)} A${r},${r} 0 ${large} 1 ${p1[0].toFixed(2)},${p1[1].toFixed(2)} Z`;
}
