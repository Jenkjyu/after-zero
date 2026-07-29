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

// 一期"利息优先"分摊一笔实付金额：先冲抵这期的利息，剩下的才冲本金——银行/信用卡账单的
// 通行做法，也是这个项目"部分还款"(已知的数据模型缺口④)的分摊规则。cap本金部分不超过
// principal，避免paidAmt异常(比如超过amount)时算出负数或超额。
function splitPaidInterestFirst(principal, interest, paidAmt) {
  var interestPart = Math.min(paidAmt, interest);
  var principalPart = Math.min(principal, Math.max(0, paidAmt - interest));
  return { principal: r2(principalPart), interest: r2(interestPart) };
}
// 这一期还欠多少钱——部分还款还没还完时，"应还金额"要扣掉已经攒的那部分；一分没还过就是
// 全额。UI(详情窗/销这期弹窗)用这个而不是直接读r.amount，否则部分还款之后再打开还是显示
// 全额，跟"剩余待还"这个总数对不上。
function rowRemaining(r) {
  return r2((+r.amount || 0) - (+r.paidAmount || 0));
}

function recompute(d) {
  var plan = d.plan || [];
  var borrow = 0, remaining = 0, paidCount = 0, paidPrincipal = 0, paidInterest = 0;
  plan.forEach(function (r) {
    borrow += +r.principal || 0;
    if (r.paid) {
      // 正常情况(没有部分还款痕迹、或paidAmount已经达到amount)：按计划全额算，跟老逻辑
      // 完全一致，老数据(没有paidAmount字段)也走这条分支。只有"协商减免"关闭的期次
      // (paidAmount显式存在且小于amount，见下面waivePeriod())才按实际收到的钱做利息优先
      // 分摊——principal/interest这两个字段本身永远不改(那是原计划，d.original/年化利率
      // 要用)，只是"算作已还了多少"改用真实收到的钱，不能当成收满了，否则"已还利息"会
      // 显示一笔从没真正发生过的钱，跟当年"提前结清"改口径是同一类问题。
      if (r.paidAmount != null && r.paidAmount < r.amount - 0.005) {
        var wsplit = splitPaidInterestFirst(+r.principal || 0, +r.interest || 0, +r.paidAmount || 0);
        paidCount++; paidPrincipal += wsplit.principal; paidInterest += wsplit.interest;
      } else {
        paidCount++; paidPrincipal += +r.principal || 0; paidInterest += +r.interest || 0;
      }
    } else if (r.paidAmount) {
      // 还没还完，但已经攒了部分还款(见下面recordPayment())：利息优先算出这部分钱冲抵了
      // 多少本金，"已还本金/利息"要把这部分计进去、"剩余待还"本金相应减少——不然钱已经
      // 付出去了，"已还"这个数字却纹丝不动，直到这期整个还清才跳一下，是反直觉的口径。
      var psplit = splitPaidInterestFirst(+r.principal || 0, +r.interest || 0, +r.paidAmount || 0);
      paidPrincipal += psplit.principal; paidInterest += psplit.interest;
      remaining += r2((+r.principal || 0) - psplit.principal);
    } else {
      remaining += +r.principal || 0;
    }
  });
  d.original = plan.length ? r2(borrow) : null;
  d.balance = r2(remaining);
  d.paidPrincipal = r2(paidPrincipal);
  d.paidInterest = r2(paidInterest);
  d.totalTerms = plan.length; d.paidTerms = paidCount; d.terms = plan.length - paidCount;
  var next = null; for (var k = 0; k < plan.length; k++) { if (!plan[k].paid) { next = plan[k]; break; } }
  d.monthly = next ? (+next.amount || 0) : 0;
  d.nextDate = next ? next.date : null;
  // 提前结清过的债务(见下面applySettle)：年化要用"原始完整计划"(已还期次 + 快照里被收走的
  // 剩余期次)反推，不能用当前这份带结清行的plan——结清行是一笔大额一次性支付，混进IRR会
  // 算出一个跟这笔债务原本利率毫无关系的数字，详情页上会显示成一个明显错误的年化。
  // 这样写还有个好处：它是从d自己的字段推出来的，每次reload重新recompute都能自愈，
  // 不需要把"结清前的利率"另存一个字段再想办法保持同步。
  var ratePlan = plan;
  if (d.settleStash && d.settleStash.length) {
    ratePlan = plan.filter(function (r) { return !r.settleRow; }).concat(d.settleStash);
  }
  d.rate = impliedAPR(ratePlan);
}

