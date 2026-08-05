// CloudBase HTTP网关客户端——阶段3的核心，替代现有Capacitor版本用的CloudBase JS SDK。
// 官方Flutter SDK不能用（见CLAUDE.md），这里直接对接CloudBase文档确认过的HTTP API：
//   POST /auth/v1/signin/anonymously  匿名登录
//   POST /auth/v1/signin/custom       用wxLogin云函数换到的票据登录
//   POST /v1/functions/{name}         调云函数，带 Authorization: Bearer {access_token}
//
// HTTP网关会复用这个环境现有的云函数调用权限：wxLogin已有匿名例外，其余函数走要求
// 非匿名登录的`*`规则。阶段3用wxLogin/backupList做过正反对照实测，不需要另配一套网关策略。
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
