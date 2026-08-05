import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models.dart';
import '../../data/providers.dart';

class NotifyScreen extends ConsumerStatefulWidget {
  const NotifyScreen({super.key});

  @override
  ConsumerState<NotifyScreen> createState() => _NotifyScreenState();
}

class _NotifyScreenState extends ConsumerState<NotifyScreen> {
  int _offset = 0;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);

  @override
  Widget build(BuildContext context) {
    final notify = ref.watch(notifyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('还款提醒通知')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: SwitchListTile(
              title: const Text('启用通知'),
              subtitle: const Text('阶段 7 将接入系统通知权限和真实排程'),
              value: notify.enabled,
              onChanged: (value) {
                final notifier = ref.read(notifyProvider.notifier);
                notifier.setEnabled(value);
                if (value && notify.rules.isEmpty) {
                  notifier.addRule(
                    const NotifyRule(offsetDays: 0, time: '09:00'),
                  );
                }
              },
            ),
          ),
          OutlinedButton.icon(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('测试通知会在阶段 7 接入原生通知后生效')),
            ),
            icon: const Icon(Icons.notifications_active_outlined),
            label: const Text('发送测试通知（10秒后）'),
          ),
          const SizedBox(height: 20),
          Text(
            '提醒规则（对所有在还债务统一生效）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (notify.rules.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('还没有提醒规则，添加一条吧'),
            ),
          for (var i = 0; i < notify.rules.length; i++)
            Card(
              child: ListTile(
                title: Text(
                  '${_offsetLabel(notify.rules[i].offsetDays)} · ${notify.rules[i].time}',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  tooltip: '删除',
                  onPressed: () =>
                      ref.read(notifyProvider.notifier).deleteRule(i),
                ),
              ),
            ),
          const SizedBox(height: 20),
          Text('添加新提醒', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          DropdownButtonFormField<int>(
            initialValue: _offset,
            decoration: const InputDecoration(labelText: '提前时间'),
            items: [
              for (var i = 0; i <= 3; i++)
                DropdownMenuItem(value: i, child: Text(_offsetLabel(i))),
            ],
            onChanged: (value) => setState(() => _offset = value ?? 0),
          ),
          const SizedBox(height: 10),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('提醒时刻'),
            subtitle: Text(_time.format(context)),
            trailing: const Icon(Icons.schedule),
            onTap: () async {
              final result = await showTimePicker(
                context: context,
                initialTime: _time,
              );
              if (result != null && mounted) setState(() => _time = result);
            },
          ),
          FilledButton(
            onPressed: () {
              final time =
                  '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';
              ref
                  .read(notifyProvider.notifier)
                  .addRule(NotifyRule(offsetDays: _offset, time: time));
            },
            child: const Text('添加'),
          ),
        ],
      ),
    );
  }
}

String _offsetLabel(int days) => switch (days) {
  0 => '当天到期',
  1 => '提前1天',
  2 => '提前2天',
  3 => '提前3天',
  _ => '提前$days天',
};
