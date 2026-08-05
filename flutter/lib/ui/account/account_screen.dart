import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../cloud/ai_advisor.dart';
import '../../cloud/cloud_auth_controller.dart';
import '../../cloud/cloud_providers.dart';
import '../../data/models.dart';
import '../../data/providers.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(accountProvider);
    final premium = ref.watch(premiumProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('账户')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Column(
              children: [
                _InfoRow(
                  label: '头像',
                  child: CircleAvatar(
                    backgroundImage:
                        account != null && account.avatarUrl.isNotEmpty
                        ? NetworkImage(account.avatarUrl)
                        : null,
                    child: account == null || account.avatarUrl.isEmpty
                        ? const Icon(Icons.person_outline)
                        : null,
                  ),
                ),
                _InfoRow(label: '昵称', value: account?.nickname ?? ''),
                _InfoRow(
                  label: '会员',
                  value: premium.hasPremium ? 'Premium 会员' : '普通用户',
                ),
                const _InfoRow(label: '微信绑定', value: '已绑定'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () async {
              await ref.read(cloudAuthControllerProvider.notifier).logout();
              if (context.mounted) Navigator.of(context).pop();
            },
            child: const Text('退出登录'),
          ),
          const SizedBox(height: 10),
          FilledButton.tonal(
            style: FilledButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => _accountActions(context, ref),
            child: const Text('注销账户'),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String? value;
  final Widget? child;
  const _InfoRow({required this.label, this.value, this.child});
  @override
  Widget build(BuildContext context) =>
      ListTile(title: Text(label), trailing: child ?? Text(value ?? ''));
}

Future<void> _accountActions(BuildContext context, WidgetRef ref) async {
  final action = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('注销账户'),
      content: const Text(
        '注销后账号数据将从服务器永久删除，且需要重新微信登录才能再次使用，此操作不可撤销。如果只是想清空本地数据、保留账户，可以选择“重置本地数据”。',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, 'reset'),
          child: const Text('重置本地数据'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, 'delete'),
          child: const Text('确认注销'),
        ),
      ],
    ),
  );
  if (!context.mounted || action == null) return;
  if (action == 'reset') {
    final confirmed = await _confirm(
      context,
      '确定重置本地数据？',
      '这会清空手机上保存的全部数据（债务记录、文档、AI 对话等），且无法恢复。账户本身和云备份不受影响。',
    );
    if (!confirmed) return;
    await _clearLocal(ref, keepCloudAccount: false);
    if (context.mounted) Navigator.of(context).pop();
    return;
  }
  final confirmed = await _confirm(
    context,
    '最后确认注销账户',
    '服务器账户及其全部云备份会被永久删除，确定继续吗？',
  );
  if (!confirmed) return;
  try {
    final raw = await ref
        .read(cloudBaseClientProvider)
        .callFunction('deleteAccount');
    final result = (raw as Map).cast<String, dynamic>();
    if (result['ok'] != true) throw StateError(result['error'] ?? '注销失败');
    await _clearLocal(ref, keepCloudAccount: false);
    if (context.mounted) Navigator.of(context).pop();
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('注销失败：$error')));
    }
  }
}

Future<bool> _confirm(BuildContext context, String title, String body) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确定'),
          ),
        ],
      ),
    ) ??
    false;

Future<void> _clearLocal(
  WidgetRef ref, {
  required bool keepCloudAccount,
}) async {
  await ref.read(archiveRepositoryProvider).clear();
  await ref.read(sharedPreferencesProvider).clear();
  ref.read(debtsProvider.notifier).replaceAll([]);
  ref.read(docsProvider.notifier).replaceAll([]);
  ref.read(notifyProvider.notifier).replace(NotifySettings.empty);
  ref.read(premiumProvider.notifier).set(const Premium());
  ref.read(aiHistoryProvider.notifier).clear();
  if (!keepCloudAccount) {
    await ref.read(cloudAuthControllerProvider.notifier).logout();
  }
}
