// 长按拖拽排序/左滑这套状态机的核心几何/提交逻辑——真正的touch事件序列(手指按下/移动/松开)
// 依赖jsdom不完整支持的TouchEvent，且这套代码历史上一直是"必须真机验证"的(见CLAUDE.md
// "在还债务自定义排序"一节)，这里只测试不依赖真实触摸序列、可以直接调用验证的部分：
// 滑块开合的DOM效果、拖拽提交(finishDrag)按DOM顺序正确读出新排列并调用回调。
import { describe, expect, it, vi } from "vitest";
import { closeDebtSwipe, DEBT_REVEAL, finishDrag, onCardPointerDown, openDebtSwipeTo } from "../src/debts/gestures";
import type { CardEl, GestureCtx } from "../src/debts/gestures";
import { makeDebt } from "./mockBridge";

function makeCtx(overrides?: Partial<GestureCtx>): GestureCtx {
  return {
    containerRef: { current: null },
    dragCtxRef: { current: null },
    jiggleModeRef: { current: true },
    openSwipeRowRef: { current: null },
    enterJiggle: () => {},
    exitJiggle: () => {},
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

// ===== 编辑模式下"按住不动"退出（2026-07-29新增）=====
// 这里用真实的PointerEvent走onCardPointerDown那条桌面分支——jsdom对PointerEvent的支持
// 比TouchEvent完整得多(TouchEvent在jsdom里构造不出带identifier的changedTouches，所以
// 这个文件开头就说明了触摸序列不在这里测)。两条分支的退出逻辑是逐行同构的，测桌面这条
// 等于同时锁住了触摸那条的行为契约。
describe("编辑模式下长按不动 = 退出编辑模式", () => {
  function setup(jiggling: boolean) {
    const el = document.createElement("div");
    const row = document.createElement("div");
    document.body.appendChild(el);
    const exitJiggle = vi.fn();
    const enterJiggle = vi.fn();
    const container = document.createElement("div");
    container.appendChild(el);
    const ctx = makeCtx({
      containerRef: { current: container },
      jiggleModeRef: { current: jiggling },
      enterJiggle,
      exitJiggle,
    });
    return { el, row, ctx, exitJiggle, enterJiggle };
  }
  function press(el: HTMLElement, clientY = 100) {
    const ev = new PointerEvent("pointerdown", { pointerId: 1, clientX: 50, clientY, bubbles: true });
    Object.defineProperty(ev, "pointerType", { value: "mouse" });
    return ev;
  }

  it("已在编辑模式：按住不动到时间→调exitJiggle，并标记__justDragged拦掉补发的click", () => {
    vi.useFakeTimers();
    const { el, row, ctx, exitJiggle } = setup(true);
    onCardPointerDown(press(el), el, row, ctx);
    vi.advanceTimersByTime(120);          // 拖拽起步
    expect(ctx.dragCtxRef.current).not.toBeNull();
    expect(exitJiggle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450);          // 再按住不动
    expect(exitJiggle).toHaveBeenCalledTimes(1);
    // 零位移的手势松手时浏览器会补发click，不拦的话会顺手打开详情窗
    expect((row as HTMLElement & { __justDragged?: boolean }).__justDragged).toBe(true);
    vi.useRealTimers();
  });

  it("已在编辑模式：按住后移动了→当成拖拽，不退出", () => {
    vi.useFakeTimers();
    const { el, row, ctx, exitJiggle } = setup(true);
    onCardPointerDown(press(el), el, row, ctx);
    vi.advanceTimersByTime(120);
    el.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 50, clientY: 160, bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(exitJiggle).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("还没进编辑模式：长按只进入编辑模式，不会立刻又退出", () => {
    vi.useFakeTimers();
    const { el, row, ctx, exitJiggle, enterJiggle } = setup(false);
    onCardPointerDown(press(el), el, row, ctx);
    vi.advanceTimersByTime(500);          // 未进入编辑模式时的长按判定是500ms
    expect(enterJiggle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(exitJiggle).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
