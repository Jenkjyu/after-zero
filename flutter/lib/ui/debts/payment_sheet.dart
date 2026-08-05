import 'package:flutter/material.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';

/// 左滑“销这期”和详情页共用的金额确认框。
/// 金额是本次新增实付；部分还款会留在同一期，下一次默认只填剩余金额。
Future<num?> requestInstallmentPayment(BuildContext context, Debt debt) async {
  final index = debt.plan.indexWhere((row) => !row.paid);
  if (index < 0) {
    return null;
  }
  final row = debt.plan[index];
  final owed = calc.rowRemaining(row.toMap());
  final isLast = debt.plan.skip(index + 1).every((item) => item.paid);
  final title = debt.oneTime == true ? '一次性结清' : (isLast ? '最后一期' : '销这一期');
  final previouslyPaid = row.amount - owed;
  final controller = TextEditingController(text: owed.toStringAsFixed(2));
  String? error;

  try {
    return await showDialog<num>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('第 ${index + 1}/${debt.plan.length} 期（${row.date}）'),
              if (previouslyPaid > .005) ...[
                const SizedBox(height: 6),
                Text(
                  '之前已还 ¥${calc.money(previouslyPaid)}，还差 ¥${calc.money(owed)}。',
                ),
              ],
              if (isLast) ...[
                const SizedBox(height: 6),
                const Text('这是最后一期，还完即结清。'),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: controller,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: '这次还多少钱？',
                  prefixText: '¥ ',
                  errorText: error,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () {
                final amount = num.tryParse(controller.text.trim());
                if (amount == null || amount <= 0) {
                  setState(() => error = '请输入有效的还款金额');
                  return;
                }
                Navigator.of(dialogContext).pop(amount);
              },
              child: const Text('确认还款'),
            ),
          ],
        ),
      ),
    );
  } finally {
    controller.dispose();
  }
}
