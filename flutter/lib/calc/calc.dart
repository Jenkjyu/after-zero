// After Zero —— 纯计算函数，从 www/js/calc.js 逐个移植过来的Dart版本（Flutter重写阶段1）。
//
// 设计取舍：这一层故意还是用 Map<String, dynamic>（对应JS的普通object）而不是强类型的
// Debt/PlanRow类——阶段1的目标是"跟calc.js行为完全对等，用现有test/calc.test.js当标准
// 答案"，真正的数据模型（阶段2）会在这之上再包一层类型安全的类。用Map保持这一步的翻译
// 尽量字面、逐行可对照，减少翻译过程中引入新bug的风险；等阶段2定了Debt/PlanRow的形状后，
// 再决定是把这层整个替换掉还是在外面包一层类型安全的适配器。
//
// 顶层函数（不是某个类的静态方法）是刻意的选择——这是Dart库文件的原生写法，跟calc.js
// "普通<script>里的顶层function声明"是同一种"直接暴露一堆函数，不用额外包装"的思路，
// 只是Dart的library机制天然比JS的全局作用域更干净（不会污染任何全局命名空间）。
//
// ⚠️JS的Math.round()和Dart的num.round()在"整数.5"这个边界上的舍入方向不同（JS永远向
// +Infinity取整，Dart的round()向远离0的方向取整）——两者在浮点数表示误差下大多数情况碰
// 不到这个边界，但money calculation必须精确复现JS的行为，所以_jsRound()没有用Dart内置的
// round()，是手写的floor(x+0.5)，这正是ECMA规范里Math.round的定义式，两种语言都是IEEE754
// 双精度浮点，同样的算式在两边算出的是逐位相同的结果。
library;

import 'dart:convert';
import 'dart:math' as math;

double _jsRound(double x) => (x + 0.5).floorToDouble();

num _num(dynamic x) {
  if (x == null) return 0;
  if (x is num) return x.isNaN ? 0 : x;
  if (x is String) {
    final v = num.tryParse(x.trim());
    return v ?? 0;
  }
  return 0;
}

String _pad2(int n) => n < 10 ? '0$n' : '$n';

String _groupThousands(String digits) {
  final buf = StringBuffer();
  final n = digits.length;
  for (var i = 0; i < n; i++) {
    if (i > 0 && (n - i) % 3 == 0) buf.write(',');
    buf.write(digits[i]);
  }
  return buf.toString();
}

/// JSON往返深拷贝——跟 clone() 的JS实现（JSON.parse(JSON.stringify(x))）是同一个技巧。
dynamic clone(dynamic x) => jsonDecode(jsonEncode(x));

/// 四舍五入到分（跟着JS Math.round的取整方向，见文件顶部注释）。
double r2(dynamic x) => _jsRound(_num(x).toDouble() * 100) / 100;

/// 取整+千分位（不保留小数）。
String fmt(dynamic n) {
  final v = _jsRound(_num(n).toDouble());
  final neg = v < 0;
  final intPart = v.abs().toInt().toString();
  return (neg ? '-' : '') + _groupThousands(intPart);
}

/// 保留两位小数+千分位。
String money(dynamic n) {
  final v = _num(n).toDouble();
  final neg = v < 0;
  final cents = _jsRound(v.abs() * 100).toInt();
  final intPart = (cents ~/ 100).toString();
  final fracPart = (cents % 100).toString().padLeft(2, '0');
  return '${neg ? '-' : ''}${_groupThousands(intPart)}.$fracPart';
}

/// "M/D"格式的今天日期（已结清列表用的短格式）。
String todayStr() {
  final d = DateTime.now();
  return '${d.month}/${d.day}';
}

String baseName(String? p) {
  final s = p ?? '';
  final parts = s.split('/');
  return parts.isEmpty ? '' : parts.last;
}

String extOf(String? name) {
  final s = name ?? '';
  final m = RegExp(r'\.([a-z0-9]+)$', caseSensitive: false).firstMatch(s);
  return m == null ? '' : m.group(1)!.toLowerCase();
}

String pad(int n) => _pad2(n);

