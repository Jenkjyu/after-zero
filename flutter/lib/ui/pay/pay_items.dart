import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/models.dart';

/// 还款日页的一行。它刻意代表“一期”而不是“一笔债务”：自定义时间窗可以包含同一笔
/// 债务的多期计划，金额也必须取该期金额而不是 Debt.monthly。
class PayItem {
  final Debt debt;
  final int planIndex;
  final DateTime dueDate;
  final int daysFromToday;
  final num amount;
  final bool isNextUnpaid;

  const PayItem({
    required this.debt,
    required this.planIndex,
    required this.dueDate,
    required this.daysFromToday,
    required this.amount,
    required this.isNextUnpaid,
  });
}

List<PayItem> buildPayItems(List<Debt> debts, [DateTime? today]) {
  final t0 = today == null
      ? calc.today0()
      : DateTime(today.year, today.month, today.day);
  final out = <PayItem>[];
  for (final debt in debts) {
    if (debt.settled == true) continue;
    var seenUnpaid = false;
    for (var index = 0; index < debt.plan.length; index++) {
      final row = debt.plan[index];
      if (row.paid) continue;
      final due = calc.parseDate(row.date);
      if (due == null) continue;
      final next = !seenUnpaid;
      seenUnpaid = true;
      out.add(
        PayItem(
          debt: debt,
          planIndex: index,
          dueDate: due,
          daysFromToday: due.difference(t0).inDays,
          amount: row.amount,
          isNextUnpaid: next,
        ),
      );
    }
  }
  out.sort((a, b) => a.dueDate.compareTo(b.dueDate));
  return out;
}

List<PayItem> filterPayItems(
  List<PayItem> items,
  String filter, [
  int? customDays,
]) {
  if (filter == 'next') return items.where((item) => item.isNextUnpaid).toList();
  if (filter == 'overdue') return items.where((item) => item.daysFromToday < 0).toList();
  final days = switch (filter) {
    'd7' => 7,
    'd15' => 15,
    'd30' => 30,
    'custom' => customDays,
    _ => null,
  };
  if (days == null) return items.where((item) => item.isNextUnpaid).toList();
  return items
      .where((item) => item.daysFromToday >= 0 && item.daysFromToday <= days)
      .toList();
}

String payFilterLabel(String filter, [int? customDays]) => switch (filter) {
  'next' => '下一期',
  'overdue' => '已逾期',
  'd7' => '7天内',
  'd15' => '15天内',
  'd30' => '30天内',
  'custom' => '${customDays ?? 0}天内',
  _ => '下一期',
};
