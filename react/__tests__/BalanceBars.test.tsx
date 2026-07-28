// BalanceBars 改成"可切换排序维度"之后，数据源从 data.byName（只有name/balance）换成
// data.active（Debt[]，利率在d.rate、剩余利息要从d.plan现算），所以fixture用makeDebt。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BalanceBars } from "../src/report/BalanceBars";
import { makeDebt } from "./mockBridge";
import type { Debt, ReportData } from "../src/types";

const base: ReportData = {
  active: [], totalBalance: 0, avgRate: 0, payoffDate: null,
  byName: [], typeList: [], timeline: [],
};
const withActive = (active: Debt[]): ReportData => ({ ...base, active });

// 余额/利率/剩余利息三个维度的排名故意各不相同，才能验出"切了排序但条长没跟着换"这类bug
const BIG_LOW = makeDebt({
  id: "a", name: "信用卡分期还款计划超长名字测试", balance: 5000, rate: 6,
  plan: [{ date: "2027-01-10", principal: 5000, interest: 100, amount: 5100, paid: false }],
});
const SMALL_HIGH = makeDebt({
  id: "b", name: "网贷A", balance: 1000, rate: 24,
  plan: [{ date: "2027-01-10", principal: 1000, interest: 900, amount: 1900, paid: false }],
});

describe("BalanceBars", () => {
  it("空数据显示暂无在还债务", () => {
    render(<BalanceBars data={base} />);
    expect(screen.getByText("暂无在还债务")).toBeInTheDocument();
  });

  it("默认按余额排序，长名字被截断", () => {
    render(<BalanceBars data={withActive([BIG_LOW, SMALL_HIGH])} />);
    expect(screen.getByText("各债务剩余待还")).toBeInTheDocument();
    // truncateLabel(name,10): 15字符超过10，slice(0,9)+"…" = 前9字符加省略号
    expect(screen.getByText("信用卡分期还款计划…")).toBeInTheDocument();
    expect(screen.getByText("¥5,000")).toBeInTheDocument();
    expect(screen.getByText("¥1,000")).toBeInTheDocument();
  });

  it('切到"利率"后，顺序、数值单位、条长代表的量三者一起换（不能只换顺序）', () => {
    const { container } = render(<BalanceBars data={withActive([BIG_LOW, SMALL_HIGH])} />);
    const widths = () =>
      [...container.querySelectorAll(".viz-bar-fill")].map((el) => (el as HTMLElement).style.width);
    const names = () => [...container.querySelectorAll(".viz-bar-name")].map((el) => el.textContent);

    // 余额维度：5000那笔排第一、条最长(100%)
    expect(names()[0]).toBe("信用卡分期还款计划…");
    expect(widths()[0]).toBe("100%");

    fireEvent.click(screen.getByText("利率"));
    expect(screen.getByText("各债务年化利率")).toBeInTheDocument();
    // 利率维度：24%那笔排第一，且**条长跟着变成利率的比例**——余额最大那笔的条反而短了
    expect(names()[0]).toBe("网贷A");
    expect(widths()[0]).toBe("100%"); // 24% 是最大值
    expect(widths()[1]).toBe("25%"); // 6/24 = 25%，不是按余额的100%
    expect(screen.getByText("24.00%")).toBeInTheDocument();
    expect(screen.getByText("6.00%")).toBeInTheDocument();
    expect(screen.queryByText("¥5,000")).not.toBeInTheDocument(); // 单位换了，不再显示金额
  });

  it('切到"剩余利息"后按未还期次的利息合计排序，并提示可能低估', () => {
    render(<BalanceBars data={withActive([BIG_LOW, SMALL_HIGH])} />);
    fireEvent.click(screen.getByText("剩余利息"));
    expect(screen.getByText("各债务剩余待付利息")).toBeInTheDocument();
    expect(screen.getByText("¥900")).toBeInTheDocument(); // 网贷A
    expect(screen.getByText("¥100")).toBeInTheDocument(); // 信用卡
    expect(screen.getByText(/没拆分本金\/利息的债务会显示为 ¥0/)).toBeInTheDocument();
  });

  it("切换排序会清掉已选中的高亮（避免高亮留在换了顺序之后的另一行上）", () => {
    const { container } = render(<BalanceBars data={withActive([BIG_LOW, SMALL_HIGH])} />);
    const rows = () => container.querySelectorAll(".viz-bar-row");
    fireEvent.click(rows()[0]);
    expect(rows()[0].className).toContain("active");
    fireEvent.click(screen.getByText("利率"));
    expect(rows()[0].className).not.toContain("active");
  });

  it("点击行切换.active，再点一次清除，点其它行只有那一行高亮", () => {
    const { container } = render(<BalanceBars data={withActive([BIG_LOW, SMALL_HIGH])} />);
    const rows = container.querySelectorAll(".viz-bar-row");
    expect(rows[0].className).not.toContain("active");

    fireEvent.click(rows[0]);
    expect(rows[0].className).toContain("active");
    expect(rows[1].className).not.toContain("active");

    fireEvent.click(rows[0]);
    expect(rows[0].className).not.toContain("active");

    fireEvent.click(rows[1]);
    expect(rows[0].className).not.toContain("active");
    expect(rows[1].className).toContain("active");
  });
});
