// 单条还款提醒卡片——原样搬自vanilla renderPay()里forEach的行构建逻辑，玻璃质感复用现有
// CSS(.pay-row/.pay-swipe-row/.pay/.pay-swipe-btn)。结构参照"在还债务"的DebtCard.tsx：
// touchstart/pointerdown监听器挂在外层(.pay-row)，transform打在内层(.pay-swipe-row)，
// 点击目标(.pay)走普通JSX onClick(不需要preventDefault，跟手势的touchmove不是一回事)。
import { useEffect, useRef } from "react";
import type { Debt } from "../types";
import type { PayGestureCtx } from "./gestures";
import { closePaySwipe, onPayPointerDown, onPayTouchStart } from "./gestures";

export interface PayRowProps {
  d: Debt;
  i: number; // debts数组下标——openDetail/payInstallment都按下标寻址
  next: Date;
  diff: number;
  ctx: PayGestureCtx;
}

export function PayRow({ d, i, next, diff, ctx }: PayRowProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const swipeRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    function handleTouchStart(e: TouchEvent) { onPayTouchStart(e, el!, swipeRowRef.current!, ctx); }
    function handlePointerDown(e: PointerEvent) { onPayPointerDown(e, el!, swipeRowRef.current!, ctx); }
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("pointerdown", handlePointerDown);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("pointerdown", handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFrontClick() {
    const row = swipeRowRef.current as (HTMLDivElement & { __justDragged?: boolean }) | null;
    if (!row) return;
    if (row.__justDragged) { row.__justDragged = false; return; }
    if (row.dataset.open === "1") { closePaySwipe(ctx, row); return; }
    if (ctx.openSwipeRowRef.current && ctx.openSwipeRowRef.current !== row) { closePaySwipe(ctx, ctx.openSwipeRowRef.current); return; }
    window.__azBridge.openDetail(i);
  }

  function onSwipeBtnClick() {
    if (swipeRowRef.current) closePaySwipe(ctx, swipeRowRef.current);
    window.__azBridge.payInstallment(i);
  }

  return (
    <div ref={outerRef} className={"pay-row " + window.urgencyTier(diff)}>
      <div ref={swipeRowRef} className="pay-swipe-row">
        <div className="pay" onClick={onFrontClick}>
          <div className="d">
            <div className="day num">{next.getMonth() + 1}/{next.getDate()}</div>
            <div className="rel">{window.relLabel(diff)}</div>
          </div>
          <div className="w">{d.name}</div>
          <div className="a num">¥{window.fmt(d.monthly)}</div>
        </div>
        <button type="button" className="pay-swipe-btn" onClick={onSwipeBtnClick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          标记已还
        </button>
      </div>
    </div>
  );
}
