import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { DataCards } from "../src/mine/DataCards";
import { closeBackupScreen, closeDocsScreen, closePremiumScreen, useBackupScreenOpen, useDocsScreenOpen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Premium } from "../src/types";

const account = { openid: "o1", nickname: "测试", avatarUrl: "", loggedInAt: 0 };

afterEach(() => {
  // premiumScreenOpen/docsScreenOpen/backupScreenOpen是模块级状态，重置避免测试间互相污染
  closePremiumScreen();
  closeDocsScreen();
  closeBackupScreen();
});

describe("DataCards", () => {
  it("未开通premium时点云备份跳订阅页(纯React状态)，不打开备份页", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} account={null} />);
    const premiumHook = renderHook(() => usePremiumScreenOpen());
    const backupHook = renderHook(() => useBackupScreenOpen());
    fireEvent.click(screen.getByText("云备份"));
    expect(premiumHook.result.current).toBe(true);
    expect(backupHook.result.current).toBe(false);
  });

  it("已开通premium且已登录时点云备份直接打开备份页(纯React状态)", () => {
    window.__azBridge = makeMockBridge({ account });
    const premium: Premium = { premium: { method: "onetime", at: "2026-01-01" } };
    render(<DataCards premium={premium} account={account} />);
    const backupHook = renderHook(() => useBackupScreenOpen());
    fireEvent.click(screen.getByText("云备份"));
    expect(backupHook.result.current).toBe(true);
  });

  it("已开通premium但本地使用时先请求登录，取消后不打开备份页", async () => {
    const bridge = makeMockBridge();
    bridge.requestCloudLogin = vi.fn(() => Promise.resolve(false));
    window.__azBridge = bridge;
    const premium: Premium = { premium: { method: "onetime", at: "2026-01-01" } };
    render(<DataCards premium={premium} account={null} />);
    const backupHook = renderHook(() => useBackupScreenOpen());
    fireEvent.click(screen.getByText("云备份"));
    await waitFor(() => expect(bridge.requestCloudLogin).toHaveBeenCalledOnce());
    expect(bridge.requestCloudLogin).toHaveBeenCalledWith(expect.stringContaining("不会自动同步"));
    expect(backupHook.result.current).toBe(false);
  });

  it("点档案库调用openDocsScreen(纯React状态)，无门禁", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} account={null} />);
    const hook = renderHook(() => useDocsScreenOpen());
    fireEvent.click(screen.getByText("档案库"));
    expect(hook.result.current).toBe(true);
  });

  it("点下载备份文件调用downloadBackupFile", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} account={null} />);
    fireEvent.click(screen.getByText("下载备份文件"));
    expect(window.__azBridge.downloadBackupFile).toHaveBeenCalledTimes(1);
  });

  it("点上传备份文件调用triggerImportFilePicker", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} account={null} />);
    fireEvent.click(screen.getByText("上传备份文件"));
    expect(window.__azBridge.triggerImportFilePicker).toHaveBeenCalledTimes(1);
  });
});
