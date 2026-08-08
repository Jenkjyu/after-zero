import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/debt_ops.dart';
import 'package:after_zero/data/providers.dart';
import 'package:after_zero/ui/debts/debt_detail.dart';
import 'package:after_zero/ui/debts/payment_sheet.dart';

import 'pay_items.dart';
import 'notify_screen.dart';
import '../shared/swipe_reveal.dart';

class PayTab extends ConsumerStatefulWidget {
  const PayTab({super.key});
  @override
  ConsumerState<PayTab> createState() => _PayTabState();
}

class _PayTabState extends ConsumerState<PayTab> {
  String _filter = 'next';
  int? _customDays;
  String? _openSwipeId;

  @override
  Widget build(BuildContext context) {
    final items = buildPayItems(ref.watch(debtsProvider));
    final visible = filterPayItems(items, _filter, _customDays);
    return Scaffold(
      appBar: AppBar(
        title: const Text('还款日'),
        actions: [
          IconButton(
            tooltip: '还款提醒通知',
            icon: Icon(
              ref.watch(notifyProvider).enabled
                  ? Icons.notifications_active
                  : Icons.notifications_none,
            ),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotifyScreen()),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 30),
        children: [
          _PayHero(items: items),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 12),
            _PayStats(items: items),
            const SizedBox(height: 18),
            _FilterBar(
              selected: _filter,
              customDays: _customDays,
              onChanged: (next) => setState(() => _filter = next),
              onPickCustom: _pickCustomRange,
            ),
            const SizedBox(height: 12),
            _PayList(
              items: visible,
              label: payFilterLabel(_filter, _customDays),
              onPay: _pay,
              openSwipeId: _openSwipeId,
              onOpenChanged: (id) =>
                  setState(() => _openSwipeId = _openSwipeId == id ? null : id),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pickCustomRange() async {
    final today = calc.today0();
    final picked = await showDatePicker(
      context: context,
      firstDate: today,
      initialDate: today.add(const Duration(days: 30)),
      lastDate: today.add(const Duration(days: 3650)),
      helpText: '选一个日期，查看这天前的还款',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _customDays = picked.difference(today).inDays;
      _filter = 'custom';
    });
  }

  Future<void> _pay(PayItem item) async {
    if (!item.isNextUnpaid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先销掉这笔债务更早的未还期次')),
      );
      return;
    }
    final amount = await requestInstallmentPayment(context, item.debt);
    if (amount == null || !mounted) return;
    final result = recordPayment(item.debt, amount, calc.fmtDate(calc.today0()));
    if (result == null) return;
    ref.read(debtsProvider.notifier).setDebt(item.debt.id, result.debt);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.full ? '已销这一期' : '已记录部分还款')),
      );
    }
  }
}

class _PayHero extends StatelessWidget {
  final List<PayItem> items;
  const _PayHero({required this.items});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Card(
        color: Theme.of(context).colorScheme.primaryContainer,
        child: const Padding(
          padding: EdgeInsets.all(28),
          child: Column(children: [Icon(Icons.check_circle, size: 48), SizedBox(height: 10), Text('全部结清', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)), SizedBox(height: 4), Text('暂无待还款项')]),
        ),
      );
    }
    final first = items.first;
    final sameDay = items.where((item) => item.dueDate == first.dueDate).toList();
    final names = sameDay.map((item) => item.debt.id).toSet().length;
    final total = sameDay.fold<num>(0, (sum, item) => sum + item.amount);
    final name = names > 1 ? '${first.debt.name} 等$names笔' : first.debt.name;
    final urgency = calc.urgencyTier(first.daysFromToday);
    final color = switch (urgency) {
      'overdue' => Theme.of(context).colorScheme.errorContainer,
      'crit' => Theme.of(context).colorScheme.tertiaryContainer,
      _ => Theme.of(context).colorScheme.primaryContainer,
    };
    return Card(
      color: color,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('最近还款日', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${first.dueDate.month}月${first.dueDate.day}日',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text(
                    calc.relLabel(first.daysFromToday),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            Text('¥${calc.fmt(total)}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 5),
          Text(name),
        ]),
      ),
    );
  }
}

class _PayStats extends StatelessWidget {
  final List<PayItem> items;
  const _PayStats({required this.items});
  @override
  Widget build(BuildContext context) => Row(
    children: [for (final days in [7, 15, 30]) Expanded(child: _StatCard(days: days, items: items))],
  );
}

