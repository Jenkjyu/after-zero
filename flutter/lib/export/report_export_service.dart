import 'dart:convert';

import 'package:excel/excel.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../calc/calc.dart' as calc;
import '../data/archive_repository.dart';
import '../data/models.dart';

const reportPdfMime = 'application/pdf';
const reportExcelMime =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const backupJsonMime = 'application/json';

String exportDateStamp([DateTime? now]) {
  final date = now ?? DateTime.now();
  return '${(date.year % 100).toString().padLeft(2, '0')}${date.month.toString().padLeft(2, '0')}${date.day.toString().padLeft(2, '0')}';
}

class ReportExportService {
  Future<Uint8List> buildPdf(List<Debt> debts) async {
    final fontData = await rootBundle.load(
      'assets/fonts/NotoSansSC-wght.ttf',
    );
    final regular = pw.Font.ttf(fontData);
    final document = pw.Document(
      theme: pw.ThemeData.withFont(base: regular, bold: regular),
    );
    final maps = debts.map((item) => item.toMap()).toList();
    final report = calc.computeReportData(maps);
    final summary = calc.summarizeDebts(maps);
    final active = debts.where((item) => item.settled != true).toList();
    final timeline = (report['timeline'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(30),
        header: (context) => pw.Text(
          'After Zero · 债务统计报告',
          style: pw.TextStyle(fontSize: 10, color: PdfColors.grey700),
        ),
        footer: (context) => pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Text('第 ${context.pageNumber} / ${context.pagesCount} 页'),
        ),
        build: (context) => [
          pw.Text(
            '债务统计报告',
            style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 6),
          pw.Text('生成日期：${calc.fmtDate(calc.today0())}'),
          pw.SizedBox(height: 18),
          _sectionTitle('概览'),
          pw.TableHelper.fromTextArray(
            headers: const ['指标', '数值'],
            data: [
              ['在还总负债', '¥${calc.fmt(report['totalBalance'])}'],
              ['在还债务数', '${summary['active']} 笔'],
              ['已还本金', '¥${calc.fmt(summary['paidPrincipal'])}'],
              ['加权平均年化', '${(report['avgRate'] as num).toStringAsFixed(2)}%'],
              ['预计还清日期', report['payoffDate'] as String? ?? '—'],
            ],
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
            headerDecoration: const pw.BoxDecoration(color: PdfColors.green100),
            cellAlignment: pw.Alignment.centerLeft,
          ),
          pw.SizedBox(height: 18),
          _sectionTitle('债务明细'),
          pw.TableHelper.fromTextArray(
            headers: const ['名称', '状态', '剩余待还', '年化', '下期还款日'],
            data: debts
                .map(
                  (debt) => [
                    debt.name,
                    debt.settled == true ? '已结清' : '在还',
                    '¥${calc.fmt(debt.balance)}',
                    '${debt.rate.toStringAsFixed(2)}%',
                    debt.settled == true ? '—' : (debt.nextDate ?? '—'),
                  ],
                )
                .toList(),
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
            headerDecoration: const pw.BoxDecoration(color: PdfColors.green100),
          ),
          if (active.isNotEmpty) ...[
            pw.SizedBox(height: 18),
            _sectionTitle('未来还款走势'),
            pw.TableHelper.fromTextArray(
              headers: const ['日期', '预测剩余余额'],
              data: timeline
                  .map(
                    (point) => [
                      point['date'].toString(),
                      '¥${calc.fmt(point['balance'])}',
                    ],
                  )
                  .toList(),
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
              headerDecoration: const pw.BoxDecoration(
                color: PdfColors.green100,
              ),
            ),
          ],
          pw.SizedBox(height: 18),
          _sectionTitle('还款计划明细'),
          for (final debt in debts) ...[
            pw.Text(
              debt.name,
              style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
            ),
            pw.TableHelper.fromTextArray(
              headers: const ['期次', '日期', '金额', '本金', '利息/费', '状态'],
              data: [
                for (var index = 0; index < debt.plan.length; index++)
                  [
                    '${index + 1}',
                    debt.plan[index].date,
                    '¥${calc.fmt(debt.plan[index].amount)}',
                    '¥${calc.fmt(debt.plan[index].principal)}',
                    '¥${calc.fmt(debt.plan[index].interest)}',
                    _rowStatus(debt.plan[index]),
                  ],
              ],
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
              headerDecoration: const pw.BoxDecoration(
                color: PdfColors.grey200,
              ),
            ),
            pw.SizedBox(height: 10),
          ],
        ],
      ),
    );
    return document.save();
  }

  Uint8List buildExcel(List<Debt> debts) {
    final workbook = Excel.createExcel();
    workbook.delete('Sheet1');
    final report = calc.computeReportData(
      debts.map((item) => item.toMap()).toList(),
    );
    final summary = calc.summarizeDebts(
      debts.map((item) => item.toMap()).toList(),
    );
    final header = CellStyle(
      bold: true,
      fontColorHex: ExcelColor.fromHexString('#FFFFFF'),
      backgroundColorHex: ExcelColor.fromHexString('#18453B'),
    );

    final debtSheet = workbook['债务明细'];
    debtSheet.appendRow([
      TextCellValue('名称'),
      TextCellValue('出资方'),
      TextCellValue('类型'),
      TextCellValue('状态'),
      TextCellValue('剩余待还'),
      TextCellValue('借款金额'),
      TextCellValue('年化利率'),
      TextCellValue('下期还款日'),
      TextCellValue('结清日期'),
      TextCellValue('已还期数'),
      TextCellValue('总期数'),
    ]);
    for (final debt in debts) {
      debtSheet.appendRow([
        TextCellValue(debt.name),
        TextCellValue(debt.funder ?? ''),
        TextCellValue(debt.type ?? ''),
        TextCellValue(debt.settled == true ? '已结清' : '在还'),
        DoubleCellValue(debt.balance.toDouble()),
        DoubleCellValue((debt.original ?? 0).toDouble()),
        DoubleCellValue(debt.rate.toDouble()),
        TextCellValue(debt.settled == true ? '—' : (debt.nextDate ?? '')),
        TextCellValue(debt.settledDate ?? ''),
        IntCellValue(debt.paidTerms),
        IntCellValue(debt.totalTerms),
      ]);
    }
    _styleSheet(debtSheet, header, 11);

    final planSheet = workbook['还款计划明细'];
    planSheet.appendRow([
      TextCellValue('债务'),
      TextCellValue('期次'),
      TextCellValue('日期'),
      TextCellValue('实付日期'),
      TextCellValue('金额'),
      TextCellValue('本金'),
      TextCellValue('利息/费'),
      TextCellValue('是否已还'),
      TextCellValue('备注'),
    ]);
    for (final debt in debts) {
      for (var index = 0; index < debt.plan.length; index++) {
        final row = debt.plan[index];
        planSheet.appendRow([
          TextCellValue(debt.name),
          IntCellValue(index + 1),
          TextCellValue(row.date),
          TextCellValue(row.settleRow == true ? '' : (row.paidAt ?? '')),
          DoubleCellValue(row.amount.toDouble()),
          DoubleCellValue(row.principal.toDouble()),
          DoubleCellValue(row.interest.toDouble()),
          TextCellValue(row.paid ? '是' : '否'),
          TextCellValue(_rowNote(row)),
        ]);
      }
    }
    _styleSheet(planSheet, header, 9);

    final summarySheet = workbook['汇总KPI'];
    summarySheet.appendRow([TextCellValue('指标'), TextCellValue('数值')]);
    summarySheet.appendRow([
      TextCellValue('在还总负债'),
      DoubleCellValue((report['totalBalance'] as num).toDouble()),
    ]);
    summarySheet.appendRow([
      TextCellValue('在还债务数'),
      IntCellValue(summary['active'] as int),
    ]);
    summarySheet.appendRow([
      TextCellValue('加权平均利率(%)'),
      DoubleCellValue((report['avgRate'] as num).toDouble()),
    ]);
    summarySheet.appendRow([
      TextCellValue('预计全部还清日期'),
      TextCellValue(report['payoffDate'] as String? ?? '—'),
    ]);
    _styleSheet(summarySheet, header, 2);
    return Uint8List.fromList(workbook.encode()!);
  }

  pw.Widget _sectionTitle(String text) => pw.Padding(
    padding: const pw.EdgeInsets.only(bottom: 6),
    child: pw.Text(
      text,
      style: pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold),
    ),
  );

  void _styleSheet(Sheet sheet, CellStyle header, int columns) {
    for (var index = 0; index < columns; index++) {
      sheet
              .cell(CellIndex.indexByColumnRow(columnIndex: index, rowIndex: 0))
              .cellStyle =
          header;
      sheet.setColumnWidth(index, index == 0 ? 22 : 15);
    }
  }
}

