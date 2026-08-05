/// CloudBase HTTP网关签发的会话——对应`/auth/v1/signin/anonymously`或`/auth/v1/signin/custom`
/// 的返回值。这不是JS SDK那种"调一个方法就有内部会话管理"的东西——CloudBase没有能用的官方
/// Flutter SDK（`cloudbase_core`等包5年没更新、不兼容Dart 3），这一层是手写的，直接对接
/// CloudBase的HTTP网关（`https://{envId}.api.tcloudbasegateway.com`），细节见
/// `CLAUDE.md`"Flutter重写"一节阶段3小节。
class CloudBaseSession {
  final String accessToken;
  final String? refreshToken;
  final DateTime expiresAt;

  /// true=匿名登录会话（scope:"anonymous"），false=微信登录换到的自定义票据会话。
  /// 现有云函数（deleteAccount等）用`app.auth().getUserInfo().customUserId`判断身份，
  /// 匿名会话的customUserId是随机生成的匿名uid，不等于微信openid——调用方要知道
  /// 当前是不是匿名会话，才能判断"能不能调这个云函数"（比如wxLogin允许匿名调用，
  /// 其它大多数云函数需要真实登录）。
  final bool anonymous;

  const CloudBaseSession({
    required this.accessToken,
    this.refreshToken,
    required this.expiresAt,
    required this.anonymous,
  });

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  /// 从`/auth/v1/signin/*`接口的原始JSON响应构造。
  factory CloudBaseSession.fromSignInJson(
    Map<String, dynamic> json, {
    required bool anonymous,
  }) {
    final expiresIn = (json['expires_in'] as num?)?.toInt() ?? 7200;
    return CloudBaseSession(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String?,
      expiresAt: DateTime.now().add(Duration(seconds: expiresIn)),
      anonymous: anonymous,
    );
  }

  factory CloudBaseSession.fromMap(Map<String, dynamic> m) => CloudBaseSession(
    accessToken: m['accessToken'] as String,
    refreshToken: m['refreshToken'] as String?,
    expiresAt: DateTime.parse(m['expiresAt'] as String),
    anonymous: m['anonymous'] as bool? ?? false,
  );

  Map<String, dynamic> toMap() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'expiresAt': expiresAt.toIso8601String(),
    'anonymous': anonymous,
  };
}
