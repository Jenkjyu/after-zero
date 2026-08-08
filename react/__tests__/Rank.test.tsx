// 排行：累计占比达 70% 为止，其余折叠。
// 阈值是产品判断（这一段回答"大头在哪"、不是逐笔清单），所以规则本身必须被锁住——
// 改阈值会直接改变列出几笔，不该是"改着改着就漂了"的东西。
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Rank } from "../src/report/Rank";
import type { DebtRow } from "../src/report/findings";

function rows(balances: number[], rates?: number[]): DebtRow[] {
  return balances.map((b, i) => ({
    id: "d" + i, name: "债务" + i, type: "银行贷",
    balance: b, rate: rates?.[i] ?? 8, remainingInterest: 10, terms: 12,
  }));
}

beforeEach(() => {
  window.fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  window.truncateLabel = (s: string) => s;
});

describe("Rank", () => {
  // 真实那份 12 笔的余额分布（总额 58,988），累计 42.4 / 59.0 / 68.2 / 75.7…
  const REAL = [25000, 9782, 5460, 4389, 2578, 2375, 2305, 2303, 2000, 1406, 929, 461];
  const REAL_TOTAL = 58988;

  it("从大到小累加，累计占比刚过 70% 就停", () => {
    render(<Rank rows={rows(REAL)} totalBalance={REAL_TOTAL} />);
    expect(document.querySelectorAll(".rank-row").length).toBe(4);
    const h = document.querySelector(".sec-a")!.textContent!;
    expect(h).toContain("前 4 笔");
    expect(h).toContain("76%");
  });

  it("数据极度集中时只列 1 笔（规则随数据自适应，不是固定 top 3）", () => {
    render(<Rank rows={rows([9000, 300, 300, 200, 200])} totalBalance={10000} />);
    expect(document.querySelectorAll(".rank-row").length).toBe(1);
    expect(document.querySelector(".sec-a")!.textContent).toContain("前 1 笔");
  });

  it("被折叠的部分给出笔数和合计，点开能看到全部", () => {
    render(<Rank rows={rows(REAL)} totalBalance={REAL_TOTAL} />);
    const btn = screen.getByText(/其余 8 笔/);
    expect(btn.textContent).toContain("¥14,357");    // 后 8 笔合计
    fireEvent.click(btn);
    expect(document.querySelectorAll(".rank-row").length).toBe(12);
    fireEvent.click(screen.getByText("收起"));
    expect(document.querySelectorAll(".rank-row").length).toBe(4);
  });

  it("累计到最后一笔才过 70% 时全部列出，不出现折叠按钮", () => {
    // 50% → 100%，第 2 笔才过线，两笔都列出，没有"其余"
    render(<Rank rows={rows([5000, 5000])} totalBalance={10000} />);
    expect(document.querySelectorAll(".rank-row").length).toBe(2);
    expect(screen.queryByText(/其余/)).not.toBeInTheDocument();
  });

  it("年化 ≥18% 的行带「高息」标签、条形用风险色；其余用中性色", () => {
    render(<Rank rows={rows([5000, 5000], [28, 6])} totalBalance={10000} />);
    const tags = document.querySelectorAll(".rank-tag.hi");
    expect(tags.length).toBe(1);
    const bars = [...document.querySelectorAll<HTMLElement>(".rank-bar i")];
    expect(bars[0].style.background).toContain("--risk");
    expect(bars[1].style.background).toContain("--calm");
  });

  it("每行都写着利率数字——颜色不是唯一编码（红↔琥珀那套三档色相分不开，见 AGENTS.md）", () => {
    render(<Rank rows={rows([5000, 5000], [28, 6])} totalBalance={10000} />);
    expect(document.querySelector(".rank-amt .r")!.textContent).toBe("28.00%");
  });
});