// ===== 提前结清 / 撤销结清 =====
// ⚠️这里刻意**不是**"把每一期都打勾已还"。那个做法有个死结：未来那些期原本的利息会被
// 算进d.paidInterest，而提前结清现实中恰恰是免掉未来利息的——统计页会显示你多付了一笔
// 根本没发生的利息。改成把它记成一次真实发生的还款事件：剩余未还期次整体移进d.settleStash，
// plan末尾追加一条 {principal: 剩余本金P, interest: 实付X - P} 的结清行(settleRow:true)。
// · 已还本金 +P —— 这P确实被还掉了，归零进度该往前走
// · 已还利息 +(X-P) —— X>P 是多付的手续费/违约金；X<P 是协商减免，记**负数**，
//   这样"本金+利息"两栏加起来恰好等于真实付出去的X，总账不会对不上
// · 详情页的还款计划表一眼看得出"这笔是被一次性结清掉的、花了多少钱"，而不是伪装成每期
//   都按原计划按时还了(那是往用户自己的账里写假数据)
// undoSettle()把快照原样放回、删掉结清行，完全回到结清前那一刻，一期不多一期不少。
// todayString是**计划行格式**的日期("YYYY-MM-DD")，因为它要当成plan里一条真实期次的date
// 用；而d.settledDate沿用的是已结清列表一直在显示的短格式("M/D"，payInstallment那条
// 自动结清路径用的todayStr()就是这个格式)，这里从todayString切出来而不是再传一个参数，
// 保证两者永远指向同一天、也不会让调用方有机会传成两个不同的日子。
// shortDateFromISO()是这条切法的公共提取——applySettle/recordPayment/waivePeriod三处
// 都要从"YYYY-MM-DD"切出"M/D"给d.settledDate用，避免三份重复的slice代码写岔。
function shortDateFromISO(iso) { return (+iso.slice(5, 7)) + "/" + (+iso.slice(8, 10)); }
function applySettle(d, paidAmount, todayString) {
  var plan = d.plan || [];
  var kept = [], stash = [], remainP = 0;
  plan.forEach(function (r) {
    if (r.paid) kept.push(r);
    else { stash.push(r); remainP += +r.principal || 0; }
  });
  if (!stash.length) return false;
  remainP = r2(remainP);
  var x = r2(paidAmount);
  kept.push({ date: todayString, amount: x, principal: remainP, interest: r2(x - remainP), paid: true, settleRow: true });
  d.settleStash = stash;
  d.plan = kept;
  d.settled = true;
  d.settledDate = shortDateFromISO(todayString);
  recompute(d);
  return true;
}
function undoSettle(d) {
  var plan = d.plan || [];
  d.settled = false;
  d.settledDate = "";
  if (d.settleStash && d.settleStash.length) {
    d.plan = plan.filter(function (r) { return !r.settleRow; }).concat(d.settleStash);
    delete d.settleStash;
  } else {
    // 另一条结清路径：销掉最后一期后plan全部paid、d.terms归0，debt被自动标记成已结清。
    // 这种情况下只清settled标记会留下一条"每期都已还、剩余待还¥0"的僵尸债务挂在在还列表里
    // (真机实测到的bug)——"恢复"的语义是撤销"让它结清的那一步"，所以最后一期的已还标记
    // 也要一并释放，让它回到"还剩1期没还"的状态。paidAt/paidAmount也要一并清掉(见下面
    // recordPayment())——"恢复"是撤销这一步付款事件，不能留下"这期还标着实付日期/部分
    // 还款金额，但又不算已还"这种自相矛盾的中间态。
    var hasUnpaid = plan.some(function (r) { return !r.paid; });
    if (!hasUnpaid && plan.length) {
      var last = plan[plan.length - 1];
      last.paid = false;
      delete last.paidAt;
      delete last.paidAmount;
    }
  }
  recompute(d);
}

