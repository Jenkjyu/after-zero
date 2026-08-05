import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../data/archive_repository.dart';
import '../data/debt_ops.dart';
import '../data/models.dart';
import '../data/providers.dart';
import 'cloud_providers.dart';
import 'cloudbase_client.dart';

class BackupRecord {
  final String id;
  final int createdAt;
  final int debtsCount;
  final int filesCount;
  final int totalSizeBytes;

  const BackupRecord({
    required this.id,
    required this.createdAt,
    required this.debtsCount,
    required this.filesCount,
    required this.totalSizeBytes,
  });

  factory BackupRecord.fromMap(Map<String, dynamic> map) => BackupRecord(
    id: map['id'] as String? ?? '',
    createdAt: (map['createdAt'] as num?)?.toInt() ?? 0,
    debtsCount: (map['debtsCount'] as num?)?.toInt() ?? 0,
    filesCount: (map['filesCount'] as num?)?.toInt() ?? 0,
    totalSizeBytes: (map['totalSizeBytes'] as num?)?.toInt() ?? 0,
  );
}

class RestoredBackup {
  final List<Debt> debts;
  final List<DocEntry> docs;
  final NotifySettings notify;
  final Premium premium;

  const RestoredBackup({
    required this.debts,
    required this.docs,
    required this.notify,
    required this.premium,
  });
}

class BackupServiceException implements Exception {
  final String message;
  const BackupServiceException(this.message);
  @override
  String toString() => message;
}

/// 云备份保持既有“手动创建独立记录”的模型。所有文件都先经backupUploadFile云函数，
/// 再把返回的fileID交给backupCreate；客户端不直传Cloud Storage。
class BackupService {
  final CloudBaseClient client;
  final ArchiveRepository archive;
  final http.Client _http;

  BackupService({
    required this.client,
    required this.archive,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  Future<List<BackupRecord>> list() async {
    final result = _resultMap(await client.callFunction('backupList'));
    _requireOk(result, '获取备份列表失败');
    return ((result['list'] as List<dynamic>?) ?? const [])
        .map(
          (item) => BackupRecord.fromMap((item as Map).cast<String, dynamic>()),
        )
        .toList();
  }

  Future<void> create({
    required List<Debt> debts,
    required List<DocEntry> docs,
    required NotifySettings notify,
    required Premium premium,
  }) async {
    final backupId =
        'b${DateTime.now().millisecondsSinceEpoch}${debts.length.toRadixString(36)}';
    final uploaded = <Map<String, dynamic>>[];
    for (final item in archive.readMetadata()) {
      if (item.size > archiveMaxBackupFileBytes) continue;
      final bytes = await archive.readBytes(item);
      final result = _resultMap(
        await client.callFunction(
          'backupUploadFile',
          data: {
            'backupId': backupId,
            'fileId': item.id,
            'filename': item.name,
            'mime': item.mime,
            'base64': base64Encode(bytes),
          },
        ),
      );
      _requireOk(result, '文件上传失败');
      uploaded.add({
        'id': item.id,
        'name': item.name,
        'mime': item.mime,
        'size': (result['size'] as num?)?.toInt() ?? bytes.length,
        'fileID': result['fileID'],
      });
    }
    final result = _resultMap(
      await client.callFunction(
        'backupCreate',
        data: {
          'backupId': backupId,
          'debts': debts.map((debt) => debt.toMap()).toList(),
          'docs': docs.map((doc) => doc.toMap()).toList(),
          'notify': notify.toMap(),
          'premium': premium.toMap(),
          'files': uploaded,
        },
      ),
    );
    _requireOk(result, '备份失败');
  }

  Future<RestoredBackup> restore(String id) async {
    final result = _resultMap(
      await client.callFunction('backupRestore', data: {'backupId': id}),
    );
    _requireOk(result, '恢复失败');
    final data = (result['data'] as Map).cast<String, dynamic>();
    final files = ((data['files'] as List<dynamic>?) ?? const [])
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
    await archive.replaceWithRemote(files, _download);
    return RestoredBackup(
      debts: ((data['debts'] as List<dynamic>?) ?? const [])
          .map((item) => normalizeDebt((item as Map).cast<String, dynamic>()))
          .toList(),
      docs: ((data['docs'] as List<dynamic>?) ?? const [])
          .map(
            (item) => DocEntry.fromMap((item as Map).cast<String, dynamic>()),
          )
          .toList(),
      notify: NotifySettings.fromMap(
        ((data['notify'] as Map?) ?? const {}).cast<String, dynamic>(),
      ),
      premium: Premium.fromMap(
        (data['premium'] as Map?)?.cast<String, dynamic>(),
      ),
    );
  }

  Future<void> delete(String id) async {
    final result = _resultMap(
      await client.callFunction('backupDelete', data: {'backupId': id}),
    );
    _requireOk(result, '删除失败');
  }

  Future<Uint8List> _download(String url) async {
    final response = await _http.get(Uri.parse(url));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackupServiceException('备份文件下载失败（${response.statusCode}）');
    }
    return response.bodyBytes;
  }
}

final backupServiceProvider = Provider<BackupService>(
  (ref) => BackupService(
    client: ref.watch(cloudBaseClientProvider),
    archive: ref.watch(archiveRepositoryProvider),
  ),
);

Map<String, dynamic> _resultMap(dynamic raw) {
  if (raw is Map) return raw.cast<String, dynamic>();
  throw const BackupServiceException('云函数返回格式错误');
}

void _requireOk(Map<String, dynamic> result, String fallback) {
  if (result['ok'] == true) return;
  throw BackupServiceException(result['error'] as String? ?? fallback);
}
