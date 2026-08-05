import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../calc/calc.dart' as calc;
import '../data/models.dart';
import '../data/providers.dart';
import 'cloud_providers.dart';

const aiChatLogKey = 'after-zero-ai-chatlog-v1';
const aiChatLogMaxMessages = 40;
const aiChatLogMaxConversations = 50;

class AiChatMessage {
  final String role;
  final String content;
  const AiChatMessage({required this.role, required this.content});

  factory AiChatMessage.fromMap(Map<String, dynamic> map) => AiChatMessage(
    role: map['role'] as String? ?? 'assistant',
    content: map['content'] as String? ?? '',
  );
  Map<String, dynamic> toMap() => {'role': role, 'content': content};
}

class AiConversation {
  final String id;
  final String title;
  final bool isReport;
  final int updatedAt;
  final List<AiChatMessage> messages;

  const AiConversation({
    required this.id,
    required this.title,
    required this.isReport,
    required this.updatedAt,
    required this.messages,
  });

  factory AiConversation.fromMap(Map<String, dynamic> map) => AiConversation(
    id: map['id'] as String? ?? '',
    title: map['title'] as String? ?? '新对话',
    isReport: map['isReport'] == true,
    updatedAt: (map['updatedAt'] as num?)?.toInt() ?? 0,
    messages: ((map['messages'] as List<dynamic>?) ?? const [])
        .map(
          (item) =>
              AiChatMessage.fromMap((item as Map).cast<String, dynamic>()),
        )
        .toList(),
  );

  Map<String, dynamic> toMap() => {
    'id': id,
    'title': title,
    'isReport': isReport,
    'updatedAt': updatedAt,
    'messages': messages.map((message) => message.toMap()).toList(),
  };

  AiConversation copyWith({
    String? title,
    bool? isReport,
    int? updatedAt,
    List<AiChatMessage>? messages,
  }) => AiConversation(
    id: id,
    title: title ?? this.title,
    isReport: isReport ?? this.isReport,
    updatedAt: updatedAt ?? this.updatedAt,
    messages: messages ?? this.messages,
  );
}

class AiHistoryNotifier extends Notifier<List<AiConversation>> {
  @override
  List<AiConversation> build() {
    final raw = ref.read(sharedPreferencesProvider).getString(aiChatLogKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      return (jsonDecode(raw) as List<dynamic>)
          .map(
            (item) =>
                AiConversation.fromMap((item as Map).cast<String, dynamic>()),
          )
          .where((item) => item.id.isNotEmpty)
          .toList();
    } catch (_) {
      return [];
    }
  }

  void _persist(List<AiConversation> next) {
    state = next.take(aiChatLogMaxConversations).toList();
    ref
        .read(sharedPreferencesProvider)
        .setString(
          aiChatLogKey,
          jsonEncode(state.map((item) => item.toMap()).toList()),
        );
  }

  void upsert(AiConversation conversation) => _persist([
    conversation.copyWith(
      messages: conversation.messages.length > aiChatLogMaxMessages
          ? conversation.messages.sublist(
              conversation.messages.length - aiChatLogMaxMessages,
            )
          : conversation.messages,
    ),
    ...state.where((item) => item.id != conversation.id),
  ]);

  void delete(String id) =>
      _persist(state.where((item) => item.id != id).toList());

  void clear() => _persist([]);
}

final aiHistoryProvider =
    NotifierProvider<AiHistoryNotifier, List<AiConversation>>(
      AiHistoryNotifier.new,
    );

class AiAdvisorReply {
  final String body;
  final List<String> suggestions;
  final AiUsageCache? quota;
  const AiAdvisorReply({
    required this.body,
    required this.suggestions,
    this.quota,
  });
}

class AiAdvisorException implements Exception {
  final String message;
  final String? code;
  final AiUsageCache? quota;
  const AiAdvisorException(this.message, {this.code, this.quota});
  @override
  String toString() => message;
}

class AiAdvisorService {
  final Ref ref;
  const AiAdvisorService(this.ref);

