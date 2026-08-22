import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiBanner } from "../src/debts/AiBanner";

describe("AiBanner", () => {
  it("未开通Premium时显示引导文案、不带is-ai类", () => {
    render(<AiBanner premium={{ premium: null }} onClick={() => {}} />);
    const btn = document.getElementById("aiBannerBtn")!;
    expect(btn.className).not.toContain("is-ai");
    expect(screen.getByText("AI 识图录入")).toBeInTheDocument();
    expect(screen.getByText(/25 次识图录入额度/)).toBeInTheDocument();
  });

  it("已开通Premium时显示顾问文案、带is-ai类(驱动发光效果的CSS钩子)", () => {
    render(<AiBanner premium={{ premium: { method: "onetime", at: "2026-01-01" } }} onClick={() => {}} />);
    const btn = document.getElementById("aiBannerBtn")!;
    expect(btn.className).toContain("is-ai");
    expect(screen.getByText("AI 识图录入")).toBeInTheDocument();
    expect(screen.getByText(/多张还款计划截图/)).toBeInTheDocument();
  });

  it("点击调用传入的onClick(App.tsx里据此决定跳订阅页还是AI顾问页)", () => {
    const onClick = vi.fn();
    render(<AiBanner premium={{ premium: null }} onClick={onClick} />);
    fireEvent.click(screen.getByText("AI 识图录入").closest("button")!);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