// ===== 部分还款（已知的数据模型缺口④）=====
// 现实里"少还一点、拖几天补齐"很常见，但`payInstallment`原来只能整期打勾。这两个函数是
// "销这期"(recordPayment)和详情窗新增的"协商减免"(waivePeriod)背后的数据变换，都只操作
// 债务当前最早的未还期次(销这期一直遵守"只能销最早那期"这条规则，见"还款日"一节)。
// principal/interest这两个字段本身永远不改(那是原计划)，"利息优先"分摊的算法在recompute()
// 里，这两个函数只负责写paidAmount/paid/paidAt。
//
// recordPayment：这次还的钱不够这期(cumulative<amount，容差0.005)就只累加paidAmount、这期
// 继续留在未还列表里，可以之后再调一次继续补(对应"拖几天补齐")；够了就跟老的payInstallment
// 行为一致——标paid=true、盖paidAt、paidAmount封顶在amount(多付的部分不结转到下一期，
// 想抵下一期的话得用户自己去改那一期的数据)。返回null表示这笔债务已经没有未还期次。
function recordPayment(d, amount, todayString) {
  var plan = d.plan || [], idx = -1;
  for (var k = 0; k < plan.length; k++) { if (!plan[k].paid) { idx = k; break; } }
  if (idx < 0) return null;
  var r = plan[idx];
  var x = r2(+amount || 0);
  var cumulative = r2((+r.paidAmount || 0) + x);
  if (cumulative >= r.amount - 0.005) {
    r.paidAmount = r.amount;
    r.paid = true;
    r.paidAt = todayString;
    recompute(d);
    if (d.terms <= 0) { d.settled = true; d.settledDate = shortDateFromISO(todayString); }
    return { idx: idx, full: true };
  }
  r.paidAmount = cumulative;
  recompute(d);
  return { idx: idx, full: false, remaining: r2(r.amount - cumulative) };
}
// waivePeriod：协商减免——不管实付多少，强制把当前最早的未还期次标记为已还，差额自动通过
// recompute()的利息优先分摊算成"少还的那部分"(不会凭空多算一笔从没发生过的已还)。
// 跟applySettle()"如实记录真实付款、差额算减免"是同一个思路，只是范围从整笔债务缩小到一期。
function waivePeriod(d, amount, todayString) {
  var plan = d.plan || [], idx = -1;
  for (var k = 0; k < plan.length; k++) { if (!plan[k].paid) { idx = k; break; } }
  if (idx < 0) return null;
  var r = plan[idx];
  r.paidAmount = r2(Math.max(0, +amount || 0));
  r.paid = true;
  r.paidAt = todayString;
  recompute(d);
  if (d.terms <= 0) { d.settled = true; d.settledDate = shortDateFromISO(todayString); }
  return { idx: idx };
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
      // 部分还款(已知的数据模型缺口④)——已经攒了钱的期次，这张图回答"接下来还欠多少"，
      // 不能还按整期的原始金额算，否则会虚高。利息优先分摊跟recompute()同一套算法，
      // amt用rowRemaining()(=amount-paidAmount)而不是重新拿pr+it相加——保留"amount是
      // 独立填写的一条轴"这个既有假设，不跟"amount应该等于principal+interest"这条(另一个
      // 已知缺口⑤，读CLAUDE.md)绑在一起。
      if (r.paidAmount) {
        var pSplit = splitPaidInterestFirst(pr, it, +r.paidAmount || 0);
        pr = r2(pr - pSplit.principal); it = r2(it - pSplit.interest);
        amt = rowRemaining(r);
      }
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

// "未来还款压力"图要铺多少个月——铺到最后一笔未还期次所在的那个月为止。
// 下限12个月：窗口太短会让图退化成两三根柱子，看不出"哪个月最难过"这件事。
// 上限60个月(5年)：再长横向滚动也没人看得完，而且这个App记的债务基本都在5年内；
// 真有超过5年的，前60个月已经足够回答"接下来哪段时间最紧"这个问题。
// 逾期期次(日期已经在今天之前)不参与——它们在图里是单独一条提示行，不占月份桶。
function pressureWindowMonths(debts, today) {
  var t0 = today ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : today0();
  var todayKey = fmtDate(t0), last = null;
  (debts || []).forEach(function (d) {
    if (d.settled) return;
    (d.plan || []).forEach(function (r) {
      if (r.paid) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) return;
      if (r.date < todayKey) return;
      if (!last || r.date > last) last = r.date;
    });
  });
  if (!last) return 12;
  var n = (+last.slice(0, 4) - t0.getFullYear()) * 12 + (+last.slice(5, 7) - (t0.getMonth() + 1)) + 1;
  return Math.max(12, Math.min(60, n));
}

