// 跟其余pay测试(手造PayItem fixture)不同，这里走真实的window.today0()/parseDate/dueBucket
// 等calc.js全局函数，验证App.tsx的items计算+筛选+分组整条链路真的接得上，不只是各组件
// 各自正确——跟report的ReportApp.test.tsx是同一个用意。
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
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

describe("pay App", () => {
  it("挂载后基于真实debts数据渲染hero+筛选+分组列表", () => {
    const today = new Date();
    const debts = [
      makeDebt({ name: "逾期债务", nextDate: fmtYMD(addDays(today, -2)) }),
      makeDebt({ name: "3天内债务", nextDate: fmtYMD(addDays(today, 3)) }),
      makeDebt({ name: "已结清债务", nextDate: fmtYMD(addDays(today, 1)), settled: true }), // isActive排除
    ];
    window.__azBridge = makeMockBridge({ debts, notify: { enabled: true, rules: [] } });
    render(<App />);
    // hero: 最近一笔是"逾期债务"(diff最小，排最前)——hero和列表行都会显示这个名字，
    // 用getByText会因两处命中报错，改成断言hero卡片内的文字。
    expect(document.querySelector(".pay-hero-name")!.textContent).toBe("逾期债务");
    // 铃铛状态跟notify.enabled同步
    expect(document.querySelector(".pay-hero-bell")!.className).toContain(" on");
    // 分组：已逾期1笔 + 7天内1笔(已结清那笔被isActive过滤掉，不出现)
    const labels = Array.from(document.querySelectorAll(".section-label")).map((el) => el.textContent);
    expect(labels).toEqual(["已逾期 · 1 笔", "7天内 · 1 笔"]);
    expect(screen.queryByText("已结清债务")).not.toBeInTheDocument();
  });

  it("点筛选按钮后列表只显示对应分类", () => {
    const today = new Date();
    const debts = [
      makeDebt({ name: "逾期债务", nextDate: fmtYMD(addDays(today, -1)) }),
      makeDebt({ name: "本周债务", nextDate: fmtYMD(addDays(today, 3)) }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<App />);
    fireEvent.click(screen.getByText("已逾期"));
    // hero卡和列表行都会显示"最近一笔"的名字，这里只关心#payList内部的实际展示行，
    // 用getByText会因为两处都命中而报"找到多个匹配"，改成在#payList范围内查询。
    const list = document.getElementById("payList")!;
    expect(list.textContent).toContain("逾期债务");
    expect(list.textContent).not.toContain("本周债务");
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
