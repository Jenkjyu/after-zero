// ⚠️jsdom对TouchEvent的支持不完整(构造不出带identifier的changedTouches)，这个项目历史上
// 一直是"触摸序列必须真机验证"(见gestures.test.ts开头的说明)——这里桌面鼠标(PointerEvent)
// 路径逻辑上跟触摸路径同构(除了方向判断这一步只有触摸有)，用鼠标路径验证onEnd/xFracFor
// 这套集成行为，重点覆盖nearestIndexForX这个纯函数本身(这是真机反馈"位置偏左"那个bug的
// 根因所在)。
import { describe, expect, it, vi } from "vitest";
import { attachChartScrub, nearestIndexForX } from "../src/report/chartScrub";

function rect(left: number, width: number): DOMRect {
  return { left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON() {} } as DOMRect;
}

// 均匀分布——跟老版本"假设点均匀分布"等价，用来确认二分查找在这种特殊情况下退化成
// 跟旧版round()一样的结果(旧版本的测试用例照抄过来，验证行为没有回归)。
function evenFrac(count: number) {
  return (i: number) => (count <= 1 ? 0 : i / (count - 1));
}

describe("nearestIndexForX", () => {
  it("count<=1时永远返回0", () => {
    expect(nearestIndexForX(999, rect(0, 100), 0, evenFrac(0))).toBe(0);
    expect(nearestIndexForX(999, rect(0, 100), 1, evenFrac(1))).toBe(0);
  });

  it("clientX在rect最左边→索引0", () => {
    expect(nearestIndexForX(0, rect(0, 100), 5, evenFrac(5))).toBe(0);
  });

  it("clientX在rect最右边→最后一个索引", () => {
    expect(nearestIndexForX(100, rect(0, 100), 5, evenFrac(5))).toBe(4);
  });

  it("clientX在正中间→四舍五入到最近的索引(均匀分布下退化成跟旧版round()一致)", () => {
    expect(nearestIndexForX(50, rect(0, 100), 5, evenFrac(5))).toBe(2); // 0.5*4=2
  });

  it("clientX超出rect左边界→clamp到0", () => {
    expect(nearestIndexForX(-50, rect(0, 100), 5, evenFrac(5))).toBe(0);
  });

  it("clientX超出rect右边界→clamp到最后一个索引", () => {
    expect(nearestIndexForX(500, rect(0, 100), 5, evenFrac(5))).toBe(4);
  });

  it("rect.width为0时不除0，返回0", () => {
    expect(nearestIndexForX(50, rect(0, 0), 5, evenFrac(5))).toBe(0);
  });

  it("rect.left非0时按偏移量计算", () => {
    expect(nearestIndexForX(60, rect(10, 100), 3, evenFrac(3))).toBe(1); // (60-10)/100=0.5
  });

  // ⚠️这组才是真机反馈"反馈的位置比手指按压的位置偏左"这个bug的回归测试：点越靠前
  // 密集(时间轴前密后疏是常态)，按"点数比例"算索引会systematically偏离真实触摸位置。
  describe("点分布不均匀时——按真实位置匹配，不是按点数比例", () => {
    // 5个点，真实位置比例是 [0, 0.1, 0.2, 0.3, 1.0]——前4个挤在左边10%~30%，
    // 最后一个远在最右边(模拟"早期密集还款、后期只剩一笔长期债务"的真实分布)。
    const frac = (i: number) => [0, 0.1, 0.2, 0.3, 1.0][i];

    it("按点数比例算(老算法)会把正中间(clientX=50)错配到索引2——按真实位置应该是索引3和4之间", () => {
      // 老算法：round(0.5*4)=2，对应真实位置0.2，离手指位置(0.5)有0.3之差——明显不对。
      // 新算法：ratio=0.5，比较frac(3)=0.3(差0.2)和frac(4)=1.0(差0.5)，应该选更近的索引3。
      expect(nearestIndexForX(50, rect(0, 100), 5, frac)).toBe(3);
    });

    it("手指按在frac(1)=0.1正上方，精确落在该点——不该因为它左边紧挨着索引0而选错", () => {
      expect(nearestIndexForX(10, rect(0, 100), 5, frac)).toBe(1);
    });

    it("手指按在两个疏密不同的点正中间，选距离更近的那个", () => {
      // frac(3)=0.3, frac(4)=1.0，中点是0.65——离frac(3)更近(差0.35 vs 0.35，用一个
      // 更靠近3的点确认不是巧合的两边相等)
      expect(nearestIndexForX(60, rect(0, 100), 5, frac)).toBe(3); // ratio=0.6，差0.3 vs 0.4
    });
  });
});

describe("attachChartScrub", () => {
  function opts(overrides?: Partial<Parameters<typeof attachChartScrub>[1]>) {
    return {
      count: 5,
      xFracFor: evenFrac(5),
      onIndexChange: () => {},
      onEnd: () => {},
      ...overrides,
    };
  }

  it("cleanup函数确实移除了全部监听器", () => {
    const el = document.createElement("div");
    const addSpy = vi.spyOn(el, "addEventListener");
    const removeSpy = vi.spyOn(el, "removeEventListener");
    const cleanup = attachChartScrub(el, opts());

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

  it("桌面鼠标：pointerdown立即报一次索引，pointermove持续更新，pointerup触发onEnd恢复初始态", () => {
    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect(0, 100));
    const onIndexChange = vi.fn();
    const onEnd = vi.fn();
    attachChartScrub(el, opts({ onIndexChange, onEnd }));

    el.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 1, clientX: 0 }));
    expect(onIndexChange).toHaveBeenCalledWith(0);
    expect(onEnd).not.toHaveBeenCalled();

    el.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, clientX: 100 }));
    expect(onIndexChange).toHaveBeenCalledWith(4);

    el.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse", pointerId: 1, clientX: 100 }));
    expect(onEnd).toHaveBeenCalledTimes(1);

    // 松手后再pointermove(比如指针漂移的残留事件)不应该再报索引——手势已经结束
    onIndexChange.mockClear();
    el.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", pointerId: 1, clientX: 50 }));
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("pointercancel也会触发onEnd(不只是pointerup)", () => {
    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect(0, 100));
    const onEnd = vi.fn();
    attachChartScrub(el, opts({ onEnd }));

    el.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 1, clientX: 0 }));
    el.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "mouse", pointerId: 1 }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
