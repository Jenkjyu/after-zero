// 门禁逻辑照抄ExportMenu.test.tsx的覆盖方式——未开通/已开通两条分支各自的跳转目标。
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrategyCta } from "../src/report/StrategyCta";
import { closePremiumScreen, closeStrategyScreen, usePremiumScreenOpen, useStrategyScreenOpen } from "../src/shared/state";
import type { Premium } from "../src/types";

afterEach(() => {
  closePremiumScreen();
  closeStrategyScreen(); // 两者都是模块级状态，重置避免测试间互相污染
});

describe("StrategyCta", () => {
  it("未开通premium时点击跳订阅页，不打开对比规划screen", () => {
    const premium: Premium = { premium: null };
    render(<StrategyCta premium={premium} />);
    const premiumHook = renderHook(() => usePremiumScreenOpen());
    const strategyHook = renderHook(() => useStrategyScreenOpen());
    fireEvent.click(screen.getByText("多策略对比规划"));
    expect(premiumHook.result.current).toBe(true);
    expect(strategyHook.result.current).toBe(false);
  });

  it("已开通premium时点击直接打开对比规划screen，不跳订阅页", () => {
    const premium: Premium = { premium: { method: "onetime", at: "2026-01-01" } };
    render(<StrategyCta premium={premium} />);
    const premiumHook = renderHook(() => usePremiumScreenOpen());
    const strategyHook = renderHook(() => useStrategyScreenOpen());
    fireEvent.click(screen.getByText("多策略对比规划"));
    expect(strategyHook.result.current).toBe(true);
    expect(premiumHook.result.current).toBe(false);
  });
});
