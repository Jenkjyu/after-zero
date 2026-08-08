import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/debt_ops.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../export/report_export_service.dart';
import '../account/account_screen.dart';
import 'archive_screen.dart';
import 'backup_screen.dart';
import 'legal_screens.dart';
import 'premium_screen.dart';

class MineTab extends ConsumerWidget {
  const MineTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(accountProvider);
    final premium = ref.watch(premiumProvider);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 32),
          children: [
          Center(
            child: InkWell(
              borderRadius: BorderRadius.circular(60),
              onTap: () => _push(context, const AccountScreen()),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 39,
                    backgroundColor: Theme.of(
                      context,
                    ).colorScheme.surfaceContainerHighest,
                    backgroundImage: account?.avatarUrl.isNotEmpty == true
                        ? NetworkImage(account!.avatarUrl)
                        : null,
                    child: account?.avatarUrl.isNotEmpty == true
                        ? null
                        : Icon(
                            Icons.person_outline,
                            size: 36,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    account?.nickname ?? '',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          _EntryTile(
            icon: Icons.auto_awesome,
            title: premium.hasPremium ? 'Premium 会员' : '升级 Premium',
            subtitle: premium.hasPremium ? '查看会员详情' : '云备份 · 报表导出 · AI 债务助手',
            onTap: () => _push(context, const PremiumScreen()),
          ),
          const SizedBox(height: 12),
          _EntryTile(
            icon: Icons.cloud_outlined,
            title: '云备份',
            subtitle: 'Premium · 云端多份记录，换手机也能找回',
            onTap: () {
              if (!premium.hasPremium) {
                _push(context, const PremiumScreen());
              } else {
                _push(context, const BackupScreen());
              }
            },
          ),
          _EntryTile(
            icon: Icons.inventory_2_outlined,
            title: '档案库',
            subtitle: '合同、还款回执等文档，仅存本机',
            onTap: () => _push(context, const ArchiveScreen()),
          ),
          const SizedBox(height: 12),
          _EntryTile(
            icon: Icons.download_outlined,
            title: '下载备份文件',
            subtitle: '导出全部债务和档案，存到本地',
            onTap: () => _downloadBackup(context, ref),
          ),
          _EntryTile(
            icon: Icons.upload_outlined,
            title: '上传备份文件',
            subtitle: '从备份文件恢复，会覆盖当前数据',
            onTap: () => _importBackup(context, ref),
          ),
          const SizedBox(height: 12),
          _EntryTile(
            icon: Icons.info_outline,
            title: '关于我们',
            subtitle: '版本、协议与联系方式',
            onTap: () => _push(context, const AboutScreen()),
          ),
        ],
      ),
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _EntryTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.symmetric(vertical: 4),
    child: ListTile(
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primaryContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon),
      ),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}

void _push(BuildContext context, Widget screen) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));

Future<void> _importBackup(BuildContext context, WidgetRef ref) async {
  try {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      withData: true,
      type: FileType.custom,
      allowedExtensions: const ['json'],
    );
    final file = result?.files.single;
    if (file == null) return;
    final bytes = file.bytes;
    if (bytes == null) throw const FormatException('无法读取文件内容');
    final decoded = jsonDecode(utf8.decode(bytes));
    final rawDebts = decoded is List
        ? decoded
        : (decoded as Map)['debts'] as List<dynamic>?;
    if (rawDebts == null) throw const FormatException('缺少债务数据');
    if (!context.mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('导入覆盖'),
        content: Text(
          '用「${file.name}」覆盖当前 ${ref.read(debtsProvider).length} 笔债务和档案？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('覆盖导入'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final debts = rawDebts
        .map((item) => normalizeDebt((item as Map).cast<String, dynamic>()))
        .toList();
    ref.read(debtsProvider.notifier).replaceAll(debts);
    if (decoded is Map && decoded['docs'] is List) {
      ref
          .read(docsProvider.notifier)
          .replaceAll(
            (decoded['docs'] as List<dynamic>)
                .map(
                  (item) =>
                      DocEntry.fromMap((item as Map).cast<String, dynamic>()),
                )
                .toList(),
          );
    }
    if (decoded is Map && decoded['uploads'] is List) {
      final archive = ref.read(archiveRepositoryProvider);
      await archive.clear();
      for (final raw in decoded['uploads'] as List<dynamic>) {
        final item = (raw as Map).cast<String, dynamic>();
        final dataUrl = item['dataURL'] as String? ?? '';
        final comma = dataUrl.indexOf(',');
        if (comma < 0) continue;
        await archive.importBytes(
          stableId: item['id'] as String?,
          name: item['name'] as String? ?? '未命名文件',
          mime: item['mime'] as String? ?? '',
          bytes: Uint8List.fromList(base64Decode(dataUrl.substring(comma + 1))),
        );
      }
    }
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('已导入 ${debts.length} 笔 ✓')));
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('导入失败：$error')));
    }
  }
}

Future<void> _downloadBackup(BuildContext context, WidgetRef ref) async {
  try {
    final bytes = await ref
        .read(localBackupServiceProvider)
        .build(debts: ref.read(debtsProvider), docs: ref.read(docsProvider));
    final saved = await ref
        .read(systemFileSaverProvider)
        .saveBytes(
          bytes: bytes,
          filename: 'AfterZero备份${exportDateStamp()}.json',
          mimeType: backupJsonMime,
        );
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(saved ? '备份文件已保存 ✓' : '已取消保存')));
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('备份导出失败：$error')));
    }
  }
}
