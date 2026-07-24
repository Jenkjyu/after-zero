import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { PayRow } from "../src/pay/PayRow";
import type { PayGestureCtx } from "../src/pay/gestures";
import { makeMockBridge, makeDebt } from "./mockBridge";

function makeCtx(): PayGestureCtx {
  return { openSwipeRowRef: { current: null } };
}

describe("PayRow", () => {
  it("点击卡面(非滑动展开状态)调用__azBridge.openDetail(i)", () => {
    window.__azBridge = makeMockBridge();
    const d = makeDebt({ name: "信用卡分期", monthly: 800 });
    const { container } = render(<PayRow d={d} i={4} next={new Date(2026, 6, 30)} diff={5} ctx={makeCtx()} />);
    fireEvent.click(container.querySelector<HTMLElement>(".pay")!);
    expect(window.__azBridge.openDetail).toHaveBeenCalledWith(4);
  });

  it("点击'标记已还'按钮调用__azBridge.payInstallment(i)，并收起滑出状态", () => {
    window.__azBridge = makeMockBridge();
    const d = makeDebt();
    const { container } = render(<PayRow d={d} i={7} next={new Date(2026, 6, 30)} diff={5} ctx={makeCtx()} />);
    const row = container.querySelector<HTMLElement>(".pay-swipe-row")!;
    row.dataset.open = "1"; // 模拟已经左滑露出状态
    fireEvent.click(container.querySelector<HTMLElement>(".pay-swipe-btn")!);
    expect(window.__azBridge.payInstallment).toHaveBeenCalledWith(7);
    expect(row.style.transform).toBe("translateX(0)");
    expect(row.dataset.open).toBe("0");
  });

  it("左滑已展开时点击卡面收起滑块，不触发openDetail(跟原生tap区分开)", () => {
    window.__azBridge = makeMockBridge();
    const d = makeDebt();
    const { container } = render(<PayRow d={d} i={0} next={new Date(2026, 6, 30)} diff={5} ctx={makeCtx()} />);
    const row = container.querySelector<HTMLElement>(".pay-swipe-row")!;
    row.dataset.open = "1";
    fireEvent.click(container.querySelector<HTMLElement>(".pay")!);
    expect(window.__azBridge.openDetail).not.toHaveBeenCalled();
    expect(row.dataset.open).toBe("0");
  });

  it("urgencyTier(diff)决定.pay-row的严重度class", () => {
    window.__azBridge = makeMockBridge();
    // diff=-1 -> overdue
    const { container } = render(<PayRow d={makeDebt()} i={0} next={new Date()} diff={-1} ctx={makeCtx()} />);
    expect(container.querySelector(".pay-row")!.className).toContain("overdue");
  });

  it("渲染日期(M/D)、剩余天数文案、金额", () => {
    window.__azBridge = makeMockBridge();
    const d = makeDebt({ name: "网贷A", monthly: 1234 });
    const { container } = render(<PayRow d={d} i={0} next={new Date(2026, 6, 30)} diff={5} ctx={makeCtx()} />);
    expect(container.textContent).toContain("7/30");
    expect(container.textContent).toContain("网贷A");
    expect(container.textContent).toContain("¥1,234");
    expect(container.textContent).toContain("5 天后");
  });
});
