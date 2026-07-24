import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReportTables } from "../src/report/ReportTables";
import type { ReportData } from "../src/types";

describe("ReportTables", () => {
  it("三张表默认全部展开渲染(没有<details>折叠)", () => {
    const data: ReportData = {
      active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
      byName: [{ name: "银行贷", balance: 3000 }],
      typeList: [{ name: "银行贷", value: 3000 }],
      timeline: [{ date: "2026-07-25", balance: 3000 }],
    };
    const { container } = render(<ReportTables data={data} />);
    expect(container.querySelector("details")).toBeNull();
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(3);
    expect(container.textContent).toContain("¥3,000");
  });
});
