// 本地持久化——阶段0定的方案：shared_preferences存JSON字符串，按现有localStorage的key名
// 一一对应(见下面LocalStoreKeys)。⚠️沿用这些key名纯粹是命名习惯上的一致性，不是为了兼容
// 现有Capacitor版本的数据——WebView的localStorage和Flutter的shared_preferences是两套完全
// 不同的底层存储机制，哪怕字符串完全相同也不会自动共享数据，这个App要不要做"从旧版本导入
// 数据"这类迁移功能是阶段9切换时才需要决定的产品问题，不是现在这层要解决的。
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'debt_ops.dart';
import 'models.dart';

class LocalStoreKeys {
  static const debts = 'debt-manager-v5';
  static const debtSort = 'debt-manager-sort-v1';
  static const docs = 'debt-manager-docs-v5';
  static const account = 'after-zero-account-v1';
  static const notify = 'after-zero-notify-v1';
  static const premium = 'after-zero-premium-v1';
  static const aiUsage = 'after-zero-ai-usage-v1';
}

class LocalStore {
  final SharedPreferences prefs;

  const LocalStore(this.prefs);

  List<Map<String, dynamic>> _readMapList(String key) {
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw) as List<dynamic>;
    return decoded.map((e) => (e as Map).cast<String, dynamic>()).toList();
  }

  Future<void> _writeMapList(String key, List<Map<String, dynamic>> list) =>
      prefs.setString(key, jsonEncode(list));

  Map<String, dynamic>? _readMap(String key) {
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    return (jsonDecode(raw) as Map).cast<String, dynamic>();
  }

  Future<void> _writeMap(String key, Map<String, dynamic>? map) {
    if (map == null) return prefs.remove(key);
    return prefs.setString(key, jsonEncode(map));
  }

  // ===== 债务 =====

  /// 每条读出来的原始数据都过一遍normalizeDebt()(对应vanilla启动时`debts.forEach(normalize)`)，
  /// 补齐老数据缺的id/plan字段、重新算一遍派生值——不假设本地存的数据已经是最新形状。
  List<Debt> readDebts() =>
      _readMapList(LocalStoreKeys.debts).map(normalizeDebt).toList();

  Future<void> writeDebts(List<Debt> debts) =>
      _writeMapList(LocalStoreKeys.debts, debts.map((d) => d.toMap()).toList());

  /// 债务主页的显示排序。它是纯展示偏好，和债务数据本身分开存，沿用现有 App 的 key 名。
  String readDebtSort() =>
      prefs.getString(LocalStoreKeys.debtSort) ?? 'rate-desc';

  Future<void> writeDebtSort(String sort) =>
      prefs.setString(LocalStoreKeys.debtSort, sort);

  // ===== 档案库(markdown文档，见models.dart的DocEntry注释——没有新写入路径，只为兼容老数据) =====

  List<DocEntry> readDocs() =>
      _readMapList(LocalStoreKeys.docs).map(DocEntry.fromMap).toList();

  Future<void> writeDocs(List<DocEntry> docs) =>
      _writeMapList(LocalStoreKeys.docs, docs.map((d) => d.toMap()).toList());

  // ===== 账户 =====

  Account? readAccount() {
    final m = _readMap(LocalStoreKeys.account);
    return m == null ? null : Account.fromMap(m);
  }

  Future<void> writeAccount(Account? account) =>
      _writeMap(LocalStoreKeys.account, account?.toMap());

  // ===== 会员 =====

  Premium readPremium() => Premium.fromMap(_readMap(LocalStoreKeys.premium));

  Future<void> writePremium(Premium premium) =>
      _writeMap(LocalStoreKeys.premium, premium.toMap());

  // ===== 通知设置 =====

  NotifySettings readNotify() {
    final m = _readMap(LocalStoreKeys.notify);
    return m == null ? NotifySettings.empty : NotifySettings.fromMap(m);
  }

  Future<void> writeNotify(NotifySettings notify) =>
      _writeMap(LocalStoreKeys.notify, notify.toMap());

  // ===== AI用量缓存(服务端权威值的本地快照，见models.dart的AiUsageCache注释) =====

  AiUsageCache readAiUsage() =>
      AiUsageCache.fromMap(_readMap(LocalStoreKeys.aiUsage));

  Future<void> writeAiUsage(AiUsageCache usage) =>
      _writeMap(LocalStoreKeys.aiUsage, usage.toMap());
}
