import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("三张价卡默认选中买断，点其它卡切换选中态", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    const onetime = screen.getByText("¥98").closest("button")!;
    const monthly = screen.getByText("¥5.9").closest("button")!;
    expect(onetime).toHaveClass("selected");
    expect(monthly).not.toHaveClass("selected");
    fireEvent.click(monthly);
    expect(monthly).toHaveClass("selected");
    expect(onetime).not.toHaveClass("selected");
  });

  it("点开通Premium调用confirmAsync弹出暂未开放支付提示", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    fireEvent.click(screen.getByText("开通 Premium"));
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("暂未开放真实支付", expect.stringContaining("敬请期待"));
  });

  it("兑换码输入框默认收起，点开才展开，每次重新打开screen都强制复位收起", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    expect(screen.queryByPlaceholderText("输入兑换码")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("我有兑换码"));
    expect(screen.getByPlaceholderText("输入兑换码")).toBeInTheDocument();
    act(() => { closePremiumScreen(); });
    act(() => { openPremiumScreen(); });
    expect(screen.queryByPlaceholderText("输入兑换码")).not.toBeInTheDocument();
  });

  it("空兑换码：toast提示，不调用桥接redeemCode", () => {
    window.__azBridge = makeMockBridge();
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    fireEvent.click(screen.getByText("我有兑换码"));
    fireEvent.click(screen.getByText("兑换"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("请输入兑换码");
    expect(window.__azBridge.redeemCode).not.toHaveBeenCalled();
  });

  it("无效兑换码：桥接返回null，toast提示兑换码无效", () => {
    const bridge = makeMockBridge();
    bridge.redeemCode = vi.fn(() => null);
    window.__azBridge = bridge;
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    fireEvent.click(screen.getByText("我有兑换码"));
    fireEvent.change(screen.getByPlaceholderText("输入兑换码"), { target: { value: "9999" } });
    fireEvent.click(screen.getByText("兑换"));
    expect(window.__azBridge.redeemCode).toHaveBeenCalledWith("9999");
    expect(window.__azBridge.toast).toHaveBeenCalledWith("兑换码无效");
  });

  it("有效兑换码：桥接返回tier，toast成功文案+收起输入框", () => {
    const bridge = makeMockBridge();
    bridge.redeemCode = vi.fn(() => "premium");
    window.__azBridge = bridge;
    render(<PremiumScreen />);
    act(() => { openPremiumScreen(); });
    fireEvent.click(screen.getByText("我有兑换码"));
    fireEvent.change(screen.getByPlaceholderText("输入兑换码"), { target: { value: "0000" } });
    fireEvent.click(screen.getByText("兑换"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("兑换成功，已解锁 Premium");
    expect(screen.queryByPlaceholderText("输入兑换码")).not.toBeInTheDocument();
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
