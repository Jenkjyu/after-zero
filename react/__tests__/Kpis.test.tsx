import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Kpis } from "../src/report/Kpis";
import type { ReportData } from "../src/types";

const base: ReportData = {
  active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
  byName: [], typeList: [], timeline: [],
};

describe("Kpis", () => {
  it("显示加权平均利率(两位小数)和预计还清日期", () => {
    render(<Kpis data={{ ...base, avgRate: 12.345, payoffDate: "2028-06-01" }} />);
    expect(screen.getByText("12.35%")).toBeInTheDocument();
    expect(screen.getByText("2028-06-01")).toBeInTheDocument();
  });

  it("avgRate为0、payoffDate为null时显示占位符0.00%和—", () => {
    render(<Kpis data={base} />);
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
