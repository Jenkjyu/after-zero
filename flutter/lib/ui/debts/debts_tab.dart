// “在还债务”tab——主页信息、排序、原生拖拽、左滑还款，以及详情/编辑入口。
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/debt_ops.dart';
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';
import 'package:after_zero/ui/account/account_screen.dart';
import 'package:after_zero/ui/ai/ai_screen.dart';
import 'package:after_zero/ui/mine/premium_screen.dart';

import 'debt_card.dart';
import 'debt_detail.dart';
import 'debt_editor.dart';
import 'debt_sort.dart';
import 'payment_sheet.dart';
import 'summary_hero.dart';

class DebtsTab extends ConsumerWidget {
  const DebtsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final debts = ref.watch(debtsProvider);
    final selectedSort = normalizedDebtSort(ref.watch(debtSortProvider));
    final active = debts.where((debt) => debt.settled != true).toList();
    final settled = debts.where((debt) => debt.settled == true).toList();
    final sortedActive = sortDebts(active, selectedSort);
    final premium = ref.watch(premiumProvider);
    final account = ref.watch(accountProvider);
    void openAi() => Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            premium.hasPremium ? const AiScreen() : const PremiumScreen(),
      ),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('债务'),
        actions: [
          IconButton(
            tooltip: '账户',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
            icon: CircleAvatar(
              radius: 15,
              backgroundImage: account?.avatarUrl.isNotEmpty == true
                  ? NetworkImage(account!.avatarUrl)
                  : null,
              child: account?.avatarUrl.isNotEmpty == true
                  ? null
                  : const Icon(Icons.person_outline, size: 18),
            ),
          ),
          if (kDebugMode)
            IconButton(
              icon: const Icon(Icons.bug_report_outlined),
              tooltip: '开发用：添加示例数据',
              onPressed: () => _seedSampleData(ref),
            ),
        ],
      ),
      body: active.isEmpty && settled.isEmpty
          ? _EmptyState(
              onAdd: () => _openEditor(context, null),
              premium: premium,
              onAi: openAi,
            )
          : active.isEmpty
          ? ListView(
              padding: const EdgeInsets.only(bottom: 28),
              children: [
                SummaryHero(debts: debts),
                _AiBanner(premium: premium, onTap: openAi),
                const _SettledTitle(),
                ...settled.map(
                  (debt) => _SettledDebtRow(
                    debt: debt,
                    onRestore: () => _restoreDebt(context, ref, debt),
                  ),
                ),
              ],
            )
          : ReorderableListView(
              padding: const EdgeInsets.only(bottom: 28),
              header: Column(
                children: [
                  SummaryHero(debts: debts),
                  _AiBanner(premium: premium, onTap: openAi),
                  _ListHeader(
                    sortLabel: debtSortLabel(selectedSort),
                    onSort: () => _openSortSheet(context, ref, selectedSort),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text('长按卡片可拖动排序', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                ],
              ),
              footer: settled.isEmpty
                  ? null
                  : Column(
                      children: [
                        const _SettledTitle(),
                        ...settled.map(
                          (debt) => _SettledDebtRow(
                            debt: debt,
                            onRestore: () => _restoreDebt(context, ref, debt),
                          ),
                        ),
                      ],
                    ),
              onReorderItem: (oldIndex, newIndex) =>
                  _reorderActive(ref, sortedActive, oldIndex, newIndex),
              children: [
                for (final debt in sortedActive)
                  KeyedSubtree(
                    key: ValueKey(debt.id),
                    child: Dismissible(
                      key: ValueKey('pay-${debt.id}'),
                      direction: DismissDirection.endToStart,
                      dismissThresholds: const {
                        DismissDirection.endToStart: .35,
                      },
                      // Dismissible的framework契约要求secondaryBackground存在时也必须给background；
                      // 本页只允许endToStart，所以正向层永远不会显示。
                      background: const SizedBox.expand(),
                      secondaryBackground: Container(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        padding: const EdgeInsets.only(right: 24),
                        alignment: Alignment.centerRight,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.check_circle_outline,
                              color: Colors.white,
                            ),
                            SizedBox(height: 4),
                            Text('销这期', style: TextStyle(color: Colors.white)),
                          ],
                        ),
                      ),
                      confirmDismiss: (_) async {
                        await _payInstallment(context, ref, debt);
                        return false;
                      },
                      child: DebtCard(
                        debt: debt,
                        onTap: () => _openDetail(context, debt),
                      ),
                    ),
                  ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('add-debt'),
        onPressed: () => _openEditor(context, null),
        icon: const Icon(Icons.add),
        label: const Text('新增一笔'),
      ),
    );
  }

  void _openSortSheet(BuildContext context, WidgetRef ref, String selected) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 8, 24, 8),
              child: Text(
                '排序方式',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
            ),
            for (final option in debtSortOptions)
              ListTile(
                title: Text(option.label),
                trailing: option.value == selected
                    ? const Icon(Icons.check)
                    : null,
                onTap: () {
                  ref.read(debtSortProvider.notifier).set(option.value);
                  Navigator.of(sheetContext).pop();
                },
              ),
          ],
        ),
      ),
    );
  }

  void _openDetail(BuildContext context, Debt debt) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => DebtDetailScreen(debtId: debt.id)),
    );
  }

  void _openEditor(BuildContext context, Debt? debt) {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => DebtEditorScreen(debt: debt)));
  }

  void _restoreDebt(BuildContext context, WidgetRef ref, Debt debt) {
    ref.read(debtsProvider.notifier).setDebt(debt.id, undoSettle(debt));
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('已恢复「${debt.name}」')));
  }

  void _reorderActive(
    WidgetRef ref,
    List<Debt> active,
    int oldIndex,
    int newIndex,
  ) {
    final reordered = List<Debt>.from(active);
    final moved = reordered.removeAt(oldIndex);
    reordered.insert(newIndex, moved);
    ref.read(debtsProvider.notifier).commitActiveReorder(reordered);
    ref.read(debtSortProvider.notifier).set(detectDebtSort(reordered));
  }

  Future<void> _payInstallment(
    BuildContext context,
    WidgetRef ref,
    Debt debt,
  ) async {
    final amount = await requestInstallmentPayment(context, debt);
    if (amount == null || !context.mounted) {
      return;
    }
    final result = recordPayment(debt, amount, calc.fmtDate(calc.today0()));
    if (result == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('已全部还清')));
      return;
    }
    ref.read(debtsProvider.notifier).setDebt(debt.id, result.debt);
    final message = result.full
        ? (result.debt.settled == true ? '${debt.name} 已还清 🎉' : '已销这一期')
        : '已记录 ¥${calc.fmt(amount)}，这期还差 ¥${calc.fmt(result.remaining)}';
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _seedSampleData(WidgetRef ref) {
    final plan = calc.genPlan({
      'kind': 'amort',
      'P': 12000,
      'rate': 12,
      'n': 12,
      'first': '2026-01-15',
    });
    final map = <String, dynamic>{
      'id': calc.genDebtId(),
      'name': '示例：银行消费贷',
      'funder': '示例银行',
      'type': '银行贷',
      'plan': plan,
    };
    calc.recompute(map);
    ref.read(debtsProvider.notifier).setDebt(null, Debt.fromMap(map));
  }
}

