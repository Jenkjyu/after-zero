import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  runApp(const ProviderScope(child: AfterZeroApp()));
}

class AfterZeroApp extends StatelessWidget {
  const AfterZeroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'After Zero',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF18453B))),
      home: const ScaffoldSmokeTestPage(),
    );
  }
}

/// 阶段0脚手架验证页——确认Flutter/Riverpod/构建链路跑通，不是最终UI。
class ScaffoldSmokeTestPage extends ConsumerWidget {
  const ScaffoldSmokeTestPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const Scaffold(
      body: Center(child: Text('After Zero — Flutter重写脚手架已就绪')),
    );
  }
}
