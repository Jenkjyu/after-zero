// 数据模型（Flutter重写阶段2）——字段形状是从react/src/types.ts（当前vanilla+React架构的
// 权威TS定义）逐字段核对过来的，不是猜的。跟阶段1的calc.dart不同，这里用的是真正的类而不是
// Map<String,dynamic>——calc.dart那批纯函数还是操作Map（阶段1定的选择，保持跟calc.js的翻译
// 尽量字面），这层类通过toMap()/fromMap()跟calc.dart的Map形状互转，两边通过`debt_ops.dart`
// 里的桥接函数衔接，不需要把calc.dart重写成操作这些类。
//
// 每个类都是不可变的（immutable，所有字段final）+ copyWith——这是Riverpod惯用的状态管理
// 方式："改状态"意味着"算出一份新对象"，不是像JS那样直接改对象的字段。

/// 还款计划里的一期。principal/interest两个字段是原计划，永远不因部分还款/协商减免改变；
/// paidAt只在真实还款事件（recordPayment/waivePeriod/applySettle）才写，手动编辑器勾选
/// "已还"不会盖章——这条规则定义在数据模型里，UI层不应该自己去设置paidAt。
class PlanRow {
  final String date; // "YYYY-MM-DD"
  final num amount;
  final num principal;
  final num interest;
  final bool paid;
  final bool? settleRow; // true仅在applySettle()追加的那一条合成结清行上
  final String? paidAt; // "YYYY-MM-DD"，只在真实还款事件时写
  final num? paidAmount; // 这期累计收到多少钱（部分还款账本）

  const PlanRow({
    required this.date,
    required this.amount,
    required this.principal,
    required this.interest,
    required this.paid,
    this.settleRow,
    this.paidAt,
    this.paidAmount,
  });

  factory PlanRow.fromMap(Map<String, dynamic> m) => PlanRow(
    date: m['date'] as String? ?? '',
    amount: (m['amount'] as num?) ?? 0,
    principal: (m['principal'] as num?) ?? 0,
    interest: (m['interest'] as num?) ?? 0,
    paid: m['paid'] == true,
    settleRow: m['settleRow'] as bool?,
    paidAt: m['paidAt'] as String?,
    paidAmount: m['paidAmount'] as num?,
  );

  Map<String, dynamic> toMap() => {
    'date': date,
    'amount': amount,
    'principal': principal,
    'interest': interest,
    'paid': paid,
    if (settleRow != null) 'settleRow': settleRow,
    if (paidAt != null) 'paidAt': paidAt,
    if (paidAmount != null) 'paidAmount': paidAmount,
  };

  PlanRow copyWith({
    String? date,
    num? amount,
    num? principal,
    num? interest,
    bool? paid,
    Object? settleRow = _unset,
    Object? paidAt = _unset,
    Object? paidAmount = _unset,
  }) => PlanRow(
    date: date ?? this.date,
    amount: amount ?? this.amount,
    principal: principal ?? this.principal,
    interest: interest ?? this.interest,
    paid: paid ?? this.paid,
    settleRow: identical(settleRow, _unset)
        ? this.settleRow
        : settleRow as bool?,
    paidAt: identical(paidAt, _unset) ? this.paidAt : paidAt as String?,
    paidAmount: identical(paidAmount, _unset)
        ? this.paidAmount
        : paidAmount as num?,
  );
}

const _unset = Object();

/// 公式生成器的输入参数——即使是手动逐行编辑的债务也会保留这份spec（记录"当初是怎么生成的"）。
class GenSpec {
  final String
  kind; // amort | equalprincipal | equalfee | interestfirst | custom
  final String first; // 首期日期 "YYYY-MM-DD"
  final num? p;
  final num? rate;
  final num? n;
  final num? pp;
  final num? pf;
  final num? ni;
  final num? np;
  final int? paid; // normalize()用：初始标记前几期已还

  const GenSpec({
    required this.kind,
    required this.first,
    this.p,
    this.rate,
    this.n,
    this.pp,
    this.pf,
    this.ni,
    this.np,
    this.paid,
  });

