import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PayoffLine } from "../src/report/PayoffLine";
import type { ReportData } from "../src/types";

const base: ReportData = {
  active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
  byName: [], typeList: [], timeline: [],
};

describe("PayoffLine", () => {
  it("timeline少于2个点时显示占位说明", () => {
    render(<PayoffLine data={{ ...base, totalBalance: 1000, timeline: [{ date: "2026-07-25", balance: 1000 }] }} />);
    expect(screen.getByText("暂无足够数据（没有在还债务或还款计划）")).toBeInTheDocument();
  });

  it("totalBalance<=0时显示占位说明(即使timeline够长)", () => {
    render(<PayoffLine data={{ ...base, totalBalance: 0, timeline: [{ date: "2026-07-25", balance: 0 }, { date: "2026-08-25", balance: 0 }] }} />);
    expect(screen.getByText("暂无足够数据（没有在还债务或还款计划）")).toBeInTheDocument();
  });

  it("有足够数据时渲染SVG折线图，含今天/还清标签", () => {
    const data: ReportData = {
      ...base,
      totalBalance: 1000,
      timeline: [
        { date: "2026-07-25", balance: 1000 },
        { date: "2026-08-25", balance: 500 },
        { date: "2026-09-25", balance: 0 },
      ],
    };
    const { container } = render(<PayoffLine data={data} />);
    expect(container.querySelector("svg.viz-line-svg")).toBeInTheDocument();
    expect(container.querySelector("path[fill='var(--accent-soft)']")).toBeInTheDocument();
    expect(container.textContent).toContain("今天 ¥1,000");
    expect(container.textContent).toContain("预计 2026-09-25 还清");
  });

  it("X轴按真实时间比例排布，不是按数组下标等距", () => {
    // 三个点：7/1 → 8/1（31天）→ 12/1（122天）。按下标等距的话两段各占50%；
    // 按真实时间应该是 31/153≈20% 和 80%。这是"折线斜率没有意义"那个真实问题的回归。
    const data: ReportData = {
      ...base, totalBalance: 1000,
      timeline: [
        { date: "2026-07-01", balance: 1000 },
        { date: "2026-08-01", balance: 600 },
        { date: "2026-12-01", balance: 0 },
      ],
    };
    const { container } = render(<PayoffLine data={data} />);
    const d = container.querySelector("path[fill='none']")!.getAttribute("d")!;
    const xs = d.split(/[ML]/).filter(Boolean).map((seg) => parseFloat(seg.split(",")[0]));
    expect(xs[0]).toBeCloseTo(0, 1);
    expect(xs[2]).toBeCloseTo(300, 1);
    // 中间点：31天 / 153天 * 300 ≈ 60.8，等距的话会是150
    expect(xs[1]).toBeGreaterThan(55);
    expect(xs[1]).toBeLessThan(66);
  });

  it("标注为预测，并说明本App不保存历史余额", () => {
    const data: ReportData = {
      ...base, totalBalance: 1000,
      timeline: [{ date: "2026-07-01", balance: 1000 }, { date: "2026-12-01", balance: 0 }],
    };
    render(<PayoffLine data={data} />);
    expect(screen.getByText("预测")).toBeInTheDocument();
    expect(screen.getByText(/本App不保存历史余额，这条线不是实际走过的轨迹/)).toBeInTheDocument();
  });

  it("Y轴3档刻度，顶格取整到好看数字", () => {
    const data: ReportData = {
      ...base, totalBalance: 1733,
      timeline: [{ date: "2026-07-01", balance: 1733 }, { date: "2026-12-01", balance: 0 }],
    };
    const { container } = render(<PayoffLine data={data} />);
    const ticks = [...container.querySelectorAll(".chart-gridline span")].map((s) => s.textContent);
    expect(ticks).toEqual(["0", "1,000", "2,000"]);
  });

  it("桌面指针拖动触发scrub readout更新（划到最后一点/回到第一点）", () => {
    const data: ReportData = {
      ...base,
      totalBalance: 1000,
      timeline: [
        { date: "2026-07-25", balance: 1000 },
        { date: "2026-08-25", balance: 500 },
        { date: "2026-09-25", balance: 0 },
      ],
    };
    const { container } = render(<PayoffLine data={data} />);
    const chartWrap = container.querySelector("svg.viz-line-svg")!.parentElement as HTMLElement;
    vi.spyOn(chartWrap, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 300, right: 300, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON() {}
    } as DOMRect);

    fireEvent.pointerDown(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 300 });
    expect(container.textContent).toContain("2026-09-25 预计剩余 ¥0");

    fireEvent.pointerMove(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 0 });
    expect(container.textContent).toContain("2026-07-25 预计剩余 ¥1,000");

    // 释放手指后readout停留在最后scrub到的点，不自动回弹
    fireEvent.pointerUp(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 0 });
    expect(container.textContent).toContain("2026-07-25 预计剩余 ¥1,000");
  });
});
