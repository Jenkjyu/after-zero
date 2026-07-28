// 统计tab的石墨hero卡+KPI头。复用现有.hero/.summary/.kpi/.note-toggle/.footnote类名，
// 不发明新的配色系统。
//
// hero-amt/hero-pill故意不复刻"债务"tab hero已有的"距归零进度"进度条(debts/Summary.tsx的
// hero-prog)——那张hero已经在展示完全相同的一份数据，"统计"tab的hero改用"总额+口径+还清时间"
// 这个组合，跟"债务"tab的hero(总额+进度条)形成差异化定位。
//
// ⚠️这里读的是 summarizeAllTime() 不是 summarizeDebts()——后者排除已结清债务的已还本金/利息，
// 会导致"销掉最后一期→债务结清→累计已还金额和归零进度当场倒退"。两个函数返回形状完全相同，
// 是drop-in替换；为什么不直接改summarizeDebts见 www/js/calc.js 里的注释("债务"tab共用它，
// 且那张卡片的footnote明写着自己的局部口径)。
import { useState } from "react";
import type { Debt, Premium, ReportData } from "../types";
import { InfoTip } from "../shared/InfoTip";
import { ExportMenu } from "./ExportMenu";

export interface HeroProps {
  data: ReportData;
  debts: Debt[];
  premium: Premium;
}

export function Hero({ data, debts, premium }: HeroProps) {
  const s = window.summarizeAllTime(debts);
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <>
      {/* .hero有overflow:hidden(裁切装饰性色雾)，ExportMenu的下拉面板靠Popover的createPortal
          挂到document.body、不受这层裁切影响，所以放在hero-top里没问题；但.summary/note-toggle
          必须是.hero的兄弟节点、不能嵌套在.hero内部——跟debts/Summary.tsx的既有结构一致，
          Playwright验证时真实踩到过"嵌套进.hero导致InfoTip气泡点不到"这个坑，见CLAUDE.md。 */}
      <div className="hero">
        <div className="hero-top">
          {/* 原来这里是"统计"两个字，大金额上方没有任何标签，用户无从得知这个数字是什么口径。
              改成跟"债务"tab hero一致的"在还总负债"，口径角标放到下面的pill行(hero-top右侧
              被ExportMenu占着，塞不下"只算本金"那个pill)。 */}
          <div className="hero-label">在还总负债</div>
          <ExportMenu premium={premium} />
        </div>
        <div className="hero-amt num"><span className="cur">¥</span>{window.fmt(data.totalBalance)}</div>
        <div className="hero-pills">
          <span className="hero-pill">只算本金</span>
          <span className="hero-pill">{data.payoffDate ? `预计 ${data.payoffDate} 还清` : "暂无还款计划"}</span>
        </div>
      </div>

      {/* 4个KPI全部常驻——金额/利息/进度/利率比"笔数"更值得占位置(笔数降级成下面一行小字)。
          原来"已还金额/在还笔数/已结清/归零进度"这4个是折叠的、且跟"债务"tab完全重复，
          现在改成统计tab自己的优先级。 */}
      <div className="summary">
        <div className="kpi">
          <div className="v num">¥{window.fmt(s.paidPrincipal)}</div>
          <div className="k">累计已还本金</div>
          <div className="kpi-sub num">另付利息 ¥{window.fmt(s.paidInterest)}</div>
        </div>
        <div className="kpi">
          <div className="v num">¥{window.fmt(s.monthly)}</div>
          <div className="k">经常性月供</div>
          <div className="kpi-sub">不含一次性还清</div>
        </div>
        <div className="kpi">
          <div className="v num">{s.pct}%</div>
          <div className="k">归零进度</div>
          <div className="kpi-sub">按本金计</div>
        </div>
        <div className="kpi">
          <div className="v num">{data.avgRate ? data.avgRate.toFixed(2) : "0.00"}%</div>
          <div className="k">
            加权平均利率{" "}
            <InfoTip text="按各笔债务当前余额加权平均后的利率——余额越大的债务，对这个数字的影响越大，不是几笔利率的简单平均。" />
          </div>
        </div>
      </div>

      <div className="hero-counts">{s.active} 笔在还 · {s.settled} 笔已结清</div>

      <button
        type="button"
        className={"note-toggle" + (noteOpen ? " open" : "")}
        onClick={() => setNoteOpen((v) => !v)}
      >
        计算口径说明
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {noteOpen && (
        <div className="footnote" style={{ marginTop: -2, marginBottom: 16, textAlign: "left", padding: "0 2px" }}>
          在还总负债 = 各未结清债务「未还本金」之和（只算本金，不含未来的利息/手续费）。<br />
          累计已还本金 = 全部债务（<b>含已结清</b>）已标记为「已还」期次的本金之和；另付利息 = 这些期次对应的利息/手续费之和。<br />
          经常性月供 = 各未结清债务下一期应还金额之和（不含标记为「一次性还清」的借款）。<br />
          归零进度 = 累计已还本金 ÷（累计已还本金 + 在还总负债），只按本金计算。<br />
          预计还清日期 = 按现有还款计划里最晚的未还期次推算，<b>是预测不是承诺</b>，没有把提前还款算进去。<br />
          标记为「提前结清」的债务，剩余期次并没有被逐期销掉，所以那部分本金既不计入在还总负债、也不计入累计已还本金——实际付了多少钱App并不知道。
        </div>
      )}
    </>
  );
}
