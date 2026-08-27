import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { AboutScreen } from "../src/sheets/AboutScreen";
import {
  closeAboutScreen, openAboutScreen, useAboutScreenOpen,
  useAccountScreenOpen, useAgreementScreenOpen, usePrivacyScreenOpen, useTermsScreenOpen,
} from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

afterEach(() => {
  closeAboutScreen(); // aboutScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("AboutScreen", () => {
  it("未打开时不带open class，打开后渲染版本号、入口和备案信息", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<AboutScreen />);
    expect(container.querySelector("#aboutScreen")).not.toHaveClass("open");
    act(() => { openAboutScreen(); });
    expect(container.querySelector("#aboutScreen")).toHaveClass("open");
    expect(screen.getByText("After Zero")).toBeInTheDocument();
    expect(screen.getByText("版本 1.0.0")).toBeInTheDocument();
    expect(screen.getByText("jenkjyu36@outlook.com")).toBeInTheDocument();
    expect(screen.getByText("隐私政策")).toBeInTheDocument();
    expect(screen.getByText("用户服务协议")).toBeInTheDocument();
    expect(screen.getByText("会员服务协议")).toBeInTheDocument();
    expect(screen.getByText("账户与登录信息")).toBeInTheDocument();
    expect(screen.getByText("APP备案编号")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "粤ICP备2026116914号-1A" })).toHaveAttribute("href", "https://beian.miit.gov.cn/");
  });

  it("点隐私政策打开PrivacyScreen", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => usePrivacyScreenOpen());
    render(<AboutScreen />);
    act(() => { openAboutScreen(); });
    fireEvent.click(screen.getByText("隐私政策"));
    expect(hook.result.current).toBe(true);
  });

  it("点用户服务协议打开AgreementScreen", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useAgreementScreenOpen());
    render(<AboutScreen />);
    act(() => { openAboutScreen(); });
    fireEvent.click(screen.getByText("用户服务协议"));
    expect(hook.result.current).toBe(true);
  });

  it("点会员服务协议打开TermsScreen", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useTermsScreenOpen());
    render(<AboutScreen />);
    act(() => { openAboutScreen(); });
    fireEvent.click(screen.getByText("会员服务协议"));
    expect(hook.result.current).toBe(true);
  });

  it("点账户与登录信息打开AccountScreen", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AboutScreen />);
    act(() => { openAboutScreen(); });
    fireEvent.click(screen.getByText("账户与登录信息"));
    expect(hook.result.current).toBe(true);
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge();
    const hook = renderHook(() => useAboutScreenOpen());
    render(<AboutScreen />);
    act(() => { openAboutScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge();
    render(<AboutScreen />);
    expect(window.__azAboutScreenBack!()).toBe(false);
    act(() => { openAboutScreen(); });
    expect(window.__azAboutScreenBack!()).toBe(true);
  });
});
