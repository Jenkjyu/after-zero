import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';

import '../../cloud/ai_advisor.dart';
import '../../data/providers.dart';

class AiScreen extends ConsumerStatefulWidget {
  const AiScreen({super.key});

  @override
  ConsumerState<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends ConsumerState<AiScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  List<AiChatMessage> _messages = [];
  String? _conversationId;
  bool _busy = false;
  int? _errorIndex;
  _RetryContext? _retry;
  List<String> _suggestions = [];
  Timer? _thinkingTimer;
  Timer? _revealTimer;
  int _thinkingSeconds = 0;
  int? _revealMessageIndex;
  int _revealChars = 0;
  bool _isReportConversation = false;

  @override
  void dispose() {
    _thinkingTimer?.cancel();
    _revealTimer?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final quota = ref.watch(aiUsageProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI 债务助手'),
        actions: [
          IconButton(
            tooltip: '历史对话',
            onPressed: _showHistory,
            icon: const Icon(Icons.history),
          ),
          IconButton(
            tooltip: '新对话',
            onPressed: _newConversation,
            icon: const Icon(Icons.add_comment_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  const Icon(Icons.auto_awesome, size: 17),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      quota.month == null
                          ? '报告与问答共用每月额度'
                          : '本月已用 ${quota.used}/${quota.limit} 次',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: _messages.isEmpty
                ? _Welcome(onPrompt: _quickPrompt)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(14, 16, 14, 24),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      final isUser = message.role == 'user';
                      final revealing = _revealMessageIndex == index;
                      final text = revealing
                          ? message.content.substring(
                              0,
                              _revealChars.clamp(0, message.content.length),
                            )
                          : message.content;
                      return Align(
                        alignment: isUser
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 560),
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: isUser
                                ? Theme.of(context).colorScheme.primaryContainer
                                : Theme.of(
                                    context,
                                  ).colorScheme.surfaceContainerHigh,
                            borderRadius: BorderRadius.circular(16),
                            border: index == _errorIndex
                                ? Border.all(
                                    color: Theme.of(context).colorScheme.error,
                                  )
                                : null,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (!isUser &&
                                  _busy &&
                                  index == _messages.length - 1)
                                Text(
                                  _thinkingSeconds == 0
                                      ? '思考中…'
                                      : '思考中 ${_thinkingSeconds}s…',
                                )
                              else
                                _AiText(text: text),
                              if (index == _errorIndex)
                                TextButton.icon(
                                  onPressed: _retry == null ? null : _retryLast,
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('重试'),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          if (_suggestions.isNotEmpty && !_busy && _revealMessageIndex == null)
            SizedBox(
              height: 46,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                children: [
                  for (final suggestion in _suggestions)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ActionChip(
                        label: Text(suggestion),
                        onPressed: () => _send(suggestion, report: false),
                      ),
                    ),
                ],
              ),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.newline,
                      decoration: const InputDecoration(
                        hintText: '发消息给 AI 债务助手…',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    key: const Key('ai-send'),
                    onPressed: _busy ? null : _sendInput,
                    icon: const Icon(Icons.arrow_upward),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _quickPrompt(String text, bool report) => _send(text, report: report);

  void _sendInput() {
    final value = _input.text.trim();
    if (value.isEmpty) return;
    _input.clear();
    _send(value, report: false);
  }

  Future<void> _send(String displayQuestion, {required bool report}) async {
    if (_busy) return;
    _revealTimer?.cancel();
    final history = List<AiChatMessage>.from(_messages)
      ..removeWhere((message) => message.content.isEmpty);
    final contextHistory = history.length > 12
        ? history.sublist(history.length - 12)
        : history;
    setState(() {
      _busy = true;
      _errorIndex = null;
      _suggestions = [];
      _thinkingSeconds = 0;
      _revealMessageIndex = null;
      _messages = [
        ..._messages,
        AiChatMessage(role: 'user', content: displayQuestion),
        const AiChatMessage(role: 'assistant', content: ''),
      ];
    });
    final assistantIndex = _messages.length - 1;
    _retry = _RetryContext(
      messageIndex: assistantIndex,
      displayQuestion: displayQuestion,
      report: report,
      history: contextHistory,
    );
    await _run(_retry!);
  }

  Future<void> _run(_RetryContext retry) async {
    final started = DateTime.now();
    _thinkingTimer?.cancel();
    _thinkingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _thinkingSeconds = DateTime.now().difference(started).inSeconds;
      });
    });
    try {
      final reply = await ref
          .read(aiAdvisorServiceProvider)
          .send(
            mode: retry.report ? 'report' : 'chat',
            question: retry.report ? '' : retry.displayQuestion,
            history: retry.report ? const [] : retry.history,
          );
      _thinkingTimer?.cancel();
      if (!mounted) return;
      setState(() {
        _messages = [
          for (var i = 0; i < _messages.length; i++)
            if (i == retry.messageIndex)
              AiChatMessage(role: 'assistant', content: reply.body)
            else
              _messages[i],
        ];
        _busy = false;
        _suggestions = reply.suggestions;
      });
      _persist(retry.report);
      _startReveal(retry.messageIndex, reply.body.length);
    } catch (error) {
      _thinkingTimer?.cancel();
      if (!mounted) return;
      final message = error is AiAdvisorException
          ? error.message
          : 'AI 分析失败：$error';
      setState(() {
        _messages = [
          for (var i = 0; i < _messages.length; i++)
            if (i == retry.messageIndex)
              AiChatMessage(role: 'assistant', content: message)
            else
              _messages[i],
        ];
        _busy = false;
        _errorIndex = retry.messageIndex;
      });
      if (error is AiAdvisorException && error.code == 'QUOTA_EXCEEDED') {
        _showQuotaDialog();
      }
    }
    _scrollToBottom();
  }

  Future<void> _retryLast() async {
    final retry = _retry;
    if (retry == null || _busy) return;
    setState(() {
      _busy = true;
      _errorIndex = null;
      _messages = [
        for (var i = 0; i < _messages.length; i++)
          if (i == retry.messageIndex)
            const AiChatMessage(role: 'assistant', content: '')
          else
            _messages[i],
      ];
    });
    await _run(retry);
  }

  void _persist(bool report) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = _conversationId ?? 'c$now';
    if (_conversationId == null) _isReportConversation = report;
    _conversationId = id;
    final firstQuestion = _messages
        .where((message) => message.role == 'user')
        .first
        .content;
    ref
        .read(aiHistoryProvider.notifier)
        .upsert(
          AiConversation(
            id: id,
            title: firstQuestion.length > 24
                ? '${firstQuestion.substring(0, 24)}…'
                : firstQuestion,
            isReport: _isReportConversation,
            updatedAt: now,
            messages: List<AiChatMessage>.from(_messages),
          ),
        );
  }

  void _startReveal(int index, int length) {
    _revealTimer?.cancel();
    if (length == 0) return;
    var shown = 0;
    setState(() {
      _revealMessageIndex = index;
      _revealChars = 0;
    });
    _revealTimer = Timer.periodic(const Duration(milliseconds: 16), (timer) {
      shown = (shown + 3).clamp(0, length);
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (shown >= length) {
        timer.cancel();
        setState(() {
          _revealMessageIndex = null;
          _revealChars = length;
        });
      } else {
        setState(() => _revealChars = shown);
      }
      _scrollToBottom();
    });
  }

  void _newConversation() {
    _revealTimer?.cancel();
    setState(() {
      _messages = [];
      _conversationId = null;
      _busy = false;
      _errorIndex = null;
      _retry = null;
      _suggestions = [];
      _revealMessageIndex = null;
      _isReportConversation = false;
    });
  }

  Future<void> _showHistory() async {
    final picked = await showModalBottomSheet<AiConversation>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => Consumer(
        builder: (context, ref, _) {
          final history = ref.watch(aiHistoryProvider);
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * .65,
              child: history.isEmpty
                  ? const Center(child: Text('还没有历史对话'))
                  : ListView.builder(
                      itemCount: history.length,
                      itemBuilder: (context, index) {
                        final item = history[index];
                        return ListTile(
                          title: Text(item.title),
                          subtitle: Text(
                            DateTime.fromMillisecondsSinceEpoch(
                              item.updatedAt,
                            ).toString().substring(0, 16),
                          ),
                          onTap: () => Navigator.pop(context, item),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => ref
                                .read(aiHistoryProvider.notifier)
                                .delete(item.id),
                          ),
                        );
                      },
                    ),
            ),
          );
        },
      ),
    );
    if (picked == null || !mounted) return;
    _revealTimer?.cancel();
    setState(() {
      _conversationId = picked.id;
      _messages = List<AiChatMessage>.from(picked.messages);
      _busy = false;
      _errorIndex = null;
      _retry = null;
      _suggestions = [];
      _revealMessageIndex = null;
      _isReportConversation = picked.isReport;
    });
    _scrollToBottom();
  }

  Future<void> _showQuotaDialog() => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('本月 AI 额度已用完'),
      content: const Text('下个月会自动恢复。你也可以复制一份包含完整逐期计划的提示词，粘贴到其他 AI 继续分析。'),
      actions: [
        TextButton(
          onPressed: () async {
            final summary = buildAiSummary(
              ref.read(debtsProvider),
              compact: false,
            );
            await Clipboard.setData(
              ClipboardData(
                text:
                    '请作为债务规划助手，根据下面的数据给出具体、可执行的分析。不要编造账单之外的信息。\n\n${const JsonEncoder.withIndent('  ').convert(summary)}',
              ),
            );
            if (context.mounted) Navigator.pop(context);
            if (mounted) {
              ScaffoldMessenger.of(
                this.context,
              ).showSnackBar(const SnackBar(content: Text('完整提示词已复制')));
            }
          },
          child: const Text('复制完整提示词'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('知道了'),
        ),
      ],
    ),
  );

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }
}

