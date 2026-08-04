// premiumLabel()是真实calc.js实现(见setup.ts)，未开通返回null、已开通固定返回"Premium 会员"。
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { PremiumEntryCard } from "../src/mine/PremiumEntryCard";
import { closePremiumScreen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Premium } from "../src/types";

afterEach(() => {
  closePremiumScreen(); // premiumScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("PremiumEntryCard", () => {
  it("未开通时显示升级文案，无is-member class", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: null };
    const { container } = render(<PremiumEntryCard premium={premium} />);
    expect(screen.getByText("升级 Premium")).toBeInTheDocument();
    expect(screen.getByText("云备份 · 报表导出 · AI 债务助手")).toBeInTheDocument();
    expect(container.querySelector(".premium-entry-card")).not.toHaveClass("is-member");
  });

  it("已开通时显示会员标签+查看详情文案，带is-member class", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: { method: "onetime", at: "2026-01-01" } };
    const { container } = render(<PremiumEntryCard premium={premium} />);
    expect(screen.getByText("Premium 会员")).toBeInTheDocument();
    expect(screen.getByText("查看会员详情")).toBeInTheDocument();
    expect(container.querySelector(".premium-entry-card")).toHaveClass("is-member");
  });

  it("点击总是调用openPremiumScreen(纯React状态)，跟是否开通无关", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumEntryCard premium={{ premium: null }} />);
    const hook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByText("升级 Premium"));
    expect(hook.result.current).toBe(true);
  });
});
