import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../cloud/cloud_auth_controller.dart';
import '../../cloud/wechat_auth.dart';

const weChatAppId = 'wx768c8167296b530e';

class LoginGate extends ConsumerStatefulWidget {
  const LoginGate({super.key});

  @override
  ConsumerState<LoginGate> createState() => _LoginGateState();
}

class _LoginGateState extends ConsumerState<LoginGate> {
  final _wechat = WeChatAuth();
  String? _error;
  bool _registered = false;

  @override
  void initState() {
    super.initState();
    _register();
  }

  Future<void> _register() async {
    try {
      _registered = await _wechat.register(appId: weChatAppId);
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) setState(() => _error = '微信 SDK 初始化失败：$error');
    }
  }

  Future<void> _login() async {
    setState(() => _error = null);
    try {
      if (!_registered) await _register();
      if (!_registered) throw StateError('微信 SDK 尚未就绪');
      await ref
          .read(cloudAuthControllerProvider.notifier)
          .loginWithWeChat(_wechat.requestAuthCode);
    } catch (error) {
      if (mounted) setState(() => _error = '登录失败：$error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(cloudAuthControllerProvider);
    final busy = state.isLoading;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(30),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                children: [
                  Container(
                    width: 86,
                    height: 86,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Icon(Icons.savings_outlined, size: 46),
                  ),
                  const SizedBox(height: 22),
                  Text(
                    'After Zero',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text('认真记录每一笔，直到归零。'),
                  const SizedBox(height: 30),
                  FilledButton.icon(
                    key: const Key('wechat-login'),
                    onPressed: busy ? null : _login,
                    icon: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.chat_bubble_outline),
                    label: Text(busy ? '正在登录…' : '微信登录'),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Text(
                    '登录用于云备份和 AI 债务助手；债务与档案默认只保存在本机。',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
