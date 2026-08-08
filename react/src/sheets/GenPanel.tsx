// 公式生成器——原样照抄vanilla的setGenUI()+doGen点击handler(www/index.html)。
//
// ⚠️唯一的刻意简化：vanilla当年用appendChild物理搬动#gFirstField这一份DOM节点，是因为
// [data-gg]区块靠display:none/block互斥切换，同一个节点没法同时"属于"两个区块。React这里
// 用条件渲染(每个分支各自的JSX里放一个绑定同一个fields.first的受控<input>)达到完全相同的
// 视觉效果(amort/equalprincipal时跟"期数"拼成一行，其它三种单独成一行)，不需要、也不应该
// 照搬DOM搬家的技巧——这是"React 迁移"一节"第六步"明确记录过的设计决定，不是偷懒抄近路。
//
// 全部字段状态提升到父组件EditSheet.tsx(fields/onPatch)，不是这个组件自己的useState——
// 因为"保存"时(saveForm()的等效逻辑)需要读取*当前*选中计息方式的字段值写进debt.gen，
// 不管用户有没有点过"生成计划"，跟vanilla的saveForm()直接读$("g-*").value是同一个道理。
//
// "计息方式"选择器2026-07-30从原生<select>换成了跟排序方式(SortSheet.tsx)同一套底部抽屉
// (shared/PickerSheet.tsx)——原生select在安卓WebView里弹的是系统全屏列表，跟这个App的
// 视觉完全脱节，是排序方式当年换掉select的同一个理由。这个选择器的开关状态(kindSheetOpen)
// 提升到EditSheet.tsx，是因为硬件返回键的优先级链(window.__azEditSheetBack)要在关闭
// 整个编辑表单之前先关这个更上层的选择器，见EditSheet.tsx里的注释。
import type { GenSpec, PlanRow } from "../types";
import { PickerSheet, type PickerOption } from "../shared/PickerSheet";

export interface GenFields {
  kind: GenSpec["kind"];
  first: string;
  P: string;
  rate: string;
  n: string;
  epP: string;
  epRate: string;
  epN: string;
  pp: string;
  pf: string;
  n2: string;
  P3: string;
  rate3: string;
  ni: string;
  np: string;
  nc: string;
}

export const DEFAULT_GEN_FIELDS: GenFields = {
  kind: "amort", first: "",
  P: "", rate: "", n: "",
  epP: "", epRate: "", epN: "",
  pp: "", pf: "", n2: "",
  P3: "", rate3: "", ni: "", np: "",
  nc: "",
};

// 每档一句括号说明，尽量用一个具体、能一眼看懂的判断标准，不用行话——跟其它.field label
// 一直以来的风格一致。"等本等费"核实过是标准叫法(信用卡分期行业术语，每期本金+手续费都
// 固定，区别于按剩余本金实时计息的"等额本金"；跟更泛化的"等本等息"是同一个模型，只是这里
// 的费用字段叫"手续费"不叫"利息"，跟pp/pf两个字段名对应)，去掉了原来多余的"信用卡"前缀——
// 这个计息方式本身不是信用卡专属的(网贷/分期消费同样常见这个模型)。
const KIND_OPTIONS: PickerOption<GenSpec["kind"]>[] = [
  { value: "amort", label: "等额本息（每期还款总额相同）" },
  { value: "equalprincipal", label: "等额本金（每期本金固定，总还款递减）" },
  { value: "equalfee", label: "等本等费（每期本金和手续费都固定）" },
  { value: "interestfirst", label: "先息后本（先还利息，后还本金）" },
  { value: "custom", label: "自定义（生成空白行，自己填写）" },
];

interface GenPanelProps {
  fields: GenFields;
  onPatch: (patch: Partial<GenFields>) => void;
  onGenerate: (plan: PlanRow[]) => void;
  kindSheetOpen: boolean;
  onKindSheetOpen: () => void;
  onKindSheetClose: () => void;
}

