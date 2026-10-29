import 'package:flutter/material.dart';

import 'app_tokens.g.dart';

/// 用户的外观偏好 —— 「每个人的影子有自己的样子」。
///
/// 这是**用户配置**，不是设计数值：设计数值在 [AppTokens]（由仓根
/// `design-tokens.json` 生成），这里只存「这个用户选了什么」。
///
/// 三个槽位对应设置页的三个可调项：
///  - [accentSeed] —— 主题色。默认中性（影子本身无色）。
///  - [glassIntensity] —— 玻璃（半影层）强度，0 = 关闭，1 = 全强度。
///  - [surfaceOverride] —— 对话框/面板的背景覆盖；null = 跟随主题。
class ThemeAppearance {
  /// 当前生效的外观。
  ///
  /// 由 [GlassTheme.build] 在每次构建主题时更新。GlassCard 这类拿不到
  /// BuildContext / Riverpod 的组件靠它读玻璃强度 —— 与 [AppColors.applyAccent]
  /// 是同一套「全局跟随主题」的做法。
  static ThemeAppearance current = const ThemeAppearance();

  /// 主题色种子。默认中性灰。
  final Color accentSeed;

  /// 玻璃强度。0 = 不用玻璃（纯实心），1 = 全强度。
  final double glassIntensity;

  /// 对话框 / 浮层的背景覆盖。null = 跟随当前主题的表面色。
  final Color? surfaceOverride;

  const ThemeAppearance({
    this.accentSeed = AppTokens.accentSeed,
    this.glassIntensity = 1.0,
    this.surfaceOverride,
  });

  ThemeAppearance copyWith({
    Color? accentSeed,
    double? glassIntensity,
    Color? surfaceOverride,
    bool clearSurfaceOverride = false,
  }) {
    return ThemeAppearance(
      accentSeed: accentSeed ?? this.accentSeed,
      glassIntensity: glassIntensity ?? this.glassIntensity,
      surfaceOverride: clearSurfaceOverride
          ? null
          : (surfaceOverride ?? this.surfaceOverride),
    );
  }

  @override
  bool operator ==(Object other) {
    if (other is! ThemeAppearance) return false;
    return other.accentSeed == accentSeed &&
        other.glassIntensity == glassIntensity &&
        other.surfaceOverride == surfaceOverride;
  }

  @override
  int get hashCode =>
      Object.hash(accentSeed, glassIntensity, surfaceOverride);
}
