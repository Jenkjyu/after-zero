// 新增/编辑债务表单——CLAUDE.md里明确标注的"全项目最复杂的一块UI"(公式生成器、批量设置
// 还款日、oneTimeStash状态机)，detailSheet那轮迁移(第五步)时用户特意把它留到独立的一轮
// (第六步)做。挂载点跟detailSheet共用同一个常驻React入口(#react-sheets-root，见App.tsx)，
// 不新开Vite entry。
//
// 打开/关闭这个sheet不再经过window.__azBridge——openEditSheet(id)/closeEditSheet()是纯React
// 侧状态(shared/state.ts)，"+新增一笔"(DebtList.tsx)和detailSheet的"编辑"按钮都直接调用它们。
// 保存/删除这两个真正改debts数组的操作，依然通过__azBridge调用vanilla函数(setDebt/deleteDebt)。
//
// ⚠️跟DetailSheet.tsx不同，这里不需要"displayId冻结"那套技巧：DetailSheet的内容是每次渲染
// 直接从debts里按id查出来读的，openId变成null后就查不到了，所以需要冻结最后一次打开时的id
// 才能让关闭动画期间内容不瞬间清空。EditSheet的表单字段(name/editingPlan/gen等)
// 是本组件自己的useState，只在"下一次打开"(editId变化)时才会被effect重新赋值，关闭动画
// 期间(editId变成null但组件还在播放CSS滑出动画)这些state天然保持着关闭前最后的内容，
// 不需要额外的冻结逻辑。
import { useEffect, useRef, useState } from "react";
import type { Debt, GenSpec, PlanRow } from "../types";
import { closeEditSheet, NEW_DEBT_ID, useDebts, useEditSheetId } from "../shared/state";
import { makeGripDragState, onGripPointerDown, onGripPointerEnd, onGripPointerMove } from "./gripDrag";
import { DEFAULT_GEN_FIELDS, GenPanel, type GenFields } from "./GenPanel";
import { PlanRows } from "./PlanRows";
import { BatchBlock } from "./BatchBlock";