  factory GenSpec.fromMap(Map<String, dynamic> m) => GenSpec(
    kind: m['kind'] as String? ?? 'custom',
    first: m['first'] as String? ?? '',
    p: m['P'] as num?,
    rate: m['rate'] as num?,
    n: m['n'] as num?,
    pp: m['pp'] as num?,
    pf: m['pf'] as num?,
    ni: m['ni'] as num?,
    np: m['np'] as num?,
    paid: m['paid'] as int?,
  );

  Map<String, dynamic> toMap() => {
    'kind': kind,
    'first': first,
    if (p != null) 'P': p,
    if (rate != null) 'rate': rate,
    if (n != null) 'n': n,
    if (pp != null) 'pp': pp,
    if (pf != null) 'pf': pf,
    if (ni != null) 'ni': ni,
    if (np != null) 'np': np,
    if (paid != null) 'paid': paid,
  };
}

/// 一笔债务。前半段（id..settleStash）是用户/表单写入的数据；后半段（original..rate）是
/// recompute()算出来的派生字段，不应该被UI手填——见debt_ops.dart的recomputeDebt()。
class Debt {
  final String id;
  final String name;
  final String? funder; // 出资方
  final String? type; // 借款类型
  final String? opened; // 借款日 "YYYY-MM-DD"
  final String? notes;
  final bool? oneTime; // 一次性还清，不计入经常性月供
  final List<PlanRow> plan;
  final GenSpec? gen;
  final bool? settled;
  final String? settledDate; // 短格式 "M/D"
  final List<PlanRow>? settleStash;
  // ---- 以下由recompute()算出，只读 ----
  final num? original;
  final num balance;
  final num paidPrincipal;
  final num paidInterest;
  final int totalTerms;
  final int paidTerms;
  final int terms;
  final num monthly;
  final String? nextDate;
  final num rate;

  const Debt({
    required this.id,
    required this.name,
    this.funder,
    this.type,
    this.opened,
    this.notes,
    this.oneTime,
    required this.plan,
    this.gen,
    this.settled,
    this.settledDate,
    this.settleStash,
    this.original,
    this.balance = 0,
    this.paidPrincipal = 0,
    this.paidInterest = 0,
    this.totalTerms = 0,
    this.paidTerms = 0,
    this.terms = 0,
    this.monthly = 0,
    this.nextDate,
    this.rate = 0,
  });

  factory Debt.fromMap(Map<String, dynamic> m) => Debt(
    id: m['id'] as String,
    name: m['name'] as String? ?? '',
    funder: m['funder'] as String?,
    type: m['type'] as String?,
    opened: m['opened'] as String?,
    notes: m['notes'] as String?,
    oneTime: m['oneTime'] as bool?,
    plan: ((m['plan'] as List<dynamic>?) ?? const [])
        .map((r) => PlanRow.fromMap((r as Map).cast<String, dynamic>()))
        .toList(),
    gen: m['gen'] != null
        ? GenSpec.fromMap((m['gen'] as Map).cast<String, dynamic>())
        : null,
    settled: m['settled'] as bool?,
    settledDate: m['settledDate'] as String?,
    settleStash: (m['settleStash'] as List<dynamic>?)
        ?.map((r) => PlanRow.fromMap((r as Map).cast<String, dynamic>()))
        .toList(),
    original: m['original'] as num?,
    balance: (m['balance'] as num?) ?? 0,
    paidPrincipal: (m['paidPrincipal'] as num?) ?? 0,
    paidInterest: (m['paidInterest'] as num?) ?? 0,
    totalTerms: (m['totalTerms'] as num?)?.toInt() ?? 0,
    paidTerms: (m['paidTerms'] as num?)?.toInt() ?? 0,
    terms: (m['terms'] as num?)?.toInt() ?? 0,
    monthly: (m['monthly'] as num?) ?? 0,
    nextDate: m['nextDate'] as String?,
    rate: (m['rate'] as num?) ?? 0,
  );

