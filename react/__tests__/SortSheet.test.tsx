// 排序方式选择器——从原生<select>换成自绘底部面板之后的行为契约。
// 面板走createPortal挂到document.body，所以断言用screen(全document查询)而不是
// render返回的container(只覆盖组件自己那棵子树)。
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SortSheet } from "../src/debts/SortSheet";
import type { SortOption } from "../src/debts/SortSheet";

const OPTIONS: SortOption[] = [
  { value: "rate-desc", label: "利率 高→低" },
  { value: "bal-asc", label: "剩余待还 低→高" },
  { value: "custom", label: "自定义" },
];

describe("SortSheet", () => {
  it("关闭时不带open类(常驻挂载、只切class，这样上滑过渡才播得出来)", () => {
    render(<SortSheet open={false} value="rate-desc" options={OPTIONS} onPick={() => {}} onClose={() => {}} />);
    expect(document.querySelector(".sort-sheet")).not.toHaveClass("open");
    expect(document.querySelector(".scrim")).not.toHaveClass("open");
  });

  it("打开后列出全部选项，当前项带active和aria-current", () => {
    render(<SortSheet open value="bal-asc" options={OPTIONS} onPick={() => {}} onClose={() => {}} />);
    expect(document.querySelector(".sort-sheet")).toHaveClass("open");
    OPTIONS.forEach((o) => expect(screen.getByText(o.label)).toBeInTheDocument());
    const activeBtn = screen.getByText("剩余待还 低→高").closest("button")!;
    expect(activeBtn).toHaveClass("active");
    expect(activeBtn).toHaveAttribute("aria-current", "true");
    // 只有当前项带对勾，其余两项不带
    expect(document.querySelectorAll(".sort-opt.active").length).toBe(1);
  });

  // 深色模式圆角露白的修复(2026-07-29)：滚动必须在内层.sheet-scroll上，.sheet本身
  // 只留圆角+overflow:hidden。这条结构断言防止以后有人图省事把滚动改回.sheet上。
  it("内容在.sheet-scroll内层滚动容器里，grip留在外层", () => {
    render(<SortSheet open value="rate-desc" options={OPTIONS} onPick={() => {}} onClose={() => {}} />);
    const sheet = document.querySelector(".sort-sheet")!;
    const scroll = sheet.querySelector(".sheet-scroll")!;
    expect(scroll).toBeTruthy();
    expect(scroll.querySelector(".sort-opt-list")).toBeTruthy();
    // grip是.sheet的直接子元素，不在滚动区里(拖动条不该被内容滚走)
    expect(scroll.querySelector(".grip")).toBeNull();
    expect(sheet.querySelector(":scope > .grip")).toBeTruthy();
  });

  it("点某一项：回传该项的值并关闭面板", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<SortSheet open value="rate-desc" options={OPTIONS} onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getByText("自定义"));
    expect(onPick).toHaveBeenCalledWith("custom");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点遮罩关闭，但不改变已选项", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<SortSheet open value="rate-desc" options={OPTIONS} onPick={onPick} onClose={onClose} />);
    fireEvent.click(document.querySelector(".scrim")!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});
