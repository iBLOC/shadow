import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_tokens.g.dart';
import 'theme_appearance.dart';

/// 主题构建 —— **数值**来自 token，**用户偏好**来自 [ThemeAppearance]。
///
/// 与桌面端 `src/styles/tokens.css` 是同一套数值（都出自仓根
/// `design-tokens.json`），语义也一一对应：
///
/// | 语义     | 桌面端                    | 移动端                    |
/// |----------|---------------------------|---------------------------|
/// | 半影层   | `.glass`                  | `GlassCard`               |
/// | 玻璃底色 | `--glass-surface`         | `surfaceDark/LightGlass`  |
/// | 玻璃边框 | `--glass-border`          | `borderDark/LightDefault` |
/// | 主题色   | `--shadow-accent`         | `accentSeed`              |
/// | 反色主色 | `--primary`               | `ColorScheme.primary`     |
class GlassTheme {
  const GlassTheme._();

  /// 按当前外观偏好构建指定亮度的 [ThemeData]。
  static ThemeData build(
    ThemeAppearance appearance,
    Brightness brightness,
  ) {
    final isDark = brightness == Brightness.dark;

    // 让全局状态跟着当前外观走（AppColors 的主题色、GlassCard 的玻璃强度）。
    ThemeAppearance.current = appearance;

    // 主题色的两端色调由同一套算法派生（与桌面端 accent.g.ts 一致）。
    final tones = deriveAccentTones(appearance.accentSeed);

    // 让全局色板跟着用户的主题色走 —— AppColors.primary 等 63 处引用的
    // 来源。放在这里而不是各个 setter 里，保证「看到的颜色」永远等于
    // 「当前主题色」。
    AppColors.applyAccent(appearance.accentSeed);

    final seed = appearance.accentSeed;
    final primary = isDark ? tones.darkTone : tones.lightTone;
    final onPrimary = isDark ? tones.darkToneFg : tones.lightToneFg;

    final surface = appearance.surfaceOverride ??
        (isDark ? AppTokens.surfaceDarkRaised : AppTokens.surfaceLightRaised);
    final glassSurface = _scaleAlpha(
      isDark ? AppTokens.surfaceDarkGlass : AppTokens.surfaceLightGlass,
      appearance.glassIntensity,
    );
    final border =
        isDark ? AppTokens.borderDarkDefault : AppTokens.borderLightDefault;
    final textPrimary =
        isDark ? AppTokens.textDarkPrimary : AppTokens.textLightPrimary;
    final textSecondary =
        isDark ? AppTokens.textDarkSecondary : AppTokens.textLightSecondary;
    final textMuted =
        isDark ? AppTokens.textDarkMuted : AppTokens.textLightMuted;
    final radiusLg = AppTokens.radiusLg;
    final radiusSm = AppTokens.radiusSm;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: primary,
        onPrimary: onPrimary,
        secondary: seed,
        onSecondary: tones.fg,
        surface: surface,
        onSurface: textPrimary,
        error: AppTokens.statusError,
        onError: bestForeground(AppTokens.statusError),
      ),
      scaffoldBackgroundColor: Colors.transparent,
      dividerColor: border,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: AppTokens.fontSizeLg,
          fontWeight: FontWeight.w500,
        ),
        iconTheme: IconThemeData(color: textPrimary),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          side: BorderSide(color: border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          side: BorderSide(color: border),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppTokens.radiusXl),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: glassSurface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: BorderSide(color: primary, width: 2),
        ),
        hintStyle: TextStyle(color: textSecondary),
        labelStyle: TextStyle(color: textMuted),
      ),
      textTheme: TextTheme(
        displayLarge: TextStyle(
          color: textPrimary,
          fontSize: AppTokens.fontSizeX2xl,
          fontWeight: FontWeight.bold,
        ),
        headlineMedium: TextStyle(
          color: textPrimary,
          fontSize: AppTokens.fontSizeXl,
          fontWeight: FontWeight.w600,
        ),
        titleLarge: TextStyle(
          color: textPrimary,
          fontSize: AppTokens.fontSizeLg,
          fontWeight: FontWeight.w500,
        ),
        bodyLarge: TextStyle(color: textPrimary, fontSize: AppTokens.fontSizeBase),
        bodyMedium: TextStyle(color: textPrimary, fontSize: AppTokens.fontSizeSm),
        bodySmall: TextStyle(color: textSecondary, fontSize: AppTokens.fontSizeXs),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: glassSurface,
        indicatorColor: seed.withValues(alpha: 0.16),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return TextStyle(
              color: primary,
              fontSize: AppTokens.fontSizeXs,
              fontWeight: FontWeight.w600,
            );
          }
          return TextStyle(
            color: textSecondary,
            fontSize: AppTokens.fontSizeXs,
          );
        }),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: primary,
        foregroundColor: onPrimary,
      ),
    );
  }

  /// 按玻璃强度缩放一个带 alpha 的颜色的 alpha 通道。
  ///
  /// 强度 0 → 完全不透明实心（等于关掉玻璃）；1 → token 原值。
  static Color _scaleAlpha(Color color, double intensity) {
    final k = intensity.clamp(0.0, 1.0);
    if (k >= 1.0) return color;
    // 玻璃底色本身是半透明白；关掉玻璃时应该落回实心表面色而不是全透明。
    if (color.a < 1.0) {
      return Color.from(
        alpha: color.a * k + (1 - k),
        red: color.r,
        green: color.g,
        blue: color.b,
      );
    }
    return color;
  }
}
