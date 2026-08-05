import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/debt_ops.dart';
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';

import 'debt_editor.dart';
import 'payment_sheet.dart';

/// 单笔债务的完整账本。页面总是按 id 从 provider 取最新值，因此还款/编辑后不会显示旧快照。
class DebtDetailScreen extends ConsumerWidget {
  final String debtId;

  const DebtDetailScreen({super.key, required this.debtId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final debt = ref.watch(debtsProvider).cast<Debt?>().firstWhere(
      (item) => item?.id == debtId,
      orElse: () => null,
    );
    if (debt == null) {
      return const Scaffold(body: Center(child: Text('这笔债务已不存在')));
    }
    return Scaffold(
      appBar: AppBar(title: Text(debt.name)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(
            [if (debt.funder?.isNotEmpty == true) debt.funder!, if (debt.type?.isNotEmpty == true) debt.type!].join(' · '),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          _DetailsGrid(debt: debt),
          if (debt.notes?.isNotEmpty == true) ...[
            const SizedBox(height: 16),
            Text('备注', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 5),
            Text(debt.notes!),
          ],
          const SizedBox(height: 24),
          Text('完整还款计划', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('含已还期次；蓝色行为当前待还期。', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 10),
          _PlanTable(debt: debt),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => DebtEditorScreen(debt: debt)),
            ),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('编辑债务'),
          ),
          if (debt.terms > 0) ...[
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () => _pay(context, ref, debt),
              icon: const Icon(Icons.check_circle_outline),
              label: Text(debt.oneTime == true ? '一次性结清' : '销这一期'),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () => _waive(context, ref, debt),
              child: const Text('协商减免这一期'),
            ),
          ],
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () => _openPrepay(context, debt),
            child: const Text('提前还款模拟'),
          ),
          if (debt.terms > 0) ...[
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => _settle(context, ref, debt),
              style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
              child: const Text('提前结清'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pay(BuildContext context, WidgetRef ref, Debt debt) async {
    final amount = await requestInstallmentPayment(context, debt);
    if (amount == null || !context.mounted) return;
    final result = recordPayment(debt, amount, calc.fmtDate(calc.today0()));
    if (result == null) return;
    ref.read(debtsProvider.notifier).setDebt(debt.id, result.debt);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.full ? '已销这一期' : '已记录部分还款')),
      );
      if (result.debt.settled == true) Navigator.of(context).pop();
    }
  }

  Future<void> _waive(BuildContext context, WidgetRef ref, Debt debt) async {
    final amount = await _askAmount(
      context,
      title: '协商减免这一期',
      hint: '实际收款金额（可填 0）',
      initial: debt.monthly,
    );
    if (amount == null || !context.mounted) return;
    final result = waivePeriod(debt, amount, calc.fmtDate(calc.today0()));
    if (result == null) return;
    ref.read(debtsProvider.notifier).setDebt(debt.id, result);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已记录协商减免')));
      if (result.settled == true) Navigator.of(context).pop();
    }
  }

  Future<void> _settle(BuildContext context, WidgetRef ref, Debt debt) async {
    final amount = await _askAmount(
      context,
      title: '提前结清',
      hint: '今天实际支付多少？',
      initial: debt.balance,
    );
    if (amount == null || !context.mounted) return;
    final result = applySettle(debt, amount, calc.fmtDate(calc.today0()));
    if (result == null) return;
    ref.read(debtsProvider.notifier).setDebt(debt.id, result);
    if (context.mounted) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已提前结清')));
    }
  }

  void _openPrepay(BuildContext context, Debt debt) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PrepaySheet(debt: debt),
    );
  }
}

class _DetailsGrid extends StatelessWidget {
  final Debt debt;
  const _DetailsGrid({required this.debt});

