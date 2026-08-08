import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:url_launcher/url_launcher.dart';

import '../account/account_screen.dart';

enum LegalKind { privacy, agreement, premiumTerms }

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('关于我们')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 8),
        const Icon(Icons.savings_outlined, size: 68),
        const SizedBox(height: 10),
        Text(
          'After Zero',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const Text('版本 1.0', textAlign: TextAlign.center),
        const SizedBox(height: 24),
        const Card(
          child: ListTile(
            leading: Icon(Icons.mail_outline),
            title: Text('联系邮箱'),
            subtitle: SelectableText('jenkjyu36@outlook.com'),
          ),
        ),
        const SizedBox(height: 12),
        _RouteTile(
          title: '隐私政策',
          subtitle: '我们如何收集、使用与保护你的信息',
          route: const LegalScreen(kind: LegalKind.privacy),
        ),
        _RouteTile(
          title: '用户服务协议',
          subtitle: '使用本产品前应了解的权利与义务',
          route: const LegalScreen(kind: LegalKind.agreement),
        ),
        _RouteTile(
          title: '会员服务协议',
          subtitle: 'Premium 购买、退款与账号规则',
          route: const LegalScreen(kind: LegalKind.premiumTerms),
        ),
        const SizedBox(height: 12),
        _RouteTile(
          title: '账户与登录信息',
          subtitle: '查看我们从微信账号获取的信息',
          route: const AccountScreen(),
        ),
      ],
    ),
  );
}

class _RouteTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget route;
  const _RouteTile({
    required this.title,
    required this.subtitle,
    required this.route,
  });
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: () =>
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => route)),
    ),
  );
}

class LegalScreen extends StatelessWidget {
  final LegalKind kind;
  const LegalScreen({super.key, required this.kind});

  String get _title => switch (kind) {
    LegalKind.privacy => '隐私政策',
    LegalKind.agreement => '用户服务协议',
    LegalKind.premiumTerms => '会员服务协议',
  };

  String get _asset => switch (kind) {
    LegalKind.privacy => 'assets/legal/隐私政策.md',
    LegalKind.agreement => 'assets/legal/用户服务协议.md',
    LegalKind.premiumTerms => 'assets/legal/会员服务协议.md',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(_title)),
    body: FutureBuilder<String>(
      future: rootBundle.loadString(_asset),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('文档加载失败：${snapshot.error}'));
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return _LegalBody(raw: snapshot.data!);
      },
    ),
  );
}

enum _BlockKind { h3, h4, p, ol, ul, table }

class _Block {
  final _BlockKind kind;
  final List<dynamic> items; // String 或 List<String>（表格行/列表项）
  const _Block(this.kind, this.items);
}

class _LegalBody extends StatelessWidget {
  final String raw;
  const _LegalBody({required this.raw});

