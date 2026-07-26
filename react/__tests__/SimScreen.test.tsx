import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { SimScreen } from "../src/sheets/SimScreen";
import { closeSimScreen, openSimScreen, useSimScreenIndex } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { Debt } from "../src/types";

const SIM_KEY = "after-zero-simulate-v1";

beforeEach(() => {
  localStorage.removeItem(SIM_KEY);
});
afterEach(() => {
  closeSimScreen(); // simScreenIndex是模块级状态，重置避免测试间互相污染
});

describe("SimScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<SimScreen />);
    expect(container.querySelector("#simScreen")).not.toHaveClass("open");
  });

  it("打开后显示对应债务名称+期数上限，默认单次多还tab选中", () => {
    const debts: Debt[] = [makeDebt({ name: "测试债务", terms: 6 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    expect(screen.getByText("测试债务")).toBeInTheDocument();
    expect(screen.getByText("单次多还")).toHaveClass("active");
    expect(screen.getByText("每期多还")).not.toHaveClass("active");
  });

  it("切换到每期多还tab", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    fireEvent.click(screen.getByText("每期多还"));
    expect(screen.getByText("每期多还")).toHaveClass("active");
    expect(screen.getByText("单次多还")).not.toHaveClass("active");
  });

  it("多还金额为0或空：toast提示，不产生结果", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    fireEvent.click(screen.getByText("开始测算"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("请输入大于 0 的多还金额");
    expect(screen.queryByText("提前还清")).not.toBeInTheDocument();
  });

  it("月供不足以覆盖利息：toast提示对应文案", () => {
    // rate高到让月供付不起利息(月供500，年化1200%→月息率1，balance*1远超500)
    const debts: Debt[] = [makeDebt({ balance: 100000, monthly: 10, rate: 1200 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    fireEvent.change(screen.getByLabelText(/多还金额/), { target: { value: "100" } });
    fireEvent.click(screen.getByText("开始测算"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("月供不足以覆盖利息，无法测算");
  });

  it("正常测算：单次多还，展示提前还清月数+节省利息，并持久化SIM_KEY", () => {
    const debts: Debt[] = [makeDebt({ balance: 12000, monthly: 1100, rate: 12, terms: 12 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    fireEvent.change(screen.getByLabelText(/多还金额/), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText(/从第几期开始/), { target: { value: "2" } });
    fireEvent.click(screen.getByText("开始测算"));
    expect(screen.getByText("提前还清")).toBeInTheDocument();
    expect(screen.getByText("节省利息")).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(SIM_KEY) || "{}");
    expect(saved).toEqual({ mode: "once", extra: 2000 });
  });

  it("重新打开时用上次持久化的extra值回填输入框、atPeriod重置为1、结果清空", () => {
    const debts: Debt[] = [makeDebt({ balance: 12000, monthly: 1100, rate: 12, terms: 12 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    fireEvent.change(screen.getByLabelText(/多还金额/), { target: { value: "3000" } });
    fireEvent.click(screen.getByText("开始测算"));
    expect(screen.getByText("提前还清")).toBeInTheDocument();
    act(() => { closeSimScreen(); });
    act(() => { openSimScreen(0); });
    expect((screen.getByLabelText(/多还金额/) as HTMLInputElement).value).toBe("3000");
    expect((screen.getByLabelText(/从第几期开始/) as HTMLInputElement).value).toBe("1");
    expect(screen.queryByText("提前还清")).not.toBeInTheDocument();
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<SimScreen />);
    expect(window.__azSimScreenBack!()).toBe(false);
    act(() => { openSimScreen(0); });
    expect(window.__azSimScreenBack!()).toBe(true);
  });

  it("点返回箭头关闭", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const hook = renderHook(() => useSimScreenIndex());
    render(<SimScreen />);
    act(() => { openSimScreen(0); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBeNull();
  });
});
