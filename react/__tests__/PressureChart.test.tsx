// 未来12个月还款压力柱状图（替代已删除的MonthlyChart.test.tsx）。
//
// 走真实的window.computeUpcomingPressure(debts, 12, today)而不是手造fixture——固定today参数
// 让断言可复现(这正是那个函数留第3个参数的原因)，同时保证组件测的是真实数据形状，不会跟
// calc.js悄悄分叉。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PressureChart } from "../src/report/PressureChart";
import { makeDebt } from "./mockBridge";

const TODAY = new Date(2026, 6, 29); // 2026-07-29

function pressureOf(debts: Parameters<typeof window.computeUpcomingPressure>[0]) {
  return window.computeUpcomingPressure(debts, 12, TODAY);
}

function row(date: string, principal: number, interest: number, paid = false) {
  return { date, principal, interest, amount: principal + interest, paid };
}

describe("report/PressureChart", () => {
  it("没有任何待还款项时显示空状态，不画空图表", () => {
    render(<PressureChart data={pressureOf([])} />);
    expect(screen.getByText("未来12个月没有待还款项")).toBeInTheDocument();
    expect(document.querySelector(".pchart")).toBeNull();
  });

  it("摘要行4项：本月待还/12个月共/月均/压力最大", () => {
    const debts = [
      makeDebt({ id: "d1", name: "A", plan: [row("2026-07-31", 900, 100), row("2026-11-10", 1900, 100)] }),
    ];
    render(<PressureChart data={pressureOf(debts)} />);
    // 限定在摘要行里断言——同样的金额也会出现在下方"当月要还的债务"里，全局查会撞上
    const stats = [...document.querySelectorAll(".pchart-stats .v")].map((el) => el.textContent);
    expect(stats).toEqual(["¥1,000", "¥3,000", "¥250", "11月 ¥2,000"]);
  });

  it("12根柱子，每根按本金/利息两段堆叠，柱子数量固定不随数据稀疏而变", () => {
    const debts = [makeDebt({ id: "d1", plan: [row("2026-09-10", 800, 200)] })];
    render(<PressureChart data={pressureOf(debts)} />);
    expect(document.querySelectorAll(".pchart-col")).toHaveLength(12);
    // 9月那根：本金/利息两段都有高度
    const cols = document.querySelectorAll(".pchart-col");
    const sep = cols[2].querySelector(".seg.principal") as HTMLElement;
    const int = cols[2].querySelector(".seg.interest") as HTMLElement;
    expect(sep.style.height).not.toBe("0%");
    expect(int.style.height).not.toBe("0%");
  });

  it("已结清债务的未来期次不出现在图上（BUG-1 的UI层回归）", () => {
    const settled = makeDebt({
      id: "s1", name: "已结清", settled: true,
      plan: [row("2026-09-10", 5000, 500)],
    });
    const active = makeDebt({ id: "a1", name: "在还", plan: [row("2026-09-10", 100, 0)] });
    render(<PressureChart data={pressureOf([settled, active])} />);
    // 12个月总额只有在还那笔的100，已结清那笔的5500不该出现
    expect(screen.getByText("¥100")).toBeInTheDocument();
    expect(screen.queryByText("¥5,600")).not.toBeInTheDocument();
    expect(screen.queryByText("已结清")).not.toBeInTheDocument();
  });

  it("逾期单独一条提示行，明说未计入下方12个月", () => {
    const debts = [
      makeDebt({ id: "d1", plan: [row("2026-05-10", 300, 50), row("2026-09-10", 100, 0)] }),
    ];
    render(<PressureChart data={pressureOf(debts)} />);
    expect(screen.getByText(/已逾期 1 期 · ¥350/)).toBeInTheDocument();
    expect(screen.getByText("未计入下方12个月")).toBeInTheDocument();
    expect(screen.getByText("¥100")).toBeInTheDocument(); // 12个月共不含逾期
  });

  it("没有逾期时不显示那条红色提示行", () => {
    const debts = [makeDebt({ id: "d1", plan: [row("2026-09-10", 100, 0)] })];
    render(<PressureChart data={pressureOf(debts)} />);
    expect(document.querySelector(".pchart-overdue")).toBeNull();
  });

  it("readout默认显示当前月，点击某根柱子后切到那个月并展开当月债务组成", () => {
    const debts = [
      makeDebt({ id: "d1", name: "招行贷", plan: [row("2026-07-31", 500, 0), row("2026-09-10", 700, 100)] }),
      makeDebt({ id: "d2", name: "借呗", plan: [row("2026-09-15", 200, 0)] }),
    ];
    render(<PressureChart data={pressureOf(debts)} />);
    // 默认当前月(7月)
    expect(screen.getByText(/7月待还 ¥500/)).toBeInTheDocument();
    expect(screen.getByText("7月要还的债务")).toBeInTheDocument();

    // 点9月那根柱子(index 2)——chartScrub挂在.pchart-plot上，用pointer事件模拟
    const plot = document.querySelector(".pchart-plot") as HTMLElement;
    plot.getBoundingClientRect = () => ({ left: 0, width: 120, top: 0, height: 100, right: 120, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    // 12个点均分120px：index 2 落在 2/11*120 ≈ 21.8
    fireEvent.pointerDown(plot, { pointerType: "mouse", pointerId: 1, clientX: 22 });
    expect(screen.getByText(/9月待还 ¥1,000/)).toBeInTheDocument();
    expect(screen.getByText(/本金 ¥900 · 利息 ¥100/)).toBeInTheDocument();
    // 当月组成按金额降序
    expect(screen.getByText("9月要还的债务")).toBeInTheDocument();
    const rows = [...document.querySelectorAll(".pchart-bd-row")].map((r) => r.textContent);
    expect(rows).toEqual(["招行贷¥800", "借呗¥200"]);
  });

  it("图例常驻（两个系列的身份不能只靠颜色区分）", () => {
    const debts = [makeDebt({ id: "d1", plan: [row("2026-09-10", 100, 10)] })];
    render(<PressureChart data={pressureOf(debts)} />);
    expect(screen.getByText("本金")).toBeInTheDocument();
    expect(screen.getByText("利息")).toBeInTheDocument();
  });

  it("Y轴3档刻度取整到好看的数字，不是原始最大值", () => {
    // 最大月1,733 → 刻度顶应该是2,000而不是1,733
    const debts = [makeDebt({ id: "d1", plan: [row("2026-09-10", 1733, 0)] })];
    render(<PressureChart data={pressureOf(debts)} />);
    const ticks = [...document.querySelectorAll(".pchart-gridline span")].map((s) => s.textContent);
    expect(ticks).toEqual(["0", "1,000", "2,000"]);
  });
});
