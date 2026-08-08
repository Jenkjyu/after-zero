// 统计页的结论规则引擎——"三件值得注意的事" + "最该先动手的地方"背后的东西。
// 从 react/src/report/findings.tsx 逐条移植：每条候选结论带触发条件（不成立就不出现）、
// severity 0-100（决定排序）、actionable（只有可行动的结论才有资格当"最该先动手的地方"）、
// detail（被选为"最该先动手"时展开的内容）。
import 'dart:math' as math;

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';

/// 年化多少算"高息"——跟 calc.dart 的 rateClass() 里 rate-hi 的分档线是同一条
const hiRate = 18;

class DebtRow {
  final String id;
  final String name;
  final String type;
  final double balance;
  final double rate;
  final double remainingInterest;
  final int terms;
  const DebtRow({
    required this.id,
    required this.name,
    required this.type,
    required this.balance,
    required this.rate,
    required this.remainingInterest,
    required this.terms,
  });
}

List<DebtRow> toDebtRows(List<Debt> active) {
  final rows = active
      .map(
        (debt) => DebtRow(
          id: debt.id,
          name: debt.name,
          type: debt.type?.isNotEmpty == true ? debt.type! : '未分类',
          balance: debt.balance.toDouble(),
          rate: debt.rate.toDouble(),
          remainingInterest: calc.remainingInterest(debt.toMap()),
          terms: debt.terms,
        ),
      )
      .toList()
    ..sort((a, b) => b.balance.compareTo(a.balance));
  return rows;
}

class FindingBar {
  final String nm;
  final double pct;
  final String rt;
  const FindingBar({required this.nm, required this.pct, required this.rt});
}

class FindingDetail {
  final String top;
  final String body;
  final List<FindingBar> bars;
  final String? rest;
  const FindingDetail({
    required this.top,
    required this.body,
    required this.bars,
    this.rest,
  });
}

enum FindingTone { risk, warn, info, good }

class Finding {
  final String id;
  final int severity;
  final bool actionable;
  final FindingTone tone;
  final String title;
  final String body;
  final String? actionTitle;
  final FindingDetail? detail;
  const Finding({
    required this.id,
    required this.severity,
    required this.actionable,
    required this.tone,
    required this.title,
    required this.body,
    this.actionTitle,
    this.detail,
  });
}

/// 金额一律取整到元再格式化——明细里混着 "¥1,089" 和 "¥666.16" 很难扫
String _yuan(num n) => '¥${calc.fmt(n.round())}';

String _monthLabel(String m) => '${m.substring(2, 4)}年${int.parse(m.substring(5, 7))}月';

