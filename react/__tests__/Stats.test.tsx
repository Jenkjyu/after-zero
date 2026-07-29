import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stats } from "../src/pay/Stats";
import { makeDebt } from "./mockBridge";
import type { PayItem } from "../src/pay/App";

describe("Stats", () => {
  it("items为空时不渲染任何内容", () => {
    const { container } = render(<Stats items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("7/15/30天内待还是累计口径(层层包含)，逾期不计入，按期算不按笔算", () => {
    const items: PayItem[] = [
      { d: makeDebt(), next: new Date(), diff: -1, amount: 100, planIdx: 0, isNextUnpaid: true }, // 逾期，三档都不计
      { d: makeDebt(), next: new Date(), diff: 3, amount: 200, planIdx: 0, isNextUnpaid: true },  // 7天内 → 三档都计
      { d: makeDebt(), next: new Date(), diff: 12, amount: 300, planIdx: 0, isNextUnpaid: true }, // 15天内 → 15/30计
      { d: makeDebt(), next: new Date(), diff: 20, amount: 500, planIdx: 0, isNextUnpaid: true }, // 30天内 → 只有30计
      { d: makeDebt(), next: new Date(), diff: 45, amount: 400, planIdx: 0, isNextUnpaid: true }, // 超过30天，都不计
    ];
    render(<Stats items={items} />);
    const cards = [...document.querySelectorAll(".kpi")].map((c) => c.textContent);
    expect(cards.length).toBe(3);
    expect(cards[0]).toContain("¥200");   // 7天内
    expect(cards[0]).toContain("共 1 期");
    expect(cards[1]).toContain("¥500");   // 15天内 = 200+300
    expect(cards[1]).toContain("共 2 期");
    expect(cards[2]).toContain("¥1,000"); // 30天内 = 200+300+500
    expect(cards[2]).toContain("共 3 期");
  });

  it("三张卡的标签跟筛选条的档位一一对应", () => {
    const items: PayItem[] = [{ d: makeDebt(), next: new Date(), diff: 1, amount: 100, planIdx: 0, isNextUnpaid: true }];
    render(<Stats items={items} />);
    ["7天内待还", "15天内待还", "30天内待还"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });
});
