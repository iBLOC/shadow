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

  /// 无障碍服务是否已开启
  static Future<bool> get isEnabled async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('isEnabled');
      return result ?? false;
    } on PlatformException {
      return false;
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
  static Future<bool> globalAction(GlobalAction action) async {
    if (!isSupported) return false;
    try {
      final result = await _channel.invokeMethod<bool>('globalAction', {
        'action': action.name,
      });
      return result ?? false;
    } on PlatformException {
      return false;
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

/// 全局操作类型
enum GlobalAction {
  back,
  home,
  recents,
  notifications,
  quick_settings,
  power_dialog,
}
