import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cloud/cloud_auth_controller.dart';
import 'data/providers.dart';
import 'ui/account/login_gate.dart';
import 'ui/app_shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(
    ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: const AfterZeroApp(),
    ),
  );
}

class AfterZeroApp extends ConsumerWidget {
  final bool requireLogin;

  const AfterZeroApp({super.key, this.requireLogin = true});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loggedIn = ref.watch(isCloudLoggedInProvider);
    return MaterialApp(
      title: 'After Zero',
      theme: buildAppTheme(Brightness.light),
      darkTheme: buildAppTheme(Brightness.dark),
      home: requireLogin && !loggedIn ? const LoginGate() : const AppShell(),
    );
  }
}
