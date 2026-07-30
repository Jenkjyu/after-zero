// 单测 www/js/calc.js 里的纯计算函数——node:test 是 Node 自带的测试跑手，不需要额外装包。
// 覆盖典型场景 + 边界值（详见每个 describe 块的注释），跟 PROGRESS.md 2026-07-24 六续定的
// "三步走"第一步对应：这批函数不碰DOM/localStorage，以后切React也不用重写这些测试。
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../www/js/calc.js");

test("r2 四舍五入到分", () => {
  assert.equal(calc.r2(2.345), 2.35);
  assert.equal(calc.r2(-2.345), -2.35);
  assert.equal(calc.r2(0), 0);
  assert.equal(calc.r2("abc"), 0); // 非数字兜底成0，不是NaN
  assert.equal(calc.r2(undefined), 0);
});

test("genPlan: 等额本息(amort) 本金相加=借款金额，最后一期清零剩余本金", () => {
  const plan = calc.genPlan({ kind: "amort", P: 12000, rate: 12, n: 12, first: "2026-01-15" });
  assert.equal(plan.length, 12);
  assert.equal(plan.reduce((s, r) => s + r.principal, 0), 12000);
  assert.equal(plan[0].date, "2026-01-15");
  assert.equal(plan[11].date, "2026-12-15"); // 按月顺延
  // 每期月供金额应该保持不变(等额)，除了尾差
  assert.equal(plan[0].amount, plan[5].amount);
});

// 回归测试：这是一个真实存在过的bug，不是假想的边界情况——rate=0(免息)或rate极小时，
// 每期利息趋近于0，导致每期"本金"份额趋近于同一个数，重复r2()四舍五入会往同一个方向
// 累积偏差(原理跟equalprincipal那条回归测试是同一类)。私人借款免息/极低息是这个App
// 完全正常的真实场景(债务类型里就有"私人借款")，不是刁钻数据。修复前P=500,rate=0,n=9
// 时本金合计会变成500.03而不是500。
test("genPlan: 等额本息(amort) rate=0(免息)时，本金合计依然精确=借款金额", () => {
  const plan = calc.genPlan({ kind: "amort", P: 500, rate: 0, n: 9, first: "2026-01-01" });
  assert.equal(plan.length, 9);
  assert.equal(plan.reduce((s, r) => s + r.principal, 0), 500);
  plan.forEach((r) => assert.equal(r.interest, 0)); // 免息，利息全程为0
});

// 回归测试：上面那条r2()修法只堵住了"合计对不上"，期数一多(30年内完全有可能，比如
// P=100,rate=36%,n=210这种真实的高息长期债务组合)，同一个方向反复累积的四舍五入偏差
// 会超过剩余本金，导致某一期(甚至最后一期)本金/金额变成负数——比"合计差几分钱"离谱得多。
// 修法是每期本金都clamp到"不能超过当前剩余本金"(不只是最后一期)，一旦公式算出来的钱
// 比剩下的本金还多，这一期直接收掉全部剩余、提前结清，之后每期清爽显示0，不会出现负数。
test("genPlan: 等额本息(amort) 长期限+高利率(30年内的真实组合)不会让某一期本金/金额变成负数", () => {
  const plan = calc.genPlan({ kind: "amort", P: 100, rate: 36, n: 210, first: "2026-01-01" });
  assert.equal(plan.length, 210);
  plan.forEach((r) => {
    assert.ok(r.principal >= 0, "本金不能为负: " + JSON.stringify(r));
    assert.ok(r.interest >= 0, "利息不能为负: " + JSON.stringify(r));
    assert.ok(r.amount >= 0, "金额不能为负: " + JSON.stringify(r));
  });
  // 210项浮点加法本身会有约1e-13级别的二进制表示噪声(不是genPlan的bug，是JS浮点数的
  // 通性，跟0.1+0.2!==0.3是同一个原因)，用r2()圆整到分再比较，跟下面的r2sum()是同一个思路。
  assert.equal(calc.r2(plan.reduce((s, r) => s + r.principal, 0)), 100);
});

test("genPlan: 等额本金(equalprincipal) 每期本金固定，利息按剩余本金递减，本金相加=借款金额", () => {
  const plan = calc.genPlan({ kind: "equalprincipal", P: 12000, rate: 12, n: 12, first: "2026-01-15" });
  assert.equal(plan.length, 12);
  assert.equal(plan.reduce((s, r) => s + r.principal, 0), 12000);
  plan.forEach((r) => assert.equal(r.principal, 1000)); // 每期本金固定=12000/12
  assert.ok(plan[0].interest > plan[1].interest); // 利息随剩余本金递减
  assert.ok(plan[0].amount > plan[11].amount); // 总还款额逐期递减(跟amort的"每期相同"相反)
});

// 回归测试：P/n除不尽时(500/9=55.5555...)，早期实现每期本金各自独立r2()四舍五入成同一个
// 值，9期全部四舍五入成55.56，最后一期没有零头可吸收，本金合计变成500.04而不是500——
// 跟amort不同(amort每期本金天然不同、四舍五入正负大致抵消)，等额本金每期本金本来就是
// 同一个数字，重复四舍五入只会往同一个方向偏、期数越多偏得越多。修法是pr4先r2()一次、
// bal4按这个已四舍五入的值往下减，让最后一期精确吸收剩余零头。
test("genPlan: 等额本金(equalprincipal) P/n除不尽时，本金合计依然精确=借款金额(不因逐期四舍五入累积偏差)", () => {
  const plan = calc.genPlan({ kind: "equalprincipal", P: 500, rate: 6, n: 9, first: "2026-01-01" });
  assert.equal(plan.length, 9);
  assert.equal(plan.reduce((s, r) => s + r.principal, 0), 500);
  // 前8期都是r2(500/9)=55.56，最后一期吸收零头(500-8*55.56=55.52)，不是55.56
  for (let i = 0; i < 8; i++) assert.equal(plan[i].principal, 55.56);
  assert.equal(plan[8].principal, 55.52);
});

// 回归测试：P/n向下舍入时(100/3=33.333...，r2四舍五入成33.33，比真实值小)，最后一期
// 剩余本金反而比pr4大(100-2*33.33=33.34>33.33)——这条专门测"最后一期必须强制=剩余本金
// 本身，不能被clamp成Math.min(pr4,剩余本金)"，否则这1分钱零头会被漏掉、合计变成99.99。
test("genPlan: 等额本金(equalprincipal) P/n向下舍入时，最后一期吸收的零头比pr4更大也不会被漏掉", () => {
  const plan = calc.genPlan({ kind: "equalprincipal", P: 100, rate: 6, n: 3, first: "2026-01-01" });
  assert.deepEqual(plan.map((r) => r.principal), [33.33, 33.33, 33.34]);
  assert.equal(plan.reduce((s, r) => s + r.principal, 0), 100);
});

// 回归测试：equalprincipal同样存在"长期限时四舍五入偏差累积超过剩余本金"的风险
// (原理跟amort那条同名回归测试一样)，同一个clamp机制必须两个分支都生效。
test("genPlan: 等额本金(equalprincipal) 长期限+高利率不会让某一期本金/金额变成负数", () => {
  const plan = calc.genPlan({ kind: "equalprincipal", P: 100, rate: 36, n: 210, first: "2026-01-01" });
  plan.forEach((r) => {
    assert.ok(r.principal >= 0, "本金不能为负: " + JSON.stringify(r));
    assert.ok(r.interest >= 0, "利息不能为负: " + JSON.stringify(r));
    assert.ok(r.amount >= 0, "金额不能为负: " + JSON.stringify(r));
  });
  assert.equal(calc.r2(plan.reduce((s, r) => s + r.principal, 0)), 100); // 圆整掉210项浮点加法的噪声
});

test("genPlan: 信用卡等本等费(equalfee) 每期金额固定=本金+手续费", () => {
  const plan = calc.genPlan({ kind: "equalfee", pp: 1000, pf: 50, n: 6, first: "2026-02-01" });
  assert.equal(plan.length, 6);
  plan.forEach((r) => {
    assert.equal(r.principal, 1000);
    assert.equal(r.interest, 50);
    assert.equal(r.amount, 1050);
  });
});