  Map<String, dynamic> toMap() => {
    'id': id,
    'name': name,
    if (funder != null) 'funder': funder,
    if (type != null) 'type': type,
    if (opened != null) 'opened': opened,
    if (notes != null) 'notes': notes,
    if (oneTime != null) 'oneTime': oneTime,
    'plan': plan.map((r) => r.toMap()).toList(),
    if (gen != null) 'gen': gen!.toMap(),
    if (settled != null) 'settled': settled,
    if (settledDate != null) 'settledDate': settledDate,
    if (settleStash != null)
      'settleStash': settleStash!.map((r) => r.toMap()).toList(),
    'original': original,
    'balance': balance,
    'paidPrincipal': paidPrincipal,
    'paidInterest': paidInterest,
    'totalTerms': totalTerms,
    'paidTerms': paidTerms,
    'terms': terms,
    'monthly': monthly,
    'nextDate': nextDate,
    'rate': rate,
  };

  Debt copyWith({
    String? name,
    Object? funder = _unset,
    Object? type = _unset,
    Object? opened = _unset,
    Object? notes = _unset,
    Object? oneTime = _unset,
    List<PlanRow>? plan,
    Object? gen = _unset,
    Object? settled = _unset,
    Object? settledDate = _unset,
    Object? settleStash = _unset,
  }) => Debt(
    id: id,
    name: name ?? this.name,
    funder: identical(funder, _unset) ? this.funder : funder as String?,
    type: identical(type, _unset) ? this.type : type as String?,
    opened: identical(opened, _unset) ? this.opened : opened as String?,
    notes: identical(notes, _unset) ? this.notes : notes as String?,
    oneTime: identical(oneTime, _unset) ? this.oneTime : oneTime as bool?,
    plan: plan ?? this.plan,
    gen: identical(gen, _unset) ? this.gen : gen as GenSpec?,
    settled: identical(settled, _unset) ? this.settled : settled as bool?,
    settledDate: identical(settledDate, _unset)
        ? this.settledDate
        : settledDate as String?,
    settleStash: identical(settleStash, _unset)
        ? this.settleStash
        : settleStash as List<PlanRow>?,
    // 派生字段(original..rate)故意不能通过copyWith手动设置——只有debt_ops.dart的
    // recomputeDebt()能产生新的派生值，避免UI代码手滑写出跟plan对不上的假数据。
    original: original,
    balance: balance,
    paidPrincipal: paidPrincipal,
    paidInterest: paidInterest,
    totalTerms: totalTerms,
    paidTerms: paidTerms,
    terms: terms,
    monthly: monthly,
    nextDate: nextDate,
    rate: rate,
  );
}

/// 微信登录会话——ACCOUNT_KEY。
class Account {
  final String openid;
  final String nickname;
  final String avatarUrl;
  final int loggedInAt; // epoch毫秒，不是ISO字符串

  const Account({
    required this.openid,
    required this.nickname,
    required this.avatarUrl,
    required this.loggedInAt,
  });

  factory Account.fromMap(Map<String, dynamic> m) => Account(
    openid: m['openid'] as String? ?? '',
    nickname: m['nickname'] as String? ?? '',
    avatarUrl: m['avatarUrl'] as String? ?? '',
    loggedInAt: (m['loggedInAt'] as num?)?.toInt() ?? 0,
  );

  Map<String, dynamic> toMap() => {
    'openid': openid,
    'nickname': nickname,
    'avatarUrl': avatarUrl,
    'loggedInAt': loggedInAt,
  };
}

/// 会员状态——PREMIUM_KEY。method只剩"onetime"(买断)/"redeemed"(兑换码)两个值
/// (2026-08-04去掉月付/年付之后)；`hasPremium()`只看premium是不是null，不看method的
/// 具体取值，所以哪怕历史数据里混进旧的"monthly"/"yearly"也无害，不需要特殊处理。
class PremiumInfo {
  final String method;
  final String at; // ISO日期字符串

  const PremiumInfo({required this.method, required this.at});

  factory PremiumInfo.fromMap(Map<String, dynamic> m) => PremiumInfo(
    method: m['method'] as String? ?? '',
    at: m['at'] as String? ?? '',
  );

  Map<String, dynamic> toMap() => {'method': method, 'at': at};
}

class Premium {
  final PremiumInfo? premium;

  const Premium({this.premium});

  bool get hasPremium => premium != null;

