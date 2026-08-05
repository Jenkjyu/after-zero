import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';

/// “统计”页是报告，而不是重复债务页顶部 KPI：先给当前判断，再展示还清路径、未来压力、
/// 余额集中度和类型构成。所有数字都只读 calc.dart 的既有报告函数。
class ReportTab extends ConsumerWidget {
  const ReportTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final debts = ref.watch(debtsProvider);
    final maps = debts.map((debt) => debt.toMap()).toList();
    final data = calc.computeReportData(maps);
    final summary = calc.summarizeDebts(maps);
    final active = debts.where((debt) => debt.settled != true).toList();
    if (active.isEmpty) return _ReportEmpty(summary: summary);
    final months = calc.pressureWindowMonths(maps);
    final pressure = calc.computeUpcomingPressure(maps, months);
    final monthly = calc.computeMonthlyRepayment(maps);
    final payoff = data['payoffDate'] as String?;
    final monthsLeft = _monthsUntil(payoff);
    return Scaffold(
      appBar: AppBar(title: const Text('统计')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 36),
        children: [
          _ReportHead(data: data, summary: summary, monthsLeft: monthsLeft),
          const SizedBox(height: 26),
          _InsightSection(active: active, pressure: pressure),
          const SizedBox(height: 26),
          _JourneyCard(data: data, summary: summary, monthsLeft: monthsLeft),
          const SizedBox(height: 26),
          _PressureCard(pressure: pressure),
          const SizedBox(height: 26),
          _MonthlyRepaymentCard(months: monthly),
          const SizedBox(height: 26),
          _RankCard(active: active),
          const SizedBox(height: 26),
          _TypeCard(data: data),
          const SizedBox(height: 28),
          Text('导出报告、多策略对比和图表交互将在后续阶段接入。', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

int? _monthsUntil(String? date) {
  final target = date == null ? null : calc.parseDate(date);
  if (target == null) return null;
  final today = calc.today0();
  return math.max(0, (target.year - today.year) * 12 + target.month - today.month);
}

class _ReportEmpty extends StatelessWidget {
  final Map<String, dynamic> summary;
  const _ReportEmpty({required this.summary});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('统计')),
    body: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.verified_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 14),
        Text('目前没有在还的债务', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text((summary['settled'] as int) > 0 ? '已经结清 ${summary['settled']} 笔，累计还掉本金 ¥${calc.fmt(summary['paidPrincipal'])}。' : '新增一笔债务后，这里会生成一份完整的分析报告。', textAlign: TextAlign.center),
      ]),
    ),
  );
}

class _ReportHead extends StatelessWidget {
  final Map<String, dynamic> data;
  final Map<String, dynamic> summary;
  final int? monthsLeft;
  const _ReportHead({required this.data, required this.summary, required this.monthsLeft});
  @override
  Widget build(BuildContext context) {
    final total = data['totalBalance'] as num;
    final date = data['payoffDate'] as String?;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('债务体检 · ${calc.fmtDate(calc.today0())}', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 5),
      Text(date == null ? '当前负债概况' : '你的负债正在稳定下降', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      Text('目前还欠 ¥${calc.fmt(total)}，分布在 ${summary['active']} 笔债务里；已还本金 ¥${calc.fmt(summary['paidPrincipal'])}，已走完 ${summary['pct']}%。${date == null ? ' 当前没有可推算的还清日期。' : ' 按当前计划，每月约还 ¥${calc.fmt(summary['monthly'])}，${monthsLeft ?? 0} 个月后（$date）归零。'}', style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.55)),
    ]);
  }
}