test("genPlan: 先息后本(interestfirst) 前ni期只付利息本金为0，后np期摊销本金", () => {
  const plan = calc.genPlan({ kind: "interestfirst", P: 6000, rate: 12, ni: 2, np: 4, first: "2026-01-01" });
  assert.equal(plan.length, 6);
  assert.equal(plan[0].principal, 0);
  assert.equal(plan[1].principal, 0);
  assert.ok(plan[0].interest > 0);
  const amortSection = plan.slice(2);
  assert.equal(amortSection.reduce((s, r) => s + r.principal, 0), 6000);
});

// 回归测试：先息后本的"还本阶段"结构上跟amort同一套摊销算法(bal3/m3)，同一个"期数一多、
// 四舍五入偏差累积超过剩余本金"的风险也存在，同一个clamp机制必须在这个分支也生效。
test("genPlan: 先息后本(interestfirst) 还本阶段期数很多+高利率不会让某一期本金/金额变成负数", () => {
  const plan = calc.genPlan({ kind: "interestfirst", P: 100, rate: 36, ni: 2, np: 208, first: "2026-01-01" });
  const amortSection = plan.slice(2);
  amortSection.forEach((r) => {
    assert.ok(r.principal >= 0, "本金不能为负: " + JSON.stringify(r));
    assert.ok(r.interest >= 0, "利息不能为负: " + JSON.stringify(r));
    assert.ok(r.amount >= 0, "金额不能为负: " + JSON.stringify(r));
  });
  assert.equal(calc.r2(amortSection.reduce((s, r) => s + r.principal, 0)), 100); // 圆整掉浮点加法噪声
});

test("genPlan: 自定义(custom) 生成n期全零占位", () => {
  const plan = calc.genPlan({ kind: "custom", n: 3, first: "2026-01-01" });
  assert.equal(plan.length, 3);
  plan.forEach((r) => { assert.equal(r.amount, 0); assert.equal(r.principal, 0); assert.equal(r.interest, 0); });
});

test("impliedAPR: 反推出等额本息计划本身设定的年化利率", () => {
  const plan = calc.genPlan({ kind: "amort", P: 12000, rate: 12, n: 12, first: "2026-01-15" });
  assert.equal(calc.impliedAPR(plan), 12);
});

test("impliedAPR: 空计划或零本金返回0，不抛异常", () => {
  assert.equal(calc.impliedAPR([]), 0);
  assert.equal(calc.impliedAPR([{ amount: 0, principal: 0 }]), 0);
});

test("recompute: 已还/未还正确分区，月供和下一期日期取第一条未还记录", () => {
  const plan = calc.genPlan({ kind: "amort", P: 12000, rate: 12, n: 12, first: "2026-01-15" });
  const d = { plan: plan.map((r, i) => Object.assign({}, r, { paid: i < 3 })) };
  calc.recompute(d);
  assert.equal(d.original, 12000);
  assert.equal(d.paidTerms, 3);
  assert.equal(d.terms, 9);
  assert.equal(d.totalTerms, 12);
  assert.equal(d.nextDate, "2026-04-15"); // 第4期(index 3)是第一条未还
  assert.equal(d.monthly, plan[3].amount);
  assert.equal(d.balance, r2sum(plan.slice(3)));
  assert.equal(d.rate, 12);
});

test("recompute: 空plan不抛异常，各字段归零", () => {
  const d = { plan: [] };
  calc.recompute(d);
  assert.equal(d.original, null); // plan.length为0时是null，不是0——跟"有计划但全部结清"要区分开
  assert.equal(d.balance, 0);
  assert.equal(d.monthly, 0);
  assert.equal(d.nextDate, null);
});

test("recompute: 5种计息方式(amort/equalprincipal/equalfee/interestfirst/custom)各跑一遍，都不抛异常且字段形状一致", () => {
  const specs = {
    amort: { kind: "amort", P: 5000, rate: 15, n: 6, first: "2026-01-01" },
    equalprincipal: { kind: "equalprincipal", P: 5000, rate: 15, n: 6, first: "2026-01-01" },
    equalfee: { kind: "equalfee", pp: 800, pf: 40, n: 6, first: "2026-01-01" },
    interestfirst: { kind: "interestfirst", P: 5000, rate: 15, ni: 2, np: 4, first: "2026-01-01" },
    custom: { kind: "custom", n: 4, first: "2026-01-01" },
  };
  Object.keys(specs).forEach((kind) => {
    const plan = calc.genPlan(specs[kind]);
    const d = { plan };
    calc.recompute(d);
    assert.equal(d.totalTerms, plan.length);
    assert.equal(d.terms, plan.length); // 全部未还
    assert.equal(d.balance, d.original); // 一期都没还，剩余=原始
    assert.ok(d.rate >= 0); // custom全零本金时impliedAPR退化成0，不应是NaN/负数
  });
  // custom(全0金额)是唯一一个原始本金也是0的场景
  const customPlan = calc.genPlan(specs.custom);
  const dCustom = { plan: customPlan };
  calc.recompute(dCustom);
  assert.equal(dCustom.original, 0);
  assert.equal(dCustom.rate, 0);
});

test("markPaidThrough: 前n期标记为已还，其余未还", () => {
  const plan = calc.genPlan({ kind: "custom", n: 5, first: "2026-01-01" });
  calc.markPaidThrough(plan, 2);
  assert.deepEqual(plan.map((p) => p.paid), [true, true, false, false, false]);
});

test("normalize: 从spec生成plan、按gen.paid标记已还期数、recompute派生字段", () => {
  const d = { gen: { kind: "amort", P: 1000, rate: 6, n: 3, first: "2026-01-01", paid: 1 } };
  calc.normalize(d);
  assert.deepEqual(d.plan.map((p) => p.paid), [true, false, false]);
  assert.equal(d.paidTerms, 1);
  assert.equal(d.rate, 6);
});

test("genDebtId: 返回以d开头的字符串，两次调用不同", () => {
  const a = calc.genDebtId(), b = calc.genDebtId();
  assert.equal(typeof a, "string");
  assert.ok(a.startsWith("d"));
  assert.notEqual(a, b);
});

test("normalize: 给缺id的老数据补发id，已有id的不会被覆盖", () => {
  const legacy = { gen: { kind: "custom", n: 1, first: "2026-01-01" } };
  calc.normalize(legacy);
  assert.equal(typeof legacy.id, "string");
  assert.ok(legacy.id.startsWith("d"));

  const withId = { id: "d-existing", gen: { kind: "custom", n: 1, first: "2026-01-01" } };
  calc.normalize(withId);
  assert.equal(withId.id, "d-existing");
});

test("amortForward: 标准摊销直到还清，返回月数+总利息", () => {
  const r = calc.amortForward(1000, 0.01, 90, null);
  assert.equal(r.months, 12);
  assert.ok(r.totalInterest > 0 && r.totalInterest < 100);
});

test("amortForward: 月供不够付利息时返回null(不会死循环)", () => {
  assert.equal(calc.amortForward(1000, 0.5, 10, null), null);
});

test("simulatePrepay: 单次多还一笔比不还提前还清、少付利息", () => {
  const d = { rate: 12, monthly: 100, balance: 1000 };
  const sim = calc.simulatePrepay(d, "single", 3, 300);
  assert.ok(sim.monthsSaved > 0);
  assert.ok(sim.interestSaved > 0);
  assert.equal(sim.newMonths, sim.baseMonths - sim.monthsSaved);
});

test("simulatePrepay: 每期都多还比单次多还省得更多（同样起始追加点，recurring持续复利叠加）", () => {
  const d = { rate: 12, monthly: 100, balance: 1000 };
  const single = calc.simulatePrepay(d, "single", 1, 20);
  const recurring = calc.simulatePrepay(d, "recurring", 1, 20);
  assert.ok(recurring.monthsSaved >= single.monthsSaved);
  assert.ok(recurring.interestSaved >= single.interestSaved);
});

