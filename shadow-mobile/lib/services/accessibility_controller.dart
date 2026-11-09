import 'dart:io';

import 'package:flutter/services.dart';

/// Android 无障碍控制 API 封装。
/// 需在系统设置中开启「Shadow」无障碍服务后，方可执行点击、滑动等操作。
/// 非 Android 平台调用将返回 false 或 no-op。
class AccessibilityController {
  AccessibilityController._();

  static const MethodChannel _channel = MethodChannel(
    'com.ibloc.shadow/accessibility',
  );

  /// 当前是否为 Android 平台（仅 Android 支持无障碍控制）
  static bool get isSupported => Platform.isAndroid;

  /// 无障碍服务**在系统设置里**是否已开启（**权威判据**）。
  ///
  /// ⚠️ **与 [isServiceConnected] 不是同一件事** ⇒ ⇒ 别混用：
  /// - 这个 ＝「用户在系统设置里开了没」⇒ ⇒ **权威、无竞态**；
  /// - [isServiceConnected] ＝「服务实例此刻在不在」⇒ ⇒ **瞬时** ⇒ ⇒
  ///   系统重启服务时会短暂为 false（真机实测约 1 秒）。
  ///
  /// ⚠️ **为什么权威的那一头在原生侧**：服务会不会被系统重启、
  /// 什么时候重连，只有系统知道 ⇒ ⇒ 原生那边读**系统设置**才准。
  static Future<bool> get isEnabled async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('isEnabled');
      return result ?? false;
    } on MissingPluginException {
      // ⚠️ 通道不在（单测 / 裁剪版 / 非 Android）⇒ ⇒ 保守：**当作没开**。
      // ⚠️ 宁可界面显示「未开启」，也不要谎称已开启。
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// 无障碍服务**此刻连上了没有**（瞬时活性）。
  ///
  /// ⚠️ 与 [isEnabled] **不是同一件事** ⇒ ⇒ 它答的是「能不能**立刻**派发」，
  /// 而 [isEnabled] 答的是「用户开没开」⇒ ⇒ 两者会**短暂不一致**
  /// ⇒ ⇒ 那正是系统重启服务的那一秒。
  static Future<bool> get isServiceConnected async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('isServiceConnected');
      return result ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// 「**现在能不能动手**」—— 等得起抖的判据。
  ///
  /// ⚠️ 与 [isEnabled] **不是同一件事** ⇒ ⇒ 那个答「用户开没开」，
  /// 这个答「此刻能不能派发」⇒ ⇒ 真机实测：系统重启无障碍服务的那 1 秒里，
  /// **连「已启用列表」都是空的** ⇒ ⇒ 一读就下结论会得出**假原因**。
  ///
  /// ⚠️ 原生那一头会**等服务连上**（≤3 秒）再答 ⇒ ⇒ 所以这里**不会**立刻回 false。
  static Future<bool> get isReady async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('isReady');
      return result ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// **把「设备动作闸」的状态推给原生侧** —— 让原生那两个平行面
  /// （HTTP `/api/mobile/action`、A2A 的 `executeAction`）也受同一道闸管。
  ///
  /// ⚠️ **为什么需要推**：Dart 侧的闸只管**模型工具**那条路 ⇒ ⇒
  /// 原生侧的动作入口**天然绕开**它 ⇒ ⇒ 「闸建好了」这句话在它们身上
  /// **是假的** ⇒ ⇒ 让原生侧也认这道闸 ⇒ ⇒ 闸才是真的。
  ///
  /// ⚠️ **故意不按平台挡**（不像 [isEnabled] 那样先看 `Platform.isAndroid`）：
  /// iOS 上没有这个通道 ⇒ ⇒ 抛 MissingPluginException ⇒ ⇒ 被下面的
  /// catch 吃掉 ⇒ ⇒ 是个 no-op；而不按平台挡 ⇒ ⇒ 单测在任意平台上
  /// 都能钉住「确实推了」。
  ///
  /// ⚠️ **推失败 = 原生侧保持拒绝**（那边默认 false）⇒ ⇒ fail-closed。
  static Future<void> setDeviceActionsAllowed(bool allowed) async {
    try {
      await _channel.invokeMethod<void>('setDeviceActionsAllowed', {
        'allowed': allowed,
      });
    } on MissingPluginException {
      // 通道不在（iOS / 单测 / 裁剪版）⇒ ⇒ 原生侧拿不到状态 ⇒ ⇒
      // 它保持默认拒绝 ⇒ ⇒ 安全。
    } on PlatformException {
      // 推失败同理：原生侧保持拒绝 ⇒ ⇒ fail-closed。
    }
  }

  /// 打开系统无障碍设置页，引导用户开启本应用的无障碍服务
  static Future<void> openSettings() async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod('openSettings');
    } on PlatformException {
      rethrow;
    }
  }

  /// 在屏幕坐标 (x, y) 执行点击（短按）
  /// 坐标单位为像素，以屏幕左上角为原点
  /// 返回是否派发成功（服务未开启或派发失败时为 false）
  static Future<bool> tap(double x, double y) async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('tap', {'x': x, 'y': y});
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// 在屏幕坐标 (x, y) 执行长按
  static Future<bool> longPress(double x, double y) async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('longPress', {
        'x': x,
        'y': y,
      });
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// 从 (x1, y1) 滑动到 (x2, y2)，历时 [durationMs] 毫秒
  static Future<bool> swipe({
    required double x1,
    required double y1,
    required double x2,
    required double y2,
    int durationMs = 300,
  }) async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('swipe', {
        'x1': x1,
        'y1': y1,
        'x2': x2,
        'y2': y2,
        'durationMs': durationMs,
      });
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// 全局系统操作
  /// [action] 可选: back | home | recents | notifications | quick_settings | power_dialog
  ///
  /// ⚠️ 发的是 [GlobalAction.wire]（snake_case），**不是** `name`（camelCase）——
  /// Kotlin 侧只认 snake_case ⇒ ⇒ 发 camelCase 会让它**静悄悄**变成「返回」。
  static Future<bool> globalAction(GlobalAction action) async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('globalAction', {
        'action': action.wire,
      });
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// 读当前前台窗口的**可访问性树**（只读，不碰任何输入）。
  ///
  /// ⚠️ 返回 null ＝ 无障碍服务没连上 / 没有可读的前台窗口
  /// ⇒ ⇒ 调用方据此报「无障碍服务未开启」，而不是拿一段空白当结果。
  ///
  /// ⚠️ 为什么用**树**而不是截图：树是**文本** ⇒ ⇒ 模型直接读得懂、
  /// token 也省；而且截图要用户每次授权（MediaProjection），树不要。
  static Future<String?> readScreen() async {
    if (!isSupported) return null;
    try {
      return await _channel.invokeMethod<String>('readScreen');
    } on MissingPluginException {
      // ⚠️ 通道不在 ⇒ ⇒ 读不到（**不是**空屏幕）。
      return null;
    } on PlatformException {
      return null;
    }
  }

  /// 本 app 自己的窗口在**屏幕**上的原点（物理像素）—— null ＝ 拿不到。
  ///
  /// ⚠️ 为什么需要它：自家 app 的语义树坐标是「**本窗口**」的物理像素
  /// ⇒ ⇒ 而手势派发用的是**整屏**物理像素 ⇒ ⇒ 两者差一个窗口原点
  /// ⇒ ⇒ 不知道这个原点 ⇒ ⇒ 自家窗口里的坐标**不能**直接拿去点。
  ///
  /// ⚠️ 拿不到就回 null ⇒ ⇒ 调用方**不换算**（宁可换个坐标口径，
  /// 也不给一个错的偏移 —— 错偏移会让模型点歪）。
  static Future<Map<String, double>?> viewGeometry() async {
    if (!isSupported) return null;
    try {
      final result =
          await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'getViewGeometry',
      );
      if (result == null) return null;
      final double? x = (result['originX'] as num?)?.toDouble();
      final double? y = (result['originY'] as num?)?.toDouble();
      if (x == null || y == null) return null;
      return <String, double>{'originX': x, 'originY': y};
    } on MissingPluginException {
      // ⚠️ 通道不在（iOS / 单测 / 裁剪版）⇒ ⇒ 没有原点 ⇒ ⇒ 不换算。
      return null;
    } on PlatformException {
      return null;
    }
  }

  /// **屏幕尺寸**（物理像素，宽 × 高）—— null ＝ 拿不到。
  ///
  /// ⚠️⚠️ **为什么需要它**（2026-11-10 真机实测）：
  /// 手势派发 API 对**越界坐标**照样回「派发成功」
  /// ⇒ ⇒ 实测滑动起点 `y=3084` 而屏幕只有 2400 高
  /// ⇒ ⇒ 派发成功 ⇒ ⇒ **界面一动不动**
  /// ⇒ ⇒ ⇒ 症状：**失败长得像成功**（模型以为滑过了 ⇒ ⇒ 接着照着旧树判断）
  /// ⇒ ⇒ ⇒ 所以派发**之前**先拿屏幕尺寸判坐标在不在屏内。
  ///
  /// ⚠️ 口径与原生派发**同一块屏**（默认屏 display 0）⇒ ⇒ 不会误杀。
  /// ⚠️ 拿不到就回 null ⇒ ⇒ 调用方**不拦**（宁可放过，不误杀）。
  static Future<Map<String, double>?> screenSize() async {
    if (!isSupported) return null;
    try {
      final result =
          await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'getScreenSize',
      );
      if (result == null) return null;
      final double? w = (result['width'] as num?)?.toDouble();
      final double? h = (result['height'] as num?)?.toDouble();
      if (w == null || h == null) return null;
      return <String, double>{'width': w, 'height': h};
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  /// 在当前前台窗口中查找包含 [text] 的节点并执行点击
  /// 用于按文案点击控件（如「确定」「发送」）
  static Future<bool> findAndClickByText(String text) async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('findAndClickByText', {
        'text': text,
      });
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }
}

/// 全局操作类型。
///
/// ⚠️ **wire 名与 Kotlin 侧逐字对齐**（snake_case）——
/// 以前直接发 `name`（camelCase）⇒ ⇒ Kotlin 只认 back 与 home
/// ⇒ ⇒ 其余**静悄悄**变成了「返回」（模型要「最近任务」却收到一个「返回」，
/// 比明确失败更糟）。
enum GlobalAction {
  back('back'),
  home('home'),
  recents('recents'),
  notifications('notifications'),
  quickSettings('quick_settings'),
  powerDialog('power_dialog');

  const GlobalAction(this.wire);

  /// 跨通道的稳定字符串（**不要**用 `name`）。
  final String wire;
}
