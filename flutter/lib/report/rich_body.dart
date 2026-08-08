import 'package:flutter/material.dart';

/// 把含 **加粗** 标记的文本渲染成富文本（结论引擎的 body/action 展开用）。
class RichBody extends StatelessWidget {
  final String text;
  final TextStyle? style;
  final TextAlign? textAlign;
  const RichBody(this.text, {super.key, this.style, this.textAlign});

  @override
  Widget build(BuildContext context) {
    final base = style ?? DefaultTextStyle.of(context).style;
    return Text.rich(
      _spans(text, base),
      style: base,
      textAlign: textAlign,
    );
  }
}

TextSpan _spans(String text, TextStyle base) {
  final spans = <InlineSpan>[];
  final bold = RegExp(r'\*\*(.+?)\*\*');
  var cursor = 0;
  for (final match in bold.allMatches(text)) {
    if (match.start > cursor) {
      spans.add(TextSpan(text: text.substring(cursor, match.start)));
    }
    spans.add(
      TextSpan(
        text: match.group(1),
        style: base.copyWith(fontWeight: FontWeight.w700),
      ),
    );
    cursor = match.end;
  }
  if (cursor < text.length) {
    spans.add(TextSpan(text: text.substring(cursor)));
  }
  return TextSpan(style: base, children: spans);
}
