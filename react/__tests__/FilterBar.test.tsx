// 2026-07-29改版：筛选档位从4个(全部/已逾期/7天内/30天内)加到5个(中间补了15天内)，
// 整条改成可横向滑动，最右侧钉一个不跟着滚的日历图标做"自定义天数"。
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterBar } from "../src/pay/FilterBar";

function renderBar(props?: Partial<React.ComponentProps<typeof FilterBar>>) {
  return render(
    <FilterBar
      value="next"
      customDays={null}
      onChange={() => {}}
      onPickCustom={() => {}}
      {...props}
    />
  );
}

describe("FilterBar", () => {
  it("五个档位都在，当前值对应的按钮带active类", () => {
    renderBar({ value: "d7" });
    ["下一期", "已逾期", "7天内", "15天内", "30天内"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText("7天内").className).toContain("active");
    expect(screen.getByText("下一期").className).not.toContain("active");
  });

  it("点击不同的筛选按钮触发onChange", () => {
    const onChange = vi.fn();
    renderBar({ value: "next", onChange });
    fireEvent.click(screen.getByText("已逾期"));
    expect(onChange).toHaveBeenCalledWith("overdue");
    fireEvent.click(screen.getByText("15天内"));
    expect(onChange).toHaveBeenCalledWith("d15");
  });

  it("点击当前已选中的按钮不触发onChange(值没变)", () => {
    const onChange = vi.fn();
    renderBar({ value: "d30", onChange });
    fireEvent.click(screen.getByText("30天内"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("日历按钮固定在滚动区之外(滑走了就等于没有这个入口)", () => {
    const { container } = renderBar();
    const scroll = container.querySelector(".pf-scroll")!;
    expect(scroll.querySelectorAll(".pf-btn").length).toBe(5);
    expect(scroll.querySelector(".pf-cal")).toBeNull();
    expect(container.querySelector(".pf-cal")).toBeTruthy();
  });

  it("点日历图标触发onPickCustom", () => {
    const onPickCustom = vi.fn();
    renderBar({ onPickCustom });
    fireEvent.click(screen.getByLabelText("按日期筛选"));
    expect(onPickCustom).toHaveBeenCalledTimes(1);
  });

  it("自定义筛选生效时，日历按钮带active并显示天数", () => {
    renderBar({ value: "custom", customDays: 45 });
    expect(screen.getByText("45天内")).toBeInTheDocument();
    expect(screen.getByLabelText("自定义筛选：45天内").className).toContain("active");
  });
});
