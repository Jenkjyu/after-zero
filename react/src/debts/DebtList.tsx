// 排序控制条("保存"按钮+排序下拉框) + 长按拖拽提示 + 卡片列表容器 + "新增一笔"按钮 + 已结清列表——
// 拥有jiggleMode/dragCtx/openSwipeRow这几个手势相关状态(只有这个组件内部关心)，
// 每张卡片的实际手势由 gestures.ts 里原样照抄的状态机驱动，见该文件顶部注释。
//
// 不渲染自己的<section>包壳——语义分区的<section id="view-debts">留在vanilla那边
// (React只挂载在它内部的一个子div上)，这里直接是Fragment，跟vanilla原来"header/topSummary/
// view-debts被折叠进同一个.view.active容器"这条简化决定保持一致(见CLAUDE.md"React 迁移"一节)。
import { useEffect, useMemo, useRef, useState } from "react";
import type { Debt, SortKey } from "../types";
import { DEBT_SORTS, useDebtSort } from "./useDebtSort";
import type { GestureCtx } from "./gestures";
import { closeDebtSwipe, finishDrag } from "./gestures";
import { DebtCard } from "./DebtCard";
import { SettledList } from "./SettledList";
import { keyFor } from "../shared/state";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "rate-desc", label: "利率 高→低" },
  { value: "rate-asc", label: "利率 低→高" },
  { value: "orig-desc", label: "借款金额 高→低" },
  { value: "orig-asc", label: "借款金额 低→高" },
  { value: "bal-desc", label: "剩余待还 高→低" },
  { value: "bal-asc", label: "剩余待还 低→高" },
  { value: "monthly-desc", label: "月供金额 高→低" },
  { value: "monthly-asc", label: "月供金额 低→高" },
  { value: "terms-desc", label: "剩余期数 多→少" },
  { value: "terms-asc", label: "剩余期数 少→多" },
  { value: "custom", label: "自定义" },
];

export interface DebtListProps {
  debts: Debt[];
}

export function DebtList({ debts }: DebtListProps) {
  const [sort, setSort] = useDebtSort();
  const [jiggleMode, setJiggleMode] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragCtxRef = useRef<GestureCtx["dragCtxRef"]["current"]>(null);
  const jiggleModeRef = useRef(jiggleMode);
  const openSwipeRowRef = useRef<HTMLElement | null>(null);

  useEffect(() => { jiggleModeRef.current = jiggleMode; }, [jiggleMode]);

  // #view-debts.jiggling 这个class驱动了"保存"按钮显隐/长按提示隐藏/销这期按钮及恢复
  // 按钮禁用这几条既有CSS规则(见www/index.html里#view-debts.jiggling相关选择器)，
  // 这里只需要把这一个class同步到vanilla仍然拥有的#view-debts容器上，不用逐条重新写。
  useEffect(() => {
    document.getElementById("view-debts")?.classList.toggle("jiggling", jiggleMode);
  }, [jiggleMode]);

  function enterJiggle() {
    if (jiggleModeRef.current) return;
    if (openSwipeRowRef.current) closeDebtSwipe(ctx, openSwipeRowRef.current);
    setJiggleMode(true);
  }
  function exitJiggle() {
    if (!jiggleModeRef.current) return;
    if (dragCtxRef.current) finishDrag(ctx, false);
    setJiggleMode(false);
  }

  function onCommitReorder(newOrder: Debt[]) {
    window.__azBridge.commitReorder(newOrder);
    window.__azBridge.saveAll();
    const activeNow = window.__azBridge.getDebts().filter((d) => window.isActive(d));
    setSort(window.detectMatchingSort(activeNow, DEBT_SORTS) as SortKey);
    window.__azBridge.renderAll();
  }

  // ctx里全部是ref(引用稳定)和引用稳定的函数(enterJiggle只用到setJiggleMode这个稳定的
  // setState函数，onCommitReorder只用到window.__azBridge/setSort，setSort本身也稳定)，
  // 所以可以只建一次，不用在每次依赖变化时重建——这样DebtCard里"只attach一次"的手势监听器
  // effect捕获的ctx永远是同一个对象，不会有闭包过期的风险。
  const ctx: GestureCtx = useMemo(
    () => ({ containerRef, dragCtxRef, jiggleModeRef, openSwipeRowRef, enterJiggle, onCommitReorder }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // 切到别的tab时vanilla的tabbar点击处理会派发这个事件(见www/index.html)，通知这里
  // 收起手势相关状态——跟vanilla原来在tabbar click里直接调exitJiggle()/closeDebtSwipe()
  // 是同一件事，只是隔着React边界要用事件而不是直接函数调用。
  useEffect(() => {
    function onTabChanged(e: Event) {
      const detail = (e as CustomEvent<{ view: string }>).detail;
      if (detail && detail.view === "debts") return;
      exitJiggle();
      if (openSwipeRowRef.current) closeDebtSwipe(ctx, openSwipeRowRef.current);
    }
    window.addEventListener("az:tab-changed", onTabChanged);
    return () => window.removeEventListener("az:tab-changed", onTabChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 硬件/手势返回键"最上层先关"优先级链(见www/index.html的window.__handleBackButton)原来
  // 第一条判断就是jiggleMode——现在这个状态在React这边，vanilla看不到，改成React挂载时把
  // 这个判断注册成一个全局函数，vanilla的__handleBackButton调用它当第一优先级检查。
  // 返回true表示"我自己关掉了一层东西"(退出编辑模式)，false表示"没什么可关的"，
  // 由vanilla继续往下判断别的浮层。
  useEffect(() => {
    window.__azDebtsBack = function () {
      if (!ctx.jiggleModeRef.current) return false;
      exitJiggle();
      return true;
    };
    return () => { delete window.__azDebtsBack; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indexed = debts.map((d, i) => ({ d, i }));
  const active = indexed.filter((o) => window.isActive(o.d));
  const settled = indexed.filter((o) => !!o.d.settled);
  let sorted = active;
  if (sort !== "custom") {
    const keyFn = DEBT_SORTS[sort] ?? DEBT_SORTS["rate-desc"];
    sorted = active.slice().sort((a, b) => keyFn(a.d) - keyFn(b.d));
  }

  return (
    <>
      <div className="section-label">
        <span>在还债务</span>
        <div className="sort-controls">
          <button type="button" id="jiggleDoneBtn" className="jiggle-done-btn" onClick={exitJiggle}>保存</button>
          <select
            id="debtSortSel"
            className="sort-sel"
            value={sort}
            disabled={jiggleMode}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="debt-hint">长按卡片可拖动排序</div>
      <div id="debtList" ref={containerRef}>
        {sorted.map(({ d, i }) => (
          <DebtCard key={keyFor(d)} d={d} i={i} jiggleMode={jiggleMode} ctx={ctx} />
        ))}
      </div>
      <button type="button" className="add-btn" id="addBtn" onClick={() => window.__azBridge.openEdit(-1)}>＋ 新增一笔</button>
      <SettledList items={settled} />
    </>
  );
}
