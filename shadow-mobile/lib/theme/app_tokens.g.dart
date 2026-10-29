// ============================================================
// Shadow design tokens —— 由 scripts/gen_tokens.mjs 生成
// 请勿手改。改 design-tokens.json 后重新运行：
//     node scripts/gen_tokens.mjs
// ============================================================

import 'package:flutter/material.dart';

/// 设计数值的唯一真相源（由仓根 design-tokens.json 生成）。
///
/// 命名约定：`surface` / `text` / `border` / `status` 是模式无关的语义分组，
/// 模式相关的前缀用 `dark` / `light` 标明。
class AppTokens {
  const AppTokens._();

  // ── 表面（影子的底）──
  static const Color surfaceDarkBase = Color(0xFF0A0A0B);
  static const Color surfaceDarkRaised = Color(0xFF111113);
  static const Color surfaceDarkOverlay = Color(0xFF18181B);
  static const Color surfaceDarkSunken = Color(0xFF050506);
  static const Color surfaceDarkGlass = Color(0x14FFFFFF);
  static const Color surfaceLightBase = Color(0xFFFFFFFF);
  static const Color surfaceLightRaised = Color(0xFFFAFAFA);
  static const Color surfaceLightOverlay = Color(0xFFF4F4F5);
  static const Color surfaceLightSunken = Color(0xFFF4F4F5);
  static const Color surfaceLightGlass = Color(0xB3FFFFFF);
  static const Color surfaceLight0 = Color(0xFF000000);
  static const Color surfaceLight1 = Color(0xFF000000);
  static const Color surfaceLight2 = Color(0xFF000000);
  static const Color surfaceLight3 = Color(0xFF000000);

  // ── 文本 ──
  static const Color textDarkPrimary = Color(0xFFFAFAFA);
  static const Color textDarkSecondary = Color(0xFFA1A1AA);
  static const Color textDarkMuted = Color(0xFF71717A);
  static const Color textDarkInverse = Color(0xFF09090B);
  static const Color textLightPrimary = Color(0xFF09090B);
  static const Color textLightSecondary = Color(0xFF52525B);
  static const Color textLightMuted = Color(0xFFA1A1AA);
  static const Color textLightInverse = Color(0xFFFAFAFA);

  // ── 边框 ──
  static const Color borderDarkSubtle = Color(0x14FFFFFF);
  static const Color borderDarkDefault = Color(0x1FFFFFFF);
  static const Color borderDarkStrong = Color(0x2EFFFFFF);
  static const Color borderDarkFocus = Color(0xFFA1A1AA);
  static const Color borderLightSubtle = Color(0xFFF4F4F5);
  static const Color borderLightDefault = Color(0xFFE4E4E7);
  static const Color borderLightStrong = Color(0xFFD4D4D8);
  static const Color borderLightFocus = Color(0xFF71717A);

  // ── 主题色槽位（用户可覆盖）──
  static const Color accentSeed = Color(0xFF71717A);
  static const Color accentDarkTone = Color(0xFFF7F7F8);
  static const Color accentLightTone = Color(0xFF0D0D0F);
  static const Color accentDarkToneFg = Color(0xFF09090B);
  static const Color accentLightToneFg = Color(0xFFFFFFFF);
  static const Color accentFg = Color(0xFFFFFFFF);
  static const Color accentSoft = Color(0x1F71717A);
  static const Color accentRing = Color(0x6671717A);

  // ── 状态色 ──
  static const Color statusSuccess = Color(0xFF34D399);
  static const Color statusSuccessLight = Color(0xFF6EE7B7);
  static const Color statusSuccessSoft = Color(0x1F34D399);
  static const Color statusWarning = Color(0xFFFBBF24);
  static const Color statusWarningLight = Color(0xFFFCD34D);
  static const Color statusWarningSoft = Color(0x1FFBBF24);
  static const Color statusError = Color(0xFFF87171);
  static const Color statusErrorLight = Color(0xFFFCA5A5);
  static const Color statusErrorSoft = Color(0x1FF87171);
  static const Color statusInfo = Color(0xFF38BDF8);
  static const Color statusInfoLight = Color(0xFF7DD3FC);
  static const Color statusInfoSoft = Color(0x1F38BDF8);

  // ── logo 的影色（光走 accent 槽位）──
  static const Color logoInkLight = Color(0xFF09090B);
  static const Color logoInkDark = Color(0xFF52525B);
  static const Color logoTile = Color(0xFFF4F4F5);

  // ── 玻璃（半影层）──
  static const double glassBlur = 20;
  static const double glassSaturation = 140;
  static const double glassBorderWidth = 1;

