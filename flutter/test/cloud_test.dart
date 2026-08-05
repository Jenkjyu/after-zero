// 阶段3（云端接入层）测试——CloudBaseClient的HTTP请求/响应处理用http包自带的testing.dart
// MockClient打桩，不依赖真实网络/真实CloudBase环境（真实端到端的"登录+调云函数"验证见
// CLAUDE.md"Flutter重写"阶段3小节——那部分只能靠真机走一遍真实微信登录来确认，这里测的是
// 客户端代码本身的请求构造/响应解析/错误处理逻辑对不对）。
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_zero/cloud/cloud_auth_controller.dart';
import 'package:after_zero/cloud/cloud_providers.dart';
import 'package:after_zero/cloud/cloud_session_store.dart';
import 'package:after_zero/cloud/cloudbase_client.dart';
import 'package:after_zero/cloud/cloudbase_session.dart';
import 'package:after_zero/data/providers.dart'
    show accountProvider, sharedPreferencesProvider;

/// 摘自真实HTTP网关请求得到的响应形状（见CLAUDE.md阶段3小节的实测记录），不是瞎编的字段名。
Map<String, dynamic> fakeSignInJson({String scope = 'anonymous'}) => {
  'token_type': 'Bearer',
  'access_token': 'fake-access-token',
  'refresh_token': 'fake-refresh-token',
  'expires_in': 7200,
  'scope': scope,
  'sub': 'fake-uid',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CloudBaseSession', () {
    test('fromSignInJson: 用expires_in算出到期时间，anonymous标记按调用方传入', () {
      final before = DateTime.now();
      final session = CloudBaseSession.fromSignInJson(
        fakeSignInJson(),
        anonymous: true,
      );
      expect(session.accessToken, 'fake-access-token');
      expect(session.anonymous, true);
      expect(session.isExpired, false);
      expect(
        session.expiresAt.isAfter(before.add(const Duration(seconds: 7199))),
        true,
      );
    });

    test('isExpired: 到期时间在过去时返回true', () {
      final session = CloudBaseSession(
        accessToken: 'x',
        expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
        anonymous: false,
      );
      expect(session.isExpired, true);
    });

    test('toMap/fromMap 往返', () {
      final session = CloudBaseSession(
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: DateTime(2026, 1, 1),
        anonymous: true,
      );
      final back = CloudBaseSession.fromMap(session.toMap());
      expect(back.accessToken, 'a');
      expect(back.refreshToken, 'r');
      expect(back.expiresAt, DateTime(2026, 1, 1));
      expect(back.anonymous, true);
    });
  });

  group('CloudBaseClient', () {
    test('signInAnonymously: 请求带x-device-id头，响应正确解析成session', () async {
      http.Request? captured;
      final mock = MockClient((req) async {
        captured = req;
        return http.Response(jsonEncode(fakeSignInJson()), 200);
      });
      final client = CloudBaseClient(envId: 'env1', httpClient: mock);
      final session = await client.signInAnonymously(deviceId: 'dev-1');

      expect(
        captured!.url.toString(),
        'https://env1.api.tcloudbasegateway.com/auth/v1/signin/anonymously',
      );
      expect(captured!.headers['x-device-id'], 'dev-1');
      expect(session.accessToken, 'fake-access-token');
      expect(session.anonymous, true);
      expect(client.session, same(session));
    });

    test('signInWithCustomTicket: 请求体带provider_id=custom和ticket', () async {
      http.Request? captured;
      final mock = MockClient((req) async {
        captured = req;
        return http.Response(jsonEncode(fakeSignInJson(scope: '')), 200);
      });
      final client = CloudBaseClient(envId: 'env1', httpClient: mock);
      final session = await client.signInWithCustomTicket('the-ticket');

      final body = jsonDecode(captured!.body) as Map<String, dynamic>;
      expect(body['provider_id'], 'custom');
      expect(body['ticket'], 'the-ticket');
      expect(session.anonymous, false);
    });

    test('callFunction: 未登录时直接抛StateError，不发请求', () async {
      var called = false;
      final mock = MockClient((req) async {
        called = true;
        return http.Response('{}', 200);
      });
      final client = CloudBaseClient(envId: 'env1', httpClient: mock);
      expect(() => client.callFunction('wxLogin'), throwsStateError);
      expect(called, false);
    });

    test(
      'callFunction: 带Authorization: Bearer头调用网关，返回值是云函数返回的JSON本身',
      () async {
        http.Request? captured;
        final mock = MockClient((req) async {
          captured = req;
          return http.Response(jsonEncode({'ok': true, 'ticket': 'abc'}), 200);
        });
        final client = CloudBaseClient(envId: 'env1', httpClient: mock);
        client.restoreSession(
          CloudBaseSession(
            accessToken: 'tok-1',
            expiresAt: DateTime.now().add(const Duration(hours: 1)),
            anonymous: true,
          ),
        );

        final result = await client.callFunction(
          'wxLogin',
          data: {'code': 'wx-code'},
        );

        expect(
          captured!.url.toString(),
          'https://env1.api.tcloudbasegateway.com/v1/functions/wxLogin',
        );
        expect(captured!.headers['Authorization'], 'Bearer tok-1');
        expect(jsonDecode(captured!.body), {'code': 'wx-code'});
        expect(result, {'ok': true, 'ticket': 'abc'});
      },
    );

    test(
      'callFunction: 网关拒绝时抛CloudBaseHttpException并带上code/message（真实复现过EXCEED_AUTHORITY）',
      () async {
        final mock = MockClient((req) async {
          return http.Response(
            jsonEncode({
              'code': 'EXCEED_AUTHORITY',
              'message': 'Request exceeds granted authority.',
            }),
            403,
          );
        });
        final client = CloudBaseClient(envId: 'env1', httpClient: mock);
        client.restoreSession(
          CloudBaseSession(
            accessToken: 'tok-1',
            expiresAt: DateTime.now().add(const Duration(hours: 1)),
            anonymous: true,
          ),
        );

        try {
          await client.callFunction('deleteAccount');
          fail('应该抛异常');
        } on CloudBaseHttpException catch (e) {
          expect(e.statusCode, 403);
          expect(e.code, 'EXCEED_AUTHORITY');
          expect(e.message, contains('exceeds granted authority'));
        }
      },
    );
  });

  group('CloudSessionStore', () {
    test('read/write 往返，未写入时返回null', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final store = CloudSessionStore(prefs);
      expect(store.read(), null);

      final session = CloudBaseSession(
        accessToken: 'a',
        expiresAt: DateTime(2026, 1, 1),
        anonymous: true,
      );
      await store.write(session);
      expect(store.read()?.accessToken, 'a');

      await store.write(null);
      expect(store.read(), null);
    });
  });

  group('cloudBaseClientProvider', () {
    test('本地有未过期会话时自动恢复', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      await CloudSessionStore(prefs).write(
        CloudBaseSession(
          accessToken: 'restored',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
          anonymous: false,
        ),
      );

      final container = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
      addTearDown(container.dispose);
      expect(
        container.read(cloudBaseClientProvider).session?.accessToken,
        'restored',
      );
    });

    test('本地会话已过期时不恢复(session为null)', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      await CloudSessionStore(prefs).write(
        CloudBaseSession(
          accessToken: 'expired',
          expiresAt: DateTime.now().subtract(const Duration(hours: 1)),
          anonymous: false,
        ),
      );

      final container = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
      addTearDown(container.dispose);
      expect(container.read(cloudBaseClientProvider).session, null);
    });
  });

  group('CloudAuthController: 登录编排逻辑(不依赖真实fluwx，用假的WeChatCodeProvider)', () {
    late SharedPreferences prefs;
    late ProviderContainer container;

    /// 依次响应：①匿名登录 ②wxLogin云函数 ③用票据换正式会话。
    /// 用请求URL区分该返回哪个响应，跟真实网关的路径规则完全对应。
    // ⚠️http.Response(String,...)不显式传UTF-8 content-type的话会按latin1编码body，非ASCII
    // 字符（比如中文昵称"小明"）会直接抛"Contains invalid characters"——真实响应体含中文时
    // 必须显式声明charset，不能依赖默认值。
    http.Response jsonResponse(Map<String, dynamic> body) => http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

    http.Client buildMockClient({
      required Map<String, dynamic> wxLoginResponse,
    }) {
      return MockClient((req) async {
        if (req.url.path.endsWith('/signin/anonymously')) {
          return jsonResponse(fakeSignInJson());
        }
        if (req.url.path.endsWith('/functions/wxLogin')) {
          return jsonResponse(wxLoginResponse);
        }
        if (req.url.path.endsWith('/signin/custom')) {
          return jsonResponse(fakeSignInJson(scope: ''));
        }
        throw StateError('未预期的请求: ${req.url}');
      });
    }

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
    });

    test('登录成功：wxLogin返回ok:true后完成整个链路，account/session都落盘', () async {
      final client = CloudBaseClient(
        envId: 'env1',
        httpClient: buildMockClient(
          wxLoginResponse: {
            'ok': true,
            'ticket': 't1',
            'openid': 'o1',
            'nickname': '小明',
            'avatarUrl': 'https://x/a.png',
          },
        ),
      );
      container = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          cloudBaseClientProvider.overrideWithValue(client),
        ],
      );
      addTearDown(container.dispose);

      expect(container.read(isCloudLoggedInProvider), false);
      await container
          .read(cloudAuthControllerProvider.notifier)
          .loginWithWeChat(() async => 'fake-wx-code');

      expect(container.read(accountProvider)?.openid, 'o1');
      expect(container.read(accountProvider)?.nickname, '小明');
      expect(client.session?.anonymous, false);
      expect(container.read(isCloudLoggedInProvider), true);
      // 会话确实持久化了，不是只停在内存state里
      expect(CloudSessionStore(prefs).read()?.anonymous, false);
    });

    test(
      '登录失败：wxLogin返回ok:false时抛WxLoginFunctionException，account不写入',
      () async {
        final client = CloudBaseClient(
          envId: 'env1',
          httpClient: buildMockClient(
            wxLoginResponse: {
              'ok': false,
              'error': '微信授权失败(40029): invalid code',
            },
          ),
        );
        container = ProviderContainer(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            cloudBaseClientProvider.overrideWithValue(client),
          ],
        );
        addTearDown(container.dispose);

        await expectLater(
          () => container
              .read(cloudAuthControllerProvider.notifier)
              .loginWithWeChat(() async => 'fake-wx-code'),
          throwsA(isA<WxLoginFunctionException>()),
        );
        expect(container.read(accountProvider), null);
        expect(container.read(cloudAuthControllerProvider).hasError, true);
      },
    );

    test('logout: 清掉account和会话，isCloudLoggedInProvider回到false', () async {
      final client = CloudBaseClient(
        envId: 'env1',
        httpClient: buildMockClient(
          wxLoginResponse: {
            'ok': true,
            'ticket': 't1',
            'openid': 'o1',
            'nickname': 'x',
            'avatarUrl': '',
          },
        ),
      );
      container = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          cloudBaseClientProvider.overrideWithValue(client),
        ],
      );
      addTearDown(container.dispose);

      await container
          .read(cloudAuthControllerProvider.notifier)
          .loginWithWeChat(() async => 'fake-wx-code');
      expect(container.read(isCloudLoggedInProvider), true);

      await container.read(cloudAuthControllerProvider.notifier).logout();
      expect(container.read(accountProvider), null);
      expect(client.session, null);
      expect(CloudSessionStore(prefs).read(), null);
      expect(container.read(isCloudLoggedInProvider), false);
    });
  });
}
