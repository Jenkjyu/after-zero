// Debt类 <-> calc.dart的Map<String,dynamic> 之间的桥接——calc.dart那批阶段1移植的函数
// (recompute/normalize/applySettle/undoSettle/recordPayment/waivePeriod)故意保持操作Map
// 不重写（见calc.dart文件头注释），这里用"转成Map、调用已验证过的calc函数、转回不可变Debt"
// 这个模式复用它们，不重新实现一遍计息逻辑——那批函数已经有116条测试背书，重新翻译一遍
// 只会引入新的出错机会。
import 'package:after_zero/calc/calc.dart' as calc;
import 'models.dart';

/// 按Debt当前的plan/settleStash重新算一遍派生字段(balance/paidPrincipal/rate等)，
/// 返回一个新的Debt——不mutate传入的对象，符合Riverpod"immutable state"的惯用法。
Debt recomputeDebt(Debt d) {
  final map = d.toMap();
  calc.recompute(map);
  return Debt.fromMap(map);
}

/// 从老数据(可能缺id/缺plan)构造出一个规整的Debt——对应calc.js的normalize()。
/// 读取本地存储、导入JSON、恢复备份这几个入口在把原始Map转成Debt之前都要过一遍这个。
Debt normalizeDebt(Map<String, dynamic> rawMap) {
  final map = Map<String, dynamic>.from(rawMap);
  calc.normalize(map);
  return Debt.fromMap(map);
}

/// 提前结清——见calc.dart的applySettle()。返回null表示这笔债务已经没有未还期次
/// (对应JS版本返回false的情况)。
Debt? applySettle(Debt d, num paidAmount, String todayString) {
  final map = d.toMap();
  final ok = calc.applySettle(map, paidAmount, todayString);
  if (!ok) return null;
  return Debt.fromMap(map);
}

/// 撤销结清——见calc.dart的undoSettle()。
Debt undoSettle(Debt d) {
  final map = d.toMap();
  calc.undoSettle(map);
  return Debt.fromMap(map);
}

/// 一次还款结果：full=true表示这期已经还清(可能连带整笔债务结清)。
class PaymentResult {
  final Debt debt;
  final bool full;
  final num? remaining;

  const PaymentResult({required this.debt, required this.full, this.remaining});
}

/// 销这期(销多少算多少)——见calc.dart的recordPayment()。返回null表示已经没有未还期次。
PaymentResult? recordPayment(Debt d, num amount, String todayString) {
  final map = d.toMap();
  final res = calc.recordPayment(map, amount, todayString);
  if (res == null) return null;
  return PaymentResult(
    debt: Debt.fromMap(map),
    full: res['full'] as bool,
    remaining: res['remaining'] as num?,
  );
}

/// 协商减免这一期——见calc.dart的waivePeriod()。返回null表示已经没有未还期次。
Debt? waivePeriod(Debt d, num amount, String todayString) {
  final map = d.toMap();
  final res = calc.waivePeriod(map, amount, todayString);
  if (res == null) return null;
  return Debt.fromMap(map);
}
