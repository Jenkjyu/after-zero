import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/archive_repository.dart';
import '../../data/providers.dart';

class ArchiveScreen extends ConsumerStatefulWidget {
  const ArchiveScreen({super.key});

  @override
  ConsumerState<ArchiveScreen> createState() => _ArchiveScreenState();
}

class _ArchiveScreenState extends ConsumerState<ArchiveScreen> {
  String? _selectedId;
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final uploads = ref.watch(archiveRepositoryProvider).readMetadata();
    final docs = ref.watch(docsProvider);
    final selected = uploads
        .where((item) => item.id == _selectedId)
        .firstOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('档案库')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
        children: [
          const Text('文档与文件（图片/PDF等，仅存本设备）'),
          const SizedBox(height: 10),
          FilledButton.icon(
            key: const Key('archive-upload'),
            onPressed: _busy ? null : _pickFile,
            icon: const Icon(Icons.upload_file),
            label: Text(_busy ? '正在导入…' : '上传文件'),
          ),
          const SizedBox(height: 14),
          if (uploads.isEmpty && docs.isEmpty)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('还没有档案文件')),
            ),
          for (final item in uploads)
            Card(
              child: ListTile(
                selected: item.id == _selectedId,
                leading: Icon(_iconFor(item.mime)),
                title: Text(item.name, overflow: TextOverflow.ellipsis),
                subtitle: Text('${_sizeText(item.size)} · ${item.mime}'),
                onTap: () => setState(
                  () => _selectedId = _selectedId == item.id ? null : item.id,
                ),
                trailing: PopupMenuButton<String>(
                  onSelected: (action) => _fileAction(action, item),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'save', child: Text('分享 / 保存')),
                    PopupMenuItem(value: 'delete', child: Text('删除')),
                  ],
                ),
              ),
            ),
          for (final doc in docs)
            Card(
              child: ExpansionTile(
                leading: const Icon(Icons.description_outlined),
                title: Text(doc.title.isEmpty ? doc.file : doc.title),
                subtitle: Text(doc.file),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: SelectableText(doc.content),
                  ),
                ],
              ),
            ),
          if (selected != null) ...[
            const SizedBox(height: 18),
            Text('预览', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            _ArchivePreview(item: selected),
          ],
        ],
      ),
    );
  }

  Future<void> _pickFile() async {
    setState(() => _busy = true);
    try {
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: true,
        type: FileType.custom,
        allowedExtensions: const [
          'jpg',
          'jpeg',
          'png',
          'gif',
          'webp',
          'heic',
          'heif',
          'bmp',
          'pdf',
          'md',
          'markdown',
          'doc',
          'docx',
        ],
      );
      final picked = result?.files.single;
      if (picked == null) return;
      Uint8List? bytes = picked.bytes;
      if (bytes == null && picked.path != null) {
        bytes = await File(picked.path!).readAsBytes();
      }
      if (bytes == null) throw StateError('无法读取所选文件');
      final item = await ref
          .read(archiveRepositoryProvider)
          .importBytes(
            name: picked.name,
            mime: mimeForName(picked.name),
            bytes: bytes,
          );
      if (mounted) setState(() => _selectedId = item.id);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('导入失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fileAction(String action, ArchiveFile item) async {
    if (action == 'save') {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('系统分享 / 另存为将在阶段 7 接入')));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除文件'),
        content: Text('删除「${item.name}」？此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(archiveRepositoryProvider).delete(item.id);
    if (mounted) setState(() => _selectedId = null);
  }
}

class _ArchivePreview extends StatelessWidget {
  final ArchiveFile item;
  const _ArchivePreview({required this.item});
  @override
  Widget build(BuildContext context) {
    if (item.mime.startsWith('image/')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.file(
          File(item.path),
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => const Card(
            child: Padding(padding: EdgeInsets.all(20), child: Text('图片预览失败')),
          ),
        ),
      );
    }
    if (item.mime == 'text/markdown') {
      return FutureBuilder<String>(
        future: File(item.path).readAsString(),
        builder: (context, snapshot) => Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SelectableText(snapshot.data ?? '正在读取…'),
          ),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Text(
          item.mime == 'application/pdf'
              ? 'PDF 已安全保存在本机档案库。Flutter 内嵌逐页预览会在原生能力收尾时接入。'
              : '此文件类型不支持内嵌预览，可在阶段 7 接入分享/保存后用其他应用打开。',
        ),
      ),
    );
  }
}

IconData _iconFor(String mime) {
  if (mime.startsWith('image/')) return Icons.image_outlined;
  if (mime == 'application/pdf') return Icons.picture_as_pdf_outlined;
  return Icons.attach_file;
}

String _sizeText(int bytes) {
  final kb = (bytes / 1024).round();
  return kb > 1024 ? '${(kb / 1024).toStringAsFixed(1)} MB' : '$kb KB';
}
