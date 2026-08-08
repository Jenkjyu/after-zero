// 批量设置(本金/利息/金额/还款日)——原样照抄vanilla batchCol change handler+applyBatchDate+
// batchApply点击handler(www/index.html)。
//
// 批量设置还款日的月份选择器确认、批量设置金额的清空警告确认，这两处原本都用vanilla全局
// 共享的确认弹窗ask()(#modalScrim)。迁移后触发它们的数据(plan)是纯React状态，vanilla没法
// 再插手改，但用户明确要求不要在React里另建一套确认弹窗UI(以后弹窗要优化时不想同步改两处)——
// 改成await window.__azBridge.confirmAsync(...)，继续复用同一个#modalScrim单例，只有一份
// 弹窗实现。opts.month有值时：确认返回选中的月份字符串、取消返回null；没有opts.month时：
// 确认返回true、取消返回false。见AGENTS.md"React 迁移"一节"第六步"。
import { useState } from "react";
import type { PlanRow } from "../types";

interface BatchBlockProps {
  plan: PlanRow[];
  onChange: (plan: PlanRow[]) => void;
}

type BatchCol = "principal" | "interest" | "amount" | "date";

// date列走单独的分支(需要月份选择器)，用不到这份文案映射——范围跟vanilla原来batchApply()
// 里那个内联对象字面量{amount:"金额",principal:"本金",interest:"利息"}一致。
const COL_LABEL: Record<Exclude<BatchCol, "date">, string> = { amount: "金额", principal: "本金", interest: "利息" };

export function BatchBlock({ plan, onChange }: BatchBlockProps) {
  const [col, setCol] = useState<BatchCol>("principal");
  const [val, setVal] = useState("");

  function handleColChange(next: BatchCol) {
    setCol(next);
    setVal("");
  }

  // 按"几号"+"首期年月"批量铺日期：每期在首期基础上顺延一个月，日期统一为指定的几号，
  // clamp到当月最后一天。
  function applyBatchDate(day: number, monthVal: string) {
    const parts = monthVal.split("-");
    const y = +parts[0], m = +parts[1] - 1;
    const next = plan.map((r, idx) => {
      const dt = new Date(y, m + idx, 1);
      const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      dt.setDate(Math.min(day, lastDay));
      return { ...r, date: window.fmtDate(dt) };
    });
    onChange(next);
    window.__azBridge.toast("已批量设置还款日");
  }

  async function handleApply() {
    if (!plan.length) { window.__azBridge.toast("还没有还款期，先加一期"); return; }
    if (col === "date") {
      const day = parseInt(val, 10);
      if (!day || day < 1 || day > 31) { window.__azBridge.toast("先填几号（1-28）"); return; }
      // 29/30/31号不是每个月都有——批量工具投射的是"每月同一天"的重复规律，选这三天会导致
      // 还款日在不同月份之间漂移，跟公式生成器的首期还款日共用同一条isBadRepeatDay()限制。
      if (window.isBadRepeatDay(day)) { window.__azBridge.toast("29/30/31号不是每个月都有，批量设置只支持1-28号；这几天到期的话，请到下面还款计划里逐期手动填具体日期"); return; }
      const defaultMonth = plan[0].date ? plan[0].date.slice(0, 7) : "";
      const monthVal = await window.__azBridge.confirmAsync("批量设置还款日", "首期是哪年哪月还？后续每期顺延一个月，日期统一为" + day + "号。", { month: defaultMonth });
      if (monthVal === null) return; // 取消，不做事，跟vanilla ask()取消时onOk不触发一致
      if (!monthVal) { window.__azBridge.toast("请选择首期年月"); return; }
      applyBatchDate(day, monthVal as string);
      return;
    }
    const numVal = parseFloat(val);
    if (isNaN(numVal)) { window.__azBridge.toast("先填一个数值"); return; }
    if (numVal < 0) { window.__azBridge.toast("数值不能是负数"); return; }
    function apply() {
      const next = plan.map((r) => {
        if (col === "amount") return { ...r, principal: 0, interest: 0, amount: window.r2(numVal) };
        const updated: PlanRow = { ...r, [col]: window.r2(numVal) };
        updated.amount = window.r2((updated.principal || 0) + (updated.interest || 0));
        return updated;
      });
      onChange(next);
      window.__azBridge.toast("每期" + COL_LABEL[col as Exclude<BatchCol, "date">] + "已设为 " + numVal);
    }
    if (col === "amount") {
      const confirmed = await window.__azBridge.confirmAsync("批量设置金额", "金额由本金+利息自动算出，直接批量设金额会把每期的本金和利息清空为 0，之后需要自己重新填。确定继续？");
      if (confirmed) apply();
    } else {
      apply();
    }
  }

  return (
    <div className="batch" id="batchBlock">
      批量把每期
      <select value={col} onChange={(e) => handleColChange(e.target.value as BatchCol)}>
        <option value="principal">本金</option>
        <option value="interest">利息/费</option>
        <option value="amount">金额</option>
        <option value="date">还款日</option>
      </select>
      设为
      {col === "date" ? (
        <input type="number" min={1} max={28} step={1} inputMode="numeric" placeholder="几号（1-28）" value={val} onChange={(e) => setVal(e.target.value)} />
      ) : (
        <input type="number" min={0} step={0.01} inputMode="decimal" placeholder="数值" value={val} onChange={(e) => setVal(e.target.value)} />
      )}
      <button type="button" id="batchApply" onClick={handleApply}>应用到全部</button>
    </div>
  );
}