test("simulatePrepay: 月供覆盖不了利息时返回null", () => {
  const d = { rate: 600, monthly: 1, balance: 1000 }; // 月利率50%，月供1远不够
  assert.equal(calc.simulatePrepay(d, "single", 1, 10), null);
});

test("detectMatchingSort: 顺序匹配某个预设排序时返回该排序名", () => {
  const sorts = { "a-asc": (x) => x.v, "a-desc": (x) => -x.v };
  const arr = [{ v: 1 }, { v: 2 }, { v: 3 }];
  assert.equal(calc.detectMatchingSort(arr, sorts), "a-asc");
  assert.equal(calc.detectMatchingSort(arr.slice().reverse(), sorts), "a-desc");
});

test("detectMatchingSort: 顺序不匹配任何预设时返回custom", () => {
  const sorts = { "a-asc": (x) => x.v, "a-desc": (x) => -x.v };
  assert.equal(calc.detectMatchingSort([{ v: 2 }, { v: 1 }, { v: 3 }], sorts), "custom");
});

test("urgencyTier: 边界值 -1/0/3/4/14/15", () => {
  assert.equal(calc.urgencyTier(-1), "overdue");
  assert.equal(calc.urgencyTier(0), "crit");
  assert.equal(calc.urgencyTier(3), "crit");
  assert.equal(calc.urgencyTier(4), "warn");
  assert.equal(calc.urgencyTier(14), "warn");
  assert.equal(calc.urgencyTier(15), "dim");
});

test("dueBucket: 边界值 -1/0/7/8/30/31（跟urgencyTier是两套独立阈值）", () => {
  assert.equal(calc.dueBucket(-1), "overdue");
  assert.equal(calc.dueBucket(0), "week");
  assert.equal(calc.dueBucket(7), "week");
  assert.equal(calc.dueBucket(8), "month");
  assert.equal(calc.dueBucket(30), "month");
  assert.equal(calc.dueBucket(31), "later");
});

test("relLabel: 逾期/今天/未来三种措辞", () => {
  assert.equal(calc.relLabel(-3), "已逾期 3 天");
  assert.equal(calc.relLabel(0), "就在今天");
  assert.equal(calc.relLabel(5), "5 天后");
});

test("isBadRepeatDay: 只拦29/30/31号(批量设置还款日/公式生成首期还款日用)", () => {
  assert.deepEqual([1, 28, 29, 30, 31, 32].map(calc.isBadRepeatDay), [false, false, true, true, true, false]);
});

test("offsetLabel: 当天到期 vs 提前N天两种措辞", () => {
  assert.equal(calc.offsetLabel(0), "当天到期");
  assert.equal(calc.offsetLabel(2), "提前2天");
});

test("computeReportData: 已结清债务被排除，加权平均利率/预计还清日期/按类型分组都正确", () => {
  const d1 = { name: "debt1", type: "银行贷", settled: false, plan: calc.genPlan({ kind: "amort", P: 6000, rate: 12, n: 6, first: "2026-01-01" }) };
  calc.recompute(d1);
  const d2 = { name: "debt2", type: "网贷", settled: false, plan: calc.genPlan({ kind: "amort", P: 3000, rate: 24, n: 3, first: "2026-02-01" }) };
  calc.recompute(d2);
  const d3 = { name: "debt3", type: "私人借款", settled: true, plan: calc.genPlan({ kind: "custom", n: 2, first: "2026-01-01" }) };
  calc.recompute(d3);
  const data = calc.computeReportData([d1, d2, d3]);
  assert.equal(data.active.length, 2); // d3(已结清)被排除
  assert.equal(data.totalBalance, calc.r2(d1.balance + d2.balance));
  assert.equal(data.byName.length, 2);
  assert.equal(data.typeList.length, 2);
  assert.equal(data.payoffDate, "2026-06-01"); // 两笔债务里最晚的未还期
  // 加权平均利率：(6000余额*12% + 3000余额*24%)/9000余额，两笔金额都还没还所以balance=original
  const expectedAvg = (d1.balance * 12 + d2.balance * 24) / (d1.balance + d2.balance);
  assert.ok(Math.abs(data.avgRate - expectedAvg) < 0.001);
});

test("computeReportData: 债务类型超过6种时第6+种折叠成'其他'", () => {
  const debts = ["A", "B", "C", "D", "E", "F", "G", "H"].map((t, i) => {
    const plan = calc.genPlan({ kind: "custom", n: 1, first: "2026-01-01" });
    plan[0].principal = (i + 1) * 100; plan[0].amount = plan[0].principal;
    const d = { name: "d" + i, type: t, settled: false, plan };
    calc.recompute(d);
    return d;
  });
  const data = calc.computeReportData(debts);
  assert.equal(data.typeList.length, 6); // 5个具名 + 1个"其他"
  assert.equal(data.typeList[data.typeList.length - 1].name, "其他");
  // "其他"应该是余额最小的3个类型(A/B/C, 100+200+300=600)合并
  assert.equal(data.typeList[data.typeList.length - 1].value, 600);
});

test("computeReportData: 没有在还债务时返回空结构而不是抛异常", () => {
  const data = calc.computeReportData([]);
  assert.equal(data.totalBalance, 0);
  assert.equal(data.avgRate, 0);
  assert.equal(data.payoffDate, null);
  assert.deepEqual(data.byName, []);
  assert.deepEqual(data.typeList, []);
  assert.equal(data.timeline.length, 1); // 只有"今天"这一个起点
});

test("summarizeDebts: 已结清债务不计入在还总负债/月供，但它已还的本金/利息计入累计", () => {
  const d1 = { settled: false, oneTime: false, balance: 1000, monthly: 200, paidPrincipal: 500, paidInterest: 50 };
  const d2 = { settled: false, oneTime: true, balance: 2000, monthly: 2000, paidPrincipal: 0, paidInterest: 0 }; // 一次性还清不计入monthly
  const d3 = { settled: true, oneTime: false, balance: 0, monthly: 0, paidPrincipal: 3000, paidInterest: 300 };
  const s = calc.summarizeDebts([d1, d2, d3]);
  assert.equal(s.active, 2);
  assert.equal(s.settled, 1);
  assert.equal(s.total, 3000); // 只算未结清的balance: 1000+2000
  assert.equal(s.monthly, 200); // d2是oneTime不计入
  assert.equal(s.paidPrincipal, 3500); // 500 + 已结清d3的3000 ← 累计口径
  assert.equal(s.paidInterest, 350); // 50 + 300
});

test("summarizeDebts: 完成度百分比 = 已还本金/(已还本金+在还总负债)，零本零负债兜底0%", () => {
  const s1 = calc.summarizeDebts([{ settled: false, balance: 1000, paidPrincipal: 1000, monthly: 0, paidInterest: 0 }]);
  assert.equal(s1.pct, 50); // 1000/(1000+1000)
  const s2 = calc.summarizeDebts([]);
  assert.equal(s2.pct, 0); // zeroBase为0时兜底，不做除0
  assert.equal(s2.total, 0);
  assert.equal(s2.active, 0);
  assert.equal(s2.settled, 0);
});

test("computeMonthlyRepayment: 空输入返回空数组", () => {
  assert.deepEqual(calc.computeMonthlyRepayment([]), []);
});

test("computeMonthlyRepayment: 单笔债务已还/待还正确拆分", () => {
  const d = {
    plan: [
      { date: "2026-01-15", amount: 1000, paid: true },
      { date: "2026-02-15", amount: 1000, paid: false }
    ]
  };
  const out = calc.computeMonthlyRepayment([d]);
  assert.deepEqual(out, [
    { month: "2026-01", actual: 1000, scheduled: 0 },
    { month: "2026-02", actual: 0, scheduled: 1000 }
  ]);
});

test("computeMonthlyRepayment: 两笔债务同月金额相加", () => {
  const d1 = { plan: [{ date: "2026-03-05", amount: 500, paid: true }] };
  const d2 = { plan: [{ date: "2026-03-20", amount: 300, paid: true }] };
  const out = calc.computeMonthlyRepayment([d1, d2]);
  assert.deepEqual(out, [{ month: "2026-03", actual: 800, scheduled: 0 }]);
});

