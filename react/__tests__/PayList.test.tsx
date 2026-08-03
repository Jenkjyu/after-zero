// 2026-07-29改版：一行=一期(不是一笔债务)，固定的dueBucket四档分组取消，
// 改成"整个列表一个表头、内容跟当前筛选一致"。
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PayList } from "../src/pay/PayList";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { PayItem } from "../src/pay/App";
import type { PayGestureCtx } from "../src/pay/gestures";

function makeCtx(): PayGestureCtx {
  return { openSwipeRowRef: { current: null } };
}

function item(over: Partial<PayItem> & { d?: PayItem["d"] } = {}): PayItem {
  return {
    d: makeDebt(),
    next: new Date(),
    diff: 3,
    amount: 100,
    planIdx: 0,
    isNextUnpaid: true,
    ...over,
  };
}

describe("PayList", () => {
  it("visible为空时显示'该分类下暂无待还款项'", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<PayList visible={[]} label="7天内" ctx={makeCtx()} />);
    expect(container.textContent).toContain("该分类下暂无待还款项");
  });

  it("只有一个表头，文案跟当前筛选一致、计数按期算", () => {
    window.__azBridge = makeMockBridge();
    const items = [
      item({ d: makeDebt({ name: "A" }), diff: 3 }),
      item({ d: makeDebt({ name: "B" }), diff: 20 }),
      item({ d: makeDebt({ name: "C" }), diff: 60 }),
    ];
    const { container } = render(<PayList visible={items} label="100天内" ctx={makeCtx()} />);
    const labels = Array.from(container.querySelectorAll(".section-label")).map((el) => el.textContent);
    expect(labels).toEqual(["100天内 · 3 期 · ¥300"]);
    expect(container.querySelectorAll(".pay-row").length).toBe(3);
  });

  it("已逾期表头带.overdue强调类", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(
      <PayList visible={[item({ diff: -2 })]} label="已逾期" ctx={makeCtx()} />
    );
    expect(container.querySelector(".section-label.overdue")?.textContent).toBe("已逾期 · 1 期 · ¥100");
  });

  it("同一笔债务的多期各占一行，key不撞车", () => {
    window.__azBridge = makeMockBridge();
    const d = makeDebt({ name: "信用卡分期" });
    const items = [
      item({ d, planIdx: 0, diff: 3, amount: 100, isNextUnpaid: true }),
      item({ d, planIdx: 1, diff: 33, amount: 100, isNextUnpaid: false }),
      item({ d, planIdx: 2, diff: 63, amount: 100, isNextUnpaid: false }),
    ];
    const { container } = render(<PayList visible={items} label="100天内" ctx={makeCtx()} />);
    expect(container.querySelectorAll(".pay-row").length).toBe(3);
    // 只有最早那一期能销，其余两期按钮置灰
    const btns = container.querySelectorAll(".pay-swipe-btn");
    expect(btns[0].className).not.toContain("is-disabled");
    expect(btns[1].className).toContain("is-disabled");
    expect(btns[2].className).toContain("is-disabled");
  });
});