/// "YYYY-MM-DD" -> DateTime（本地时区午夜）。⚠️Dart的DateTime.month本来就是1-based，
/// 不用像JS那样再手动-1（JS的Date构造函数月份是0-based，calc.js里 `(+p[1])-1` 那个-1
/// 是专门做这个转换的，Dart这边直接用解析出来的月份数字即可）。
DateTime? parseDate(String? s) {
  if (s == null || s.isEmpty) return null;
  final p = s.split('-');
  if (p.length < 3) return null;
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

/// 月份加减——Dart的DateTime构造函数对月份/日期溢出的归一化行为跟JS的Date构造函数逐位
/// 一致（比如2月31号会自动进位成3月2/3号），已经用真实脚本验证过，不需要手动特殊处理。
DateTime addMonths(DateTime d, int m) => DateTime(d.year, d.month + m, d.day);

String fmtDate(DateTime d) => '${d.year}-${_pad2(d.month)}-${_pad2(d.day)}';

DateTime today0() {
  final t = DateTime.now();
  return DateTime(t.year, t.month, t.day);
}

String rateClass(num r) =>
    r >= 18 ? 'rate-hi' : (r >= 10 ? 'rate-mid' : 'rate-lo');

bool isActive(Map<String, dynamic> d) => d['settled'] != true;

// ===== plan generation =====

Map<String, dynamic> _row(
  DateTime start,
  int k,
  num amount,
  num principal,
  num interest,
) => {
  'date': fmtDate(addMonths(start, k)),
  'amount': r2(amount),
  'principal': r2(principal),
  'interest': r2(interest),
  'paid': false,
};

/// genPlan——⚠️三个"分期摊销"分支(amort/equalprincipal/interestfirst的还本阶段)都有同一个
/// 隐患，必须统一按同一个规则处理，缺一半都不够（完整原理见calc.js同名函数的长注释，这里
/// 只搬运结论，不重复整段推导）：
/// ①每期本金在"非最后一期"要先r2()四舍五入、再用四舍五入后的值去减running balance；
/// ②每期本金都要clamp到"不能超过当前剩余本金"，一旦公式算出的钱比剩下的本金还多，这一期
///   直接收掉剩余全部本金、提前结清，之后每期清爽显示0，不会出现负数。
List<Map<String, dynamic>> genPlan(Map<String, dynamic> spec) {
  final rows = <Map<String, dynamic>>[];
  final start = spec['first'] != null
      ? (parseDate(spec['first'] as String) ?? today0())
      : today0();
  void push(int k, num amount, num principal, num interest) =>
      rows.add(_row(start, k, amount, principal, interest));

  final kind = spec['kind'];
  if (kind == 'amort') {
    final P = _num(spec['P']),
        rate = _num(spec['rate']),
        n = _num(spec['n']).toInt();
    final i = rate / 1200;
    var bal = P;
    final m = i > 0 ? P * i / (1 - math.pow(1 + i, -n)) : (n != 0 ? P / n : 0);
    for (var k = 0; k < n; k++) {
      final it = bal * i;
      final prNom = (k == n - 1) ? bal : r2(m - it);
      final closing = prNom >= bal;
      final pr = closing ? bal : prNom;
      final amt = closing ? bal + it : m;
      bal -= pr;
      push(k, amt, pr, it);
    }
  } else if (kind == 'equalprincipal') {
    final p4 = _num(spec['P']),
        rate4 = _num(spec['rate']),
        n4 = _num(spec['n']).toInt();
    final i4 = rate4 / 1200;
    var bal4 = p4;
    final pr4 = n4 != 0 ? r2(p4 / n4) : 0;
    for (var e4 = 0; e4 < n4; e4++) {
      final it4 = bal4 * i4;
      final prE = (e4 == n4 - 1) ? bal4 : math.min(pr4, bal4);
      final amtE = prE + it4;
      bal4 -= prE;
      push(e4, amtE, prE, it4);
    }
  } else if (kind == 'equalfee') {
    final pp = _num(spec['pp']),
        pf = _num(spec['pf']),
        n2 = _num(spec['n']).toInt();
    for (var j = 0; j < n2; j++) {
      push(j, pp + pf, pp, pf);
    }
  } else if (kind == 'interestfirst') {
    final p3 = _num(spec['P']), rate3 = _num(spec['rate']);
    final ni = _num(spec['ni']).toInt(), np = _num(spec['np']).toInt();
    final i3 = rate3 / 1200;
    final it3 = p3 * i3;
    for (var a = 0; a < ni; a++) {
      push(a, it3, 0, it3);
    }
    final m3 = i3 > 0
        ? p3 * i3 / (1 - math.pow(1 + i3, -np))
        : (np != 0 ? p3 / np : 0);
    var bal3 = p3;
    for (var b = 0; b < np; b++) {
      final itb = bal3 * i3;
      final prNomB = (b == np - 1) ? bal3 : r2(m3 - itb);
      final closingB = prNomB >= bal3;
      final prb = closingB ? bal3 : prNomB;
      final amtb = closingB ? bal3 + itb : m3;
      bal3 -= prb;
      push(ni + b, amtb, prb, itb);
    }
  } else {
    final nc = _num(spec['n']).toInt();
    for (var c = 0; c < nc; c++) {
      push(c, 0, 0, 0);
    }
  }
  return rows;
}

// ===== implied APR from full plan (IRR via bisection) =====

double npv(double r, num borrow, List<Map<String, dynamic>> plan) {
  var s = -borrow.toDouble();
  for (var k = 0; k < plan.length; k++) {
    s += _num(plan[k]['amount']) / math.pow(1 + r, k + 1);
  }
  return s;
}

double impliedAPR(List<Map<String, dynamic>> plan) {
  num borrow = 0;
  for (final p in plan) {
    borrow += _num(p['principal']);
  }
  if (!(borrow > 0) || plan.isEmpty) return 0;
  if (npv(0, borrow, plan) <= 0.0001) return 0;
  var lo = 0.0, hi = 1.0;
  for (var it = 0; it < 90; it++) {
    final mid = (lo + hi) / 2;
    if (npv(mid, borrow, plan) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return r2(((lo + hi) / 2) * 1200);
}

/// 一期"利息优先"分摊一笔实付金额：先冲抵这期的利息，剩下的才冲本金。
Map<String, double> splitPaidInterestFirst(
  num principal,
  num interest,
  num paidAmt,
) {
  final interestPart = math.min(paidAmt, interest);
  final principalPart = math.min(principal, math.max(0, paidAmt - interest));
  return {'principal': r2(principalPart), 'interest': r2(interestPart)};
}

/// 这一期还欠多少钱——部分还款还没还完时，"应还金额"要扣掉已经攒的那部分。
double rowRemaining(Map<String, dynamic> r) =>
    r2(_num(r['amount']) - _num(r['paidAmount']));

void recompute(Map<String, dynamic> d) {
  final plan =
      (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
      <Map<String, dynamic>>[];
  num borrow = 0,
      remaining = 0,
      paidCount = 0,
      paidPrincipal = 0,
      paidInterest = 0;
  for (final r in plan) {
    borrow += _num(r['principal']);
    if (r['paid'] == true) {
      final paidAmount = r['paidAmount'];
      if (paidAmount != null && _num(paidAmount) < _num(r['amount']) - 0.005) {
        final wsplit = splitPaidInterestFirst(
          _num(r['principal']),
          _num(r['interest']),
          _num(paidAmount),
        );
        paidCount++;
        paidPrincipal += wsplit['principal']!;
        paidInterest += wsplit['interest']!;
      } else {
        paidCount++;
        paidPrincipal += _num(r['principal']);
        paidInterest += _num(r['interest']);
      }
    } else if (r['paidAmount'] != null && _num(r['paidAmount']) != 0) {
      final psplit = splitPaidInterestFirst(
        _num(r['principal']),
        _num(r['interest']),
        _num(r['paidAmount']),
      );
      paidPrincipal += psplit['principal']!;
      paidInterest += psplit['interest']!;
      remaining += r2(_num(r['principal']) - psplit['principal']!);
    } else {
      remaining += _num(r['principal']);
    }
  }
  d['original'] = plan.isNotEmpty ? r2(borrow) : null;
  d['balance'] = r2(remaining);
  d['paidPrincipal'] = r2(paidPrincipal);
  d['paidInterest'] = r2(paidInterest);
  d['totalTerms'] = plan.length;
  d['paidTerms'] = paidCount.toInt();
  d['terms'] = plan.length - paidCount.toInt();
  Map<String, dynamic>? next;
  for (final r in plan) {
    if (r['paid'] != true) {
      next = r;
      break;
    }
  }
  d['monthly'] = next != null ? _num(next['amount']) : 0;
  d['nextDate'] = next != null ? next['date'] : null;
  // 提前结清过的债务：年化要用"原始完整计划"(已还期次 + 快照里被收走的剩余期次)反推，
  // 不能用当前这份带结清行的plan——见 applySettle 的注释。
  var ratePlan = plan;
  final stash = (d['settleStash'] as List<dynamic>?)
      ?.cast<Map<String, dynamic>>();
  if (stash != null && stash.isNotEmpty) {
    ratePlan = plan.where((r) => r['settleRow'] != true).toList()
      ..addAll(stash);
  }
  d['rate'] = impliedAPR(ratePlan);
}

// ===== 提前结清 / 撤销结清 =====

String shortDateFromISO(String iso) =>
    '${int.parse(iso.substring(5, 7))}/${int.parse(iso.substring(8, 10))}';

bool applySettle(Map<String, dynamic> d, num paidAmount, String todayString) {
  final plan =
      (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
      <Map<String, dynamic>>[];
  final kept = <Map<String, dynamic>>[];
  final stash = <Map<String, dynamic>>[];
  num remainP = 0;
  for (final r in plan) {
    if (r['paid'] == true) {
      kept.add(r);
    } else {
      stash.add(r);
      remainP += _num(r['principal']);
    }
  }
  if (stash.isEmpty) return false;
  remainP = r2(remainP);
  final x = r2(paidAmount);
  kept.add({
    'date': todayString,
    'amount': x,
    'principal': remainP,
    'interest': r2(x - remainP),
    'paid': true,
    'settleRow': true,
  });
  d['settleStash'] = stash;
  d['plan'] = kept;
  d['settled'] = true;
  d['settledDate'] = shortDateFromISO(todayString);
  recompute(d);
  return true;
}

void undoSettle(Map<String, dynamic> d) {
  final plan =
      (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
      <Map<String, dynamic>>[];
  d['settled'] = false;
  d['settledDate'] = '';
  final stash = (d['settleStash'] as List<dynamic>?)
      ?.cast<Map<String, dynamic>>();
  if (stash != null && stash.isNotEmpty) {
    d['plan'] = plan.where((r) => r['settleRow'] != true).toList()
      ..addAll(stash);
    d.remove('settleStash');
  } else {
    final hasUnpaid = plan.any((r) => r['paid'] != true);
    if (!hasUnpaid && plan.isNotEmpty) {
      final last = plan.last;
      last['paid'] = false;
      last.remove('paidAt');
      last.remove('paidAmount');
    }
  }
  recompute(d);
}

// ===== 部分还款 =====

/// 这次还的钱不够这期(容差0.005)就只累加paidAmount、这期继续留在未还列表里；够了就跟老的
/// payInstallment行为一致。返回null表示这笔债务已经没有未还期次。
Map<String, dynamic>? recordPayment(
  Map<String, dynamic> d,
  num amount,
  String todayString,
) {
  final plan =
      (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
      <Map<String, dynamic>>[];
  var idx = -1;
  for (var k = 0; k < plan.length; k++) {
    if (plan[k]['paid'] != true) {
      idx = k;
      break;
    }
  }
  if (idx < 0) return null;
  final r = plan[idx];
  final x = r2(amount);
  final cumulative = r2(_num(r['paidAmount']) + x);
  if (cumulative >= _num(r['amount']) - 0.005) {
    r['paidAmount'] = r['amount'];
    r['paid'] = true;
    r['paidAt'] = todayString;
    recompute(d);
    if (_num(d['terms']) <= 0) {
      d['settled'] = true;
      d['settledDate'] = shortDateFromISO(todayString);
    }
    return {'idx': idx, 'full': true};
  }
  r['paidAmount'] = cumulative;
  recompute(d);
  return {
    'idx': idx,
    'full': false,
    'remaining': r2(_num(r['amount']) - cumulative),
  };
}

/// 协商减免——不管实付多少，强制把当前最早的未还期次标记为已还，差额自动通过recompute()
/// 的利息优先分摊算成"少还的那部分"。
Map<String, dynamic>? waivePeriod(
  Map<String, dynamic> d,
  num amount,
  String todayString,
) {
  final plan =
      (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
      <Map<String, dynamic>>[];
  var idx = -1;
  for (var k = 0; k < plan.length; k++) {
    if (plan[k]['paid'] != true) {
      idx = k;
      break;
    }
  }
  if (idx < 0) return null;
  final r = plan[idx];
  r['paidAmount'] = r2(math.max(0, amount));
  r['paid'] = true;
  r['paidAt'] = todayString;
  recompute(d);
  if (_num(d['terms']) <= 0) {
    d['settled'] = true;
    d['settledDate'] = shortDateFromISO(todayString);
  }
  return {'idx': idx};
}

void markPaidThrough(List<Map<String, dynamic>> plan, int n) {
  for (var k = 0; k < plan.length; k++) {
    plan[k]['paid'] = k < n;
  }
}

final _rand = math.Random();

/// 债务对象的稳定id——前缀"d"专属债务(备份用"b"/上传用"u"/AI对话用"c"，同一个约定的延伸)。
String genDebtId() {
  final rnd = List.generate(
    5,
    (_) => '0123456789abcdefghijklmnopqrstuvwxyz'[_rand.nextInt(36)],
  ).join();
  return 'd${DateTime.now().millisecondsSinceEpoch}$rnd';
}

void normalize(Map<String, dynamic> d) {
  if (d['id'] == null) d['id'] = genDebtId();
  if (d['plan'] == null) {
    final gen =
        (d['gen'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    d['plan'] = genPlan(gen);
    final paid = _num(gen['paid']).toInt();
    markPaidThrough(
      (d['plan'] as List<dynamic>).cast<Map<String, dynamic>>(),
      paid,
    );
  }
  recompute(d);
}

// ===== 提前还款收益模拟器 =====

/// "月供覆盖不了利息"这条判断需要一点容差——见calc.js同名函数的长注释，这里只搬运公式：
/// 按balance量级给5倍安全余量的线性容差，不用固定的一个极小常数。
double interestCoverTolerance(num balance) =>
    math.max(0.02, _num(balance) * 0.00005);

Map<String, dynamic>? amortForward(
  num balance,
  double i,
  num M,
  num Function(int months)? extraAt,
) {
  var bal = balance.toDouble();
  var months = 0;
  double totalInterest = 0;
  while (bal > 0.005 && months < 1200) {
    final interest = bal * i;
    if (M <= interest - interestCoverTolerance(bal)) {
      return null; // 月供明显不足以覆盖利息，无法收敛
    }
    months++;
    final principal = math.max(0, math.min(M - interest, bal));
    bal -= principal;
    totalInterest += interest;
    final extra = extraAt != null ? _num(extraAt(months)) : 0;
    if (extra > 0) bal = math.max(0, bal - math.min(extra, bal));
  }
  return {'months': months, 'totalInterest': r2(totalInterest)};
}

Map<String, dynamic>? simulatePrepay(
  Map<String, dynamic> d,
  String mode,
  int atPeriod,
  num extra,
) {
  final i = _num(d['rate']) / 1200;
  final M = _num(d['monthly']);
  final balance = _num(d['balance']);
  final baseline = amortForward(balance, i, M, null);
  final scenario = mode == 'recurring'
      ? amortForward(balance, i, M, (m) => m >= atPeriod ? extra : 0)
      : amortForward(balance, i, M, (m) => m == atPeriod ? extra : 0);
  if (baseline == null || scenario == null) return null;
  return {
    'monthsSaved': (baseline['months'] as int) - (scenario['months'] as int),
    'interestSaved': r2(
      _num(baseline['totalInterest']) - _num(scenario['totalInterest']),
    ),
    'newMonths': scenario['months'],
    'baseMonths': baseline['months'],
  };
}

// ===== 多策略对比规划（雪球法/雪崩法/自定义顺序） =====

/// debts: 一批 {id, balance, rate, monthly}。orderIds: 优先级顺序(债务id数组)。
/// extraMonthly: 每月额外投入(不分给哪笔债务，整体滚入当前队首)。
/// 返回 null 只有一种情况：超过600个月(50年)还没还完。
///
/// ⚠️没有逐笔预检查"这笔债务自己的月供能不能覆盖自己的利息"——这条检查在calc.js里
/// 2026-08-05被删掉了，原因见calc.js同名函数的长注释（先息后本债务在利息期被误判成
/// "覆盖不了利息"的真实bug）。这里直接照抄删掉之后的版本，不要加回去。
Map<String, dynamic>? simulateRepaymentOrder(
  List<Map<String, dynamic>> debts,
  List<String> orderIds,
  num extraMonthly,
) {
  final extra = _num(extraMonthly);
  final byId = <String, Map<String, dynamic>>{
    for (final d in debts) d['id'] as String: d,
  };
  final state = <Map<String, dynamic>>[
    for (final id in orderIds)
      if (byId.containsKey(id))
        {
          'id': id,
          'balance': _num(byId[id]!['balance']).toDouble(),
          'i': _num(byId[id]!['rate']) / 1200,
          'min': _num(byId[id]!['monthly']).toDouble(),
        },
  ];
  var month = 0;
  double totalInterest = 0, totalPrincipal = 0;
  final monthly = <Map<String, dynamic>>[];
  final payoffMonth = <String, int>{};
  const maxMonths = 600;
  while (state.any((s) => (s['balance'] as double) > 0.005) &&
      month < maxMonths) {
    month++;
    // 两轮分配，模拟真实理财顾问怎么帮你分配这个月的钱——完整原理见calc.js同名函数注释：
    // 第一轮每笔活跃债务先按自己的月供结算利息+本金(月供不超过真实还欠多少，多出来的进
    // 池子)；第二轮池子按队列优先级顺序追加本金，直到耗尽或队列走完。
    var pool = extra;
    double monthInterest = 0, monthPrincipal = 0;
    for (final sa in state) {
      final balA = sa['balance'] as double;
      if (balA <= 0.005) {
        pool += sa['min'] as double;
        continue;
      }
      final interestA = balA * (sa['i'] as double);
      final needA = balA + interestA;
      final minA = sa['min'] as double;
      final paymentA = math.min(minA, needA);
      if (minA > needA) pool += minA - needA;
      final principalA = paymentA - interestA;
      // ⚠️math.max(0, ...)在"0(int字面量)"那个分支胜出时会返回int而不是double——这个int
      // 会被存进Map<String,dynamic>，之后取出来强转`as double`就会在运行时炸掉(真实踩过，
      // Dart的静态类型检查这里查不出来，因为Map<String,dynamic>的值本来就是dynamic)。
      // 用0.0(double字面量)强制math.max<T>的T推断成double，两个分支不管哪个赢都是double。
      final newBalA = math.max(0.0, balA - principalA);
      sa['balance'] = newBalA;
      final id = sa['id'] as String;
      if (newBalA <= 0.005 && !payoffMonth.containsKey(id)) {
        payoffMonth[id] = month;
      }
      monthInterest += interestA;
      monthPrincipal += principalA;
    }
    for (final sb in state) {
      if (pool <= 0.005) break;
      final balB = sb['balance'] as double;
      if (balB <= 0.005) continue;
      final extraPay = math.min(pool, balB);
      sb['balance'] = balB - extraPay;
      pool -= extraPay;
      monthPrincipal += extraPay;
      final id = sb['id'] as String;
      if ((sb['balance'] as double) <= 0.005 && !payoffMonth.containsKey(id)) {
        payoffMonth[id] = month;
      }
    }
    totalInterest += monthInterest;
    totalPrincipal += monthPrincipal;
    final remaining = state.fold<double>(
      0,
      (sum, s) => sum + (s['balance'] as double),
    );
    monthly.add({
      'month': month,
      'interest': r2(monthInterest),
      'principal': r2(monthPrincipal),
      'balance': r2(remaining),
    });
  }
  if (month >= maxMonths) return null;
  return {
    'months': month,
    'totalInterest': r2(totalInterest),
    'totalPrincipal': r2(totalPrincipal),
    'monthly': monthly,
    'payoffMonth': payoffMonth,
  };
}

/// 雪球法：优先还余额最小的。
List<String> snowballOrder(List<Map<String, dynamic>> debts) {
  final sorted = debts.toList()
    ..sort((a, b) => _num(a['balance']).compareTo(_num(b['balance'])));
  return sorted.map((d) => d['id'] as String).toList();
}

/// 雪崩法：优先还年化利率最高的。
List<String> avalancheOrder(List<Map<String, dynamic>> debts) {
  final sorted = debts.toList()
    ..sort((a, b) => _num(b['rate']).compareTo(_num(a['rate'])));
  return sorted.map((d) => d['id'] as String).toList();
}

/// sorts 是 {排序名: 取值函数} 的映射——跟detectMatchingSort在calc.js里参数化的道理一样，
/// 不从任何闭包读取状态，可以直接单测。
String detectMatchingSort(
  List<dynamic> activeInOrder,
  Map<String, num Function(dynamic)> sorts,
) {
  for (final key in sorts.keys) {
    final cmp = sorts[key]!;
    final candidate = activeInOrder.toList()
      ..sort((a, b) => cmp(a).compareTo(cmp(b)));
    var same = true;
    for (var i = 0; i < candidate.length; i++) {
      if (candidate[i] != activeInOrder[i]) {
        same = false;
        break;
      }
    }
    if (same) return key;
  }
  return 'custom';
}

/// 29/30/31号不是每个月都有——批量设置还款日/公式生成的首期还款日投射的是"每月同一天"的
/// 重复规律，选这三天会导致还款日在不同月份间漂移。
bool isBadRepeatDay(int day) => day >= 29 && day <= 31;

String offsetLabel(int n) => n == 0 ? '当天到期' : '提前$n天';

String urgencyTier(int diff) =>
    diff < 0 ? 'overdue' : (diff <= 3 ? 'crit' : (diff <= 14 ? 'warn' : 'dim'));

String relLabel(int diff) =>
    diff < 0 ? '已逾期 ${-diff} 天' : (diff == 0 ? '就在今天' : '$diff 天后');

/// 跟urgencyTier是两套独立阈值——这套管列表怎么分段(7/30天两档)。
String dueBucket(int diff) => diff < 0
    ? 'overdue'
    : (diff <= 7 ? 'week' : (diff <= 30 ? 'month' : 'later'));

// ===== 高级统计报表背后的数据计算 =====

Map<String, dynamic> computeReportData(List<Map<String, dynamic>> debts) {
  final active = debts.where((d) => d['settled'] != true).toList();
  num totalBalance = 0, weightedRate = 0;
  String? payoffDate;
  final byType = <String, num>{};
  final byName = <Map<String, dynamic>>[];
  for (final d in active) {
    final bal = _num(d['balance']);
    totalBalance += bal;
    weightedRate += _num(d['rate']) * bal;
    byName.add({'name': d['name'], 'balance': bal});
    final t = (d['type'] as String?) ?? '未分类';
    byType[t] = (byType[t] ?? 0) + bal;
    final plan =
        (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
        <Map<String, dynamic>>[];
    for (var k = plan.length - 1; k >= 0; k--) {
      if (plan[k]['paid'] != true) {
        final dt = plan[k]['date'] as String?;
        if (dt != null &&
            (payoffDate == null || dt.compareTo(payoffDate) > 0)) {
          payoffDate = dt;
        }
        break;
      }
    }
  }
  byName.sort((a, b) => _num(b['balance']).compareTo(_num(a['balance'])));
  var typeList =
      byType.entries.map((e) => {'name': e.key, 'value': e.value}).toList()
        ..sort((a, b) => (b['value'] as num).compareTo(a['value'] as num));
  if (typeList.length > 6) {
    final restSum = typeList
        .skip(5)
        .fold<num>(0, (s, x) => s + (x['value'] as num));
    typeList = typeList.take(5).toList()..add({'name': '其他', 'value': restSum});
  }
  // ⚠️逾期未销的期次(date在今天之前)必须归到"今天"这个桶里——见calc.js同名函数注释，
  // 不能原样按它自己的过去日期入表，否则timeline会时间倒流。
  final byDate = <String, num>{};
  final todayKey = fmtDate(today0());
  for (final d in active) {
    for (final r
        in (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[]) {
      if (r['paid'] == true) continue;
      final rawDate = r['date'] as String?;
      final dt =
          (rawDate != null &&
              RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(rawDate) &&
              rawDate.compareTo(todayKey) >= 0)
          ? rawDate
          : todayKey;
      byDate[dt] = (byDate[dt] ?? 0) + _num(r['principal']);
    }
  }
  final dates = byDate.keys.toList()..sort();
  final timeline = <Map<String, dynamic>>[
    {'date': fmtDate(today0()), 'balance': r2(totalBalance)},
  ];
  var running = totalBalance;
  for (final dt in dates) {
    running = math.max(0, running - byDate[dt]!);
    timeline.add({'date': dt, 'balance': r2(running)});
  }
  return {
    'active': active,
    'totalBalance': r2(totalBalance),
    'avgRate': totalBalance > 0 ? weightedRate / totalBalance : 0,
    'payoffDate': payoffDate,
    'byName': byName,
    'typeList': typeList,
    'timeline': timeline,
  };
}

// ===== 文本转换：HTML转义 + 极简markdown渲染器 =====

String esc(String s) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

String inline(String s) {
  var out = esc(s);
  out = out.replaceAllMapped(
    RegExp('`([^`]+)`'),
    (m) => '<code>${m[1]}</code>',
  );
  out = out.replaceAllMapped(
    RegExp(r'\*\*([^*]+)\*\*'),
    (m) => '<strong>${m[1]}</strong>',
  );
  out = out.replaceAllMapped(
    RegExp(r'\[\[([^\]]+)\]\]'),
    (m) => '<em>${m[1]}</em>',
  );
  out = out.replaceAllMapped(
    RegExp(r'\[([^\]]+)\]\(([^)]+)\)'),
    (m) => m[1] ?? '',
  );
  return out;
}

bool isHr(String l) =>
    RegExp(r'^[-=─═_*]{3,}$').hasMatch(l.replaceAll(RegExp(r'\s'), ''));

String mdToHtml(String src) {
  final lines = src.replaceAll('\r', '').split('\n');
  final out = <String>[];
  var i = 0;
  while (i < lines.length) {
    final t = lines[i].trim();
    if (t.isEmpty) {
      i++;
      continue;
    }
    if (RegExp(r'^```').hasMatch(t)) {
      i++;
      final code = <String>[];
      while (i < lines.length && !RegExp(r'^```').hasMatch(lines[i].trim())) {
        code.add(esc(lines[i]));
        i++;
      }
      i++;
      out.add('<pre class="md-pre">${code.join('\n')}</pre>');
      continue;
    }
    final h = RegExp(r'^(#{1,6})\s+(.*)$').firstMatch(t);
    if (h != null) {
      final lv = math.min(h.group(1)!.length + 1, 6);
      out.add('<h$lv>${inline(h.group(2)!)}</h$lv>');
      i++;
      continue;
    }
    if (isHr(t)) {
      out.add('<hr>');
      i++;
      continue;
    }
    if (RegExp(r'^>\s?').hasMatch(t)) {
      final q = <String>[];
      while (i < lines.length && RegExp(r'^>\s?').hasMatch(lines[i].trim())) {
        q.add(inline(lines[i].trim().replaceFirst(RegExp(r'^>\s?'), '')));
        i++;
      }
      out.add('<blockquote>${q.join('<br>')}</blockquote>');
      continue;
    }
    if (RegExp(r'^\|.*\|').hasMatch(t) &&
        i + 1 < lines.length &&
        lines[i + 1].contains('-') &&
        RegExp(r'^[\s|:-]+$').hasMatch(lines[i + 1].trim())) {
      List<String> cut(String row) {
        final c = row.trim().split('|').toList();
        if (c.isNotEmpty && c.first == '') c.removeAt(0);
        if (c.isNotEmpty && c.last == '') c.removeLast();
        return c.map((x) => x.trim()).toList();
      }

      final head = cut(t);
      i += 2;
      final rows = <List<String>>[];
      while (i < lines.length && RegExp(r'^\|.*\|').hasMatch(lines[i].trim())) {
        rows.add(cut(lines[i]));
        i++;
      }
      final th = '<tr>${head.map((c) => '<th>${inline(c)}</th>').join()}</tr>';
      final tb = rows
          .map(
            (rr) => '<tr>${rr.map((c) => '<td>${inline(c)}</td>').join()}</tr>',
          )
          .join();
      out.add('<div class="md-tbl"><table>$th$tb</table></div>');
      continue;
    }
    if (RegExp(r'^[-*]\s+').hasMatch(t)) {
      final items = <String>[];
      while (i < lines.length && RegExp(r'^\s*[-*]\s+').hasMatch(lines[i])) {
        items.add(
          '<li>${inline(lines[i].replaceFirst(RegExp(r'^\s*[-*]\s+'), ''))}</li>',
        );
        i++;
      }
      out.add('<ul>${items.join()}</ul>');
      continue;
    }
    if (RegExp(r'^\d+\.\s+').hasMatch(t)) {
      final oi = <String>[];
      while (i < lines.length && RegExp(r'^\s*\d+\.\s+').hasMatch(lines[i])) {
        oi.add(
          '<li>${inline(lines[i].replaceFirst(RegExp(r'^\s*\d+\.\s+'), ''))}</li>',
        );
        i++;
      }
      out.add('<ol>${oi.join()}</ol>');
      continue;
    }
    final para = <String>[];
    while (i < lines.length) {
      final lt = lines[i].trim();
      if (lt.isEmpty ||
          RegExp(r'^(#{1,6})\s').hasMatch(lt) ||
          RegExp(r'^[-*]\s').hasMatch(lt) ||
          RegExp(r'^\d+\.\s').hasMatch(lt) ||
          RegExp(r'^>\s?').hasMatch(lt) ||
          RegExp(r'^```').hasMatch(lt) ||
          isHr(lt)) {
        break;
      }
      para.add(inline(lt));
      i++;
    }
    if (para.isNotEmpty) out.add('<p>${para.join('<br>')}</p>');
  }
  return out.join('\n');
}

/// 在还债务主页hero/KPI的聚合数字。⚠️口径：已还本金/已还利息算全量(含已结清债务)，其余
/// 字段只算在还债务——完整背景见calc.js同名函数的长注释(这是一个真实修过的用户反馈bug，
/// 不是随手定的口径)。
Map<String, dynamic> summarizeDebts(List<Map<String, dynamic>> debts) {
  num total = 0, monthly = 0, paidPrincipal = 0, paidInterest = 0;
  var active = 0, settled = 0;
  for (final d in debts) {
    paidPrincipal += _num(d['paidPrincipal']);
    paidInterest += _num(d['paidInterest']);
    if (d['settled'] == true) {
      settled++;
      continue;
    }
    active++;
    total += _num(d['balance']);
    if (d['oneTime'] != true) monthly += _num(d['monthly']);
  }
  final zeroBase = paidPrincipal + total;
  final pct = zeroBase > 0 ? (paidPrincipal / zeroBase * 100).round() : 0;
  return {
    'total': r2(total),
    'monthly': r2(monthly),
    'active': active,
    'settled': settled,
    'paidPrincipal': r2(paidPrincipal),
    'paidInterest': r2(paidInterest),
    'pct': pct,
  };
}

/// 统计tab"月还款统计"图用的月度聚合——不按active过滤，用amount(本金+利息合计)不是
/// principal。月份序列在min~max之间按月连续补齐。
List<Map<String, dynamic>> computeMonthlyRepayment(
  List<Map<String, dynamic>> debts,
) {
  final byMonth = <String, Map<String, num>>{};
  for (final d in debts) {
    for (final r
        in (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[]) {
      final m = ((r['date'] as String?) ?? '').substring(
        0,
        math.min(7, ((r['date'] as String?) ?? '').length),
      );
      if (!RegExp(r'^\d{4}-\d{2}$').hasMatch(m)) continue;
      final bucket = byMonth.putIfAbsent(
        m,
        () => {'actual': 0, 'scheduled': 0},
      );
      if (r['paid'] == true) {
        bucket['actual'] = bucket['actual']! + _num(r['amount']);
      } else {
        bucket['scheduled'] = bucket['scheduled']! + _num(r['amount']);
      }
    }
  }
  final keys = byMonth.keys.toList()..sort();
  if (keys.isEmpty) return [];
  final out = <Map<String, dynamic>>[];
  var y = int.parse(keys.first.substring(0, 4));
  var mo = int.parse(keys.first.substring(5, 7));
  final endKey = keys.last;
  var cur = keys.first;
  while (cur.compareTo(endKey) <= 0) {
    final b = byMonth[cur] ?? {'actual': 0, 'scheduled': 0};
    out.add({
      'month': cur,
      'actual': r2(b['actual']!),
      'scheduled': r2(b['scheduled']!),
    });
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
    cur = '$y-${_pad2(mo)}';
  }
  return out;
}

/// 统计tab"未来N个月还款压力"柱状图的数据源——按active过滤、逾期单独进overdue桶、窗口从
/// 当前月起固定N个月。完整原理见calc.js同名函数注释。
Map<String, dynamic> computeUpcomingPressure(
  List<Map<String, dynamic>> debts,
  int monthsAhead, [
  DateTime? today,
]) {
  final n = monthsAhead > 0 ? monthsAhead : 12;
  final t0 = today != null
      ? DateTime(today.year, today.month, today.day)
      : today0();
  final todayKey = fmtDate(t0);
  final overdue = {
    'amount': 0.0,
    'principal': 0.0,
    'interest': 0.0,
    'count': 0,
  };
  final buckets = <String, Map<String, dynamic>>{};
  final order = <String>[];
  var y = t0.year, mo = t0.month;
  for (var k = 0; k < n; k++) {
    final key = '$y-${_pad2(mo)}';
    buckets[key] = {
      'month': key,
      'principal': 0.0,
      'interest': 0.0,
      'total': 0.0,
      'items': <Map<String, dynamic>>[],
    };
    order.add(key);
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  for (final d in debts) {
    if (d['settled'] == true) continue;
    for (final r
        in (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[]) {
      if (r['paid'] == true) continue;
      final rawDate = r['date'] as String?;
      if (rawDate == null ||
          !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(rawDate)) {
        continue;
      }
      var amt = _num(r['amount']),
          pr = _num(r['principal']),
          it = _num(r['interest']);
      if (r['paidAmount'] != null && _num(r['paidAmount']) != 0) {
        final pSplit = splitPaidInterestFirst(pr, it, _num(r['paidAmount']));
        pr = r2(pr - pSplit['principal']!);
        it = r2(it - pSplit['interest']!);
        amt = rowRemaining(r);
      }
      if (rawDate.compareTo(todayKey) < 0) {
        overdue['amount'] = r2(_num(overdue['amount']) + amt);
        overdue['principal'] = r2(_num(overdue['principal']) + pr);
        overdue['interest'] = r2(_num(overdue['interest']) + it);
        overdue['count'] = (overdue['count'] as int) + 1;
        continue;
      }
      final b = buckets[rawDate.substring(0, 7)];
      if (b == null) continue; // 超出N个月窗口
      b['principal'] = r2(_num(b['principal']) + pr);
      b['interest'] = r2(_num(b['interest']) + it);
      b['total'] = r2(_num(b['total']) + amt);
      final items = (b['items'] as List<Map<String, dynamic>>);
      Map<String, dynamic>? hit;
      for (final it2 in items) {
        if (it2['id'] == d['id']) {
          hit = it2;
          break;
        }
      }
      if (hit != null) {
        hit['amount'] = r2(_num(hit['amount']) + amt);
      } else {
        items.add({
          'id': d['id'],
          'name': d['name'] ?? '未命名',
          'amount': r2(amt),
        });
      }
    }
  }
  final months = order.map((key) => buckets[key]!).toList();
  for (final m in months) {
    (m['items'] as List<Map<String, dynamic>>).sort(
      (a, b) => _num(b['amount']).compareTo(_num(a['amount'])),
    );
  }
  final totalAhead = r2(months.fold<num>(0, (s, m) => s + _num(m['total'])));
  Map<String, dynamic>? peak;
  for (final m in months) {
    if (_num(m['total']) > 0 &&
        (peak == null || _num(m['total']) > _num(peak['total']))) {
      peak = {'month': m['month'], 'total': m['total']};
    }
  }
  return {
    'overdue': overdue,
    'months': months,
    'currentMonth': order.first,
    'totalAhead': totalAhead,
    'monthlyAvg': r2(totalAhead / n),
    'peak': peak,
  };
}

/// "未来还款压力"图要铺多少个月——铺到最后一笔未还且未逾期的期次所在月份，下限12上限60。
int pressureWindowMonths(List<Map<String, dynamic>> debts, [DateTime? today]) {
  final t0 = today != null
      ? DateTime(today.year, today.month, today.day)
      : today0();
  final todayKey = fmtDate(t0);
  String? last;
  for (final d in debts) {
    if (d['settled'] == true) continue;
    for (final r
        in (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[]) {
      if (r['paid'] == true) continue;
      final rawDate = r['date'] as String?;
      if (rawDate == null ||
          !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(rawDate)) {
        continue;
      }
      if (rawDate.compareTo(todayKey) < 0) continue;
      if (last == null || rawDate.compareTo(last) > 0) last = rawDate;
    }
  }
  if (last == null) return 12;
  final n =
      (int.parse(last.substring(0, 4)) - t0.year) * 12 +
      (int.parse(last.substring(5, 7)) - t0.month) +
      1;
  return math.max(12, math.min(60, n));
}

/// 还款提醒调度（纯计算部分）——一次性把"未来windowMonths个月内"全部未还期次都排上，
/// 不依赖"重新打开App"这个动作。
List<Map<String, dynamic>> computeNotifySchedule(
  List<Map<String, dynamic>> debts,
  Map<String, dynamic>? notify,
  int nowMs,
  int windowMonths,
  int maxCount,
) {
  final list = <Map<String, dynamic>>[];
  final rules = (notify?['rules'] as List<dynamic>?)
      ?.cast<Map<String, dynamic>>();
  if (notify == null ||
      notify['enabled'] != true ||
      rules == null ||
      rules.isEmpty) {
    return list;
  }
  final n = windowMonths > 0 ? windowMonths : 6;
  final cap = maxCount > 0 ? maxCount : 450;
  final t0 = DateTime.fromMillisecondsSinceEpoch(nowMs);
  final cutoffKey = fmtDate(addMonths(DateTime(t0.year, t0.month, t0.day), n));
  for (final d in debts) {
    if (d['settled'] == true) continue;
    for (final r
        in (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[]) {
      if (r['paid'] == true) continue;
      final rawDate = r['date'] as String?;
      if (rawDate == null ||
          !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(rawDate)) {
        continue;
      }
      if (rawDate.compareTo(cutoffKey) > 0) continue;
      final due = parseDate(rawDate)!;
      for (final rule in rules) {
        final offsetDays = _num(rule['offsetDays']).toInt();
        final fireDate = DateTime(due.year, due.month, due.day - offsetDays);
        final hm = ((rule['time'] as String?) ?? '09:00').split(':');
        final fire = DateTime(
          fireDate.year,
          fireDate.month,
          fireDate.day,
          int.tryParse(hm[0]) ?? 0,
          hm.length > 1 ? (int.tryParse(hm[1]) ?? 0) : 0,
        );
        if (fire.millisecondsSinceEpoch <= t0.millisecondsSinceEpoch) {
          continue; // 只排未来的
        }
        list.add({
          'name': d['name'] ?? '',
          'date': rawDate,
          'amount': _num(r['amount']),
          'fireAt': fire,
        });
      }
    }
  }
  list.sort(
    (a, b) => (a['fireAt'] as DateTime).compareTo(b['fireAt'] as DateTime),
  );
  if (list.length > cap) return list.take(cap).toList();
  return list;
}

/// 一笔债务按现有还款计划"还到底还要再付多少利息/手续费"——未还期次的interest之和。
double remainingInterest(Map<String, dynamic> d) {
  num s = 0;
  for (final r
      in (d['plan'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
          <Map<String, dynamic>>[]) {
    if (r['paid'] != true) s += _num(r['interest']);
  }
  return r2(s);
}

/// 会员判断——premium形状是 {premium: {method, at} | null}。
bool hasPremium(Map<String, dynamic>? premium) =>
    premium != null && premium['premium'] != null;

String? premiumLabel(Map<String, dynamic>? premium) =>
    hasPremium(premium) ? 'Premium 会员' : null;

/// AI历史对话列表操作——findAiConv按id查找；bumpAiConvTop **原地修改**传入的列表(splice+
/// unshift)，不是没有副作用的纯函数，但副作用只作用于参数本身，行为跟Array.prototype.sort
/// 这类原地方法是同一类，一样能用"调用后检查数组"的方式单测。
Map<String, dynamic>? findAiConv(
  List<Map<String, dynamic>> aiConvos,
  String id,
) {
  for (final c in aiConvos) {
    if (c['id'] == id) return c;
  }
  return null;
}

void bumpAiConvTop(
  List<Map<String, dynamic>> aiConvos,
  Map<String, dynamic> rec,
) {
  final idx = aiConvos.indexOf(rec);
  if (idx > 0) {
    aiConvos.removeAt(idx);
    aiConvos.insert(0, rec);
  }
}

String escSvg(dynamic s) => s
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/// 图表Y轴刻度取整到"好看数字"——PressureChart(柱状)和PayoffLine(折线)共用这一份。
const List<double> niceSteps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

double niceCeil(num v) {
  if (!(v > 0)) return 0;
  final mag = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
  final n = v / mag;
  for (final step in niceSteps) {
    if (n <= step) return step * mag;
  }
  return 10 * mag;
}

/// 报表图表/PDF导出用来截断过长的债务名/标签，后面补"…"。
String truncateLabel(dynamic s, int n) {
  final str = s.toString();
  return str.length > n ? '${str.substring(0, n - 1)}…' : str;
}
