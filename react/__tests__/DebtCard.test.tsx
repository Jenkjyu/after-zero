import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { DebtCard } from "../src/debts/DebtCard";
import type { GestureCtx } from "../src/debts/gestures";
import { makeMockBridge, makeDebt } from "./mockBridge";

// 打开详情窗不再经过window.__azBridge(见shared/state.ts的openDetailSheet)——
// 部分mock这个模块，只替换openDetailSheet，其余(useDebts等，这个文件用不到)保留真实实现。
const { openDetailSheet } = vi.hoisted(() => ({ openDetailSheet: vi.fn() }));
vi.mock("../src/shared/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/shared/state")>();
  return { ...actual, openDetailSheet };
});

function makeCtx(): GestureCtx {
  return {
    containerRef: createRef(),
    dragCtxRef: { current: null },
    jiggleModeRef: { current: false },
    openSwipeRowRef: { current: null },
    enterJiggle: () => {},
    onCommitReorder: () => {},
  };
}

describe("DebtCard", () => {
  it("点击卡面(非拖拽/滑动状态、非编辑模式)调用openDetailSheet(d.id)", () => {
    window.__azBridge = makeMockBridge();
    openDetailSheet.mockClear();
    const d = makeDebt({ name: "信用卡分期" });
    const ctx = makeCtx();
    const { container } = render(<DebtCard d={d} jiggleMode={false} ctx={ctx} />);
    fireEvent.click(container.querySelector<HTMLElement>(".debt-front")!);
    expect(openDetailSheet).toHaveBeenCalledWith(d.id);
  });

  it("编辑模式(jiggleMode=true)下点击卡面不打开详情——手势全部让给排序", () => {
    window.__azBridge = makeMockBridge();
    openDetailSheet.mockClear();
    const d = makeDebt();
    const ctx = makeCtx();
    const { container } = render(<DebtCard d={d} jiggleMode ctx={ctx} />);
    fireEvent.click(container.querySelector<HTMLElement>(".debt-front")!);
    expect(openDetailSheet).not.toHaveBeenCalled();
  });

  it("点击'销这期'按钮调用__azBridge.payInstallment(d.id)，并收起滑出状态", () => {
    window.__azBridge = makeMockBridge();
    const d = makeDebt();
    const ctx = makeCtx();
    const { container } = render(<DebtCard d={d} jiggleMode={false} ctx={ctx} />);
    const row = container.querySelector<HTMLElement>(".debt-row")!;
    row.dataset.open = "1"; // 模拟已经左滑露出状态
    fireEvent.click(container.querySelector<HTMLElement>(".debt-swipe-btn")!);
    expect(window.__azBridge.payInstallment).toHaveBeenCalledWith(d.id);
    expect(row.style.transform).toBe("translateX(0)");
    expect(row.dataset.open).toBe("0");
  });

  it("左滑已展开时点击卡面收起滑块，不触发openDetailSheet(跟原生tap区分开)", () => {
    window.__azBridge = makeMockBridge();
    openDetailSheet.mockClear();
    const d = makeDebt();
    const ctx = makeCtx();
    const { container } = render(<DebtCard d={d} jiggleMode={false} ctx={ctx} />);
    const row = container.querySelector<HTMLElement>(".debt-row")!;
    row.dataset.open = "1";
    fireEvent.click(container.querySelector<HTMLElement>(".debt-front")!);
    expect(openDetailSheet).not.toHaveBeenCalled();
    expect(row.dataset.open).toBe("0");
  });

  it("利率>=18%时使用crit严重度色晕类，>=10%用warn，其余用good", () => {
    window.__azBridge = makeMockBridge();
    const critEl = render(<DebtCard d={makeDebt({ rate: 20 })} jiggleMode={false} ctx={makeCtx()} />).container.querySelector(".debt")!;
    expect(critEl.className).toContain("crit");
    const warnEl = render(<DebtCard d={makeDebt({ rate: 12 })} jiggleMode={false} ctx={makeCtx()} />).container.querySelector(".debt")!;
    expect(warnEl.className).toContain("warn");
    const goodEl = render(<DebtCard d={makeDebt({ rate: 5 })} jiggleMode={false} ctx={makeCtx()} />).container.querySelector(".debt")!;
    expect(goodEl.className).toContain("good");
  });
});