  factory Premium.fromMap(Map<String, dynamic>? m) => Premium(
    premium: m?['premium'] != null
        ? PremiumInfo.fromMap((m!['premium'] as Map).cast<String, dynamic>())
        : null,
  );

  Map<String, dynamic> toMap() => {'premium': premium?.toMap()};
}

/// 一条"提前N天+几点"提醒规则。offsetDays是0|1|2|3(当天到期~提前3天)，time是"HH:MM"。
class NotifyRule {
  final int offsetDays;
  final String time;

  const NotifyRule({required this.offsetDays, required this.time});

  factory NotifyRule.fromMap(Map<String, dynamic> m) => NotifyRule(
    offsetDays: (m['offsetDays'] as num?)?.toInt() ?? 0,
    time: m['time'] as String? ?? '09:00',
  );

  Map<String, dynamic> toMap() => {'offsetDays': offsetDays, 'time': time};
}

/// 还款提醒通知设置——NOTIF_KEY，全局共享，不按债务单独配置。
class NotifySettings {
  final bool enabled;
  final List<NotifyRule> rules;

  const NotifySettings({required this.enabled, required this.rules});

  static const empty = NotifySettings(enabled: false, rules: []);

  factory NotifySettings.fromMap(Map<String, dynamic> m) => NotifySettings(
    enabled: m['enabled'] == true,
    rules: ((m['rules'] as List<dynamic>?) ?? const [])
        .map((r) => NotifyRule.fromMap((r as Map).cast<String, dynamic>()))
        .toList(),
  );

  Map<String, dynamic> toMap() => {
    'enabled': enabled,
    'rules': rules.map((r) => r.toMap()).toList(),
  };

  NotifySettings copyWith({bool? enabled, List<NotifyRule>? rules}) =>
      NotifySettings(
        enabled: enabled ?? this.enabled,
        rules: rules ?? this.rules,
      );
}

/// 档案库的markdown文档条目——DKEY数组里的原始形状。⚠️这条数据模型在当前vanilla+React架构
/// 里已经没有新写入路径了(没有任何UI能新建markdown文档)，纯粹是老数据/备份/导入JSON的
/// 兼容形状，保留是为了这些老数据能正常读出来，不是要在Flutter版里做一个"新建文档"功能。
/// 真正在用的"上传文件"(图片/PDF/Word)走的是另一套(IndexedDB的uploads store)，
/// 不在DKEY这个key下面，等阶段6做档案库屏幕时再处理。
class DocEntry {
  final String file;
  final String title;
  final String content;

  const DocEntry({
    required this.file,
    required this.title,
    required this.content,
  });

  factory DocEntry.fromMap(Map<String, dynamic> m) => DocEntry(
    file: m['file'] as String? ?? '',
    title: m['title'] as String? ?? '',
    content: m['content'] as String? ?? '',
  );

  Map<String, dynamic> toMap() => {
    'file': file,
    'title': title,
    'content': content,
  };
}

/// AI债务助手用量——AI_USAGE_KEY本地缓存。⚠️这不是calc.js里`aiUsageToday`/`aiUsageLeft`
/// 那套"每日客户端计数、跨天要重新赋值"的老模型的直接移植——2026-08-04那轮已经把用量权威
/// 上收到服务端(按月、云函数计数)，客户端这份缓存纯粹是服务端返回值的只读快照，不存在
/// "跨天需要在本地重新计算/清零"这类要mutate状态的逻辑，`aiUsageToday`/`aiUsageLeft`
/// 那套复杂度在当前架构下已经不需要在Flutter这边重现。
class AiUsageCache {
  final String? month; // "YYYY-MM"，null表示还没缓存过
  final int used;
  final int limit;

  const AiUsageCache({this.month, this.used = 0, this.limit = 50});

  factory AiUsageCache.fromMap(Map<String, dynamic>? m) => AiUsageCache(
    month: m?['month'] as String?,
    used: (m?['used'] as num?)?.toInt() ?? 0,
    limit: (m?['limit'] as num?)?.toInt() ?? 50,
  );

  Map<String, dynamic> toMap() => {
    'month': month,
    'used': used,
    'limit': limit,
  };
}
