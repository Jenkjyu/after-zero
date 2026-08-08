// 债务卡片——信息字段与现有 App 对齐；长按拖拽和左滑还款由债务列表承接。
import 'package:flutter/material.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';

import '../theme.dart';

class DebtCard extends StatelessWidget {
  final Debt debt;
  final VoidCallback onTap;

  const DebtCard({super.key, required this.debt, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rateClass = calc.rateClass(debt.rate);
    final metadata = [
      if (debt.funder != null && debt.funder!.isNotEmpty) '出资方：${debt.funder}',
      if (debt.type != null && debt.type!.isNotEmpty) debt.type!,
    ].join(' · ');
    final paymentLabel = debt.oneTime == true ? '一次性' : '下期';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 88,
                decoration: BoxDecoration(
                  color: rateClassColor(rateClass, scheme),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                debt.name,
                                style: Theme.of(context).textTheme.titleMedium,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (metadata.isNotEmpty) ...[
                                const SizedBox(height: 3),
                                Text(
                                  metadata,
                                  style: Theme.of(context).textTheme.bodySmall
                                      ?.copyWith(
                                        color: scheme.onSurfaceVariant,
                                      ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '¥${calc.fmt(debt.balance)}',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              '剩余待还',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: scheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (debt.rate != 0)
                          _Tag(
                            '${debt.rate.toStringAsFixed(2)}%',
                            rateClassColor(rateClass, scheme),
                          ),
                        _Tag(
                          '$paymentLabel ¥${calc.fmt(debt.monthly)}',
                          scheme.surfaceContainerHighest,
                        ),
                        _Tag(
                          '剩 ${debt.terms}/${debt.totalTerms} 期',
                          scheme.surfaceContainerHighest,
                        ),
                      ],
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
}

class _Tag extends StatelessWidget {
  final String label;
  final Color background;

  const _Tag(this.label, this.background);

  @override
  Widget build(BuildContext context) {
    final foreground =
        ThemeData.estimateBrightnessForColor(background) == Brightness.dark
        ? Colors.white
        : Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: foreground),
      ),
    );
  }
}
