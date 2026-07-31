// 统计页的结论规则引擎——"三件值得注意的事" + "最该先动手的地方"背后的东西。
//
// ⚠️这一版之前，统计页是"KPI 卡 + 4 张图 + 6 行 key-value 总结"的看板结构，结论
// 是没有的；改版原型里第一版写的是三句写死的话+插值数字，其中一句在真实数据下是
// **假的**："4 笔网贷吃掉了大部分利息"——实测那 4 笔网贷占余额 12.0%、占剩余待付
// 利息 12.9%，几乎等比例，谈不上"大部分"；真正吃利息的是一笔年化才 5.79% 的银行贷
// （金额大、期限长），一笔占 41%。**高利率 ≠ 高剩余利息，这两件事必须分开算。**
// 所以结论不能写死，只能由规则算，且每条都带触发条件——不成立就整条不出现，
// 而不是显示一条"0 笔"的空壳或者一句凑数的废话。
//
// 每条候选结论提供：
//   · 触发条件——不成立就不进候选池
//   · severity 0–100——决定排序，公式写在各自旁边，不是拍脑袋的固定优先级
//   · actionable——只有可行动的结论才有资格当"最该先动手的地方"
//     （"利息负担分档"是纯陈述，没有对应动作，所以是 false）
//   · detail——被选为"最该先动手"时展开什么内容，由结论自己提供
//
// "三件值得注意的事" = 按 severity 取前 3（不限 actionable）
// "最该先动手的地方" = actionable 里 severity 最高的那条展开
import type { ReactNode } from "react";
import type { Debt, ReportData, UpcomingPressure } from "../types";

/** 年化多少算"高息"——跟 calc.js 的 rateClass() 里 rate-hi 的分档线是同一条 */
export const HI_RATE = 18;

/** 从 Debt 派生出这一页要用的几个数（余额/年化/剩余待付利息都要现算，不能只读 balance） */
export interface DebtRow {
  id: string;
  name: string;
  type: string;
  balance: number;
  rate: number;
  remainingInterest: number;
  terms: number;
}

export function toDebtRows(active: Debt[]): DebtRow[] {
  return active
    .map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type || "未分类",
      balance: +d.balance || 0,
      rate: +d.rate || 0,
      remainingInterest: window.remainingInterest(d),
      terms: +d.terms || 0,
    }))
    .sort((a, b) => b.balance - a.balance);
}

export interface FindingBar {
  nm: string;
  /** 条形长度占比 0–1 */
  pct: number;
  /** 右侧那一列的文字（金额或百分比，由结论自己决定） */
  rt: string;
}

export interface FindingDetail {
  top: string;
  body: ReactNode;
  bars: FindingBar[];
  /** 被截断掉的那几条的合计说明；有截断才给值 */
  rest?: string;
}

export type FindingTone = "risk" | "warn" | "info" | "good";

export interface Finding {
  id: "concentration" | "highrate" | "peak" | "burden";
  severity: number;
  actionable: boolean;
  tone: FindingTone;
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** actionable 的结论必须提供这两个——被选为"最该先动手"时用 */
  actionTitle?: string;
  detail?: () => FindingDetail;
}

const ICON_ALERT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5v.01" />
  </svg>
);
const ICON_PEAK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18l6-8 4 5 3-4 5 7z" />
  </svg>
);
const ICON_CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const ICON_COIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9" />
    <path d="M14.6 9.6c-.6-.7-1.6-1.1-2.6-1.1-1.5 0-2.6.8-2.6 1.9 0 2.6 5.2 1.3 5.2 3.9 0 1.1-1.1 1.9-2.6 1.9-1.1 0-2.1-.4-2.7-1.2" />
  </svg>
);

/** 金额一律取整到元再格式化——明细列表里混着 "¥1,089" 和 "¥666.16" 很难扫，分位在这里没有信息量 */
function yuan(n: number): string {
  return "¥" + window.fmt(Math.round(+n || 0));
}
function monthLabel(m: string): string {
  return m.slice(2, 4) + "年" + +m.slice(5, 7) + "月";
}

