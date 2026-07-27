// 长按拖拽排序/左滑这套状态机的核心几何/提交逻辑——真正的touch事件序列(手指按下/移动/松开)
// 依赖jsdom不完整支持的TouchEvent，且这套代码历史上一直是"必须真机验证"的(见CLAUDE.md
// "在还债务自定义排序"一节)，这里只测试不依赖真实触摸序列、可以直接调用验证的部分：
// 滑块开合的DOM效果、拖拽提交(finishDrag)按DOM顺序正确读出新排列并调用回调。
import { describe, expect, it, vi } from "vitest";
import { closeDebtSwipe, DEBT_REVEAL, finishDrag, openDebtSwipeTo } from "../src/debts/gestures";
import type { CardEl, GestureCtx } from "../src/debts/gestures";
import { makeDebt } from "./mockBridge";

function makeCtx(overrides?: Partial<GestureCtx>): GestureCtx {
  return {
    containerRef: { current: null },
    dragCtxRef: { current: null },
    jiggleModeRef: { current: true },
    openSwipeRowRef: { current: null },
    enterJiggle: () => {},
    onCommitReorder: vi.fn(),
    ...overrides,
  };
}

describe("closeDebtSwipe / openDebtSwipeTo", () => {
  it("openDebtSwipeTo展开时设置transform和dataset.open，并把自己记为当前展开项", () => {
    const row = document.createElement("div");
    const ctx = makeCtx();
    openDebtSwipeTo(ctx, row);
    expect(row.style.transform).toBe("translateX(-" + DEBT_REVEAL + "px)");
    expect(row.dataset.open).toBe("1");
    expect(ctx.openSwipeRowRef.current).toBe(row);
  });

  it("展开新的一个会自动收起上一个已展开的(同一时间只允许一条展开)", () => {
    const rowA = document.createElement("div");
    const rowB = document.createElement("div");
    const ctx = makeCtx();
    openDebtSwipeTo(ctx, rowA);
    openDebtSwipeTo(ctx, rowB);
    expect(rowA.dataset.open).toBe("0");
    expect(rowB.dataset.open).toBe("1");
    expect(ctx.openSwipeRowRef.current).toBe(rowB);
  });

  it("closeDebtSwipe收起并清空openSwipeRowRef(仅当收起的正是当前记录的那一个)", () => {
    const row = document.createElement("div");
    const ctx = makeCtx();
    openDebtSwipeTo(ctx, row);
    closeDebtSwipe(ctx, row);
    expect(row.style.transform).toBe("translateX(0)");
    expect(row.dataset.open).toBe("0");
    expect(ctx.openSwipeRowRef.current).toBeNull();
  });
});

describe("finishDrag", () => {
  it("commit=false时只做视觉收尾，不调用onCommitReorder", () => {
    const el = document.createElement("div");
    el.classList.add("dragging");
    const onCommitReorder = vi.fn();
    const ctx = makeCtx({
      dragCtxRef: {
        current: {
          el, cards: [el], naturalTop: [0], minTop: 0, maxTop: 0,
          order: [0], k0: 0, startPageY: 0, elHeight: 10, lastClientY: 0, rafId: 0,
        },
      },
      onCommitReorder,
    });
    finishDrag(ctx, false);
    expect(onCommitReorder).not.toHaveBeenCalled();
    expect(el.classList.contains("dragging")).toBe(false);
    expect(ctx.dragCtxRef.current).toBeNull();
  });

  it("commit=true时按order把DOM节点上挂的__o.d取出来、按新顺序调用onCommitReorder", () => {
    const d0 = makeDebt({ name: "A" }), d1 = makeDebt({ name: "B" }), d2 = makeDebt({ name: "C" });
    const el0 = document.createElement("div") as CardEl; el0.__o = { d: d0 };
    const el1 = document.createElement("div") as CardEl; el1.__o = { d: d1 };
    const el2 = document.createElement("div") as CardEl; el2.__o = { d: d2 };
    const onCommitReorder = vi.fn();
    // order=[1,2,0] 模拟"B被拖到最前，然后C，最后A"这个新顺序
    const ctx = makeCtx({
      dragCtxRef: {
        current: {
          el: el1, cards: [el0, el1, el2], naturalTop: [0, 10, 20], minTop: 0, maxTop: 20,
          order: [1, 2, 0], k0: 1, startPageY: 0, elHeight: 10, lastClientY: 0, rafId: 0,
        },
      },
      onCommitReorder,
    });
    finishDrag(ctx, true);
    expect(onCommitReorder).toHaveBeenCalledWith([d1, d2, d0]);
  });

  it("松手后如果当时是jiggleMode，卡片重新带上.jiggle类(松手不等于退出编辑模式)", () => {
    const el = document.createElement("div");
    const ctx = makeCtx({
      jiggleModeRef: { current: true },
      dragCtxRef: {
        current: {
          el, cards: [el], naturalTop: [0], minTop: 0, maxTop: 0,
          order: [0], k0: 0, startPageY: 0, elHeight: 10, lastClientY: 0, rafId: 0,
        },
      },
    });
    finishDrag(ctx, false);
    expect(el.classList.contains("jiggle")).toBe(true);
  });
});