class _InsightSection extends StatelessWidget {
  final List<Debt> active;
  final Map<String, dynamic> pressure;
  const _InsightSection({required this.active, required this.pressure});
  @override
  Widget build(BuildContext context) {
    final high = active.where((debt) => debt.rate >= 18).toList()..sort((a, b) => b.rate.compareTo(a.rate));
    final peak = pressure['peak'] as Map<String, dynamic>?;
    final overdue = pressure['overdue'] as Map<String, dynamic>;
    final insights = <(IconData, String, String)>[
      if (high.isNotEmpty) (Icons.local_fire_department_outlined, '高息债务优先处理', '${high.first.name} 的推算年化为 ${high.first.rate.toStringAsFixed(2)}%，是当前最高的一笔。'),
      if ((overdue['count'] as int) > 0) (Icons.warning_amber_rounded, '有 ${overdue['count']} 期已逾期', '逾期金额 ¥${calc.fmt(overdue['amount'])}，建议先处理已错过的款项。'),
      if (peak != null) (Icons.trending_up, '压力最高的月份', '${peak['month']} 预计需还 ¥${calc.fmt(peak['total'])}，提前安排现金流。'),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('这段时间发生了什么', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 4),
      Text('${insights.length}件值得注意的事', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 10),
      for (final insight in insights) Card(child: ListTile(leading: Icon(insight.$1), title: Text(insight.$2), subtitle: Text(insight.$3))),
    ]);
  }
}

class _JourneyCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final Map<String, dynamic> summary;
  final int? monthsLeft;
  const _JourneyCard({required this.data, required this.summary, required this.monthsLeft});
  @override
  Widget build(BuildContext context) {
    final timeline = (data['timeline'] as List<dynamic>).cast<Map<String, dynamic>>();
    return _SectionCard(
      eyebrow: '还清这件事进行到哪了',
      title: '已经走完 ${summary['pct']}%${monthsLeft == null ? '' : '，还剩 $monthsLeft 个月'}',
      child: timeline.length < 2
          ? const Text('暂无足够的还款计划数据。')
          : SizedBox(height: 180, child: CustomPaint(painter: _TimelinePainter(timeline, Theme.of(context).colorScheme.primary), child: Align(alignment: Alignment.bottomCenter, child: Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('${timeline.first['date']}  →  ${timeline.last['date']}', style: Theme.of(context).textTheme.labelSmall)))),),
    );
  }
}

class _TimelinePainter extends CustomPainter {
  final List<Map<String, dynamic>> points;
  final Color color;
  const _TimelinePainter(this.points, this.color);
  @override
  void paint(Canvas canvas, Size size) {
    final maxBalance = (points.first['balance'] as num).toDouble();
    if (maxBalance <= 0 || points.length < 2) return;
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final x = size.width * i / (points.length - 1);
      final y = 18 + (1 - (points[i]['balance'] as num).toDouble() / maxBalance) * (size.height - 54);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 3..strokeCap = StrokeCap.round);
    canvas.drawCircle(Offset(0, 18), 4, Paint()..color = color);
    canvas.drawCircle(Offset(size.width, size.height - 36), 4, Paint()..color = color);
  }
  @override
  bool shouldRepaint(covariant _TimelinePainter old) => old.points != points || old.color != color;
}

class _PressureCard extends StatelessWidget {
  final Map<String, dynamic> pressure;
  const _PressureCard({required this.pressure});
  @override
  Widget build(BuildContext context) {
    final overdue = pressure['overdue'] as Map<String, dynamic>;
    final months = (pressure['months'] as List<dynamic>).cast<Map<String, dynamic>>();
    final maxValue = months.fold<num>(1, (value, month) => math.max(value, month['total'] as num));
    return _SectionCard(
      eyebrow: '未来还款压力',
      title: '未来 ${months.length} 个月共 ¥${calc.fmt(pressure['totalAhead'])}',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if ((overdue['count'] as int) > 0) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text('已逾期 ${overdue['count']} 期 · ¥${calc.fmt(overdue['amount'])}', style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w700))),
        SizedBox(
          height: 132,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final month in months)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Tooltip(
                      message: '${month['month']} · ¥${calc.fmt(month['total'])}',
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: Container(
                          height: 104 * (month['total'] as num).toDouble() / maxValue,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(3),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text('${months.first['month']} 至 ${months.last['month']} · 长按柱形可查看金额', style: Theme.of(context).textTheme.labelSmall),
      ]),
    );
  }
}

