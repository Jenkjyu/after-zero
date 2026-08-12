import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { App } from "../src/debts/App";
import { closeAiScreen, closePremiumScreen, useAiScreenOpen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";

afterEach(() => { closeAiScreen(); closePremiumScreen(); });

describe("debts App AI login gate", () => {
  it("未开Premium仍先进入Premium页，不请求云登录", () => {
    const bridge = makeMockBridge();
    window.__azBridge = bridge;
    render(<App />);
    const hook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByText("AI 债务分析报告"));
    expect(hook.result.current).toBe(true);
    expect(bridge.requestCloudLogin).not.toHaveBeenCalled();
  });

  it("本地Premium用户进入AI时请求登录，取消后不打开AI", async () => {
    const bridge = makeMockBridge({ premium: { premium: { method: "onetime", at: "2026-01-01" } }, account: null });
    bridge.requestCloudLogin = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    render(<App />);
    const hook = renderHook(() => useAiScreenOpen());
    fireEvent.click(screen.getByText("AI 债务助手"));
    await waitFor(() => expect(bridge.requestCloudLogin).toHaveBeenCalledOnce());
    expect(bridge.requestCloudLogin).toHaveBeenCalledWith(expect.stringContaining("登录提示可取消"));
    expect(hook.result.current).toBe(false);
  });

  it("已登录Premium用户直接打开AI", () => {
    const account = { openid: "o1", nickname: "测试", avatarUrl: "", loggedInAt: 0 };
    window.__azBridge = makeMockBridge({ premium: { premium: { method: "onetime", at: "2026-01-01" } }, account });
    render(<App />);
    const hook = renderHook(() => useAiScreenOpen());
    fireEvent.click(screen.getByText("AI 债务助手"));
    expect(hook.result.current).toBe(true);
    expect(window.__azBridge.requestCloudLogin).not.toHaveBeenCalled();
  });
});
