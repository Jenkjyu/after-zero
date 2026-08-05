import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../calc/calc.dart' as calc;
import '../../data/models.dart';
import '../../data/providers.dart';

class StrategyCompareScreen extends ConsumerStatefulWidget {
  const StrategyCompareScreen({super.key});

  @override
  ConsumerState<StrategyCompareScreen> createState() =>
      _StrategyCompareScreenState();
}

class _StrategyCompareScreenState extends ConsumerState<StrategyCompareScreen> {
  final _extra = TextEditingController();
  List<String>? _customOrder;
  List<_StrategyResult>? _results;

  @override
  void dispose() {
    _extra.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active = ref
        .watch(debtsProvider)
        .where((debt) => debt.settled != true)
        .toList();
    _customOrder ??= active.map((debt) => debt.id).toList();
    _customOrder = _customOrder!
        .where((id) => active.any((debt) => debt.id == id))
        .toList();
    for (final debt in active) {
      if (!_customOrder!.contains(debt.id)) _customOrder!.add(debt.id);
    }
    return Scaffold(
      appBar: AppBar(title: const Text('多策略对比规划')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 36),
        children: [
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                '对比雪球法（先还余额最小）、雪崩法（先还利率最高）和自定义顺序。一笔还完后，它的月供会自动滚去加速下一笔。',
              ),
            ),
          ),
          if (active.length < 2)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text('至少要有 2 笔在还债务，才有还款顺序可比。'),
            )
          else ...[
            TextField(
              key: const Key('strategy-extra'),
              controller: _extra,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(labelText: '每月额外投入 ¥（不填按 0 算）'),
            ),
            const SizedBox(height: 16),
            Text('自定义顺序', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            for (var i = 0; i < _customOrder!.length; i++)
              _OrderRow(
                index: i,
                debt: active.firstWhere((debt) => debt.id == _customOrder![i]),
                count: _customOrder!.length,
                onMove: (direction) => setState(() {
                  final target = i + direction;
                  if (target < 0 || target >= _customOrder!.length) return;
                  final moved = _customOrder!.removeAt(i);
                  _customOrder!.insert(target, moved);
                }),
              ),
            const SizedBox(height: 12),
            FilledButton(
              key: const Key('run-strategy'),
              onPressed: () => _run(active),
              child: const Text('对比这三种策略'),
            ),
            if (_results != null) ...[
              const SizedBox(height: 18),
              _Results(results: _results!, active: active),
            ],
          ],
        ],
      ),
    );
  }

  void _run(List<Debt> active) {
    final maps = active.map((debt) => debt.toMap()).toList();
    final extra = math.max(0, num.tryParse(_extra.text) ?? 0);
    final defs = [
      ('雪球法', calc.snowballOrder(maps)),
      ('雪崩法', calc.avalancheOrder(maps)),
      ('自定义', List<String>.from(_customOrder!)),
    ];
    setState(() {
      _results = [
        for (final def in defs)
          _StrategyResult(
            label: def.$1,
            simulation: calc.simulateRepaymentOrder(maps, def.$2, extra),
          ),
      ];
    });
  }
}

class _OrderRow extends StatelessWidget {
  final int index;
  final Debt debt;
  final int count;
  final ValueChanged<int> onMove;
  const _OrderRow({
    required this.index,
    required this.debt,
    required this.count,
    required this.onMove,
  });
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: CircleAvatar(child: Text('${index + 1}')),
      title: Text(debt.name),
      subtitle: Text('余额 ¥${calc.fmt(debt.balance)}'),
      trailing: Wrap(
        children: [
          IconButton(
            onPressed: index == 0 ? null : () => onMove(-1),
            icon: const Icon(Icons.arrow_upward),
          ),
          IconButton(
            onPressed: index == count - 1 ? null : () => onMove(1),
            icon: const Icon(Icons.arrow_downward),
          ),
        ],
      ),
    ),
  );
}

class _StrategyResult {
  final String label;
  final Map<String, dynamic>? simulation;
  const _StrategyResult({required this.label, required this.simulation});
}

class _Results extends StatelessWidget {
  final List<_StrategyResult> results;
  final List<Debt> active;
  const _Results({required this.results, required this.active});
  @override
  Widget build(BuildContext context) {
    final valid = results.where((result) => result.simulation != null).toList();
    final best = valid.isEmpty
        ? null
        : valid.reduce(
            (a, b) =>
                (a.simulation!['totalInterest'] as num) <=
                    (b.simulation!['totalInterest'] as num)
                ? a
                : b,
          );
    return Column(
      children: [
        for (final result in results)
          Card(
            child: ListTile(
              title: Row(
                children: [
                  Text(result.label),
                  if (identical(result, best)) ...[
                    const SizedBox(width: 8),
                    const Chip(label: Text('总利息最省')),
                  ],
                ],
              ),
              subtitle: result.simulation == null
                  ? const Text('超过 50 年仍无法还清')
                  : Text(
                      '${result.simulation!['months']} 个月还清 · 总利息 ¥${calc.fmt(result.simulation!['totalInterest'])}',
                    ),
            ),
          ),
        if (valid.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: SizedBox(
                height: 180,
                width: double.infinity,
                child: CustomPaint(
                  painter: _StrategyPainter(
                    valid,
                    Theme.of(context).colorScheme,
                  ),
                  child: Align(
                    alignment: Alignment.bottomRight,
                    child: Text(
                      '剩余待还 ¥${calc.fmt(active.fold<num>(0, (sum, debt) => sum + debt.balance))}  ·  时间 →',
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                ),
              ),
            ),
          ),
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text(
            '测算按剩余本金、推算年化和当前月供做标准模型，实际以银行或平台账单为准。',
            style: TextStyle(fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _StrategyPainter extends CustomPainter {
  final List<_StrategyResult> results;
  final ColorScheme colors;
  const _StrategyPainter(this.results, this.colors);
  @override
  void paint(Canvas canvas, Size size) {
    final series = results.map((result) {
      final monthly = (result.simulation!['monthly'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      return [
        for (final point in monthly) (point['balance'] as num).toDouble(),
      ];
    }).toList();
    final maxLength = series.fold<int>(
      1,
      (max, points) => math.max(max, points.length),
    );
    final maxBalance = series
        .expand((points) => points)
        .fold<double>(1, math.max);
    final palette = [colors.primary, colors.tertiary, colors.error];
    for (var s = 0; s < series.length; s++) {
      final path = Path()..moveTo(0, 10);
      for (var i = 0; i < series[s].length; i++) {
        final x = size.width * (i + 1) / maxLength;
        final y = 10 + (1 - series[s][i] / maxBalance) * (size.height - 38);
        path.lineTo(x, y);
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = palette[s % palette.length]
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _StrategyPainter oldDelegate) => true;
}
