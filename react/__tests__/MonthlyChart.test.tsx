import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MonthlyChart } from "../src/report/MonthlyChart";
import type { MonthlyRepayment } from "../src/types";

const months: MonthlyRepayment[] = [
  { month: "2026-01", actual: 1000, scheduled: 0 },
  { month: "2026-02", actual: 500, scheduled: 500 },
  { month: "2026-03", actual: 0, scheduled: 800 },
];

function mockRect(el: HTMLElement) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0, width: 300, right: 300, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON() {}
  } as DOMRect);
}

describe("MonthlyChart", () => {
  it("空数据显示占位说明", () => {
    render(<MonthlyChart months={[]} />);
    expect(screen.getByText("暂无还款计划数据")).toBeInTheDocument();
  });

  it("默认柱状模式，readout默认显示最新一个月", () => {
    const { container } = render(<MonthlyChart months={months} />);
    expect(container.querySelector(".viz-monthly-bars")).toBeInTheDocument();
    expect(container.querySelector("svg.viz-line-svg")).not.toBeInTheDocument();
    expect(container.textContent).toContain("2026-03 已还 ¥0 待还 ¥800");
  });

  it("切换柱状/折线模式", () => {
    const { container } = render(<MonthlyChart months={months} />);
    fireEvent.click(screen.getByLabelText("折线图"));
    expect(container.querySelector("svg.viz-line-svg")).toBeInTheDocument();
    expect(container.querySelector(".viz-monthly-bars")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("柱状图"));
    expect(container.querySelector(".viz-monthly-bars")).toBeInTheDocument();
    expect(container.querySelector("svg.viz-line-svg")).not.toBeInTheDocument();
  });

  it("点击图表更新activeIndex和readout文字（柱状模式）", () => {
    const { container } = render(<MonthlyChart months={months} />);
    const chartWrap = container.querySelector(".viz-monthly-bars")!.parentElement as HTMLElement;
    mockRect(chartWrap);
    fireEvent.pointerDown(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 0 });
    expect(container.textContent).toContain("2026-01 已还 ¥1,000 待还 ¥0");
    expect(container.querySelectorAll(".viz-monthly-col")[0].className).toContain("active");
  });

  it("桌面指针拖动序列连续扫过多个点，readout跟着更新（折线模式）", () => {
    const { container } = render(<MonthlyChart months={months} />);
    fireEvent.click(screen.getByLabelText("折线图"));
    const chartWrap = container.querySelector("svg.viz-line-svg")!.parentElement as HTMLElement;
    mockRect(chartWrap);

    fireEvent.pointerDown(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 0 });
    expect(container.textContent).toContain("2026-01 已还 ¥1,000 待还 ¥0");

    fireEvent.pointerMove(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 150 });
    expect(container.textContent).toContain("2026-02 已还 ¥500 待还 ¥500");

    fireEvent.pointerMove(chartWrap, { pointerId: 1, pointerType: "mouse", clientX: 300 });
    expect(container.textContent).toContain("2026-03 已还 ¥0 待还 ¥800");
  });
});