test("computeMonthlyRepayment: settled=true 债务的已还记录仍被计入（不按active过滤）", () => {
  const d = { settled: true, plan: [{ date: "2026-04-10", amount: 200, paid: true }] };
  const out = calc.computeMonthlyRepayment([d]);
  assert.deepEqual(out, [{ month: "2026-04", actual: 200, scheduled: 0 }]);
});

test("computeMonthlyRepayment: 月份缺口正确补0（1月和4月有数据，输出4条，2/3月为0）", () => {
  const d = {
    plan: [
      { date: "2026-01-10", amount: 100, paid: true },
      { date: "2026-04-10", amount: 200, paid: false }
    ]
  };
  const out = calc.computeMonthlyRepayment([d]);
  assert.deepEqual(out, [
    { month: "2026-01", actual: 100, scheduled: 0 },
    { month: "2026-02", actual: 0, scheduled: 0 },
    { month: "2026-03", actual: 0, scheduled: 0 },
    { month: "2026-04", actual: 0, scheduled: 200 }
  ]);
});

test("computeMonthlyRepayment: 跨年补月（11月到次年2月）", () => {
  const d = {
    plan: [
      { date: "2026-11-10", amount: 100, paid: true },
      { date: "2027-02-10", amount: 150, paid: false }
    ]
  };
  const out = calc.computeMonthlyRepayment([d]);
  assert.deepEqual(out.map(x => x.month), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("computeMonthlyRepayment: date缺失/格式不对的行被防御性忽略", () => {
  const d = {
    plan: [
      { date: "2026-05-01", amount: 100, paid: true },
      { date: "", amount: 999, paid: true },
      { amount: 999, paid: true },
      { date: "not-a-date", amount: 999, paid: true }
    ]
  };
  const out = calc.computeMonthlyRepayment([d]);
  assert.deepEqual(out, [{ month: "2026-05", actual: 100, scheduled: 0 }]);
});

test("isActive / rateClass: 简单谓词", () => {
  assert.equal(calc.isActive({ settled: false }), true);
  assert.equal(calc.isActive({ settled: true }), false);
  assert.equal(calc.rateClass(20), "rate-hi");
  assert.equal(calc.rateClass(10), "rate-mid");
  assert.equal(calc.rateClass(5), "rate-lo");
});

test("clone: 深拷贝，改动副本不影响原对象", () => {
  const original = { a: 1, nested: { b: 2 } };
  const copy = calc.clone(original);
  copy.nested.b = 999;
  assert.equal(original.nested.b, 2);
  assert.deepEqual(copy, { a: 1, nested: { b: 999 } });
});

test("fmt/money: 金额格式化", () => {
  assert.equal(calc.fmt(1234.6), "1,235"); // 四舍五入取整+千分位
  assert.equal(calc.fmt("abc"), "0"); // 非数字兜底
  assert.equal(calc.money(1234.5), "1,234.50"); // 保留两位小数
  assert.equal(calc.money(-5), "-5.00");
});

test("todayStr: 返回 M/D 格式（依赖系统时钟，只校验格式不校验具体值）", () => {
  assert.match(calc.todayStr(), /^\d{1,2}\/\d{1,2}$/);
});

test("baseName / extOf: 从路径/文件名提取信息", () => {
  assert.equal(calc.baseName("a/b/c.pdf"), "c.pdf");
  assert.equal(calc.baseName("justname.jpg"), "justname.jpg");
  assert.equal(calc.baseName(""), "");
  assert.equal(calc.extOf("report.PDF"), "pdf"); // 统一转小写
  assert.equal(calc.extOf("noext"), "");
  assert.equal(calc.extOf(""), "");
});

test("esc/escSvg: 转义 & < >，且&优先不会被二次转义", () => {
  assert.equal(calc.esc("<a & b>"), "&lt;a &amp; b&gt;");
  assert.equal(calc.escSvg("<a & b>"), "&lt;a &amp; b&gt;");
});

test("inline: 粗体/行内代码/wiki式斜体/链接只保留文字，且转义在先", () => {
  assert.equal(calc.inline("**bold** `code` [[em]]"), "<strong>bold</strong> <code>code</code> <em>em</em>");
  assert.equal(calc.inline("[点这里](http://x.com)"), "点这里"); // 链接语法只保留文字，不生成<a>
  assert.equal(calc.inline("<script>"), "&lt;script&gt;"); // 先esc转义，不会被当成真实标签
});

test("isHr: 三个以上-/=/_/*算分隔线，两个不算", () => {
  assert.equal(calc.isHr("---"), true);
  assert.equal(calc.isHr("___"), true);
  assert.equal(calc.isHr("***"), true);
  assert.equal(calc.isHr("--"), false);
  assert.equal(calc.isHr("abc"), false);
});

test("truncateLabel: 超过n截断加省略号，未超过原样返回", () => {
  assert.equal(calc.truncateLabel("1234567890", 5), "1234…");
  assert.equal(calc.truncateLabel("abc", 5), "abc");
  assert.equal(calc.truncateLabel("abcde", 5), "abcde"); // 恰好等于n不截断
});

test("mdToHtml: 标题/粗体/列表/引用/分隔线/代码块/表格都能转出预期的HTML结构", () => {
  const html = calc.mdToHtml(
    "# Title\n\nSome **bold** text.\n\n- item1\n- item2\n\n1. one\n2. two\n\n> quote\n\n---\n\n```\ncode <tag>\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n"
  );
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<p>Some <strong>bold<\/strong> text\.<\/p>/);
  assert.match(html, /<ul><li>item1<\/li><li>item2<\/li><\/ul>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(html, /<blockquote>quote<\/blockquote>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<pre class="md-pre">code &lt;tag&gt;<\/pre>/); // 代码块内容也转义，不会被当成真实标签
  assert.match(html, /<div class="md-tbl"><table>.*<th>A<\/th>.*<td>1<\/td>.*<\/table><\/div>/);
});

test("mdToHtml: 空输入返回空字符串，不抛异常", () => {
  assert.equal(calc.mdToHtml(""), "");
});

test("hasPremium/premiumLabel: 会员判断与文案", () => {
  assert.equal(calc.hasPremium({ premium: { method: "onetime" } }), true);
  assert.equal(calc.hasPremium({ premium: null }), false);
  assert.equal(calc.hasPremium(null), false); // 整个premium对象都没有也不抛异常
  assert.equal(calc.premiumLabel({ premium: { method: "yearly" } }), "Premium 会员");
  assert.equal(calc.premiumLabel({ premium: null }), null);
});

test("findAiConv: 按id查找历史对话，找不到返回null", () => {
  const convos = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(calc.findAiConv(convos, "b"), { id: "b" });
  assert.equal(calc.findAiConv(convos, "zzz"), null);
});

test("bumpAiConvTop: 把指定记录挪到数组最前面，已经在最前时不做多余操作", () => {
  const convos = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const rec = convos[2];
  calc.bumpAiConvTop(convos, rec);
  assert.deepEqual(convos.map((r) => r.id), ["c", "a", "b"]);
  calc.bumpAiConvTop(convos, rec); // 已在最前(idx=0)，再调一次应该保持不变
  assert.deepEqual(convos.map((r) => r.id), ["c", "a", "b"]);
});

function r2sum(rows) {
  return calc.r2(rows.reduce((s, r) => s + (r.principal || 0), 0));
}

// ===== 统计tab口径修正：3个已确认bug的回归测试 =====
// 这三条是2026-07-29"统计tab优化"调查阶段用真实数据跑出来的、确认存在的口径问题，
// 每一条都先于实现写好并确认过是红的，不是事后补的描述性测试。

test("summarizeDebts: 债务结清瞬间已还金额/归零进度不倒退（BUG-2 回归）", () => {
  // 真实场景：销掉最后一期→payInstallment把settled置为true。用户视角是"我刚还完一笔"，
  // 已还金额和归零进度绝不该因此变小。这里曾经排除已结清债务，导致数字当场往回跳
  // （用户真实报过：销掉后数字不动，过一会儿点"恢复"它自己又涨回来了）。
  const beforeSettle = { settled: false, oneTime: false, balance: 0, monthly: 0, paidPrincipal: 3000, paidInterest: 300 };
  const afterSettle = { settled: true, oneTime: false, balance: 0, monthly: 0, paidPrincipal: 3000, paidInterest: 300 };
  const before = calc.summarizeDebts([beforeSettle]);
  const after = calc.summarizeDebts([afterSettle]);
  assert.equal(before.paidPrincipal, 3000);
  assert.equal(after.paidPrincipal, 3000); // 关键：结清前后完全一致，不掉回0
  assert.equal(after.paidInterest, 300);
  assert.equal(after.pct, 100); // 全部还完=100%，不是旧口径算出来的0%
  assert.ok(after.pct >= before.pct, "归零进度不能因为一笔债务结清而倒退");
});

test("summarizeDebts: 结清/恢复来回切换，已还金额保持不变（用户报的\"点恢复数字自己涨了\"）", () => {
  // 一笔100元本金的一次性还清债务，销掉→settled=true，再点"恢复"→settled=false。
  // 旧口径下这个来回会让已还金额 6144→6144→6244（结清期间那100被踢出去了）。
  const base = { settled: false, oneTime: false, balance: 3000, monthly: 500, paidPrincipal: 6144, paidInterest: 120 };
  const oneTime = { oneTime: true, balance: 0, monthly: 0, paidPrincipal: 100, paidInterest: 0 };
  const settled = calc.summarizeDebts([base, { ...oneTime, settled: true }]);
  const restored = calc.summarizeDebts([base, { ...oneTime, settled: false }]);
  assert.equal(settled.paidPrincipal, 6244);
  assert.equal(restored.paidPrincipal, 6244); // 两个状态必须一模一样
  assert.equal(settled.pct, restored.pct);
});

test("computeUpcomingPressure: 提前结清的债务，未来未还期次不再计入待还（BUG-1 回归）", () => {
  // settleFull()只写settled=true、不标记plan为已还，所以已结清债务的剩余期次仍然是
  // {paid:false}。computeMonthlyRepayment()不按active过滤，会把它们算成"待还"——
  // 表现为"已经结清的债务，未来几个月还显示要还钱"。新函数必须按active过滤。
  const settledDebt = {
    id: "d1", name: "已结清", settled: true,
    plan: [
      { date: "2026-06-10", amount: 1100, principal: 1000, interest: 100, paid: true },
      { date: "2026-08-10", amount: 1100, principal: 1000, interest: 100, paid: false },
      { date: "2026-09-10", amount: 1100, principal: 1000, interest: 100, paid: false },
    ],
  };
  const activeDebt = {
    id: "d2", name: "在还", settled: false,
    plan: [{ date: "2026-08-10", amount: 500, principal: 450, interest: 50, paid: false }],
  };
  const today = new Date(2026, 6, 29); // 2026-07-29
  const p = calc.computeUpcomingPressure([settledDebt, activeDebt], 12, today);
  const aug = p.months.find((m) => m.month === "2026-08");
  assert.equal(aug.total, 500, "8月只该有在还债务的500，不含已结清债务的1100");
  const sep = p.months.find((m) => m.month === "2026-09");
  assert.equal(sep.total, 0, "9月已结清债务的期次不该出现");
  assert.equal(p.totalAhead, 500);
  // 对照组：旧函数确实会把已结清债务的未来期次算进来（证明这个bug真实存在）
  const old = calc.computeMonthlyRepayment([settledDebt, activeDebt]);
  assert.equal(old.find((m) => m.month === "2026-09").scheduled, 1100);
});

test("computeReportData: 含逾期未销期次时 timeline 日期不倒流（BUG-3 回归）", () => {
  // timeline第一个点固定是"今天"，随后按未还行日期升序追加——逾期未销的期次日期在今天
  // 之前，会让第二个点的日期早于第一个点，折线图上表现为"今天→过去→未来"。
  const d = {
    id: "d1", name: "有逾期", settled: false,
    plan: [
      { date: "2026-01-10", amount: 1100, principal: 1000, interest: 100, paid: false }, // 逾期未销
      { date: "2026-12-10", amount: 1100, principal: 1000, interest: 100, paid: false },
    ],
  };
  calc.recompute(d);
  const timeline = calc.computeReportData([d]).timeline;
  const dates = timeline.map((p) => p.date);
  assert.deepEqual(dates, dates.slice().sort(), "timeline日期必须单调不减");
  assert.equal(timeline[0].balance, 2000); // 起点仍是今天的全部未还本金
  assert.equal(timeline[timeline.length - 1].balance, 0); // 终点仍归零
});

test("computeUpcomingPressure: 空输入返回N个空月份桶而不是空数组", () => {
  const p = calc.computeUpcomingPressure([], 12, new Date(2026, 6, 29));
  assert.equal(p.months.length, 12);
  assert.equal(p.months[0].month, "2026-07");
  assert.equal(p.currentMonth, "2026-07");
  assert.equal(p.totalAhead, 0);
  assert.equal(p.monthlyAvg, 0);
  assert.equal(p.peak, null); // 全零时没有峰值月，不返回一个total为0的假峰值
  assert.deepEqual(p.overdue, { amount: 0, principal: 0, interest: 0, count: 0 });
});

test("computeUpcomingPressure: 逾期未销期次单独进overdue桶，不混进未来月份", () => {
  const d = {
    id: "d1", name: "有逾期", settled: false,
    plan: [
      { date: "2026-05-10", amount: 300, principal: 250, interest: 50, paid: false }, // 逾期
      { date: "2026-07-10", amount: 300, principal: 250, interest: 50, paid: false }, // 本月但已过日子→也算逾期
      { date: "2026-07-31", amount: 300, principal: 250, interest: 50, paid: false }, // 本月未到期
    ],
  };
  const p = calc.computeUpcomingPressure([d], 12, new Date(2026, 6, 29)); // 今天 2026-07-29
  assert.equal(p.overdue.count, 2);
  assert.equal(p.overdue.amount, 600);
  assert.equal(p.overdue.principal, 500);
  assert.equal(p.overdue.interest, 100);
  assert.equal(p.months[0].month, "2026-07");
  assert.equal(p.months[0].total, 300, "本月桶只含今天及以后未到期的那一期");
  assert.equal(p.totalAhead, 300, "totalAhead不含逾期");
});

test("computeUpcomingPressure: 本金/利息两段拆分正确，月份连续补0且跨年", () => {
  const d = {
    id: "d1", name: "跨年", settled: false,
    plan: [
      { date: "2026-08-10", amount: 1100, principal: 1000, interest: 100, paid: false },
      { date: "2027-01-10", amount: 1100, principal: 900, interest: 200, paid: false },
    ],
  };
  const p = calc.computeUpcomingPressure([d], 12, new Date(2026, 6, 29));
  const aug = p.months.find((m) => m.month === "2026-08");
  assert.equal(aug.principal, 1000);
  assert.equal(aug.interest, 100);
  assert.equal(aug.total, 1100);
  const jan = p.months.find((m) => m.month === "2027-01");
  assert.equal(jan.principal, 900);
  assert.equal(jan.interest, 200);
  // 中间没数据的月份是补0的桶，不是缺失
  assert.equal(p.months.find((m) => m.month === "2026-10").total, 0);
  assert.equal(p.months.map((m) => m.month).join(","),
    "2026-07,2026-08,2026-09,2026-10,2026-11,2026-12,2027-01,2027-02,2027-03,2027-04,2027-05,2027-06");
});

test("computeUpcomingPressure: 峰值月/月均/窗口外期次被排除", () => {
  const d = {
    id: "d1", name: "长期", settled: false,
    plan: [
      { date: "2026-08-10", amount: 500, principal: 500, interest: 0, paid: false },
      { date: "2026-09-10", amount: 2000, principal: 2000, interest: 0, paid: false }, // 峰值
      { date: "2028-09-10", amount: 9999, principal: 9999, interest: 0, paid: false }, // 12个月窗口外
    ],
  };
  const p = calc.computeUpcomingPressure([d], 12, new Date(2026, 6, 29));
  assert.deepEqual(p.peak, { month: "2026-09", total: 2000 });
  assert.equal(p.totalAhead, 2500, "窗口外的9999不计入");
  assert.equal(p.monthlyAvg, calc.r2(2500 / 12));
});

test("computeUpcomingPressure: 同一债务同月多期合并成一个items条目，多笔债务各自成条目并按金额降序", () => {
  const a = {
    id: "dA", name: "A债", settled: false,
    plan: [
      { date: "2026-08-05", amount: 100, principal: 100, interest: 0, paid: false },
      { date: "2026-08-20", amount: 200, principal: 200, interest: 0, paid: false },
    ],
  };
  const b = { id: "dB", name: "B债", settled: false, plan: [{ date: "2026-08-15", amount: 900, principal: 900, interest: 0, paid: false }] };
  const p = calc.computeUpcomingPressure([a, b], 12, new Date(2026, 6, 29));
  const aug = p.months.find((m) => m.month === "2026-08");
  assert.equal(aug.total, 1200);
  assert.deepEqual(aug.items, [
    { id: "dB", name: "B债", amount: 900 },
    { id: "dA", name: "A债", amount: 300 }, // 同月两期合并
  ]);
});

test("computeUpcomingPressure: 已还期次和一次性还清债务的处理", () => {
  const paidOff = { id: "d1", name: "已还", settled: false, plan: [{ date: "2026-08-10", amount: 500, principal: 500, interest: 0, paid: true }] };
  const oneTime = { id: "d2", name: "一次性", settled: false, oneTime: true, plan: [{ date: "2026-08-10", amount: 8000, principal: 8000, interest: 0, paid: false }] };
  const p = calc.computeUpcomingPressure([paidOff, oneTime], 12, new Date(2026, 6, 29));
  const aug = p.months.find((m) => m.month === "2026-08");
  assert.equal(aug.total, 8000, "已还期次不计入；一次性还清是真实的当月支出，必须计入");
  assert.equal(aug.items.length, 1);
});

test("computeUpcomingPressure: 部分还款(已知的数据模型缺口④)的期次只算还欠的那部分，不虚高", () => {
  // 100元=本金80+利息20，已经还了40：利息优先分摊后本金欠60、利息欠0，这一期在压力图里
  // 应该只算¥60(rowRemaining)，不是原始的¥100。
  const d = { id: "d1", name: "分期", plan: [{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false, paidAmount: 40 }] };
  const p = calc.computeUpcomingPressure([d], 12, new Date(2026, 6, 29));
  const aug = p.months.find((m) => m.month === "2026-08");
  assert.equal(aug.total, 60);
  assert.equal(aug.principal, 60);
  assert.equal(aug.interest, 0);
  assert.equal(aug.items[0].amount, 60);
});

test("remainingInterest: 只累加未还期次的利息/手续费", () => {
  const d = { plan: [
    { interest: 100, paid: true }, { interest: 90, paid: true },
    { interest: 80, paid: false }, { interest: 70, paid: false },
  ] };
  assert.equal(calc.remainingInterest(d), 150); // 只算未还的 80+70
  assert.equal(calc.remainingInterest({ plan: [] }), 0);
  assert.equal(calc.remainingInterest({}), 0); // 没有plan字段也不抛异常
  // 自定义计划没拆本息时会低估成0——这是数据缺口不是算错，UI措辞要留余地
  assert.equal(calc.remainingInterest({ plan: [{ amount: 5000, principal: 0, interest: 0, paid: false }] }), 0);
});

test("niceCeil: 取整到好看的刻度数字，档位够细不会把柱子压成半格高", () => {
  assert.equal(calc.niceCeil(2760), 3000); // 关键用例：粗档位下会被抬到5000
  assert.equal(calc.niceCeil(2194), 2500);
  assert.equal(calc.niceCeil(1733), 2000);
  assert.equal(calc.niceCeil(1000), 1000); // 正好落在档位上不再往上跳
  assert.equal(calc.niceCeil(1001), 1500);
  assert.equal(calc.niceCeil(85), 100);
  assert.equal(calc.niceCeil(0), 0);
  assert.equal(calc.niceCeil(-5), 0);
  // 每个档位的一半都还是整数（中间那条刻度线不会出现1,250这种零头）
  [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].forEach((s) => {
    if (s === 2.5) return; // 2500的一半是1250，是这批档位里唯一的例外，保留它是因为2000~2500之间需要一档
    assert.equal((s * 1000) / 2 % 1, 0, `档位${s}k的一半不是整数`);
  });
});

// ===== 提前结清 / 撤销结清（applySettle / undoSettle）=====
// 这两个函数是2026-07-29"零散bug修复轮"第2项的核心：提前结清不再是"只写settled=true"，
// 而是把剩余期次收进快照、追加一条记录了实付金额的结清行。见 calc.js 里那段长注释。
function makeDebt(paidCount) {
  const d = {
    id: "dtest", name: "测试债务",
    plan: calc.genPlan({ kind: "amort", P: 12000, rate: 12, n: 12, first: "2026-01-15" }),
  };
  calc.markPaidThrough(d.plan, paidCount);
  calc.recompute(d);
  return d;
}

test("applySettle: 实付=剩余本金时，本金全额计入已还、利息为0", () => {
  const d = makeDebt(3);
  const remain = d.balance;
  const paidPrincipalBefore = d.paidPrincipal;
  const paidInterestBefore = d.paidInterest;

  assert.equal(calc.applySettle(d, remain, "2026-07-29"), true);
  assert.equal(d.settled, true);
  assert.equal(d.settledDate, "7/29"); // 已结清列表用的短格式，不是"2026-07-29"
  assert.equal(d.plan.length, 4);      // 3条已还 + 1条结清行
  assert.equal(d.plan[3].settleRow, true);
  assert.equal(d.plan[3].date, "2026-07-29");
  assert.equal(d.settleStash.length, 9);
  // 剩余本金整个进了已还本金，利息一分没多
  assert.equal(d.paidPrincipal, calc.r2(paidPrincipalBefore + remain));
  assert.equal(d.paidInterest, paidInterestBefore);
  assert.equal(d.balance, 0);
  assert.equal(d.terms, 0);
  // 借款总额不变——结清行的本金恰好补上被收走那些期的本金
  assert.equal(d.original, makeDebt(3).original);
});

test("applySettle: 多付的部分记成利息", () => {
  const d = makeDebt(2);
  const remain = d.balance;
  const paidInterestBefore = d.paidInterest;
  calc.applySettle(d, remain + 125, "2026-07-29");
  assert.equal(d.plan[d.plan.length - 1].interest, 125);
  assert.equal(d.paidInterest, calc.r2(paidInterestBefore + 125));
  assert.equal(d.paidPrincipal, calc.r2(d.original - 0)); // 全部本金都还完了
});

test("applySettle: 协商减免时利息记负数，本金照实算（两栏加起来=真实付出去的钱）", () => {
  const d = makeDebt(2);
  const remain = d.balance;
  calc.applySettle(d, remain - 100, "2026-07-29");
  const row = d.plan[d.plan.length - 1];
  assert.equal(row.principal, remain);
  assert.equal(row.interest, -100);
  assert.equal(calc.r2(row.principal + row.interest), calc.r2(remain - 100)); // 总账对得上
});

test("applySettle: 已经没有未还期次时返回false、不做任何改动", () => {
  const d = makeDebt(12);
  const before = JSON.stringify(d.plan);
  assert.equal(calc.applySettle(d, 100, "2026-07-29"), false);
  assert.equal(JSON.stringify(d.plan), before);
  assert.equal(d.settleStash, undefined);
});

test("applySettle: 年化利率仍按原始完整计划反推，不被结清行带偏", () => {
  const d = makeDebt(3);
  const rateBefore = d.rate;
  calc.applySettle(d, d.balance + 500, "2026-07-29");
  assert.equal(d.rate, rateBefore);
  // 再recompute一次(模拟reload时normalize走一遍)也要稳定，不能每次算出不同的值
  calc.recompute(d);
  assert.equal(d.rate, rateBefore);
});

test("undoSettle: 提前结清后撤销，精确回到结清前那一刻", () => {
  const before = makeDebt(3);
  const d = makeDebt(3);
  calc.applySettle(d, d.balance + 300, "2026-07-29");
  calc.undoSettle(d);

  assert.equal(d.settled, false);
  assert.equal(d.settleStash, undefined);
  assert.equal(d.plan.length, 12);
  assert.equal(d.plan.some((r) => r.settleRow), false);
  assert.equal(d.balance, before.balance);
  assert.equal(d.paidPrincipal, before.paidPrincipal);
  assert.equal(d.paidInterest, before.paidInterest);
  assert.equal(d.terms, before.terms);
  assert.equal(d.nextDate, before.nextDate);
  assert.deepEqual(d.plan, before.plan);
});

test("undoSettle: 销完最后一期自动结清的债务，恢复后不能留下待还¥0的僵尸", () => {
  // 真机报的bug：只有1期的债务销掉那一期→自动结清→点"恢复"→挂在在还列表里但剩余待还是0
  const d = { id: "d1", name: "一次性", oneTime: true, plan: [{ date: "2026-07-01", amount: 100, principal: 100, interest: 0, paid: true, paidAt: "2026-07-01" }] };
  d.settled = true; d.settledDate = "7/1";
  calc.recompute(d);
  assert.equal(d.balance, 0); // 结清状态下确实是0

  calc.undoSettle(d);
  assert.equal(d.settled, false);
  assert.equal(d.plan[0].paid, false); // 最后一期的已还标记被释放了
  assert.equal(d.balance, 100);        // 恢复成"还有100没还"，不再是僵尸
  assert.equal(d.terms, 1);
  // "恢复"是撤销这一步付款事件，不能留下"标着实付日期/部分还款金额，但又不算已还"的矛盾中间态
  assert.equal(d.plan[0].paidAt, undefined);
  assert.equal(d.plan[0].paidAmount, undefined);
});

test("undoSettle: 多期债务销完最后一期后恢复，只释放最后一期(原来已还几期还是几期)", () => {
  const d = makeDebt(12); // 12期全部已还
  d.settled = true; d.settledDate = "7/29";
  calc.undoSettle(d);
  assert.equal(d.paidTerms, 11); // 只放开了最后一期
  assert.equal(d.terms, 1);
  assert.equal(d.plan[10].paid, true);
  assert.equal(d.plan[11].paid, false);
});

// ===== 还款流水(paidAt) + 部分还款(recordPayment/waivePeriod)（已知的数据模型缺口③④）=====
test("rowRemaining: 没还过就是全额，还了一部分就扣掉那部分", () => {
  assert.equal(calc.rowRemaining({ amount: 100 }), 100);
  assert.equal(calc.rowRemaining({ amount: 100, paidAmount: 40 }), 60);
  assert.equal(calc.rowRemaining({ amount: 100, paidAmount: 100 }), 0);
});

test("recompute: 未还期次有部分还款时，按利息优先分摊已还本金/利息，剩余待还本金相应减少", () => {
  // 100元=本金80+利息20，只还了40：利息优先先冲满20利息，剩下20冲本金
  const d = { id: "d", plan: [{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false, paidAmount: 40 }] };
  calc.recompute(d);
  assert.equal(d.paidPrincipal, 20);
  assert.equal(d.paidInterest, 20);
  assert.equal(d.balance, 60); // 本金80-20
  assert.equal(d.paidTerms, 0);
  assert.equal(d.terms, 1); // 还没还完，依然算1期未还
});

test("recompute: 部分还款不够利息时，全部冲抵利息、本金分文未减", () => {
  // 本金80利息20，只还了15：15全部冲利息(还差5)，本金一分没动
  const d = { id: "d", plan: [{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false, paidAmount: 15 }] };
  calc.recompute(d);
  assert.equal(d.paidPrincipal, 0);
  assert.equal(d.paidInterest, 15);
  assert.equal(d.balance, 80);
});

test("recompute: 老数据(paid=true但没有paidAmount字段)按计划全额算，行为不变", () => {
  const d = { id: "d", plan: [{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: true }] };
  calc.recompute(d);
  assert.equal(d.paidPrincipal, 80);
  assert.equal(d.paidInterest, 20);
  assert.equal(d.balance, 0);
});

test("recompute: 已还期次paidAmount达到amount(不是协商减免)按计划全额算，不触发分摊", () => {
  const d = { id: "d", plan: [{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: true, paidAmount: 100 }] };
  calc.recompute(d);
  assert.equal(d.paidPrincipal, 80);
  assert.equal(d.paidInterest, 20);
});

test("recompute: 已还期次paidAmount小于amount(协商减免关闭)按实付金额利息优先分摊，不是全额", () => {
  // 本金80利息20，减免关闭时只记了15：15全部冲利息，已还本金=0，跟"老数据全额算"的80/20明显不同
  const d = { id: "d", plan: [{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: true, paidAmount: 15 }] };
  calc.recompute(d);
  assert.equal(d.paidPrincipal, 0);
  assert.equal(d.paidInterest, 15);
  assert.equal(d.balance, 0); // 已还的期次(不管是不是减免)都不再算进剩余待还
  // ⚠️principal/interest这两个原计划字段本身不能被这次改动动过——它们还要给d.original/年化利率用
  assert.equal(d.plan[0].principal, 80);
  assert.equal(d.plan[0].interest, 20);
});

function planDebt(rows, extra) {
  return Object.assign({ id: "d", name: "测试债务", plan: rows }, extra || {});
}

test("recordPayment: 还的钱不够这期，累加paidAmount、这期继续留在未还里，可以之后再补", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false }]);
  const res = calc.recordPayment(d, 40, "2026-07-29");
  assert.deepEqual(res, { idx: 0, full: false, remaining: 60 });
  assert.equal(d.plan[0].paid, false);
  assert.equal(d.plan[0].paidAmount, 40);
  assert.equal(d.plan[0].paidAt, undefined); // 没还完，不盖实付日期
  assert.equal(d.balance, 60);
});

