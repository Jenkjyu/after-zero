// 单条还款提醒卡片——原样搬自vanilla renderPay()里forEach的行构建逻辑，玻璃质感复用现有
// CSS(.pay-row/.pay-swipe-row/.pay/.pay-swipe-btn)。结构参照"在还债务"的DebtCard.tsx：
// touchstart/pointerdown监听器挂在外层(.pay-row)，transform打在内层(.pay-swipe-row)，
// 点击目标(.pay)走普通JSX onClick(不需要preventDefault，跟手势的touchmove不是一回事)。
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { Debt } from "../types";
import type { PayGestureCtx } from "./gestures";
import { closePaySwipe, onPayPointerDown, onPayTouchStart } from "./gestures";
import { openDetailSheet } from "../shared/state";

export interface PayRowProps {
  d: Debt;
  next: Date;
  diff: number;
  /** 这一期的金额(不是d.monthly，见App.tsx里PayItem的注释) */
  amount: number;
  /** 是不是这笔债务最早的未还期——false时"销这期"按钮置灰 */
  canSettle: boolean;
  ctx: PayGestureCtx;
}

export function PayRow({ d, next, diff, amount, canSettle, ctx }: PayRowProps) {
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
    openDetailSheet(d.id);
  }

  function onFrontKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onFrontClick();
  }

  function onSwipeBtnClick() {
    // 非最早未还期：payInstallment永远销最早的那一期，跳期销在数据模型上不成立。
    // 按钮置灰但**保留可点**(不用disabled属性——全局button:disabled有pointer-events:none，
    // 那样点了完全没反应，用户会以为是bug)，点了给一句说明。
    if (!canSettle) {
      window.__azBridge.toast("请先销掉这笔债务更早的未还期次");
      return;
    }
    if (swipeRowRef.current) closePaySwipe(ctx, swipeRowRef.current);
    window.__azBridge.payInstallment(d.id);
  }

  return (
    <div ref={outerRef} className={"pay-row " + window.urgencyTier(diff)}>
      <div ref={swipeRowRef} className="pay-swipe-row">
        <div className="pay" role="button" tabIndex={0} aria-label={`查看${d.name}详情`} onClick={onFrontClick} onKeyDown={onFrontKeyDown}>
          <div className="d">
            <div className="day num">{next.getMonth() + 1}/{next.getDate()}</div>
            <div className="rel">{window.relLabel(diff)}</div>
          </div>
          <div className="w">{d.name}</div>
          <div className="a num">¥{window.fmt(amount)}</div>
        </div>
        <button
          type="button"
          className={"pay-swipe-btn" + (canSettle ? "" : " is-disabled")}
          aria-disabled={canSettle ? undefined : true}
          onClick={onSwipeBtnClick}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          销这期
        </button>
      </div>
    </div>
  );
}