export function GenPanel({ fields, onPatch, onGenerate, kindSheetOpen, onKindSheetOpen, onKindSheetClose }: GenPanelProps) {
  // 首期还款日不支持29/30/31号(不是每个月都有，会导致还款日在不同月份间漂移)——跟批量设置
  // 还款日共用同一条isBadRepeatDay()限制，但表格里逐行手动填的日期不受此限制(见BatchBlock.tsx
  // 顶部注释和AGENTS.md"新增/编辑债务表单"一节)。
  function handleFirstChange(v: string) {
    const d = window.parseDate(v);
    if (d && window.isBadRepeatDay(d.getDate())) {
      onPatch({ first: "" });
      window.__azBridge.toast("首期还款日不支持29/30/31号（不是每个月都有），请选1-28号；这几天到期的话，生成后到下面还款计划里逐期手动改第1期日期");
      return;
    }
    onPatch({ first: v });
  }

  // 这几个字段故意不用HTML5原生required——它们跟顶层的#debtForm共用一个<form>，如果停留在
  // "公式生成"这个tab时点"保存"，原生表单校验会连带拦下主表单的提交，安卓WebView又不会像
  // 桌面浏览器那样弹校验提示气泡，拦下之后就是彻底的"点了保存没反应"。校验改成这里手动做、
  // 用toast提示。见AGENTS.md"新增/编辑债务表单"一节那条⚠️。
  function handleGenerate() {
    const first = fields.first;
    if (!first) { window.__azBridge.toast("首期还款日必填"); return; }
    const spec: GenSpec = { kind: fields.kind, first };
    if (fields.kind === "amort") {
      spec.P = +fields.P; spec.rate = +fields.rate; spec.n = +fields.n;
      if (!spec.P || !fields.rate || !spec.n) { window.__azBridge.toast("借款金额/年化/期数必填"); return; }
    } else if (fields.kind === "equalprincipal") {
      spec.P = +fields.epP; spec.rate = +fields.epRate; spec.n = +fields.epN;
      if (!spec.P || !fields.epRate || !spec.n) { window.__azBridge.toast("借款金额/年化/期数必填"); return; }
    } else if (fields.kind === "equalfee") {
      spec.pp = +fields.pp; spec.pf = +fields.pf; spec.n = +fields.n2;
    } else if (fields.kind === "interestfirst") {
      spec.P = +fields.P3; spec.rate = +fields.rate3; spec.ni = +fields.ni; spec.np = +fields.np;
    } else {
      spec.n = +fields.nc;
    }
    const plan = window.genPlan(spec);
    onGenerate(plan);
    window.__azBridge.toast("已生成 " + plan.length + " 期，可再逐行改");
  }

  const firstField = (
    <div className="field" id="gFirstField">
      <label htmlFor="g-first">首期还款日 <span className="req">*</span></label>
      <input id="g-first" type="date" value={fields.first} onChange={(e) => handleFirstChange(e.target.value)} />
    </div>
  );

  const currentKindLabel = (KIND_OPTIONS.find((o) => o.value === fields.kind) || KIND_OPTIONS[0]).label;

  return (
    <div className="gen-panel" id="genPanel">
      <div className="field">
        <label id="gKindLabel">计息方式</label>
        <button
          type="button"
          className="field-select-btn"
          aria-haspopup="dialog"
          aria-expanded={kindSheetOpen}
          aria-labelledby="gKindLabel"
          onClick={onKindSheetOpen}
        >
          <span>{currentKindLabel}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <PickerSheet
        open={kindSheetOpen}
        value={fields.kind}
        options={KIND_OPTIONS}
        title="计息方式"
        titleId="genKindSheetTitle"
        onPick={(kind) => onPatch({ kind })}
        onClose={onKindSheetClose}
        stackClassName="gen-kind-stack"
      />
      {fields.kind === "amort" ? (
        <div>
          <div className="field two">
            <div className="field"><label htmlFor="g-P">借款金额 ¥ <span className="req">*</span></label><input id="g-P" type="number" step="0.01" inputMode="decimal" value={fields.P} onChange={(e) => onPatch({ P: e.target.value })} /></div>
            <div className="field"><label htmlFor="g-rate">年化 % <span className="req">*</span></label><input id="g-rate" type="number" step="0.01" inputMode="decimal" value={fields.rate} onChange={(e) => onPatch({ rate: e.target.value })} /></div>
          </div>
          <div className="field two" id="amortPeriodRow">
            <div className="field"><label htmlFor="g-n">期数 <span className="req">*</span></label><input id="g-n" type="number" min={1} inputMode="numeric" value={fields.n} onChange={(e) => onPatch({ n: e.target.value })} /></div>
            {firstField}
          </div>
        </div>
      ) : null}
      {fields.kind === "equalprincipal" ? (
        <div>
          <div className="field two">
            <div className="field"><label htmlFor="g-epP">借款金额 ¥ <span className="req">*</span></label><input id="g-epP" type="number" step="0.01" inputMode="decimal" value={fields.epP} onChange={(e) => onPatch({ epP: e.target.value })} /></div>
            <div className="field"><label htmlFor="g-epRate">年化 % <span className="req">*</span></label><input id="g-epRate" type="number" step="0.01" inputMode="decimal" value={fields.epRate} onChange={(e) => onPatch({ epRate: e.target.value })} /></div>
          </div>
          <div className="field two" id="epPeriodRow">
            <div className="field"><label htmlFor="g-epN">期数 <span className="req">*</span></label><input id="g-epN" type="number" min={1} inputMode="numeric" value={fields.epN} onChange={(e) => onPatch({ epN: e.target.value })} /></div>
            {firstField}
          </div>
        </div>
      ) : null}
      {fields.kind === "equalfee" ? (
        <div>
          <div className="field two">
            <div className="field"><label htmlFor="g-pp">每期本金 ¥</label><input id="g-pp" type="number" step="0.01" inputMode="decimal" value={fields.pp} onChange={(e) => onPatch({ pp: e.target.value })} /></div>
            <div className="field"><label htmlFor="g-pf">每期手续费 ¥</label><input id="g-pf" type="number" step="0.01" inputMode="decimal" value={fields.pf} onChange={(e) => onPatch({ pf: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="g-n2">期数</label><input id="g-n2" type="number" min={1} inputMode="numeric" value={fields.n2} onChange={(e) => onPatch({ n2: e.target.value })} /></div>
          {firstField}
        </div>
      ) : null}
      {fields.kind === "interestfirst" ? (
        <div>
          <div className="field two">
            <div className="field"><label htmlFor="g-P3">借款本金 ¥</label><input id="g-P3" type="number" step="0.01" inputMode="decimal" value={fields.P3} onChange={(e) => onPatch({ P3: e.target.value })} /></div>
            <div className="field"><label htmlFor="g-rate3">年化 %</label><input id="g-rate3" type="number" step="0.01" inputMode="decimal" value={fields.rate3} onChange={(e) => onPatch({ rate3: e.target.value })} /></div>
          </div>
          <div className="field two">
            <div className="field"><label htmlFor="g-ni">利息期数</label><input id="g-ni" type="number" min={0} inputMode="numeric" value={fields.ni} onChange={(e) => onPatch({ ni: e.target.value })} /></div>
            <div className="field"><label htmlFor="g-np">还本期数</label><input id="g-np" type="number" min={1} inputMode="numeric" value={fields.np} onChange={(e) => onPatch({ np: e.target.value })} /></div>
          </div>
          {firstField}
        </div>
      ) : null}
      {fields.kind === "custom" ? (
        <div>
          <div className="field"><label htmlFor="g-nc">生成几期空白行</label><input id="g-nc" type="number" min={1} inputMode="numeric" value={fields.nc} onChange={(e) => onPatch({ nc: e.target.value })} /></div>
          {firstField}
        </div>
      ) : null}
      <button type="button" className="btn primary" id="doGen" onClick={handleGenerate}>生成计划</button>
    </div>
  );
}