  @override
  Widget build(BuildContext context) {
    final blocks = _parse(raw);
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final bodyStyle = TextStyle(
      fontSize: 13.5,
      height: 1.7,
      color: muted,
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 36),
      children: [
        for (final block in blocks) ...[
          switch (block.kind) {
            _BlockKind.h3 => Padding(
              padding: const EdgeInsets.only(top: 18, bottom: 6),
              child: Text(
                block.items.first as String,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            _BlockKind.h4 => Padding(
              padding: const EdgeInsets.only(top: 14, bottom: 4),
              child: Text(
                block.items.first as String,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            _BlockKind.p => Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: SelectableText.rich(
                _inline(block.items.first as String, bodyStyle),
                style: bodyStyle,
              ),
            ),
            _BlockKind.ol || _BlockKind.ul => Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final item in block.items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            block.kind == _BlockKind.ol
                                ? '${block.items.indexOf(item) + 1}. '
                                : '• ',
                            style: bodyStyle,
                          ),
                          Expanded(
                            child: SelectableText.rich(
                              _inline(item as String, bodyStyle),
                              style: bodyStyle,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            _BlockKind.table => SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Table(
                  border: TableBorder.all(
                    color: theme.colorScheme.outlineVariant,
                    width: 0.6,
                  ),
                  columnWidths: const {
                    0: FixedColumnWidth(110),
                    1: FixedColumnWidth(110),
                    2: FixedColumnWidth(110),
                  },
                  defaultVerticalAlignment: TableCellVerticalAlignment.top,
                  children: [
                    for (final row in block.items)
                      TableRow(
                        decoration: BoxDecoration(
                          color: block.items.indexOf(row) == 0
                              ? theme.colorScheme.surfaceContainerHighest
                              : null,
                        ),
                        children: [
                          for (final cell in row as List<String>)
                            Padding(
                              padding: const EdgeInsets.all(6),
                              child: SelectableText.rich(
                                _inline(cell, bodyStyle),
                                style: bodyStyle.copyWith(fontSize: 12.5),
                              ),
                            ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          },
          const SizedBox(height: 2),
        ],
      ],
    );
  }

  /// 解析 **加粗**、[链接](url) 与 `代码`（代码按纯文本处理，旧版渲染里没有代码样式）。
  TextSpan _inline(String text, TextStyle base) {
    final plain = text.replaceAll('`', '');
    final spans = <InlineSpan>[];
    final bold = RegExp(r'\*\*(.+?)\*\*');
    var cursor = 0;
    for (final match in bold.allMatches(plain)) {
      if (match.start > cursor) {
        spans.addAll(_linkify(plain.substring(cursor, match.start), base));
      }
      spans.addAll(
        _linkify(match.group(1)!, base.copyWith(fontWeight: FontWeight.w700)),
      );
      cursor = match.end;
    }
    if (cursor < plain.length) {
      spans.addAll(_linkify(plain.substring(cursor), base));
    }
    return TextSpan(style: base, children: spans);
  }

  List<InlineSpan> _linkify(String text, TextStyle base) {
    final spans = <InlineSpan>[];
    final link = RegExp(r'\[([^\]]+)\]\(([^)]+)\)');
    var cursor = 0;
    for (final match in link.allMatches(text)) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: text.substring(cursor, match.start)));
      }
      final url = match.group(2)!;
      spans.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: GestureDetector(
            onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
            child: Text(
              match.group(1)!,
              style: base.copyWith(
                color: Colors.blue,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ),
      );
      cursor = match.end;
    }
    if (cursor < text.length) {
      spans.add(TextSpan(text: text.substring(cursor)));
    }
    return spans;
  }
}

List<_Block> _parse(String raw) {
  final lines = raw
      .split('\n')
      .map((line) => line.trimRight())
      .toList();
  final blocks = <_Block>[];
  var i = 0;
  // 跳过起草说明（blockquote）和标题前的空行
  while (i < lines.length &&
      (lines[i].trim().isEmpty || lines[i].trimLeft().startsWith('>'))) {
    i++;
  }
  // 跳过 H1 标题
  if (i < lines.length && lines[i].startsWith('# ')) i++;

  String? pendingParagraph;
  void flushParagraph() {
    if (pendingParagraph != null) {
      blocks.add(_Block(_BlockKind.p, [pendingParagraph!]));
      pendingParagraph = null;
    }
  }

  while (i < lines.length) {
    final line = lines[i].trim();
    if (line.isEmpty) {
      flushParagraph();
      i++;
      continue;
    }
    // 生效/更新日期合并为一行（与旧版一致）
    final effective = RegExp(r'^\*\*生效日期：(.+?)\*\*$');
    final updated = RegExp(r'^\*\*更新日期：(.+?)\*\*$');
    if (effective.hasMatch(line)) {
      final e = effective.firstMatch(line)!.group(1)!;
      var j = i + 1;
      while (j < lines.length && lines[j].trim().isEmpty) {
        j++;
      }
      if (j < lines.length && updated.hasMatch(lines[j].trim())) {
        final u = updated.firstMatch(lines[j].trim())!.group(1)!;
        flushParagraph();
        blocks.add(_Block(_BlockKind.p, ['生效日期：$e　更新日期：$u']));
        i = j + 1;
        continue;
      }
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      blocks.add(_Block(_BlockKind.h3, [line.substring(3).trim()]));
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      blocks.add(_Block(_BlockKind.h4, [line.substring(4).trim()]));
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      flushParagraph();
      final rows = <List<String>>[];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        final cells = lines[i]
            .trim()
            .trimLeft()
            .trimRight()
            .replaceAll(RegExp(r'^\||\|$'), '')
            .split('|')
            .map((cell) => cell.trim())
            .toList();
        if (!cells.every((cell) => RegExp(r'^:?-{3,}:?$').hasMatch(cell))) {
          rows.add(cells);
        }
        i++;
      }
      if (rows.isNotEmpty) blocks.add(_Block(_BlockKind.table, rows));
      continue;
    }
    final ol = RegExp(r'^\d+\.\s+(.+)$');
    if (ol.hasMatch(line)) {
      flushParagraph();
      final items = <String>[];
      while (i < lines.length) {
        final m = ol.firstMatch(lines[i].trim());
        if (m == null) break;
        items.add(m.group(1)!);
        i++;
      }
      blocks.add(_Block(_BlockKind.ol, items));
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      final items = <String>[];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.add(lines[i].trim().substring(2));
        i++;
      }
      blocks.add(_Block(_BlockKind.ul, items));
      continue;
    }
    pendingParagraph = line;
    i++;
  }
  flushParagraph();
  return blocks;
}
