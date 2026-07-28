import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Summary } from "../src/debts/Summary";
import { makeDebt } from "./mockBridge";

describe("Summary", () => {
  it("hero卡显示在还总负债，KPI网格显示已还金额/月供/笔数/已结清", () => {
    const debts = [
      makeDebt({ balance: 1000, monthly: 200, paidPrincipal: 500, paidInterest: 50, settled: false }),
      makeDebt({ balance: 0, monthly: 0, paidPrincipal: 300, paidInterest: 30, settled: true }),
    ];
    render(<Summary debts={debts} premium={{ premium: null }} onAiBannerClick={() => {}} />);
    // hero: 只算未结清的1000
    expect(screen.getByText("1,000")).toBeInTheDocument();
    // 已还金额KPI: 累计口径=500+已结清的300=800（曾经排除已结清，是真实bug，见calc.js注释）
    expect(screen.getByText("¥800")).toBeInTheDocument();
    // 在还笔数=1，已结清=1
    const kpis = document.querySelectorAll(".kpi .v");
    const values = Array.from(kpis).map((el) => el.textContent);
    expect(values).toContain("1"); // 在还笔数
  });

  it("计算口径说明默认折叠，点击后展开", () => {
    render(<Summary debts={[]} premium={{ premium: null }} onAiBannerClick={() => {}} />);
    const note = document.getElementById("sumNote")!;
    expect(note.style.display).toBe("none");
    fireEvent.click(screen.getByText("计算口径说明"));
    expect(note.style.display).toBe("");
  });
});