class _StatCard extends StatelessWidget {
  final int days;
  final List<PayItem> items;
  const _StatCard({required this.days, required this.items});
  @override
  Widget build(BuildContext context) {
    final within = items.where((item) => item.daysFromToday >= 0 && item.daysFromToday <= days).toList();
    final total = within.fold<num>(0, (sum, item) => sum + item.amount);
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 3),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('¥${calc.fmt(total)}', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          Text('$days天内待还', style: Theme.of(context).textTheme.labelSmall),
          Text('共 ${within.length} 期', style: Theme.of(context).textTheme.labelSmall),
        ]),
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  final String selected;
  final int? customDays;
  final ValueChanged<String> onChanged;
  final VoidCallback onPickCustom;
  const _FilterBar({required this.selected, required this.customDays, required this.onChanged, required this.onPickCustom});
  @override
  Widget build(BuildContext context) => Row(children: [
    Expanded(
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final item in const [('next', '下一期'), ('overdue', '已逾期'), ('d7', '7天内'), ('d15', '15天内'), ('d30', '30天内')])
            Padding(padding: const EdgeInsets.only(right: 7), child: ChoiceChip(label: Text(item.$2), selected: selected == item.$1, onSelected: (_) => onChanged(item.$1))),
        ]),
      ),
    ),
    IconButton(
      icon: const Icon(Icons.calendar_month_outlined),
      tooltip: customDays == null ? '按日期筛选' : '自定义：$customDays天内',
      onPressed: onPickCustom,
    ),
  ]);
}

class _PayList extends StatelessWidget {
  final List<PayItem> items;
  final String label;
  final Future<void> Function(PayItem) onPay;
  final String? openSwipeId;
  final ValueChanged<String?> onOpenChanged;
  const _PayList({
    required this.items,
    required this.label,
    required this.onPay,
    required this.openSwipeId,
    required this.onOpenChanged,
  });
  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const Padding(padding: EdgeInsets.all(20), child: Center(child: Text('该分类下暂无待还款项')));
    final total = items.fold<num>(0, (sum, item) => sum + item.amount);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.fromLTRB(8, 0, 8, 6), child: Text('$label · ${items.length} 期 · ¥${calc.fmt(total)}', style: Theme.of(context).textTheme.titleSmall)),
      for (final item in items)
        SwipeReveal(
          key: ValueKey('pay-${item.debt.id}-${item.planIndex}'),
          open: openSwipeId == '${item.debt.id}-${item.planIndex}',
          onOpenChanged: (open) =>
              onOpenChanged(open ? '${item.debt.id}-${item.planIndex}' : null),
          actionLabel: '销这期',
          actionColor: Theme.of(context).colorScheme.primary,
          onAction: () => onPay(item),
          borderRadius: 18,
          child: _PayRow(item: item, onPay: () => onPay(item)),
        ),
    ]);
  }
}

class _PayRow extends StatelessWidget {
  final PayItem item;
  final Future<void> Function() onPay;
  const _PayRow({required this.item, required this.onPay});
  @override
  Widget build(BuildContext context) {
    final tier = calc.urgencyTier(item.daysFromToday);
    final color = switch (tier) {
      'overdue' => Theme.of(context).colorScheme.error,
      'crit' => Theme.of(context).colorScheme.tertiary,
      'warn' => Colors.orange,
      _ => Theme.of(context).colorScheme.primary,
    };
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 5),
      child: ListTile(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => DebtDetailScreen(debtId: item.debt.id))),
        leading: Container(width: 48, alignment: Alignment.center, decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(12)), child: Column(mainAxisSize: MainAxisSize.min, children: [Text('${item.dueDate.month}/${item.dueDate.day}', style: TextStyle(color: color, fontWeight: FontWeight.w800)), Text(calc.relLabel(item.daysFromToday), style: TextStyle(fontSize: 10, color: color))])),
        title: Text(item.debt.name),
        subtitle: const SizedBox.shrink(),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [Text('¥${calc.fmt(item.amount)}', style: const TextStyle(fontWeight: FontWeight.w700)), TextButton(onPressed: () => onPay(), child: const Text('销这期'))]),
      ),
    );
  }
}
