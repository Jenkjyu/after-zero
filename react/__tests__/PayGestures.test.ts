// 只测滑块开合的DOM效果——跟debts那套gestures.test.ts一样，真实touch事件序列依赖jsdom
// 不完整支持的TouchEvent，且这个手势历史上也要求"必须真机验证"(见CLAUDE.md"还款提醒页"
// 一节)，这里只覆盖不依赖真实触摸序列、可以直接调用验证的部分。
import { describe, expect, it } from "vitest";
import { closePaySwipe, openPaySwipeTo, PAY_REVEAL } from "../src/pay/gestures";
import type { PayGestureCtx } from "../src/pay/gestures";

function makeCtx(): PayGestureCtx {
  return { openSwipeRowRef: { current: null } };
}

describe("openPaySwipeTo / closePaySwipe", () => {
  it("openPaySwipeTo展开时设置transform和dataset.open，并记为当前展开项", () => {
    const row = document.createElement("div");
    const ctx = makeCtx();
    openPaySwipeTo(ctx, row);
    expect(row.style.transform).toBe("translateX(-" + PAY_REVEAL + "px)");
    expect(row.dataset.open).toBe("1");
    expect(ctx.openSwipeRowRef.current).toBe(row);
  });

  it("同一时间只允许一条展开——展开新的会自动收起上一个", () => {
    const rowA = document.createElement("div");
    const rowB = document.createElement("div");
    const ctx = makeCtx();
    openPaySwipeTo(ctx, rowA);
    openPaySwipeTo(ctx, rowB);
    expect(rowA.dataset.open).toBe("0");
    expect(rowB.dataset.open).toBe("1");
    expect(ctx.openSwipeRowRef.current).toBe(rowB);
  });

  it("closePaySwipe收起并清空openSwipeRowRef(仅当收起的正是当前记录的那一个)", () => {
    const row = document.createElement("div");
    const ctx = makeCtx();
    openPaySwipeTo(ctx, row);
    closePaySwipe(ctx, row);
    expect(row.style.transform).toBe("translateX(0)");
    expect(row.dataset.open).toBe("0");
    expect(ctx.openSwipeRowRef.current).toBeNull();
  });

  it("closePaySwipe对null安全(无操作，不抛异常)", () => {
    expect(() => closePaySwipe(makeCtx(), null)).not.toThrow();
  });

  it("收起的不是当前记录的那一行时，openSwipeRowRef不受影响", () => {
    const rowA = document.createElement("div");
    const rowB = document.createElement("div");
    const ctx = makeCtx();
    openPaySwipeTo(ctx, rowA);
    closePaySwipe(ctx, rowB); // rowB从没打开过，不是当前记录的那个
    expect(ctx.openSwipeRowRef.current).toBe(rowA);
  });
});
