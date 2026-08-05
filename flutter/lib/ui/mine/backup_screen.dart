import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../cloud/backup_service.dart';
import '../../data/providers.dart';

class BackupScreen extends ConsumerStatefulWidget {
  const BackupScreen({super.key});

  @override
  ConsumerState<BackupScreen> createState() => _BackupScreenState();
}

class _BackupScreenState extends ConsumerState<BackupScreen> {
  List<BackupRecord>? _records;
  String? _error;
  bool _creating = false;
  late int _lastBackupAt;

  @override
  void initState() {
    super.initState();
    _lastBackupAt = ref.read(localStoreProvider).readLastBackupAt();
    Future.microtask(_refresh);
  }

  Future<void> _refresh() async {
    setState(() {
      _records = null;
      _error = null;
    });
    try {
      final records = await ref.read(backupServiceProvider).list();
      if (mounted) setState(() => _records = records);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('云备份')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
      children: [
        const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text('手动创建云端备份，每一条都是独立记录，可以随时选一条恢复到本机。恢复会整体覆盖当前债务、档案和设置。'),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '上次备份：${_lastBackupAt == 0 ? '从未备份' : _dateTime(_lastBackupAt)}',
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  key: const Key('create-cloud-backup'),
                  onPressed: _creating ? null : _create,
                  icon: _creating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cloud_upload_outlined),
                  label: Text(_creating ? '正在打包…' : '创建备份'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('备份记录', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (_records == null && _error == null)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_error != null)
          Card(
            child: ListTile(
              title: Text('获取备份列表失败：$_error'),
              trailing: IconButton(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
              ),
            ),
          )
        else if (_records!.isEmpty)
          const Padding(
            padding: EdgeInsets.all(20),
            child: Text('还没有备份记录，点上面的按钮创建第一条'),
          )
        else
          for (final record in _records!)
            Card(
              child: ListTile(
                title: Text(_dateTime(record.createdAt)),
                subtitle: Text(
                  '${record.debtsCount} 笔债务 · ${record.filesCount} 个文件 · ${_sizeText(record.totalSizeBytes)}',
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (action) =>
                      action == 'restore' ? _restore(record) : _delete(record),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'restore', child: Text('恢复')),
                    PopupMenuItem(value: 'delete', child: Text('删除')),
                  ],
                ),
              ),
            ),
      ],
    ),
  );

  Future<void> _create() async {
    setState(() => _creating = true);
    try {
      await ref
          .read(backupServiceProvider)
          .create(
            debts: ref.read(debtsProvider),
            docs: ref.read(docsProvider),
            notify: ref.read(notifyProvider),
            premium: ref.read(premiumProvider),
          );
      _lastBackupAt = DateTime.now().millisecondsSinceEpoch;
      await ref.read(localStoreProvider).writeLastBackupAt(_lastBackupAt);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('备份已创建 ✓')));
      }
      await _refresh();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('备份失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _restore(BackupRecord record) async {
    final confirmed = await _confirm(
      '恢复这条备份？',
      '创建于 ${_dateTime(record.createdAt)} 的记录将覆盖本机当前的全部债务、档案和设置，且不可撤销。',
    );
    if (!confirmed) return;
    try {
      final restored = await ref.read(backupServiceProvider).restore(record.id);
      ref.read(debtsProvider.notifier).replaceAll(restored.debts);
      ref.read(docsProvider.notifier).replaceAll(restored.docs);
      ref.read(notifyProvider.notifier).replace(restored.notify);
      ref.read(premiumProvider.notifier).set(restored.premium);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('已恢复 ✓')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('恢复失败：$error')));
      }
    }
  }

  Future<void> _delete(BackupRecord record) async {
    if (!await _confirm('删除这条备份记录？', '删除后无法恢复，确定继续吗？')) return;
    try {
      await ref.read(backupServiceProvider).delete(record.id);
      await _refresh();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('删除失败：$error')));
      }
    }
  }

  Future<bool> _confirm(String title, String body) async =>
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
}

String _dateTime(int milliseconds) {
  final value = DateTime.fromMillisecondsSinceEpoch(milliseconds);
  String two(int part) => part.toString().padLeft(2, '0');
  return '${value.year}-${two(value.month)}-${two(value.day)} ${two(value.hour)}:${two(value.minute)}';
}

String _sizeText(int bytes) {
  final kb = (bytes / 1024).round();
  return kb > 1024 ? '${(kb / 1024).toStringAsFixed(1)} MB' : '$kb KB';
}