test("recordPayment: 分两次补齐，第二次凑够金额后自动标记已还+盖实付日期", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false }]);
  calc.recordPayment(d, 40, "2026-07-29");
  const res = calc.recordPayment(d, 60, "2026-08-05"); // 拖了几天后补齐剩下的60
  assert.equal(res.full, true);
  assert.equal(d.plan[0].paid, true);
  assert.equal(d.plan[0].paidAt, "2026-08-05"); // 盖的是"真正还清那天"，不是第一次付款那天
  assert.equal(d.plan[0].paidAmount, 100);
  assert.equal(d.paidPrincipal, 80);
  assert.equal(d.paidInterest, 20);
});

test("recordPayment: 一次性还够/超额，直接标记已还，paidAmount封顶在amount(多付不结转)", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false }]);
  const res = calc.recordPayment(d, 150, "2026-07-29");
  assert.equal(res.full, true);
  assert.equal(d.plan[0].paid, true);
  assert.equal(d.plan[0].paidAmount, 100); // 不是150
});

test("recordPayment: 最后一期还清后，跟payInstallment一样自动整体结清债务", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: false }]);
  const res = calc.recordPayment(d, 100, "2026-07-29");
  assert.equal(res.full, true);
  assert.equal(d.settled, true);
  assert.equal(d.settledDate, "7/29");
});

