// 底部四个tab的外壳——债务/还款日/统计/我的，对应vanilla的tabbar。这一步只有"债务"tab有
// 真实内容(阶段4)，其余三个是占位("敬请期待")，到对应阶段(5/6)才会填上真实内容。
import 'package:flutter/material.dart';

import 'debts/debts_tab.dart';
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
      icon: Icons.account_balance_wallet_outlined,
      selectedIcon: Icons.account_balance_wallet,
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
        children: const [
          DebtsTab(),
          PayTab(),
          ReportTab(),
          _ComingSoonTab(title: '我的'),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final t in _tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

class _ComingSoonTab extends StatelessWidget {
  final String title;

  const _ComingSoonTab({required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: const Center(child: Text('这一页还在搬过来的路上')),
    );
  }
}