// ===== 还款提醒调度（纯计算部分） =====
// syncNotifications()真正调用LocalNotifications插件(getPending/cancel/schedule)的部分留在
// index.html——那是impure的原生插件调用。"该给哪些期次排哪些提醒"这一步是纯计算，可以单测，
// 搬到这里。这是CLAUDE.md"已知的数据模型缺口①"的修复：早期syncNotifications只读d.nextDate
// (每笔债务的下一期)，靠打开App触发renderAll()重排才能滚动到下一期——两个月不开App，后面
// 几期的提醒全部收不到，而"还款提醒"这个功能恰恰是给不常开App的人设计的。
// 现在改成一次性把"未来windowMonths个月内"全部未还期次都排上，不再依赖"重新打开App"这个动作。
// 窗口给6个月：太短跟原来的bug没本质区别，太长会让待触发闹钟堆积——安卓AlarmManager对单个UID
// 的待触发闹钟数有一个约500个的隐性上限(AOSP源码里的常量，没写进公开文档)，maxCount兜底截断，
// 按触发时间升序保留最近的那些——离现在越近的提醒越要紧，宁可丢远期的，反正下次同步(任何一次
// saveAll();renderAll();)它又会被重新排进来。
function computeNotifySchedule(debts, notify, now, windowMonths, maxCount) {
  var list = [];
  if (!notify || !notify.enabled || !notify.rules || !notify.rules.length) return list;
  var n = windowMonths > 0 ? windowMonths : 6;
  var cap = maxCount > 0 ? maxCount : 450;
  var t0 = now ? new Date(now) : new Date();
  var cutoffKey = fmtDate(addMonths(today0(), n));
  (debts || []).forEach(function (d) {
    if (d.settled) return;
    (d.plan || []).forEach(function (r) {
      if (r.paid) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) return;
      if (r.date > cutoffKey) return;
      var due = parseDate(r.date);
      notify.rules.forEach(function (rule) {
        var fire = new Date(due.getFullYear(), due.getMonth(), due.getDate() - (+rule.offsetDays || 0));
        var hm = String(rule.time || "09:00").split(":");
        fire.setHours(+hm[0] || 0, +hm[1] || 0, 0, 0);
        if (fire.getTime() <= t0.getTime()) return; // 只排未来的
        list.push({ name: d.name || "", date: r.date, amount: +r.amount || 0, fireAt: fire });
      });
    });
  });
  list.sort(function (a, b) { return a.fireAt.getTime() - b.fireAt.getTime(); });
  if (list.length > cap) list = list.slice(0, cap);
  return list;
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
    applySettle: applySettle, undoSettle: undoSettle, shortDateFromISO: shortDateFromISO,
    rowRemaining: rowRemaining, recordPayment: recordPayment, waivePeriod: waivePeriod,
    amortForward: amortForward, simulatePrepay: simulatePrepay, detectMatchingSort: detectMatchingSort,
    urgencyTier: urgencyTier, relLabel: relLabel, dueBucket: dueBucket,
    isBadRepeatDay: isBadRepeatDay, offsetLabel: offsetLabel, computeReportData: computeReportData, summarizeDebts: summarizeDebts,
    computeMonthlyRepayment: computeMonthlyRepayment, computeUpcomingPressure: computeUpcomingPressure,
    remainingInterest: remainingInterest, niceCeil: niceCeil, pressureWindowMonths: pressureWindowMonths,
    computeNotifySchedule: computeNotifySchedule,
    esc: esc, inline: inline, isHr: isHr, mdToHtml: mdToHtml, escSvg: escSvg, truncateLabel: truncateLabel,
    hasPremium: hasPremium, premiumLabel: premiumLabel, findAiConv: findAiConv, bumpAiConvTop: bumpAiConvTop
  };
}
