import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/main.dart';

void main() {
  testWidgets('App boots and renders the scaffold smoke-test page', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: AfterZeroApp()));
    expect(find.text('After Zero — Flutter重写脚手架已就绪'), findsOneWidget);
  });
}
