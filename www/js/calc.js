// After Zero —— 纯计算函数（不碰DOM/localStorage），从 www/index.html 里抽出来的第一批。
// 跟 index.html 主脚本共享全局作用域：普通 <script src>，不是 ES module 的 import/export
// （项目"单文件无构建步骤"的既有原则，见 CLAUDE.md/PROGRESS.md 2026-07-24 六续的三步走计划）。
// index.html 里必须在主 <script> 之前引入这个文件，主脚本内部不再重复声明同名函数，
// 靠普通的JS作用域链找到这里的全局函数。
//
// 同一份代码也被 test/calc.test.js 用 node:test 直接 require（Node是CommonJS，见
// package.json 的 "type":"commonjs"）——文件末尾的 module.exports 只在Node环境生效，
// 浏览器里 <script src> 加载时 typeof module === "undefined"，那段代码不会执行、
// 也不会污染全局，函数声明本身就已经是全局的，不需要额外的 window.xxx 挂载。
"use strict";

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
function fmt(n) { return Math.round(Number(n) || 0).toLocaleString("en-US"); }
function money(n) { return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function todayStr() { var d = new Date(); return (d.getMonth() + 1) + "/" + d.getDate(); }
function baseName(p) { return (p || "").split("/").pop(); }
function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function parseDate(s) { if (!s) return null; var p = String(s).split("-"); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
function addMonths(d, m) { return new Date(d.getFullYear(), d.getMonth() + m, d.getDate()); }
function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today0() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function rateClass(r) { return r >= 18 ? "rate-hi" : (r >= 10 ? "rate-mid" : "rate-lo"); }
function isActive(d) { return !d.settled; }

// plan generation
function genPlan(spec) {
  var rows = [], start = spec.first ? parseDate(spec.first) : today0();
  function push(k, amount, principal, interest) { rows.push({ date: fmtDate(addMonths(start, k)), amount: r2(amount), principal: r2(principal), interest: r2(interest), paid: false }); }
  if (spec.kind === "amort") {
    var P = +spec.P || 0, i = (+spec.rate || 0) / 1200, n = +spec.n || 0, bal = P, m = i > 0 ? P * i / (1 - Math.pow(1 + i, -n)) : (n ? P / n : 0);
    for (var k = 0; k < n; k++) { var it = bal * i, pr = (k === n - 1) ? bal : (m - it), amt = (k === n - 1) ? bal + it : m; bal -= pr; push(k, amt, pr, it); }
  } else if (spec.kind === "equalfee") {
    var pp = +spec.pp || 0, pf = +spec.pf || 0, n2 = +spec.n || 0;
    for (var j = 0; j < n2; j++) push(j, pp + pf, pp, pf);
  } else if (spec.kind === "interestfirst") {
    var P3 = +spec.P || 0, i3 = (+spec.rate || 0) / 1200, ni = +spec.ni || 0, np = +spec.np || 0, it3 = P3 * i3;
    for (var a = 0; a < ni; a++) push(a, it3, 0, it3);
    var m3 = i3 > 0 ? P3 * i3 / (1 - Math.pow(1 + i3, -np)) : (np ? P3 / np : 0), bal3 = P3;
    for (var b = 0; b < np; b++) { var itb = bal3 * i3, prb = (b === np - 1) ? bal3 : (m3 - itb), amtb = (b === np - 1) ? bal3 + itb : m3; bal3 -= prb; push(ni + b, amtb, prb, itb); }
  } else {
    var nc = +spec.n || 0;
    for (var c = 0; c < nc; c++) push(c, 0, 0, 0);
  }
  return rows;
}

// implied APR from full plan (IRR via bisection)
function npv(r, borrow, plan) { var s = -borrow; for (var k = 0; k < plan.length; k++) s += (+plan[k].amount || 0) / Math.pow(1 + r, k + 1); return s; }
function impliedAPR(plan) {
  var borrow = 0; plan.forEach(function (p) { borrow += +p.principal || 0; });
  if (!(borrow > 0) || !plan.length) return 0;
  if (npv(0, borrow, plan) <= 0.0001) return 0;
  var lo = 0, hi = 1;
  for (var it = 0; it < 90; it++) { var mid = (lo + hi) / 2; if (npv(mid, borrow, plan) > 0) lo = mid; else hi = mid; }
  return r2(((lo + hi) / 2) * 1200);
}

function recompute(d) {
  var plan = d.plan || [];
  var borrow = 0, remaining = 0, paidCount = 0, paidPrincipal = 0, paidInterest = 0;
  plan.forEach(function (r) {
    borrow += +r.principal || 0;
    if (r.paid) { paidCount++; paidPrincipal += +r.principal || 0; paidInterest += +r.interest || 0; }
    else remaining += +r.principal || 0;
  });
  d.original = plan.length ? r2(borrow) : null;
  d.balance = r2(remaining);
  d.paidPrincipal = r2(paidPrincipal);
  d.paidInterest = r2(paidInterest);
  d.totalTerms = plan.length; d.paidTerms = paidCount; d.terms = plan.length - paidCount;
  var next = null; for (var k = 0; k < plan.length; k++) { if (!plan[k].paid) { next = plan[k]; break; } }
  d.monthly = next ? (+next.amount || 0) : 0;
  d.nextDate = next ? next.date : null;
  d.rate = impliedAPR(plan);
}
function markPaidThrough(plan, n) { for (var k = 0; k < plan.length; k++) plan[k].paid = k < n; }
// 债务对象的稳定id——创建时生成一次，往后不变。前缀"d"专属债务(备份用"b"/上传用"u"/AI对话
// 用"c"，同一个约定的延伸)。normalize()给老数据(没有id字段的旧localStorage/旧备份/旧导入
// json)惰性补发，见下面。
function genDebtId() { return "d" + Date.now() + Math.random().toString(36).slice(2, 7); }
function normalize(d) {
  if (!d.id) d.id = genDebtId();
  if (!d.plan) { d.plan = genPlan(d.gen); markPaidThrough(d.plan, (d.gen && d.gen.paid) || 0); }
  recompute(d);
}

// 提前还款模拟器：4种计划生成器(等额本息/信用卡等本等费/先息后本/自定义)各自的逐行
// 数学不统一(equalfee/custom没有良定义的"月利率"概念)，没法统一处理"注入一笔额外还款"。
// 改用recompute()已经对所有债务统一算出的派生值(balance/monthly/rate)做标准等额本息
// 模拟，不追各自生成器的原始逐行细节——这是一个明确的简化取舍。
function amortForward(balance, i, M, extraAt) {
  var bal = balance, months = 0, totalInterest = 0;
  while (bal > 0.005 && months < 1200) {
    var interest = bal * i;
    if (M <= interest) return null; // 月供不足以覆盖利息，无法收敛
    months++;
    var principal = Math.min(M - interest, bal);
    bal -= principal; totalInterest += interest;
    var extra = extraAt ? (extraAt(months) || 0) : 0;
    if (extra > 0) bal = Math.max(0, bal - Math.min(extra, bal));
  }
  return { months: months, totalInterest: r2(totalInterest) };
}
function simulatePrepay(d, mode, atPeriod, extra) {
  var i = (+d.rate || 0) / 1200, M = +d.monthly || 0, balance = +d.balance || 0;
  var baseline = amortForward(balance, i, M, null);
  var scenario = mode === "recurring"
    ? amortForward(balance, i, M, function (m) { return m >= atPeriod ? extra : 0; })
    : amortForward(balance, i, M, function (m) { return m === atPeriod ? extra : 0; });
  if (!baseline || !scenario) return null;
  return { monthsSaved: baseline.months - scenario.months, interestSaved: r2(baseline.totalInterest - scenario.totalInterest), newMonths: scenario.months, baseMonths: baseline.months };
}

// Array.sort自ES2019起规范保证稳定；万一某个古早WebView不稳定，最坏结果只是多显示"自定义"，不会误配错的预设名。
// sorts 是 {sortKey: function(d){return 排序用的数字}} 的映射——index.html 里是 DEBT_SORTS，
// 作为参数传入而不是从闭包读取，这样这个函数不依赖任何模块级状态，可以直接单测。
function detectMatchingSort(activeInOrder, sorts) {
  var keys = Object.keys(sorts);
  for (var k = 0; k < keys.length; k++) {
    var cmp = sorts[keys[k]];
    var candidate = activeInOrder.slice().sort(function (a, b) { return cmp(a) - cmp(b); });
    var same = candidate.every(function (d, i) { return d === activeInOrder[i]; });
    if (same) return keys[k];
  }
  return "custom";
}

// 29/30/31号不是每个月都有——批量设置还款日/公式生成的首期还款日投射的是"每月同一天"
// 的重复规律，选这三天会导致还款日在不同月份间漂移，两个入口都靠这个判断拦截。
// 还款计划表格里逐行手动填的具体日期不受这条限制(那是记录真实数据，见 CLAUDE.md)。
function isBadRepeatDay(day) { return day >= 29 && day <= 31; }
// 通知设置面板"提前N天"规则的展示文案。
function offsetLabel(n) { return n === 0 ? "当天到期" : "提前" + n + "天"; }

function urgencyTier(diff) { return diff < 0 ? "overdue" : (diff <= 3 ? "crit" : (diff <= 14 ? "warn" : "dim")); }
function relLabel(diff) { return diff < 0 ? ("已逾期 " + (-diff) + " 天") : (diff === 0 ? "就在今天" : diff + " 天后"); }
// 列表分组的时间桶，跟urgencyTier是两套独立阈值——urgencyTier管颜色(3/14天两档)，
// 这套管列表怎么分段(7/30天两档)，两者语义不同没必要合并成一套。标签直接用"7天内"/"30天内"
// 这种字面天数，不用"本周/本月"——后者暗示按自然周/月计算，实际是纯粹的滚动天数窗口，
// 用"本月"这种词容易让人以为是"到本月底"，真机反馈过这个歧义，改成跟数字对得上的字面说法。
function dueBucket(diff) { return diff < 0 ? "overdue" : (diff <= 7 ? "week" : (diff <= 30 ? "month" : "later")); }

// ===== 高级统计报表（Premium）背后的数据计算 =====
// 原来直接读 index.html 主脚本IIFE里的闭包变量 debts，搬到这里后没法再依赖那个闭包，
// 改成显式传参 computeReportData(debts)——跟 detectMatchingSort 参数化的道理一样。
// 图表本身怎么画成HTML/SVG(renderBalanceBars等)不在这里，那些是跟当前手写DOM绑死的
// 展示逻辑，以后切React会整个重写，留在index.html里，不属于这批"纯计算"。
function computeReportData(debts) {
  var active = debts.filter(function (d) { return !d.settled; });
  var totalBalance = 0, weightedRate = 0, payoffDate = null, byType = {};
  var byName = [];
  active.forEach(function (d) {
    var bal = +d.balance || 0;
    totalBalance += bal; weightedRate += (+d.rate || 0) * bal;
    byName.push({ name: d.name, balance: bal });
    var t = d.type || "未分类";
    byType[t] = (byType[t] || 0) + bal;
    var plan = d.plan || [];
    for (var k = plan.length - 1; k >= 0; k--) { if (!plan[k].paid) { if (!payoffDate || plan[k].date > payoffDate) payoffDate = plan[k].date; break; } }
  });
  byName.sort(function (a, b) { return b.balance - a.balance; });
  var typeList = Object.keys(byType).map(function (k) { return { name: k, value: byType[k] }; }).sort(function (a, b) { return b.value - a.value; });
  if (typeList.length > 6) {
    var restSum = typeList.slice(5).reduce(function (s, x) { return s + x.value; }, 0);
    typeList = typeList.slice(0, 5).concat([{ name: "其他", value: restSum }]);
  }
  // 负债预测走势：把全部在还债务未来每一期的本金按日期汇总，从今天的总余额开始逐步递减。
  // ⚠️逾期未销的期次(date在今天之前)必须归到"今天"这个桶里，不能原样按它自己的过去日期入表——
  // timeline第一个点固定是今天，后面按日期升序追加，过去的日期会让第二个点的日期早于第一个点，
  // 折线图上表现为"今天→过去→未来"的时间倒流(真实bug，见test/calc.test.js BUG-3回归用例)。
  // 归到今天的语义也是对的：逾期的钱今天就该还，投影上按"立即偿还"处理，图上表现为起点处的
  // 一个陡降(此时会有两个日期同为今天的点，一个是起始余额、一个是扣掉逾期后的余额，这是刻意的)。
  // 日期缺失/格式不对的行同样归到今天，保证"最后一个点归零"这个不变量不被破坏。
  var byDate = {}, todayKey = fmtDate(today0());
  active.forEach(function (d) {
    (d.plan || []).forEach(function (r) {
      if (r.paid) return;
      var dt = /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") && r.date >= todayKey ? r.date : todayKey;
      byDate[dt] = (byDate[dt] || 0) + (+r.principal || 0);
    });
  });
  var dates = Object.keys(byDate).sort();
  var timeline = [{ date: fmtDate(today0()), balance: r2(totalBalance) }], running = totalBalance;
  dates.forEach(function (dt) { running = Math.max(0, running - byDate[dt]); timeline.push({ date: dt, balance: r2(running) }); });
  return { active: active, totalBalance: r2(totalBalance), avgRate: totalBalance > 0 ? weightedRate / totalBalance : 0, payoffDate: payoffDate, byName: byName, typeList: typeList, timeline: timeline };
}

// ===== 文本转换：HTML转义 + 极简markdown渲染器 =====
// 都是纯字符串输入输出，不碰DOM——档案库预览用mdToHtml把.md文件内容转成HTML字符串，
// 再由index.html里的调用方自己塞进innerHTML；这里只管"文本转文本"这一步。
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inline(s) { s = esc(s); s = s.replace(/`([^`]+)`/g, "<code>$1</code>"); s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); s = s.replace(/\[\[([^\]]+)\]\]/g, "<em>$1</em>"); s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1"); return s; }
function isHr(l) { return /^[-=─═_*]{3,}$/.test(l.replace(/\s/g, "")); }
function mdToHtml(src) {
  var lines = src.replace(/\r/g, "").split("\n"), out = [], i = 0;
  while (i < lines.length) {
    var t = lines[i].trim();
    if (t === "") { i++; continue; }
    if (/^```/.test(t)) { i++; var code = []; while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(esc(lines[i])); i++; } i++; out.push('<pre class="md-pre">' + code.join("\n") + "</pre>"); continue; }
    var h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { var lv = Math.min(h[1].length + 1, 6); out.push("<h" + lv + ">" + inline(h[2]) + "</h" + lv + ">"); i++; continue; }
    if (isHr(t)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(t)) { var q = []; while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(inline(lines[i].trim().replace(/^>\s?/, ""))); i++; } out.push("<blockquote>" + q.join("<br>") + "</blockquote>"); continue; }
    if (/^\|.*\|/.test(t) && i + 1 < lines.length && /-/.test(lines[i + 1]) && /^[\s|:-]+$/.test(lines[i + 1].trim())) {
      var cut = function (row) { var c = row.trim().split("|"); if (c[0] === "") c.shift(); if (c.length && c[c.length - 1] === "") c.pop(); return c.map(function (x) { return x.trim(); }); };
      var head = cut(t); i += 2; var rows = []; while (i < lines.length && /^\|.*\|/.test(lines[i].trim())) { rows.push(cut(lines[i])); i++; }
      var th = "<tr>" + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr>";
      var tb = rows.map(function (rr) { return "<tr>" + rr.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("");
      out.push('<div class="md-tbl"><table>' + th + tb + "</table></div>"); continue;
    }
    if (/^[-*]\s+/.test(t)) { var items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push("<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>"); i++; } out.push("<ul>" + items.join("") + "</ul>"); continue; }
    if (/^\d+\.\s+/.test(t)) { var oi = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { oi.push("<li>" + inline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>"); i++; } out.push("<ol>" + oi.join("") + "</ol>"); continue; }
    var para = []; while (i < lines.length) { var lt = lines[i].trim(); if (lt === "" || /^(#{1,6})\s/.test(lt) || /^[-*]\s/.test(lt) || /^\d+\.\s/.test(lt) || /^>\s?/.test(lt) || /^```/.test(lt) || isHr(lt)) break; para.push(inline(lt)); i++; }
    if (para.length) out.push("<p>" + para.join("<br>") + "</p>");
  }
  return out.join("\n");
}
// 在还债务主页hero/KPI的聚合数字：从 renderSummary() 内联的聚合逻辑抽出来的纯函数——
// vanilla侧renderSummary()本身已经在React迁移里被删除，抽出来纯粹是为了给React组件复用，
// 避免同一份"total/monthly/paidPrincipal/paidInterest累加"逻辑在两处各写一份、以后改一处忘了改另一处。
//
// ⚠️口径：**已还本金/已还利息算全量（含已结清债务），其余字段只算在还债务**。这两个口径混在
// 同一个函数里看着别扭，但它们回答的是两个不同的问题：`total`/`monthly`/`active`是"我现在还欠
// 多少、每月要还多少"（只跟在还债务有关），`paidPrincipal`/`paidInterest`/`pct`是"我一共已经
// 还掉了多少"（是累计成就，已结清的债务恰恰是其中最大的一块）。
//
// 这里曾经是"已还本金也只算在还债务"，是一个真实的、用户报过的bug：一笔债务销掉最后一期→
// 自动变成已结清→它已还的那部分本金被整个踢出统计，表现为"刚还完一笔钱，已还金额纹丝不动，
// 过一会儿点了'恢复'它自己又涨回来了"；更糟的是`pct`（归零进度条）用同一份数字，意味着
// **每还清一笔债务，进度条会往回缩**。当时"债务"tab的口径说明footnote里写着"两者都不含已结清
// 的债务"试图解释这个行为，但真实用户不会读footnote，只会看到数字往回跳——文档解释不了的
// 反直觉行为就是bug，不是特性。
// 2026-07-29修正时曾短暂存在过一个只给"统计"tab用的`summarizeAllTime()`，后来确认两个tab都
// 该用累计口径，就合并回这一个函数了，不留两份只差一点的实现。
function summarizeDebts(debts) {
  var total = 0, monthly = 0, active = 0, settled = 0, paidPrincipal = 0, paidInterest = 0;
  debts.forEach(function (d) {
    paidPrincipal += +d.paidPrincipal || 0; paidInterest += +d.paidInterest || 0;
    if (d.settled) { settled++; return; }
    active++; total += +d.balance || 0; if (!d.oneTime) monthly += +d.monthly || 0;
  });
  var zeroBase = paidPrincipal + total, pct = zeroBase > 0 ? Math.round(paidPrincipal / zeroBase * 100) : 0;
  return { total: r2(total), monthly: r2(monthly), active: active, settled: settled, paidPrincipal: r2(paidPrincipal), paidInterest: r2(paidInterest), pct: pct };
}

// 统计tab"月还款统计"图用的月度聚合：按 plan 里每一期的 date 所在月份分组，拆已还(actual)/
// 待还(scheduled)。故意不塞进 computeReportData() 的返回对象——那个对象被 exportReportXlsx/
// exportReportPdf（100% vanilla）按字段名精确解构，改形状会同时打断两个导出功能，新维度必须
// 独立成新函数。不按 active 过滤，已结清债务的历史已还记录仍要计入对应月份，否则一笔债务结清
// 的瞬间会让过去月份的柱子突然变矮。用 amount（本金+利息合计）不是 principal——这张图回答
// "当月要还多少钱"，不是负债本金变化。月份序列在 min~max 之间按月连续补齐，没数据的月份补0，
// 避免看起来像数据缺失。
function computeMonthlyRepayment(debts) {
  var byMonth = {};
  debts.forEach(function (d) {
    (d.plan || []).forEach(function (r) {
      var m = (r.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return;
      if (!byMonth[m]) byMonth[m] = { actual: 0, scheduled: 0 };
      if (r.paid) byMonth[m].actual += (+r.amount || 0);
      else byMonth[m].scheduled += (+r.amount || 0);
    });
  });
  var keys = Object.keys(byMonth).sort();
  if (!keys.length) return [];
  var out = [], y = +keys[0].slice(0, 4), mo = +keys[0].slice(5, 7), endKey = keys[keys.length - 1], cur = keys[0];
  while (cur <= endKey) {
    var b = byMonth[cur] || { actual: 0, scheduled: 0 };
    out.push({ month: cur, actual: r2(b.actual), scheduled: r2(b.scheduled) });
    mo++; if (mo > 12) { mo = 1; y++; }
    cur = y + "-" + pad(mo);
  }
  return out;
}

// 统计tab"未来N个月还款压力"柱状图的数据源(替代 computeMonthlyRepayment 上首页的位置)。
// 跟 computeMonthlyRepayment 的三处关键区别，每一处都是针对已确认问题的修正：
//   1. 按 active 过滤——settleFull()只写settled=true、不标记plan为已还，那些剩余期次仍是
//      {paid:false}，旧函数不过滤会把它们算成"待还"，表现为"已经结清的债务，未来几个月还显示
//      要还钱"(真实bug，见test/calc.test.js BUG-1回归用例)。
//   2. 逾期未销的期次(date < 今天)单独进 overdue 桶，不混进未来月份——"已经错过"和"即将要还"
//      是两件事，混在一起会让"本月待还"虚高，也让柱状图第一根柱子含义不清。这跟"还款日"tab
//      把逾期单独分档(dueBucket)是同一个判断。
//   3. 窗口从"当前月"开始固定N个月，不是从数据最早月铺到最晚月——这张图回答的是"接下来的
//      还款压力"，历史月份不属于它的职责(要看历史去月还款明细/导出)。
// 拆 principal/interest 两段：PlanRow这两个字段对amort/equalfee/interestfirst三种生成方式都
// 可靠；手续费没有独立字段(equalfee的pf直接写进interest)，所以只做两段、不做"本金/利息/手续费"
// 三段——宁可少一个维度，也不为了图表复杂度制造不可信数据。
// today参数只为可测(默认取today0())，调用方正常不传。
function computeUpcomingPressure(debts, monthsAhead, today) {
  var n = monthsAhead > 0 ? monthsAhead : 12;
  var t0 = today ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : today0();
  var todayKey = fmtDate(t0);
  var overdue = { amount: 0, principal: 0, interest: 0, count: 0 };
  var buckets = {}, order = [], y = t0.getFullYear(), mo = t0.getMonth() + 1;
  for (var k = 0; k < n; k++) {
    var key = y + "-" + pad(mo);
    buckets[key] = { month: key, principal: 0, interest: 0, total: 0, items: [] };
    order.push(key);
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  var lastKey = order[order.length - 1];
  debts.forEach(function (d) {
    if (d.settled) return;
    (d.plan || []).forEach(function (r) {
      if (r.paid) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) return;
      var amt = +r.amount || 0, pr = +r.principal || 0, it = +r.interest || 0;
      if (r.date < todayKey) {
        overdue.amount = r2(overdue.amount + amt); overdue.principal = r2(overdue.principal + pr);
        overdue.interest = r2(overdue.interest + it); overdue.count++;
        return;
      }
      var b = buckets[r.date.slice(0, 7)];
      if (!b) return; // 超出N个月窗口
      b.principal = r2(b.principal + pr); b.interest = r2(b.interest + it); b.total = r2(b.total + amt);
      var hit = null;
      for (var j = 0; j < b.items.length; j++) if (b.items[j].id === d.id) { hit = b.items[j]; break; }
      if (hit) hit.amount = r2(hit.amount + amt);
      else b.items.push({ id: d.id, name: d.name || "未命名", amount: r2(amt) });
    });
  });
  var months = order.map(function (key) { return buckets[key]; });
  months.forEach(function (m) { m.items.sort(function (a, b) { return b.amount - a.amount; }); });
  var totalAhead = r2(months.reduce(function (s, m) { return s + m.total; }, 0));
  var peak = null;
  months.forEach(function (m) { if (m.total > 0 && (!peak || m.total > peak.total)) peak = { month: m.month, total: m.total }; });
  return {
    overdue: overdue, months: months, currentMonth: order[0],
    totalAhead: totalAhead, monthlyAvg: r2(totalAhead / n), peak: peak
  };
}

// 一笔债务按现有还款计划"还到底还要再付多少利息/手续费"——未还期次的 interest 之和。
// 统计tab用在两个地方：BalanceBars 的"按剩余利息排序"、以及底部总结卡的"剩余待付利息"合计。
// ⚠️这个数字对 amort/equalfee/interestfirst 三种生成方式都可靠(它们都会逐期写 interest)，
// 但"自定义"计划如果用户只填了金额、没拆本金/利息，interest 会是0 → 这笔债务的剩余利息被
// 低估成0。这是数据本身的缺口不是算错，UI上要按"可能偏低"来措辞，不能当成精确值展示。
function remainingInterest(d) {
  var s = 0;
  (d.plan || []).forEach(function (r) { if (!r.paid) s += +r.interest || 0; });
  return r2(s);
}

// 会员判断：原来直接读闭包变量 premium，改成显式传参（跟 detectMatchingSort/computeReportData
// 参数化的道理一样）。premium 的形状是 {premium: {method, at} | null}，见 index.html 里 PREMIUM_KEY
// 的注释——这里不重新解释那份数据模型，只是把判断逻辑本身搬出来。
function hasPremium(premium) { return !!(premium && premium.premium); }
function premiumLabel(premium) { return hasPremium(premium) ? "Premium 会员" : null; }

// AI历史对话列表操作：原来直接读/改闭包变量 aiConvos，改成显式传参。bumpAiConvTop 会原地
// 修改传入的数组(splice+unshift)，不是没有副作用的纯函数，但副作用只作用于传入的参数本身
// (不碰任何模块级/DOM状态)，行为跟 Array.prototype.sort 这类原地方法是同一类，一样可以
// 用"调用后检查数组"的方式单测。
function findAiConv(aiConvos, id) { for (var i = 0; i < aiConvos.length; i++) if (aiConvos[i].id === id) return aiConvos[i]; return null; }
function bumpAiConvTop(aiConvos, rec) { var idx = aiConvos.indexOf(rec); if (idx > 0) { aiConvos.splice(idx, 1); aiConvos.unshift(rec); } }

// escSvg跟esc实现内容目前相同，但是两个独立的调用点（esc给markdown渲染用，escSvg给
// PDF导出的SVG图表文字用）——保留成两个名字，不合并，避免这次搬运顺带改变调用方式。
function escSvg(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
// 图表Y轴刻度取整到"好看数字"——否则刻度会是 ¥1,733 这种没法快速心算的值。档位表要够细：
// 只有 1/2/2.5/5/10 的话，最大值2,760会被抬到5,000，最高的柱子只有半格高，白白浪费一半画布；
// 加上1.5/3/4/6/8之后落到3,000，且这些档位的一半(1.5k/2k/3k/4k)都还是整数，中间那条刻度线
// 不会出现1,250这种零头。PressureChart(柱状)和PayoffLine(折线)共用这一份。
var NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceCeil(v) {
  if (!(v > 0)) return 0;
  var mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
  for (var i = 0; i < NICE_STEPS.length; i++) if (n <= NICE_STEPS[i]) return NICE_STEPS[i] * mag;
  return 10 * mag;
}

// 报表图表/PDF导出用来截断过长的债务名/标签，后面补"…"。
function truncateLabel(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    clone: clone, r2: r2, fmt: fmt, money: money, todayStr: todayStr, baseName: baseName, extOf: extOf,
    pad: pad, parseDate: parseDate, addMonths: addMonths, fmtDate: fmtDate, today0: today0,
    rateClass: rateClass, isActive: isActive, genPlan: genPlan, npv: npv, impliedAPR: impliedAPR,
    recompute: recompute, markPaidThrough: markPaidThrough, normalize: normalize, genDebtId: genDebtId,
    amortForward: amortForward, simulatePrepay: simulatePrepay, detectMatchingSort: detectMatchingSort,
    urgencyTier: urgencyTier, relLabel: relLabel, dueBucket: dueBucket,
    isBadRepeatDay: isBadRepeatDay, offsetLabel: offsetLabel, computeReportData: computeReportData, summarizeDebts: summarizeDebts,
    computeMonthlyRepayment: computeMonthlyRepayment, computeUpcomingPressure: computeUpcomingPressure,
    remainingInterest: remainingInterest, niceCeil: niceCeil,
    esc: esc, inline: inline, isHr: isHr, mdToHtml: mdToHtml, escSvg: escSvg, truncateLabel: truncateLabel,
    hasPremium: hasPremium, premiumLabel: premiumLabel, findAiConv: findAiConv, bumpAiConvTop: bumpAiConvTop
  };
}
