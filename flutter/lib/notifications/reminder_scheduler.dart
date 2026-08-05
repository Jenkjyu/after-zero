import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

import '../calc/calc.dart' as calc;
import '../data/models.dart';

const notifyWindowMonths = 6;
const notifyMaxPending = 450;
const _channelId = 'repay';
const _channelName = '还款提醒';

abstract class NotificationPort {
  Future<void> initialize();
  Future<bool> requestPermission();
  Future<bool> requestExactAlarmPermission();
  Future<void> cancelAllPending();
  Future<void> schedule({
    required int id,
    required DateTime at,
    required String title,
    required String body,
    required String payload,
  });
}

/// 只把平台插件包在这个适配器里，调度规则本身保持普通Dart代码，因此可在不启动原生平台的测试里
/// 验证“取消全部→根据当前数据重排”的核心语义。
class FlutterNotificationPort implements NotificationPort {
  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;
  bool _exactAlarmGranted = false;
  tz.Location? _location;

  FlutterNotificationPort({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  @override
  Future<void> initialize() async {
    if (_initialized || !_isMobile) return;
    tz.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      _location = tz.getLocation(info.identifier);
      tz.setLocalLocation(_location!);
    } catch (_) {
      // 少数定制系统可能给出TZ数据库没有的名字；UTC比崩溃更可控，真机阶段会验证本地时区。
      _location = tz.UTC;
      tz.setLocalLocation(tz.UTC);
    }
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_notify'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    _initialized = true;
  }

  @override
  Future<bool> requestPermission() async {
    await initialize();
    if (!_isMobile) return true;
    if (Platform.isAndroid) {
      return await _plugin
              .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin
              >()
              ?.requestNotificationsPermission() ??
          false;
    }
    return await _plugin
            .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin
            >()
            ?.requestPermissions(alert: true, badge: false, sound: true) ??
        false;
  }

  @override
  Future<bool> requestExactAlarmPermission() async {
    await initialize();
    if (!Platform.isAndroid) return true;
    _exactAlarmGranted =
        await _plugin
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.requestExactAlarmsPermission() ??
        false;
    return _exactAlarmGranted;
  }

  @override
  Future<void> cancelAllPending() async {
    await initialize();
    if (_isMobile) await _plugin.cancelAllPendingNotifications();
  }

  @override
  Future<void> schedule({
    required int id,
    required DateTime at,
    required String title,
    required String body,
    required String payload,
  }) async {
    await initialize();
    if (!_isMobile) return;
    final location = _location ?? tz.local;
    final target = tz.TZDateTime.from(at, location);
    await _plugin.zonedSchedule(
      id: id,
      scheduledDate: target,
      title: title,
      body: body,
      payload: payload,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: '债务到期提醒',
          icon: 'ic_stat_notify',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true),
      ),
      // 某些设备/商店策略可能拒绝精确闹钟；仍排inexact而不是让用户已经打开的提醒彻底失效。
      androidScheduleMode: _exactAlarmGranted
          ? AndroidScheduleMode.exactAllowWhileIdle
          : AndroidScheduleMode.inexactAllowWhileIdle,
    );
  }

  bool get _isMobile => Platform.isAndroid || Platform.isIOS;
}

class ReminderScheduler {
  final NotificationPort port;

  const ReminderScheduler(this.port);

  Future<bool> enableNotifications() async {
    final permitted = await port.requestPermission();
    if (!permitted) return false;
    // Android 14+需要用户确认精确闹钟；旧设备/ iOS在该调用上自然是no-op。
    await port.requestExactAlarmPermission();
    return true;
  }

  Future<void> reschedule({
    required List<Debt> debts,
    required NotifySettings settings,
    DateTime? now,
  }) async {
    await port.cancelAllPending();
    final items = calc.computeNotifySchedule(
      debts.map((debt) => debt.toMap()).toList(),
      settings.toMap(),
      (now ?? DateTime.now()).millisecondsSinceEpoch,
      notifyWindowMonths,
      notifyMaxPending,
    );
    for (var index = 0; index < items.length; index++) {
      final item = items[index];
      final at = item['fireAt'] as DateTime;
      final date = item['date'] as String;
      final name = item['name'] as String;
      await port.schedule(
        id: 1000 + index,
        at: at,
        title: '还款提醒',
        body:
            '$name · ${date.substring(5).replaceFirst('-', '月')}日到期 · ¥${calc.fmt(item['amount'])}',
        payload: '${item['name']}|$date',
      );
    }
  }

  Future<void> scheduleTestNotification() => port.schedule(
    id: 900,
    at: DateTime.now().add(const Duration(seconds: 10)),
    title: 'After Zero 测试提醒',
    body: '通知已正常工作，未来还款会按你的规则提醒。',
    payload: 'test',
  );
}
