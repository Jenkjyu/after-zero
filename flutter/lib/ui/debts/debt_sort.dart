import 'package:after_zero/data/models.dart';

/// 现有 App 的全部债务排序项。`custom`保持持久化顺序，之后的长按拖拽就改这份顺序。
const debtSortOptions = <DebtSortOption>[
  DebtSortOption('rate-desc', '利率 高→低'),
  DebtSortOption('rate-asc', '利率 低→高'),
  DebtSortOption('orig-desc', '借款金额 高→低'),
  DebtSortOption('orig-asc', '借款金额 低→高'),
  DebtSortOption('bal-desc', '剩余待还 高→低'),
  DebtSortOption('bal-asc', '剩余待还 低→高'),
  DebtSortOption('monthly-desc', '月供金额 高→低'),
  DebtSortOption('monthly-asc', '月供金额 低→高'),
  DebtSortOption('terms-desc', '剩余期数 多→少'),
  DebtSortOption('terms-asc', '剩余期数 少→多'),
  DebtSortOption('custom', '自定义'),
];

class DebtSortOption {
  final String value;
  final String label;

  const DebtSortOption(this.value, this.label);
}

bool isDebtSort(String value) =>
    debtSortOptions.any((option) => option.value == value);

String normalizedDebtSort(String value) =>
    isDebtSort(value) ? value : 'rate-desc';

String debtSortLabel(String value) => debtSortOptions
    .firstWhere((option) => option.value == normalizedDebtSort(value))
    .label;

List<Debt> sortDebts(List<Debt> debts, String sort) {
  final normalized = normalizedDebtSort(sort);
  if (normalized == 'custom') {
    return debts;
  }

  num valueOf(Debt debt) {
    switch (normalized) {
      case 'rate-desc':
        return -debt.rate;
      case 'rate-asc':
        return debt.rate;
      case 'orig-desc':
        return -(debt.original ?? 0);
      case 'orig-asc':
        return debt.original ?? 0;
      case 'bal-desc':
        return -debt.balance;
      case 'bal-asc':
        return debt.balance;
      case 'monthly-desc':
        return -debt.monthly;
      case 'monthly-asc':
        return debt.monthly;
      case 'terms-desc':
        return -debt.terms;
      case 'terms-asc':
        return debt.terms;
      default:
        return 0;
    }
  }

  // Dart List.sort不承诺稳定；同值时保留用户原来的相对顺序，和旧版表现一致。
  final indexed = debts.indexed.toList()
    ..sort((a, b) {
      final comparison = valueOf(a.$2).compareTo(valueOf(b.$2));
      return comparison != 0 ? comparison : a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}

/// 用户拖拽后，判断新顺序是否恰好仍是一种预设排序；否则持久化为“自定义”。
/// 对相同数值的债务，候选排序以当前顺序为稳定基准，和旧版detectMatchingSort()一致。
String detectDebtSort(List<Debt> activeInOrder) {
  for (final option in debtSortOptions.where(
    (option) => option.value != 'custom',
  )) {
    final candidate = sortDebts(activeInOrder, option.value);
    if (candidate.map((debt) => debt.id).toList().join('\u0000') ==
        activeInOrder.map((debt) => debt.id).toList().join('\u0000')) {
      return option.value;
    }
  }
  return 'custom';
}
