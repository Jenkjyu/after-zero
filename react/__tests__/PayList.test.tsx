import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PayList } from "../src/pay/PayList";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { PayItem } from "../src/pay/App";
import type { PayGestureCtx } from "../src/pay/gestures";

function makeCtx(): PayGestureCtx {
  return { openSwipeRowRef: { current: null } };
}

describe("PayList", () => {
  it("visible为空时显示'该分类下暂无待还款项'", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<PayList visible={[]} ctx={makeCtx()} />);
    expect(container.textContent).toContain("该分类下暂无待还款项");
  });

  it("按dueBucket分组，插入section-label且带正确计数", () => {
    window.__azBridge = makeMockBridge();
    const items: PayItem[] = [
      { d: makeDebt({ name: "逾期A" }), i: 0, next: new Date(), diff: -2 },   // overdue
      { d: makeDebt({ name: "7天内B" }), i: 1, next: new Date(), diff: 3 },   // week
      { d: makeDebt({ name: "7天内C" }), i: 2, next: new Date(), diff: 5 },   // week
      { d: makeDebt({ name: "30天内D" }), i: 3, next: new Date(), diff: 20 }, // month
    ];
    const { container } = render(<PayList visible={items} ctx={makeCtx()} />);
    const labels = Array.from(container.querySelectorAll(".section-label")).map((el) => el.textContent);
    expect(labels).toEqual(["已逾期 · 1 笔", "7天内 · 2 笔", "30天内 · 1 笔"]);
    // 逾期分组的section-label带.overdue强调类
    expect(container.querySelector(".section-label.overdue")?.textContent).toBe("已逾期 · 1 笔");
    expect(container.querySelectorAll(".pay-row").length).toBe(4);
  });
});
