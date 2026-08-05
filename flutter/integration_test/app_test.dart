// 真机/模拟器端到端测试入口——跑法: flutter test integration_test/app_test.dart
// 后续每个阶段涉及手势/原生插件的部分，端到端验证都加进这个目录。
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_zero/data/providers.dart';
import 'package:after_zero/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('App boots on a real device/emulator', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: const AfterZeroApp(requireLogin: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('还没有在还的债务'), findsOneWidget);
  });
}
