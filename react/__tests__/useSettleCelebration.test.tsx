import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSettleCelebration } from "../src/sheets/useSettleCelebration";
import { closePremiumScreen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { Debt } from "../src/types";

afterEach(() => {
  closePremiumScreen(); // premiumScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("useSettleCelebration", () => {
  it("挂载时已经结清的债务不触发庆祝(那不是刚刚发生的)", () => {
    const debts: Debt[] = [makeDebt({ id: "a", settled: true })];
    const bridge = makeMockBridge({ debts, premium: { premium: null } });
    window.__azBridge = bridge;
    renderHook(() => useSettleCelebration());
    expect(bridge.confirmAsync).not.toHaveBeenCalled();
  });

  it("非会员：一笔债务从未结清变已结清时弹出邀请", () => {
    const d = makeDebt({ id: "a", name: "信用卡分期", settled: false });
    const debts: Debt[] = [d];
    const bridge = makeMockBridge({ debts, premium: { premium: null } });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    renderHook(() => useSettleCelebration());

    const settledDebts = [{ ...d, settled: true }];
    window.__azBridge.getDebts = vi.fn(() => settledDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(bridge.confirmAsync).toHaveBeenCalledWith(
      "🎉 还清一笔了！",
      expect.stringContaining("信用卡分期")
    );
  });

  it("邀请弹窗点确认：打开PremiumScreen", async () => {
    const d = makeDebt({ id: "a", settled: false });
    const debts: Debt[] = [d];
    const bridge = makeMockBridge({ debts, premium: { premium: null } });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(true));
    window.__azBridge = bridge;
    renderHook(() => useSettleCelebration());
    const premiumHook = renderHook(() => usePremiumScreenOpen());

    const settledDebts = [{ ...d, settled: true }];
    window.__azBridge.getDebts = vi.fn(() => settledDebts);
    await act(async () => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(premiumHook.result.current).toBe(true);
  });

  it("邀请弹窗点取消：不打开PremiumScreen", async () => {
    const d = makeDebt({ id: "a", settled: false });
    const debts: Debt[] = [d];
    const bridge = makeMockBridge({ debts, premium: { premium: null } });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    renderHook(() => useSettleCelebration());
    const premiumHook = renderHook(() => usePremiumScreenOpen());

    const settledDebts = [{ ...d, settled: true }];
    window.__azBridge.getDebts = vi.fn(() => settledDebts);
    await act(async () => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(premiumHook.result.current).toBe(false);
  });

  it("已经是会员时，即使有新结清也不弹邀请", () => {
    const d = makeDebt({ id: "a", settled: false });
    const debts: Debt[] = [d];
    const bridge = makeMockBridge({ debts, premium: { premium: { method: "onetime", at: "2026-01-01" } } });
    window.__azBridge = bridge;
    renderHook(() => useSettleCelebration());

    const settledDebts = [{ ...d, settled: true }];
    window.__azBridge.getDebts = vi.fn(() => settledDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(bridge.confirmAsync).not.toHaveBeenCalled();
  });

  it("没有新增已结清债务的普通数据变化不触发", () => {
    const d = makeDebt({ id: "a", settled: false, name: "原名字" });
    const debts: Debt[] = [d];
    const bridge = makeMockBridge({ debts, premium: { premium: null } });
    window.__azBridge = bridge;
    renderHook(() => useSettleCelebration());

    const renamedDebts = [{ ...d, name: "改了名字" }]; // 还是没结清
    window.__azBridge.getDebts = vi.fn(() => renamedDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(bridge.confirmAsync).not.toHaveBeenCalled();
  });
});