export function EditSheet() {
  const editId = useEditSheetId();
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
  // 公式生成器"计息方式"底部抽屉(GenPanel.tsx)的开关——提升到这里(不是GenPanel自己的
  // useState)是因为硬件返回键的优先级链(下面的window.__azEditSheetBack)要能读到它：
  // 这个抽屉盖在#editSheet之上，必须比"关闭整个编辑表单"更早被判断到，跟jiggleMode/
  // sortSheetOpen(react/src/debts/DebtList.tsx)是同一个道理。
  const [kindSheetOpen, setKindSheetOpen] = useState(false);
  const kindSheetOpenRef = useRef(kindSheetOpen);
  useEffect(() => { kindSheetOpenRef.current = kindSheetOpen; }, [kindSheetOpen]);
  // 标题("编辑债务"/"新增债务")和"删除"按钮的显隐都要在editId===NEW_DEBT_ID这个判断上做
  // 区分，但只在*打开那一刻*判断一次并冻结——跟上面说的"表单字段不需要冻结"是同一个道理的
  // 例外：这两处直接依赖这个布尔判断本身，而editId关闭时会变成null，用它现算会在关闭动画期间
  // 变成false(显示"删除"按钮消失/标题变"新增债务")产生视觉跳变，所以单独用一个"打开时冻结"
  // 的state存起来，只在openEdit效果里更新。
  const [isNew, setIsNew] = useState(false);

  // 对应vanilla openEdit(i)——每次editId变化(打开新增/打开编辑/切换到另一条)时，把表单
  // 全部字段从对应的debt或空白重新灌一遍。也复刻了openEdit()末尾syncOneTimeUI()在"这条债务
  // 本来就标了oneTime且plan有多期"这种边缘情况下的行为(第2期起挪进oneTimeStash)。
  useEffect(() => {
    if (editId === null) return;
    const d: Debt | undefined = editId !== NEW_DEBT_ID ? debts.find((x) => x.id === editId) : undefined;
    setIsNew(editId === NEW_DEBT_ID);
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
      epP: g.P != null ? String(g.P) : "",
      epRate: g.rate != null ? String(g.rate) : "",
      epN: g.n != null ? String(g.n) : "",
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
    setKindSheetOpen(false);
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // 删除债务后(debts.splice原地mutate，靠useDebts()的脏标记修复触发重渲染，见shared/state.ts
  // useDebts()自己的注释)，正在编辑的这条从数组里消失了——自动关闭，跟DetailSheet.tsx
  // "结清自动关闭"的effect同一个模式。deleteDebt()走的是vanilla ask()异步确认，React没法
  // 在点击那一刻就同步知道用户是否真的确认了，只能被动感知"这条debt不在了"。
  // ⚠️这里曾经是一个真实踩过的坑：第一版判断条件写的是`!debts[editIndex]`(按下标判断)，
  // 在"被删的不是数组最后一条"这种情况下是错的——splice(i,1)会让原来排在后面的debt对象
  // 顺移到i这个下标，debts[editIndex]会读到一个"存在、但是别的债务"的对象，条件判断成
  // false，sheet不会关闭，还会继续显示已经被删掉的那条债务的过期数据。当时用了
  // editedDebtRef(一个存对象引用的useRef)+debts.includes(ref)去打补丁；现在债务有了真正的
  // id字段(见CLAUDE.md"债务对象加了真正的id字段"一节)，直接按id查找是否还在数组里就是
  // 结构上正确、不需要额外workaround的写法，editedDebtRef已删除。
  useEffect(() => {
    if (editId !== null && editId !== NEW_DEBT_ID && !debts.some((x) => x.id === editId)) {
      closeEditSheet();
    }
  }, [debts, editId]);

  // 硬件/手势返回键"最上层先关"优先级链——跟react/src/sheets/DetailSheet.tsx注册
  // window.__azDetailSheetBack是同一个模式，链上排在notifySheet和detailSheet之间
  // (沿用原来#editSheet在DOM里的位置)。
  useEffect(() => {
    window.__azEditSheetBack = () => {
      // "最上层先关"：计息方式抽屉盖在#editSheet之上，比关闭整个表单更靠上，先判它。
      if (kindSheetOpenRef.current) { setKindSheetOpen(false); return true; }
      if (editId !== null) {
        closeEditSheet();
        return true;
      }
      return false;
    };
    return () => {
      delete window.__azEditSheetBack;
    };
  }, [editId]);

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
    if (editId === null || editId === NEW_DEBT_ID) return;
    window.__azBridge.deleteDebt(editId);
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
    for (let k = 0; k < editingPlan.length; k++) {
      const r = editingPlan[k];
      if (r.amount < 0 || r.principal < 0 || r.interest < 0) { window.__azBridge.toast("第 " + (k + 1) + " 期的金额/本金/利息不能是负数"); return; }
      if (r.principal === 0 && r.interest === 0) { window.__azBridge.toast("第 " + (k + 1) + " 期的本金和利息不能同时为0"); return; }
      // amount(这期要付多少钱)和principal+interest(这钱由什么构成)是两条独立填写的轴——
      // 逐行编辑本金/利息时PlanRows.tsx会自动联动重算amount，但直接改"金额"输入框不会反过来
      // 联动本金/利息，两者能各自改到互相对不上。见CLAUDE.md"⚠️已知的数据模型缺口"第⑤条。
      // 容差0.015（1.5分钱）不是随手挑的——genPlan()的amort分支在n=1(整贷整还)这种边界情况下，
      // principal/interest/amount三个值各自独立r2()四舍五入，真实存在1分钱的量化误差(实测
      // 遍历amort/equalfee/interestfirst共10万+组合验证过，最大偏差恰好0.01，从未超过)，
      // 容差必须盖过这条噪声下限，否则公式生成器自己生成的、完全没有人手改过的计划会被
      // 这条新校验误伤挡在保存门外。真正的手填错误(比如amount=100而principal+interest=2194)
      // 偏差量级是几十上百，远超这个容差，不会被误放过。
      const sum = window.r2((+r.principal || 0) + (+r.interest || 0));
      if (Math.abs((+r.amount || 0) - sum) > 0.015) {
        window.__azBridge.toast("第 " + (k + 1) + " 期的金额(¥" + window.money(r.amount) + ")与本金+利息(¥" + window.money(sum) + ")不一致，请检查");
        return;
      }
    }
    const g: GenSpec = { kind: gen.kind, first: gen.first };
    if (gen.kind === "amort") { g.P = +gen.P; g.rate = +gen.rate; g.n = +gen.n; }
    else if (gen.kind === "equalprincipal") { g.P = +gen.epP; g.rate = +gen.epRate; g.n = +gen.epN; }
    else if (gen.kind === "equalfee") { g.pp = +gen.pp; g.pf = +gen.pf; g.n = +gen.n2; }
    else if (gen.kind === "interestfirst") { g.P = +gen.P3; g.rate = +gen.rate3; g.ni = +gen.ni; g.np = +gen.np; }
    else { g.n = +gen.nc; }
    // original/balance等派生字段先给占位值——setDebt()内部会调recompute(obj)重新算，
    // 跟vanilla saveForm()构建的obj一样，这几个字段本来就不该由这里算。obj不带id——id永远
    // 由vanilla的setDebt()赋值/保留(见types.ts的Omit<Debt,"id">)。
    const obj: Omit<Debt, "id"> = {
      name: trimmedName, funder: funder.trim(), type, opened, notes: notes.trim(),
      oneTime: oneTime || editingPlan.length === 1, plan: window.clone(editingPlan), gen: g,
      original: null, balance: 0, paidPrincipal: 0, paidInterest: 0,
      totalTerms: 0, paidTerms: 0, terms: 0, monthly: 0, nextDate: null, rate: 0,
    };
    window.__azBridge.setDebt(editId === NEW_DEBT_ID ? null : editId, obj);
    window.__azBridge.saveAll();
    window.__azBridge.renderAll();
    closeEditSheet();
    window.__azBridge.toast("已保存 ✓");
  }

  const isOpen = editId !== null;
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
        {/* 滚动放在这层、不放在.sheet上——.sheet同时有圆角+overflow:auto+transform时
            会被判定成不透明合成滚动层，深色模式下圆角处会露白底(见www/index.html里
            .sheet那段注释)。grip留在这层外面，拖动条永远在顶部不被内容滚走。 */}
        <div className="sheet-scroll">
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
              <GenPanel
                fields={gen}
                onPatch={patchGen}
                onGenerate={(plan) => { setEditingPlan(plan); setPlanMode("manual"); }}
                kindSheetOpen={kindSheetOpen}
                onKindSheetOpen={() => setKindSheetOpen(true)}
                onKindSheetClose={() => setKindSheetOpen(false)}
              />
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
      </div>
    </>
  );
}
