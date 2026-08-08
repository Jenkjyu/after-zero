// “在还债务”tab——主页信息、排序、原生拖拽、左滑还款，以及详情/编辑入口。
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
import '../shared/swipe_reveal.dart';

class DebtsTab extends ConsumerStatefulWidget {
  const DebtsTab({super.key});

  @override
  ConsumerState<DebtsTab> createState() => _DebtsTabState();
}

class _DebtsTabState extends ConsumerState<DebtsTab>
    with SingleTickerProviderStateMixin {
  String? _openSwipeId;
  bool _jiggle = false;
  late final AnimationController _jiggleAnim;

  @override
  void initState() {
    super.initState();
    _jiggleAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 380),
    );
  }

  @override
  void dispose() {
    _jiggleAnim.dispose();
    super.dispose();
  }

  void _setJiggle(bool value) {
    if (value == _jiggle) return;
    setState(() => _jiggle = value);
    if (value) {
      _jiggleAnim.repeat(reverse: true);
    } else {
      _jiggleAnim.stop();
    }
  }

  @override
  Widget build(BuildContext context) {
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
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 16,
        toolbarHeight: 52,
        title: Text(
          'After Zero',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            fontStyle: FontStyle.italic,
            letterSpacing: -.5,
          ),
        ),
        actions: [
          if (_jiggle)
            TextButton(
              onPressed: () => _setJiggle(false),
              child: const Text('保存'),
            ),
          IconButton(
            tooltip: '账户',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
            icon: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                shape: BoxShape.circle,
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: account?.avatarUrl.isNotEmpty == true
                  ? Image.network(account!.avatarUrl, fit: BoxFit.cover)
                  : Icon(
                      Icons.person_outline,
                      size: 20,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
            ),
          ),
          const SizedBox(width: 6),
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
                const _DebtNoteToggle(),
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
                  const _DebtNoteToggle(),
                  _ListHeader(
                    sortLabel: debtSortLabel(selectedSort),
                    onSort: () {
                      if (_jiggle) return;
                      _openSortSheet(context, ref, selectedSort);
                    },
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
              buildDefaultDragHandles: false,
              children: [
                for (var index = 0; index < sortedActive.length; index++)
                  KeyedSubtree(
                    key: ValueKey(sortedActive[index].id),
                    child: _jiggle
                        ? ReorderableDragStartListener(
                            index: index,
                            child: _JiggleCard(
                              index: index,
                              animation: _jiggleAnim,
                              child: _debtSwipeRow(
                                context,
                                ref,
                                sortedActive[index],
                              ),
                            ),
                          )
                        : GestureDetector(
                            onLongPress: () => _setJiggle(true),
                            child: _debtSwipeRow(
                              context,
                              ref,
                              sortedActive[index],
                            ),
                          ),
                  ),
              ],
            ),
      // 空状态已有完整宽度的新增入口；不再叠一个Material FAB，避免同一操作抢占两次视觉焦点。
      floatingActionButton: active.isEmpty && settled.isEmpty
          ? null
          : FloatingActionButton.extended(
              key: const Key('add-debt'),
              onPressed: () => _openEditor(context, null),
              icon: const Icon(Icons.add),
              label: const Text('新增一笔'),
            ),
    );
  }

  Widget _debtSwipeRow(
    BuildContext context,
    WidgetRef ref,
    Debt debt,
  ) {
    return SwipeReveal(
      open: !_jiggle && _openSwipeId == debt.id,
      onOpenChanged: (open) => setState(
        () => _openSwipeId = open ? debt.id : null,
      ),
      actionLabel: '销这期',
      actionColor: Theme.of(context).colorScheme.primary,
      onAction: () => _payInstallment(context, ref, debt),
      child: DebtCard(
        debt: debt,
        onTap: () {
          if (_jiggle) return;
          _openDetail(context, debt);
        },
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

class _JiggleCard extends StatelessWidget {
  final int index;
  final Animation<double> animation;
  final Widget child;
  const _JiggleCard({
    required this.index,
    required this.animation,
    required this.child,
  });
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: animation,
    builder: (context, _) {
      final phase = (index.isEven ? 1.0 : -1.0) * animation.value;
      return Transform.rotate(angle: .018 * phase, child: child);
    },
  );
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
            FilledButton(
              key: const Key('add-debt'),
              onPressed: onAdd,
              child: const Text('＋ 新增一笔'),
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
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = premium.hasPremium;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
      child: Material(
        color: scheme.surface,
        elevation: 1.5,
        shadowColor: Colors.black.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 11, 14, 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active ? scheme.primary.withValues(alpha: .45) : scheme.outlineVariant,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 33,
                  height: 33,
                  decoration: BoxDecoration(
                    color: active ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.auto_awesome,
                    size: 18,
                    color: active ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        active ? 'AI 债务助手' : 'AI 债务分析报告',
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        active
                            ? '雪球/雪崩法分析、优先还款建议，随问随答'
                            : '开通 Premium，获取雪球/雪崩法分析与更省钱的还款顺序',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DebtNoteToggle extends StatefulWidget {
  const _DebtNoteToggle();
  @override
  State<_DebtNoteToggle> createState() => _DebtNoteToggleState();
}

class _DebtNoteToggleState extends State<_DebtNoteToggle> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            borderRadius: BorderRadius.circular(6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '计算口径说明',
                  style: TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  _open ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                  size: 16,
                  color: accent,
                ),
              ],
            ),
          ),
          if (_open)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '在还总负债 = 各未结清债务「未还本金」之和（只算本金、不含未来利息/手续费）。\n'
                '已还本金 = 全部债务（含已结清）「已还期数」的本金之和；另付利息 = 这些已还期数对应的利息/手续费之和。\n'
                '经常性月供 = 各未结清债务下一期应还之和（不含标记为「一次性还清」的借款）。\n'
                '已完成% = 已还本金 ÷（已还本金 + 在还总负债）。「提前结清」会问你实际付了多少钱，剩余本金计入已还本金，实付超出的部分计入另付利息（协商减免记为负数）。',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(height: 1.7),
              ),
            ),
        ],
      ),
    );
  }
}
