import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Hero } from "../src/pay/Hero";
import { makeDebt } from "./mockBridge";

describe("Hero", () => {
  it("soonest为null时显示'全部结清'空状态", () => {
    render(<Hero soonest={null} notifyEnabled={false} onBellClick={() => {}} />);
    expect(screen.getByText("全部结清")).toBeInTheDocument();
    expect(screen.getByText("暂无待还款项")).toBeInTheDocument();
  });

  it("有soonest时显示日期/金额/名称", () => {
    const d = makeDebt({ name: "银行贷", monthly: 2000 });
    render(<Hero soonest={{ d, next: new Date(2026, 6, 30), diff: 5 }} notifyEnabled={false} onBellClick={() => {}} />);
    expect(screen.getByText("7月30日")).toBeInTheDocument();
    expect(screen.getByText("¥2,000")).toBeInTheDocument();
    expect(screen.getByText("银行贷")).toBeInTheDocument();
  });

  it("notifyEnabled控制铃铛的.on类", () => {
    const { container, rerender } = render(<Hero soonest={null} notifyEnabled={false} onBellClick={() => {}} />);
    expect(container.querySelector(".pay-hero-bell")!.className).not.toContain(" on");
    rerender(<Hero soonest={null} notifyEnabled onBellClick={() => {}} />);
    expect(container.querySelector(".pay-hero-bell")!.className).toContain(" on");
  });

  it("点铃铛触发onBellClick", () => {
    const onBellClick = vi.fn();
    render(<Hero soonest={null} notifyEnabled={false} onBellClick={onBellClick} />);
    fireEvent.click(screen.getByLabelText("还款提醒通知设置"));
    expect(onBellClick).toHaveBeenCalledTimes(1);
  });
});