class _RetryContext {
  final int messageIndex;
  final String displayQuestion;
  final bool report;
  final List<AiChatMessage> history;
  const _RetryContext({
    required this.messageIndex,
    required this.displayQuestion,
    required this.report,
    required this.history,
  });
}

class _Welcome extends StatelessWidget {
  final void Function(String, bool) onPrompt;
  const _Welcome({required this.onPrompt});
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Icon(Icons.auto_awesome, size: 54),
          const SizedBox(height: 12),
          Text('今天想先解决什么？', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 14),
          ActionChip(
            label: const Text('生成分析报告'),
            onPressed: () => onPrompt('生成分析报告', true),
          ),
          ActionChip(
            label: const Text('我应该优先还哪一笔？'),
            onPressed: () => onPrompt('我应该优先还哪一笔？', false),
          ),
          ActionChip(
            label: const Text('怎么降低未来三个月的还款压力？'),
            onPressed: () => onPrompt('怎么降低未来三个月的还款压力？', false),
          ),
        ],
      ),
    ),
  );
}

class _AiText extends StatelessWidget {
  final String text;
  const _AiText({required this.text});
  @override
  Widget build(BuildContext context) {
    final lines = text.split('\n');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final line in lines)
          if (line.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: SelectableText.rich(
                TextSpan(children: _inlineSpans(_lineText(line))),
              ),
            ),
      ],
    );
  }
}

String _lineText(String line) {
  final trimmed = line.trim();
  if (RegExp(r'^[-*•]\s*').hasMatch(trimmed)) {
    return '• ${trimmed.replaceFirst(RegExp(r'^[-*•]\s*'), '')}';
  }
  return trimmed;
}

List<TextSpan> _inlineSpans(String text) {
  final spans = <TextSpan>[];
  final pattern = RegExp(r'\*\*(.+?)\*\*');
  var cursor = 0;
  for (final match in pattern.allMatches(text)) {
    if (match.start > cursor) {
      spans.add(TextSpan(text: text.substring(cursor, match.start)));
    }
    spans.add(
      TextSpan(
        text: match.group(1),
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
    cursor = match.end;
  }
  if (cursor < text.length) spans.add(TextSpan(text: text.substring(cursor)));
  return spans.isEmpty ? [TextSpan(text: text)] : spans;
}
