// 新增/编辑债务表单——CLAUDE.md里明确标注的"全项目最复杂的一块UI"(公式生成器、批量设置
// 还款日、oneTimeStash状态机)，detailSheet那轮迁移(第五步)时用户特意把它留到独立的一轮
// (第六步)做。挂载点跟detailSheet共用同一个常驻React入口(#react-sheets-root，见App.tsx)，
// 不新开Vite entry。
//
// 打开/关闭这个sheet不再经过window.__azBridge——openEditSheet(i)/closeEditSheet()是纯React
// 侧状态(shared/state.ts)，"+新增一笔"(DebtList.tsx)和detailSheet的"编辑"按钮都直接调用它们。
// 保存/删除这两个真正改debts数组的操作，依然通过__azBridge调用vanilla函数(setDebt/deleteDebt)。
//
// ⚠️跟DetailSheet.tsx不同，这里不需要"displayIndex冻结"那套技巧：DetailSheet的内容是每次渲染
// 直接从debts[openIndex]读出来的，openIndex变成null后就会读到undefined，所以需要冻结最后一次
// 打开时的index才能让关闭动画期间内容不瞬间清空。EditSheet的表单字段(name/editingPlan/gen等)
// 是本组件自己的useState，只在"下一次打开"(editIndex变化)时才会被effect重新赋值，关闭动画
// 期间(editIndex变成null但组件还在播放CSS滑出动画)这些state天然保持着关闭前最后的内容，
// 不需要额外的冻结逻辑。
import { useEffect, useRef, useState } from "react";
import type { Debt, GenSpec, PlanRow } from "../types";
import { closeEditSheet, useDebts, useEditSheetIndex } from "../shared/state";
import { makeGripDragState, onGripPointerDown, onGripPointerEnd, onGripPointerMove } from "./gripDrag";
import { DEFAULT_GEN_FIELDS, GenPanel, type GenFields } from "./GenPanel";
import { PlanRows } from "./PlanRows";
import { BatchBlock } from "./BatchBlock";

