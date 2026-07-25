import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataCards } from "../src/mine/DataCards";
import { makeMockBridge } from "./mockBridge";
import type { Premium } from "../src/types";

describe("DataCards", () => {
  it("未开通premium时点云备份跳订阅页，不打开备份页", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} />);
    fireEvent.click(screen.getByText("打开云备份"));
    expect(window.__azBridge.openPremiumScreen).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.openBackupScreen).not.toHaveBeenCalled();
  });

  it("已开通premium时点云备份直接打开备份页", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: { method: "yearly", at: "2026-01-01" } };
    render(<DataCards premium={premium} />);
    fireEvent.click(screen.getByText("打开云备份"));
    expect(window.__azBridge.openBackupScreen).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.openPremiumScreen).not.toHaveBeenCalled();
  });

  it("点档案库调用openDocsScreen，无门禁", () => {
    window.__azBridge = makeMockBridge();
    render(<DataCards premium={{ premium: null }} />);
    fireEvent.click(screen.getByText("打开档案库"));
    expect(window.__azBridge.openDocsScreen).toHaveBeenCalledTimes(1);
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
