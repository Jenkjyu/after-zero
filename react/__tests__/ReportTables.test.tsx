import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReportTables } from "../src/report/ReportTables";
import type { MonthlyRepayment, ReportData } from "../src/types";

describe("ReportTables", () => {
  it("四张表默认全部展开渲染(没有<details>折叠)，含月还款明细", () => {
    const data: ReportData = {
      active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
      byName: [{ name: "银行贷", balance: 3000 }],
      typeList: [{ name: "银行贷", value: 3000 }],
      timeline: [{ date: "2026-07-25", balance: 3000 }],
    };
    const monthly: MonthlyRepayment[] = [{ month: "2026-07", actual: 1000, scheduled: 500 }];
    const { container } = render(<ReportTables data={data} monthly={monthly} />);
    expect(container.querySelector("details")).toBeNull();
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(4);
    expect(container.textContent).toContain("¥3,000");
    expect(container.textContent).toContain("月还款明细");
    expect(container.textContent).toContain("2026-07");
    expect(container.textContent).toContain("¥1,000");
    expect(container.textContent).toContain("¥500");
  });

  it("月还款明细表列出月份/已还/待还三列", () => {
    const data: ReportData = {
      active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
      byName: [], typeList: [], timeline: [],
    };
    const monthly: MonthlyRepayment[] = [
      { month: "2026-01", actual: 100, scheduled: 0 },
      { month: "2026-02", actual: 0, scheduled: 200 },
    ];
    const { container } = render(<ReportTables data={data} monthly={monthly} />);
    const lastTable = container.querySelectorAll("table")[3];
    expect(lastTable.querySelectorAll("th").length).toBe(3);
    const rows = lastTable.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("2026-01");
    expect(rows[0].textContent).toContain("¥100");
    expect(rows[1].textContent).toContain("2026-02");
    expect(rows[1].textContent).toContain("¥200");
  });
});