String _rowStatus(PlanRow row) {
  if (row.settleRow == true) {
    return '提前结清';
  }
  if (row.paid) {
    return row.paidAmount != null && row.paidAmount! < row.amount - 0.005
        ? '协商减免'
        : '已还';
  }
  return row.paidAmount != null && row.paidAmount! > 0 ? '部分还款中' : '待还';
}

String _rowNote(PlanRow row) => row.settleRow == true
    ? '提前结清'
    : (row.paid &&
          row.paidAmount != null &&
          row.paidAmount! < row.amount - 0.005)
    ? '协商减免'
    : (!row.paid && row.paidAmount != null && row.paidAmount! > 0)
    ? '部分还款中'
    : '';

class LocalBackupService {
  final ArchiveRepository archive;

  const LocalBackupService(this.archive);

  Future<Uint8List> build({
    required List<Debt> debts,
    required List<DocEntry> docs,
  }) async {
    final uploads = <Map<String, dynamic>>[];
    for (final file in archive.readMetadata()) {
      final bytes = await archive.readBytes(file);
      uploads.add({
        'id': file.id,
        'name': file.name,
        'title': file.name,
        'mime': file.mime,
        'addedAt': file.createdAt,
        'dataURL': 'data:${file.mime};base64,${base64Encode(bytes)}',
      });
    }
    return Uint8List.fromList(
      utf8.encode(
        jsonEncode({
          'version': 6,
          'exportedAt': DateTime.now().toIso8601String(),
          'debts': debts.map((item) => item.toMap()).toList(),
          'docs': docs.map((item) => item.toMap()).toList(),
          'uploads': uploads,
        }),
      ),
    );
  }
}
