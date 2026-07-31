// 类型占比：可拖拽旋转的甜甜圈，标签标在图上。
//
// ⚠️jsdom 不做布局，clientWidth 恒为 0——组件里 apply() 第一句就是 `if (!W) return`，
// 不打桩的话扇区和引线一个都画不出来，测了等于没测。下面用 Object.defineProperty
// 临时覆盖 clientWidth，跑完还原。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { TypePie } from "../src/report/TypePie";
import type { ReportData } from "../src/types";

function data(over?: Partial<ReportData>): ReportData {
  return {
    active: [],
    totalBalance: 58988,
    avgRate: 10.84,
    payoffDate: "2028-09-15",
    byName: [],
    typeList: [
      { name: "银行贷", value: 35711 },
      { name: "信用卡分期", value: 16208 },
      { name: "网贷", value: 7069 },
    ],
    timeline: [{ date: "2026-07-31", balance: 58988 }],
    ...over,
  };
}

let origW: PropertyDescriptor | undefined;
beforeEach(() => {
  window.fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  origW = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, value: 326 });
});
afterEach(() => {
  if (origW) Object.defineProperty(Element.prototype, "clientWidth", origW);
});

describe("TypePie", () => {
  it("每个类型画一个扇区，标签带名称/百分比/金额，且没有独立图例块", () => {
    render(<TypePie data={data()} />);
    expect(document.querySelectorAll(".pie-slice").length).toBe(3);
    const labs = [...document.querySelectorAll(".pie-lab")];
    expect(labs.length).toBe(3);
    expect(labs[0].textContent).toContain("银行贷");
    expect(labs[0].textContent).toContain("61%");
    expect(labs[0].textContent).toContain("¥35,711");
    // 旧版那个 26px 堆叠条 + .viz-legend 图例已经整块删掉
    expect(document.querySelector(".viz-stack")).toBeNull();
    expect(document.querySelector(".viz-legend")).toBeNull();
  });

  it("每个标签配一条折线引线（斜出一段再水平拉到边缘）", () => {
    render(<TypePie data={data()} />);
    const leads = [...document.querySelectorAll(".pie-lead")];
    expect(leads.length).toBe(3);
    // 折线：M 起点 L 折点 L 终点 —— 三个坐标点
    leads.forEach((el) => {
      const d = el.getAttribute("d")!;
      expect(d.match(/[ML]/g)!.length).toBe(3);
    });
  });

  it("中心孔和扇区描边用纯色，不能是 CSS 渐变（SVG 的 fill 不接受渐变值，会回退成黑色）", () => {
    render(<TypePie data={data()} />);
    const hub = document.querySelector(".pie-hub")!;
    // 颜色由 CSS 类给（var(--surface)），这里锁的是"没有把渐变写进 fill 属性"
    expect(hub.getAttribute("fill")).toBeNull();
    expect(document.querySelector(".pie-slice")!.getAttribute("fill")).toMatch(/^var\(--pie-\d\)$/);
  });

  it("拖拽能转动扇区组，且标签文字保持水平（不给标签加 rotate）", () => {
    const { container } = render(<TypePie data={data()} />);
    const root = container.querySelector(".pie-wrap") as HTMLElement;
    const g = container.querySelector("svg > g") as SVGGElement;
    const before = g.getAttribute("transform");

    const orig = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
    try {
      Object.defineProperty(Element.prototype, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 326, height: 262, right: 326, bottom: 262, x: 0, y: 0, toJSON: () => ({}) }),
      });
      root.setPointerCapture = () => {};
      fireEvent.pointerDown(root, { pointerType: "mouse", pointerId: 1, clientX: 163 + 80, clientY: 131 });
      fireEvent.pointerMove(root, { pointerType: "mouse", pointerId: 1, clientX: 163, clientY: 131 + 80 });
      expect(g.getAttribute("transform")).not.toBe(before);
      // 标签只改了 top/left，没有 rotate——转到下半圈时文字不能是倒的
      [...document.querySelectorAll<HTMLElement>(".pie-lab")].forEach((el) => {
        expect(el.style.transform || "").not.toContain("rotate");
      });
    } finally {
      if (orig) Object.defineProperty(Element.prototype, "getBoundingClientRect", orig);
    }
  });

  it("中心显示总负债", () => {
    render(<TypePie data={data()} />);
    expect(document.querySelector(".pie-center .v")!.textContent).toBe("¥58,988");
  });

  it("没有在还债务时整段不渲染", () => {
    const { container } = render(<TypePie data={data({ typeList: [], totalBalance: 0 })} />);
    expect(container.firstChild).toBeNull();
  });
});
