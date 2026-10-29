import 'package:flutter/material.dart';

import 'app_tokens.g.dart';

/// Shadow 的色板。
///
/// **数值全部来自仓根 `design-tokens.json`**（经 `scripts/gen_tokens.mjs`
/// 生成本目录的 `app_tokens.g.dart`）。这里不写任何色值。
///
/// 设计语言（Umbra）：
///  - 影子本身没有颜色 —— 它是光的缺失。所以**基底是中性黑白灰**。
///  - **主题色是用户可覆盖的槽位**，不是产品强加的品牌色。个人助理的
///    影子有自己的色温。
///  - 主题色相关的常量是**可变的**：用户换色后由 [applyAccent] 统一改写，
///    整个 App 跟着变（这是「一个用户一个影子」的具体落点）。
class AppColors {
  AppColors._();

  // ── 主题色（可变）─────────────────────────────────────────
  // 用户没换色时是中性灰 —— 影子本来就是无色的。

  static Color _primary = AppTokens.accentSeed;
  static Color _primaryVariant = _lighten(AppTokens.accentSeed, 0.18);
  static Color _primaryGlow = AppTokens.accentSoft;

  static Color _secondary = _shift(AppTokens.accentSeed, lightness: -0.12, saturation: 0.05);
  static Color _secondaryVariant = _lighten(AppTokens.accentSeed, 0.10);
  static Color _secondaryGlow = AppTokens.accentSoft;

  /// 主题色本身（seed）。
  static Color get primary => _primary;

  /// 主题色的浅一档变体。
  static Color get primaryVariant => _primaryVariant;

  /// 主题色的低透明度版本 —— 用于光晕/边框辉光。
  ///
  /// 注意语义：辉光是**实时信号**（agent 在线 / 正在思考）用的，不是装饰。
  static Color get primaryGlow => _primaryGlow;

  /// 次级色 —— 与主题色同色相、更暗一档。
  static Color get secondary => _secondary;

  static Color get secondaryVariant => _secondaryVariant;

  static Color get secondaryGlow => _secondaryGlow;

  /// 用户换色时由 [ThemeSettingsNotifier] 调用，把主题色写进全局。
  ///
  /// 放在这里而不是各屏幕里，是为了让 63 处 `AppColors.primary` 的
  /// 既有引用无需逐个改造就能跟着主题走。
  static void applyAccent(Color seed) {
    _primary = seed;
    _primaryVariant = _lighten(seed, 0.18);
    _primaryGlow = seed.withValues(alpha: 0.30);
    _secondary = _shift(seed, lightness: -0.12, saturation: 0.05);
    _secondaryVariant = _lighten(seed, 0.10);
    _secondaryGlow = seed.withValues(alpha: 0.30);
  }

  // ── 暗色模式表面（影子的底）────────────────────────────────

  static const Color darkBackground = AppTokens.surfaceDarkBase;
  static const Color darkBackgroundAlt = AppTokens.surfaceDarkRaised;
  static const Color darkSurface = AppTokens.surfaceDarkOverlay;
  static const Color darkSurfaceGlass = AppTokens.surfaceDarkGlass;
  static const Color darkBorder = AppTokens.borderDarkDefault;
  static const Color darkBorderGlow = AppTokens.accentRing;

  // ── 亮色模式表面 ───────────────────────────────────────────

  static const Color lightBackground = AppTokens.surfaceLightBase;
  static const Color lightBackgroundEnd = AppTokens.surfaceLightOverlay;
  static const Color lightSurface = AppTokens.surfaceLightRaised;
  static const Color lightSurfaceGlass = AppTokens.surfaceLightGlass;
  static const Color lightBorder = AppTokens.borderLightDefault;
  static const Color lightBorderGlow = AppTokens.accentRing;

  // ── 文本 ───────────────────────────────────────────────────

  static const Color darkTextPrimary = AppTokens.textDarkPrimary;
  static const Color darkTextSecondary = AppTokens.textDarkSecondary;
  static const Color darkTextMuted = AppTokens.textDarkMuted;

  static const Color lightTextPrimary = AppTokens.textLightPrimary;
  static const Color lightTextSecondary = AppTokens.textLightSecondary;
  static const Color lightTextMuted = AppTokens.textLightMuted;

  // ── 状态色 ─────────────────────────────────────────────────

  static const Color success = AppTokens.statusSuccess;
  static const Color successLight = AppTokens.statusSuccessLight;
  static const Color warning = AppTokens.statusWarning;
  static const Color warningLight = AppTokens.statusWarningLight;
  static const Color error = AppTokens.statusError;
  static const Color errorLight = AppTokens.statusErrorLight;

  // === 渐变 ===

  static LinearGradient get darkGradient => const LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [darkBackground, darkBackgroundAlt],
  );

  static LinearGradient get lightGradient => const LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [lightBackground, lightBackgroundEnd],
  );

  /// 辉光色 —— [baseColor] 的低透明度版本。
  static Color glowColor(Color baseColor, {double opacity = 0.3}) {
    return baseColor.withValues(alpha: opacity);
  }

  // === 内部工具 ===

  static Color _lighten(Color color, double delta) {
    final hsl = HSLColor.fromColor(color);
    return hsl
        .withLightness((hsl.lightness + delta).clamp(0.0, 1.0))
        .toColor();
  }

  static Color _shift(
    Color color, {
    required double lightness,
    double saturation = 0,
  }) {
    final hsl = HSLColor.fromColor(color);
    return hsl
        .withLightness((hsl.lightness + lightness).clamp(0.0, 1.0))
        .withSaturation((hsl.saturation + saturation).clamp(0.0, 1.0))
        .toColor();
  }
}
