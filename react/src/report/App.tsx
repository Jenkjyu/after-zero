// "统计"页顶层组件——纯data→JSX展示，没有任何本地状态（跟vanilla原来的renderReportScreen()
// 一样，是完全由debts派生的无状态视图，见CLAUDE.md"统计"一节）。数据变化时自动重渲染，
// 靠useDebts()订阅az:state-changed事件，不需要"打开时才渲染"这套逻辑（这tab不是subpage）。
//
// "统计tab视觉+交互升级"这轮（第8步）：Kpis/ExportActions换成Hero/ExportMenu（独立的
// section-label"统计"折进Hero的hero-label，跟"债务"/"还款日"两个tab的hero都没有独立
// section-label的做法保持一致），viz-root里新增MonthlyChart（第4张图）。
import { useMemo } from "react";
import { useDebts, usePremium } from "../shared/state";
import { Hero } from "./Hero";
import { BalanceBars } from "./BalanceBars";
import { TypeStack } from "./TypeStack";
import { PayoffLine } from "./PayoffLine";
import { MonthlyChart } from "./MonthlyChart";
import { ReportTables } from "./ReportTables";

export function App() {
  const debts = useDebts();
  const premium = usePremium();
  const data = useMemo(() => window.computeReportData(debts), [debts]);
  const monthly = useMemo(() => window.computeMonthlyRepayment(debts), [debts]);

  return (
    <>
      <Hero data={data} debts={debts} premium={premium} />
      <div className="viz-root">
        <BalanceBars data={data} />
        <TypeStack data={data} />
        <PayoffLine data={data} />
        <MonthlyChart months={monthly} />
        <ReportTables data={data} monthly={monthly} />
      </div>
    </>
  );
}
