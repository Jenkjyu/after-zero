// detailSheet不再经过window.__azBridge打开/关闭(见shared/state.ts的openDetailSheet/
// closeDetailSheet)，测试直接调用这两个函数控制状态，用window.__azBridge断言"业务操作"
// (编辑/销这期/提前结清/模拟)是否调用了正确的vanilla桥接函数。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { DetailSheet } from "../src/sheets/DetailSheet";
import { closeDetailSheet, closeEditSheet, closeSimScreen, openDetailSheet, useEditSheetId, useSimScreenId } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { Debt } from "../src/types";

afterEach(() => {
  closeDetailSheet(); // detailSheetId是模块级状态，重置避免测试间互相污染
  closeEditSheet();
  closeSimScreen();
});

describe("DetailSheet", () => {
  it("打开时锁住根滚动，关闭后解除，避免 iOS 详情滚动带动主页面", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    expect(document.documentElement).not.toHaveClass("az-detail-sheet-open");
    expect(document.body).not.toHaveClass("az-detail-sheet-open");

    act(() => { openDetailSheet(debts[0].id); });
    expect(document.documentElement).toHaveClass("az-detail-sheet-open");
    expect(document.body).toHaveClass("az-detail-sheet-open");

    act(() => { closeDetailSheet(); });
    expect(document.documentElement).not.toHaveClass("az-detail-sheet-open");
    expect(document.body).not.toHaveClass("az-detail-sheet-open");
  });

  it("openDetailSheet(id)后显示对应债务的数据(含还款计划表格行数)", () => {
    const debts: Debt[] = [
      makeDebt({ name: "银行贷", funder: "某银行", type: "银行贷", original: 10000, balance: 8000, rate: 6, monthly: 1000, nextDate: "2026-09-01", opened: "2026-01-01", paidTerms: 2, totalTerms: 10, terms: 8 }),
    ];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.getByText("银行贷")).toBeInTheDocument();
    expect(screen.getByText("某银行 · 银行贷")).toBeInTheDocument();
    expect(screen.getByText("¥8,000")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /1\/1/ })).toBeInTheDocument();
  });

  it("d.oneTime为true时按钮文案是一次性结清，否则是销这期", () => {
    const debts: Debt[] = [makeDebt({ oneTime: true, terms: 1 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.getByText("一次性结清")).toBeInTheDocument();
  });

  it("terms<=0时不渲染销这期/一次性结清按钮", () => {
    const debts: Debt[] = [makeDebt({ terms: 0 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.queryByText("销这期")).not.toBeInTheDocument();
  });

  it("点编辑：关闭detailSheet+调用openEditSheet(id)(纯React状态，不经过__azBridge)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    const editHook = renderHook(() => useEditSheetId());
    act(() => { openDetailSheet(debts[0].id); });
    fireEvent.click(screen.getByText("编辑"));
    expect(editHook.result.current).toBe(debts[0].id);
  });

  it("点销这期：调用payInstallment(id)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    fireEvent.click(screen.getByText("销这期"));
    expect(window.__azBridge.payInstallment).toHaveBeenCalledWith(debts[0].id);
  });

  it("点提前结清：调用settleFull(id)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    fireEvent.click(screen.getByText("提前结清"));
    expect(window.__azBridge.settleFull).toHaveBeenCalledWith(debts[0].id);
  });

  it("点提前还款模拟：关闭detailSheet+调用openSimScreen(id)(纯React状态，不经过__azBridge)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    const simHook = renderHook(() => useSimScreenId());
    act(() => { openDetailSheet(debts[0].id); });
    fireEvent.click(screen.getByText("提前还款模拟"));
    expect(simHook.result.current).toBe(debts[0].id);
  });

  it("点关闭按钮：sheet的open class消失", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();
    fireEvent.click(screen.getByText("关闭"));
    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("点击scrim背景：关闭sheet", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    fireEvent.click(container.querySelector(".scrim")!);
    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("关闭动画期间内容不清空(displayId冻结在最后一次打开的债务上)", () => {
    const debts: Debt[] = [makeDebt({ name: "冻结测试" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    act(() => { closeDetailSheet(); });
    expect(screen.getByText("冻结测试")).toBeInTheDocument(); // sheet仍在DOM里，只是没有open class，内容没被清空
  });

  it("debts数组引用不变、只是原地mutate某个元素(真实vanilla payInstallment/settleFull的行为)也能触发自动关闭——回归测试", () => {
    // 这是真实踩过的bug：如果自动关闭那个effect写成`useEffect(..., [debts, openId])`，
    // 数组引用没变时依赖比较会认为"debts没变"，即使数组里的对象已经被原地改成settled=true
    // 也不会重新跑这个effect。vanilla的payInstallment/settleFull改的正是同一个数组引用里的
    // 元素(只有commitReorder/applyBackupData/导入JSON才会整体重新赋值)，所以这个场景
    // 必须单独测，不能只靠上面那个"换新数组"的测试掩盖过去。
    const d = makeDebt({ name: "原地结清测试" });
    const debts: Debt[] = [d];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(d.id); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();

    d.settled = true; // 原地mutate，debts数组引用完全不变
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("这笔债务变成settled后自动关闭sheet(数组整体重新赋值场景)", () => {
    const d = makeDebt({ name: "会被结清" });
    const debts: Debt[] = [d];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(d.id); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();

    const settledDebts = [{ ...d, settled: true }];
    window.__azBridge.getDebts = vi.fn(() => settledDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("这笔债务从debts数组消失(备份恢复/导入)后自动关闭sheet", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();

    const emptyDebts: Debt[] = []; // vi.fn(() => [])每次调用会返回新引用，触发useSyncExternalStore
    // 的"getSnapshot不稳定"保护性报错——真实vanilla的getDebts()除非整体重新赋值否则永远
    // 返回同一个引用(见shared/state.ts注释)，这里用一个稳定引用的空数组如实模拟这种情况。
    window.__azBridge.getDebts = vi.fn(() => emptyDebts);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });

  it("terms<=0时不渲染协商减免按钮", () => {
    const debts: Debt[] = [makeDebt({ terms: 0 })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.queryByText("协商减免这一期")).not.toBeInTheDocument();
  });

  it("点协商减免：调用waiveInstallment(id)(已知的数据模型缺口④)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    fireEvent.click(screen.getByText("协商减免这一期"));
    expect(window.__azBridge.waiveInstallment).toHaveBeenCalledWith(debts[0].id);
  });

  it("计划表加了实付日期列——已还且有paidAt的行显示实付日期，没有的显示—(已知的数据模型缺口③)", () => {
    const debts: Debt[] = [makeDebt({
      plan: [
        { date: "2026-07-01", amount: 500, principal: 480, interest: 20, paid: true, paidAt: "2026-07-03" },
        { date: "2026-08-01", amount: 500, principal: 480, interest: 20, paid: false },
      ],
      totalTerms: 2, paidTerms: 1, terms: 1,
    })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.getByText("2026-07-03")).toBeInTheDocument(); // 第1期的实付日期
    const rows = screen.getAllByRole("row");
    expect(rows[2]).toHaveTextContent("—"); // 第2期(未还)没有实付日期
  });

  it("部分还款(还没还完)的行显示已还/欠的小字提示——已知的数据模型缺口④", () => {
    const debts: Debt[] = [makeDebt({
      plan: [{ date: "2026-08-01", amount: 100, principal: 80, interest: 20, paid: false, paidAmount: 40 }],
    })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.getByText("已还 ¥40.00，欠 ¥60.00")).toBeInTheDocument();
  });

  it("协商减免关闭的行(paid=true但paidAmount小于amount)显示实收/减免的小字提示，不是部分还款那条文案", () => {
    const debts: Debt[] = [makeDebt({
      plan: [{ date: "2026-08-01", amount: 100, principal: 80, interest: 20, paid: true, paidAt: "2026-08-05", paidAmount: 40 }],
      totalTerms: 1, paidTerms: 1, terms: 0,
    })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    expect(screen.getByText("实收 ¥40.00，减免 ¥60.00")).toBeInTheDocument();
  });

  it("提前结清行(settleRow)不显示部分还款/减免小字提示，实付日期列显示—(日期列本身已经是真实付款日)", () => {
    const debts: Debt[] = [makeDebt({
      plan: [{ date: "2026-08-05", amount: 500, principal: 480, interest: 20, paid: true, settleRow: true }],
      totalTerms: 1, paidTerms: 1, terms: 0, settled: true, settledDate: "8/5",
    })];
    window.__azBridge = makeMockBridge({ debts });
    render(<DetailSheet />);
    act(() => { openDetailSheet(debts[0].id); });
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("—"); // 实付日期列
    expect(screen.queryByText(/已还 ¥|实收 ¥/)).not.toBeInTheDocument();
  });

  it("删除的不是数组最后一条时也能正确按id判断、自动关闭——detailSheet现在跟EditSheet共享同一个不受splice下标顺移影响的判断", () => {
    // 这个场景是EditSheet.test.tsx当年那个真实bug的镜像验证：两笔债务，打开第一笔的详情窗，
    // 从别处删除它(debts.splice(0,1)让第二笔顺移到下标0)——按id查找不受这次顺移影响，
    // 应该正确判定"这笔债务不在了"并自动关闭，不会误读成"第二笔债务"的数据。
    const target = makeDebt({ name: "被删的这条" });
    const other = makeDebt({ name: "另一条" });
    const debts: Debt[] = [target, other];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<DetailSheet />);
    act(() => { openDetailSheet(target.id); });
    expect(container.querySelector(".sheet.open")).not.toBeNull();
    expect(screen.getByText("被删的这条")).toBeInTheDocument();

    const afterDelete = [other]; // 模拟vanilla deleteDebt()确认后splice(0,1)+派发az:state-changed
    window.__azBridge.getDebts = vi.fn(() => afterDelete);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });

    expect(container.querySelector(".sheet.open")).toBeNull();
  });
});
