import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';
import 'package:after_zero/export/report_export_service.dart';
import 'package:after_zero/report/findings.dart';
import 'package:after_zero/report/rich_body.dart';
import 'package:after_zero/ui/mine/premium_screen.dart';

import 'strategy_compare_screen.dart';

/// “统计”页是报告：先给当前判断（报告头）→ 三件值得注意的事 + 最该先动手的地方
/// （findings.dart 规则引擎）→ 多策略对比入口 → 还清路径 → 未来压力 → 余额排行 →
/// 类型构成 → 如果只做一件事 + 导出 + 计算口径说明。与旧版 react/src/report 逐段对齐。
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
    final payoff = data['payoffDate'] as String?;
    final monthsLeft = _monthsUntil(payoff);
    final findings = buildFindings(
      toDebtRows(active),
      data,
      pressure,
    );
    final lead = findings.where((finding) => finding.actionable).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('统计')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 36),
        children: [
          _ReportHead(data: data, summary: summary, monthsLeft: monthsLeft),
          const SizedBox(height: 26),
          _InsightSection(findings: findings),
          if (findings.isNotEmpty)
            _ActionBox(lead: findings.where((f) => f.actionable).firstOrNull),
          if (active.length >= 2) ...[
            const SizedBox(height: 26),
            const _StrategyCtaSection(),
          ],
          const SizedBox(height: 26),
          _JourneyCard(data: data, summary: summary, monthsLeft: monthsLeft),
          const SizedBox(height: 26),
          _PressureCard(pressure: pressure),
          const SizedBox(height: 26),
          _RankCard(active: active),
          const SizedBox(height: 26),
          _TypeCard(data: data),
          const SizedBox(height: 26),
          _OutroCard(lead: lead, premium: premium),
          const SizedBox(height: 8),
          const _NoteToggle(),
        ],
      ),
    );
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
                : '还没有记录任何债务。到"首页"新增一笔之后，这里会生成一份完整的分析报告。',
            textAlign: TextAlign.center,
          ),
          if ((summary['settled'] as int) > 0) ...[
            const SizedBox(height: 18),
            _ExportRow(premium: premium),
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
    final total = (data['totalBalance'] as num).toDouble();
    final date = data['payoffDate'] as String?;
    final timeline = (data['timeline'] as List<dynamic>?) ?? const [];
    final falling = date != null && total > 0;
    final settled = (summary['settled'] as int?) ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '债务体检 · ${timeline.isEmpty ? '' : (timeline.first as Map)['date']}',
          style: Theme.of(context).textTheme.labelLarge,
        ),
        const SizedBox(height: 5),
        Text.rich(
          TextSpan(
            children: falling
                ? const [
                    TextSpan(text: '你的负债正在'),
                    TextSpan(
                      text: '稳定下降',
                      style: TextStyle(fontStyle: FontStyle.italic),
                    ),
                  ]
                : const [TextSpan(text: '当前负债概况')],
          ),
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        RichBody(
          '目前还欠 **¥${calc.fmt(total)}**，分布在 **${summary['active']}** 笔债务里'
          '${settled > 0 ? '（另有 **$settled** 笔已结清）' : ''}。 '
          '已经还掉本金 **¥${calc.fmt(summary['paidPrincipal'])}**，走完了全程的 '
          '**${summary['pct']}%**。'
          '${date != null
              ? ' 按现在的还款计划，每月要还 **¥${calc.fmt(summary['monthly'])}**，'
                    '${monthsLeft != null ? '**$monthsLeft** 个月后' : ''}（$date）这个数字会归零。'
              : ' 当前没有未还的还款计划，算不出还清日期。'}',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.55),
        ),
      ],
    );
  }
}

const _cnNum = ['', '一', '两', '三'];

Color _toneFg(BuildContext context, FindingTone tone) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (tone) {
    FindingTone.risk => dark ? const Color(0xFFEE7B7B) : const Color(0xFFBE3A3A),
    FindingTone.warn => dark ? const Color(0xFFD69A3C) : const Color(0xFFA66A0A),
    FindingTone.info || FindingTone.good => dark
        ? const Color(0xFF6FA8D6)
        : const Color(0xFF2E5F8A),
  };
}

