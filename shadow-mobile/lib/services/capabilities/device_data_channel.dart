import 'package:flutter/services.dart';

/// **设备数据通道** —— 与 Kotlin 侧 `DeviceDataBridge` 对话。
///
/// ## 边界（很重要）
///
/// 这一层**只做数据搬运**：Dart 问「给我这个时间窗内的日历」，
/// Kotlin 去问 Android 的 `CalendarContract`，把结果搬回来。
///
/// ⚠️ **授权判定不在这里** —— 在两处，且都在 Dart 侧：
/// 1. 应用层的档位（每次询问 / 完全访问）⇒ 聊天流里的 Allow / Deny 卡片；
/// 2. 系统层的权限（READ_CALENDAR 等）⇒ 用户在系统弹窗里自己批。
///
/// ⇒ ⇒ 但 Kotlin 侧**仍然会自己再查一遍权限**（见 `DeviceDataBridge`）
/// ⇒ ⇒ **Dart 说「有权限」不算数**，原生层没有权限就是拒绝 ⇒ ⇒
/// 这是**fail-closed** 的关键：万一 Dart 侧的判断逻辑出 bug，
/// 原生那道门仍然拦得住。
class DeviceDataChannel {
  static const MethodChannel _channel = MethodChannel(
    'com.ibloc.shadow/device_data',
  );

  /// 原生层把「这个能力没有系统权限」报上来的错误码。
  static const String permissionDeniedCode = 'PERMISSION_DENIED';

  const DeviceDataChannel();

  /// 这个能力在 **OS 层**有没有拿到权限（**只读**，不弹窗）。
  Future<bool> hasOsPermission(String capabilityWire) async {
    try {
      final granted =
          await _channel.invokeMethod<bool>('hasPermission', {
            'capability': capabilityWire,
          }) ??
          false;
      return granted;
    } on MissingPluginException {
      // 原生通道没装（单测 / 裁剪版）⇒ ⇒ 保守：**当作没有**。
      // ⚠️ 宁可界面显示「未授予」，也不要谎称已授予。
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// **就地申请**这个能力的系统权限（弹系统自己那个框）。
  ///
  /// ⚠️ 参数只给**能力名**，不给权限串 —— 权限串是**各平台自己的事**
  /// （Android 的 READ_CALENDAR、iOS 的 NSCalendarsUsageDescription）
  /// ⇒ ⇒ 放在 Dart 里就等于把两套平台的知识搅在一起，还会各自漂移。
  ///
  /// ⚠️ 系统弹窗是**异步**的（用户要到别的界面上点）⇒ ⇒ 原生那边要等
  /// `onRequestPermissionsResult` 回调才敢答 ⇒ ⇒ 这里等的就是那个答复。
  ///
  /// ⚠️ 拿不到权限 ⇒ 返回 false（**不抛异常**）⇒ ⇒ 调用方决定怎么报错。
  Future<bool> requestPermission(String capabilityWire) async {
    try {
      final granted =
          await _channel.invokeMethod<bool>('requestPermission', {
            'capability': capabilityWire,
          }) ??
          false;
      return granted;
    } on MissingPluginException {
      // 通道不在 ⇒ ⇒ 没有东西能弹系统框 ⇒ ⇒ 明确失败。
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// 读日历（时间窗内的事件）。
  Future<List<Map<String, Object?>>> readCalendar({
    required int startMs,
    required int endMs,
    int limit = 50,
  }) async {
    final raw =
        await _channel.invokeListMethod<Object?>('readCalendar', {
          'startMs': startMs,
          'endMs': endMs,
          'limit': limit,
        }) ??
        const [];
    return _asMaps(raw);
  }

  /// 写日历（新建；给了 [eventId] 就是改那一条）。
  Future<Map<String, Object?>> writeCalendar({
    required String title,
    required int startMs,
    required int endMs,
    String? description,
    String? location,
    String? eventId,
  }) async {
    final raw =
        await _channel.invokeMethod<Object?>('writeCalendar', {
          'title': title,
          'startMs': startMs,
          'endMs': endMs,
          'description': description,
          'location': location,
          'eventId': eventId,
        });
    return _asMap(raw);
  }

  /// 读通讯录（可带一个模糊搜索词）。
  Future<List<Map<String, Object?>>> readContacts({
    String? query,
    int limit = 50,
  }) async {
    final raw =
        await _channel.invokeListMethod<Object?>('readContacts', {
          'query': query,
          'limit': limit,
        }) ??
        const [];
    return _asMaps(raw);
  }

  /// 读最近的短信。
  Future<List<Map<String, Object?>>> readSms({int limit = 30}) async {
    final raw =
        await _channel.invokeListMethod<Object?>('readSms', {
          'limit': limit,
        }) ??
        const [];
    return _asMaps(raw);
  }

  /// 读相册的**元数据**（标题 / 时间 / 尺寸）。
  ///
  /// ⚠️ **不取图片内容** —— 像素进模型上下文既没意义又贵。
  Future<List<Map<String, Object?>>> readPhotos({int limit = 30}) async {
    final raw =
        await _channel.invokeListMethod<Object?>('readPhotos', {
          'limit': limit,
        }) ??
        const [];
    return _asMaps(raw);
  }

  /// 打开**本 App**的系统权限页。
  ///
  /// ⚠️ 界面上写着「系统权限未授予」⇒ ⇒ 用户得有个**一键**去授的入口
  /// ⇒ ⇒ 否则那句话只是把人卡在那儿。
  ///
  /// ⚠️ 打不开（通道不在 / 系统不认）⇒ ⇒ 返回 false（**不假装成功**）。
  Future<bool> openAppSettings() async {
    try {
      final ok = await _channel.invokeMethod<bool>('openAppSettings') ?? false;
      return ok;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  static List<Map<String, Object?>> _asMaps(List<Object?> raw) {
    final out = <Map<String, Object?>>[];
    for (final item in raw) {
      if (item is Map) out.add(Map<String, Object?>.from(item));
    }
    return out;
  }

  static Map<String, Object?> _asMap(Object? raw) {
    if (raw is Map) return Map<String, Object?>.from(raw);
    return const {};
  }
}