List<Finding> buildFindings(
  List<DebtRow> rows,
  Map<String, dynamic> data,
  Map<String, dynamic> pressure,
) {
  final total = (data['totalBalance'] as num).toDouble();
  final totalInt = rows.fold<double>(0, (s, d) => s + d.remainingInterest);
  final out = <Finding>[];

  /* ① 利息集中度 */
  final byInt = [...rows]..sort((a, b) => b.remainingInterest.compareTo(a.remainingInterest));
  final ti = byInt.isEmpty ? null : byInt.first;
  final tiShare = totalInt > 0 && ti != null ? ti.remainingInterest / totalInt : 0.0;
  if (ti != null && tiShare >= 0.3) {
    final bars = byInt.take(4).where((x) => x.remainingInterest > 0).toList();
    final mx = bars.isEmpty ? 1 : bars.first.remainingInterest;
    out.add(
      Finding(
        id: 'concentration',
        severity: (tiShare * 100).round(),
        actionable: true,
        tone: FindingTone.warn,
        title: '${ti.name} 一笔占了剩余待付利息的 ${(tiShare * 100).round()}%',
        body:
            '它只占总余额的 **${((ti.balance / math.max(1, total)) * 100).round()}%**（${_yuan(ti.balance)}）， '
            '但还有 **${ti.terms}** 期，剩下要为它付 **${_yuan(ti.remainingInterest)}** 利息。',
        actionTitle: '利息主要花在 ${ti.name} 上',
        detail: FindingDetail(
          top: '剩余待付利息合计 ${_yuan(totalInt)}',
          body:
              '它的年化是 **${ti.rate.toStringAsFixed(2)}%**，在这 ${rows.length} 笔里并不算高——贵在'
              '**金额大、期限长**。提前还它省下的是时间堆出来的利息，跟先还高息那几笔是两种不同的省法。',
          bars: [
            for (final x in bars)
              FindingBar(nm: x.name, pct: x.remainingInterest / mx, rt: _yuan(x.remainingInterest)),
          ],
        ),
      ),
    );
  }

  /* ② 高息债务 */
  final hi = rows.where((d) => d.rate >= hiRate).toList()
    ..sort((a, b) => b.rate.compareTo(a.rate));
  if (hi.isNotEmpty) {
    final hiBal = hi.fold<double>(0, (s, d) => s + d.balance);
    final hiInt = hi.fold<double>(0, (s, d) => s + d.remainingInterest);
    final hiShare = total > 0 ? hiBal / total : 0.0;
    final types = hi.map((d) => d.type).toSet().toList();
    final typeWord = types.length == 1 ? types.first : '债务';
    final lowest = [...rows]..sort((a, b) => a.rate.compareTo(b.rate));
    final lo = lowest.isEmpty ? null : lowest.first;
    out.add(
      Finding(
        id: 'highrate',
        severity: ((hiShare * 100) + (hi.first.rate - hiRate) * 2).round(),
        actionable: true,
        tone: FindingTone.risk,
        title: '${hi.length} 笔$typeWord年化超过 $hiRate%',
        body:
            '利率 **${hi.last.rate.toStringAsFixed(2)}%** 到 **${hi.first.rate.toStringAsFixed(2)}%**， '
            '占总余额 **${(hiShare * 100).round()}%**（${_yuan(hiBal)}）、 '
            '占剩余待付利息 **${((hiInt / math.max(1, totalInt)) * 100).round()}%**。',
        actionTitle: '先还掉年化 ≥$hiRate% 的那 ${hi.length} 笔',
        detail: FindingDetail(
          top: '高息债务 ${hi.length} 笔 · 共 ${_yuan(hiBal)}',
          body:
              '同样一块钱，放在 **${hi.first.rate.toStringAsFixed(2)}%** 的 ${hi.first.name} 上省下的利息， '
              '是放在利率最低的 ${lo?.name ?? '—'}（**${lo?.rate.toStringAsFixed(2) ?? '—'}%**）上的 '
              '**${(hi.first.rate / math.max(0.01, lo?.rate ?? 0.01)).toStringAsFixed(1)}** 倍。',
          bars: [
            for (final d in hi)
              FindingBar(nm: d.name, pct: d.rate / hi.first.rate, rt: '${d.rate.toStringAsFixed(2)}%'),
          ],
        ),
      ),
    );
  }

  /* ③ 还款峰值月 */
  final peak = pressure['peak'] as Map<String, dynamic>?;
  final monthlyAvg = (pressure['monthlyAvg'] as num?)?.toDouble() ?? 0;
  if (peak != null && monthlyAvg > 0) {
    final peakTotal = (peak['total'] as num).toDouble();
    final ratio = peakTotal / monthlyAvg;
    if (ratio >= 1.5) {
      final month = peak['month'] as String;
      final pm = (pressure['months'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .where((m) => m['month'] == month)
          .toList();
      final items = pm.isEmpty
          ? <Map<String, dynamic>>[]
          : ((pm.first['items'] as List<dynamic>?) ?? const [])
                .cast<Map<String, dynamic>>();
      const show = 6;
      final restN = math.max(0, items.length - show);
      final restSum = items
          .skip(show)
          .fold<num>(0, (s, it) => s + ((it['amount'] as num?) ?? 0));
      final mx = items.isEmpty ? 1 : (items.first['amount'] as num);
      out.add(
        Finding(
          id: 'peak',
          severity: math.min(100, ((ratio - 1) * 60).round()),
          actionable: true,
          tone: FindingTone.warn,
          title: '${_monthLabel(month)}是最难的一个月',
          body:
              '那个月要还 **${_yuan(peakTotal)}**，是月均 **${_yuan(monthlyAvg)}** 的 '
              '**${ratio.toStringAsFixed(1)}** 倍。',
          actionTitle: '先为 ${_monthLabel(month)} 备好 ${_yuan(peakTotal)}',
          detail: FindingDetail(
            top: '${_monthLabel(month)} 要还 ${_yuan(peakTotal)}',
            body:
                '比月均多 **${_yuan(peakTotal - monthlyAvg)}**。这个月一共有 **${items.length}** 笔债务同时到期'
                '${restN > 0 ? '，金额最大的 **$show** 笔是：' : '：'}',
            rest: restN > 0 ? '其余 $restN 笔 · ${_yuan(restSum)}' : null,
            bars: [
              for (final it in items.take(show))
                FindingBar(
                  nm: it['name'] as String? ?? '',
                  pct: (it['amount'] as num).toDouble() / mx.toDouble(),
                  rt: _yuan(it['amount'] as num),
                ),
            ],
          ),
        ),
      );
    }
  }

  /* ④ 利息负担总量 */
  final burden = total > 0 ? totalInt / total : 0.0;
  final (severity, tone, tierWord) = burden > 0.25
      ? (80, FindingTone.risk, '偏重')
      : burden > 0.1
      ? (45, FindingTone.warn, '中等')
      : (10, FindingTone.good, '很轻');
  out.add(
    Finding(
      id: 'burden',
      severity: severity,
      actionable: false,
      tone: tone,
      title: '整体利息负担$tierWord',
      body:
          '剩下还要付 **${_yuan(totalInt)}** 利息，相当于剩余本金 **${_yuan(total)}** 的 '
          '**${(burden * 100).round()}%**。加权年化 **${((data['avgRate'] as num?) ?? 0).toStringAsFixed(2)}%**。',
    ),
  );

  out.sort((a, b) => b.severity.compareTo(a.severity));
  return out;
}