test("recordPayment: 已经没有未还期次时返回null", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: true }]);
  assert.equal(calc.recordPayment(d, 50, "2026-07-29"), null);
});

test("waivePeriod: 协商减免——不管实付多少都强制关闭这一期，差额自动体现为少算的已还", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false }]);
  const res = calc.waivePeriod(d, 40, "2026-07-29");
  assert.deepEqual(res, { idx: 0 });
  assert.equal(d.plan[0].paid, true);
  assert.equal(d.plan[0].paidAt, "2026-07-29");
  assert.equal(d.plan[0].paidAmount, 40);
  assert.equal(d.paidPrincipal, 20); // 利息优先分摊：40-20利息=20冲本金
  assert.equal(d.paidInterest, 20);
  assert.equal(d.balance, 0); // 减免关闭后不再算进剩余待还
  assert.equal(d.terms, 0);
  // 原计划字段不变——差额是"少算的已还"体现出来的，不是把principal/interest本身改小
  assert.equal(d.plan[0].principal, 80);
});

test("waivePeriod: 最后一期减免关闭后，整体债务自动结清", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 80, interest: 20, paid: false }]);
  calc.waivePeriod(d, 30, "2026-07-29");
  assert.equal(d.settled, true);
  assert.equal(d.settledDate, "7/29");
});

