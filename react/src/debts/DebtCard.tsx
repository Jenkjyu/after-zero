// 单张债务卡片——原样搬自renderDebts()里forEach的卡片构建逻辑，玻璃质感/严重度色晕全部
// 复用现有CSS(.debt/.debt-front/.debt.crit等)。手势(长按拖拽/左滑)接到 gestures.ts 里
// 原样照抄的状态机，这里只负责: 1) 渲染 2) 用ref把真实DOM节点交给手势函数 3) 点击/滑动
// 按钮的业务回调(开详情/销这期)桥接回vanilla。
import { useEffect, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { Debt } from "../types";
import type { CardEl, GestureCtx } from "./gestures";
import { closeDebtSwipe, onCardPointerDown, onCardTouchStart } from "./gestures";
import { openDetailSheet } from "../shared/state";

export interface DebtCardProps {
  d: Debt;
  jiggleMode: boolean;
  ctx: GestureCtx;
}

export function DebtCard({ d, jiggleMode, ctx }: DebtCardProps) {
  const cardRef = useRef<CardEl | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // __o跟vanilla的el.__o是同一个技巧：把{d}直接挂在DOM节点上，finishDrag提交重排时
  // 从DOM子节点顺序反查每张卡片对应哪个debt对象。
  useEffect(() => {
    if (cardRef.current) cardRef.current.__o = { d };
  }, [d]);

  useEffect(() => {
    const el = cardRef.current, row = rowRef.current;
    if (!el || !row) return;
    function handleTouchStart(e: TouchEvent) { onCardTouchStart(e, el!, row!, ctx); }
    function handlePointerDown(e: PointerEvent) { onCardPointerDown(e, el!, row!, ctx); }
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("pointerdown", handlePointerDown);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("pointerdown", handlePointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFrontClick() {
    const row = rowRef.current as (HTMLDivElement & { __justDragged?: boolean }) | null;
    if (!row) return;
    if (row.__justDragged) { row.__justDragged = false; return; }
    if (row.dataset.open === "1") { closeDebtSwipe(ctx, row); return; }
    if (jiggleMode) return;
    openDetailSheet(d.id);
  }

  function onFrontKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onFrontClick();
  }

  function onSwipeBtnClick() {
    const row = rowRef.current;
    if (row) closeDebtSwipe(ctx, row);
    window.__azBridge.payInstallment(d.id);
  }

  const rate = d.rate || 0;
  const sevClass = rate >= 18 ? "crit" : rate >= 10 ? "warn" : "good";
  const rc = window.rateClass(rate);
  // 随机抖动相位/时长——vanilla每次renderDebts()都会重新生成(不是只在卡片首次挂载时定一次)，
  // 这里同样每次渲染都重新算，跟vanilla的实际行为(而不是理论上"应该"的行为)保持一致。
  const jiggleStyle: CSSProperties = {
    ["--jr" as never]: (0.35 + Math.random() * 0.25).toFixed(2),
    ["--jd" as never]: (-(Math.random() * 0.24)).toFixed(3) + "s",
  };

  return (
    <div ref={cardRef} className={"debt " + sevClass + (jiggleMode ? " jiggle" : "")} style={jiggleStyle}>
      <div ref={rowRef} className="debt-row">
        <div className="debt-front" role="button" tabIndex={0} aria-label={`查看${d.name}详情`} onClick={onFrontClick} onKeyDown={onFrontKeyDown}>
          <div className="debt-top">
            <div>
              <div className="debt-nm">{d.name}</div>
              <div className="debt-meta">{(d.funder ? "出资方：" + d.funder : "") + (d.type ? " · " + d.type : "")}</div>
            </div>
            <span className="debt-amtbox">
              <span className="debt-bal num">¥{window.fmt(d.balance)}</span>
              <span className="debt-ballab">剩余待还</span>
            </span>
          </div>
          <div className="debt-tags">
            {rate ? <span className={"tag " + rc}>{rate.toFixed(2)}%</span> : null}
            <span className="tag neutral">{d.oneTime ? "一次性 ¥" + window.fmt(d.monthly) : "下期 ¥" + window.fmt(d.monthly)}</span>
            <span className="tag neutral">剩 {d.terms || 0}/{d.totalTerms || 0} 期</span>
          </div>
        </div>
        <button type="button" className="debt-swipe-btn" onClick={onSwipeBtnClick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          销这期
        </button>
      </div>
    </div>
  );
}
