import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/local_store.dart';
import 'package:after_zero/data/providers.dart';
import 'package:after_zero/main.dart';
import 'package:after_zero/ui/debts/debt_card.dart';

void main() {
  testWidgets('App boots and shows the bottom nav + empty debts state', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('债务'), findsWidgets); // AppBar标题+底部导航label都叫这个
    expect(find.text('还没有在还的债务'), findsOneWidget);
  });

  testWidgets('债务主页显示完整卡片信息，并按保存的排序偏好排列', (WidgetTester tester) async {
    Map<String, dynamic> makeDebt(String id, String name, num rate) {
      final plan = calc.genPlan({
        'kind': 'amort',
        'P': 1000,
        'rate': rate,
        'n': 3,
        'first': '2026-09-15',
      });
      final debt = <String, dynamic>{
        'id': id,
        'name': name,
        'funder': '测试银行',
        'type': '银行贷',
        'plan': plan,
      };
      calc.recompute(debt);
      return debt;
    }

    final low = makeDebt('low', '低利率', 6);
    final high = makeDebt('high', '高利率', 18);
    SharedPreferences.setMockInitialValues({
      LocalStoreKeys.debts: jsonEncode([low, high]),
      LocalStoreKeys.debtSort: 'rate-desc',
    });
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('在还总负债'), findsOneWidget);
    expect(find.text('出资方：测试银行 · 银行贷', skipOffstage: false), findsNWidgets(2));
    final cards = tester
        .widgetList<DebtCard>(find.byType(DebtCard, skipOffstage: false))
        .toList();
    expect(cards.map((card) => card.debt.name), ['高利率', '低利率']);
    expect(cards.first.debt.rate, greaterThan(cards.last.debt.rate));
  });

  testWidgets('新增债务：公式生成计划、保存并从详情打开还款确认', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(800, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('add-debt')));
    await tester.pumpAndSettle();
    expect(find.text('新增债务'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), '测试消费贷');
    await tester.enterText(find.byType(TextFormField).at(2), '2026-08-01');
    await tester.tap(find.text('公式生成'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('gen-P')), '1200');
    await tester.enterText(find.byKey(const Key('gen-rate')), '12');
    await tester.enterText(find.byKey(const Key('gen-n')), '3');
    await tester.enterText(find.byKey(const Key('gen-first')), '2026-09-15');
    await tester.tap(find.text('按等额本息生成计划'));
    await tester.pumpAndSettle();
    expect(find.text('第 1 期'), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, -1000));
    await tester.pumpAndSettle();
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(find.text('测试消费贷'), findsOneWidget);
    expect(find.text('在还总负债'), findsOneWidget);

    await tester.tap(find.text('测试消费贷'));
    await tester.pumpAndSettle();
    expect(find.text('完整还款计划'), findsOneWidget);
  });

  testWidgets('底部可切换到还款日和统计页', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('还款日').last);
    await tester.pumpAndSettle();
    expect(find.text('全部结清'), findsOneWidget);

    await tester.tap(find.text('统计').last);
    await tester.pumpAndSettle();
    expect(find.text('目前没有在还的债务'), findsOneWidget);
  });
}
