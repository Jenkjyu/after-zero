import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { AccountScreen } from "../src/sheets/AccountScreen";
import { closeAccountScreen, openAccountScreen, useAccountScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

afterEach(() => { closeAccountScreen(); });

const account: Account = {
  userId: "test-openid",
  openid: "test-openid",
  provider: "wechat",
  providers: ["wechat"],
  nickname: "测试昵称",
  avatarUrl: "https://example.com/a.png",
  loggedInAt: 0,
};

describe("AccountScreen", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge({ account });
    const { container } = render(<AccountScreen />);
    expect(container.querySelector("#accountScreen")).not.toHaveClass("open");
  });

  it("旧微信账户显示微信登录、昵称、会员和本地账本状态", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: { method: "onetime", at: "2026-01-01" } } });
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(screen.getByText("微信登录")).toBeInTheDocument();
    expect(screen.getByText("测试昵称")).toBeInTheDocument();
    expect(screen.getByText("Premium 会员")).toBeInTheDocument();
    expect(screen.getByText("仅存本机")).toBeInTheDocument();
  });

  it("本地模式明确展示可用范围，提供云账号登录且不显示退出/注销", async () => {
    const bridge = makeMockBridge({ account: null });
    window.__azBridge = bridge;
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(screen.getByText("尚未登录")).toBeInTheDocument();
    expect(screen.getByText(/完整账本需要登录并验证体验或购买权益/)).toBeInTheDocument();
    expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
    expect(screen.queryByText("注销云端账户")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText("登录并验证权益")); });
    expect(bridge.requestCloudLogin).toHaveBeenCalledWith(expect.stringContaining("不会自动上传"));
  });

  it.each([
    [{ ...account, provider: "apple" as const, providers: ["apple" as const], openid: undefined, email: "private@example.com" }, "Apple 登录"],
    [{ ...account, provider: "unified" as const }, "统一账号"],
  ])("未来账号形状%#可映射为第三态展示", (value, label) => {
    window.__azBridge = makeMockBridge({ account: value });
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("Apple账号展示服务端确认的邮箱且不渲染空头像", () => {
    const apple: Account = { userId: "u_1", provider: "apple", providers: ["apple"], nickname: "Apple 用户", avatarUrl: "", email: "relay@example.com", loggedInAt: 1 };
    window.__azBridge = makeMockBridge({ account: apple });
    const { container } = render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(screen.getByText("relay@example.com")).toBeInTheDocument();
    expect(container.querySelector(".account-avatar")).toBeNull();
  });

  it("仅显示尚未绑定的登录方式，并经桥接发起双重授权绑定", async () => {
    const bridge = makeMockBridge({ account });
    window.__azBridge = bridge;
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(screen.getByText("绑定 Apple")).toBeInTheDocument();
    expect(screen.queryByText("绑定微信")).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText("绑定 Apple")); });
    expect(bridge.bindCloudIdentity).toHaveBeenCalledWith("apple");
    expect(screen.getByText(/不会改变本机账本/)).toBeInTheDocument();
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge({ account });
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("退出登录调用桥接并关闭screen，不清本地数据", () => {
    window.__azBridge = makeMockBridge({ account });
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    fireEvent.click(screen.getByText("退出登录"));
    expect(window.__azBridge.wxLogout).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.resetLocalData).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(false);
  });

  it("重置本地数据有独立二次确认，确认后才执行", async () => {
    const bridge = makeMockBridge({ account });
    window.__azBridge = bridge;
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("重置本地数据")); });
    expect(bridge.confirmAsync).toHaveBeenCalledWith("确定重置本地数据？", expect.stringContaining("云账号和云备份不会被删除"));
    expect(bridge.resetLocalData).toHaveBeenCalledOnce();
    expect(bridge.deleteAccount).not.toHaveBeenCalled();
  });

  it("重置本地数据取消后不执行", async () => {
    const bridge = makeMockBridge({ account });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("重置本地数据")); });
    expect(bridge.resetLocalData).not.toHaveBeenCalled();
  });

  it("注销云端账户确认后调用deleteAccount并关闭，本地重置保持分离", async () => {
    window.__azBridge = makeMockBridge({ account });
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销云端账户")); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("注销账户", expect.stringContaining("本地债务、档案和设置会保留"));
    expect(window.__azBridge.deleteAccount).toHaveBeenCalledOnce();
    expect(window.__azBridge.resetLocalData).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(false);
  });

  it("注销取消或执行失败时保持screen打开", async () => {
    const bridge = makeMockBridge({ account });
    bridge.confirmAsync = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    bridge.deleteAccount = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销云端账户")); });
    expect(bridge.deleteAccount).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText("注销云端账户")); });
    expect(bridge.deleteAccount).toHaveBeenCalledOnce();
    expect(hook.result.current).toBe(true);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge({ account });
    render(<AccountScreen />);
    expect(window.__azAccountScreenBack!()).toBe(false);
    act(() => { openAccountScreen(); });
    expect(window.__azAccountScreenBack!()).toBe(true);
  });
});
