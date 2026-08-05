import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const archiveFilesKey = 'after-zero-archive-files-v1';
const archiveMaxBackupFileBytes = 8 * 1024 * 1024;

class ArchiveFile {
  final String id;
  final String name;
  final String mime;
  final int size;
  final String path;
  final int createdAt;

  const ArchiveFile({
    required this.id,
    required this.name,
    required this.mime,
    required this.size,
    required this.path,
    required this.createdAt,
  });

  factory ArchiveFile.fromMap(Map<String, dynamic> map) => ArchiveFile(
    id: map['id'] as String? ?? '',
    name: map['name'] as String? ?? '',
    mime: map['mime'] as String? ?? 'application/octet-stream',
    size: (map['size'] as num?)?.toInt() ?? 0,
    path: map['path'] as String? ?? '',
    createdAt: (map['createdAt'] as num?)?.toInt() ?? 0,
  );

  Map<String, dynamic> toMap() => {
    'id': id,
    'name': name,
    'mime': mime,
    'size': size,
    'path': path,
    'createdAt': createdAt,
  };
}

typedef ArchiveDirectoryProvider = Future<Directory> Function();

/// 档案库的二进制文件存储。SharedPreferences只保存轻量元数据，真实文件放应用文档目录，
/// 避免把数MB的图片/PDF塞进preferences。所有删除/恢复都同时维护文件和元数据。
class ArchiveRepository {
  final SharedPreferences prefs;
  final ArchiveDirectoryProvider _documentsDirectory;

  ArchiveRepository(this.prefs, {ArchiveDirectoryProvider? documentsDirectory})
    : _documentsDirectory =
          documentsDirectory ?? getApplicationDocumentsDirectory;

  List<ArchiveFile> readMetadata() {
    final raw = prefs.getString(archiveFilesKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      return (jsonDecode(raw) as List<dynamic>)
          .map(
            (item) =>
                ArchiveFile.fromMap((item as Map).cast<String, dynamic>()),
          )
          .where((item) => item.id.isNotEmpty && item.path.isNotEmpty)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeMetadata(List<ArchiveFile> files) => prefs.setString(
    archiveFilesKey,
    jsonEncode(files.map((item) => item.toMap()).toList()),
  );

  Future<Directory> _archiveDirectory() async {
    final root = await _documentsDirectory();
    final dir = Directory('${root.path}/after-zero-archive');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<ArchiveFile> importBytes({
    required String name,
    required String mime,
    required Uint8List bytes,
    String? stableId,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = stableId ?? 'f$now${name.hashCode.abs().toRadixString(36)}';
    final dir = await _archiveDirectory();
    final safeName = name.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    final file = File('${dir.path}/$id-$safeName');
    await file.writeAsBytes(bytes, flush: true);
    final item = ArchiveFile(
      id: id,
      name: name,
      mime: mime.isEmpty ? mimeForName(name) : mime,
      size: bytes.length,
      path: file.path,
      createdAt: now,
    );
    final next = [item, ...readMetadata().where((old) => old.id != id)];
    await _writeMetadata(next);
    return item;
  }

  Future<Uint8List> readBytes(ArchiveFile item) =>
      File(item.path).readAsBytes();

  Future<void> delete(String id) async {
    final files = readMetadata();
    final target = files.where((item) => item.id == id).firstOrNull;
    if (target != null) {
      final file = File(target.path);
      if (await file.exists()) await file.delete();
    }
    await _writeMetadata(files.where((item) => item.id != id).toList());
  }

  Future<void> clear() async {
    for (final item in readMetadata()) {
      final file = File(item.path);
      if (await file.exists()) await file.delete();
    }
    await prefs.remove(archiveFilesKey);
  }

  Future<void> replaceWithRemote(
    List<Map<String, dynamic>> files,
    Future<Uint8List> Function(String url) download,
  ) async {
    await clear();
    for (final map in files) {
      final url = map['tempURL'] as String? ?? '';
      if (url.isEmpty) continue;
      await importBytes(
        stableId: map['id'] as String?,
        name: map['name'] as String? ?? '未命名文件',
        mime: map['mime'] as String? ?? 'application/octet-stream',
        bytes: await download(url),
      );
    }
  }
}

String mimeForName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}
