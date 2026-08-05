// Riverpod状态层——阶段0选定的方案。SharedPreferences本身要异步初始化，但读到之后的访问是
// 同步的，所以用"main()里提前await拿到实例、通过Provider.overrideWithValue注入"这个标准
// 套路（而不是让每个页面各自处理AsyncValue的loading态）：
//
//   final prefs = await SharedPreferences.getInstance();
//   runApp(ProviderScope(
//     overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
//     child: const AfterZeroApp(),
//   ));
//
// 不覆盖直接使用会在读取时抛UnimplementedError——这是故意的，缺了初始化步骤要在开发期就
// 炸出来，不能悄悄读到一个不存在的假数据。
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'archive_repository.dart';
import 'local_store.dart';
import 'models.dart';

final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError(
    'sharedPreferencesProvider必须在main()里用overrideWithValue注入实际实例，见文件头注释',
  );
});

final localStoreProvider = Provider<LocalStore>(
  (ref) => LocalStore(ref.watch(sharedPreferencesProvider)),
);

final archiveRepositoryProvider = Provider<ArchiveRepository>(
  (ref) => ArchiveRepository(ref.watch(sharedPreferencesProvider)),
);

/// 债务列表——对应vanilla的`debts`模块变量+`saveAll()`/`renderAll()`那套"改完存、存完通知"
/// 的模式，只是这里状态变化本身就是通知（Riverpod的watch机制），不需要额外派发事件。
class DebtsNotifier extends Notifier<List<Debt>> {
  @override
  List<Debt> build() => ref.read(localStoreProvider).readDebts();

  void _persist(List<Debt> next) {
    state = next;
    ref.read(localStoreProvider).writeDebts(next);
  }

  /// id为null=新增(debt.id必须由调用方先用genDebtId()生成好——这里不像vanilla的setDebt()
  /// 那样代为生成，保持这一层职责单一：只管"替换/追加"，不管"怎么造一个新debt")；
  /// id非null=按id覆盖对应那条。
  void setDebt(String? id, Debt debt) {
    if (id == null) {
      _persist([...state, debt]);
      return;
    }
    _persist([
      for (final d in state)
        if (d.id == id) debt else d,
    ]);
  }

  void deleteDebt(String id) =>
      _persist(state.where((d) => d.id != id).toList());

  /// 完整替换顺序（导入/恢复时用）。
  void commitReorder(List<Debt> newOrder) => _persist(newOrder);

  /// 只重排在还债务，同时保留已结清债务在原数组里的槽位——对应旧版commitReorder()。
  /// UI传入的是当前展示顺序，不能直接用它替换state，否则已结清条目会被意外丢掉。
  void commitActiveReorder(List<Debt> activeOrder) {
    final queue = List<Debt>.from(activeOrder);
    _persist([
      for (final debt in state)
        if (debt.settled == true) debt else queue.removeAt(0),
    ]);
  }

  /// 整体替换（导入JSON/恢复备份用）。
  void replaceAll(List<Debt> next) => _persist(next);
}

final debtsProvider = NotifierProvider<DebtsNotifier, List<Debt>>(
  DebtsNotifier.new,
);

/// 债务主页的显示排序（含自定义拖拽顺序）。这是用户偏好，不属于Debt本身的业务字段。
class DebtSortNotifier extends Notifier<String> {
  @override
  String build() => ref.read(localStoreProvider).readDebtSort();

  void set(String sort) {
    state = sort;
    ref.read(localStoreProvider).writeDebtSort(sort);
  }
}

final debtSortProvider = NotifierProvider<DebtSortNotifier, String>(
  DebtSortNotifier.new,
);

class AccountNotifier extends Notifier<Account?> {
  @override
  Account? build() => ref.read(localStoreProvider).readAccount();

  void set(Account? account) {
    state = account;
    ref.read(localStoreProvider).writeAccount(account);
  }
}

final accountProvider = NotifierProvider<AccountNotifier, Account?>(
  AccountNotifier.new,
);

class PremiumNotifier extends Notifier<Premium> {
  @override
  Premium build() => ref.read(localStoreProvider).readPremium();

  void set(Premium premium) {
    state = premium;
    ref.read(localStoreProvider).writePremium(premium);
  }
}

final premiumProvider = NotifierProvider<PremiumNotifier, Premium>(
  PremiumNotifier.new,
);

class NotifySettingsNotifier extends Notifier<NotifySettings> {
  @override
  NotifySettings build() => ref.read(localStoreProvider).readNotify();

  void _persist(NotifySettings next) {
    state = next;
    ref.read(localStoreProvider).writeNotify(next);
  }

  void setEnabled(bool enabled) => _persist(state.copyWith(enabled: enabled));

  void addRule(NotifyRule rule) =>
      _persist(state.copyWith(rules: [...state.rules, rule]));

  void deleteRule(int index) => _persist(
    state.copyWith(
      rules: [
        for (var i = 0; i < state.rules.length; i++)
          if (i != index) state.rules[i],
      ],
    ),
  );

  void replace(NotifySettings next) => _persist(next);
}

final notifyProvider = NotifierProvider<NotifySettingsNotifier, NotifySettings>(
  NotifySettingsNotifier.new,
);

class DocsNotifier extends Notifier<List<DocEntry>> {
  @override
  List<DocEntry> build() => ref.read(localStoreProvider).readDocs();

  void replaceAll(List<DocEntry> next) {
    state = next;
    ref.read(localStoreProvider).writeDocs(next);
  }
}

final docsProvider = NotifierProvider<DocsNotifier, List<DocEntry>>(
  DocsNotifier.new,
);

/// AI用量缓存——纯粹是服务端返回值的只读快照（见models.dart的AiUsageCache注释），
/// 阶段3接云函数调用后，每次调用aiAdvisor云函数拿到quota就调这个方法刷新。
class AiUsageNotifier extends Notifier<AiUsageCache> {
  @override
  AiUsageCache build() => ref.read(localStoreProvider).readAiUsage();

  void updateFromServer(AiUsageCache quota) {
    state = quota;
    ref.read(localStoreProvider).writeAiUsage(quota);
  }
}

final aiUsageProvider = NotifierProvider<AiUsageNotifier, AiUsageCache>(
  AiUsageNotifier.new,
);
