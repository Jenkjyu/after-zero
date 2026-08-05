// 真机/模拟器端到端测试入口——跑法: flutter test integration_test/app_test.dart
// 这里先放一个跟test/widget_test.dart等价的冒烟测试，确认integration_test这条通道本身可用。
// 后续每个阶段涉及手势/原生插件的部分，端到端验证都加进这个目录。
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integration_test/integration_test.dart';

import 'package:after_zero/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('App boots on a real device/emulator', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: AfterZeroApp()));
    await tester.pumpAndSettle();
    expect(find.text('After Zero — Flutter重写脚手架已就绪'), findsOneWidget);
  });
}
