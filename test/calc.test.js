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

test("recompute: 4种计息方式(amort/equalfee/interestfirst/custom)各跑一遍，都不抛异常且字段形状一致", () => {
  const specs = {
    amort: { kind: "amort", P: 5000, rate: 15, n: 6, first: "2026-01-01" },
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
