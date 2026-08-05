import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';
import 'package:after_zero/ui/mine/premium_screen.dart';

import 'strategy_compare_screen.dart';

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
    final premium = ref.watch(premiumProvider);
    if (active.isEmpty) {
      return _ReportEmpty(summary: summary, premium: premium);
    }
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
          if (active.length >= 2) ...[
            const SizedBox(height: 18),
            _StrategyCta(premium: premium),
          ],
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
          const SizedBox(height: 24),
          _ExportCard(premium: premium),
        ],
      ),
    );
  }
}

class _StrategyCta extends StatelessWidget {
  final Premium premium;
  const _StrategyCta({required this.premium});
  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.primaryContainer,
    child: ListTile(
      leading: const Icon(Icons.compare_arrows),
      title: const Text('多策略对比规划'),
      subtitle: const Text('雪球法、雪崩法和自定义顺序，看看哪种最省利息'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => premium.hasPremium
              ? const StrategyCompareScreen()
              : const PremiumScreen(),
        ),
      ),
    ),
  );
}

class _ExportCard extends StatelessWidget {
  final Premium premium;
  const _ExportCard({required this.premium});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('导出报告', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _export(context, 'Excel'),
                  icon: const Icon(Icons.table_chart_outlined),
                  label: const Text('Excel'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _export(context, 'PDF'),
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: const Text('PDF'),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  void _export(BuildContext context, String kind) {
    if (!premium.hasPremium) {
      Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (_) => const PremiumScreen()));
      return;
    }
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$kind 生成与系统“另存为”将在阶段 7 接入')));
  }
}

int? _monthsUntil(String? date) {
  final target = date == null ? null : calc.parseDate(date);
  if (target == null) return null;
  final today = calc.today0();
  return math.max(
    0,
    (target.year - today.year) * 12 + target.month - today.month,
  );
}

class _ReportEmpty extends StatelessWidget {
  final Map<String, dynamic> summary;
  final Premium premium;
  const _ReportEmpty({required this.summary, required this.premium});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('统计')),
    body: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.verified_outlined,
            size: 56,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 14),
          Text('目前没有在还的债务', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            (summary['settled'] as int) > 0
                ? '已经结清 ${summary['settled']} 笔，累计还掉本金 ¥${calc.fmt(summary['paidPrincipal'])}。'
                : '新增一笔债务后，这里会生成一份完整的分析报告。',
            textAlign: TextAlign.center,
          ),
          if ((summary['settled'] as int) > 0) ...[
            const SizedBox(height: 18),
            _ExportCard(premium: premium),
          ],
        ],
      ),
    ),
  );
}

class _ReportHead extends StatelessWidget {
  final Map<String, dynamic> data;
  final Map<String, dynamic> summary;
  final int? monthsLeft;
  const _ReportHead({
    required this.data,
    required this.summary,
    required this.monthsLeft,
  });
  @override
  Widget build(BuildContext context) {
    final total = data['totalBalance'] as num;
    final date = data['payoffDate'] as String?;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '债务体检 · ${calc.fmtDate(calc.today0())}',
          style: Theme.of(context).textTheme.labelLarge,
        ),
        const SizedBox(height: 5),
        Text(
          date == null ? '当前负债概况' : '你的负债正在稳定下降',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          '目前还欠 ¥${calc.fmt(total)}，分布在 ${summary['active']} 笔债务里；已还本金 ¥${calc.fmt(summary['paidPrincipal'])}，已走完 ${summary['pct']}%。${date == null ? ' 当前没有可推算的还清日期。' : ' 按当前计划，每月约还 ¥${calc.fmt(summary['monthly'])}，${monthsLeft ?? 0} 个月后（$date）归零。'}',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.55),
        ),
      ],
    );
  }
}

