// "统计"页顶层组件——纯data→JSX展示，没有任何本地状态（跟vanilla原来的renderReportScreen()
// 一样，是完全由debts派生的无状态视图，见CLAUDE.md"统计"一节）。数据变化时自动重渲染，
// 靠useDebts()订阅az:state-changed事件，不需要"打开时才渲染"这套逻辑（这tab不是subpage）。
//
// "统计tab口径修正"这轮（P1）：MonthlyChart换成PressureChart（未来12个月还款压力），
// ReportTables（底部4张平铺明细表）整个删除——它跟债务页重复、把timeline几十行原样铺出来
// 让页面很长、视觉上是裸<table>跟卡片体系不一致，而"看完整明细"这个需求由导出Excel/PDF
// 承担（那两个函数是100%vanilla的独立实现，删这里不影响它们）。
// 模块顺序按"先回答哪个问题"排：未来压力 → 是否在下降 → 结构分析。
import { useMemo } from "react";
import { useDebts, usePremium } from "../shared/state";
import { Hero } from "./Hero";
import { BalanceBars } from "./BalanceBars";
import { TypeStack } from "./TypeStack";
import { PayoffLine } from "./PayoffLine";
import { PressureChart } from "./PressureChart";

export function App() {
  const debts = useDebts();
  const premium = usePremium();
  const data = useMemo(() => window.computeReportData(debts), [debts]);
  const pressure = useMemo(() => window.computeUpcomingPressure(debts, 12), [debts]);

  return (
    <>
      <Hero data={data} debts={debts} premium={premium} />
      <div className="viz-root">
        <PressureChart data={pressure} />
        <PayoffLine data={data} />
        <BalanceBars data={data} />
        <TypeStack data={data} />
      </div>
    </>
  );
}
