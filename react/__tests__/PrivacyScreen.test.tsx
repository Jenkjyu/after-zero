import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { PrivacyScreen } from "../src/sheets/PrivacyScreen";
import { closePrivacyScreen, openPrivacyScreen, usePrivacyScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

afterEach(() => {
  closePrivacyScreen(); // privacyScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("PrivacyScreen", () => {
  it("未打开时不带open class，打开后渲染标题+正文关键内容", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<PrivacyScreen />);
    expect(container.querySelector("#privacyScreen")).not.toHaveClass("open");
    act(() => { openPrivacyScreen(); });
    expect(container.querySelector("#privacyScreen")).toHaveClass("open");
    expect(container.querySelector(".subpage-title")).toHaveTextContent("隐私政策");
    expect(screen.getByText("微信开放平台 SDK")).toBeInTheDocument();
    expect(screen.getByText(/无需账号的本地使用模式/)).toBeInTheDocument();
    expect(screen.getByText(/登录不会触发本地债务或档案的自动上传/)).toBeInTheDocument();
    expect(screen.getByText(/不满 14 周岁/)).toBeInTheDocument();
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => usePrivacyScreenOpen());
    render(<PrivacyScreen />);
    act(() => { openPrivacyScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge();
    render(<PrivacyScreen />);
    expect(window.__azPrivacyScreenBack!()).toBe(false);
    act(() => { openPrivacyScreen(); });
    expect(window.__azPrivacyScreenBack!()).toBe(true);
  });
});
