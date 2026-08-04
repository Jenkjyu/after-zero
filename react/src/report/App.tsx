// "统计"页顶层组件——2026-07-31 从"看板"重做成"债务报告"。
//
// 改版前是：石墨 hero（总负债）+ 2×2 KPI + 4 张同构图表卡 + 6 行 key-value 总结。
// 问题是①第一屏跟"债务"tab 几乎一模一样（同一个 summarizeDebts() 的同一批数字、
// 同一套 .hero/.kpi 类名），统计页没有自己的立场；②整页只呈现数据、不给结论，
// 用户看完得不出任何该做什么的判断；③⋮ 三点菜单、纯文字排序切换器、色块图例这些
// 部件在全 App 只有这一页用，读起来像另一个产品的后台。
//
// 现在的结构是"先给判断，再给证据"：
//   报告头（总额/笔数/进度/还清日期写在句子里）
//   → 三件值得注意的事（规则算出来的结论，条数不固定）
//   → 最该先动手的地方（severity 最高的可行动结论展开）
//   → 还清进度（走势图 + 三个里程碑标在图上 + 拖动读数）
//   → 未来压力（面积/柱状可切换，点月看明细）
//   → 钱压在哪几笔（累计 70% 截断）
//   → 类型构成（可旋转甜甜圈）
//   → 结语 + 导出 + 计算口径说明
//
// 数据全部来自 calc.js 的既有纯函数，没有新增任何计算口径：
// computeReportData / computeUpcomingPressure / pressureWindowMonths / summarizeDebts /
// remainingInterest。结论规则（findings.tsx）只是在这些数字之上做阈值判断和排序。
import { useMemo } from "react";
import { useDebts, usePremium } from "../shared/state";
import { ReportHead } from "./ReportHead";
import { FindingList, ActionBox } from "./Conclusions";
import { StrategyCta } from "./StrategyCta";
import { Journey } from "./Journey";
import { Pressure } from "./Pressure";
import { Rank } from "./Rank";
import { TypePie } from "./TypePie";
import { Outro } from "./Outro";
import { buildFindings, toDebtRows } from "./findings";

export function App() {
  const debts = useDebts();
  const premium = usePremium();

  const data = useMemo(() => window.computeReportData(debts), [debts]);
  const pressure = useMemo(
    () => window.computeUpcomingPressure(debts, window.pressureWindowMonths(debts)),
    [debts]
  );
  // ⚠️summarizeDebts 传的是**全部** debts 不是 data.active——已还本金/已还利息是累计口径
  // （含已结清债务）。传 active 会让"刚还完一笔钱、已还金额纹丝不动"那个老 bug 复活。
  const s = useMemo(() => window.summarizeDebts(debts), [debts]);
  const rows = useMemo(() => toDebtRows(data.active), [data]);
  const findings = useMemo(() => buildFindings(rows, data, pressure), [rows, data, pressure]);

  const top3 = findings.slice(0, 3);
  const lead = findings.find((f) => f.actionable) || null;

  const monthsLeft = useMemo(() => {
    if (!data.payoffDate) return null;
    const p = window.parseDate(data.payoffDate);
    if (!p) return null;
    const t = window.today0();
    return Math.max(0, (p.getFullYear() - t.getFullYear()) * 12 + (p.getMonth() - t.getMonth()));
  }, [data.payoffDate]);

  // 没有在还债务时整页降级——这一版是叙事结构，没有数据时每一段都会退化成空壳，
  // 与其让 6 个"暂无数据"堆在一起，不如给一个明确的完成态。
  if (!data.active.length) {
    return (
      <div className="viz-root">
        <div className="rpt-head">
          <div className="rpt-kicker">债务体检 · {window.fmtDate(window.today0())}</div>
          <h1 className="rpt-title">目前<em>没有在还的债务</em></h1>
          <p className="rpt-lede">
            {s.settled > 0
              ? <>已经结清 <b>{s.settled}</b> 笔，累计还掉本金 <b>¥{window.fmt(s.paidPrincipal)}</b>、另付利息 <b>¥{window.fmt(s.paidInterest)}</b>。</>
              : <>还没有记录任何债务。到"首页"新增一笔之后，这里会生成一份完整的分析报告。</>}
          </p>
        </div>
        {/* 从没记过债务时整个结语块（"如果只做一件事"+导出+口径说明）都不成立——
            没有数据可导出，也没有"保持节奏"这回事，直接不渲染。已结清历史（s.settled>0）
            则保留结语块，只去掉不成立的那一句判断文案，导出/口径说明依然有意义。 */}
        {s.settled > 0 && <Outro lead={null} premium={premium} showLead={false} />}
      </div>
    );
  }

  return (
    <div className="viz-root">
      <ReportHead data={data} s={s} monthsLeft={monthsLeft} />
      <FindingList items={top3} />
      {lead && <ActionBox lead={lead} />}
      {/* 至少要有2笔在还债务才有"顺序"可比——1笔或0笔时这个入口没有意义，不展示 */}
      {data.active.length >= 2 && <StrategyCta premium={premium} />}
      <Journey data={data} s={s} monthsLeft={monthsLeft} />
      <Pressure data={pressure} />
      <Rank rows={rows} totalBalance={data.totalBalance} />
      <TypePie data={data} />
      <Outro lead={lead} premium={premium} />
    </div>
  );
}
