// 统计tab的Hero.tsx——文件名加"Report"前缀区分react/src/pay/Hero.tsx（已经占用了
// __tests__/Hero.test.tsx这个名字，两者在__tests__/是同一层目录，源码各自在pay/report子
// 目录下不冲突，测试文件按tab名前缀消歧，照抄PayApp.test.tsx/ReportApp.test.tsx的既有惯例）。
//
// 走真实computeReportData+summarizeDebts（calc.js通过setup.ts挂到window上，见CLAUDE.md
// "React 迁移"一节"为什么显式window.xxx调用"），不是另外手写一份mock聚合逻辑，避免跟真实
// 实现悄悄分叉——跟report/App.tsx里useMemo(() => window.computeReportData(debts), [debts])
// 这条真实数据链路保持一致。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Hero } from "../src/report/Hero";
import { makeDebt } from "./mockBridge";

describe("report/Hero", () => {
  it("常驻KPI数值正确：总负债/预计还清日期/加权平均利率/经常性月供", () => {
    const debts = [
      makeDebt({ balance: 1000, monthly: 200, rate: 12, paidPrincipal: 500, paidInterest: 50, settled: false }),
      makeDebt({ balance: 0, monthly: 0, rate: 6, paidPrincipal: 300, paidInterest: 30, settled: true }),
    ];
    const data = window.computeReportData(debts);
    render(<Hero data={data} debts={debts} premium={{ premium: null }} />);
    expect(screen.getByText("1,000")).toBeInTheDocument(); // hero-amt: 只算未结清的1000
    expect(screen.getByText(`预计 ${data.payoffDate} 还清`)).toBeInTheDocument();
    expect(screen.getByText(data.avgRate.toFixed(2) + "%")).toBeInTheDocument();
    expect(screen.getByText("¥200")).toBeInTheDocument(); // 经常性月供：只算未结清的
  });

  it("avgRate为0、payoffDate为null时显示占位符0.00%和—", () => {
    const data = window.computeReportData([]);
    render(<Hero data={data} debts={[]} premium={{ premium: null }} />);
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("预计 — 还清")).toBeInTheDocument();
  });

  it("展开'更多指标'显示2×2网格（已还金额/在还笔数/已结清/归零进度）", () => {
    const debts = [
      makeDebt({ balance: 1000, monthly: 200, paidPrincipal: 500, paidInterest: 50, settled: false }),
      makeDebt({ balance: 0, monthly: 0, paidPrincipal: 300, paidInterest: 30, settled: true }),
    ];
    const data = window.computeReportData(debts);
    render(<Hero data={data} debts={debts} premium={{ premium: null }} />);
    expect(screen.queryByText("已还金额")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("更多指标"));
    expect(screen.getByText("已还金额")).toBeInTheDocument();
    expect(screen.getByText("¥500")).toBeInTheDocument();
    expect(screen.getByText("另付利息 ¥50")).toBeInTheDocument();
    expect(screen.getByText("在还笔数")).toBeInTheDocument();
    expect(screen.getByText("已结清")).toBeInTheDocument();
    expect(screen.getByText("归零进度")).toBeInTheDocument();
  });

  it("加权平均利率旁有InfoTip说明按钮", () => {
    const data = window.computeReportData([]);
    render(<Hero data={data} debts={[]} premium={{ premium: null }} />);
    expect(screen.getByLabelText("说明")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("说明"));
    expect(screen.getByText(/按各笔债务当前余额加权平均后的利率/)).toBeInTheDocument();
  });
});
