// 顶部汇总卡——复用calc.dart的summarizeDebts()，口径与现有 App 完全相同。
import 'package:flutter/material.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';

import '../theme.dart';

class SummaryHero extends StatelessWidget {
  final List<Debt> debts;

  const SummaryHero({super.key, required this.debts});

  @override
  Widget build(BuildContext context) {
    final summary = calc.summarizeDebts(
      debts.map((debt) => debt.toMap()).toList(),
    );
    final mutedHeroText = Colors.white.withValues(alpha: .82);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF214E43), brandSeedColor, Color(0xFF0F3029)],
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33000000),
              blurRadius: 18,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    '在还总负债',
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: mutedHeroText),
                  ),
                  const Spacer(),
                  Text(
                    '只算本金',
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall?.copyWith(color: mutedHeroText),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '¥${calc.fmt(summary['total'])}',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: (summary['pct'] as int) / 100,
                  minHeight: 8,
                  color: const Color(0xFFA5F1DB),
                  backgroundColor: Colors.white24,
                ),
              ),
              const SizedBox(height: 7),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '已还本金 ¥${calc.fmt(summary['paidPrincipal'])}',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: mutedHeroText),
                  ),
                  Text(
                    '已完成 ${summary['pct']}%',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: mutedHeroText),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              LayoutBuilder(
                builder: (context, constraints) => Wrap(
                  spacing: 12,
                  runSpacing: 14,
                  children: [
                    _kpi(
                      context,
                      constraints.maxWidth,
                      '已还本金',
                      '¥${calc.fmt(summary['paidPrincipal'])}',
                      sub: '另付利息 ¥${calc.fmt(summary['paidInterest'])}',
                    ),
                    _kpi(
                      context,
                      constraints.maxWidth,
                      '经常性月供',
                      '¥${calc.fmt(summary['monthly'])}',
                      sub: '不含一次性还清',
                    ),
                    _kpi(
                      context,
                      constraints.maxWidth,
                      '在还笔数',
                      '${summary['active']}',
                    ),
                    _kpi(
                      context,
                      constraints.maxWidth,
                      '已结清',
                      '${summary['settled']}',
                      valueColor: const Color(0xFFA5F1DB),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _kpi(
    BuildContext context,
    double width,
    String label,
    String value, {
    String? sub,
    Color? valueColor,
  }) {
    return SizedBox(
      width: (width - 12) / 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: valueColor ?? Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: Colors.white70),
          ),
          if (sub != null)
            Text(
              sub,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Colors.white60,
              ),
            ),
        ],
      ),
    );
  }
}
