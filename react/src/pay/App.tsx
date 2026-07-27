// "还款日"页顶层组件——原样搬vanilla renderPay()的整体编排(items计算/筛选/分组由子组件
// 分担)，铃铛点开的#notifySheet第八步(React迁移收尾)后已经是React自己拥有的sheet
// (shared/state.ts的openNotifySheet)，不再经过__azBridge。
import { useEffect, useMemo, useRef, useState } from "react";
import type { Debt } from "../types";
import { openNotifySheet, useDebts, useNotify } from "../shared/state";
import type { PayGestureCtx } from "./gestures";
import { closePaySwipe } from "./gestures";
import { Hero } from "./Hero";
import { Stats } from "./Stats";
import { FilterBar } from "./FilterBar";
import type { PayFilter } from "./FilterBar";
import { PayList } from "./PayList";

export interface PayItem {
  d: Debt;
  next: Date;
  diff: number;
}

export function App() {
  const debts = useDebts();
  const notify = useNotify();
  const [filter, setFilter] = useState<PayFilter>("all");
  const openSwipeRowRef = useRef<HTMLElement | null>(null);
  const ctx: PayGestureCtx = useMemo(() => ({ openSwipeRowRef }), []);

  // 切到别的tab时收起打开的滑块——照抄"在还债务"DebtList.tsx的az:tab-changed监听模式，
  // vanilla原来tabbar点击处理里直接调closePaySwipe(paySwipeOpen)那行已经删掉
  // (paySwipeOpen这个vanilla变量随这次迁移一起消失)，改由这里响应事件。
  useEffect(() => {
    function onTabChanged(e: Event) {
      const detail = (e as CustomEvent<{ view: string }>).detail;
      if (detail && detail.view === "pay") return;
      if (openSwipeRowRef.current) closePaySwipe(ctx, openSwipeRowRef.current);
    }
    window.addEventListener("az:tab-changed", onTabChanged);
    return () => window.removeEventListener("az:tab-changed", onTabChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo<PayItem[]>(() => {
    const t0 = window.today0();
    return debts
      .filter((d) => window.isActive(d) && d.nextDate)
      .map((d) => {
        const next = window.parseDate(d.nextDate as string) as Date;
        const diff = Math.round((next.getTime() - t0.getTime()) / 86400000);
        return { d, next, diff };
      })
      .sort((a, b) => a.diff - b.diff);
  }, [debts]);

  const visible = useMemo(() => {
    return items.filter((o) => {
      if (filter === "overdue") return o.diff < 0;
      if (filter === "week") return o.diff >= 0 && o.diff <= 7;
      if (filter === "month") return o.diff >= 0 && o.diff <= 30;
      return true;
    });
  }, [items, filter]);

  return (
    <>
      <Hero soonest={items[0] ?? null} notifyEnabled={notify.enabled} onBellClick={openNotifySheet} />
      <div className="pay-stats"><Stats items={items} /></div>
      <div className="pay-filter"><FilterBar value={filter} onChange={setFilter} /></div>
      {/* items.length===0(全部结清/没有待还项)时列表区留空，不显示"该分类下暂无待还款项"
          这条footnote——那条footnote是给"有待还项、但当前筛选条件下一条都不匹配"这种情况的，
          跟vanilla renderPay()里"if(!items.length) return"提前退出、不构建visible的逻辑一致。 */}
      <div id="payList">{items.length > 0 ? <PayList visible={visible} ctx={ctx} /> : null}</div>
    </>
  );
}
