// 报告头——统计页的第一屏。
//
// ⚠️这里**没有石墨 hero 卡，也没有 KPI 网格**，是刻意的：改版前统计页顶部是
// "石墨 hero（在还总负债）+ 2×2 KPI + 笔数小字"，而"债务"tab 的顶部是几乎一模一样的
// 一套（同一个 summarizeDebts() 的同一批数字、同一套 .hero/.kpi 类名）。两个 tab
// 第一屏长得一样，统计页就没有自己的立场。
// 现在改成一段判断句 + 一段把数字嵌在句子里的导语：总额/笔数/已还本金/进度/月供/还清日期
// 一个不少，但读起来是"你的情况是这样"，不是"这里有 5 个指标"。
import type { DebtSummary, ReportData } from "../types";

export interface ReportHeadProps {
  data: ReportData;
  s: DebtSummary;
  monthsLeft: number | null;
}

export function ReportHead({ data, s, monthsLeft }: ReportHeadProps) {
  // 标题里那句判断只有两种：有还清日期就是"正在稳定下降"，没有（没有任何未还期次）
  // 就不该说"在下降"——这种时候通常是数据不全，别硬给一个正面结论。
  const falling = !!data.payoffDate && data.totalBalance > 0;

  return (
    <div className="rpt-head">
      <div className="rpt-kicker">债务体检 · {data.timeline[0]?.date ?? ""}</div>
      <h1 className="rpt-title">
        {falling ? <>你的负债正在<em>稳定下降</em></> : <>当前负债概况</>}
      </h1>
      <p className="rpt-lede">
        目前还欠 <b>¥{window.fmt(data.totalBalance)}</b>，分布在 <b>{s.active}</b> 笔债务里
        {s.settled > 0 && <>（另有 <b>{s.settled}</b> 笔已结清）</>}。
        已经还掉本金 <b>¥{window.fmt(s.paidPrincipal)}</b>，走完了全程的 <b>{s.pct}%</b>。
        {data.payoffDate ? (
          <>
            {" "}按现在的还款计划，每月要还 <b>¥{window.fmt(s.monthly)}</b>，
            {monthsLeft !== null && <><b>{monthsLeft}</b> 个月后</>}（{data.payoffDate}）这个数字会归零。
          </>
        ) : (
          <> 当前没有未还的还款计划，算不出还清日期。</>
        )}
      </p>
    </div>
  );
}
