// 结论规则引擎的单测——这一层是纯逻辑（触发条件 / severity 公式 / 排序 / 可行动筛选），
// 不涉及任何 DOM，所以直接对着返回的对象断言，不 render。
//
// 这套规则存在的原因：改版前统计页的"结论"是三句写死的话+插值数字，其中一句在真实数据下
// **是假的**（"N 笔网贷吃掉了大部分利息"，而那批网贷占余额 12.0%、占剩余待付利息 12.9%，
// 几乎等比例）。下面第一组用例就是把那个真实场景构造出来，锁住"高利率 ≠ 高剩余利息"。
import { beforeEach, describe, expect, it } from "vitest";
import { buildFindings, toDebtRows, type DebtRow } from "../src/report/findings";
import type { ReportData, UpcomingPressure } from "../src/types";
import { makeDebt } from "./mockBridge";

function rows(list: Partial<DebtRow>[]): DebtRow[] {
  return list.map((x, i) => ({
    id: x.id ?? "d" + i,
    name: x.name ?? "债务" + i,
    type: x.type ?? "银行贷",
    balance: x.balance ?? 1000,
    rate: x.rate ?? 10,
    remainingInterest: x.remainingInterest ?? 100,
    terms: x.terms ?? 12,
  }));
}

function reportData(over?: Partial<ReportData>): ReportData {
  return {
    active: [],
    totalBalance: 10000,
    avgRate: 10,
    payoffDate: "2028-09-15",
    byName: [],
    typeList: [],
    timeline: [{ date: "2026-07-31", balance: 10000 }],
    ...over,
  };
}

function pressure(over?: Partial<UpcomingPressure>): UpcomingPressure {
  return {
    overdue: { amount: 0, principal: 0, interest: 0, count: 0 },
    months: [],
    currentMonth: "2026-07",
    totalAhead: 0,
    monthlyAvg: 0,
    peak: null,
    ...over,
  } as UpcomingPressure;
}

