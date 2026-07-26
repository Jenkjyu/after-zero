import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { DataCards } from "../src/mine/DataCards";
import { closeDocsScreen, closePremiumScreen, useDocsScreenOpen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Premium } from "../src/types";

afterEach(() => {
  closePremiumScreen(); // premiumScreenOpen/docsScreenOpen是模块级状态，重置避免测试间互相污染
  closeDocsScreen();
});

describe("DataCards", () => {
  it("未开通premium时点云备份跳订阅页(纯React状态)，不打开备份页", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} />);
    const hook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByText("打开云备份"));
    expect(hook.result.current).toBe(true);
    expect(window.__azBridge.openBackupScreen).not.toHaveBeenCalled();
  });

  it("已开通premium时点云备份直接打开备份页", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: { method: "yearly", at: "2026-01-01" } };
    render(<DataCards premium={premium} />);
    const hook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByText("打开云备份"));
    expect(window.__azBridge.openBackupScreen).toHaveBeenCalledTimes(1);
    expect(hook.result.current).toBe(false);
  });

  it("点档案库调用openDocsScreen(纯React状态)，无门禁", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} />);
    const hook = renderHook(() => useDocsScreenOpen());
    fireEvent.click(screen.getByText("打开档案库"));
    expect(hook.result.current).toBe(true);
  });

  it("点下载备份文件调用downloadBackupFile", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} />);
    fireEvent.click(screen.getByText("下载备份文件"));
    expect(window.__azBridge.downloadBackupFile).toHaveBeenCalledTimes(1);
  });

  it("点上传备份文件调用triggerImportFilePicker", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} />);
    fireEvent.click(screen.getByText("上传备份文件"));
    expect(window.__azBridge.triggerImportFilePicker).toHaveBeenCalledTimes(1);
  });
});
