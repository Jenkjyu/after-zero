import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { TermsScreen } from "../src/sheets/TermsScreen";
import { closeTermsScreen, openTermsScreen, useTermsScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

const originalCapacitor = (window as Window & { Capacitor?: unknown }).Capacitor;

afterEach(() => {
  closeTermsScreen(); // termsScreenOpen是模块级状态，重置避免测试间互相污染
  Object.defineProperty(window, "Capacitor", { configurable: true, value: originalCapacitor });
});

describe("TermsScreen", () => {
  it("未打开时不带open class，打开后渲染标题+正文关键内容", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<TermsScreen />);
    expect(container.querySelector("#termsScreen")).not.toHaveClass("open");
    act(() => { openTermsScreen(); });
    expect(container.querySelector("#termsScreen")).toHaveClass("open");
    expect(screen.getByText("会员服务协议")).toBeInTheDocument();
    expect(screen.getByText(/7 天 Premium 会员体验/)).toBeInTheDocument();
    expect(screen.getAllByText(/人民币 28 元/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/25 次终身 AI 识图录入额度/)).toBeInTheDocument();
    expect(screen.getByText(/3 次 AI 识图录入额度/)).toBeInTheDocument();
    expect(screen.queryByText(/兑换码/)).not.toBeInTheDocument();
  });

  it("Android 协议说明测试码仅本平台生效及注销后重新激活", () => {
    Object.defineProperty(window, "Capacitor", { configurable: true, value: { getPlatform: () => "android" } });
    window.__azBridge = makeMockBridge();
    render(<TermsScreen />);
    act(() => { openTermsScreen(); });
    expect(screen.getByText(/开通后仅在 Android 版本生效/)).toBeInTheDocument();
    expect(screen.getByText(/当前测试码可由原微信账号重新登录后再次输入激活/)).toBeInTheDocument();
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useTermsScreenOpen());
    render(<TermsScreen />);
    act(() => { openTermsScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge();
    render(<TermsScreen />);
    expect(window.__azTermsScreenBack!()).toBe(false);
    act(() => { openTermsScreen(); });
    expect(window.__azTermsScreenBack!()).toBe(true);
  });
});
