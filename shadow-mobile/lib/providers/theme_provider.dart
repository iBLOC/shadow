import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/app_config_service.dart';
import '../theme/app_tokens.g.dart';
import '../theme/theme_appearance.dart';

/// 明暗模式。
///
/// 与 [themeAppearanceProvider] 分开是有意的：明暗是「环境」偏好，
/// 主题色 / 玻璃强度是「外观」偏好。测试里单独 mock 明暗更容易。
final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>((
  ref,
) {
  return ThemeModeNotifier();
});

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.system);

  void setThemeMode(ThemeMode mode) {
    state = mode;
  }

  void toggleTheme() {
    if (state == ThemeMode.light) {
      state = ThemeMode.dark;
    } else {
      state = ThemeMode.light;
    }
  }
}

/// 外观偏好 —— 主题色 / 玻璃强度 / 对话框背景。
///
/// 这是「每个用户有自己的影子」在产品上的落点：用户可以挑主题色，
/// 挑玻璃强度，指定对话框背景。默认全是中性（影子本身无色）。
final themeAppearanceProvider =
    StateNotifierProvider<ThemeAppearanceNotifier, ThemeAppearance>((ref) {
      return ThemeAppearanceNotifier();
    });

class ThemeAppearanceNotifier extends StateNotifier<ThemeAppearance> {
  ThemeAppearanceNotifier() : super(const ThemeAppearance()) {
    _restore();
  }

  final AppConfigService _config = AppConfigService();

  /// 从配置文件恢复上次的外观选择。
  Future<void> _restore() async {
    try {
      await _config.init();
      if (!mounted) return;
      state = ThemeAppearance(
        accentSeed: _config.accentColorValue == null
            ? AppTokens.accentSeed
            : Color(_config.accentColorValue!),
        glassIntensity: _config.glassIntensity ?? 1.0,
        surfaceOverride: _config.surfaceOverrideValue == null
            ? null
            : Color(_config.surfaceOverrideValue!),
      );
    } catch (e) {
      // 读配置失败就用默认值 —— 外观不该因为配置文件坏了就进不去 App
      if (mounted) state = const ThemeAppearance();
    }
  }

  /// 设置主题色（用户挑的色相）。
  Future<void> setAccentColor(Color color) async {
    state = state.copyWith(accentSeed: color);
    await _config.setAccentColor(color.toARGB32());
  }

  /// 设置玻璃强度 0..1。0 = 关掉玻璃（实心表面）。
  ///
  /// [persist] = false 时只更新内存状态 —— 拖动滑块时用这个避免每次
  /// 拖动都写一次磁盘。
  Future<void> setGlassIntensity(
    double intensity, {
    bool persist = true,
  }) async {
    final v = intensity.clamp(0.0, 1.0).toDouble();
    state = state.copyWith(glassIntensity: v);
    if (persist) await _config.setGlassIntensity(v);
  }

  /// 拖动结束后把当前玻璃强度落盘。
  Future<void> persistGlassIntensity() async {
    await _config.setGlassIntensity(state.glassIntensity);
  }

  /// 设置对话框 / 面板背景覆盖。传 null 恢复跟随主题。
  Future<void> setSurfaceOverride(Color? color) async {
    state = color == null
        ? state.copyWith(clearSurfaceOverride: true)
        : state.copyWith(surfaceOverride: color);
    await _config.setSurfaceOverride(color?.toARGB32());
  }
}
