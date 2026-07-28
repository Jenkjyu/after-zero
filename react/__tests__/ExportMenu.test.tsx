// 唯一一处bug会"静默"的地方(premium门禁被绕过)，专门测两个按钮各自的两条分支——照抄
// 原来ExportActions.test.tsx（本轮删除，逻辑吸收进这里）的覆盖范围，加上菜单本身的
// 开关行为断言。
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { ExportMenu } from "../src/report/ExportMenu";
import { closePremiumScreen, usePremiumScreenOpen } from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { Premium } from "../src/types";

afterEach(() => {
  closePremiumScreen(); // premiumScreenOpen是模块级状态，重置避免测试间互相污染
});

describe("ExportMenu", () => {
  it("菜单默认关闭", () => {
    window.__azBridge = makeMockBridge();
    render(<ExportMenu premium={{ premium: null }} />);
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument();
    expect(screen.queryByText("导出 PDF")).not.toBeInTheDocument();
  });

  it("点触发器打开显示两个导出选项", () => {
    window.__azBridge = makeMockBridge();
    render(<ExportMenu premium={{ premium: null }} />);
    fireEvent.click(screen.getByLabelText("导出报表"));
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.getByText("导出 PDF")).toBeInTheDocument();
  });

  it("未开通premium时点导出选项跳订阅页(纯React状态)，不触发真实导出，且菜单关闭", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: null };
    render(<ExportMenu premium={premium} />);
    const hook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByLabelText("导出报表"));
    fireEvent.click(screen.getByText("导出 Excel"));
    expect(hook.result.current).toBe(true);
    expect(window.__azBridge.exportReportXlsx).not.toHaveBeenCalled();
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument(); // 菜单已关闭
  });

  it("已开通premium时点导出选项直接触发导出，不跳订阅页，且菜单关闭", () => {
    window.__azBridge = makeMockBridge();
    const premium: Premium = { premium: { method: "onetime", at: "2026-01-01" } };
    render(<ExportMenu premium={premium} />);
    const hook = renderHook(() => usePremiumScreenOpen());
    fireEvent.click(screen.getByLabelText("导出报表"));
    fireEvent.click(screen.getByText("导出 Excel"));
    expect(window.__azBridge.exportReportXlsx).toHaveBeenCalledTimes(1);
    expect(hook.result.current).toBe(false);
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("导出报表"));
    fireEvent.click(screen.getByText("导出 PDF"));
    expect(window.__azBridge.exportReportPdf).toHaveBeenCalledTimes(1);
  });
});
