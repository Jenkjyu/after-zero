import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterBar } from "../src/pay/FilterBar";

describe("FilterBar", () => {
  it("当前值对应的按钮带active类", () => {
    render(<FilterBar value="week" onChange={() => {}} />);
    expect(screen.getByText("7天内").className).toContain("active");
    expect(screen.getByText("全部").className).not.toContain("active");
  });

  it("点击不同的筛选按钮触发onChange", () => {
    const onChange = vi.fn();
    render(<FilterBar value="all" onChange={onChange} />);
    fireEvent.click(screen.getByText("已逾期"));
    expect(onChange).toHaveBeenCalledWith("overdue");
  });

  it("点击当前已选中的按钮不触发onChange(值没变)", () => {
    const onChange = vi.fn();
    render(<FilterBar value="month" onChange={onChange} />);
    fireEvent.click(screen.getByText("30天内"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
