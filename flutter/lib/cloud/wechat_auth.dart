// 微信OAuth——用fluwx替代现有Capacitor版本的WeChatLoginPlugin.java手写原生插件（fluwx是
// Flutter生态里微信SDK的事实标准，见CLAUDE.md"Flutter重写"阶段3小节的调研结论）。
//
// ⚠️这一层的行为本质上没法在没有真实设备+真实微信App的情况下完整验证——跟现有Capacitor
// 版本"必须真机验证微信登录"是同一条限制（微信官方要求走"移动应用"OAuth，拉起手机上的
// 微信App本身走授权，这个交互没法在模拟器/单元测试里复现）。这个文件的正确性只能靠真机
// 走一遍完整登录流程确认，自动化测试覆盖的是cloud_auth_controller.dart那一层——它依赖的
// 是`WeChatCodeProvider`这个抽象（一个返回code的函数），不是具体的fluwx调用，所以能用一个
// 假的Provider函数测试登录编排逻辑本身对不对，不需要真的拉起微信。
import 'dart:async';

import 'package:fluwx/fluwx.dart';

/// 从fluwx拿到微信OAuth code这一步失败的原因——对应vanilla`wechatAuthResult`事件里
/// errCode非0的情况（用户取消/拒绝授权、微信未安装等）。
class WeChatAuthException implements Exception {
  final int errCode;
  final String? errStr;

  const WeChatAuthException(this.errCode, this.errStr);

  @override
  String toString() => 'WeChatAuthException($errCode): ${errStr ?? ""}';
}

/// [CloudAuthController]依赖的抽象——"想办法拿到一个微信OAuth code"，不关心具体怎么拿到。
/// 生产环境是[WeChatAuth.requestAuthCode]，测试环境可以传一个直接返回固定字符串的假函数。
typedef WeChatCodeProvider = Future<String> Function();

class WeChatAuth {
  final Fluwx _fluwx;

  WeChatAuth([Fluwx? fluwx]) : _fluwx = fluwx ?? Fluwx();

  /// App启动时调一次——对应vanilla微信SDK的注册步骤。[appId]不是秘密（跟AppSecret不同，
  /// AppSecret只存在云函数环境变量里，绝不出现在客户端代码里，见CLAUDE.md"原生插件：
  /// WeChatLogin"一节）。
  Future<bool> register({required String appId}) =>
      _fluwx.registerApi(appId: appId);

  Future<bool> get isInstalled => _fluwx.isWeChatInstalled;

  /// 拉起微信App走OAuth，返回拿到的code——跟原生插件`scope="snsapi_userinfo"`保持一致
  /// （要拿到昵称/头像，wxLogin云函数第2步靠这个scope才有权限调`sns/userinfo`接口）。
  /// 用户取消/拒绝授权、或微信返回非0 errCode时抛[WeChatAuthException]。
  Future<String> requestAuthCode() async {
    final completer = _AuthCompleter();
    final cancelable = _fluwx.addSubscriber((response) {
      if (response is! WeChatAuthResponse) return;
      completer.complete(response);
    });
    try {
      final sent = await _fluwx.authBy(
        which: NormalAuth(scope: 'snsapi_userinfo'),
      );
      if (!sent) {
        throw const WeChatAuthException(-1, '无法拉起微信授权（可能未安装微信）');
      }
      final response = await completer.future;
      if (response.errCode != 0 || response.code == null) {
        throw WeChatAuthException(response.errCode ?? -1, response.errStr);
      }
      return response.code!;
    } finally {
      cancelable.cancel();
    }
  }
}

class _AuthCompleter {
  final _c = Completer<WeChatAuthResponse>();

  void complete(WeChatAuthResponse response) {
    if (!_c.isCompleted) _c.complete(response);
  }

  Future<WeChatAuthResponse> get future => _c.future;
}
