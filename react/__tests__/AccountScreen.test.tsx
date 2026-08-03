import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { AccountScreen } from "../src/sheets/AccountScreen";
import { closeAccountScreen, openAccountScreen, useAccountScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Account } from "../src/types";

afterEach(() => {
  closeAccountScreen(); // accountScreenOpen是模块级状态，重置避免测试间互相污染
});

const account: Account = {
  openid: "test-openid",
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

  it("打开后渲染头像/昵称/会员/微信绑定", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: { method: "onetime", at: "2026-01-01" } } });
    const { container } = render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(container.querySelector("#accountScreen")).toHaveClass("open");
    expect(screen.getByText("测试昵称")).toBeInTheDocument();
    expect(screen.getByText("Premium 会员")).toBeInTheDocument();
    expect(screen.getByText("已绑定")).toBeInTheDocument();
  });

  it("未开通premium时会员行显示普通用户", () => {
    window.__azBridge = makeMockBridge({ account, premium: { premium: null } });
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(screen.getByText("普通用户")).toBeInTheDocument();
  });

  it("点返回箭头关闭", () => {
    window.__azBridge = makeMockBridge({ account });
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    expect(hook.result.current).toBe(true);
    fireEvent.click(screen.getByLabelText("返回"));
    expect(hook.result.current).toBe(false);
  });

  it("退出登录：调用桥接wxLogout+关闭screen，没有确认弹窗", () => {
    window.__azBridge = makeMockBridge({ account });
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    fireEvent.click(screen.getByText("退出登录"));
    expect(window.__azBridge.wxLogout).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.confirmAsync).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(false);
  });

  it("注销账户：确认后调用桥接deleteAccount并关闭screen，弹窗带第三个「重置本地数据」选项", async () => {
    window.__azBridge = makeMockBridge({ account });
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销账户")); });
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith(
      "注销账户",
      expect.stringContaining("不可撤销"),
      expect.objectContaining({ thirdLabel: "重置本地数据" })
    );
    expect(window.__azBridge.deleteAccount).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.resetLocalData).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(false);
  });

  it("注销账户：选「重置本地数据」后二次确认同意，才调用resetLocalData，不调用deleteAccount、不关闭screen", async () => {
    const bridge = makeMockBridge({ account });
    const confirmAsync = vi.fn()
      .mockResolvedValueOnce("third") // 第一层：选"仅重置本地数据"
      .mockResolvedValueOnce(true);   // 第二层：二次确认同意
    bridge.confirmAsync = confirmAsync;
    window.__azBridge = bridge;
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销账户")); });
    expect(confirmAsync).toHaveBeenCalledTimes(2);
    expect(confirmAsync.mock.calls[1][0]).toBe("确定重置本地数据？");
    expect(window.__azBridge.resetLocalData).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.deleteAccount).not.toHaveBeenCalled();
    // resetLocalData内部会reload页面，React这边不需要、也没有主动关闭screen
    expect(hook.result.current).toBe(true);
  });

  it("注销账户：选「重置本地数据」但二次确认取消，不调用resetLocalData", async () => {
    const bridge = makeMockBridge({ account });
    bridge.confirmAsync = vi.fn()
      .mockResolvedValueOnce("third")
      .mockResolvedValueOnce(false); // 第二层：二次确认取消
    window.__azBridge = bridge;
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销账户")); });
    expect(window.__azBridge.resetLocalData).not.toHaveBeenCalled();
    expect(window.__azBridge.deleteAccount).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(true);
  });

  it("注销账户：取消确认后不调用deleteAccount、不关闭screen", async () => {
    const bridge = makeMockBridge({ account });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销账户")); });
    expect(window.__azBridge.deleteAccount).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(true);
  });

  it("注销账户：确认但deleteAccount失败(返回false)时不关闭screen", async () => {
    const bridge = makeMockBridge({ account });
    bridge.deleteAccount = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    const hook = renderHook(() => useAccountScreenOpen());
    render(<AccountScreen />);
    act(() => { openAccountScreen(); });
    await act(async () => { fireEvent.click(screen.getByText("注销账户")); });
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
