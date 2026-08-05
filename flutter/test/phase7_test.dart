import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:excel/excel.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_zero/data/archive_repository.dart';
import 'package:after_zero/data/debt_ops.dart';
import 'package:after_zero/data/models.dart';
import 'package:after_zero/export/report_export_service.dart';
import 'package:after_zero/notifications/reminder_scheduler.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final debt = _debt();

  test('提醒重排会先取消旧通知，再为未来每条规则生成稳定ID', () async {
    final port = _FakeNotificationPort();
    final scheduler = ReminderScheduler(port);
    await scheduler.reschedule(
      debts: [debt],
      settings: const NotifySettings(
        enabled: true,
        rules: [
          NotifyRule(offsetDays: 1, time: '09:00'),
          NotifyRule(offsetDays: 0, time: '09:00'),
        ],
      ),
      now: DateTime(2026, 1, 1),
    );

    expect(port.cancelCount, 1);
    expect(port.scheduled.map((item) => item.id), [1000, 1001, 1002, 1003]);
    expect(port.scheduled.first.body, contains('信用卡'));
    expect(port.scheduled.first.body, contains('¥1,000'));
  });

  test('PDF嵌入中文字体并生成可打开的PDF字节', () async {
    final bytes = await ReportExportService().buildPdf([debt]);
    expect(utf8.decode(bytes.sublist(0, 5)), '%PDF-');
    expect(bytes.length, greaterThan(5000));
  });

  test('Excel包含债务、计划和汇总三张可读取工作表', () {
    final bytes = ReportExportService().buildExcel([debt]);
    expect(bytes.take(2).toList(), [0x50, 0x4b]);
    final workbook = Excel.decodeBytes(bytes);
    expect(workbook.tables.keys, containsAll(['债务明细', '还款计划明细', '汇总KPI']));
    expect(
      workbook.tables['债务明细']!.rows[1][0]!.value.toString(),
      contains('信用卡'),
    );
  });

  test('本地JSON备份包含可恢复的档案dataURL', () async {
    final temp = await Directory.systemTemp.createTemp(
      'after-zero-local-backup',
    );
    addTearDown(() => temp.delete(recursive: true));
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final archive = ArchiveRepository(
      prefs,
      documentsDirectory: () async => temp,
    );
    await archive.importBytes(
      name: '回执.pdf',
      mime: 'application/pdf',
      bytes: Uint8List.fromList([1, 2, 3]),
    );

    final bytes = await LocalBackupService(archive).build(
      debts: [debt],
      docs: const [DocEntry(file: '说明.md', title: '说明', content: '正文')],
    );
    final payload = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    expect(payload['version'], 6);
    expect((payload['debts'] as List).single['name'], '信用卡');
    expect(
      (payload['uploads'] as List).single['dataURL'],
      'data:application/pdf;base64,AQID',
    );
  });
}

Debt _debt() => normalizeDebt({
  'id': 'd1',
  'name': '信用卡',
  'type': '信用贷',
  'plan': [
    {
      'date': '2026-01-10',
      'amount': 1000.0,
      'principal': 900.0,
      'interest': 100.0,
      'paid': false,
    },
    {
      'date': '2026-02-10',
      'amount': 1000.0,
      'principal': 950.0,
      'interest': 50.0,
      'paid': false,
    },
  ],
});

class _Scheduled {
  final int id;
  final String body;

  const _Scheduled(this.id, this.body);
}

class _FakeNotificationPort implements NotificationPort {
  int cancelCount = 0;
  final scheduled = <_Scheduled>[];

  @override
  Future<void> cancelAllPending() async => cancelCount++;

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> requestExactAlarmPermission() async => true;

  @override
  Future<bool> requestPermission() async => true;

  @override
  Future<void> schedule({
    required int id,
    required DateTime at,
    required String title,
    required String body,
    required String payload,
  }) async {
    scheduled.add(_Scheduled(id, body));
  }
}
