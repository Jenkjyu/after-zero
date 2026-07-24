import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
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
});
