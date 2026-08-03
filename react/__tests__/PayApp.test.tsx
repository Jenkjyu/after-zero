// 跟其余pay测试(手造PayItem fixture)不同，这里走真实的window.today0()/parseDate/dueBucket
// 等calc.js全局函数，验证App.tsx的items计算+筛选+分组整条链路真的接得上，不只是各组件
// 各自正确——跟report的ReportApp.test.tsx是同一个用意。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { App } from "../src/pay/App";
import { closeNotifySheet, useNotifySheetOpen } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";

afterEach(() => {
  closeNotifySheet(); // notifySheetOpen是模块级状态，重置避免测试间互相污染
});

function fmtYMD(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// App现在遍历d.plan逐期展开(不再只看d.nextDate)，所以fixture必须给真实的plan。
// offsets是相对今天的天数，每个offset生成一期。
function debtWithPlan(name: string, offsets: number[], amount = 100, extra?: Record<string, unknown>) {
  const today = new Date();
  return makeDebt({
    name,
    plan: offsets.map((n) => ({
      date: fmtYMD(addDays(today, n)), amount, principal: amount, interest: 0, paid: false,
    })),
    nextDate: fmtYMD(addDays(today, offsets[0])),
    monthly: amount,
    ...extra,
  });
}

describe("pay App", () => {
  it("挂载后基于真实debts数据渲染hero+筛选+分组列表", () => {
    const today = new Date();
    const debts = [
      debtWithPlan("逾期债务", [-2]),
      debtWithPlan("3天内债务", [3]),
      debtWithPlan("已结清债务", [1], 100, { settled: true }), // isActive排除
    ];
    window.__azBridge = makeMockBridge({ debts, notify: { enabled: true, rules: [] } });
    render(<App />);
    // hero: 最近一笔是"逾期债务"(diff最小，排最前)——hero和列表行都会显示这个名字，
    // 用getByText会因两处命中报错，改成断言hero卡片内的文字。
    expect(document.querySelector(".pay-hero-name")!.textContent).toBe("逾期债务");
    // 铃铛状态跟notify.enabled同步
    expect(document.querySelector(".pay-hero-bell")!.className).toContain(" on");
    // 默认筛选是"下一期"(每笔债务只显示最早的未还期)，表头只有一个、计数按期算。
    // 已结清那笔被isActive过滤掉，不出现。
    const labels = Array.from(document.querySelectorAll(".section-label")).map((el) => el.textContent);
    expect(labels).toEqual(["下一期 · 2 期 · ¥200"]);
    expect(screen.queryByText("已结清债务")).not.toBeInTheDocument();
  });

  it("点筛选按钮后列表只显示对应分类", () => {
    const today = new Date();
    const debts = [debtWithPlan("逾期债务", [-1]), debtWithPlan("本周债务", [3])];
    window.__azBridge = makeMockBridge({ debts });
    render(<App />);
    fireEvent.click(screen.getByText("已逾期"));
    // hero卡和列表行都会显示"最近一笔"的名字，这里只关心#payList内部的实际展示行，
    // 用getByText会因为两处都命中而报"找到多个匹配"，改成在#payList范围内查询。
    const list = document.getElementById("payList")!;
    expect(list.textContent).toContain("逾期债务");
    expect(list.textContent).not.toContain("本周债务");
  });

  it("日历自定义筛选：选一个未来日期→按'到那天为止'过滤列表", async () => {
    const today = new Date();
    const debts = [debtWithPlan("10天后", [10]), debtWithPlan("50天后", [50])];
    const bridge = makeMockBridge({ debts });
    // 复用vanilla共享确认弹窗的opts.date那条路径——这里mock成"用户选了20天后那一天"
    bridge.confirmAsync = vi.fn(() => Promise.resolve(fmtYMD(addDays(today, 20))));
    window.__azBridge = bridge;
    render(<App />);

    await act(async () => { fireEvent.click(screen.getByLabelText("按日期筛选")); });

    expect(bridge.confirmAsync).toHaveBeenCalled();
    // 按钮上显示算出来的天数，且进入选中态
    expect(screen.getByText("20天内")).toBeInTheDocument();
    const list = document.getElementById("payList")!;
    expect(list.textContent).toContain("10天后");
    expect(list.textContent).not.toContain("50天后");
  });

  it("日历弹窗取消：不改变当前筛选", async () => {
    const today = new Date();
    const debts = [debtWithPlan("50天后", [50])];
    const bridge = makeMockBridge({ debts });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(null)); // 取消
    window.__azBridge = bridge;
    render(<App />);

    await act(async () => { fireEvent.click(screen.getByLabelText("按日期筛选")); });

    // 日历按钮没有进入选中态(aria-label还是未选中时那句)，列表也还是"全部"
    expect(screen.getByLabelText("按日期筛选")).toBeInTheDocument();
    expect(document.querySelector(".pf-cal")!.className).not.toContain("active");
    const list = document.getElementById("payList")!;
    expect(list.textContent).toContain("50天后");
  });

  // 这条锁的就是2026-07-29那次改造的核心：窗口拉长之后，**同一笔债务的多期各占一行**。
  // 改造前列表是遍历debts、每笔只取d.nextDate，行数被债务数量卡死——"100天内"筛出来的
  // 行数永远等于债务数，看不到后面几期。
  it("窗口够长时同一笔债务的多期各占一行，且只有最早那期能销", async () => {
    const bridge = makeMockBridge({
      debts: [
        debtWithPlan("信用卡分期", [5, 35, 65, 95], 104),
        debtWithPlan("一次性借款", [40], 2000),
      ],
    });
    const today = new Date();
    bridge.confirmAsync = vi.fn(() => Promise.resolve(fmtYMD(addDays(today, 100))));
    window.__azBridge = bridge;
    render(<App />);

    // 默认"下一期"：两笔债务各一行
    const list = document.getElementById("payList")!;
    expect(list.querySelectorAll(".pay-row").length).toBe(2);
    expect(document.querySelector(".section-label")!.textContent).toBe("下一期 · 2 期 · ¥2,104");

    // 切到100天窗口：信用卡分期4期 + 一次性1期 = 5行
    await act(async () => { fireEvent.click(screen.getByLabelText("按日期筛选")); });
    expect(list.querySelectorAll(".pay-row").length).toBe(5);
    expect(document.querySelector(".section-label")!.textContent).toBe("100天内 · 5 期 · ¥2,416");

    // 只有每笔债务最早的那一期能销，其余置灰
    const btns = [...list.querySelectorAll(".pay-swipe-btn")];
    expect(btns.filter((b) => !b.className.includes("is-disabled")).length).toBe(2);
    expect(btns.filter((b) => b.className.includes("is-disabled")).length).toBe(3);
  });

  it("行上显示的是这一期的金额，不是d.monthly", async () => {
    // 先息后本：前两期只还利息100，第三期还本金10000——用d.monthly的话三行全显示100，
    // 那笔10,100会在页面上彻底消失
    const today = new Date();
    const d = makeDebt({
      name: "先息后本",
      monthly: 100,
      plan: [
        { date: fmtYMD(addDays(today, 5)), amount: 100, principal: 0, interest: 100, paid: false },
        { date: fmtYMD(addDays(today, 35)), amount: 100, principal: 0, interest: 100, paid: false },
        { date: fmtYMD(addDays(today, 65)), amount: 10100, principal: 10000, interest: 100, paid: false },
      ],
    });
    const bridge = makeMockBridge({ debts: [d] });
    bridge.confirmAsync = vi.fn(() => Promise.resolve(fmtYMD(addDays(today, 100))));
    window.__azBridge = bridge;
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByLabelText("按日期筛选")); });

    const amounts = [...document.querySelectorAll("#payList .pay .a")].map((el) => el.textContent);
    expect(amounts).toEqual(["¥100", "¥100", "¥10,100"]);
  });

  it("点铃铛调用openNotifySheet(纯React状态，不经过__azBridge)", () => {
    window.__azBridge = makeMockBridge({ debts: [] });
    render(<App />);
    const hook = renderHook(() => useNotifySheetOpen());
    fireEvent.click(screen.getByLabelText("还款提醒通知设置"));
    expect(hook.result.current).toBe(true);
  });

  it("没有待还债务时列表区留空、不显示筛选后为空的footnote", () => {
    window.__azBridge = makeMockBridge({ debts: [] });
    render(<App />);
    expect(screen.getByText("全部结清")).toBeInTheDocument();
    expect(screen.queryByText("该分类下暂无待还款项")).not.toBeInTheDocument();
  });
});
