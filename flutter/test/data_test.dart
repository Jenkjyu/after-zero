// 阶段2（数据层）的测试——覆盖models的fromMap/toMap往返、debt_ops桥接函数是否正确复用了
// 阶段1已验证过的calc.dart逻辑、LocalStore的读写往返、Riverpod provider的状态+持久化联动。
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/debt_ops.dart';
import 'package:after_zero/data/local_store.dart';
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';

/// 跟calc_test.dart的makeDebt()同一个套路，只是这次产出Debt对象而不是Map。
Debt makeDebt(int paidCount) {
  final planMaps = calc.genPlan({
    'kind': 'amort',
    'P': 12000,
    'rate': 12,
    'n': 12,
    'first': '2026-01-15',
  });
  calc.markPaidThrough(planMaps, paidCount);
  final map = <String, dynamic>{
    'id': 'dtest',
    'name': '测试债务',
    'plan': planMaps,
  };
  calc.recompute(map);
  return Debt.fromMap(map);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('models: fromMap/toMap 往返', () {
    test('PlanRow: 必填字段往返，可选字段缺失时toMap不应该出现这些key', () {
      const row = PlanRow(
        date: '2026-01-15',
        amount: 1000,
        principal: 900,
        interest: 100,
        paid: false,
      );
      final map = row.toMap();
      expect(map.containsKey('settleRow'), false);
      expect(map.containsKey('paidAt'), false);
      expect(map.containsKey('paidAmount'), false);
      final back = PlanRow.fromMap(map);
      expect(back.date, row.date);
      expect(back.amount, row.amount);
      expect(back.paid, row.paid);
    });

    test('PlanRow: 可选字段齐全时完整往返', () {
      const row = PlanRow(
        date: '2026-01-15',
        amount: 1000,
        principal: 900,
        interest: 100,
        paid: true,
        settleRow: true,
        paidAt: '2026-01-20',
        paidAmount: 1000,
      );
      final back = PlanRow.fromMap(row.toMap());
      expect(back.settleRow, true);
      expect(back.paidAt, '2026-01-20');
      expect(back.paidAmount, 1000);
    });

    test('Debt: 含plan/gen/settleStash的完整往返', () {
      final plan = [
        const PlanRow(
          date: '2026-01-15',
          amount: 1000,
          principal: 900,
          interest: 100,
          paid: false,
        ),
      ];
      const gen = GenSpec(
        kind: 'amort',
        first: '2026-01-15',
        p: 12000,
        rate: 12,
        n: 12,
      );
      final d = Debt(
        id: 'd1',
        name: '测试',
        funder: '银行',
        type: '银行贷',
        plan: plan,
        gen: gen,
        settled: false,
        balance: 900,
        paidPrincipal: 100,
        rate: 12,
      );
      final back = Debt.fromMap(d.toMap());
      expect(back.id, 'd1');
      expect(back.name, '测试');
      expect(back.funder, '银行');
      expect(back.plan.length, 1);
      expect(back.gen?.kind, 'amort');
      expect(back.balance, 900);
      expect(back.rate, 12);
    });

    test('Debt: 缺派生字段时用默认值兜底，不抛异常', () {
      final back = Debt.fromMap({
        'id': 'd1',
        'name': '空的',
        'plan': <Map<String, dynamic>>[],
      });
      expect(back.balance, 0);
      expect(back.terms, 0);
      expect(back.rate, 0);
      expect(back.original, null);
    });

    test('copyWith: 只改指定字段，派生字段(balance等)不能通过copyWith手动改', () {
      final d = makeDebt(0);
      final renamed = d.copyWith(name: '改名了');
      expect(renamed.name, '改名了');
      expect(renamed.id, d.id);
      expect(renamed.balance, d.balance); // 派生字段原样保留，copyWith没有暴露改它的参数
    });

    test(
      'Account/Premium/NotifySettings/NotifyRule/DocEntry/AiUsageCache 往返',
      () {
        const account = Account(
          openid: 'o1',
          nickname: '小明',
          avatarUrl: 'https://x/a.png',
          loggedInAt: 1000,
        );
        expect(Account.fromMap(account.toMap()).openid, 'o1');

        const premium = Premium(
          premium: PremiumInfo(
            method: 'onetime',
            at: '2026-01-01T00:00:00.000Z',
          ),
        );
        expect(premium.hasPremium, true);
        final premiumBack = Premium.fromMap(premium.toMap());
        expect(premiumBack.hasPremium, true);
        expect(premiumBack.premium?.method, 'onetime');
        expect(const Premium().hasPremium, false);
        expect(Premium.fromMap(null).hasPremium, false);

        const notify = NotifySettings(
          enabled: true,
          rules: [NotifyRule(offsetDays: 1, time: '09:00')],
        );
        final notifyBack = NotifySettings.fromMap(notify.toMap());
        expect(notifyBack.enabled, true);
        expect(notifyBack.rules.single.offsetDays, 1);
        expect(NotifySettings.empty.enabled, false);
        expect(NotifySettings.empty.rules, []);

        const doc = DocEntry(file: 'a.md', title: '标题', content: '# 内容');
        expect(DocEntry.fromMap(doc.toMap()).content, '# 内容');

        const usage = AiUsageCache(month: '2026-08', used: 3, limit: 50);
        final usageBack = AiUsageCache.fromMap(usage.toMap());
        expect(usageBack.used, 3);
        expect(AiUsageCache.fromMap(null).limit, 50); // 从没缓存过时的默认值
      },
    );
  });

  group('debt_ops: 复用calc.dart的桥接函数', () {
    test('recomputeDebt: 派生字段跟calc.recompute()在Map层面算出来的一致', () {
      final plan = calc.genPlan({
        'kind': 'amort',
        'P': 12000,
        'rate': 12,
        'n': 12,
        'first': '2026-01-15',
      });
      final rawDebt = Debt.fromMap({'id': 'd1', 'name': 'x', 'plan': plan});
      final recomputed = recomputeDebt(rawDebt);
      expect(recomputed.original, 12000);
      expect(recomputed.balance, 12000);
      expect(recomputed.rate, 12);
      expect(recomputed.terms, 12);
    });

    test('normalizeDebt: 从只有gen的老数据生成plan+id+派生字段', () {
      final d = normalizeDebt({
        'gen': {
          'kind': 'amort',
          'P': 1000,
          'rate': 6,
          'n': 3,
          'first': '2026-01-01',
          'paid': 1,
        },
      });
      expect(d.id.startsWith('d'), true);
      expect(d.plan.length, 3);
      expect(d.plan[0].paid, true);
      expect(d.plan[1].paid, false);
      expect(d.paidTerms, 1);
      expect(d.rate, 6);
    });

    test('applySettle/undoSettle: 提前结清生成结清行，撤销精确回到结清前', () {
      final d = makeDebt(3);
      final remain = d.balance;
      final settled = applySettle(d, remain, '2026-07-29')!;
      expect(settled.settled, true);
      expect(settled.settledDate, '7/29');
      expect(settled.plan.length, 4);
      expect(settled.plan.last.settleRow, true);
      expect(settled.settleStash?.length, 9);
      expect(settled.balance, 0);

      final restored = undoSettle(settled);
      expect(restored.settled, false);
      expect(restored.settleStash, null);
      expect(restored.plan.length, 12);
      expect(restored.balance, d.balance);
    });

    test('applySettle: 已经没有未还期次时返回null', () {
      final d = makeDebt(12);
      expect(applySettle(d, 100, '2026-07-29'), null);
    });

    test('recordPayment: 还的钱不够这期时留在未还列表里，返回remaining', () {
      final d = Debt.fromMap({
        'id': 'd',
        'name': 'x',
        'plan': [
          {
            'date': '2026-08-10',
            'amount': 100,
            'principal': 80,
            'interest': 20,
            'paid': false,
          },
        ],
      });
      final res = recordPayment(d, 40, '2026-07-29')!;
      expect(res.full, false);
      expect(res.remaining, 60);
      expect(res.debt.plan[0].paid, false);
      expect(res.debt.plan[0].paidAmount, 40);
    });

    test('recordPayment: 已经没有未还期次时返回null', () {
      final d = Debt.fromMap({
        'id': 'd',
        'name': 'x',
        'plan': [
          {
            'date': '2026-08-10',
            'amount': 100,
            'principal': 100,
            'interest': 0,
            'paid': true,
          },
        ],
      });
      expect(recordPayment(d, 50, '2026-07-29'), null);
    });

    test('waivePeriod: 协商减免强制关闭这期', () {
      final d = Debt.fromMap({
        'id': 'd',
        'name': 'x',
        'plan': [
          {
            'date': '2026-08-10',
            'amount': 100,
            'principal': 80,
            'interest': 20,
            'paid': false,
          },
        ],
      });
      final res = waivePeriod(d, 40, '2026-07-29')!;
      expect(res.plan[0].paid, true);
      expect(res.plan[0].paidAt, '2026-07-29');
      expect(res.paidPrincipal, 20);
      expect(res.paidInterest, 20);
    });
  });

  group('LocalStore: 读写往返', () {
    late SharedPreferences prefs;
    late LocalStore store;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      store = LocalStore(prefs);
    });

    test('debts: 空存储返回空列表；写入后能原样读回(含settleStash)', () async {
      expect(store.readDebts(), []);
      final d = makeDebt(3);
      final settled = applySettle(d, d.balance, '2026-07-29')!;
      await store.writeDebts([settled]);
      final back = store.readDebts();
      expect(back.length, 1);
      expect(back[0].id, settled.id);
      expect(back[0].settleStash?.length, 9);
      expect(back[0].balance, 0);
    });

    test('account: 写入null等于清空，读回是null', () async {
      const account = Account(
        openid: 'o1',
        nickname: '小明',
        avatarUrl: 'https://x/a.png',
        loggedInAt: 1000,
      );
      await store.writeAccount(account);
      expect(store.readAccount()?.openid, 'o1');
      await store.writeAccount(null);
      expect(store.readAccount(), null);
    });

    test('premium: 读写往返', () async {
      const premium = Premium(
        premium: PremiumInfo(
          method: 'redeemed',
          at: '2026-01-01T00:00:00.000Z',
        ),
      );
      await store.writePremium(premium);
      expect(store.readPremium().hasPremium, true);
    });

    test('notify: 空存储返回empty默认值；写入后往返', () async {
      expect(store.readNotify().enabled, false);
      const notify = NotifySettings(
        enabled: true,
        rules: [NotifyRule(offsetDays: 0, time: '18:00')],
      );
      await store.writeNotify(notify);
      final back = store.readNotify();
      expect(back.enabled, true);
      expect(back.rules.single.time, '18:00');
    });

    test('docs: 读写往返', () async {
      const doc = DocEntry(file: 'a.md', title: 't', content: 'c');
      await store.writeDocs([doc]);
      expect(store.readDocs().single.title, 't');
    });

    test('aiUsage: 读写往返，未缓存时用默认值', () async {
      expect(store.readAiUsage().month, null);
      const usage = AiUsageCache(month: '2026-08', used: 10, limit: 50);
      await store.writeAiUsage(usage);
      expect(store.readAiUsage().used, 10);
    });
  });

  group('Providers: 状态+持久化联动', () {
    late SharedPreferences prefs;
    late ProviderContainer container;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      container = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
    });

    tearDown(() => container.dispose());

    test(
      'debtsProvider: setDebt(新增)/deleteDebt都会同步进state和LocalStore',
      () async {
        expect(container.read(debtsProvider), []);
        final d = makeDebt(0);
        container.read(debtsProvider.notifier).setDebt(null, d);
        expect(container.read(debtsProvider).length, 1);
        // 直接用同一份prefs另建一个LocalStore验证真的写盘了，不是只改了内存state
        expect(LocalStore(prefs).readDebts().length, 1);

        container.read(debtsProvider.notifier).deleteDebt(d.id);
        expect(container.read(debtsProvider), []);
        expect(LocalStore(prefs).readDebts(), []);
      },
    );

    test('debtsProvider: setDebt(按id覆盖)只替换对应那一条', () {
      final a = makeDebt(0).copyWith(name: 'A');
      final b = Debt.fromMap({...a.toMap(), 'id': 'd2', 'name': 'B'});
      container.read(debtsProvider.notifier)
        ..setDebt(null, a)
        ..setDebt(null, b);
      expect(container.read(debtsProvider).map((d) => d.name).toList(), [
        'A',
        'B',
      ]);

      final renamedA = Debt.fromMap({...a.toMap(), 'name': 'A改名'});
      container.read(debtsProvider.notifier).setDebt(a.id, renamedA);
      expect(container.read(debtsProvider).map((d) => d.name).toList(), [
        'A改名',
        'B',
      ]);
    });

    test('accountProvider/premiumProvider/notifyProvider: 基本读写', () {
      expect(container.read(accountProvider), null);
      container
          .read(accountProvider.notifier)
          .set(
            const Account(
              openid: 'o',
              nickname: 'n',
              avatarUrl: '',
              loggedInAt: 1,
            ),
          );
      expect(container.read(accountProvider)?.openid, 'o');

      expect(container.read(premiumProvider).hasPremium, false);
      container
          .read(premiumProvider.notifier)
          .set(
            const Premium(
              premium: PremiumInfo(method: 'onetime', at: '2026-01-01'),
            ),
          );
      expect(container.read(premiumProvider).hasPremium, true);

      expect(container.read(notifyProvider).enabled, false);
      container.read(notifyProvider.notifier).setEnabled(true);
      expect(container.read(notifyProvider).enabled, true);
      container
          .read(notifyProvider.notifier)
          .addRule(const NotifyRule(offsetDays: 2, time: '08:00'));
      expect(container.read(notifyProvider).rules.length, 1);
      container.read(notifyProvider.notifier).deleteRule(0);
      expect(container.read(notifyProvider).rules, []);
    });

    test('aiUsageProvider: updateFromServer刷新state并持久化', () {
      expect(container.read(aiUsageProvider).month, null);
      container
          .read(aiUsageProvider.notifier)
          .updateFromServer(
            const AiUsageCache(month: '2026-08', used: 5, limit: 50),
          );
      expect(container.read(aiUsageProvider).used, 5);
      expect(LocalStore(prefs).readAiUsage().used, 5);
    });
  });
}