  @override
  Widget build(BuildContext context) {
    final values = <(String, String)>[
      ('借款金额', debt.original == null ? '—' : '¥${calc.fmt(debt.original!)}'),
      ('剩余待还', '¥${calc.fmt(debt.balance)}'),
      ('年化利率（推算）', debt.rate == 0 ? '无息' : '${debt.rate.toStringAsFixed(2)}%'),
      (debt.oneTime == true ? '应还金额' : '下期月供', '¥${calc.fmt(debt.monthly)}'),
      ('下个还款日', debt.nextDate ?? '—'),
      ('借款日', debt.opened ?? '—'),
      ('进度', '${debt.paidTerms} / ${debt.totalTerms} 期已还'),
      ('出资方', debt.funder?.isNotEmpty == true ? debt.funder! : '—'),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 2.25,
      children: [
        for (final value in values)
          Card(
            margin: const EdgeInsets.all(3),
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(value.$1, style: Theme.of(context).textTheme.labelSmall),
                  const SizedBox(height: 3),
                  Text(value.$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleSmall),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _PlanTable extends StatelessWidget {
  final Debt debt;
  const _PlanTable({required this.debt});

  @override
  Widget build(BuildContext context) {
    final next = debt.plan.indexWhere((row) => !row.paid);
    final stashed = debt.settleStash?.length ?? 0;
    final originalTerms = stashed == 0 ? debt.plan.length : debt.plan.length - 1 + stashed;
    num remaining = debt.original ?? 0;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columnSpacing: 18,
        columns: const [
          DataColumn(label: Text('期次')),
          DataColumn(label: Text('日期')),
          DataColumn(label: Text('金额')),
          DataColumn(label: Text('本金')),
          DataColumn(label: Text('利息/费')),
          DataColumn(label: Text('剩余本金')),
        ],
        rows: [
          for (var i = 0; i < debt.plan.length; i++)
            () {
              final row = debt.plan[i];
              remaining -= row.principal;
              final note = !row.paid && row.paidAmount != null && row.paidAmount! > 0
                  ? '（已还¥${calc.money(row.paidAmount!)}）'
                  : '';
              return DataRow(
                color: WidgetStatePropertyAll(
                  row.paid
                      ? Theme.of(context).colorScheme.surfaceContainerHighest
                      : i == next
                      ? Theme.of(context).colorScheme.primaryContainer
                      : null,
                ),
                cells: [
                  DataCell(Text(row.settleRow == true ? '✓ 结清' : '${row.paid ? '✓ ' : ''}${i + 1}/$originalTerms')),
                  DataCell(Text(row.date)),
                  DataCell(Text('¥${calc.money(row.amount)}$note')),
                  DataCell(Text('¥${calc.money(row.principal)}')),
                  DataCell(Text(row.settleRow == true && row.interest < 0 ? '减免¥${calc.money(-row.interest)}' : '¥${calc.money(row.interest)}')),
                  DataCell(Text('¥${calc.fmt(remaining < 0 ? 0 : remaining)}')),
                ],
              );
            }(),
        ],
      ),
    );
  }
}

Future<num?> _askAmount(
  BuildContext context, {
  required String title,
  required String hint,
  required num initial,
}) async {
  final controller = TextEditingController(text: initial.toStringAsFixed(2));
  String? error;
  try {
    return await showDialog<num>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: hint, prefixText: '¥ ', errorText: error),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
            FilledButton(
              onPressed: () {
                final value = num.tryParse(controller.text.trim());
                if (value == null || value < 0) {
                  setState(() => error = '请输入不小于 0 的金额');
                  return;
                }
                Navigator.pop(context, value);
              },
              child: const Text('确认'),
            ),
          ],
        ),
      ),
    );
  } finally {
    controller.dispose();
  }
}

class _PrepaySheet extends StatefulWidget {
  final Debt debt;
  const _PrepaySheet({required this.debt});

  @override
  State<_PrepaySheet> createState() => _PrepaySheetState();
}

class _PrepaySheetState extends State<_PrepaySheet> {
  late final TextEditingController _extra = TextEditingController(text: '1000');
  late final TextEditingController _period = TextEditingController(text: '1');
  String _mode = 'once';
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void dispose() {
    _extra.dispose();
    _period.dispose();
    super.dispose();
  }

  void _calculate() {
    final extra = num.tryParse(_extra.text.trim());
    final period = int.tryParse(_period.text.trim());
    if (extra == null || extra <= 0 || period == null || period < 1) {
      setState(() => _error = '请输入大于 0 的额外金额和有效期次');
      return;
    }
    final result = calc.simulatePrepay(widget.debt.toMap(), _mode, period, extra);
    setState(() {
      _result = result;
      _error = result == null ? '当前月供不足以覆盖利息，无法测算。' : null;
    });
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(24, 4, 24, 24 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('提前还款模拟', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'once', label: Text('单次提前还')),
              ButtonSegment(value: 'recurring', label: Text('每月额外还')),
            ],
            selected: {_mode},
            onSelectionChanged: (v) => setState(() => _mode = v.first),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _period,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '从第几期开始', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _extra,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: _mode == 'once' ? '额外还款金额' : '每月额外还款金额', prefixText: '¥ ', border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _calculate, child: const Text('开始测算')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          if (_result != null) Card(
            margin: const EdgeInsets.only(top: 16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('预计少还 ${_result!['monthsSaved']} 期，少付利息 ¥${calc.fmt(_result!['interestSaved'])}\n还清时间：${_result!['baseMonths']} 期 → ${_result!['newMonths']} 期'),
            ),
          ),
        ],
      ),
    ),
  );
}
