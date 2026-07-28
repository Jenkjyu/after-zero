// 跟其余component测试(用手造ReportData fixture)不同，这里故意走真实的
// window.computeReportData(debts)，验证App.tsx跟useDebts()/usePremium()桥接、
// 以及真实calc.js数据链路整体接得上，不只是各组件各自正确。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/report/App";
import { makeMockBridge, makeDebt } from "./mockBridge";

describe("report App", () => {
  it("挂载后基于真实debts数据渲染Hero+图表+导出菜单", () => {
    const debts = [
      makeDebt({ name: "银行贷", type: "银行贷", balance: 3000, rate: 6 }),
      makeDebt({ name: "网贷A", type: "网贷", balance: 1000, rate: 18, settled: true }),
    ];
    window.__azBridge = makeMockBridge({ debts, premium: { premium: null } });
    render(<App />);
    // hero-label从"统计"改成了"在还总负债"——原来大金额上方没有任何口径标签(见Hero.tsx)
    expect(screen.getByText("在还总负债")).toBeInTheDocument();
    expect(screen.getByText("只算本金")).toBeInTheDocument();
    // 已结清的网贷A不计入统计(computeReportData按!d.settled过滤)
    expect(screen.getByText("6.00%")).toBeInTheDocument();
    // 导出按钮收进了右上角"⋮"菜单，默认关闭，点触发器才显示
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("导出报表"));
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.getByText("导出 PDF")).toBeInTheDocument();
    // MonthlyChart(第4张图)已经接入viz-root
    expect(screen.getByText("月还款统计")).toBeInTheDocument();
    expect(screen.getByText("月还款明细")).toBeInTheDocument();
  });
});
