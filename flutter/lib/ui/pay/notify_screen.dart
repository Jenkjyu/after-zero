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
              subtitle: const Text('会申请系统权限，并在债务或规则变化时自动重排提醒'),
              value: notify.enabled,
              onChanged: _changeEnabled,
            ),
          ),
          OutlinedButton.icon(
            onPressed: notify.enabled ? _sendTest : null,
            icon: const Icon(Icons.notifications_active_outlined),
            label: const Text('发送测试通知（10秒后）'),
          ),
          const SizedBox(height: 8),
          Text(
            '用来验证手机能不能收到，不用等真实还款日；如果测试通知也收不到，大概率是系统电池优化/自启动限制拦了它，去系统设置里把本App加入白名单',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(height: 1.6),
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
          Wrap(
            spacing: 8,
            children: [
              for (var i = 0; i <= 3; i++)
                ChoiceChip(
                  label: Text(_offsetLabel(i)),
                  selected: _offset == i,
                  onSelected: (_) => setState(() => _offset = i),
                ),
            ],
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

  Future<void> _changeEnabled(bool enabled) async {
    final notifier = ref.read(notifyProvider.notifier);
    if (!enabled) {
      notifier.setEnabled(false);
      return;
    }
    try {
      final permitted = await ref
          .read(reminderSchedulerProvider)
          .enableNotifications();
      if (!permitted) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('未获得系统通知权限，已保持关闭')));
        }
        return;
      }
      if (ref.read(notifyProvider).rules.isEmpty) {
        notifier.addRule(const NotifyRule(offsetDays: 0, time: '09:00'));
      }
      notifier.setEnabled(true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('通知设置失败：$error')));
      }
    }
  }

  Future<void> _sendTest() async {
    try {
      await ref.read(reminderSchedulerProvider).scheduleTestNotification();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('测试通知将在10秒后送达')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('测试通知发送失败：$error')));
      }
    }
  }
}

String _offsetLabel(int days) => switch (days) {
  0 => '当天到期',
  1 => '提前1天',
  2 => '提前2天',
  3 => '提前3天',
  _ => '提前$days天',
};
