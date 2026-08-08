// CloudBase客户端的Riverpod接线——跟data/providers.dart同一个模式(sharedPreferencesProvider
// 必须先被main()覆盖注入)，但故意放在cloud/目录自成一体，不跟app业务数据的provider混在
// 一个文件里，理由见cloud_session_store.dart文件头注释。
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/providers.dart' show sharedPreferencesProvider;
import 'cloud_session_store.dart';
import 'cloudbase_client.dart';

/// 匿名登录`/auth/v1/signin/anonymously`要求带`x-device-id`头（CloudBase文档：一个设备id
/// 最多注册一个匿名用户），生成一次后持久化复用，不是每次登录都换一个新的。
const _deviceIdKey = 'after-zero-device-id-v1';

final deviceIdProvider = Provider<String>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  final existing = prefs.getString(_deviceIdKey);
  if (existing != null && existing.isNotEmpty) return existing;
  final rnd = Random();
  final id = List.generate(
    24,
    (_) => '0123456789abcdefghijklmnopqrstuvwxyz'[rnd.nextInt(36)],
  ).join();
  prefs.setString(_deviceIdKey, id);
  return id;
});

/// CloudBase环境ID——固定值，不是配置项(这个App目前只有一个环境，见AGENTS.md
/// "原生插件：WeChatLogin"一节)。
const cloudBaseEnvId = 'after-zero-d7gub5p5f09c8cc2d';

final cloudSessionStoreProvider = Provider<CloudSessionStore>(
  (ref) => CloudSessionStore(ref.watch(sharedPreferencesProvider)),
);

/// 单例客户端——启动时如果本地有持久化过的会话（且没过期）就恢复，避免每次冷启动都要
/// 重新走一遍匿名登录。⚠️非匿名(真实微信登录)会话过期后的静默续期(refresh_token)还没实现
/// ——CloudBase的refresh端点官方文档没有确认过exact形状，不确定之前不贸然实现，见
/// cloudbase_client.dart文件头注释。过期的非匿名会话目前的处理是"当作没有会话"，
/// 上层(CloudAuthController)会据此判断需要重新登录。
final cloudBaseClientProvider = Provider<CloudBaseClient>((ref) {
  final client = CloudBaseClient(envId: cloudBaseEnvId);
  final stored = ref.watch(cloudSessionStoreProvider).read();
  if (stored != null && !stored.isExpired) {
    client.restoreSession(stored);
  }
  return client;
});
