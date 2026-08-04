// 还清进度：三个里程碑标在图上 + 拖动读数 + 不画坐标轴。
//
// ⚠️jsdom 不做布局，getBoundingClientRect() 全是 0——scrub 的"手指落点映射到第几个点"
// 这段几何要打桩才测得出来（不打桩的话 rect.width 是 0，nearestIndexForX 直接返回 0，
// 测了等于没测）。下面用 Object.defineProperty 临时覆盖，跑完在 finally 里还原。
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { Journey } from "../src/report/Journey";
import type { DebtSummary, ReportData } from "../src/types";

function data(over?: Partial<ReportData>): ReportData {
  return {
    active: [],
    totalBalance: 10000,
    avgRate: 8,
    payoffDate: "2028-09-15",
    byName: [],
    typeList: [],
    timeline: [
      { date: "2026-07-31", balance: 10000 },
      { date: "2027-02-15", balance: 5000 },
      { date: "2027-09-15", balance: 2000 },
      { date: "2028-09-15", balance: 0 },
    ],
    ...over,
  };
}
const summary: DebtSummary = {
  total: 10000, monthly: 500, active: 3, settled: 1,
  paidPrincipal: 8500, paidInterest: 400, pct: 46,
};

beforeEach(() => {
  window.parseDate = (s: string) => new Date(s + "T00:00:00");
  window.niceCeil = (v: number) => Math.ceil(v / 1000) * 1000 || 1;
  window.fmt = (n: number) => Math.round(n).toLocaleString("en-US");
});

describe("Journey", () => {
  it("三个里程碑的名称/时间/金额都标在图上（不是图下面一排像图例的字）", () => {
    render(<Journey data={data()} s={summary} monthsLeft={26} />);
    const labs = [...document.querySelectorAll(".jlab")];
    expect(labs.length).toBe(3);
    expect(labs.map((el) => el.querySelector(".t")!.textContent)).toEqual(["今天", "还掉一半", "归零"]);
    // 每个标签都带日期和金额
    labs.forEach((el) => {
      expect(el.querySelector(".d")!.textContent!.trim()).toMatch(/^\d{4}-\d{2}$/);
      expect(el.querySelector(".a")!.textContent).toMatch(/^¥/);
    });
    expect(document.querySelector(".jlab .a")!.textContent).toBe("¥10,000");
  });

  it("不画坐标轴——三个里程碑已经给了锚点，精确值交给拖动读数", () => {
    render(<Journey data={data()} s={summary} monthsLeft={26} />);
    expect(document.querySelector(".gridline")).toBeNull();
    expect(document.querySelector(".axaxis")).toBeNull();
    expect(document.querySelector(".chart-xaxis")).toBeNull();
  });

  it("「还掉一半」定位到余额首次跌破当前一半的那个点", () => {
    // 10000 → 一半是 5000，第 2 个点(索引1)正好等于 5000
    render(<Journey data={data()} s={summary} monthsLeft={26} />);
    const half = [...document.querySelectorAll(".jlab")][1];
    expect(half.querySelector(".d")!.textContent!.trim()).toBe("2027-02");
    expect(half.querySelector(".a")!.textContent).toBe("¥5,000");
  });

  it("按住拖动出读数，里程碑淡化；松手恢复", () => {
    const { container } = render(<Journey data={data()} s={summary} monthsLeft={26} />);
    const chart = container.querySelector(".jchart") as HTMLElement;
    const orig = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
    try {
      // 打桩成 320px 宽、从 x=0 开始，这样 clientX=320 就是最后一个点
      Object.defineProperty(Element.prototype, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
      });
      expect(document.querySelector(".jread")!.textContent).toContain("按住曲线");
      expect(document.querySelector(".jcursor")).toBeNull();

      fireEvent.pointerDown(chart, { pointerType: "mouse", pointerId: 1, clientX: 320 });
      expect(document.querySelector(".jread")!.textContent).toContain("2028-09-15");
      expect(document.querySelector(".jread")!.textContent).toContain("¥0");
      expect(chart.className).toContain("scrubbing");
      expect(document.querySelector(".jcursor")).toBeTruthy();

      fireEvent.pointerMove(chart, { pointerType: "mouse", pointerId: 1, clientX: 0 });
      expect(document.querySelector(".jread")!.textContent).toContain("¥10,000");

      // 松手：真正回到拖拽前的样子——占位文字、无游标、里程碑不再淡化
      // (这是标准press-and-hold交互，早期版本这里从来没做过，读数会一直粘着显示)
      fireEvent.pointerUp(chart, { pointerType: "mouse", pointerId: 1, clientX: 0 });
      expect(document.querySelector(".jread")!.textContent).toContain("按住曲线");
      expect(document.querySelector(".jcursor")).toBeNull();
      expect(chart.className).not.toContain("scrubbing");
    } finally {
      if (orig) Object.defineProperty(Element.prototype, "getBoundingClientRect", orig);
    }
  });

  // ⚠️真机反馈"游标显示的位置比手指实际按压的位置偏左"的回归测试：这份timeline故意
  // 前5个点挤在20天内(模拟"早期好几笔债务扎堆还款")、最后一个点远在两年后(模拟"还完
  // 大部分只剩一笔长期债务")——按真实时间比例渲染时，前5个点全部挤在图表最左边2.7%
  // 的宽度内。旧算法假设点均匀分布，会把"摸中间"错配成index3(它真实位置只在2%处，
  // 视觉上远在手指左边)；新算法按真实位置匹配，应该选中index4(真实位置离中间最近)。
  it("时间分布不均匀时，按真实渲染位置匹配触摸点，不是按点的序号比例", () => {
    const skewed = data({
      timeline: [
        { date: "2026-07-31", balance: 10000 },
        { date: "2026-08-05", balance: 9000 },
        { date: "2026-08-10", balance: 8000 },
        { date: "2026-08-15", balance: 7000 },
        { date: "2026-08-20", balance: 6000 },
        { date: "2028-08-20", balance: 0 },
      ],
    });
    const { container } = render(<Journey data={skewed} s={summary} monthsLeft={26} />);
    const chart = container.querySelector(".jchart") as HTMLElement;
    const orig = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
    try {
      Object.defineProperty(Element.prototype, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
      });
      // 摸图表正中间(clientX=160，ratio=0.5)——真实时间比例上离中点最近的是index4(2026-08-20)
      fireEvent.pointerDown(chart, { pointerType: "mouse", pointerId: 1, clientX: 160 });
      expect(document.querySelector(".jread")!.textContent).toContain("2026-08-20");
      expect(document.querySelector(".jread")!.textContent).toContain("¥6,000");
    } finally {
      if (orig) Object.defineProperty(Element.prototype, "getBoundingClientRect", orig);
    }
  });

  it("数据不足时给明确说明，不画一条假曲线", () => {
    render(<Journey data={data({ timeline: [{ date: "2026-07-31", balance: 0 }], totalBalance: 0 })} s={summary} monthsLeft={null} />);
    expect(document.querySelector(".jchart")).toBeNull();
    expect(document.querySelector(".sec-a")!.textContent).toContain("暂无足够数据");
  });

});
