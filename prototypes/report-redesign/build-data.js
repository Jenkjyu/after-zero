// 生成 shared/data.js —— 三套统计页原型共用的那份数据。
//
// 为什么要有这个脚本，而不是直接在原型 HTML 里手写一堆数字：原型要能回答"这个设计
// 在真实数据下长什么样"，手写的数字很容易在不知不觉中违反 App 自己的数据不变量
// （比如 amount ≠ principal+interest、本金合计 ≠ 借款金额、timeline 终点不归零），
// 那样对着假数据调出来的视觉，一接真实数据就散架。
//
// 做法：构造 12 笔债务（名称/类型/余额量级对齐用户 2026-07-31 那张真机统计页截图，
// 三个类型的合计 35,711 / 16,208 / 7,069 与截图逐一相等，总额 58,988 也相等），
// 然后喂给**真实的 www/js/calc.js**，把 recompute / computeReportData /
// computeUpcomingPressure / summarizeDebts / pressureWindowMonths / remainingInterest
// 的输出原样烘焙成 data.js。所以原型里每一个 KPI、每一根柱子、走势图每一个拐点，
// 都是 App 真实计算逻辑算出来的，不是编的。
//
// ⚠️只读引用 calc.js，不修改它。跑法：node prototypes/report-redesign/build-data.js
const fs = require("fs");
const path = require("path");
const calc = require("../../www/js/calc.js");

// ===== 目标余额：来自真机截图"各债务剩余待还"那张图逐行读出来的值 =====
// 类型归属是反推出来的：三类合计必须分别等于截图里的 35,711 / 16,208 / 7,069，
// 这个约束下的拆分是唯一的（银行贷 = 25000+9782+929，网贷 = 2305+2303+2000+461，
// 其余归信用卡分期），所以这份类型分配不是随手指定的。
const SEED = [
  // name, type, 目标余额, 计息方式与参数, 已还期数
  { name: "test11", type: "银行贷",     target: 25000, kind: "amort",    P: 36000, rate: 5.6,  n: 36, paid: 11 },
  { name: "test8",  type: "银行贷",     target: 9782,  kind: "amort",    P: 15000, rate: 6.2,  n: 24, paid: 8 },
  { name: "test3",  type: "银行贷",     target: 929,   kind: "amort",    P: 12000, rate: 4.9,  n: 36, paid: 33 },
  { name: "test5",  type: "信用卡分期", target: 5460,  kind: "equalfee", P: 8400,  fee: 0.6,   n: 12, paid: 4 },
  { name: "test12", type: "信用卡分期", target: 4389,  kind: "equalfee", P: 6000,  fee: 0.72,  n: 12, paid: 3 },
  { name: "test4",  type: "信用卡分期", target: 2578,  kind: "equalfee", P: 6000,  fee: 0.66,  n: 12, paid: 7 },
  { name: "test6",  type: "信用卡分期", target: 2375,  kind: "equalfee", P: 4800,  fee: 0.75,  n: 12, paid: 6 },
  { name: "test7",  type: "信用卡分期", target: 1406,  kind: "equalfee", P: 4200,  fee: 0.68,  n: 12, paid: 8 },
  { name: "test9",  type: "网贷",       target: 2305,  kind: "amort",    P: 5000,  rate: 24,   n: 12, paid: 6 },
  { name: "test2",  type: "网贷",       target: 2303,  kind: "amort",    P: 4000,  rate: 21,   n: 12, paid: 5 },
  { name: "test1",  type: "网贷",       target: 2000,  kind: "amort",    P: 6000,  rate: 28,   n: 12, paid: 8 },
  { name: "test10", type: "网贷",       target: 461,   kind: "amort",    P: 3000,  rate: 30,   n: 9,  paid: 8 },
];

const FUNDERS = {
  银行贷: ["招商银行", "建设银行", "工商银行"],
  信用卡分期: ["招行信用卡", "中信信用卡", "浦发信用卡"],
  网贷: ["借呗", "微粒贷", "京东金条"],
};

// 首期日期：让 paid 那几期正好覆盖"过去的月份 + 当月"，第一期未还落在下个月。
// 这样既没有逾期（跟截图一致：截图里没有逾期提示条），当月待还也是 ¥0（截图里
// "26年7月待还 ¥0"），第一根有高度的柱子出现在 8 月。
function firstDateFor(paid) {
  const d = calc.addMonths(calc.today0(), -(paid - 1));
  d.setDate(15);
  return calc.fmtDate(d);
}

