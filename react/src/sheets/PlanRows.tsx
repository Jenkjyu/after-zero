// 手动逐行编辑器——原样照抄vanilla renderPlanRows()里每行date/paid/amount/principal/interest/
// 删除按钮的联动逻辑(www/index.html)。本金/利息输入变化时联动重算金额，照抄linkRow()。
import type { PlanRow } from "../types";

interface PlanRowsProps {
  plan: PlanRow[];
  oneTime: boolean;
  planMode: "manual" | "gen";
  onChange: (plan: PlanRow[]) => void;
}

export function PlanRows({ plan, oneTime, planMode, onChange }: PlanRowsProps) {
  // 一次性还清时只显示第1期(第2期起已经在EditSheet.tsx里被挪进oneTimeStash了，这里plan本身
  // 长度就是1，slice(0,1)是双重保险，跟vanilla的写法一致)。"+加一期"按钮的显隐：一次性还清时
  // 看是否已有那唯一1期；否则跟着手动/公式的切换器走(只在"手动添加"模式下显示)。
  const visible = oneTime ? plan.slice(0, 1) : plan;
  const showAddRow = oneTime ? plan.length < 1 : planMode === "manual";

  function updateRow(idx: number, patch: Partial<PlanRow>) {
    const next = plan.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function handlePrincipal(idx: number, v: string) {
    const principal = parseFloat(v) || 0;
    const interest = plan[idx].interest || 0;
    updateRow(idx, { principal, amount: window.r2(principal + interest) });
  }
  function handleInterest(idx: number, v: string) {
    const interest = parseFloat(v) || 0;
    const principal = plan[idx].principal || 0;
    updateRow(idx, { interest, amount: window.r2(principal + interest) });
  }
  function handleAmount(idx: number, v: string) {
    updateRow(idx, { amount: parseFloat(v) || 0 });
  }
  // 手动勾选"已还"不盖paidAt(已知的数据模型缺口③)——这是编辑历史数据，不是真实发生的
  // 还款事件，只有calc.js的recordPayment()/waivePeriod()/applySettle()这几个真正的还款
  // 动作才会盖章。取消勾选时顺手清掉paidAt/paidAmount，不然会留下"标着实付日期/部分还款
  // 金额，但又不算已还"的自相矛盾中间态(跟undoSettle()释放最后一期已还标记是同一个道理)。
  function handlePaidChange(idx: number, checked: boolean) {
    if (checked) updateRow(idx, { paid: true });
    else updateRow(idx, { paid: false, paidAt: undefined, paidAmount: undefined });
  }
  function handleDelete(idx: number) {
    const next = plan.slice();
    next.splice(idx, 1);
    onChange(next);
  }
  function handleAddRow() {
    const last = plan[plan.length - 1];
    const lastDate = last && last.date ? window.parseDate(last.date) : null;
    const nd = lastDate ? window.fmtDate(window.addMonths(lastDate, 1)) : "";
    onChange(plan.concat([{ date: nd, amount: 0, principal: 0, interest: 0, paid: false }]));
  }

  return (
    <>
      <div className="plan-rows" id="planRows">
        {visible.map((r, idx) => (
          <div key={idx} className={"prow" + (r.paid ? " paid" : "")}>
            <div className="r1">
              <span className="pn">第{idx + 1}期</span>
              <input type="date" value={r.date || ""} onChange={(e) => updateRow(idx, { date: e.target.value })} />
              <label className="chk">
                <input type="checkbox" checked={!!r.paid} onChange={(e) => handlePaidChange(idx, e.target.checked)} />已还
              </label>
              <button type="button" className="del" onClick={() => handleDelete(idx)}>✕</button>
            </div>
            <div className="r2">
              <div><span>金额</span><input type="number" step="0.01" min={0} inputMode="decimal" value={r.amount != null ? r.amount : ""} onChange={(e) => handleAmount(idx, e.target.value)} /></div>
              <div><span>本金</span><input type="number" step="0.01" min={0} inputMode="decimal" value={r.principal != null ? r.principal : ""} onChange={(e) => handlePrincipal(idx, e.target.value)} /></div>
              <div><span>利息/费</span><input type="number" step="0.01" min={0} inputMode="decimal" value={r.interest != null ? r.interest : ""} onChange={(e) => handleInterest(idx, e.target.value)} /></div>
            </div>
          </div>
        ))}
      </div>
      {showAddRow ? (
        <button type="button" className="btn ghost" id="addRow" style={{ marginBottom: 14 }} onClick={handleAddRow}>＋ 加一期</button>
      ) : null}
    </>
  );
}
