import { describe, expect, it, vi } from "vitest";
import { GRIP_CLOSE_THRESHOLD, makeGripDragState, onGripPointerDown, onGripPointerEnd, onGripPointerMove } from "../src/sheets/gripDrag";

function fakeEvent(clientY: number, pointerId = 1) {
  return { clientY, pointerId } as unknown as PointerEvent;
}

describe("onGripPointerDown", () => {
  it("记录起点、标记dragging=true、暂停transition", () => {
    const sheet = document.createElement("div");
    const grip = document.createElement("div");
    const state = makeGripDragState();
    onGripPointerDown(fakeEvent(100), sheet, grip, state);
    expect(state.dragging).toBe(true);
    expect(state.startY).toBe(100);
    expect(sheet.style.transition).toBe("none");
  });
});

describe("onGripPointerMove", () => {
  it("未处于dragging状态时不做任何事", () => {
    const sheet = document.createElement("div");
    const state = makeGripDragState();
    onGripPointerMove(fakeEvent(150), sheet, state, true);
    expect(sheet.style.transform).toBe("");
  });

  it("下拖(dy>0)平移sheet，跟resizable无关", () => {
    const sheet = document.createElement("div");
    const grip = document.createElement("div");
    const state = makeGripDragState();
    onGripPointerDown(fakeEvent(100), sheet, grip, state);
    onGripPointerMove(fakeEvent(140), sheet, state, false);
    expect(sheet.style.transform).toBe("translateY(40px)");
  });

  it("上拖(dy<0)且resizable=true时调整height、清空transform", () => {
    const sheet = document.createElement("div");
    const grip = document.createElement("div");
    const state = makeGripDragState();
    onGripPointerDown(fakeEvent(200), sheet, grip, state);
    onGripPointerMove(fakeEvent(150), sheet, state, true);
    expect(sheet.style.height).not.toBe("");
    expect(sheet.style.transform).toBe("");
  });

  it("上拖(dy<0)且resizable=false时什么都不做(editSheet同款场景)", () => {
    const sheet = document.createElement("div");
    const grip = document.createElement("div");
    const state = makeGripDragState();
    onGripPointerDown(fakeEvent(200), sheet, grip, state);
    onGripPointerMove(fakeEvent(150), sheet, state, false);
    expect(sheet.style.height).toBe("");
    expect(sheet.style.transform).toBe("");
  });
});

describe("onGripPointerEnd", () => {
  it("下拖超过阈值(90px)触发onClose", () => {
    const sheet = document.createElement("div");
    const grip = document.createElement("div");
    const state = makeGripDragState();
    const onClose = vi.fn();
    onGripPointerDown(fakeEvent(0), sheet, grip, state);
    onGripPointerEnd(fakeEvent(GRIP_CLOSE_THRESHOLD + 1), sheet, state, onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(state.dragging).toBe(false);
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.transition).toBe("");
  });

  it("下拖未超过阈值不触发onClose，但依然复位transform/transition", () => {
    const sheet = document.createElement("div");
    const grip = document.createElement("div");
    const state = makeGripDragState();
    const onClose = vi.fn();
    onGripPointerDown(fakeEvent(0), sheet, grip, state);
    onGripPointerEnd(fakeEvent(30), sheet, state, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.transition).toBe("");
  });

  it("未处于dragging状态时是no-op，不会误触发onClose", () => {
    const sheet = document.createElement("div");
    const state = makeGripDragState();
    const onClose = vi.fn();
    onGripPointerEnd(fakeEvent(999), sheet, state, onClose);
    expect(onClose).not.toHaveBeenCalled();
  });
});