test("waivePeriod: 已经没有未还期次时返回null", () => {
  const d = planDebt([{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: true }]);
  assert.equal(calc.waivePeriod(d, 50, "2026-07-29"), null);
});

// ===== pressureWindowMonths（"未来还款压力"图的窗口长度，2026-07-29）=====
test("pressureWindowMonths: 铺到最后一笔未还期次所在的月份，下限12上限60", () => {
  const today = new Date(2026, 6, 15); // 2026-07-15
  const mk = (dates, extra) => Object.assign({
    id: "d", plan: dates.map((dt) => ({ date: dt, amount: 100, principal: 100, interest: 0, paid: false })),
  }, extra || {});

  // 没有任何未还期次 → 兜底12
  assert.equal(calc.pressureWindowMonths([], today), 12);
  assert.equal(calc.pressureWindowMonths([mk([])], today), 12);

  // 最后一期在3个月后 → 不足12，仍取下限12
  assert.equal(calc.pressureWindowMonths([mk(["2026-10-10"])], today), 12);

  // 最后一期在2028-07 → 2026-07到2028-07共25个月
  assert.equal(calc.pressureWindowMonths([mk(["2028-07-01"])], today), 25);

  // 超过5年 → 钳到60
  assert.equal(calc.pressureWindowMonths([mk(["2040-01-01"])], today), 60);

  // 已结清的债务不参与
  assert.equal(calc.pressureWindowMonths([mk(["2030-01-01"], { settled: true })], today), 12);

  // 已还的期次不参与；逾期(日期在今天之前)也不参与——它在图里是单独一条提示行
  const paidLate = { id: "d", plan: [
    { date: "2030-01-01", amount: 100, principal: 100, interest: 0, paid: true },
    { date: "2026-01-01", amount: 100, principal: 100, interest: 0, paid: false },
  ] };
  assert.equal(calc.pressureWindowMonths([paidLate], today), 12);

  // 多笔债务取最晚的那个
  assert.equal(calc.pressureWindowMonths([mk(["2027-01-05"]), mk(["2027-07-05"])], today), 13);
});