class _InsightSection extends StatelessWidget {
  final List<Debt> active;
  final Map<String, dynamic> pressure;
  const _InsightSection({required this.active, required this.pressure});
  @override
  Widget build(BuildContext context) {
    final high = active.where((debt) => debt.rate >= 18).toList()
      ..sort((a, b) => b.rate.compareTo(a.rate));
    final peak = pressure['peak'] as Map<String, dynamic>?;
    final overdue = pressure['overdue'] as Map<String, dynamic>;
    final insights = <(IconData, String, String)>[
      if (high.isNotEmpty)
        (
          Icons.local_fire_department_outlined,
          '高息债务优先处理',
          '${high.first.name} 的推算年化为 ${high.first.rate.toStringAsFixed(2)}%，是当前最高的一笔。',
        ),
      if ((overdue['count'] as int) > 0)
        (
          Icons.warning_amber_rounded,
          '有 ${overdue['count']} 期已逾期',
          '逾期金额 ¥${calc.fmt(overdue['amount'])}，建议先处理已错过的款项。',
        ),
      if (peak != null)
        (
          Icons.trending_up,
          '压力最高的月份',
          '${peak['month']} 预计需还 ¥${calc.fmt(peak['total'])}，提前安排现金流。',
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('这段时间发生了什么', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        Text(
          '${insights.length}件值得注意的事',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        for (final insight in insights)
          Card(
            child: ListTile(
              leading: Icon(insight.$1),
              title: Text(insight.$2),
              subtitle: Text(insight.$3),
            ),
          ),
      ],
    );
  }
}

class _JourneyCard extends StatefulWidget {
  final Map<String, dynamic> data;
  final Map<String, dynamic> summary;
  final int? monthsLeft;
  const _JourneyCard({
    required this.data,
    required this.summary,
    required this.monthsLeft,
  });

  @override
  State<_JourneyCard> createState() => _JourneyCardState();
}

class _JourneyCardState extends State<_JourneyCard> {
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final timeline = (widget.data['timeline'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final selected = _selected == null ? null : timeline[_selected!];
    return _SectionCard(
      eyebrow: '还清这件事进行到哪了',
      title:
          '已经走完 ${widget.summary['pct']}%${widget.monthsLeft == null ? '' : '，还剩 ${widget.monthsLeft} 个月'}',
      child: timeline.length < 2
          ? const Text('暂无足够的还款计划数据。')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (selected != null)
                  Text(
                    '${selected['date']} · 剩余 ¥${calc.fmt(selected['balance'])}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                const SizedBox(height: 4),
                LayoutBuilder(
                  builder: (context, constraints) => GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onHorizontalDragStart: (details) => _pick(
                      details.localPosition.dx,
                      constraints.maxWidth,
                      timeline.length,
                    ),
                    onHorizontalDragUpdate: (details) => _pick(
                      details.localPosition.dx,
                      constraints.maxWidth,
                      timeline.length,
                    ),
                    onTapDown: (details) => _pick(
                      details.localPosition.dx,
                      constraints.maxWidth,
                      timeline.length,
                    ),
                    child: SizedBox(
                      height: 180,
                      child: CustomPaint(
                        painter: _TimelinePainter(
                          timeline,
                          Theme.of(context).colorScheme.primary,
                          selectedIndex: _selected,
                        ),
                        child: Align(
                          alignment: Alignment.bottomCenter,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text(
                              '${timeline.first['date']}  →  ${timeline.last['date']} · 拖动查看',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  void _pick(double x, double width, int length) {
    final index = ((x / width).clamp(0, 1) * (length - 1)).round();
    if (index != _selected) setState(() => _selected = index);
  }
}

class _TimelinePainter extends CustomPainter {
  final List<Map<String, dynamic>> points;
  final Color color;
  final int? selectedIndex;
  const _TimelinePainter(this.points, this.color, {this.selectedIndex});
  @override
  void paint(Canvas canvas, Size size) {
    final maxBalance = (points.first['balance'] as num).toDouble();
    if (maxBalance <= 0 || points.length < 2) return;
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final x = size.width * i / (points.length - 1);
      final y =
          18 +
          (1 - (points[i]['balance'] as num).toDouble() / maxBalance) *
              (size.height - 54);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(Offset(0, 18), 4, Paint()..color = color);
    canvas.drawCircle(
      Offset(size.width, size.height - 36),
      4,
      Paint()..color = color,
    );
    if (selectedIndex != null) {
      final i = selectedIndex!.clamp(0, points.length - 1);
      final x = size.width * i / (points.length - 1);
      final y =
          18 +
          (1 - (points[i]['balance'] as num).toDouble() / maxBalance) *
              (size.height - 54);
      canvas.drawLine(
        Offset(x, 10),
        Offset(x, size.height - 28),
        Paint()
          ..color = color.withValues(alpha: .35)
          ..strokeWidth = 1,
      );
      canvas.drawCircle(Offset(x, y), 6, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _TimelinePainter old) =>
      old.points != points ||
      old.color != color ||
      old.selectedIndex != selectedIndex;
}

class _PressureCard extends StatefulWidget {
  final Map<String, dynamic> pressure;
  const _PressureCard({required this.pressure});

  @override
  State<_PressureCard> createState() => _PressureCardState();
}

class _PressureCardState extends State<_PressureCard> {
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final overdue = widget.pressure['overdue'] as Map<String, dynamic>;
    final months = (widget.pressure['months'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final selected = _selected == null ? null : months[_selected!];
    final maxValue = months.fold<num>(
      1,
      (value, month) => math.max(value, month['total'] as num),
    );
    return _SectionCard(
      eyebrow: '未来还款压力',
      title:
          '未来 ${months.length} 个月共 ¥${calc.fmt(widget.pressure['totalAhead'])}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if ((overdue['count'] as int) > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                '已逾期 ${overdue['count']} 期 · ¥${calc.fmt(overdue['amount'])}',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          SizedBox(
            height: 132,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < months.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => setState(() => _selected = i),
                        child: Tooltip(
                          message:
                              '${months[i]['month']} · ¥${calc.fmt(months[i]['total'])}',
                          child: Align(
                            alignment: Alignment.bottomCenter,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 160),
                              height:
                                  104 *
                                  (months[i]['total'] as num).toDouble() /
                                  maxValue,
                              decoration: BoxDecoration(
                                color: _selected == i
                                    ? Theme.of(context).colorScheme.tertiary
                                    : Theme.of(context).colorScheme.primary,
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(3),
                                ),
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
          Text(
            selected == null
                ? '${months.first['month']} 至 ${months.last['month']} · 点柱形查看金额'
                : '${selected['month']} · ¥${calc.fmt(selected['total'])}',
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ],
      ),
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
      child: Column(
        children: [for (final month in take) _MonthLine(month: month)],
      ),
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 58, child: Text(month['month'] as String)),
          Expanded(
            child: LinearProgressIndicator(
              value: (actual + scheduled) == 0
                  ? 0
                  : actual / (actual + scheduled),
              minHeight: 7,
            ),
          ),
          const SizedBox(width: 10),
          Text('¥${calc.fmt(actual + scheduled)}'),
        ],
      ),
    );
  }
}

class _RankCard extends StatelessWidget {
  final List<Debt> active;
  const _RankCard({required this.active});
  @override
  Widget build(BuildContext context) {
    final debts = List<Debt>.of(active)
      ..sort((a, b) => b.balance.compareTo(a.balance));
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
      title:
          '前 ${shown.length} 笔占了 ${total == 0 ? 0 : (cumulative / total * 100).round()}%',
      child: Column(
        children: [
          for (var i = 0; i < shown.length; i++)
            _RankLine(index: i + 1, debt: shown[i], max: max),
        ],
      ),
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
    child: Row(
      children: [
        SizedBox(width: 24, child: Text('$index')),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(debt.name, overflow: TextOverflow.ellipsis),
                  ),
                  if (debt.rate >= 18)
                    const Padding(
                      padding: EdgeInsets.only(left: 4),
                      child: Text(
                        '高息',
                        style: TextStyle(color: Colors.red, fontSize: 11),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              LinearProgressIndicator(
                value: max == 0 ? 0 : debt.balance / max,
                minHeight: 6,
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('¥${calc.fmt(debt.balance)}'),
            Text(
              '${debt.rate.toStringAsFixed(2)}%',
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
        ),
      ],
    ),
  );
}

class _TypeCard extends StatefulWidget {
  final Map<String, dynamic> data;
  const _TypeCard({required this.data});

  @override
  State<_TypeCard> createState() => _TypeCardState();
}

class _TypeCardState extends State<_TypeCard> {
  double _rotation = -.5 * math.pi;

  @override
  Widget build(BuildContext context) {
    final types = (widget.data['typeList'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final total = widget.data['totalBalance'] as num;
    return _SectionCard(
      eyebrow: '债务类型构成',
      title: '余额按借款类型分布',
      child: Column(
        children: [
          if (types.isNotEmpty)
            GestureDetector(
              onPanUpdate: (details) =>
                  setState(() => _rotation += details.delta.dx * .012),
              child: SizedBox(
                height: 190,
                width: 190,
                child: CustomPaint(
                  painter: _TypePiePainter(
                    types,
                    total.toDouble(),
                    _rotation,
                    _typeColors(context),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('总余额'),
                        Text(
                          '¥${calc.fmt(total)}',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          for (var i = 0; i < types.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: _typeColors(
                        context,
                      )[i % _typeColors(context).length],
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 90,
                    child: Text(
                      types[i]['name'] as String,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Expanded(
                    child: LinearProgressIndicator(
                      value: total == 0
                          ? 0
                          : (types[i]['value'] as num) / total,
                      minHeight: 8,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text('¥${calc.fmt(types[i]['value'])}'),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

List<Color> _typeColors(BuildContext context) => [
  Theme.of(context).colorScheme.primary,
  Theme.of(context).colorScheme.tertiary,
  Colors.orange,
  Colors.blue,
  Colors.pink,
  Colors.teal,
];

class _TypePiePainter extends CustomPainter {
  final List<Map<String, dynamic>> types;
  final double total;
  final double rotation;
  final List<Color> colors;
  const _TypePiePainter(this.types, this.total, this.rotation, this.colors);

  @override
  void paint(Canvas canvas, Size size) {
    if (total <= 0) return;
    final rect = Offset.zero & size;
    var start = rotation;
    for (var i = 0; i < types.length; i++) {
      final sweep = (types[i]['value'] as num).toDouble() / total * math.pi * 2;
      canvas.drawArc(
        rect.deflate(24),
        start,
        sweep,
        false,
        Paint()
          ..color = colors[i % colors.length]
          ..style = PaintingStyle.stroke
          ..strokeWidth = 34,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _TypePiePainter oldDelegate) =>
      oldDelegate.types != types ||
      oldDelegate.total != total ||
      oldDelegate.rotation != rotation;
}

class _SectionCard extends StatelessWidget {
  final String eyebrow;
  final String title;
  final Widget child;
  const _SectionCard({
    required this.eyebrow,
    required this.title,
    required this.child,
  });
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(eyebrow, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 3),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 14),
          child,
        ],
      ),
    ),
  );
}