class _MonthlyRepaymentCard extends StatelessWidget {
  final List<Map<String, dynamic>> months;
  const _MonthlyRepaymentCard({required this.months});
  @override
  Widget build(BuildContext context) {
    if (months.isEmpty) return const SizedBox.shrink();
    final take = months.length > 6 ? months.sublist(months.length - 6) : months;
    return _SectionCard(
      eyebrow: '月还款统计',
      title: '最近 ${take.length} 个月',
      child: Column(children: [for (final month in take) _MonthLine(month: month)]),
    );
  }
}

class _MonthLine extends StatelessWidget {
  final Map<String, dynamic> month;
  const _MonthLine({required this.month});
  @override
  Widget build(BuildContext context) {
    final actual = month['actual'] as num;
    final scheduled = month['scheduled'] as num;
    return Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [SizedBox(width: 58, child: Text(month['month'] as String)), Expanded(child: LinearProgressIndicator(value: (actual + scheduled) == 0 ? 0 : actual / (actual + scheduled), minHeight: 7)), const SizedBox(width: 10), Text('¥${calc.fmt(actual + scheduled)}')]));
  }
}

class _RankCard extends StatelessWidget {
  final List<Debt> active;
  const _RankCard({required this.active});
  @override
  Widget build(BuildContext context) {
    final debts = List<Debt>.of(active)..sort((a, b) => b.balance.compareTo(a.balance));
    final total = debts.fold<num>(0, (sum, debt) => sum + debt.balance);
    num cumulative = 0;
    final shown = <Debt>[];
    for (final debt in debts) {
      shown.add(debt);
      cumulative += debt.balance;
      if (total > 0 && cumulative / total >= .7) {
        break;
      }
    }
    final max = debts.first.balance;
    return _SectionCard(
      eyebrow: '钱主要压在哪几笔',
      title: '前 ${shown.length} 笔占了 ${total == 0 ? 0 : (cumulative / total * 100).round()}%',
      child: Column(children: [for (var i = 0; i < shown.length; i++) _RankLine(index: i + 1, debt: shown[i], max: max)]),
    );
  }
}

class _RankLine extends StatelessWidget {
  final int index;
  final Debt debt;
  final num max;
  const _RankLine({required this.index, required this.debt, required this.max});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(children: [SizedBox(width: 24, child: Text('$index')), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Expanded(child: Text(debt.name, overflow: TextOverflow.ellipsis)), if (debt.rate >= 18) const Padding(padding: EdgeInsets.only(left: 4), child: Text('高息', style: TextStyle(color: Colors.red, fontSize: 11)))]), const SizedBox(height: 4), LinearProgressIndicator(value: max == 0 ? 0 : debt.balance / max, minHeight: 6)])), const SizedBox(width: 10), Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text('¥${calc.fmt(debt.balance)}'), Text('${debt.rate.toStringAsFixed(2)}%', style: Theme.of(context).textTheme.labelSmall)])]),
  );
}

class _TypeCard extends StatelessWidget {
  final Map<String, dynamic> data;
  const _TypeCard({required this.data});
  @override
  Widget build(BuildContext context) {
    final types = (data['typeList'] as List<dynamic>).cast<Map<String, dynamic>>();
    final total = data['totalBalance'] as num;
    return _SectionCard(
      eyebrow: '债务类型构成',
      title: '余额按借款类型分布',
      child: Column(children: [for (final type in types) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [SizedBox(width: 90, child: Text(type['name'] as String, overflow: TextOverflow.ellipsis)), Expanded(child: LinearProgressIndicator(value: total == 0 ? 0 : (type['value'] as num) / total, minHeight: 8)), const SizedBox(width: 10), Text('¥${calc.fmt(type['value'])}')]))]),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String eyebrow;
  final String title;
  final Widget child;
  const _SectionCard({required this.eyebrow, required this.title, required this.child});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(eyebrow, style: Theme.of(context).textTheme.labelLarge), const SizedBox(height: 3), Text(title, style: Theme.of(context).textTheme.titleLarge), const SizedBox(height: 14), child]),
    ),
  );
}
