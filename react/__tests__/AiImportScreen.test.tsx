import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { AiImportScreen } from "../src/sheets/AiImportScreen";
import {
  clearAiImportDraft,
  closeAiImportScreen,
  closeEditSheet,
  openAiImportScreen,
  useAiImportDraft,
  useAiImportScreenOpen,
  useEditSheetId,
} from "../src/shared/state";
import { makeMockBridge } from "./mockBridge";
import type { AiDebtImportResult } from "../src/types";

afterEach(() => {
  clearAiImportDraft(); closeAiImportScreen(); closeEditSheet();
  vi.unstubAllGlobals();
});

describe("AiImportScreen", () => {
  it("一组多图只发起一次识别，成功后进入可编辑新增草稿", async () => {
    const bridge = makeMockBridge({ premium: { premium: { method: "onetime", at: "2026-01-01" } } });
    bridge.startAiDebtImport = vi.fn(() => Promise.resolve<AiDebtImportResult>({
      sessionId: "ais_1", status: "succeeded",
      credits: { bucket: "paid", limit: 25, used: 1, remaining: 24 },
      draft: {
        productHint: "消费贷", funderHint: "某银行", typeHint: "银行贷", notes: "原还款计划含贴息 5 元，请核对；系统未自动抵扣。",
        warnings: ["贴息未自动抵扣"], sourceStatuses: ["已入账"],
        plan: [{ date: "2026-09-01", amount: 1020, principal: 1000, interest: 20, paid: false }],
      },
    }));
    window.__azBridge = bridge;
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    const { container } = render(<AiImportScreen />);
    const draftHook = renderHook(() => useAiImportDraft());
    const editHook = renderHook(() => useEditSheetId());
    act(() => { openAiImportScreen(); });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const first = new File(["one"], "1.png", { type: "image/png" });
    const second = new File(["two"], "2.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [first, second] } });
    expect(screen.getByRole("button", { name: "开始识别" })).toBeInTheDocument();
    expect(screen.getByText("同一笔债务可上传多张截图，点击一次“开始识别”后合并生成一份草稿，仅消耗 1 次额度；识别失败不扣次数。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始识别" }));

    await waitFor(() => expect(bridge.startAiDebtImport).toHaveBeenCalledOnce());
    expect((bridge.startAiDebtImport as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([first, second]);
    await waitFor(() => expect(editHook.result.current).toBe("new"));
    expect(draftHook.result.current?.draft.plan[0].paid).toBe(false);
  });

  it("识别失败留在选图页且可以重试，不创建草稿", async () => {
    const bridge = makeMockBridge();
    bridge.startAiDebtImport = vi.fn(() => Promise.reject(new Error("没有识别出有效还款计划")));
    window.__azBridge = bridge;
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    const { container } = render(<AiImportScreen />);
    const openHook = renderHook(() => useAiImportScreenOpen());
    const draftHook = renderHook(() => useAiImportDraft());
    act(() => { openAiImportScreen(); });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["x"], "x.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始识别" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("没有识别出有效还款计划");
    expect(openHook.result.current).toBe(true);
    expect(draftHook.result.current).toBe(null);
  });
});
