// 统计页整页测试——故意走真实的 window.computeReportData(debts)/computeUpcomingPressure()，
// 验证 App.tsx 跟 useDebts()/usePremium() 桥接、以及真实 calc.js 数据链路整体接得上，
// 不只是各组件各自正确。
//
// 2026-07-31 这一页从"看板"重做成"债务报告"：石墨 hero + 2×2 KPI + 4 张同构图表卡 +
// 6 行总结，换成"报告头 → 结论 → 最该先动手 → 走势 → 压力 → 排行 → 类型 → 结语"。
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/report/App";
import { makeMockBridge, makeDebt } from "./mockBridge";

// 造一笔"还有 n 期未还"的债务，日期从下个月开始逐月排——真实 calc.js 会据此算出
// timeline / 压力窗口 / 还清日期，不需要手工编造这些派生值。
function debtWith(over: Partial<Parameters<typeof makeDebt>[0]> & { months: number; per: number; interest: number }) {
  const { months, per, interest, ...rest } = over;
  const plan = Array.from({ length: months }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i + 1);
    d.setDate(15);
    return {
      date: d.toISOString().slice(0, 10),
      amount: per + interest,
      principal: per,
      interest,
      paid: false,
    };
  });
  return makeDebt({
    plan,
    balance: per * months,
    original: per * months,
    totalTerms: months,
    terms: months,
    paidTerms: 0,
    monthly: per + interest,
    nextDate: plan[0].date,
    ...rest,
  });
}

describe("report App（债务报告版）", () => {
  it("按报告结构渲染：报告头 → 结论 → 最该先动手 → 走势 → 压力 → 排行 → 类型 → 结语", () => {
    const debts = [
      debtWith({ name: "房贷", type: "银行贷", rate: 6, months: 24, per: 1000, interest: 50 }),
      debtWith({ name: "网贷A", type: "网贷", rate: 28, months: 6, per: 300, interest: 60 }),
      makeDebt({ name: "已结清", settled: true, balance: 0 }),
    ];
    window.__azBridge = makeMockBridge({ debts, premium: { premium: null } });
    render(<App />);

    // 报告头：判断句 + 把数字嵌在句子里的导语（不再是石墨 hero + KPI 网格）
    expect(screen.getByText(/债务体检 ·/)).toBeInTheDocument();
    expect(document.querySelector(".rpt-title")).toBeTruthy();
    expect(document.querySelector(".rpt-lede")).toBeTruthy();
    // 旧版那套已经彻底没了
    expect(document.querySelector(".hero")).toBeNull();
    expect(document.querySelector(".summary .kpi")).toBeNull();
    expect(document.querySelector(".viz-block")).toBeNull();

    // 各语义段落按固定顺序出现
    const qs = [...document.querySelectorAll(".sec-q")].map((el) => el.textContent);
    expect(qs).toEqual([
      "这段时间发生了什么",
      "最该先动手的地方",
      "还清这件事进行到哪了",
      "接下来哪个月最难",
      "钱主要压在哪几笔",
      "这些债务是什么类型",
    ]);
  });

  it("结论条数是算出来的，不是写死三条——标题里的中文数字跟实际条数一致", () => {
    // 只有一笔低息、期数少的债务：高息不触发、峰值不触发、利息集中度也不到 30%
    // （只有一笔时它必然占 100%，所以这里放两笔均分）
    const debts = [
      debtWith({ name: "A", type: "银行贷", rate: 5, months: 12, per: 1000, interest: 10 }),
      debtWith({ name: "B", type: "银行贷", rate: 5, months: 12, per: 1000, interest: 10 }),
    ];
    window.__azBridge = makeMockBridge({ debts, premium: { premium: null } });
    render(<App />);
    const n = document.querySelectorAll(".finding").length;
    const title = document.querySelector(".sec-a")?.textContent ?? "";
    expect(title).toContain(["", "一", "两", "三"][n]);
  });

  it("导出入口挪到页尾结语块，是具名按钮不是 ⋮ 三点图标", () => {
    window.__azBridge = makeMockBridge({
      debts: [debtWith({ name: "A", type: "银行贷", rate: 6, months: 12, per: 500, interest: 20 })],
      premium: { premium: null },
    });
    render(<App />);
    // ⋮ 那个类名全 App 只有旧统计页用过，已删除
    expect(document.querySelector(".report-hero-menu")).toBeNull();
    const btn = screen.getByLabelText("导出报表");
    expect(btn.textContent).toContain("导出这份报告");
    expect(btn.closest(".outro")).toBeTruthy();
    // 默认收起，点了才展开两个选项
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.getByText("导出 PDF")).toBeInTheDocument();
  });

  it("计算口径说明保留下来了（挪到页尾），默认收起、点开有六条口径", () => {
    window.__azBridge = makeMockBridge({
      debts: [debtWith({ name: "A", type: "银行贷", rate: 6, months: 12, per: 500, interest: 20 })],
      premium: { premium: null },
    });
    render(<App />);
    expect(screen.queryByText(/在还总负债 = 各未结清债务/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("计算口径说明"));
    const note = document.querySelector(".rpt-note")!;
    expect(note.textContent).toContain("在还总负债 = 各未结清债务");
    expect(note.textContent).toContain("含已结清");
    expect(note.textContent).toContain("是预测不是承诺");
  });

  it("没有在还债务时整页降级成完成态，不是堆一排「暂无数据」", () => {
    window.__azBridge = makeMockBridge({
      debts: [makeDebt({ name: "已结清", settled: true, balance: 0, paidPrincipal: 5000, paidInterest: 300 })],
      premium: { premium: null },
    });
    render(<App />);
    expect(document.querySelector(".rpt-title")?.textContent).toContain("没有在还的债务");
    expect(document.querySelectorAll(".sec-q").length).toBe(0);
    // 结语和口径说明依然在（导出功能不能因为没有在还债务就消失）
    expect(screen.getByLabelText("导出报表")).toBeInTheDocument();
    expect(screen.getByText("计算口径说明")).toBeInTheDocument();
  });

  it("已结清债务不计入在还总额，但计入已还本金（累计口径）", () => {
    const debts = [
      debtWith({ name: "在还", type: "银行贷", rate: 6, months: 10, per: 100, interest: 5 }),
      makeDebt({ name: "已结清", settled: true, balance: 0, paidPrincipal: 4000, paidInterest: 200 }),
    ];
    window.__azBridge = makeMockBridge({ debts, premium: { premium: null } });
    render(<App />);
    const lede = document.querySelector(".rpt-lede")!.textContent!;
    expect(lede).toContain("¥1,000");   // 在还总负债 = 100×10
    expect(lede).toContain("另有");      // 已结清笔数
    expect(lede).toContain("¥4,000");   // 已还本金含已结清那笔
  });
});
