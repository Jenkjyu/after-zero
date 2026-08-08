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
        child: const AfterZeroApp(requireLogin: false),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('After Zero'), findsOneWidget);
    expect(find.byKey(const Key('tab-债务')), findsOneWidget);
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
        child: const AfterZeroApp(requireLogin: false),
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

  testWidgets('新增债务：公式生成计划、保存并从详情打开还款确认', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(requireLogin: false),
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
    expect(find.text('第1期'), findsOneWidget);

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
        child: const AfterZeroApp(requireLogin: false),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('tab-还款日')));
    await tester.pumpAndSettle();
    expect(find.text('全部结清'), findsOneWidget);

    await tester.tap(find.byKey(const Key('tab-统计')));
    await tester.pumpAndSettle();
    expect(find.text('目前没有在还的债务'), findsOneWidget);
  });

  testWidgets('我的页可进入Premium并用兑换码解锁', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(requireLogin: false),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('tab-我的')));
    await tester.pumpAndSettle();
    expect(find.text('关于我们'), findsOneWidget);
    await tester.tap(find.text('升级 Premium'));
    await tester.pumpAndSettle();
    expect(find.text('升级你的 After Zero'), findsOneWidget);

    await tester.tap(find.text('我有兑换码'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '0000');
    await tester.tap(find.text('兑换'));
    await tester.pumpAndSettle();
    expect(find.text('Premium 已解锁'), findsOneWidget);
    expect(prefs.getString(LocalStoreKeys.premium), contains('redeemed'));
  });

  testWidgets('还款日通知面板启用时自动补当天09:00默认规则', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(requireLogin: false),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('tab-还款日')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('还款提醒通知设置'));
    await tester.pumpAndSettle();
    expect(find.text('还款提醒通知'), findsWidgets);
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(find.text('当天到期 · 09:00'), findsOneWidget);
    final stored = prefs.getString(LocalStoreKeys.notify)!;
    expect(stored, contains('09:00'));
  });

  testWidgets('Premium用户可从统计页进入多策略对比并得到三组结果', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    Map<String, dynamic> debt(String id, String name, num balance, num rate) {
      final map = <String, dynamic>{
        'id': id,
        'name': name,
        'plan': calc.genPlan({
          'kind': 'amort',
          'P': balance,
          'rate': rate,
          'n': 12,
          'first': '2026-09-15',
        }),
      };
      calc.recompute(map);
      return map;
    }

    SharedPreferences.setMockInitialValues({
      LocalStoreKeys.debts: jsonEncode([
        debt('d1', '低余额', 3000, 8),
        debt('d2', '高利率', 6000, 20),
      ]),
      LocalStoreKeys.premium: jsonEncode({
        'premium': {'method': 'redeemed', 'at': '2026-08-05'},
      }),
    });
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(requireLogin: false),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('tab-统计')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('多策略对比规划'));
    await tester.tap(find.text('多策略对比规划'));
    await tester.pumpAndSettle();
    expect(find.text('对比这三种策略'), findsOneWidget);
    await tester.tap(find.text('对比这三种策略'));
    await tester.pumpAndSettle();

    expect(find.text('雪球法'), findsOneWidget);
    expect(find.text('雪崩法'), findsOneWidget);
    expect(find.text('自定义'), findsOneWidget);
    expect(find.text('总利息最省'), findsOneWidget);
  });
}