export function buildFindings(
  rows: DebtRow[],
  data: ReportData,
  pressure: UpcomingPressure
): Finding[] {
  const total = data.totalBalance;
  const totalInt = rows.reduce((s, d) => s + d.remainingInterest, 0);
  const out: Finding[] = [];

  /* ① 利息集中度：钱到底花在哪一笔上。
     触发：单笔占剩余待付利息 ≥30%。severity = 该占比 × 100。
     这条是整套规则里最重要的一条——它回答的问题（"我的利息主要花在哪"）跟"哪笔利率最高"
     经常不是同一个答案：金额大、期限长的低息债务完全可能比几笔高息小贷贵得多。 */
  const byInt = rows.slice().sort((a, b) => b.remainingInterest - a.remainingInterest);
  const ti = byInt[0];
  const tiShare = totalInt > 0 && ti ? ti.remainingInterest / totalInt : 0;
  if (ti && tiShare >= 0.3) {
    out.push({
      id: "concentration",
      severity: Math.round(tiShare * 100),
      actionable: true,
      tone: "warn",
      icon: ICON_COIN,
      title: <>{ti.name} 一笔占了剩余待付利息的 {Math.round(tiShare * 100)}%</>,
      body: (
        <>
          它只占总余额的 <b>{Math.round((ti.balance / Math.max(1, total)) * 100)}%</b>（{yuan(ti.balance)}），
          但还有 <b>{ti.terms}</b> 期，剩下要为它付 <b>{yuan(ti.remainingInterest)}</b> 利息。
        </>
      ),
      actionTitle: `利息主要花在 ${ti.name} 上`,
      detail: () => {
        const bars = byInt.slice(0, 4).filter((x) => x.remainingInterest > 0);
        const mx = bars.length ? bars[0].remainingInterest : 1;
        return {
          top: `剩余待付利息合计 ${yuan(totalInt)}`,
          body: (
            <>
              它的年化是 <b>{ti.rate.toFixed(2)}%</b>，在这 {rows.length} 笔里并不算高——贵在
              <b>金额大、期限长</b>。提前还它省下的是时间堆出来的利息，跟先还高息那几笔是两种不同的省法。
            </>
          ),
          bars: bars.map((x) => ({
            nm: x.name,
            pct: x.remainingInterest / mx,
            rt: yuan(x.remainingInterest),
          })),
        };
      },
    });
  }

  /* ② 高息债务：只陈述事实（几笔、占余额多少、利率区间、占剩余利息多少），
     不断言"吃掉大部分利息"——那个断言归 ① 去验证。
     触发：存在年化 ≥18% 的债务。
     severity = 余额占比×100 + (最高年化 − 18)×2——两个维度都要计：笔数再多但金额很小、
     或者利率刚过线，都不该排到最前面。 */
  const hi = rows.filter((d) => d.rate >= HI_RATE).sort((a, b) => b.rate - a.rate);
  if (hi.length) {
    const hiBal = hi.reduce((s, d) => s + d.balance, 0);
    const hiInt = hi.reduce((s, d) => s + d.remainingInterest, 0);
    const hiShare = total > 0 ? hiBal / total : 0;
    // 类型名也是**算出来**的，不是写死"网贷"——只有这批债务恰好同类型时才提类型名
    const types = Array.from(new Set(hi.map((d) => d.type)));
    const typeWord = types.length === 1 ? types[0] : "债务";
    out.push({
      id: "highrate",
      severity: Math.round(hiShare * 100 + (hi[0].rate - HI_RATE) * 2),
      actionable: true,
      tone: "risk",
      icon: ICON_ALERT,
      title: <>{hi.length} 笔{typeWord}年化超过 {HI_RATE}%</>,
      body: (
        <>
          利率 <b>{hi[hi.length - 1].rate.toFixed(2)}%</b> 到 <b>{hi[0].rate.toFixed(2)}%</b>，
          占总余额 <b>{Math.round(hiShare * 100)}%</b>（{yuan(hiBal)}）、
          占剩余待付利息 <b>{Math.round((hiInt / Math.max(1, totalInt)) * 100)}%</b>。
        </>
      ),
      actionTitle: `先还掉年化 ≥${HI_RATE}% 的那 ${hi.length} 笔`,
      detail: () => {
        const lowest = rows.slice().sort((a, b) => a.rate - b.rate)[0];
        return {
          top: `高息债务 ${hi.length} 笔 · 共 ${yuan(hiBal)}`,
          body: (
            <>
              同样一块钱，放在 <b>{hi[0].rate.toFixed(2)}%</b> 的 {hi[0].name} 上省下的利息，
              是放在利率最低的 {lowest.name}（<b>{lowest.rate.toFixed(2)}%</b>）上的{" "}
              <b>{(hi[0].rate / Math.max(0.01, lowest.rate)).toFixed(1)}</b> 倍。
            </>
          ),
          bars: hi.map((d) => ({ nm: d.name, pct: d.rate / hi[0].rate, rt: d.rate.toFixed(2) + "%" })),
        };
      },
    });
  }

  /* ③ 还款峰值月：触发 峰值 ÷ 月均 ≥ 1.5。
     severity = (倍数 − 1) × 60，封顶 100。倍数越高，那个月越可能真的还不上。 */
  if (pressure.peak && pressure.monthlyAvg > 0) {
    const ratio = pressure.peak.total / pressure.monthlyAvg;
    if (ratio >= 1.5) {
      const peak = pressure.peak;
      out.push({
        id: "peak",
        severity: Math.min(100, Math.round((ratio - 1) * 60)),
        actionable: true,
        tone: "warn",
        icon: ICON_PEAK,
        title: <>{monthLabel(peak.month)}是最难的一个月</>,
        body: (
          <>
            那个月要还 <b>{yuan(peak.total)}</b>，是月均 <b>{yuan(pressure.monthlyAvg)}</b> 的{" "}
            <b>{ratio.toFixed(1)}</b> 倍。
          </>
        ),
        actionTitle: `先为 ${monthLabel(peak.month)} 备好 ${yuan(peak.total)}`,
        detail: () => {
          const pm = pressure.months.find((m) => m.month === peak.month);
          const items = pm ? pm.items : [];
          const mx = items.length ? items[0].amount : 1;
          // ⚠️只列前 SHOW 笔，但文案必须说清楚只列了几笔、剩下的合计多少。
          // 写"一共有 11 笔债务同时到期："后面跟 6 行、冒号暗示"就这些"，是在骗读者不是省略。
          const SHOW = 6;
          const restN = Math.max(0, items.length - SHOW);
          const restSum = items.slice(SHOW).reduce((s, it) => s + it.amount, 0);
          return {
            top: `${monthLabel(peak.month)} 要还 ${yuan(peak.total)}`,
            body: (
              <>
                比月均多 <b>{yuan(peak.total - pressure.monthlyAvg)}</b>。这个月一共有{" "}
                <b>{items.length}</b> 笔债务同时到期
                {restN ? <>，金额最大的 <b>{SHOW}</b> 笔是：</> : "："}
              </>
            ),
            rest: restN ? `其余 ${restN} 笔 · ${yuan(restSum)}` : undefined,
            bars: items.slice(0, SHOW).map((it) => ({
              nm: it.name,
              pct: it.amount / mx,
              rt: yuan(it.amount),
            })),
          };
        },
      });
    }
  }

  /* ④ 利息负担总量：剩余待付利息 ÷ 剩余本金，分三档给判断。
     这条**只陈述、不可行动**（actionable:false），不会被选成"最该先动手"。
     severity：轻 10 / 中 45 / 重 80。 */
  const burden = total > 0 ? totalInt / total : 0;
  const tier =
    burden > 0.25 ? { s: 80, tone: "risk" as const, w: "偏重" }
    : burden > 0.1 ? { s: 45, tone: "warn" as const, w: "中等" }
    : { s: 10, tone: "good" as const, w: "很轻" };
  out.push({
    id: "burden",
    severity: tier.s,
    actionable: false,
    tone: tier.tone,
    icon: ICON_CHECK,
    title: <>整体利息负担{tier.w}</>,
    body: (
      <>
        剩下还要付 <b>{yuan(totalInt)}</b> 利息，相当于剩余本金 <b>{yuan(total)}</b> 的{" "}
        <b>{Math.round(burden * 100)}%</b>。加权年化 <b>{data.avgRate.toFixed(2)}%</b>。
      </>
    ),
  });

  out.sort((a, b) => b.severity - a.severity);
  return out;
}