function buildDebt(spec, idx) {
  const first = firstDateFor(spec.paid);
  let plan;
  if (spec.kind === "amort") {
    plan = calc.genPlan({ kind: "amort", P: spec.P, rate: spec.rate, n: spec.n, first });
  } else {
    // 等本等费：每期本金 = P/n，每期手续费 = P * fee%
    plan = calc.genPlan({
      kind: "equalfee",
      pp: calc.r2(spec.P / spec.n),
      pf: calc.r2((spec.P * spec.fee) / 100),
      n: spec.n,
      first,
    });
  }
  plan.forEach((r, i) => { if (i < spec.paid) r.paid = true; });

  // 把余额精确校准到目标值：差额落在**最后一期**的本金上。
  // 真实的摊销计划本来就是最后一期吸收全部四舍五入零头（见 genPlan 里那大段注释），
  // 所以这个调整不会让计划变得不真实；同时 amount 跟着改成 principal+interest，
  // 维持 EditSheet 保存校验要求的那条一致性（|amount-(principal+interest)| <= 0.015）。
  const remaining = plan.reduce((s, r) => (r.paid ? s : s + (+r.principal || 0)), 0);
  const delta = calc.r2(spec.target - remaining);
  const last = plan[plan.length - 1];
  last.principal = calc.r2((+last.principal || 0) + delta);
  last.amount = calc.r2((+last.principal || 0) + (+last.interest || 0));

  const funders = FUNDERS[spec.type];
  const d = {
    id: "d-proto-" + idx,
    name: spec.name,
    type: spec.type,
    funder: funders[idx % funders.length],
    plan,
    settled: false,
    note: "",
  };
  calc.recompute(d);
  return d;
}

const debts = SEED.map(buildDebt);

// ===== 自检：跑不过就不该产出数据 =====
const errors = [];
debts.forEach((d, i) => {
  if (Math.abs(d.balance - SEED[i].target) > 0.02) {
    errors.push(`${d.name} 余额 ${d.balance} ≠ 目标 ${SEED[i].target}`);
  }
  d.plan.forEach((r, k) => {
    const sum = calc.r2((+r.principal || 0) + (+r.interest || 0));
    if (Math.abs((+r.amount || 0) - sum) > 0.015) {
      errors.push(`${d.name} 第${k + 1}期 amount ${r.amount} ≠ 本金+利息 ${sum}`);
    }
    if ((+r.principal || 0) < 0) errors.push(`${d.name} 第${k + 1}期本金为负`);
  });
});
const typeSum = {};
debts.forEach((d) => { typeSum[d.type] = calc.r2((typeSum[d.type] || 0) + d.balance); });
const EXPECT_TYPE = { 银行贷: 35711, 信用卡分期: 16208, 网贷: 7069 };
Object.keys(EXPECT_TYPE).forEach((t) => {
  if (Math.abs((typeSum[t] || 0) - EXPECT_TYPE[t]) > 0.05) {
    errors.push(`类型「${t}」合计 ${typeSum[t]} ≠ 截图值 ${EXPECT_TYPE[t]}`);
  }
});
if (errors.length) {
  console.error("自检失败：\n  " + errors.join("\n  "));
  process.exit(1);
}

// ===== 真实计算 =====
const report = calc.computeReportData(debts);
const windowMonths = calc.pressureWindowMonths(debts);
const pressure = calc.computeUpcomingPressure(debts, windowMonths);
const summary = calc.summarizeDebts(debts);

// 走势图的点可能上百个（每笔债务每一期一个日期），原样烘焙体积太大也没必要——
// 原型只需要能画出同一条曲线，按日期均匀抽稀到 ≤80 个点，**但首尾两个点必须保留**
// （起点=当前总余额、终点=归零，这两个是这张图的不变量，抽稀不能破坏它们）。
function thinTimeline(tl, max) {
  if (tl.length <= max) return tl;
  const out = [tl[0]];
  const step = (tl.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.push(tl[Math.round(i * step)]);
  out.push(tl[tl.length - 1]);
  return out;
}

// 各债务剩余待还：三个排序维度各自需要的值（余额 / 年化 / 剩余待付利息），
// 跟真实 BalanceBars.tsx 一样由 remainingInterest() 现算，不是估的。
const byDebt = report.active
  .map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    balance: calc.r2(d.balance),
    rate: calc.r2(d.rate || 0),
    remainingInterest: calc.r2(calc.remainingInterest(d)),
    monthly: calc.r2(d.monthly || 0),
    terms: d.terms,
    totalTerms: d.totalTerms,
    original: calc.r2(d.original || 0),
    nextDate: d.nextDate,
  }))
  .sort((a, b) => b.balance - a.balance);