Color _toneBg(BuildContext context, FindingTone tone) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (tone) {
    FindingTone.risk => dark ? const Color(0xFF402F31) : const Color(0xFFF9E8E8),
    FindingTone.warn => dark ? const Color(0xFF3A3225) : const Color(0xFFFAF0D9),
    FindingTone.info || FindingTone.good => dark
        ? const Color(0xFF29353E)
        : const Color(0xFFE1EBF4),
  };
}

IconData _findingIcon(Finding finding) => switch (finding.id) {
  'concentration' => Icons.paid_outlined,
  'highrate' => Icons.error_outline,
  'peak' => Icons.show_chart,
  _ => Icons.check_circle_outline,
};

class _InsightSection extends StatelessWidget {
  final List<Finding> findings;
  const _InsightSection({required this.findings});
  @override
  Widget build(BuildContext context) {
    if (findings.isEmpty) return const SizedBox.shrink();
    final top3 = findings.take(3).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('这段时间发生了什么', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        Text(
          '${top3.length < _cnNum.length ? _cnNum[top3.length] : top3.length}件值得注意的事',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        for (final finding in top3)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 11),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: _toneBg(context, finding.tone),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(
                    _findingIcon(finding),
                    size: 16,
                    color: _toneFg(context, finding.tone),
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        finding.title,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 3),
                      RichBody(
                        finding.body,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          height: 1.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ActionBox extends StatelessWidget {
  final Finding? lead;
  const _ActionBox({required this.lead});
  @override
  Widget build(BuildContext context) {
    if (lead == null || lead!.actionTitle == null || lead!.detail == null) {
      return const SizedBox.shrink();
    }
    final detail = lead!.detail!;
    final fg = _toneFg(context, lead!.tone);
    final bg = _toneBg(context, lead!.tone);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 22),
        Text('最该先动手的地方', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 4),
        Text(
          lead!.actionTitle!,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(_findingIcon(lead!), size: 15, color: fg),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      detail.top,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: fg,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 7),
              RichBody(
                detail.body,
                style: const TextStyle(fontSize: 12.5, height: 1.7),
              ),
              const SizedBox(height: 10),
              for (final bar in detail.bars)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 52,
                        child: Text(
                          bar.nm,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            height: 6,
                            color: Colors.black.withValues(alpha: .10),
                            alignment: Alignment.centerLeft,
                            child: FractionallySizedBox(
                              widthFactor: math.max(.03, bar.pct),
                              child: Container(
                                height: 6,
                                color: fg,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 62,
                        child: Text(
                          bar.rt,
                          textAlign: TextAlign.right,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: fg,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (detail.rest != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      detail.rest!,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.black.withValues(alpha: .6),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StrategyCtaSection extends StatelessWidget {
  const _StrategyCtaSection();
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('再往下一步', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 4),
      Text(
        '该按什么顺序还，能省下最多利息？',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 12),
      const _StrategyCta(),
    ],
  );
}

class _StrategyCta extends ConsumerWidget {
  const _StrategyCta();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final premium = ref.watch(premiumProvider);
    return Card(
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
  int? _active;

  @override
  Widget build(BuildContext context) {
    final timeline = (widget.data['timeline'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final total = (widget.data['totalBalance'] as num).toDouble();
    if (timeline.length < 2 || total <= 0) {
      return const _SectionCard(
        eyebrow: '还清这件事进行到哪了',
        title: '暂无足够数据',
        child: Text('没有在还债务，或者还款计划里没有未还的期次。'),
      );
    }
    final n = timeline.length;
    var halfIdx = timeline.indexWhere(
      (p) => (p['balance'] as num).toDouble() <=
          (timeline.first['balance'] as num).toDouble() / 2,
    );
    if (halfIdx < 0) halfIdx = n ~/ 2;
    final selected = _active == null ? null : timeline[_active!];
    return _SectionCard(
      eyebrow: '还清这件事进行到哪了',
      title:
          '已经走完 ${widget.summary['pct']}%${widget.monthsLeft == null ? '' : '，还剩 ${widget.monthsLeft} 个月'}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            selected == null
                ? '按住曲线左右拖，看任意时间点的余额'
                : '${selected['date']} · 余额 ¥${calc.fmt(selected['balance'])}',
            style: TextStyle(
              fontWeight: selected == null ? FontWeight.w400 : FontWeight.w700,
              color: selected == null
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : null,
            ),
          ),
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onHorizontalDragStart: (details) => _pick(
                  details.localPosition.dx,
                  width,
                  n,
                ),
                onHorizontalDragUpdate: (details) => _pick(
                  details.localPosition.dx,
                  width,
                  n,
                ),
                onHorizontalDragEnd: (_) => setState(() => _active = null),
                onTapDown: (details) => _pick(
                  details.localPosition.dx,
                  width,
                  n,
                ),
                child: SizedBox(
                  height: 180,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _TimelinePainter(
                            timeline,
                            Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ),
                      ..._milestoneNodes(
                        context,
                        timeline,
                        halfIdx,
                        width,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  List<Widget> _milestoneNodes(
    BuildContext context,
    List<Map<String, dynamic>> timeline,
    int halfIdx,
    double width,
  ) {
    final n = timeline.length;
    final t0 =
        (calc.parseDate(timeline.first['date'] as String) ??
                DateTime.fromMillisecondsSinceEpoch(0))
            .millisecondsSinceEpoch;
    final tEnd =
        (calc.parseDate(timeline.last['date'] as String) ??
                DateTime.fromMillisecondsSinceEpoch(0))
            .millisecondsSinceEpoch;
    final span = tEnd - t0;
    double xFor(int i) => span > 0
        ? ((calc.parseDate(timeline[i]['date'] as String) ??
                      DateTime.fromMillisecondsSinceEpoch(0))
                  .millisecondsSinceEpoch -
              t0) /
              span *
              width
        : width * i / (n - 1);
    final nice = calc.niceCeil((timeline.first['balance'] as num).toDouble());
    final top = nice > 0 ? nice : 1.0;
    double yFor(num balance) => (1 - balance.toDouble() / top) * 100;
    final nodes = [
      (i: 0, label: '今天', align: CrossAxisAlignment.start),
      (i: halfIdx, label: '还掉一半', align: CrossAxisAlignment.center),
      (i: n - 1, label: '归零', align: CrossAxisAlignment.end),
    ];
    return [
      for (final node in nodes)
        Positioned(
          left: node.align == CrossAxisAlignment.start
              ? 0
              : node.align == CrossAxisAlignment.center
              ? xFor(node.i) - 60
              : null,
          right: node.align == CrossAxisAlignment.end ? 0 : null,
          top: node.align == CrossAxisAlignment.center
              ? yFor((timeline[node.i]['balance'] as num)) + 18
              : math.max(0, yFor((timeline[node.i]['balance'] as num)) - 52),
          width: node.align == CrossAxisAlignment.center ? 120 : null,
          child: Text(
            '${node.label} ${(timeline[node.i]['date'] as String).substring(0, 7)}\n¥${calc.fmt(timeline[node.i]['balance'])}',
            textAlign: node.align == CrossAxisAlignment.center
                ? TextAlign.center
                : node.align == CrossAxisAlignment.end
                ? TextAlign.right
                : TextAlign.left,
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ),
    ];
  }

  void _pick(double x, double width, int length) {
    final index = ((x / width).clamp(0, 1) * (length - 1)).round();
    if (index != _active) setState(() => _active = index);
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
    final line = Path();
    final area = Path();
    for (var i = 0; i < points.length; i++) {
      final x = size.width * i / (points.length - 1);
      final y =
          18 +
          (1 - (points[i]['balance'] as num).toDouble() / maxBalance) *
              (size.height - 54);
      if (i == 0) {
        line.moveTo(x, y);
        area.moveTo(x, size.height - 36);
        area.lineTo(x, y);
      } else {
        line.lineTo(x, y);
        area.lineTo(x, y);
      }
    }
    area
      ..lineTo(size.width, size.height - 36)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..color = color.withValues(alpha: .10)
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      line,
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
  }

  @override
  bool shouldRepaint(covariant _TimelinePainter old) =>
      old.points != points || old.color != color;
}

class _PressureCard extends StatefulWidget {
  final Map<String, dynamic> pressure;
  const _PressureCard({required this.pressure});

  @override
  State<_PressureCard> createState() => _PressureCardState();
}

class _PressureCardState extends State<_PressureCard> {
  bool _area = false;
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
    final totalAhead = widget.pressure['totalAhead'] as num;
    final monthlyAvg = widget.pressure['monthlyAvg'] as num;
    return _SectionCard(
      eyebrow: '接下来哪个月最难',
      title: '未来还款压力',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '未来 ${months.length} 个月一共要还 ¥${calc.fmt(totalAhead)}，'
            '平均每月 ¥${calc.fmt(monthlyAvg)}。'
            '${(overdue['count'] as int) > 0 ? '另有 ${overdue['count']} 期已逾期（¥${calc.fmt(overdue['amount'])}），未计入下方。' : ''}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(height: 1.55),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _ToggleChip(
                label: '面积',
                selected: _area,
                onTap: () => setState(() => _area = true),
              ),
              const SizedBox(width: 8),
              _ToggleChip(
                label: '柱状',
                selected: !_area,
                onTap: () => setState(() => _area = false),
              ),
              const Spacer(),
              const _LegendDot(color: Color(0xFF6FBE9E), label: '本金'),
              const SizedBox(width: 12),
              const _LegendDot(color: Color(0xFF2E5F8A), label: '利息'),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 150,
            child: _area
                ? CustomPaint(
                    size: Size.infinite,
                    painter: _PressureAreaPainter(
                      months,
                      maxValue.toDouble(),
                      Theme.of(context).colorScheme.primary,
                    ),
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (var i = 0; i < months.length; i++)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () =>
                                  setState(() => _selected = i == _selected ? null : i),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  AnimatedContainer(
                                    duration: const Duration(milliseconds: 160),
                                    height:
                                        110 *
                                        (months[i]['total'] as num).toDouble() /
                                        maxValue,
                                    decoration: BoxDecoration(
                                      color: _selected == i
                                          ? Theme.of(
                                              context,
                                            ).colorScheme.tertiary
                                          : Theme.of(
                                              context,
                                            ).colorScheme.primary,
                                      borderRadius: const BorderRadius.vertical(
                                        top: Radius.circular(3),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${int.parse((months[i]['month'] as String).substring(5, 7))}',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.labelSmall,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 10),
          Text(
            '点任意一个月看它要还哪些债务，再点一次收起',
            style: Theme.of(context).textTheme.labelSmall,
          ),
          if (selected != null && !_area) ...[
            const SizedBox(height: 10),
            for (final item
                in ((selected['items'] as List<dynamic>?) ?? const [])
                    .cast<Map<String, dynamic>>())
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(item['name'] as String? ?? ''),
                    ),
                    Text('¥${calc.fmt(item['amount'])}'),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _ToggleChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ToggleChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: .14) : null,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? accent : Theme.of(context).colorScheme.outline,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: selected ? accent : Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 4),
      Text(label, style: Theme.of(context).textTheme.labelSmall),
    ],
  );
}

class _PressureAreaPainter extends CustomPainter {
  final List<Map<String, dynamic>> months;
  final double maxValue;
  final Color color;
  const _PressureAreaPainter(this.months, this.maxValue, this.color);
  @override
  void paint(Canvas canvas, Size size) {
    if (months.isEmpty || maxValue <= 0) return;
    final path = Path();
    for (var i = 0; i < months.length; i++) {
      final x = size.width * i / (months.length - 1);
      final y = size.height * (1 - (months[i]['total'] as num).toDouble() / maxValue);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    final area = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..color = color.withValues(alpha: .18)
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _PressureAreaPainter old) =>
      old.months != months || old.maxValue != maxValue || old.color != color;
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
    final rest = debts.skip(shown.length).toList();
    final max = debts.first.balance;
    return _SectionCard(
      eyebrow: '钱主要压在哪几笔',
      title:
          '前 ${shown.length} 笔占了 ${total == 0 ? 0 : (cumulative / total * 100).round()}%',
      child: Column(
        children: [
          for (var i = 0; i < shown.length; i++)
            _RankLine(index: i + 1, debt: shown[i], max: max),
          if (rest.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '其余 ${rest.length} 笔 · ¥${calc.fmt(rest.fold<num>(0, (s, d) => s + d.balance))}',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
            ),
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
    final total = (widget.data['totalBalance'] as num).toDouble();
    final top = types.isEmpty ? null : types.first;
    final topShare = total > 0 && top != null
        ? ((top['value'] as num) / total * 100).round()
        : 0;
    return _SectionCard(
      eyebrow: '这些债务是什么类型',
      title: top == null ? '暂无类型数据' : '${top['name']}占了 $topShare%',
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
                    total,
                    _rotation,
                    _typeColors(context),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('总负债'),
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
                  const Spacer(),
                  Text(
                    '${total == 0 ? 0 : ((types[i]['value'] as num) / total * 100).round()}%',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 12),
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

class _OutroCard extends StatelessWidget {
  final Finding? lead;
  final Premium premium;
  const _OutroCard({required this.lead, required this.premium});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('如果只做一件事', style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 4),
      Text(
        lead != null && lead!.actionTitle != null
            ? '${lead!.actionTitle}。'
            : '保持现在的还款节奏。',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 12),
      _ExportRow(premium: premium),
    ],
  );
}

class _ExportRow extends ConsumerWidget {
  final Premium premium;
  const _ExportRow({required this.premium});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('导出这份报告', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _export(context, ref, 'Excel'),
                  icon: const Icon(Icons.table_chart_outlined),
                  label: const Text('Excel'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _export(context, ref, 'PDF'),
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

  Future<void> _export(BuildContext context, WidgetRef ref, String kind) async {
    if (!premium.hasPremium) {
      Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (_) => const PremiumScreen()));
      return;
    }
    try {
      final debts = ref.read(debtsProvider);
      final exporter = ref.read(reportExportServiceProvider);
      final saver = ref.read(systemFileSaverProvider);
      final stamp = exportDateStamp();
      final bytes = kind == 'Excel'
          ? exporter.buildExcel(debts)
          : await exporter.buildPdf(debts);
      final saved = await saver.saveBytes(
        bytes: bytes,
        filename: 'AfterZero统计报表$stamp.${kind == 'Excel' ? 'xlsx' : 'pdf'}',
        mimeType: kind == 'Excel' ? reportExcelMime : reportPdfMime,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(saved ? '$kind 已保存 ✓' : '已取消保存')),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$kind 导出失败：$error')));
      }
    }
  }
}

class _NoteToggle extends StatefulWidget {
  const _NoteToggle();
  @override
  State<_NoteToggle> createState() => _NoteToggleState();
}

class _NoteToggleState extends State<_NoteToggle> {
  bool _open = false;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      InkWell(
        onTap: () => setState(() => _open = !_open),
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '计算口径说明',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                _open ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                size: 16,
                color: Theme.of(context).colorScheme.primary,
              ),
            ],
          ),
        ),
      ),
      if (_open)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: RichBody(
            '在还总负债 = 各未结清债务「未还本金」之和（只算本金，不含未来的利息/手续费）。\n'
            '已还本金 = 全部债务（**含已结清**）已标记为「已还」期次的本金之和；另付利息 = 这些期次对应的利息/手续费之和。\n'
            '经常性月供 = 各未结清债务下一期应还金额之和（不含标记为「一次性还清」的借款）。\n'
            '归零进度 = 已还本金 ÷（已还本金 + 在还总负债），只按本金计算。\n'
            '预计还清日期 = 按现有还款计划里最晚的未还期次推算，**是预测不是承诺**，没有把提前还款算进去。\n'
            '「提前结清」会问你实际付了多少钱，并把剩余期次合并成一条结清记录：剩余本金计入已还本金，实付超出剩余本金的部分计入另付利息（协商减免则记为负数）。未来那些期原本的利息不会被算成你付过——提前结清本来就免掉了它们。\n'
            '利率由每笔债务的还款计划反推（IRR）；剩余待付利息按现有计划算到还清为止，手动录入且没拆分本金/利息的债务会低估。',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(height: 1.7),
          ),
        ),
    ],
  );
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
