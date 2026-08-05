import 'package:flutter_test/flutter_test.dart';

import 'package:after_zero/data/models.dart';
import 'package:after_zero/ui/debts/debt_sort.dart';

Debt debt(
  String id, {
  num rate = 0,
  num? original,
  num balance = 0,
  num monthly = 0,
  int terms = 0,
}) => Debt(
  id: id,
  name: id,
  plan: const [],
  rate: rate,
  original: original,
  balance: balance,
  monthly: monthly,
  terms: terms,
);

void main() {
  test('sortDebts: 预设排序与旧版相同，同值时保留用户原顺序', () {
    final debts = [
      debt('A', rate: 12, balance: 500, monthly: 300),
      debt('B', rate: 18, balance: 500, monthly: 100),
      debt('C', rate: 18, balance: 1000, monthly: 200),
    ];

    expect(sortDebts(debts, 'rate-desc').map((item) => item.id), [
      'B',
      'C',
      'A',
    ]);
    expect(sortDebts(debts, 'monthly-asc').map((item) => item.id), [
      'B',
      'C',
      'A',
    ]);
    expect(sortDebts(debts, 'custom'), same(debts));
  });

  test('排序值非法时回退利率高到低', () {
    expect(normalizedDebtSort('hand-edited'), 'rate-desc');
    expect(debtSortLabel('hand-edited'), '利率 高→低');
  });

  test('detectDebtSort: 拖拽后仍符合预设时保留预设，否则改为自定义', () {
    final a = debt(
      'A',
      rate: 12,
      original: 1000,
      balance: 300,
      monthly: 200,
      terms: 2,
    );
    final b = debt(
      'B',
      rate: 18,
      original: 2000,
      balance: 100,
      monthly: 300,
      terms: 3,
    );
    final c = debt(
      'C',
      rate: 6,
      original: 1500,
      balance: 200,
      monthly: 100,
      terms: 1,
    );
    final d = debt(
      'D',
      rate: 3,
      original: 500,
      balance: 50,
      monthly: 50,
      terms: 0,
    );

    expect(detectDebtSort([b, a, c, d]), 'rate-desc');
    expect(detectDebtSort([a, b, c, d]), 'custom');
  });
}
