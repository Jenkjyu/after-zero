// EditSheet(新增/编辑债务表单，含公式生成器GenPanel/逐行编辑PlanRows/批量设置BatchBlock)——
// 整棵子树通过EditSheet这一个入口做集成测试，跟DetailSheet.test.tsx同一个风格：GenPanel/
// PlanRows/BatchBlock都是纯受控组件、没有自己独立的hook/状态订阅，经由父组件驱动，拆开单测
// 收益不大，反而测不出"三者接线接对了没有"这件事。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { EditSheet } from "../src/sheets/EditSheet";
import { closeEditSheet, NEW_DEBT_ID, openEditSheet, useEditSheetId } from "../src/shared/state";
import { makeMockBridge, makeDebt } from "./mockBridge";
import type { Debt } from "../src/types";

function getForm(container: HTMLElement) {
  return container.querySelector("form") as HTMLFormElement;
}

afterEach(() => {
  closeEditSheet(); // editSheetId是模块级状态，重置避免测试间互相污染
});

describe("EditSheet 开关 + 回填", () => {
  it("openEditSheet(NEW_DEBT_ID)新增模式：标题新增债务，字段全空，没有删除按钮", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    expect(screen.getByText("新增债务")).toBeInTheDocument();
    expect(screen.getByLabelText(/贷款产品/)).toHaveValue("");
    expect(screen.queryByText("删除")).not.toBeInTheDocument();
  });

  it("openEditSheet(id)编辑模式：标题编辑债务，字段回填对应debt，有删除按钮", () => {
    const debts: Debt[] = [makeDebt({ name: "银行贷", funder: "某银行", opened: "2026-01-01", notes: "备注文字" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    expect(screen.getByText("编辑债务")).toBeInTheDocument();
    expect(screen.getByLabelText(/贷款产品/)).toHaveValue("银行贷");
    expect(screen.getByLabelText(/出资方/)).toHaveValue("某银行");
    expect(screen.getByLabelText(/备注/)).toHaveValue("备注文字");
    expect(screen.getByText("删除")).toBeInTheDocument();
  });

  it("编辑模式回填公式生成器字段(gen)——切到公式生成tab后能看到当初存的参数", () => {
    const debts: Debt[] = [makeDebt({
      opened: "2026-01-01",
      gen: { kind: "amort", first: "2026-01-01", P: 12000, rate: 6, n: 12 },
    })];
    window.__azBridge = makeMockBridge({ debts });
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.click(screen.getByText("公式生成"));
    expect(screen.getByLabelText(/借款金额/)).toHaveValue(12000);
    expect(screen.getByLabelText(/年化/)).toHaveValue(6);
    expect(screen.getByLabelText(/期数/)).toHaveValue(12);
  });
});

describe("一次性还清(oneTimeStash)", () => {
  it("勾选后取消勾选，原本多期的数据原样保留(不丢第2期起的行)", () => {
    const debts: Debt[] = [makeDebt({
      opened: "2026-01-01",
      plan: [
        { date: "2026-02-01", amount: 500, principal: 480, interest: 20, paid: false },
        { date: "2026-03-01", amount: 500, principal: 480, interest: 20, paid: false },
      ],
    })];
    window.__azBridge = makeMockBridge({ debts });
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    expect(screen.getAllByText(/第\d期/)).toHaveLength(2);
    fireEvent.click(screen.getByLabelText(/一次性还清/));
    expect(screen.getAllByText(/第\d期/)).toHaveLength(1); // 第2期被挪进oneTimeStash，界面上只剩1期
    fireEvent.click(screen.getByLabelText(/一次性还清/));
    expect(screen.getAllByText(/第\d期/)).toHaveLength(2); // 取消勾选，原样放回来
  });
});

describe("手动逐行编辑(PlanRows)——已知的数据模型缺口③", () => {
  it("手动取消勾选已还，顺手清掉paidAt/paidAmount(不留矛盾中间态)", () => {
    const debts: Debt[] = [makeDebt({
      opened: "2026-01-01",
      plan: [{ date: "2026-02-01", amount: 500, principal: 480, interest: 20, paid: true, paidAt: "2026-02-03", paidAmount: 500 }],
    })];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.click(screen.getByLabelText("已还"));
    fireEvent.submit(getForm(container));
    const [, obj] = (window.__azBridge.setDebt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(obj.plan[0].paid).toBe(false);
    expect(obj.plan[0].paidAt).toBeUndefined();
    expect(obj.plan[0].paidAmount).toBeUndefined();
  });

  it("手动勾选已还不自动盖paidAt(编辑历史数据不是真实还款事件)", () => {
    const debts: Debt[] = [makeDebt({
      opened: "2026-01-01",
      plan: [{ date: "2026-02-01", amount: 500, principal: 480, interest: 20, paid: false }],
    })];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.click(screen.getByLabelText("已还"));
    fireEvent.submit(getForm(container));
    const [, obj] = (window.__azBridge.setDebt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(obj.plan[0].paid).toBe(true);
    expect(obj.plan[0].paidAt).toBeUndefined();
  });
});

describe("保存校验", () => {
  it("名称为空：不调用setDebt", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  it("借款日为空：toast提示且不调用setDebt", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.change(screen.getByLabelText(/贷款产品/), { target: { value: "测试贷" } });
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("借款日必填");
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  it("一期还款计划都没有：toast提示且不调用setDebt", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.change(screen.getByLabelText(/贷款产品/), { target: { value: "测试贷" } });
    fireEvent.change(screen.getByLabelText(/借款日/), { target: { value: "2026-01-01" } });
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("至少要有一期还款计划才能保存");
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  it("第1期日期没填：toast提示且不调用setDebt", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.change(screen.getByLabelText(/贷款产品/), { target: { value: "测试贷" } });
    fireEvent.change(screen.getByLabelText(/借款日/), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByText("＋ 加一期"));
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("第 1 期的还款日期必须填写");
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  it("本金/利息为负数：toast提示且不调用setDebt", () => {
    const debts: Debt[] = [makeDebt({ opened: "2026-01-01" })];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    // .prow .r2 input顺序固定是[金额,本金,利息/费]——不用getAllByRole("spinbutton")按全局下标找，
    // 因为#f-day(只读)和批量设置的数值框也是<input type="number">，全局下标很容易数错。
    const r2Inputs = container.querySelectorAll(".prow .r2 input");
    fireEvent.change(r2Inputs[1], { target: { value: "-10" } }); // 本金
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("不能是负数"));
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  it("本金和利息同时为0：toast提示且不调用setDebt", () => {
    const debts: Debt[] = [makeDebt({
      opened: "2026-01-01",
      plan: [{ date: "2026-02-01", amount: 0, principal: 0, interest: 0, paid: false }],
    })];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("不能同时为0"));
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  // amount(金额)和principal+interest(本金+利息)是两条独立填写的轴——见AGENTS.md"⚠️已知的
  // 数据模型缺口"第⑤条。逐行编辑本金/利息会自动联动重算金额(PlanRows.tsx的handlePrincipal/
  // handleInterest)，但直接改"金额"输入框不会反过来联动本金/利息，这是唯一能把两者改到
  // 互相对不上的路径，所以下面这条校验专门堵这条路径。
  it("直接改'金额'导致跟本金+利息对不上：toast提示且不调用setDebt", () => {
    // makeDebt默认plan是{amount:500, principal:480, interest:20}，三者本来是一致的
    const debts: Debt[] = [makeDebt({ opened: "2026-01-01" })];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    const r2Inputs = container.querySelectorAll(".prow .r2 input");
    fireEvent.change(r2Inputs[0], { target: { value: "999" } }); // 直接改金额，不碰本金/利息
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("不一致"));
    expect(window.__azBridge.setDebt).not.toHaveBeenCalled();
  });

  // 反例：公式生成器(amort，n=1整贷整还这种边界情况)会各自独立对principal/interest/amount
  // 四舍五入，真实存在1分钱的量化误差(P=100,rate=0.06,n=1时amount=100.01而principal+interest=
  // 100.00，实测遍历10万+组合验证过这是这套算法本身固有的边界情况，不是bug)——新校验的容差
  // 必须盖过这条噪声，否则用户完全没手动改过的、公式生成器自己吐出来的计划会被这条新增校验
  // 挡在保存门外，这是比"漏检真实错误"更糟的回归。
  it("公式生成器(amort n=1边界)自带的1分钱舍入误差不会被新校验挡住保存", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.change(screen.getByLabelText(/贷款产品/), { target: { value: "测试贷" } });
    fireEvent.change(screen.getByLabelText(/借款日/), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.change(screen.getByLabelText(/借款金额/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/年化/), { target: { value: "0.06" } });
    fireEvent.change(screen.getByLabelText(/期数/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/首期还款日/), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByText("生成计划"));
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.toast).not.toHaveBeenCalledWith(expect.stringContaining("不一致"));
    expect(window.__azBridge.setDebt).toHaveBeenCalledTimes(1);
    const [, obj] = (window.__azBridge.setDebt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(obj.plan[0].amount).toBe(100.01);
    expect(obj.plan[0].principal).toBe(100);
    expect(obj.plan[0].interest).toBe(0);
  });
});

describe("保存成功", () => {
  it("新增债务：setDebt(null, obj) → saveAll → renderAll → 关闭 → toast", () => {
    window.__azBridge = makeMockBridge();
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.change(screen.getByLabelText(/贷款产品/), { target: { value: "测试贷" } });
    fireEvent.change(screen.getByLabelText(/借款日/), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByText("＋ 加一期"));
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[dateInputs.length - 1], { target: { value: "2026-02-01" } });
    const r2Inputs = container.querySelectorAll(".prow .r2 input");
    fireEvent.change(r2Inputs[1], { target: { value: "480" } }); // 本金
    fireEvent.submit(getForm(container));

    expect(window.__azBridge.setDebt).toHaveBeenCalledTimes(1);
    const [id, obj] = (window.__azBridge.setDebt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe(null);
    expect(obj.name).toBe("测试贷");
    expect(obj.plan[0].principal).toBe(480);
    expect(window.__azBridge.saveAll).toHaveBeenCalled();
    expect(window.__azBridge.renderAll).toHaveBeenCalled();
    expect(window.__azBridge.toast).toHaveBeenCalledWith("已保存 ✓");
    const { result } = renderHook(() => useEditSheetId());
    expect(result.current).toBe(null);
  });

  it("编辑已有债务：setDebt(id, obj)里id是正确的债务id", () => {
    const debts: Debt[] = [makeDebt({ opened: "2026-01-01" })];
    window.__azBridge = makeMockBridge({ debts });
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.submit(getForm(container));
    expect(window.__azBridge.setDebt).toHaveBeenCalledWith(debts[0].id, expect.objectContaining({ name: "测试债务" }));
  });
});

describe("公式生成器(GenPanel)", () => {
  it("amort：生成计划写入还款计划表格，切回手动添加tab", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.change(screen.getByLabelText(/借款金额/), { target: { value: "12000" } });
    fireEvent.change(screen.getByLabelText(/年化/), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/期数/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/首期还款日/), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByText("生成计划"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("已生成 12 期"));
    expect(screen.getAllByText(/第\d+期/)).toHaveLength(12);
    // 切回手动添加tab了(公式生成的输入框应该消失)
    expect(screen.queryByLabelText(/借款金额/)).not.toBeInTheDocument();
  });

  it("首期还款日选29号：被拒绝清空+toast，不影响其它字段", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.change(screen.getByLabelText(/首期还款日/), { target: { value: "2026-01-29" } });
    expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("不支持29/30/31号"));
    expect(screen.getByLabelText(/首期还款日/)).toHaveValue("");
  });

  it("amort：借款金额/年化/期数缺一个就toast提示必填，不生成", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.change(screen.getByLabelText(/首期还款日/), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByText("生成计划"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith("借款金额/年化/期数必填");
    expect(screen.queryByText(/第1期/)).not.toBeInTheDocument();
  });

  // "计息方式"2026-07-30从原生<select>换成了button+底部抽屉(跟排序方式SortSheet.tsx同一套
  // shared/PickerSheet.tsx)——点开按钮再点选项文字，不再是fireEvent.change一个select。
  it("custom：按填的期数生成对应数量的空白行", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.click(screen.getByRole("button", { name: "计息方式" }));
    fireEvent.click(screen.getByText("自定义（生成空白行，自己填写）"));
    fireEvent.change(screen.getByLabelText(/生成几期空白行/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/首期还款日/), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByText("生成计划"));
    expect(screen.getAllByText(/第\d+期/)).toHaveLength(3);
  });

  it("等额本金：本金相同，利息递减，写入还款计划表格", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.click(screen.getByRole("button", { name: "计息方式" }));
    fireEvent.click(screen.getByText("等额本金（每期本金固定，总还款递减）"));
    fireEvent.change(screen.getByLabelText(/借款金额/), { target: { value: "12000" } });
    fireEvent.change(screen.getByLabelText(/年化/), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/期数/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/首期还款日/), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByText("生成计划"));
    expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("已生成 12 期"));
    expect(screen.getAllByText(/第\d+期/)).toHaveLength(12);
  });

  it("切换计息方式选项后，选中项在抽屉里带对勾(aria-current)", () => {
    window.__azBridge = makeMockBridge();
    render(<EditSheet />);
    act(() => { openEditSheet(NEW_DEBT_ID); });
    fireEvent.click(screen.getByText("公式生成"));
    fireEvent.click(screen.getByRole("button", { name: "计息方式" }));
    // 触发按钮自己也显示着当前选中项的文字，用screen.getByText会连触发按钮一起命中两个，
    // 只在抽屉的选项列表里找——跟SortSheet.test.tsx同一个查法。
    expect(document.querySelectorAll(".option-item.active").length).toBe(1);
    const activeOpt = document.querySelector(".option-item.active")!;
    expect(activeOpt).toHaveTextContent("等额本息（每期还款总额相同）");
    expect(activeOpt).toHaveAttribute("aria-current", "true");
  });
});

describe("批量设置(BatchBlock)", () => {
  it("批量设置还款日：确认后按选中月份铺日期", async () => {
    const debts: Debt[] = [makeDebt({
      opened: "2026-01-01",
      plan: [
        { date: "2026-01-01", amount: 500, principal: 480, interest: 20, paid: false },
        { date: "2026-02-01", amount: 500, principal: 480, interest: 20, paid: false },
      ],
    })];
    window.__azBridge = makeMockBridge({ debts });
    (window.__azBridge.confirmAsync as ReturnType<typeof vi.fn>).mockResolvedValueOnce("2026-03");
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.change(screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="date"]'))!, { target: { value: "date" } });
    fireEvent.change(screen.getByPlaceholderText("几号（1-28）"), { target: { value: "15" } });
    fireEvent.click(screen.getByText("应用到全部"));
    await waitFor(() => expect(window.__azBridge.toast).toHaveBeenCalledWith("已批量设置还款日"));
    expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("批量设置还款日", expect.stringContaining("15号"), { month: "2026-01" });
    const dateInputs = document.querySelectorAll('.plan-rows input[type="date"]');
    expect((dateInputs[0] as HTMLInputElement).value).toBe("2026-03-15");
    expect((dateInputs[1] as HTMLInputElement).value).toBe("2026-04-15");
  });

  it("批量设置还款日：取消不做事", async () => {
    const debts: Debt[] = [makeDebt({ opened: "2026-01-01" })];
    window.__azBridge = makeMockBridge({ debts });
    (window.__azBridge.confirmAsync as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.change(screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="date"]'))!, { target: { value: "date" } });
    fireEvent.change(screen.getByPlaceholderText("几号（1-28）"), { target: { value: "15" } });
    const before = (document.querySelector('.plan-rows input[type="date"]') as HTMLInputElement).value;
    fireEvent.click(screen.getByText("应用到全部"));
    await waitFor(() => expect(window.__azBridge.confirmAsync).toHaveBeenCalled());
    expect(window.__azBridge.toast).not.toHaveBeenCalledWith("已批量设置还款日");
    const after = (document.querySelector('.plan-rows input[type="date"]') as HTMLInputElement).value;
    expect(after).toBe(before);
  });

  it("批量设置金额：确认后清空本金利息、写入金额", async () => {
    const debts: Debt[] = [makeDebt({ opened: "2026-01-01" })];
    window.__azBridge = makeMockBridge({ debts });
    (window.__azBridge.confirmAsync as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const { container } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.change(screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="amount"]'))!, { target: { value: "amount" } });
    fireEvent.change(screen.getByPlaceholderText("数值"), { target: { value: "600" } });
    fireEvent.click(screen.getByText("应用到全部"));
    await waitFor(() => expect(window.__azBridge.confirmAsync).toHaveBeenCalledWith("批量设置金额", expect.stringContaining("清空为 0")));
    await waitFor(() => {
      const r2Inputs = container.querySelectorAll(".prow .r2 input");
      expect((r2Inputs[0] as HTMLInputElement).value).toBe("600"); // 金额
      expect((r2Inputs[1] as HTMLInputElement).value).toBe("0"); // 本金被清零
    });
  });

  it("批量设置29号：被拒绝，不弹确认框", async () => {
    const debts: Debt[] = [makeDebt({ opened: "2026-01-01" })];
    window.__azBridge = makeMockBridge({ debts });
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.change(screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="date"]'))!, { target: { value: "date" } });
    fireEvent.change(screen.getByPlaceholderText("几号（1-28）"), { target: { value: "29" } });
    fireEvent.click(screen.getByText("应用到全部"));
    await waitFor(() => expect(window.__azBridge.toast).toHaveBeenCalledWith(expect.stringContaining("29/30/31号不是每个月都有")));
    expect(window.__azBridge.confirmAsync).not.toHaveBeenCalled();
  });
});

describe("删除", () => {
  it("点删除：调用deleteDebt(id)", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    fireEvent.click(screen.getByText("删除"));
    expect(window.__azBridge.deleteDebt).toHaveBeenCalledWith(debts[0].id);
  });

  it("debts数组因删除收缩(该条不存在了)：sheet自动关闭", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    const { rerender } = render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    const { result } = renderHook(() => useEditSheetId());
    expect(result.current).toBe(debts[0].id);

    // 模拟vanilla deleteDebt()确认后splice+派发az:state-changed
    debts.splice(0, 1);
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });
    rerender(<EditSheet />);
    expect(result.current).toBe(null);
  });

  it("⚠️回归：删除的不是数组最后一条时，splice导致下标顺移，也要正确自动关闭(不能只按下标判断)", () => {
    // 这是真实踩过的坑：第一版用`!debts[editIndex]`判断，splice(0,1)后原来排第2的debt会顺移
    // 到下标0，`debts[0]`变成"存在，但是另一条债务"，条件误判成false，sheet不关闭、还显示着
    // 已经被删掉的那条债务的过期数据。当时用对象引用(editedDebtRef)打了补丁；现在债务有了
    // 真正的id字段，直接按id查找是否还在数组里是结构上正确的写法，不再需要那个workaround。
    const target = makeDebt({ name: "被删的这条" });
    const other = makeDebt({ name: "另一条" });
    const debts: Debt[] = [target, other];
    window.__azBridge = makeMockBridge({ debts });
    const { rerender } = render(<EditSheet />);
    act(() => { openEditSheet(target.id); }); // 编辑target
    const { result } = renderHook(() => useEditSheetId());
    expect(result.current).toBe(target.id);

    debts.splice(0, 1); // target被删，other顺移到下标0
    act(() => { window.dispatchEvent(new CustomEvent("az:state-changed")); });
    rerender(<EditSheet />);
    expect(result.current).toBe(null);
  });
});

describe("返回键 window.__azEditSheetBack", () => {
  it("打开时返回true并关闭，关闭时返回false", () => {
    const debts: Debt[] = [makeDebt()];
    window.__azBridge = makeMockBridge({ debts });
    render(<EditSheet />);
    act(() => { openEditSheet(debts[0].id); });
    expect(window.__azEditSheetBack!()).toBe(true);
    const { result } = renderHook(() => useEditSheetId());
    expect(result.current).toBe(null);
    expect(window.__azEditSheetBack!()).toBe(false);
  });

  it("组件卸载后清理window.__azEditSheetBack", () => {
    window.__azBridge = makeMockBridge();
    const { unmount } = render(<EditSheet />);
    expect(typeof window.__azEditSheetBack).toBe("function");
    unmount();
    expect(window.__azEditSheetBack).toBeUndefined();
  });
});
