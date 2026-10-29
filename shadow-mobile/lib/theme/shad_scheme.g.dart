// ============================================================
// Shadow × shadcn 主题适配 —— 由 scripts/gen_tokens.mjs 生成
// 请勿手改。改 design-tokens.json 后重新运行：
//     node scripts/gen_tokens.mjs
//
// 桌面端是真 shadcn（Radix + CVA），移动端用 Flutter ShadcnUI。
// 两端共用同一份 design-tokens.json，所以这里是**投影**而不是第二套真相源 ——
// 下面每一项都对应 tokens.css 里的同名 shadcn 语义变量。
// ============================================================

import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import 'app_tokens.g.dart';

/// design-tokens.json → shadcn [ShadColorScheme] 的投影。
///
/// 主题色是**运行时可变**的（用户可覆盖的槽位），所以这里接 seed，
/// 不直接用 AppTokens 的常量 —— 用户换色后整个 App 跟着变。
class ShadScheme {
  ShadScheme._();

  /// 按当前亮度 + 当前主题色 seed 构造色板。
  static ShadColorScheme of({
    required Brightness brightness,
    required Color accentSeed,
  }) {
    final tones = deriveAccentTones(accentSeed);
    final soft = accentSeed.withValues(alpha: 0.12);
    return brightness == Brightness.dark
        ? _dark(
            primary: tones.darkTone,
            primaryForeground: tones.darkToneFg,
            soft: soft,
          )
        : _light(
            primary: tones.lightTone,
            primaryForeground: tones.lightToneFg,
            soft: soft,
          );
  }

  static ShadColorScheme _dark({
    required Color primary,
    required Color primaryForeground,
    required Color soft,
  }) {
    return ShadColorScheme(
      background: AppTokens.surfaceDarkBase,
      foreground: AppTokens.textDarkPrimary,
      card: AppTokens.surfaceDarkRaised,
      cardForeground: AppTokens.textDarkPrimary,
      popover: AppTokens.surfaceDarkRaised,
      popoverForeground: AppTokens.textDarkPrimary,
      primary: primary,
      primaryForeground: primaryForeground,
      secondary: AppTokens.surfaceDarkOverlay,
      secondaryForeground: AppTokens.textDarkPrimary,
      muted: AppTokens.surfaceDarkOverlay,
      mutedForeground: AppTokens.textDarkSecondary,
      accent: AppTokens.surfaceDarkOverlay,
      accentForeground: AppTokens.textDarkPrimary,
      destructive: AppTokens.statusError,
      destructiveForeground: bestForeground(AppTokens.statusError),
      border: AppTokens.borderDarkDefault,
      input: AppTokens.borderDarkDefault,
      ring: AppTokens.borderDarkFocus,
      selection: soft,
    );
  }
  static ShadColorScheme _light({
    required Color primary,
    required Color primaryForeground,
    required Color soft,
  }) {
    return ShadColorScheme(
      background: AppTokens.surfaceLightBase,
      foreground: AppTokens.textLightPrimary,
      card: AppTokens.surfaceLightRaised,
      cardForeground: AppTokens.textLightPrimary,
      popover: AppTokens.surfaceLightBase,
      popoverForeground: AppTokens.textLightPrimary,
      primary: primary,
      primaryForeground: primaryForeground,
      secondary: AppTokens.surfaceLightOverlay,
      secondaryForeground: AppTokens.textLightPrimary,
      muted: AppTokens.surfaceLightOverlay,
      mutedForeground: AppTokens.textLightSecondary,
      accent: AppTokens.surfaceLightOverlay,
      accentForeground: AppTokens.textLightPrimary,
      destructive: AppTokens.statusError,
      destructiveForeground: bestForeground(AppTokens.statusError),
      border: AppTokens.borderLightDefault,
      input: AppTokens.borderLightDefault,
      ring: AppTokens.borderLightFocus,
      selection: soft,
    );
  }
}
