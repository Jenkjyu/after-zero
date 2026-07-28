// 底部统计总结卡——替代P1删掉的4张平铺明细表。原则是"只放这一页别处看不到的结论"，
// 所以测试重点是那几个新数字算得对、以及口径提示在。
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCard } from "../src/report/SummaryCard";
import { makeDebt } from "./mockBridge";

function dataOf(debts: Parameters<typeof window.computeReportData>[0]) {
  return window.computeReportData(debts);
}

describe("report/SummaryCard", () => {
  it("没有在还债务时整块不渲染", () => {
    const { container } = render(<SummaryCard data={dataOf([])} totalAhead={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("利率最高的那笔 / 高息笔数 / 剩余待付利息 都算对", () => {
    const debts = [
      makeDebt({ id: "a", name: "低息房贷", balance: 5000, rate: 4,
        plan: [{ date: "2027-01-10", principal: 5000, interest: 100, amount: 5100, paid: false }] }),
      makeDebt({ id: "b", name: "网贷A", balance: 1000, rate: 24,
        plan: [{ date: "2027-01-10", principal: 1000, interest: 900, amount: 1900, paid: false }] }),
      makeDebt({ id: "c", name: "网贷B", balance: 500, rate: 19,
        plan: [{ date: "2027-01-10", principal: 500, interest: 400, amount: 900, paid: false }] }),
    ];
    render(<SummaryCard data={dataOf(debts)} totalAhead={7900} />);
    expect(screen.getByText("3 笔 · ¥6,500")).toBeInTheDocument();
    expect(screen.getByText("网贷A")).toBeInTheDocument();
    expect(screen.getByText("24.00%")).toBeInTheDocument();
    // rateClass(24)==="rate-hi"，18%阈值沿用calc.js既有分档
    expect(document.querySelector(".sumcard-rate.rate-hi")).toBeTruthy();
    expect(screen.getByText("2 笔 · ¥1,500")).toBeInTheDocument(); // 24%和19%两笔
    expect(screen.getByText("¥1,400")).toBeInTheDocument(); // 剩余利息 100+900+400
    expect(screen.getByText("¥7,900")).toBeInTheDocument(); // 未来12个月(由压力图传入)
  });

  it("没有高息债务时明确显示'没有'而不是留空", () => {
    const debts = [makeDebt({ id: "a", name: "房贷", balance: 5000, rate: 4,
      plan: [{ date: "2027-01-10", principal: 5000, interest: 100, amount: 5100, paid: false }] })];
    render(<SummaryCard data={dataOf(debts)} totalAhead={5100} />);
    expect(screen.getByText("没有")).toBeInTheDocument();
  });

  it("口径提示说明利率是反推的、剩余利息可能低估", () => {
    const debts = [makeDebt({ id: "a", balance: 100, rate: 5,
      plan: [{ date: "2027-01-10", principal: 100, interest: 0, amount: 100, paid: false }] })];
    render(<SummaryCard data={dataOf(debts)} totalAhead={100} />);
    expect(screen.getByText(/IRR/)).toBeInTheDocument();
    expect(screen.getByText(/没拆分本金\/利息的债务会低估/)).toBeInTheDocument();
  });
});
