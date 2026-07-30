import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { TermsScreen } from "../src/sheets/TermsScreen";
import { closeTermsScreen, openTermsScreen, useTermsScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

afterEach(() => {
  closeTermsScreen(); // termsScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("TermsScreen", () => {
  it("未打开时不带open class，打开后渲染标题+正文关键内容", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<TermsScreen />);
    expect(container.querySelector("#termsScreen")).not.toHaveClass("open");
    act(() => { openTermsScreen(); });
    expect(container.querySelector("#termsScreen")).toHaveClass("open");
    expect(screen.getByText("会员服务协议")).toBeInTheDocument();
    expect(screen.getByText(/尚未接入真实的支付渠道/)).toBeInTheDocument();
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
