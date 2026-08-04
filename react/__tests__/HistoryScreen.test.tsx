// buildHistoryEvents()本身是calc.js的纯函数、已经有node:test套件覆盖(test/calc.test.js)，
// 这里不重新验证它的算法，只验证HistoryScreen拿到事件列表之后怎么渲染+"生成分享卡片"
// 按钮的门禁逻辑。debts fixture跟着calc.test.js同样的形状构造，保证是真实会发生的数据。
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { HistoryScreen } from "../src/sheets/HistoryScreen";
import { closeHistoryScreen, closePremiumScreen, openHistoryScreen, useHistoryScreenOpen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { Debt } from "../src/types";

afterEach(() => {
  closeHistoryScreen(); // historyScreenOpen/premiumScreenOpen都是模块级状态，重置避免测试间互相污染
  closePremiumScreen();
  delete window.__azHistoryScreenBack;
});

describe("HistoryScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<HistoryScreen />);
    expect(container.querySelector("#historyScreen")).not.toHaveClass("open");
  });

  it("没有真实还款事件时显示空状态文案", () => {
    const debts = [makeDebt()]; // 默认plan里paid=false，没有任何真实事件
    window.__azBridge = makeMockBridge({ debts });
    render(<HistoryScreen />);
    act(() => { openHistoryScreen(); });
    expect(screen.getByText(/还没有可回顾的记录/)).toBeInTheDocument();
  });

  it("结清事件和里程碑事件都正确渲染，且最近的排最上面", () => {
    const debts: Debt[] = [
      makeDebt({
        id: "a", name: "信用卡分期", settled: true, settledDate: "2/1",
        plan: [{ date: "2026-02-01", amount: 5000, principal: 5000, interest: 0, paid: true, settleRow: true }],
      }),
      makeDebt({
        id: "b", name: "网贷",
        plan: [{ date: "2026-04-01", amount: 20000, principal: 20000, interest: 0, paid: true, paidAt: "2026-04-01" }],
      }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<HistoryScreen />);
    act(() => { openHistoryScreen(); });

    expect(screen.getByText("信用卡分期 已还清")).toBeInTheDocument();
    expect(screen.getByText("累计已还突破 ¥10,000")).toBeInTheDocument();
    // 里程碑(4月)比结清(2月)晚，倒序展示时应该排在第一行
    const rows = [...document.querySelectorAll(".history-event-title")].map((el) => el.textContent);
    expect(rows).toEqual(["累计已还突破 ¥10,000", "信用卡分期 已还清"]);
  });

  it("点「生成分享卡片」：未开通Premium时关闭自己并跳订阅页，不调用bridge", () => {
    const bridge = makeMockBridge({ debts: [makeDebt()], premium: { premium: null } });
    window.__azBridge = bridge;
    render(<HistoryScreen />);
    act(() => { openHistoryScreen(); });
    const premiumHook = renderHook(() => usePremiumScreenOpen());
    const historyHook = renderHook(() => useHistoryScreenOpen());
    fireEvent.click(screen.getByText("生成分享卡片"));
    expect(premiumHook.result.current).toBe(true);
    expect(historyHook.result.current).toBe(false); // 自己被关掉了，不是叠在Premium下面
    expect(bridge.generateHistoryShareCard).not.toHaveBeenCalled();
  });

  it("点「生成分享卡片」：已开通Premium时直接调用bridge，不跳订阅页", async () => {
    const bridge = makeMockBridge({
      debts: [makeDebt()],
      premium: { premium: { method: "onetime", at: "2026-01-01" } },
    });
    window.__azBridge = bridge;
    render(<HistoryScreen />);
    act(() => { openHistoryScreen(); });
    const premiumHook = renderHook(() => usePremiumScreenOpen());
    await act(async () => { fireEvent.click(screen.getByText("生成分享卡片")); });
    expect(bridge.generateHistoryShareCard).toHaveBeenCalledTimes(1);
    expect(premiumHook.result.current).toBe(false);
  });

  it("返回键：打开时关闭并返回true，未打开时返回false", () => {
    window.__azBridge = makeMockBridge({ debts: [makeDebt()] });
    render(<HistoryScreen />);
    expect(window.__azHistoryScreenBack!()).toBe(false);
    act(() => { openHistoryScreen(); });
    expect(window.__azHistoryScreenBack!()).toBe(true);
  });
});
