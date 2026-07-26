import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { NotifySheet } from "../src/sheets/NotifySheet";
import { closeNotifySheet, openNotifySheet, useNotifySheetOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { NotifySettings } from "../src/types";

afterEach(() => {
  closeNotifySheet(); // notifySheetOpen是模块级状态，重置避免测试间互相污染
});

describe("NotifySheet", () => {
  it("未打开时不带open class", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<NotifySheet />);
    expect(container.querySelector("#notifySheet") ?? container.querySelector(".sheet")).not.toHaveClass("open");
  });

  it("没有规则时显示空状态提示，有规则时逐条渲染+可删除", () => {
    const notify: NotifySettings = { enabled: true, rules: [{ offsetDays: 1, time: "08:30" }] };
    window.__azBridge = makeMockBridge({ notify });
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    expect(screen.getByText(/提前1天 · 08:30/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("删除"));
    expect(window.__azBridge.deleteNotifyRule).toHaveBeenCalledWith(0);
  });

  it("空规则列表显示提示文案", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: false, rules: [] } });
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    expect(screen.getByText("还没有提醒规则，添加一条吧")).toBeInTheDocument();
  });

  it("切换开关调用setNotifyEnabled(checked)", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: false, rules: [] } });
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(window.__azBridge.setNotifyEnabled).toHaveBeenCalledWith(true);
  });

  it("点发送测试通知调用sendTestNotification", () => {
    window.__azBridge = makeMockBridge();
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(screen.getByText("发送测试通知（10秒后）"));
    expect(window.__azBridge.sendTestNotification).toHaveBeenCalledTimes(1);
  });

  it("添加规则：选中偏移天数+时间后点添加，调用addNotifyRule", () => {
    window.__azBridge = makeMockBridge();
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.change(screen.getByDisplayValue("当天到期"), { target: { value: "2" } });
    fireEvent.change(screen.getByDisplayValue("09:00"), { target: { value: "20:00" } });
    fireEvent.click(screen.getByText("添加"));
    expect(window.__azBridge.addNotifyRule).toHaveBeenCalledWith(2, "20:00");
  });

  it("点完成：已开通但没有规则时兜底添加一条当天到期09:00，再关闭", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: true, rules: [] } });
    const hook = renderHook(() => useNotifySheetOpen());
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(screen.getByText("完成"));
    expect(window.__azBridge.addNotifyRule).toHaveBeenCalledWith(0, "09:00");
    expect(hook.result.current).toBe(false);
  });

  it("点完成：已有规则时不兜底添加，直接关闭", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: true, rules: [{ offsetDays: 0, time: "09:00" }] } });
    const hook = renderHook(() => useNotifySheetOpen());
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(screen.getByText("完成"));
    expect(window.__azBridge.addNotifyRule).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(false);
  });

  it("点完成：未开通通知时不兜底添加，直接关闭", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: false, rules: [] } });
    const hook = renderHook(() => useNotifySheetOpen());
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(screen.getByText("完成"));
    expect(window.__azBridge.addNotifyRule).not.toHaveBeenCalled();
    expect(hook.result.current).toBe(false);
  });

  it("点击scrim关闭(走同一套兜底+关闭逻辑)", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: false, rules: [] } });
    const hook = renderHook(() => useNotifySheetOpen());
    const { container } = render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(container.querySelector(".scrim")!);
    expect(hook.result.current).toBe(false);
  });

  it("硬件返回键：打开时关闭并返回true，关闭时返回false", () => {
    window.__azBridge = makeMockBridge({ notify: { enabled: false, rules: [] } });
    render(<NotifySheet />);
    expect(window.__azNotifySheetBack!()).toBe(false);
    act(() => { openNotifySheet(); });
    expect(window.__azNotifySheetBack!()).toBe(true);
  });

  it("开关乐观更新：点击后立刻反映在checkbox上，不等异步权限结果", async () => {
    const bridge = makeMockBridge({ notify: { enabled: false, rules: [] } });
    let resolveFn!: (v: boolean) => void;
    bridge.setNotifyEnabled = vi.fn(() => new Promise<boolean>((resolve) => { resolveFn = resolve; }));
    window.__azBridge = bridge;
    render(<NotifySheet />);
    act(() => { openNotifySheet(); });
    fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    await act(async () => { resolveFn(false); }); // 权限被拒，真实notify.enabled仍是false
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
