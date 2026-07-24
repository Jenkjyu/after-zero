// "统计"页顶层组件——纯data→JSX展示，没有任何本地状态（跟vanilla原来的renderReportScreen()
// 一样，是完全由debts派生的无状态视图，见CLAUDE.md"统计"一节）。数据变化时自动重渲染，
// 靠useDebts()订阅az:state-changed事件，不需要"打开时才渲染"这套逻辑（这tab不是subpage）。
import { useMemo } from "react";
import { useDebts, usePremium } from "../shared/state";
import { Kpis } from "./Kpis";
import { ExportActions } from "./ExportActions";
import { BalanceBars } from "./BalanceBars";
import { TypeStack } from "./TypeStack";
import { PayoffLine } from "./PayoffLine";
import { ReportTables } from "./ReportTables";

export function App() {
  const debts = useDebts();
  const premium = usePremium();
  const data = useMemo(() => window.computeReportData(debts), [debts]);

  return (
    <>
      <div className="section-label"><span>统计</span></div>
      <Kpis data={data} />
      <ExportActions premium={premium} />
      <div className="viz-root">
        <BalanceBars data={data} />
        <TypeStack data={data} />
        <PayoffLine data={data} />
        <ReportTables data={data} />
      </div>
    </>
  );
}
