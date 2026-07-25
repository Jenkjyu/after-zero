// 公式生成器——原样照抄vanilla的setGenUI()+doGen点击handler(www/index.html)。
//
// ⚠️唯一的刻意简化：vanilla当年用appendChild物理搬动#gFirstField这一份DOM节点，是因为4个
// [data-gg]区块靠display:none/block互斥切换，同一个节点没法同时"属于"两个区块。React这里
// 用条件渲染(4个分支各自的JSX里放一个绑定同一个fields.first的受控<input>)达到完全相同的
// 视觉效果(amort时跟"期数"拼成一行，其它三种单独成一行)，不需要、也不应该照搬DOM搬家的技巧——
// 这是"React 迁移"一节"第六步"明确记录过的设计决定，不是偷懒抄近路。
//
// 全部字段状态提升到父组件EditSheet.tsx(fields/onPatch)，不是这个组件自己的useState——
// 因为"保存"时(saveForm()的等效逻辑)需要读取*当前*选中计息方式的字段值写进debt.gen，
// 不管用户有没有点过"生成计划"，跟vanilla的saveForm()直接读$("g-*").value是同一个道理。
import type { GenSpec, PlanRow } from "../types";

export interface GenFields {
  kind: GenSpec["kind"];
  first: string;
  P: string;
  rate: string;
  n: string;
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
  pp: "", pf: "", n2: "",
  P3: "", rate3: "", ni: "", np: "",
  nc: "",
};

interface GenPanelProps {
  fields: GenFields;
  onPatch: (patch: Partial<GenFields>) => void;
  onGenerate: (plan: PlanRow[]) => void;
}

export function GenPanel({ fields, onPatch, onGenerate }: GenPanelProps) {
  // 首期还款日不支持29/30/31号(不是每个月都有，会导致还款日在不同月份间漂移)——跟批量设置
  // 还款日共用同一条isBadRepeatDay()限制，但表格里逐行手动填的日期不受此限制(见BatchBlock.tsx
  // 顶部注释和CLAUDE.md"新增/编辑债务表单"一节)。
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
  // 用toast提示。见CLAUDE.md"新增/编辑债务表单"一节那条⚠️。
  function handleGenerate() {
    const first = fields.first;
    if (!first) { window.__azBridge.toast("首期还款日必填"); return; }
    const spec: GenSpec = { kind: fields.kind, first };
    if (fields.kind === "amort") {
      spec.P = +fields.P; spec.rate = +fields.rate; spec.n = +fields.n;
      if (!spec.P || !fields.rate || !spec.n) { window.__azBridge.toast("借款金额/年化/期数必填"); return; }
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

  return (
    <div className="gen-panel" id="genPanel">
      <div className="field">
        <label htmlFor="g-kind">计息方式</label>
        <select id="g-kind" value={fields.kind} onChange={(e) => onPatch({ kind: e.target.value as GenFields["kind"] })}>
          <option value="amort">等额本息（银行贷/网贷/金条）</option>
          <option value="equalfee">信用卡等本等费（每期本金相同）</option>
          <option value="interestfirst">先息后本（前 N 期利息、后 M 期本金）</option>
          <option value="custom">自定义（生成空白行自己填）</option>
        </select>
      </div>
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
