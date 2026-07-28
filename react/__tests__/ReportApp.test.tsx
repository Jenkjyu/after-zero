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
    // 已结清的网贷A不计入统计(computeReportData按!d.settled过滤)——限定在Hero的KPI网格里，
    // 底部总结卡的"利率最高"也会显示同一个6.00%
    const kpiRates = [...document.querySelectorAll(".summary .kpi .v")].map((el) => el.textContent);
    expect(kpiRates).toContain("6.00%");
    // 导出按钮收进了右上角"⋮"菜单，默认关闭，点触发器才显示
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("导出报表"));
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.getByText("导出 PDF")).toBeInTheDocument();
    // PressureChart取代了MonthlyChart，且排在viz-root第一位（"未来压力"是这一页最该先看到的）
    expect(screen.getByText("未来12个月还款压力")).toBeInTheDocument();
    expect(screen.queryByText("月还款统计")).not.toBeInTheDocument();
    // ReportTables(底部4张平铺明细表)整个删除——完整明细由导出Excel/PDF承担
    expect(screen.queryByText("数据明细表")).not.toBeInTheDocument();
    expect(screen.queryByText("月还款明细")).not.toBeInTheDocument();
    const blocks = [...document.querySelectorAll(".viz-block .viz-title")].map((el) => el.textContent);
    expect(blocks).toEqual([
      "未来12个月还款压力",
      "负债余额走势",
      "各债务剩余待还",
      "债务类型占比",
      "统计总结",
    ]);
  });
});
