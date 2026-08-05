// CloudBase HTTP网关客户端——阶段3的核心，替代现有Capacitor版本用的CloudBase JS SDK。
// 官方Flutter SDK不能用（见CLAUDE.md），这里直接对接CloudBase文档确认过的HTTP API：
//   POST /auth/v1/signin/anonymously  匿名登录
//   POST /auth/v1/signin/custom       用wxLogin云函数换到的票据登录
//   POST /v1/functions/{name}         调云函数，带 Authorization: Bearer {access_token}
//
// ⚠️这条HTTP网关路径(api.tcloudbasegateway.com)有自己独立的"网关权限控制"（控制台配置，
// 按角色Admin/组织成员/注册用户/匿名用户分別授权，JSON policy），**跟现有云函数用的那套
// `{"*": {"invoke": "..."}}`调用权限完全是两码事**——后者只管JS SDK的callFunction()那条
// 路径，不管这条HTTP网关。实测确认：这个环境目前网关权限是空的（`tcb policy get`返回空），
// 触发的是平台默认策略——默认策略下"Cloud Functions (via HTTP API)"这一项，连"注册用户"
// 角色都是拒绝的，只有Admin默认放行；匿名用户更是所有角色里唯一被禁止调用任何云函数的一档。
// **这意味着要让Flutter版真正跑通，需要在CloudBase控制台"权限控制"页面加两条网关自定义策略**
// （这一步只能在控制台做，没有能安全脚本化的CLI/API路径——`tcb policy set`背后是什么鉴权
// 引擎、input schema长什么样，公开文档完全没有记录，不能在生产环境的安全策略上瞎猜）：
//   1. 给"匿名用户"角色加 {"effect":"allow","action":"functions:/wxLogin","resource":"*"}
//      ——wxLogin是整个登录流程的入口，这一步客户端还没有真实身份，只能先用匿名会话调它。
//   2. 给"注册用户"角色加能调其余云函数的策略（比如绑定"FunctionsAccess"预设策略，或者
//      自定义{"effect":"allow","action":"functions:*","resource":"*"}）——真实登录（微信换到
//      自定义票据）之后的用户要能调backupCreate/deleteAccount/aiAdvisor这些。
// 这一步不影响本文件的代码本身对不对——下面的实现已经用真实HTTP请求验证过"网关能正确识别
// 调用者身份"这件事本身是成立的（匿名调用被EXCEED_AUTHORITY拒绝，恰恰证明网关认出了
// "这是匿名会话"，不是网络层面就失败）。等控制台配置做完，端到端登录才能真正跑通。
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'cloudbase_session.dart';

class CloudBaseHttpException implements Exception {
  final int statusCode;
  final String? code;
  final String message;

  const CloudBaseHttpException({
    required this.statusCode,
    this.code,
    required this.message,
  });

  @override
  String toString() =>
      'CloudBaseHttpException($statusCode${code != null ? ", $code" : ""}): $message';
}

class CloudBaseClient {
  final String envId;
  final http.Client _http;
  CloudBaseSession? _session;

  CloudBaseClient({required this.envId, http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  String get _base => 'https://$envId.api.tcloudbasegateway.com';

  CloudBaseSession? get session => _session;

  /// 从本地持久化恢复一份之前登录过的会话（跳过重新登录）——调用方(provider层)负责
  /// 决定要不要在恢复前检查`isExpired`。
  void restoreSession(CloudBaseSession session) => _session = session;

  void clearSession() => _session = null;

  Future<CloudBaseSession> signInAnonymously({required String deviceId}) async {
    final resp = await _http.post(
      Uri.parse('$_base/auth/v1/signin/anonymously'),
      headers: {'Content-Type': 'application/json', 'x-device-id': deviceId},
      body: jsonEncode({}),
    );
    _throwIfError(resp);
    final session = CloudBaseSession.fromSignInJson(
      jsonDecode(resp.body) as Map<String, dynamic>,
      anonymous: true,
    );
    _session = session;
    return session;
  }

  /// ticket是wxLogin云函数返回的自定义登录票据（服务端用CloudBase的createTicket()签发）。
  Future<CloudBaseSession> signInWithCustomTicket(String ticket) async {
    final resp = await _http.post(
      Uri.parse('$_base/auth/v1/signin/custom'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'provider_id': 'custom', 'ticket': ticket}),
    );
    _throwIfError(resp);
    final session = CloudBaseSession.fromSignInJson(
      jsonDecode(resp.body) as Map<String, dynamic>,
      anonymous: false,
    );
    _session = session;
    return session;
  }

  /// 调云函数——对应JS SDK的`callFunction({name, data})`。返回值是云函数`exports.main`
  /// 返回对象本身解出来的JSON（不是网关响应的外层包装）。
  Future<dynamic> callFunction(
    String name, {
    Map<String, dynamic>? data,
  }) async {
    final session = _session;
    if (session == null) {
      throw StateError(
        '调用云函数前必须先建立会话（signInAnonymously或signInWithCustomTicket）',
      );
    }
    final resp = await _http.post(
      Uri.parse('$_base/v1/functions/$name'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${session.accessToken}',
      },
      body: jsonEncode(data ?? {}),
    );
    _throwIfError(resp);
    if (resp.body.isEmpty) return null;
    return jsonDecode(resp.body);
  }

  void _throwIfError(http.Response resp) {
    if (resp.statusCode >= 200 && resp.statusCode < 300) return;
    Map<String, dynamic>? body;
    try {
      body = jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {
      // 响应体不是JSON（比如网关层面的纯文本错误）——body保持null，下面用resp.body兜底。
    }
    throw CloudBaseHttpException(
      statusCode: resp.statusCode,
      code: body?['code'] as String?,
      message: body?['message'] as String? ?? resp.body,
    );
  }
}