// ===== computeNotifySchedule（还款提醒调度，"已知的数据模型缺口①"回归，2026-07-29）=====
test("computeNotifySchedule: 通知关闭或没有规则时返回空", () => {
  const d = { id: "d", name: "A", plan: [{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: false }] };
  const now = new Date(2026, 6, 29).getTime();
  assert.deepEqual(calc.computeNotifySchedule([d], { enabled: false, rules: [{ offsetDays: 1, time: "09:00" }] }, now, 6, 450), []);
  assert.deepEqual(calc.computeNotifySchedule([d], { enabled: true, rules: [] }, now, 6, 450), []);
  assert.deepEqual(calc.computeNotifySchedule([d], null, now, 6, 450), []);
});

test("computeNotifySchedule: 排的不只是下一期，窗口内每一期未还都排（回归：老版本只排nextDate）", () => {
  const d = {
    id: "d", name: "分期贷",
    plan: [
      { date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: false },
      { date: "2026-09-10", amount: 100, principal: 100, interest: 0, paid: false },
      { date: "2026-10-10", amount: 100, principal: 100, interest: 0, paid: false },
    ],
  };
  const now = new Date(2026, 6, 29).getTime(); // 2026-07-29
  const rules = [{ offsetDays: 1, time: "09:00" }];
  const list = calc.computeNotifySchedule([d], { enabled: true, rules }, now, 6, 450);
  assert.equal(list.length, 3, "三期各排一条，不是只有下一期");
  assert.deepEqual(list.map((x) => x.date), ["2026-08-10", "2026-09-10", "2026-10-10"]);
});

test("computeNotifySchedule: 已结清债务不参与；已还的期次不参与", () => {
  const settled = { id: "d1", name: "已结清", settled: true, plan: [{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: false }] };
  const paid = { id: "d2", name: "已还这期", plan: [{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: true }] };
  const now = new Date(2026, 6, 29).getTime();
  const list = calc.computeNotifySchedule([settled, paid], { enabled: true, rules: [{ offsetDays: 1, time: "09:00" }] }, now, 6, 450);
  assert.deepEqual(list, []);
});

test("computeNotifySchedule: 超出窗口的期次不排；窗口边界当天算在窗口内", () => {
  const today = new Date(2026, 6, 29); // 2026-07-29
  const d = {
    id: "d", name: "长期",
    plan: [
      { date: "2027-01-29", amount: 100, principal: 100, interest: 0, paid: false }, // 6个月后，边界内
      { date: "2027-02-01", amount: 100, principal: 100, interest: 0, paid: false }, // 超出6个月窗口
    ],
  };
  const list = calc.computeNotifySchedule([d], { enabled: true, rules: [{ offsetDays: 0, time: "09:00" }] }, today.getTime(), 6, 450);
  assert.equal(list.length, 1);
  assert.equal(list[0].date, "2027-01-29");
});

test("computeNotifySchedule: 一期配多条规则各自算出正确的提醒时间；已经过去的提醒时间被跳过", () => {
  const d = { id: "d", name: "A", plan: [{ date: "2026-08-10", amount: 200, principal: 200, interest: 0, paid: false }] };
  const now = new Date(2026, 7, 9, 12, 0, 0).getTime(); // 2026-08-09 12:00，提前1天9点那条已经过去
  const rules = [{ offsetDays: 3, time: "09:00" }, { offsetDays: 1, time: "09:00" }, { offsetDays: 0, time: "18:00" }];
  const list = calc.computeNotifySchedule([d], { enabled: true, rules }, now, 6, 450);
  // offsetDays:3 → 08-07 09:00（已过去，跳过）；offsetDays:1 → 08-09 09:00（已过去，跳过）；
  // offsetDays:0 → 08-10 18:00（未来，保留）
  assert.equal(list.length, 1);
  assert.equal(list[0].fireAt.getTime(), new Date(2026, 7, 10, 18, 0, 0).getTime());
});

test("computeNotifySchedule: 结果按触发时间升序排列", () => {
  const a = { id: "a", name: "A", plan: [{ date: "2026-09-10", amount: 100, principal: 100, interest: 0, paid: false }] };
  const b = { id: "b", name: "B", plan: [{ date: "2026-08-10", amount: 100, principal: 100, interest: 0, paid: false }] };
  const now = new Date(2026, 6, 29).getTime();
  const list = calc.computeNotifySchedule([a, b], { enabled: true, rules: [{ offsetDays: 0, time: "09:00" }] }, now, 6, 450);
  assert.deepEqual(list.map((x) => x.name), ["B", "A"]); // B(8月)先于A(9月)
});

test("computeNotifySchedule: 超过maxCount按触发时间截断，保留最近的那些", () => {
  const plan = [];
  for (let m = 1; m <= 12; m++) plan.push({ date: "2026-" + String(m).padStart(2, "0") + "-15", amount: 100, principal: 100, interest: 0, paid: false });
  const d = { id: "d", name: "多期", plan };
  const now = new Date(2026, 0, 1).getTime(); // 2026-01-01，窗口给12个月覆盖全部
  const list = calc.computeNotifySchedule([d], { enabled: true, rules: [{ offsetDays: 0, time: "09:00" }] }, now, 12, 5);
  assert.equal(list.length, 5);
  assert.equal(list[0].date, "2026-01-15", "截断后保留的是离现在最近的那些，不是随便丢的");
  assert.equal(list[4].date, "2026-05-15");
});
