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

// ⚠️一行 = **一期待还款项**，不是"一笔债务"（2026-07-29改）。
// 改之前这个页面是遍历debts、每笔只取d.nextDate(最早的未还期)生成一行，所以一笔债务
// 最多出现一次——窗口只有7天时"一笔债务"和"一期还款"是等价的，看不出区别；但自定义
// 窗口能拉到上百天之后就不成立了：107天里一笔月供债务要还3~4期，页面上却只看得到第一期，
// 行数被债务数量卡死，"107天内要还哪些钱"这个问题根本答不了。
// 现在展开成逐期，同一笔债务按日期占多行。
export interface PayItem {
  d: Debt;
  next: Date;
  diff: number;
  /** 这一期自己的金额——不能用d.monthly(那是"最早未还期"的金额，同一笔债务的每一行会
   *  显示成同一个数字)。先息后本/自定义计划各期金额不同，用错了会让大额期次凭空消失。 */
  amount: number;
  /** 在d.plan里的下标，跟d.id一起构成这一行的稳定React key */
  planIdx: number;
  /** 是不是这笔债务最早的未还期——只有它能"销这期"(payInstallment永远销最早的未还期，
   *  跳期销在数据模型上不成立)，其余行的按钮置灰。 */
  isNextUnpaid: boolean;
}

export function App() {
  const debts = useDebts();
  const notify = useNotify();
  const [filter, setFilter] = useState<PayFilter>("next");
  // 自定义筛选的天数(点日历图标选一个未来日期算出来的)。跟filter分开存：filter是"当前用哪种
  // 筛选"，这个是"自定义那种筛选的参数"，切走再切回来时天数还在，不用重新选一次日期。
  const [customDays, setCustomDays] = useState<number | null>(null);
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

  // 展开成"每一期未还款项一行"。已结清债务整笔跳过；日期缺失/格式不对的期次跳过
  // (custom计划允许留空，不能让一个坏日期把整页算崩)。
  const items = useMemo<PayItem[]>(() => {
    const t0 = window.today0();
    const out: PayItem[] = [];
    debts.forEach((d) => {
      if (!window.isActive(d)) return;
      let seenUnpaid = false;
      (d.plan || []).forEach((r, planIdx) => {
        if (r.paid) return;
        const next = window.parseDate(r.date);
        if (!next || isNaN(next.getTime())) return;
        const isNextUnpaid = !seenUnpaid;
        seenUnpaid = true;
        out.push({
          d, next, planIdx, isNextUnpaid,
          diff: Math.round((next.getTime() - t0.getTime()) / 86400000),
          amount: +r.amount || 0,
        });
      });
    });
    return out.sort((a, b) => a.diff - b.diff);
  }, [debts]);

  // "下一期"是唯一一档**按笔**看的(每笔债务只留最早的未还期)，其余各档都是**按期**看
  // (窗口内的每一期各占一行)。这两种视角本来就不在一个轴上，所以这一档没跟其它档共用
  // "天数窗口"那套判定。窗口档位是**累计**口径(30天内天然包含7/15天内那些)。
  const visible = useMemo(() => {
    if (filter === "next") return items.filter((o) => o.isNextUnpaid);
    if (filter === "overdue") return items.filter((o) => o.diff < 0);
    const days =
      filter === "d7" ? 7 : filter === "d15" ? 15 : filter === "d30" ? 30 : customDays;
    if (days === null) return items.filter((o) => o.isNextUnpaid);
    return items.filter((o) => o.diff >= 0 && o.diff <= days);
  }, [items, filter, customDays]);

  // 列表只有一个表头，跟当前筛选一致(原来是写死的"已逾期/7天内/30天内/更晚"四档分组，
  // 窗口能拉到上百天之后那四档绝大多数会全挤进"更晚"，读不出任何结构)。
  const filterLabel =
    filter === "next" ? "下一期"
      : filter === "overdue" ? "已逾期"
        : filter === "custom" ? (customDays ?? 0) + "天内"
          : filter === "d7" ? "7天内"
            : filter === "d15" ? "15天内" : "30天内";

  // 日历图标：弹一个日期选择(复用vanilla共享确认弹窗的opts.date，跟提前结清的opts.amount
  // 是同一套)，选中未来某天后换算成"N天内"。默认值给今天+30天，比空着更好点。
  async function pickCustomRange() {
    const t0 = window.today0();
    const preset = new Date(t0.getTime() + 30 * 86400000);
    const picked = await window.__azBridge.confirmAsync(
      "按日期筛选",
      "选一个日期，列出从今天到那天之间要还的全部款项。",
      { date: window.fmtDate(preset), dateMin: window.fmtDate(t0) }
    );
    if (typeof picked !== "string" || !picked) return;
    const target = window.parseDate(picked);
    if (!target) return;
    const days = Math.round((target.getTime() - t0.getTime()) / 86400000);
    if (days < 0) { window.__azBridge.toast("请选择今天或以后的日期"); return; }
    setCustomDays(days);
    setFilter("custom");
  }

  return (
    <>
      <Hero soonest={items[0] ?? null} notifyEnabled={notify.enabled} onBellClick={openNotifySheet} />
      <div className="pay-stats"><Stats items={items} /></div>
      <div className="pay-filter">
        <FilterBar
          value={filter}
          customDays={customDays}
          onChange={setFilter}
          onPickCustom={pickCustomRange}
        />
      </div>
      {/* items.length===0(全部结清/没有待还项)时列表区留空，不显示"该分类下暂无待还款项"
          这条footnote——那条footnote是给"有待还项、但当前筛选条件下一条都不匹配"这种情况的，
          跟vanilla renderPay()里"if(!items.length) return"提前退出、不构建visible的逻辑一致。 */}
      <div id="payList">
        {items.length > 0 ? <PayList visible={visible} label={filterLabel} ctx={ctx} /> : null}
      </div>
    </>
  );
}