  // ── 间距 / 圆角 / 字号 / 时长 ──
  // 单独导出常量：Map 取值不能当默认参数值（const 上下文要求编译期常量），
  // 而 radius/space 这些正是要当默认值用的。
  static const double spaceNone = 0;
  static const double spaceXs = 4;
  static const double spaceSm = 8;
  static const double spaceMd = 12;
  static const double spaceLg = 16;
  static const double spaceXl = 24;
  static const double spaceX2xl = 32;
  static const double radiusXs = 4;
  static const double radiusSm = 8;
  static const double radiusMd = 12;
  static const double radiusLg = 16;
  static const double radiusXl = 24;
  static const double radiusPill = 9999;
  static const double fontSizeXs = 12;
  static const double fontSizeSm = 14;
  static const double fontSizeBase = 16;
  static const double fontSizeLg = 20;
  static const double fontSizeXl = 24;
  static const double fontSizeX2xl = 32;
  static const Duration durationFast = Duration(milliseconds: 100);
  static const Duration durationNormal = Duration(milliseconds: 200);
  static const Duration durationSlow = Duration(milliseconds: 300);

  static const Map<String, double> space = {
    'none': 0,
    'xs': 4,
    'sm': 8,
    'md': 12,
    'lg': 16,
    'xl': 24,
    '2xl': 32,
  };

  static const Map<String, double> radius = {
    'xs': 4,
    'sm': 8,
    'md': 12,
    'lg': 16,
    'xl': 24,
    'pill': 9999,
  };

  static const Map<String, double> fontSize = {
    'xs': 12,
    'sm': 14,
    'base': 16,
    'lg': 20,
    'xl': 24,
    '2xl': 32,
  };

  static const Map<String, Duration> duration = {
    'fast': Duration(milliseconds: 100),
    'normal': Duration(milliseconds: 200),
    'slow': Duration(milliseconds: 300),
  };

  /// 用户可选主题色预设（与 design-tokens.json 的 color.accent.userSelectable 一一对应）
  /// 显示名走 l10n（appearanceAccent*），不在设计源里写死。
  static const List<({String id, Color color})> accentPresets = [
    (id: 'neutral', color: Color(0xFF71717A)),
    (id: 'slate', color: Color(0xFF64748B)),
    (id: 'indigo', color: Color(0xFF6366F1)),
    (id: 'cyan', color: Color(0xFF22D3EE)),
    (id: 'emerald', color: Color(0xFF10B981)),
    (id: 'amber', color: Color(0xFFF59E0B)),
    (id: 'rose', color: Color(0xFFF43F5E)),
  ];

  /// 对话框 / 面板背景的可选值。null = 跟随主题。
  static const List<({String id, Color color})> surfaceOverrides = [
    (id: 'ink', color: Color(0xFF0A0A0B)),
    (id: 'deep', color: Color(0xFF18181B)),
    (id: 'neutral', color: Color(0xFFF4F4F5)),
    (id: 'light', color: Color(0xFFFFFFFF)),
  ];
}

/// 主题色派生 —— 与桌面端 accent.g.ts 同一套规则。
///
/// 影子没有颜色，所以默认 seed 是中性色；对中性色走「反色」——
/// 暗色模式上是光（近白），亮色模式上是影（近黑）。
/// 用户选了有彩色的 seed 时，暗色模式用亮色调（L=0.80），亮色模式用暗色调（L=0.42），
/// 前景色按 WCAG 对比度在近白/近黑里挑，不是写死。
({
  Color darkTone,
  Color lightTone,
  Color darkToneFg,
  Color lightToneFg,
  Color fg,
}) deriveAccentTones(Color seed) {
  final hsl = HSLColor.fromColor(seed);
  final achromatic = hsl.saturation < 0.04;
  final sat = hsl.saturation.clamp(0.0, 0.75).toDouble();

  final darkTone = achromatic
      ? HSLColor.fromAHSL(seed.a, hsl.hue, hsl.saturation, 0.97).toColor()
      : HSLColor.fromAHSL(seed.a, hsl.hue, sat, 0.80).toColor();
  final lightTone = achromatic
      ? HSLColor.fromAHSL(seed.a, hsl.hue, hsl.saturation, 0.055).toColor()
      : HSLColor.fromAHSL(seed.a, hsl.hue, sat, 0.42).toColor();

  return (
    darkTone: darkTone,
    lightTone: lightTone,
    darkToneFg: bestForeground(darkTone),
    lightToneFg: bestForeground(lightTone),
    fg: bestForeground(seed),
  );
}

/// 在近白 / 近黑里挑对比度更高者做前景色（WCAG 2.1）。
Color bestForeground(Color bg) {
  const white = Color(0xFFFFFFFF);
  const black = Color(0xFF09090B);
  double ratio(double a, double b) {
    final hi = a > b ? a : b;
    final lo = a > b ? b : a;
    return (hi + 0.05) / (lo + 0.05);
  }

  final l = bg.computeLuminance();
  return ratio(l, white.computeLuminance()) >=
          ratio(l, black.computeLuminance())
      ? white
      : black;
}
