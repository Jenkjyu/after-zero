import 'package:flutter_test/flutter_test.dart';

import 'package:after_zero/data/models.dart';
import 'package:after_zero/ui/pay/pay_items.dart';

Debt _debt() => const Debt(
  id: 'd1',
  name: '分期贷',
  plan: [
    PlanRow(date: '2026-08-03', amount: 100, principal: 90, interest: 10, paid: false),
    PlanRow(date: '2026-08-15', amount: 200, principal: 180, interest: 20, paid: false),
    PlanRow(date: '2026-09-15', amount: 300, principal: 270, interest: 30, paid: false),
  ],
);

void main() {
  final today = DateTime(2026, 8, 5);

  test('还款日逐期展开：金额取当前期，只有首个未还期可销', () {
    final items = buildPayItems([_debt()], today);
    expect(items, hasLength(3));
    expect(items.map((item) => item.amount), [100, 200, 300]);
    expect(items.map((item) => item.isNextUnpaid), [true, false, false]);
    expect(items.map((item) => item.daysFromToday), [-2, 10, 41]);
  });

  test('筛选：下一期按债务，其余窗口按期且为累计口径', () {
    final items = buildPayItems([_debt()], today);
    expect(filterPayItems(items, 'next').map((item) => item.planIndex), [0]);
    expect(filterPayItems(items, 'overdue').map((item) => item.planIndex), [0]);
    expect(filterPayItems(items, 'd7'), isEmpty);
    expect(filterPayItems(items, 'd15').map((item) => item.planIndex), [1]);
    expect(filterPayItems(items, 'd30').map((item) => item.planIndex), [1]);
    expect(filterPayItems(items, 'custom', 45).map((item) => item.planIndex), [1, 2]);
  });
}