// 统计总结卡那几条结论（口径逐条照抄 SummaryCard.tsx，不重新发明）
let topRate = null, highCount = 0, highBalance = 0, restInterest = 0;
report.active.forEach((d) => {
  if (!topRate || (+d.rate || 0) > (+topRate.rate || 0)) topRate = { name: d.name, rate: calc.r2(d.rate || 0) };
  if (calc.rateClass(+d.rate || 0) === "rate-hi") { highCount++; highBalance += +d.balance || 0; }
  restInterest += calc.remainingInterest(d);
});
const payoff = report.payoffDate ? calc.parseDate(report.payoffDate) : null;
const t0 = calc.today0();
const monthsLeft = payoff
  ? Math.max(0, (payoff.getFullYear() - t0.getFullYear()) * 12 + (payoff.getMonth() - t0.getMonth()))
  : null;

const out = {
  generatedAt: calc.fmtDate(calc.today0()),
  today: calc.fmtDate(calc.today0()),
  summary: {
    total: summary.total,
    monthly: summary.monthly,
    paidPrincipal: summary.paidPrincipal,
    paidInterest: summary.paidInterest,
    active: summary.active,
    settled: summary.settled,
    pct: summary.pct,
  },
  report: {
    totalBalance: report.totalBalance,
    avgRate: calc.r2(report.avgRate),
    payoffDate: report.payoffDate,
    typeList: report.typeList.map((x) => ({ name: x.name, value: calc.r2(x.value) })),
    timeline: thinTimeline(report.timeline, 80).map((p) => ({ date: p.date, balance: p.balance })),
  },
  pressure: {
    windowMonths,
    totalAhead: pressure.totalAhead,
    monthlyAvg: pressure.monthlyAvg,
    peak: pressure.peak ? { month: pressure.peak.month, total: calc.r2(pressure.peak.total) } : null,
    overdue: { count: pressure.overdue.count, amount: calc.r2(pressure.overdue.amount) },
    months: pressure.months.map((m) => ({
      month: m.month,
      total: calc.r2(m.total),
      principal: calc.r2(m.principal),
      interest: calc.r2(m.interest),
      items: (m.items || []).map((it) => ({ name: it.name, amount: calc.r2(it.amount) })),
    })),
  },
  byDebt,
  conclusions: {
    topRate,
    highCount,
    highBalance: calc.r2(highBalance),
    restInterest: calc.r2(restInterest),
    monthsLeft,
  },
};

const banner =
  "// ⚠️自动生成，别手改——改 build-data.js 后重新跑 `node prototypes/report-redesign/build-data.js`。\n" +
  "// 数据来源：12 笔债务喂给真实的 www/js/calc.js 算出来的结果（见 build-data.js 顶部注释）。\n" +
  "// 生成时间基准日：" + out.today + "\n";
fs.writeFileSync(
  path.join(__dirname, "shared", "data.js"),
  banner + "window.AZ_DATA = " + JSON.stringify(out, null, 2) + ";\n"
);

console.log("✓ shared/data.js 已生成");
console.log("  在还总负债 ¥" + calc.fmt(out.report.totalBalance) + "（截图 ¥58,988）");
console.log("  类型合计   " + out.report.typeList.map((t) => t.name + " ¥" + calc.fmt(t.value)).join(" / "));
console.log("  加权年化   " + out.report.avgRate.toFixed(2) + "%");
console.log("  已还本金   ¥" + calc.fmt(out.summary.paidPrincipal) + " / 另付利息 ¥" + calc.fmt(out.summary.paidInterest));
console.log("  归零进度   " + out.summary.pct + "%");
console.log("  预计还清   " + out.report.payoffDate + "（约 " + out.conclusions.monthsLeft + " 个月后）");
console.log("  压力窗口   " + out.pressure.windowMonths + " 个月，合计 ¥" + calc.fmt(out.pressure.totalAhead) +
            "，峰值 " + (out.pressure.peak ? out.pressure.peak.month + " ¥" + calc.fmt(out.pressure.peak.total) : "—"));
console.log("  逾期       " + out.pressure.overdue.count + " 期 ¥" + calc.fmt(out.pressure.overdue.amount));
console.log("  走势点数   " + out.report.timeline.length);
