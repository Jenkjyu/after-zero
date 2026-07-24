import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BalanceBars } from "../src/report/BalanceBars";
import type { ReportData } from "../src/types";

const base: ReportData = {
  active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
  byName: [], typeList: [], timeline: [],
};

describe("BalanceBars", () => {
  it("空数据显示暂无在还债务", () => {
    render(<BalanceBars data={base} />);
    expect(screen.getByText("暂无在还债务")).toBeInTheDocument();
  });

  it("按余额渲染条形图，长名字被截断", () => {
    const data: ReportData = {
      ...base,
      byName: [
        { name: "信用卡分期还款计划超长名字测试", balance: 5000 },
        { name: "网贷A", balance: 1000 },
      ],
    };
    render(<BalanceBars data={data} />);
    // truncateLabel(name,10): 15字符超过10，slice(0,9)+"…" = 前9字符加省略号
    expect(screen.getByText("信用卡分期还款计划…")).toBeInTheDocument();
    expect(screen.getByText("¥5,000")).toBeInTheDocument();
    expect(screen.getByText("¥1,000")).toBeInTheDocument();
  });
});
