import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { TypeStack } from "../src/report/TypeStack";
import type { ReportData } from "../src/types";

const base: ReportData = {
  active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
  byName: [], typeList: [], timeline: [],
};

describe("TypeStack", () => {
  it("空typeList不渲染任何内容", () => {
    const { container } = render(<TypeStack data={base} />);
    expect(container.firstChild).toBeNull();
  });

  it("按typeList渲染堆叠段+图例，颜色循环var(--series-N)", () => {
    const data: ReportData = {
      ...base,
      typeList: [
        { name: "银行贷", value: 6000 },
        { name: "网贷", value: 4000 },
      ],
    };
    const { container } = render(<TypeStack data={data} />);
    const segs = container.querySelectorAll(".viz-stack-seg");
    expect(segs.length).toBe(2);
    expect((segs[0] as HTMLElement).style.background).toBe("var(--series-1)");
    expect((segs[1] as HTMLElement).style.background).toBe("var(--series-2)");
    // jsdom会把CSS宽度值归一化(丢掉多余的尾随零)，断言时不能死写"60.00%"
    expect((segs[0] as HTMLElement).style.width).toBe("60%");
    expect(container.textContent).toContain("银行贷 60%");
    expect(container.textContent).toContain("网贷 40%");
  });

  it("点堆叠段/图例项联动同步，非选中段加.dim，再点一次清除", () => {
    const data: ReportData = {
      ...base,
      typeList: [
        { name: "银行贷", value: 6000 },
        { name: "网贷", value: 4000 },
      ],
    };
    const { container } = render(<TypeStack data={data} />);
    const segs = container.querySelectorAll(".viz-stack-seg");
    const legendItems = container.querySelectorAll(".viz-legend-item");

    // 点堆叠段第一段：图例第一项同步高亮，堆叠段第二段变暗
    fireEvent.click(segs[0]);
    expect(legendItems[0].className).toContain("active");
    expect(segs[0].className).not.toContain("dim");
    expect(segs[1].className).toContain("dim");

    // 再点一次清除
    fireEvent.click(segs[0]);
    expect(legendItems[0].className).not.toContain("active");
    expect(segs[1].className).not.toContain("dim");

    // 点图例第二项：堆叠段第二段同步高亮，第一段变暗
    fireEvent.click(legendItems[1]);
    expect(legendItems[1].className).toContain("active");
    expect(segs[1].className).not.toContain("dim");
    expect(segs[0].className).toContain("dim");
  });
});
