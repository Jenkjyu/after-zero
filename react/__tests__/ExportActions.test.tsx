// 这是唯一一处bug会"静默"的地方(premium门禁被绕过)，专门测两个按钮各自的两条分支。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExportActions } from "../src/report/ExportActions";
import { makeMockBridge } from "./mockBridge";
import type { Premium } from "../src/types";

describe("ExportActions", () => {
  it("未开通premium时点导出按钮跳订阅页，不触发真实导出", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: null };
    render(<ExportActions premium={premium} />);
    fireEvent.click(screen.getByText("导出 Excel"));
    fireEvent.click(screen.getByText("导出 PDF"));
    expect(window.__azBridge.openPremiumScreen).toHaveBeenCalledTimes(2);
    expect(window.__azBridge.exportReportXlsx).not.toHaveBeenCalled();
    expect(window.__azBridge.exportReportPdf).not.toHaveBeenCalled();
  });

  it("已开通premium时点导出按钮直接触发导出，不跳订阅页", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: { method: "onetime", at: "2026-01-01" } };
    render(<ExportActions premium={premium} />);
    fireEvent.click(screen.getByText("导出 Excel"));
    fireEvent.click(screen.getByText("导出 PDF"));
    expect(window.__azBridge.exportReportXlsx).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.exportReportPdf).toHaveBeenCalledTimes(1);
    expect(window.__azBridge.openPremiumScreen).not.toHaveBeenCalled();
  });
});
