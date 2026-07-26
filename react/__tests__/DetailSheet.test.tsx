// detailSheet不再经过window.__azBridge打开/关闭(见shared/state.ts的openDetailSheet/
// closeDetailSheet)，测试直接调用这两个函数控制状态，用window.__azBridge断言"业务操作"
// (编辑/销这期/提前结清/模拟)是否调用了正确的vanilla桥接函数。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { DetailSheet } from "../src/sheets/DetailSheet";
import { closeDetailSheet, closeEditSheet, closeSimScreen, openDetailSheet, useEditSheetIndex, useSimScreenIndex } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { Debt } from "../src/types";

afterEach(() => {
  closeDetailSheet(); // detailSheetIndex是模块级状态，重置避免测试间互相污染
  closeEditSheet();
  closeSimScreen();
});

describe("DetailSheet", () => {
  it("openDetailSheet(i)后显示对应债务的数据(含还款计划表格行数)", () => {
    const debts: Debt[] = [
      makeDebt({ name: "银行贷", funder: "某银行", type: "银行贷", original: 10000, balance: 8000, rate: 6, monthly: 1000, nextDate: "2026-09-01", opened: "2026-01-01", paidTerms: 2, totalTerms: 10, terms: 8 }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(screen.getByText("银行贷")).toBeInTheDocument();
    expect(screen.getByText("某银行 · 银行贷")).toBeInTheDocument();
    expect(screen.getByText("¥8,000")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /1\/1/ })).toBeInTheDocument();
  });

  it("d.oneTime为true时按钮文案是一次性结清，否则是销这期", () => {
    const debts: Debt[] = [makeDebt({ oneTime: true, terms: 1 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(screen.getByText("一次性结清")).toBeInTheDocument();
  });

  it("terms<=0时不渲染销这期/一次性结清按钮", () => {
    const debts: Debt[] = [makeDebt({ terms: 0 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(screen.queryByText("销这期")).not.toBeInTheDocument();
  });

  it("点编辑：关闭detailSheet+调用openEditSheet(i)(纯React状态，不经过__azBridge)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    const editHook = renderHook(() => useEditSheetIndex());
    act(() => { openDetailSheet(0); });
    fireEvent.click(screen.getByText("编辑"));
    expect(editHook.result.current).toBe(0);
  });

  it("点销这期：调用payInstallment(i)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    fireEvent.click(screen.getByText("销这期"));
    expect(window.__azBridge.payInstallment).toHaveBeenCalledWith(0);
  });

  it("点提前结清：调用settleFull(i)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    fireEvent.click(screen.getByText("提前结清"));
    expect(window.__azBridge.settleFull).toHaveBeenCalledWith(0);
  });

  it("点提前还款模拟：关闭detailSheet+调用openSimScreen(i)(纯React状态，不经过__azBridge)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    const simHook = renderHook(() => useSimScreenIndex());
    act(() => { openDetailSheet(0); });
    fireEvent.click(screen.getByText("提前还款模拟"));
    expect(simHook.result.current).toBe(0);
  });

  it("点关闭按钮：sheet的open class消失", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();
    fireEvent.click(screen.getByText("关闭"));
    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("点击scrim背景：关闭sheet", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    fireEvent.click(container.querySelector(".scrim")!);
    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("关闭动画期间内容不清空(displayIndex冻结在最后一次打开的债务上)", () => {
    const debts: Debt[] = [makeDebt({ name: "冻结测试" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    act(() => { closeDetailSheet(); });
    expect(screen.getByText("冻结测试")).toBeInTheDocument(); // sheet仍在DOM里，只是没有open class，内容没被清空
  });

  it("debts数组引用不变、只是原地mutate某个元素(真实vanilla payInstallment/settleFull的行为)也能触发自动关闭——回归测试", () => {
    // 这是真实踩过的bug：如果自动关闭那个effect写成`useEffect(..., [debts, openIndex])`，
    // 数组引用没变时依赖比较会认为"debts没变"，即使数组里的对象已经被原地改成settled=true
    // 也不会重新跑这个effect。vanilla的payInstallment/settleFull改的正是同一个数组引用里的
    // 元素(只有commitReorder/applyBackupData/导入JSON才会整体重新赋值)，所以这个场景
    // 必须单独测，不能只靠上面那个"换新数组"的测试掩盖过去。
    const d = makeDebt({ name: "原地结清测试" });
    const debts: Debt[] = [d];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();

    d.settled = true; // 原地mutate，debts数组引用完全不变
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("这笔债务变成settled后自动关闭sheet(数组整体重新赋值场景)", () => {
    const d = makeDebt({ name: "会被结清" });
    const debts: Debt[] = [d];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();

    const settledDebts = [{ ...d, settled: true }];
    window.__azBridge.getDebts = vi.fn(() => settledDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("这笔债务从debts数组消失(备份恢复/导入)后自动关闭sheet", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(0); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();

    const emptyDebts: Debt[] = []; // vi.fn(() => [])每次调用会返回新引用，触发useSyncExternalStore
    // 的"getSnapshot不稳定"保护性报错——真实vanilla的getDebts()除非整体重新赋值否则永远
    // 返回同一个引用(见shared/state.ts注释)，这里用一个稳定引用的空数组如实模拟这种情况。
    window.__azBridge.getDebts = vi.fn(() => emptyDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });
});
