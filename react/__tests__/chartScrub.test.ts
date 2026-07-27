import { describe, expect, it, vi } from "vitest";
import { attachChartScrub, nearestIndexForX } from "../src/report/chartScrub";

function rect(left: number, width: number): DOMRect {
  return { left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON() {} } as DOMRect;
}

describe("nearestIndexForX", () => {
  it("count<=1时永远返回0", () => {
    expect(nearestIndexForX(999, rect(0, 100), 0)).toBe(0);
    expect(nearestIndexForX(999, rect(0, 100), 1)).toBe(0);
  });

  it("clientX在rect最左边→索引0", () => {
    expect(nearestIndexForX(0, rect(0, 100), 5)).toBe(0);
  });

  it("clientX在rect最右边→最后一个索引", () => {
    expect(nearestIndexForX(100, rect(0, 100), 5)).toBe(4);
  });

  it("clientX在正中间→四舍五入到最近的索引", () => {
    expect(nearestIndexForX(50, rect(0, 100), 5)).toBe(2); // 0.5*4=2
  });

  it("clientX超出rect左边界→clamp到0", () => {
    expect(nearestIndexForX(-50, rect(0, 100), 5)).toBe(0);
  });

  it("clientX超出rect右边界→clamp到最后一个索引", () => {
    expect(nearestIndexForX(500, rect(0, 100), 5)).toBe(4);
  });

  it("rect.width为0时不除0，返回0", () => {
    expect(nearestIndexForX(50, rect(0, 0), 5)).toBe(0);
  });

  it("rect.left非0时按偏移量计算", () => {
    expect(nearestIndexForX(60, rect(10, 100), 3)).toBe(1); // (60-10)/100=0.5 -> round(0.5*2)=1
  });
});

describe("attachChartScrub", () => {
  it("cleanup函数确实移除了全部监听器", () => {
    const el = document.createElement("div");
    const addSpy = vi.spyOn(el, "addEventListener");
    const removeSpy = vi.spyOn(el, "removeEventListener");
    const cleanup = attachChartScrub(el, { count: 5, onIndexChange: () => {} });

    const addedTypes = addSpy.mock.calls.map((c) => c[0]);
    expect(addedTypes).toEqual(expect.arrayContaining([
      "touchstart", "touchmove", "touchend", "touchcancel",
      "pointerdown", "pointermove", "pointerup", "pointercancel"
    ]));

    cleanup();
    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    for (const type of addedTypes) {
      expect(removedTypes).toContain(type);
    }
    expect(removeSpy).toHaveBeenCalledTimes(addSpy.mock.calls.length);
  });
});
