import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrategyCompareScreen } from "../src/sheets/StrategyCompareScreen";
import { closeStrategyScreen, openStrategyScreen } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";

afterEach(() => {
  closeStrategyScreen(); // strategyScreenOpen是模块级状态，重置避免测试间互相污染
  delete window.__azStrategyScreenBack;
});

describe("StrategyCompareScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<StrategyCompareScreen />);
    expect(container.querySelector("#strategyCompareScreen")).not.toHaveClass("open");
  });

  it("没有在还债务时显示对应提示，不显示表单", () => {
    window.__azBridge = makeMockBridge({ debts: [] });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    expect(screen.getByText(/没有在还债务/)).toBeInTheDocument();
    expect(screen.queryByText("对比这三种策略")).not.toBeInTheDocument();
  });

  it("只有1笔在还债务时显示对应提示，不显示表单", () => {
    window.__azBridge = makeMockBridge({ debts: [makeDebt({ name: "唯一一笔" })] });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    expect(screen.getByText(/只有 1 笔在还债务/)).toBeInTheDocument();
    expect(screen.queryByText("对比这三种策略")).not.toBeInTheDocument();
  });

  it("已结清债务不计入自定义顺序列表", () => {
    const debts = [
      makeDebt({ id: "a", name: "在还的A" }),
      makeDebt({ id: "b", name: "已结清的", settled: true }),
      makeDebt({ id: "c", name: "在还的C" }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    expect(screen.getByText("在还的A")).toBeInTheDocument();
    expect(screen.getByText("在还的C")).toBeInTheDocument();
    expect(screen.queryByText("已结清的")).not.toBeInTheDocument();
  });

  it("默认自定义顺序=当前在还债务的数组顺序", () => {
    const debts = [makeDebt({ id: "a", name: "第一笔" }), makeDebt({ id: "b", name: "第二笔" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    const names = [...document.querySelectorAll(".strat-order-name")].map((el) => el.textContent);
    expect(names).toEqual(["第一笔", "第二笔"]);
  });

  it("上移/下移按钮调整自定义顺序，队首/队尾对应方向的按钮disabled", () => {
    const debts = [makeDebt({ id: "a", name: "第一笔" }), makeDebt({ id: "b", name: "第二笔" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });

    const rows = () => [...document.querySelectorAll(".strat-order-row")];
    expect(rows()[0].querySelector('[aria-label="上移"]')).toBeDisabled();
    expect(rows()[1].querySelector('[aria-label="下移"]')).toBeDisabled();
    expect(rows()[0].querySelector('[aria-label="下移"]')).not.toBeDisabled();

    fireEvent.click(rows()[1].querySelector('[aria-label="上移"]')!);
    const names = () => [...document.querySelectorAll(".strat-order-name")].map((el) => el.textContent);
    expect(names()).toEqual(["第二笔", "第一笔"]);
  });

  it("点「对比这三种策略」显示3行结果，总利息最省的一行带最省标记", () => {
    const debts = [
      makeDebt({ id: "hi", name: "高息小额", balance: 500, rate: 24, monthly: 100 }),
      makeDebt({ id: "lo", name: "低息大额", balance: 2000, rate: 6, monthly: 100 }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    fireEvent.click(screen.getByText("对比这三种策略"));

    const rows = [...document.querySelectorAll(".strat-result-row")];
    expect(rows.length).toBe(3);
    expect(document.querySelectorAll(".best-badge").length).toBe(1);
    rows.forEach((r) => expect(r.querySelector(".v")!.textContent).toMatch(/^¥/));
  });

  it("每月额外投入改变后重新对比，结果数字会变化", () => {
    const debts = [
      makeDebt({ id: "a", name: "债务A", balance: 3000, rate: 18, monthly: 150 }),
      makeDebt({ id: "b", name: "债务B", balance: 1500, rate: 10, monthly: 90 }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    fireEvent.click(screen.getByText("对比这三种策略"));
    const before = [...document.querySelectorAll(".strat-result-row .v")].map((el) => el.textContent);

    fireEvent.change(screen.getByLabelText(/每月额外投入/), { target: { value: "300" } });
    fireEvent.click(screen.getByText("对比这三种策略"));
    const after = [...document.querySelectorAll(".strat-result-row .v")].map((el) => el.textContent);
    expect(after).not.toEqual(before);
  });

  it("某笔债务月供覆盖不了自己的利息：显示无法测算提示，不渲染结果行", () => {
    const debts = [
      makeDebt({ id: "bad", balance: 100000, monthly: 10, rate: 1200 }), // 月利率50%，月供10远不够
      makeDebt({ id: "ok", balance: 1000, monthly: 100, rate: 10 }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    fireEvent.click(screen.getByText("对比这三种策略"));
    expect(screen.getByText(/没法测算/)).toBeInTheDocument();
    expect(document.querySelectorAll(".strat-result-row").length).toBe(0);
  });

  it("返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge({ debts: [makeDebt({ id: "a" }), makeDebt({ id: "b" })] });
    render(<StrategyCompareScreen />);
    expect(window.__azStrategyScreenBack!()).toBe(false);
    act(() => { openStrategyScreen(); });
    expect(window.__azStrategyScreenBack!()).toBe(true);
  });

  it("重新打开会重置：清空上次的对比结果和额外投入", () => {
    const debts = [makeDebt({ id: "a", name: "债务A" }), makeDebt({ id: "b", name: "债务B" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<StrategyCompareScreen />);
    act(() => { openStrategyScreen(); });
    fireEvent.change(screen.getByLabelText(/每月额外投入/), { target: { value: "300" } });
    fireEvent.click(screen.getByText("对比这三种策略"));
    expect(document.querySelectorAll(".strat-result-row").length).toBe(3);

    act(() => { closeStrategyScreen(); });
    act(() => { openStrategyScreen(); });
    expect(document.querySelectorAll(".strat-result-row").length).toBe(0);
    expect((screen.getByLabelText(/每月额外投入/) as HTMLInputElement).value).toBe("");
  });
});