class _ListHeader extends StatelessWidget {
  final String sortLabel;
  final VoidCallback onSort;

  const _ListHeader({required this.sortLabel, required this.onSort});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 12, 4),
      child: Row(
        children: [
          Text(
            '在还债务',
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const Spacer(),
          TextButton.icon(
            onPressed: onSort,
            icon: const Icon(Icons.sort, size: 18),
            label: Text(sortLabel),
          ),
        ],
      ),
    );
  }
}

class _SettledTitle extends StatelessWidget {
  const _SettledTitle();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.fromLTRB(20, 24, 20, 6),
    child: Align(
      alignment: Alignment.centerLeft,
      child: Text('已结清 ✓', style: TextStyle(fontWeight: FontWeight.w700)),
    ),
  );
}

class _SettledDebtRow extends StatelessWidget {
  final Debt debt;
  final VoidCallback onRestore;

  const _SettledDebtRow({required this.debt, required this.onRestore});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: ListTile(
        title: Text(debt.name),
        subtitle: Text('已结清 ${debt.settledDate ?? ''}'),
        trailing: TextButton(onPressed: onRestore, child: const Text('恢复')),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onAdd;
  final Premium premium;
  final VoidCallback onAi;

  const _EmptyState({
    required this.onAdd,
    required this.premium,
    required this.onAi,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.check_circle_outline,
              size: 56,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 16),
            const Text('还没有在还的债务', textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(
              '从第一笔开始，看看离归零还有多远。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('新增一笔债务'),
            ),
            const SizedBox(height: 20),
            _AiBanner(premium: premium, onTap: onAi),
          ],
        ),
      ),
    );
  }
}

class _AiBanner extends StatelessWidget {
  final Premium premium;
  final VoidCallback onTap;
  const _AiBanner({required this.premium, required this.onTap});

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
    color: premium.hasPremium
        ? Theme.of(context).colorScheme.tertiaryContainer
        : null,
    child: ListTile(
      leading: Icon(
        Icons.auto_awesome,
        color: premium.hasPremium
            ? Theme.of(context).colorScheme.tertiary
            : Theme.of(context).colorScheme.outline,
      ),
      title: Text(premium.hasPremium ? 'AI 债务助手' : 'AI 债务分析报告'),
      subtitle: Text(
        premium.hasPremium ? '优先还款建议，围绕你的债务随问随答' : '开通 Premium，获取更省钱的还款顺序',
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}
