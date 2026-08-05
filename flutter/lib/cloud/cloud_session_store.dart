// CloudBase会话的本地持久化——独立于data/local_store.dart，因为这是"网络客户端状态"不是
// "App业务数据"，两者概念上不同层，即使底层都用shared_preferences也不共用同一个封装类。
// 新增的key（`after-zero-cloudbase-session-v1`）在现有Capacitor版本里没有对应物——vanilla
// 那边用的是CloudBase JS SDK自带的`persistence:"local"`会话持久化，不需要App自己管这件事；
// Flutter这边没有SDK可用，会话持久化只能自己做。
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'cloudbase_session.dart';

class CloudSessionStore {
  static const key = 'after-zero-cloudbase-session-v1';

  final SharedPreferences prefs;

  const CloudSessionStore(this.prefs);

  CloudBaseSession? read() {
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    return CloudBaseSession.fromMap(
      (jsonDecode(raw) as Map).cast<String, dynamic>(),
    );
  }

  Future<void> write(CloudBaseSession? session) {
    if (session == null) return prefs.remove(key);
    return prefs.setString(key, jsonEncode(session.toMap()));
  }
}
