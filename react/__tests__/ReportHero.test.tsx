// 统计tab的Hero.tsx——文件名加"Report"前缀区分react/src/pay/Hero.tsx（已经占用了
// __tests__/Hero.test.tsx这个名字，两者在__tests__/是同一层目录，源码各自在pay/report子
// 目录下不冲突，测试文件按tab名前缀消歧，照抄PayApp.test.tsx/ReportApp.test.tsx的既有惯例）。
//
// 走真实computeReportData+summarizeAllTime（calc.js通过setup.ts挂到window上，见CLAUDE.md
// "React 迁移"一节"为什么显式window.xxx调用"），不是另外手写一份mock聚合逻辑，避免跟真实
// 实现悄悄分叉——跟report/App.tsx里useMemo(() => window.computeReportData(debts), [debts])
// 这条真实数据链路保持一致。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Hero } from "../src/report/Hero";
import { makeDebt } from "./mockBridge";

describe("report/Hero", () => {
  it("hero大金额有明确标签和口径角标，不再是无标签的裸数字", () => {
    const debts = [makeDebt({ balance: 1000, monthly: 200, rate: 12, settled: false })];
    const data = window.computeReportData(debts);
    render(<Hero data={data} debts={debts} premium={{ premium: null }} />);
    // 原来hero-label是"统计"两个字，大金额上方没有任何说明它是什么口径的标签
    expect(screen.getByText("在还总负债")).toBeInTheDocument();
    expect(screen.getByText("只算本金")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByText(`预计 ${data.payoffDate} 还清`)).toBeInTheDocument();
  });

  it("4个KPI全部常驻（不再需要展开），笔数降级成一行小字", () => {
    const debts = [
      makeDebt({ balance: 1000, monthly: 200, rate: 12, paidPrincipal: 500, paidInterest: 50, settled: false }),
      makeDebt({ balance: 0, monthly: 0, rate: 6, paidPrincipal: 300, paidInterest: 30, settled: true }),
    ];
    const data = window.computeReportData(debts);
    render(<Hero data={data} debts={debts} premium={{ premium: null }} />);
    expect(screen.getByText("累计已还本金")).toBeInTheDocument();
    expect(screen.getByText("经常性月供")).toBeInTheDocument();
    expect(screen.getByText("归零进度")).toBeInTheDocument();
    expect(screen.getByText("加权平均利率")).toBeInTheDocument();
    expect(screen.getByText("¥200")).toBeInTheDocument(); // 月供仍只算在还的
    expect(screen.getByText(data.avgRate.toFixed(2) + "%")).toBeInTheDocument();
    expect(screen.getByText("1 笔在还 · 1 笔已结清")).toBeInTheDocument();
    expect(screen.queryByText("更多指标")).not.toBeInTheDocument();
  });

  it("累计已还本金包含已结清债务，不因结清而变小（BUG-2 的UI层回归）", () => {
    // 同一笔债务"还完最后一期"前后两种状态：paidPrincipal都是800，结清后不该掉回500。
    const beforeSettle = [
      makeDebt({ balance: 1000, monthly: 200, paidPrincipal: 500, paidInterest: 50, settled: false }),
      makeDebt({ balance: 300, monthly: 100, paidPrincipal: 300, paidInterest: 30, settled: false }),
    ];
    const { unmount } = render(
      <Hero data={window.computeReportData(beforeSettle)} debts={beforeSettle} premium={{ premium: null }} />
    );
    expect(screen.getByText("¥800")).toBeInTheDocument(); // 500 + 300
    expect(screen.getByText("另付利息 ¥80")).toBeInTheDocument();
    unmount();

    const afterSettle = [
      makeDebt({ balance: 1000, monthly: 200, paidPrincipal: 500, paidInterest: 50, settled: false }),
      makeDebt({ balance: 0, monthly: 0, paidPrincipal: 300, paidInterest: 30, settled: true }),
    ];
    render(<Hero data={window.computeReportData(afterSettle)} debts={afterSettle} premium={{ premium: null }} />);
    expect(screen.getByText("¥800")).toBeInTheDocument(); // 关键：结清后仍是800，不是500
    expect(screen.getByText("另付利息 ¥80")).toBeInTheDocument();
  });

  it("没有还款计划时显示占位文案而不是'预计 — 还清'", () => {
    const data = window.computeReportData([]);
    render(<Hero data={data} debts={[]} premium={{ premium: null }} />);
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("暂无还款计划")).toBeInTheDocument();
    expect(screen.getByText("0 笔在还 · 0 笔已结清")).toBeInTheDocument();
  });

  it("计算口径说明默认收起，展开后逐条说清每个数字怎么算的", () => {
    const data = window.computeReportData([]);
    render(<Hero data={data} debts={[]} premium={{ premium: null }} />);
    expect(screen.queryByText(/只算本金，不含未来的利息/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("计算口径说明"));
    expect(screen.getByText(/只算本金，不含未来的利息/)).toBeInTheDocument();
    expect(screen.getByText(/已标记为「已还」期次的本金之和/)).toBeInTheDocument();
    expect(screen.getByText(/不含标记为「一次性还清」的借款/)).toBeInTheDocument();
    // 提前结清那部分钱去哪了——必须诚实说明，不能假装它被还了
    expect(screen.getByText(/既不计入在还总负债、也不计入累计已还本金/)).toBeInTheDocument();
  });

  it("加权平均利率旁有InfoTip说明按钮", () => {
    const data = window.computeReportData([]);
    render(<Hero data={data} debts={[]} premium={{ premium: null }} />);
    expect(screen.getByLabelText("说明")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("说明"));
    expect(screen.getByText(/按各笔债务当前余额加权平均后的利率/)).toBeInTheDocument();
  });
});
