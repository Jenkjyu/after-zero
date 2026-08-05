// 登录编排——把"拿微信code"→"匿名会话调wxLogin换票据"→"用票据换正式会话"→"存Account"
// 这一串步骤串起来，对应vanilla`www/index.html`里微信登录按钮click handler那段逻辑。
//
// ⚠️故意依赖[WeChatCodeProvider]这个函数类型而不是直接依赖`WeChatAuth`类——这样单测能注入
// 一个假的"拿code"函数，把"登录编排逻辑对不对"和"fluwx到底能不能真正拉起微信"这两件事分开
// 验证。后者只能靠真机确认，前者靠这份文件的测试。
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models.dart';
import '../data/providers.dart' show accountProvider;
import 'cloud_providers.dart';
import 'wechat_auth.dart';

/// wxLogin云函数失败时的返回体`{ok:false, error}`——包成异常抛出，调用方(UI层)统一按
/// 异常处理登录失败，不用在业务代码里到处判断`result['ok']`。
class WxLoginFunctionException implements Exception {
  final String message;

  const WxLoginFunctionException(this.message);

  @override
  String toString() => 'WxLoginFunctionException: $message';
}

class CloudAuthController extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() => const AsyncValue.data(null);

  /// 完整登录流程。[getCode]生产环境传`WeChatAuth().requestAuthCode`，测试传假实现。
  Future<void> loginWithWeChat(WeChatCodeProvider getCode) async {
    state = const AsyncValue.loading();
    try {
      final client = ref.read(cloudBaseClientProvider);
      if (client.session == null || client.session!.isExpired) {
        await client.signInAnonymously(deviceId: ref.read(deviceIdProvider));
      }

      final code = await getCode();
      final raw = await client.callFunction('wxLogin', data: {'code': code});
      final result = (raw as Map).cast<String, dynamic>();
      if (result['ok'] != true) {
        throw WxLoginFunctionException(result['error'] as String? ?? '登录失败');
      }

      await client.signInWithCustomTicket(result['ticket'] as String);
      await ref.read(cloudSessionStoreProvider).write(client.session);

      final account = Account(
        openid: result['openid'] as String,
        nickname: result['nickname'] as String? ?? '',
        avatarUrl: result['avatarUrl'] as String? ?? '',
        loggedInAt: DateTime.now().millisecondsSinceEpoch,
      );
      ref.read(accountProvider.notifier).set(account);

      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  /// 退出登录——清本地Account+CloudBase会话，不删云端数据(那是deleteAccount云函数的事)。
  Future<void> logout() async {
    ref.read(cloudBaseClientProvider).clearSession();
    await ref.read(cloudSessionStoreProvider).write(null);
    ref.read(accountProvider.notifier).set(null);
  }
}

final cloudAuthControllerProvider =
    NotifierProvider<CloudAuthController, AsyncValue<void>>(
      CloudAuthController.new,
    );

/// 派生状态——"是不是真的处于已登录会话"，同时看本地Account记录和CloudBase会话是否有效
/// 且非匿名。两者理论上应该总是一致（登录成功才会两个一起写），分开判断是防御性的：
/// 万一只清了一半（比如App被杀掉正好卡在logout()中间），下次启动能表现成"未登录"而不是
/// 一个自相矛盾的中间态。
final isCloudLoggedInProvider = Provider<bool>((ref) {
  final account = ref.watch(accountProvider);
  final client = ref.watch(cloudBaseClientProvider);
  return account != null &&
      client.session != null &&
      !client.session!.anonymous &&
      !client.session!.isExpired;
});
