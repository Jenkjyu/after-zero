// 底部四个tab的外壳——债务/还款日/统计/我的，对应旧版tabbar。
import 'package:flutter/material.dart';

import 'debts/debts_tab.dart';
import 'mine/mine_tab.dart';
import 'pay/pay_tab.dart';
import 'report/report_tab.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  static const _tabs = [
    (
      icon: Icons.credit_card_outlined,
      selectedIcon: Icons.credit_card,
      label: '债务',
    ),
    (icon: Icons.event_outlined, selectedIcon: Icons.event, label: '还款日'),
    (
      icon: Icons.bar_chart_outlined,
      selectedIcon: Icons.bar_chart,
      label: '统计',
    ),
    (icon: Icons.person_outline, selectedIcon: Icons.person, label: '我的'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [DebtsTab(), PayTab(), ReportTab(), MineTab()],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          border: Border(
            top: BorderSide(color: Theme.of(context).colorScheme.outline),
          ),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 52,
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  Expanded(
                    child: _TabButton(
                      label: _tabs[i].label,
                      icon: _tabs[i].icon,
                      selectedIcon: _tabs[i].selectedIcon,
                      selected: _index == i,
                      onTap: () => setState(() => _index = i),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final bool selected;
  final VoidCallback onTap;

  const _TabButton({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.onSurfaceVariant;
    return Semantics(
      label: label,
      button: true,
      selected: selected,
      child: InkResponse(
        key: Key('tab-$label'),
        onTap: onTap,
        radius: 28,
        containedInkWell: true,
        child: Center(
          child: Icon(selected ? selectedIcon : icon, color: color, size: 23),
        ),
      ),
    );
  }
}
