import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { PremiumScreen } from "../src/sheets/PremiumScreen";
import { closePremiumScreen, closeTermsScreen, openPremiumScreen, usePremiumScreenOpen, useTermsScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

afterEach(() => {
  closePremiumScreen(); // premiumScreenOpen/termsScreenOpen是模块级状态，重置避免测试间互相污染
  closeTermsScreen();
});

describe("PremiumScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<PremiumScreen />);
    expect(container.querySelector("#premiumScreen")).not.toHaveClass("open");
  });

  it("只有一张买断价卡：现价¥28，没有划线原价/限时优惠这类促销话术，没有月付/年付选项", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    expect(screen.getByText("¥28")).toBeInTheDocument();
    expect(container.querySelectorAll(".price-card")).toHaveLength(1);
    // 只有一张卡时没有"选中"这个语义，卡片不再常驻高亮描边
    expect(container.querySelector(".price-card")).not.toHaveClass("selected");
    expect(screen.queryByText("¥40")).not.toBeInTheDocument();
    expect(screen.queryByText("限时优惠")).not.toBeInTheDocument();
    expect(screen.queryByText("¥5.9")).not.toBeInTheDocument();
    expect(screen.queryByText(/按月订阅/)).not.toBeInTheDocument();
    // 2026-08-05起不再展示"真实的服务器成本"这句说明文案，用户要求删掉
    expect(screen.queryByText(/真实的服务器成本/)).not.toBeInTheDocument();
    expect(screen.getByText(/包含 25 次 AI 识图录入额度/)).toBeInTheDocument();
    expect(screen.queryByText(/25 次终身 AI 识图录入额度/)).not.toBeInTheDocument();
  });

  it("点永久解锁调用原生购买桥接", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    fireEvent.click(screen.getByText("¥28 永久解锁"));
    expect(window.__azBridge.buyPremium).toHaveBeenCalledTimes(1);
  });

  it("购买与恢复购买按钮共用等高容器，不给恢复按钮单独偏移", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    const actions = container.querySelector(".premium-actions");
    expect(actions?.querySelectorAll(".btn")).toHaveLength(2);
    expect(screen.getByText("恢复购买")).not.toHaveStyle({ marginTop: "10px" });
  });

  it("只提供 App Store 购买和恢复购买，不提供兑换码或其他解锁入口", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    expect(screen.queryByText("我有兑换码")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("输入兑换码")).not.toBeInTheDocument();
    expect(screen.queryByText("兑换")).not.toBeInTheDocument();
  });

  it("底部购买说明只保留协议与 Apple 恢复购买", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    expect(screen.getByText(/已购买可通过 Apple 恢复购买/)).toBeInTheDocument();
    expect(screen.queryByText(/Google Play/)).not.toBeInTheDocument();
  });

  it("点《会员服务协议》打开termsScreen(纯React状态)", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    const termsHook = renderHook(() => useTermsScreenOpen());
    fireEvent.click(screen.getByText("《会员服务协议》"));
    expect(termsHook.result.current).toBe(true);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    expect(window.__azPremiumScreenBack!()).toBe(false);
    act(() => { openPremiumScreen(); });
    expect(window.__azPremiumScreenBack!()).toBe(true);
  });
});
