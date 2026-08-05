import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/cloud/ai_advisor.dart';
import 'package:after_zero/cloud/backup_service.dart';
import 'package:after_zero/cloud/cloudbase_client.dart';
import 'package:after_zero/cloud/cloudbase_session.dart';
import 'package:after_zero/data/archive_repository.dart';
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';

void main() {
  group('档案库本地文件', () {
    late Directory temp;
    late SharedPreferences prefs;
    late ArchiveRepository archive;

    setUp(() async {
      temp = await Directory.systemTemp.createTemp('after-zero-archive-test');
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      archive = ArchiveRepository(prefs, documentsDirectory: () async => temp);
    });

    tearDown(() async {
      if (await temp.exists()) await temp.delete(recursive: true);
    });

    test('真实字节写入应用目录，preferences只保存元数据；删除同步清文件', () async {
      final item = await archive.importBytes(
        name: '回执.png',
        mime: 'image/png',
        bytes: Uint8List.fromList([1, 2, 3, 4]),
      );

      expect(await File(item.path).readAsBytes(), [1, 2, 3, 4]);
      expect(archive.readMetadata().single.name, '回执.png');
      expect(prefs.getString(archiveFilesKey), isNot(contains('AQIDBA==')));

      await archive.delete(item.id);
      expect(archive.readMetadata(), isEmpty);
      expect(await File(item.path).exists(), isFalse);
    });
  });

  group('AI助手', () {
    test('追问marker从正文剥离并解析2~3条建议', () {
      final split = splitAiSuggestions(
        '先处理高息债务。\n\n###SUGGESTIONS###\n- 雪崩法能省多少？\n- 三个月怎么安排？',
      );
      expect(split.$1, '先处理高息债务。');
      expect(split.$2, ['雪崩法能省多少？', '三个月怎么安排？']);
    });

    test('compact摘要保留全部未还计划、只压缩已还期次', () {
      final map = <String, dynamic>{
        'id': 'd1',
        'name': '先息后本',
        'type': '银行贷',
        'plan': calc.genPlan({
          'kind': 'interestfirst',
          'P': 10000,
          'rate': 12,
          'ni': 1,
          'np': 2,
          'first': '2026-08-15',
        }),
      };
      (map['plan'] as List).first['paid'] = true;
      calc.recompute(map);
      final summary = buildAiSummary([Debt.fromMap(map)], compact: true);
      final debt = (summary['债务清单'] as List).single as Map<String, dynamic>;

      expect((debt['已还期次汇总'] as Map)['期数'], 1);
      expect(debt['还款计划'], hasLength(2));
      expect(
        (debt['还款计划'] as List).every((row) => (row as Map)['已还'] == false),
        isTrue,
      );
    });

    test('历史会话upsert会顶到最前且同id不产生重复', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final container = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
      addTearDown(container.dispose);
      const first = AiConversation(
        id: 'c1',
        title: '第一问',
        isReport: false,
        updatedAt: 1,
        messages: [AiChatMessage(role: 'user', content: '问题')],
      );
      container.read(aiHistoryProvider.notifier).upsert(first);
      container
          .read(aiHistoryProvider.notifier)
          .upsert(
            first.copyWith(
              updatedAt: 2,
              messages: const [
                AiChatMessage(role: 'user', content: '问题'),
                AiChatMessage(role: 'assistant', content: '回答'),
              ],
            ),
          );

      expect(container.read(aiHistoryProvider), hasLength(1));
      expect(container.read(aiHistoryProvider).single.messages, hasLength(2));
      expect(jsonDecode(prefs.getString(aiChatLogKey)!) as List, hasLength(1));
    });
  });

  group('手动云备份服务', () {
    test('list解析轻量记录，create只写一条独立备份', () async {
      final requests = <http.Request>[];
      final mock = MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/backupList')) {
          return _json({
            'ok': true,
            'list': [
              {
                'id': 'b1',
                'createdAt': 100,
                'debtsCount': 2,
                'filesCount': 0,
                'totalSizeBytes': 320,
              },
            ],
          });
        }
        if (request.url.path.endsWith('/backupUploadFile')) {
          return _json({'ok': true, 'fileID': 'cloud://f1', 'size': 4});
        }
        return _json({'ok': true, 'backupId': 'b2'});
      });
      final client = _signedInClient(mock);
      final temp = await Directory.systemTemp.createTemp(
        'after-zero-backup-test',
      );
      addTearDown(() => temp.delete(recursive: true));
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final archive = ArchiveRepository(
        prefs,
        documentsDirectory: () async => temp,
      );
      await archive.importBytes(
        name: '凭证.png',
        mime: 'image/png',
        bytes: Uint8List.fromList([1, 2, 3, 4]),
      );
      final service = BackupService(client: client, archive: archive);

      final list = await service.list();
      expect(list.single.id, 'b1');
      await service.create(
        debts: const [],
        docs: const [],
        notify: NotifySettings.empty,
        premium: const Premium(),
      );

      expect(requests, hasLength(3));
      final upload = jsonDecode(requests[1].body) as Map<String, dynamic>;
      expect(upload['base64'], 'AQIDBA==');
      final create = jsonDecode(requests.last.body) as Map<String, dynamic>;
      expect(create['debts'], isEmpty);
      expect((create['files'] as List).single['fileID'], 'cloud://f1');
      expect(create['notify'], {'enabled': false, 'rules': []});
    });

    test('restore整体返回债务/设置，delete按backupId调用', () async {
      final called = <String>[];
      final mock = MockClient((request) async {
        called.add(request.url.path);
        if (request.url.path.endsWith('/backupRestore')) {
          return _json({
            'ok': true,
            'data': {
              'debts': [],
              'docs': [
                {'file': 'a.md', 'title': 'A', 'content': '正文'},
              ],
              'notify': {
                'enabled': true,
                'rules': [
                  {'offsetDays': 1, 'time': '09:00'},
                ],
              },
              'premium': {'premium': null},
              'files': [],
            },
          });
        }
        return _json({'ok': true});
      });
      final temp = await Directory.systemTemp.createTemp(
        'after-zero-restore-test',
      );
      addTearDown(() => temp.delete(recursive: true));
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final service = BackupService(
        client: _signedInClient(mock),
        archive: ArchiveRepository(prefs, documentsDirectory: () async => temp),
      );

      final restored = await service.restore('b1');
      await service.delete('b1');

      expect(restored.docs.single.title, 'A');
      expect(restored.notify.enabled, isTrue);
      expect(called.any((path) => path.endsWith('/backupDelete')), isTrue);
    });
  });
}

CloudBaseClient _signedInClient(http.Client httpClient) {
  final client = CloudBaseClient(envId: 'test-env', httpClient: httpClient);
  client.restoreSession(
    CloudBaseSession(
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: DateTime.now().add(const Duration(hours: 1)),
      anonymous: false,
    ),
  );
  return client;
}

http.Response _json(Map<String, dynamic> body) => http.Response(
  jsonEncode(body),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