export function EditSheet() {
  const editIndex = useEditSheetIndex();
  const debts = useDebts();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const gripRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef(makeGripDragState());

  const [name, setName] = useState("");
  const [funder, setFunder] = useState("");
  const [type, setType] = useState("银行贷");
  const [opened, setOpened] = useState("");
  const [notes, setNotes] = useState("");
  const [oneTime, setOneTime] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRow[]>([]);
  const [oneTimeStash, setOneTimeStash] = useState<PlanRow[]>([]);
  const [planMode, setPlanMode] = useState<"manual" | "gen">("manual");
  const [gen, setGen] = useState<GenFields>(DEFAULT_GEN_FIELDS);
  // 标题("编辑债务"/"新增债务")和"删除"按钮的显隐都要在i>=0/i<0之间做区分，但只在*打开那一刻*
  // 判断一次并冻结——跟上面说的"表单字段不需要冻结"是同一个道理的例外：这两处直接依赖
  // editIndex>=0这个布尔判断本身，而editIndex关闭时会变成null，用它现算会在关闭动画期间
  // 变成false(显示"删除"按钮消失/标题变"新增债务")产生视觉跳变，所以单独用一个"打开时冻结"
  // 的state存起来，只在openEdit效果里更新。
  const [isNew, setIsNew] = useState(false);
  // 正在编辑的这个debt对象引用——只在打开(populate effect)时赋值，用来判断"这条debt是不是
  // 已经被删掉了"。⚠️不能用editIndex这个下标去比对(见下面自动关闭effect的注释)。
  const editedDebtRef = useRef<Debt | undefined>(undefined);

  // 对应vanilla openEdit(i)——每次editIndex变化(打开新增/打开编辑/切换到另一条)时，把表单
  // 全部字段从debts[i]或空白重新灌一遍。也复刻了openEdit()末尾syncOneTimeUI()在"这条债务
  // 本来就标了oneTime且plan有多期"这种边缘情况下的行为(第2期起挪进oneTimeStash)。
  useEffect(() => {
    if (editIndex === null) return;
    const d: Debt | undefined = editIndex >= 0 ? debts[editIndex] : undefined;
    editedDebtRef.current = d;
    setIsNew(editIndex < 0);
    setName(d?.name || "");
    setFunder(d?.funder || "");
    setType(d?.type || "银行贷");
    setOpened(d?.opened || "");
    setNotes(d?.notes || "");
    const isOne = !!d?.oneTime;
    let plan = window.clone(d?.plan || []);
    let stash: PlanRow[] = [];
    if (isOne && plan.length > 1) { stash = plan.slice(1); plan = plan.slice(0, 1); }
    setOneTime(isOne);
    setEditingPlan(plan);
    setOneTimeStash(stash);
    const g: Partial<GenSpec> = d?.gen || {};
    setGen({
      kind: g.kind || "amort",
      first: g.first || d?.opened || "",
      P: g.P != null ? String(g.P) : "",
      rate: g.rate != null ? String(g.rate) : "",
      n: g.n != null ? String(g.n) : "",
      pp: g.pp != null ? String(g.pp) : "",
      pf: g.pf != null ? String(g.pf) : "",
      n2: g.n != null ? String(g.n) : "",
      P3: g.P != null ? String(g.P) : "",
      rate3: g.rate != null ? String(g.rate) : "",
      ni: g.ni != null ? String(g.ni) : "",
      np: g.np != null ? String(g.np) : "",
      nc: "",
    });
    setPlanMode("manual");
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIndex]);

  // 删除债务后(debts.splice原地mutate，靠useDebts()的脏标记修复触发重渲染，见shared/state.ts
  // useDebts()自己的注释)，正在编辑的这条从数组里消失了——自动关闭，跟DetailSheet.tsx
  // "结清自动关闭"的effect同一个模式。deleteDebt()走的是vanilla ask()异步确认，React没法
  // 在点击那一刻就同步知道用户是否真的确认了，只能被动感知"这条debt不在了"。
  // ⚠️真机(其实是Playwright headless)踩过的坑：一开始判断条件写的是`!debts[editIndex]`
  // (按下标判断)，在"被删的不是数组最后一条"这种情况下是错的——splice(i,1)会让原来排在
  // 后面的debt对象顺移到i这个下标，debts[editIndex]会读到一个"存在、但是别的债务"的对象，
  // 条件判断成false，sheet不会关闭，还会继续显示已经被删掉的那条债务的过期数据。改成用
  // editedDebtRef(populate effect里存的对象引用)去比对"这个对象还在不在数组里"，不依赖下标，
  // 对splice导致的下标顺移天然免疫——跟这个项目WeakMap给debt生成稳定key(shared/state.ts的
  // keyFor)是同一个"按引用而不是按下标识别一条debt"的思路。
  useEffect(() => {
    if (editIndex !== null && editIndex >= 0 && editedDebtRef.current && !debts.includes(editedDebtRef.current)) {
      closeEditSheet();
    }
  }, [debts, editIndex]);

  // 硬件/手势返回键"最上层先关"优先级链——跟react/src/sheets/DetailSheet.tsx注册
  // window.__azDetailSheetBack是同一个模式，链上排在notifySheet和detailSheet之间
  // (沿用原来#editSheet在DOM里的位置)。
  useEffect(() => {
    window.__azEditSheetBack = () => {
      if (editIndex !== null) {
        closeEditSheet();
        return true;
      }
      return false;
    };
    return () => {
      delete window.__azEditSheetBack;
    };
  }, [editIndex]);

  useEffect(() => {
    const grip = gripRef.current;
    const sheet = sheetRef.current;
    if (!grip || !sheet) return;
    const state = dragStateRef.current;
    function handleDown(e: PointerEvent) { onGripPointerDown(e, sheet!, grip!, state); }
    // editSheet不支持上拖调高(resizable=false)，只支持下拖关闭——跟vanilla原来
    // initGripDrag($("editSheet"), grip, closeEdit, false)一致。
    function handleMove(e: PointerEvent) { onGripPointerMove(e, sheet!, state, false); }
    function handleEnd(e: PointerEvent) { onGripPointerEnd(e, sheet!, state, closeEditSheet); }
    grip.addEventListener("pointerdown", handleDown);
    grip.addEventListener("pointermove", handleMove);
    grip.addEventListener("pointerup", handleEnd);
    grip.addEventListener("pointercancel", handleEnd);
    return () => {
      grip.removeEventListener("pointerdown", handleDown);
      grip.removeEventListener("pointermove", handleMove);
      grip.removeEventListener("pointerup", handleEnd);
      grip.removeEventListener("pointercancel", handleEnd);
    };
  }, []);

  function patchGen(patch: Partial<GenFields>) {
    setGen((g) => ({ ...g, ...patch }));
  }

  // 勾选"一次性还清"时，第2期起真正挪出editingPlan(暂存到oneTimeStash，不是丢弃)，取消勾选时
  // 原样放回来——这样来回勾选不会丢手动加过的期数。原样照抄vanilla的syncOneTimeUI()。
  function handleOneTimeChange(checked: boolean) {
    let plan = editingPlan;
    let stash = oneTimeStash;
    if (checked) {
      if (editingPlan.length > 1) { stash = editingPlan.slice(1); plan = editingPlan.slice(0, 1); }
    } else if (oneTimeStash.length) {
      plan = editingPlan.concat(oneTimeStash);
      stash = [];
    }
    setOneTime(checked);
    setEditingPlan(plan);
    setOneTimeStash(stash);
    if (checked) setPlanMode("manual");
  }

  function handleDelete() {
    if (editIndex === null || editIndex < 0) return;
    window.__azBridge.deleteDebt(editIndex);
  }

  // 原样照抄vanilla saveForm()的全部校验逻辑+obj构建。
  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (!opened) { window.__azBridge.toast("借款日必填"); return; }
    if (!editingPlan.length) { window.__azBridge.toast("至少要有一期还款计划才能保存"); return; }
    // 还款日(几号)不再单独校验用户是否手填了1-31——它现在完全由第1期的实际日期推出来，
    // 只要第1期日期填了(下面这个循环会连带校验)，这里就一定有值。
    const firstDateObj = window.parseDate(editingPlan[0].date);
    if (!firstDateObj) { window.__azBridge.toast("第 1 期的还款日期必须填写"); return; }
    const fday = firstDateObj.getDate();
    for (let k = 0; k < editingPlan.length; k++) {
      const r = editingPlan[k];
      if (r.amount < 0 || r.principal < 0 || r.interest < 0) { window.__azBridge.toast("第 " + (k + 1) + " 期的金额/本金/利息不能是负数"); return; }
      if (r.principal === 0 && r.interest === 0) { window.__azBridge.toast("第 " + (k + 1) + " 期的本金和利息不能同时为0"); return; }
    }
    const g: GenSpec = { kind: gen.kind, first: gen.first };
    if (gen.kind === "amort") { g.P = +gen.P; g.rate = +gen.rate; g.n = +gen.n; }
    else if (gen.kind === "equalfee") { g.pp = +gen.pp; g.pf = +gen.pf; g.n = +gen.n2; }
    else if (gen.kind === "interestfirst") { g.P = +gen.P3; g.rate = +gen.rate3; g.ni = +gen.ni; g.np = +gen.np; }
    else { g.n = +gen.nc; }
    // original/balance等派生字段先给占位值——setDebt()内部会调recompute(obj)重新算，
    // 跟vanilla saveForm()构建的obj一样，这几个字段本来就不该由这里算。
    const obj: Debt = {
      name: trimmedName, funder: funder.trim(), type, opened, day: fday, notes: notes.trim(),
      oneTime: oneTime || editingPlan.length === 1, plan: window.clone(editingPlan), gen: g,
      original: null, balance: 0, paidPrincipal: 0, paidInterest: 0,
      totalTerms: 0, paidTerms: 0, terms: 0, monthly: 0, nextDate: null, rate: 0,
    };
    window.__azBridge.setDebt(editIndex ?? -1, obj);
    window.__azBridge.saveAll();
    window.__azBridge.renderAll();
    closeEditSheet();
    window.__azBridge.toast("已保存 ✓");
  }

  const isOpen = editIndex !== null;
  const firstDate = editingPlan[0] && editingPlan[0].date ? window.parseDate(editingPlan[0].date) : null;
  const fDay = firstDate ? firstDate.getDate() : "";
  const borrow = editingPlan.reduce((s, r) => s + (+r.principal || 0), 0);
  const remaining = editingPlan.reduce((s, r) => s + (r.paid ? 0 : (+r.principal || 0)), 0);
  const paidc = editingPlan.filter((r) => r.paid).length;
  const apr = window.impliedAPR(editingPlan);

  return (
    <>
      <div className={"scrim" + (isOpen ? " open" : "")} onClick={closeEditSheet} />
      <div ref={sheetRef} className={"sheet" + (isOpen ? " open" : "")} role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <div ref={gripRef} className="grip" />
        <h2 id="sheetTitle">{isNew ? "新增债务" : "编辑债务"}</h2>
        <form id="debtForm" onSubmit={handleSave}>
          <div className="field"><label htmlFor="f-name">贷款产品 <span className="req">*</span></label><input id="f-name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field two">
            <div className="field"><label htmlFor="f-funder">出资方</label><input id="f-funder" value={funder} onChange={(e) => setFunder(e.target.value)} /></div>
            <div className="field">
              <label htmlFor="f-type">借款类型</label>
              <select id="f-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option>银行贷</option><option>信用卡分期</option><option>网贷</option><option>私人借款</option>
              </select>
            </div>
          </div>
          <div className="field two">
            <div className="field"><label htmlFor="f-opened">借款日 <span className="req">*</span></label><input id="f-opened" type="date" required value={opened} onChange={(e) => setOpened(e.target.value)} /></div>
            <div className="field"><label htmlFor="f-day">还款日（几号）</label><input id="f-day" type="number" min={1} max={31} inputMode="numeric" readOnly className="f-day-auto" value={fDay} /></div>
          </div>
          <label className="checkline"><input type="checkbox" id="f-oneTime" checked={oneTime} onChange={(e) => handleOneTimeChange(e.target.checked)} />一次性还清（不计入经常性月供，销项即结清）</label>
          <div className="field"><label htmlFor="f-notes">备注</label><textarea id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          <hr className="sheet-divider" />
          <div className="subhead">还款计划（这是源头，其它自动推算）</div>
          <div className="plan-sum" id="planSum">
            <span className="c">借款金额 <b>¥{window.fmt(borrow)}</b></span>
            <span className="c">剩余待还 <b>¥{window.fmt(remaining)}</b></span>
            <span className="c">年化 <b>{apr ? apr.toFixed(2) + "%" : "0%"}</b></span>
            <span className="c">共 <b>{editingPlan.length}</b> 期 · 已还 <b>{paidc}</b></span>
          </div>
          {!oneTime ? (
            <div className="plan-mode-toggle" id="planModeToggle">
              <button type="button" className={"pm-btn" + (planMode === "manual" ? " active" : "")} onClick={() => setPlanMode("manual")}>手动添加</button>
              <button type="button" className={"pm-btn" + (planMode === "gen" ? " active" : "")} onClick={() => setPlanMode("gen")}>公式生成</button>
            </div>
          ) : null}
          {!oneTime && planMode === "gen" ? (
            <GenPanel fields={gen} onPatch={patchGen} onGenerate={(plan) => { setEditingPlan(plan); setPlanMode("manual"); }} />
          ) : null}
          {!oneTime ? <BatchBlock plan={editingPlan} onChange={setEditingPlan} /> : null}
          <PlanRows plan={editingPlan} oneTime={oneTime} planMode={planMode} onChange={setEditingPlan} />

          <div className="sheet-actions">
            {!isNew ? <button type="button" className="btn danger" id="deleteBtn" onClick={handleDelete}>删除</button> : null}
            <button type="button" className="btn ghost" id="cancelBtn" onClick={closeEditSheet}>取消</button>
            <button type="submit" className="btn primary">保存</button>
          </div>
        </form>
      </div>
    </>
  );
}
