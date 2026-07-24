import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
    expect(container.textContent).toContain("2026-09-25 还清");
  });
});