  Future<AiAdvisorReply> send({
    required String mode,
    required String question,
    required List<AiChatMessage> history,
  }) async {
    final debts = ref.read(debtsProvider);
    final summary = buildAiSummary(debts, compact: true);
    if ((summary['债务清单'] as List).isEmpty) {
      throw const AiAdvisorException('没有在还债务，先添加一笔再来分析');
    }
    final raw = await ref
        .read(cloudBaseClientProvider)
        .callFunction(
          'aiAdvisor',
          data: {
            'mode': mode,
            'summary': summary,
            'question': question,
            'history': history.map((message) => message.toMap()).toList(),
          },
        );
    if (raw is! Map) throw const AiAdvisorException('AI 分析返回格式错误');
    final result = raw.cast<String, dynamic>();
    final quota = _quota(result['quota']);
    if (quota != null) {
      ref.read(aiUsageProvider.notifier).updateFromServer(quota);
    }
    if (result['ok'] != true) {
      throw AiAdvisorException(
        result['error'] as String? ?? 'AI 分析失败，请稍后再试',
        code: result['code'] as String?,
        quota: quota,
      );
    }
    final split = splitAiSuggestions(result['text'] as String? ?? '');
    return AiAdvisorReply(body: split.$1, suggestions: split.$2, quota: quota);
  }
}

final aiAdvisorServiceProvider = Provider<AiAdvisorService>(
  AiAdvisorService.new,
);

AiUsageCache? _quota(dynamic raw) {
  if (raw is! Map) return null;
  return AiUsageCache.fromMap(raw.cast<String, dynamic>());
}

(String, List<String>) splitAiSuggestions(String text) {
  const marker = '###SUGGESTIONS###';
  final index = text.indexOf(marker);
  if (index < 0) return (text.trim(), const []);
  final body = text.substring(0, index).trim();
  final suggestions = text
      .substring(index + marker.length)
      .split('\n')
      .map((line) => line.trim())
      .where((line) => line.startsWith('- '))
      .map((line) => line.substring(2).trim())
      .where((line) => line.isNotEmpty)
      .take(3)
      .toList();
  return (body, suggestions);
}

Map<String, dynamic> buildAiSummary(List<Debt> debts, {bool compact = false}) {
  final maps = debts.map((debt) => debt.toMap()).toList();
  final report = calc.computeReportData(maps);
  final list = debts.where((debt) => debt.balance > .005).map((debt) {
    final rows = compact
        ? debt.plan.where((row) => !row.paid).toList()
        : debt.plan;
    final result = <String, dynamic>{
      '名称': debt.name.isEmpty ? '未命名' : debt.name,
      '类型': debt.type ?? '其他',
      '债主': debt.funder ?? '',
      '开始日期': debt.opened ?? '',
      '备注': debt.notes ?? '',
      '计息方式': _methodLabel(debt.gen?.kind),
      '剩余本金': calc.r2(debt.balance),
      '年化利率百分比': calc.r2(debt.rate),
      '月供': calc.r2(debt.monthly),
      '剩余期数': debt.terms,
      '总期数': debt.totalTerms,
      '一次性还清': debt.oneTime == true,
      '累计已还本金': calc.r2(debt.paidPrincipal),
      '累计已还利息': calc.r2(debt.paidInterest),
    };
    if (compact) {
      final paid = debt.plan.where((row) => row.paid).toList();
      result['已还期次汇总'] = {
        '期数': paid.length,
        '最后一期日期': paid.isEmpty ? '' : paid.last.date,
      };
      result['还款计划说明'] = '下面只列未还期次；已还的见上面「已还期次汇总」和累计已还本金/利息';
    }
    result['还款计划'] = rows
        .map(
          (row) => {
            '日期': row.date,
            '金额': calc.r2(row.amount),
            '本金': calc.r2(row.principal),
            '利息': calc.r2(row.interest),
            '已还': row.paid,
          },
        )
        .toList();
    return result;
  }).toList();
  return {
    '在还总负债': report['totalBalance'],
    '加权平均年化利率百分比': calc.r2(report['avgRate'] as num),
    '预计全部还清日期': report['payoffDate'] ?? '未知',
    '债务清单': list,
  };
}

String _methodLabel(String? kind) => switch (kind) {
  'amort' => '等额本息',
  'equalprincipal' => '等额本金',
  'equalfee' => '等本等费',
  'interestfirst' => '先息后本',
  'custom' => '自定义',
  _ => '未知',
};