describe("buildFindings", () => {
  it("利息集中度：单笔占剩余待付利息 ≥30% 才触发，severity = 该占比", () => {
    // 剩余待付利息合计取整 1000 好算：test11 占 410 → 41%。
    // ⚠️关键是 test11 年化只有 5.79%（全场最低），却是**剩余利息最多**的那一笔——
    // 因为它金额大、期限长。利率最高的 test1（29.57%）只占 129，排第三。
    // 这就是"高利率 ≠ 高剩余利息"，也是这条规则跟"高息债务"那条必须分开的原因。
    const r = rows([
      { name: "test11", rate: 5.79, balance: 25000, remainingInterest: 410, terms: 25 },
      { name: "test1", rate: 29.57, balance: 2000, remainingInterest: 129, type: "网贷" },
      { name: "test5", rate: 13.43, balance: 5460, remainingInterest: 200 },
      { name: "test8", rate: 6.54, balance: 9782, remainingInterest: 261 },
    ]);
    const out = buildFindings(r, reportData({ totalBalance: 42242 }), pressure());
    const c = out.find((f) => f.id === "concentration");
    expect(c).toBeTruthy();
    expect(c!.severity).toBe(41);          // 410 / 1000
    expect(c!.actionable).toBe(true);
    // 被点名的必须是 test11（剩余利息最多），不是 test1（利率最高）
    expect(c!.actionTitle).toContain("test11");
  });

  it("利息集中度：没有任何一笔超过 30% 时整条不出现（不是显示一条 0% 的空壳）", () => {
    const r = rows([
      { remainingInterest: 100 }, { remainingInterest: 100 },
      { remainingInterest: 100 }, { remainingInterest: 100 },
    ]);
    const out = buildFindings(r, reportData(), pressure());
    expect(out.find((f) => f.id === "concentration")).toBeUndefined();
  });

  it("高息债务：没有年化 ≥18% 的债务时整条不出现", () => {
    const out = buildFindings(rows([{ rate: 6 }, { rate: 12 }]), reportData(), pressure());
    expect(out.find((f) => f.id === "highrate")).toBeUndefined();
  });

  it("高息债务：severity = 余额占比×100 + (最高年化−18)×2", () => {
    const r = rows([
      { name: "低息", rate: 6, balance: 8800, remainingInterest: 10 },
      { name: "高息", rate: 28, balance: 1200, remainingInterest: 10, type: "网贷" },
    ]);
    const out = buildFindings(r, reportData({ totalBalance: 10000 }), pressure());
    const h = out.find((f) => f.id === "highrate")!;
    // 1200/10000=12% → 12 + (28−18)×2 = 32
    expect(h.severity).toBe(32);
  });

  it("还款峰值月：峰值÷月均 <1.5 时不触发，≥1.5 时 severity=(倍数−1)×60 封顶 100", () => {
    const r = rows([{ rate: 6 }]);
    const flat = buildFindings(r, reportData(), pressure({
      peak: { month: "2026-09", total: 1400 }, monthlyAvg: 1000, months: [],
    } as Partial<UpcomingPressure>));
    expect(flat.find((f) => f.id === "peak")).toBeUndefined();

    const spike = buildFindings(r, reportData(), pressure({
      peak: { month: "2026-09", total: 2000 }, monthlyAvg: 1000, months: [],
    } as Partial<UpcomingPressure>));
    const p = spike.find((f) => f.id === "peak")!;
    expect(p.severity).toBe(60);   // (2−1)×60
  });

  it("利息负担分档：恒成立、但 actionable=false，永远不会被选成'最该先动手'", () => {
    const r = rows([{ remainingInterest: 50, balance: 10000 }]);
    const out = buildFindings(r, reportData({ totalBalance: 10000 }), pressure());
    const b = out.find((f) => f.id === "burden")!;
    expect(b.actionable).toBe(false);
    expect(b.severity).toBe(10);   // 50/10000 = 0.5% → 最轻档
    const lead = out.find((f) => f.actionable);
    expect(lead?.id).not.toBe("burden");
  });

  it("利息负担分档：>25% 判偏重、10~25% 判中等", () => {
    const heavy = buildFindings(rows([{ remainingInterest: 3000, balance: 10000 }]),
      reportData({ totalBalance: 10000 }), pressure());
    expect(heavy.find((f) => f.id === "burden")!.severity).toBe(80);
    const mid = buildFindings(rows([{ remainingInterest: 1500, balance: 10000 }]),
      reportData({ totalBalance: 10000 }), pressure());
    expect(mid.find((f) => f.id === "burden")!.severity).toBe(45);
  });

  it("结果按 severity 降序排列", () => {
    const r = rows([
      { name: "大额长期", rate: 5, balance: 25000, remainingInterest: 2000, terms: 30 },
      { name: "高息", rate: 30, balance: 2000, remainingInterest: 100, type: "网贷" },
    ]);
    const out = buildFindings(r, reportData({ totalBalance: 27000 }), pressure({
      peak: { month: "2026-09", total: 6000 }, monthlyAvg: 2000, months: [],
    } as Partial<UpcomingPressure>));
    const sev = out.map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => b - a));
  });
});

describe("toDebtRows", () => {
  beforeEach(() => {
    // remainingInterest 是 calc.js 的全局函数，测试环境里没有 vanilla，打个桩
    window.remainingInterest = (d) => (d.plan || []).reduce((s, r) => (r.paid ? s : s + r.interest), 0);
  });

  it("按余额降序，并现算 remainingInterest（不是读某个已有字段）", () => {
    const out = toDebtRows([
      makeDebt({ name: "小", balance: 100, plan: [{ date: "2026-08-01", amount: 110, principal: 100, interest: 10, paid: false }] }),
      makeDebt({ name: "大", balance: 900, plan: [{ date: "2026-08-01", amount: 950, principal: 900, interest: 50, paid: false }] }),
    ]);
    expect(out.map((x) => x.name)).toEqual(["大", "小"]);
    expect(out[0].remainingInterest).toBe(50);
    expect(out[1].remainingInterest).toBe(10);
  });

  it("没填 type 的债务归到「未分类」，不是 undefined", () => {
    const out = toDebtRows([makeDebt({ name: "x", type: undefined })]);
    expect(out[0].type).toBe("未分类");
  });
});
