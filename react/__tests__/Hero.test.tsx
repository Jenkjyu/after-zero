import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Hero } from "../src/pay/Hero";

describe("Hero", () => {
  it("soonest为null时显示'全部结清'空状态", () => {
    render(<Hero soonest={null} notifyEnabled={false} onBellClick={() => {}} />);
    expect(screen.getByText("全部结清")).toBeInTheDocument();
    expect(screen.getByText("暂无待还款项")).toBeInTheDocument();
  });

  it("有soonest时显示日期/金额/名称", () => {
    render(<Hero soonest={{ next: new Date(2026, 6, 30), diff: 5, amount: 2000, name: "银行贷" }} notifyEnabled={false} onBellClick={() => {}} />);
    expect(screen.getByText("7月30日")).toBeInTheDocument();
    expect(screen.getByText("¥2,000")).toBeInTheDocument();
    expect(screen.getByText("银行贷")).toBeInTheDocument();
  });

  it("同一天有多笔债务到期时，名称显示为'xxx 等N笔'、金额是这些期次的加总", () => {
    render(<Hero soonest={{ next: new Date(2026, 6, 30), diff: 5, amount: 3000, name: "银行贷 等3笔" }} notifyEnabled={false} onBellClick={() => {}} />);
    expect(screen.getByText("银行贷 等3笔")).toBeInTheDocument();
    expect(screen.getByText("¥3,000")).toBeInTheDocument();
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
