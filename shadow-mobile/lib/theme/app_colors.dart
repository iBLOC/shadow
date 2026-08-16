import 'package:flutter/material.dart';

class AppColors {
  // === Shadow 品牌色 (Deep Shadow 调色板) ===

  // Primary - 神秘淡紫
  static const Color primary = Color(0xFFA78BFA);
  static const Color primaryVariant = Color(0xFFC4B5FD);
  static const Color primaryGlow = Color(0x4DA78BFA); // 30% for glow effects

  // Secondary - 智能青
  static const Color secondary = Color(0xFF22D3EE);
  static const Color secondaryVariant = Color(0xFF67E8F9);
  static const Color secondaryGlow = Color(0x4D22D3EE);

  // === 暗色模式背景 ===
  static const Color darkBackground = Color(0xFF09090B); // 近黑 - OLED友好
  static const Color darkBackgroundAlt = Color(0xFF18181B); // 深灰 - 卡片背景
  static const Color darkSurface = Color(0xFF27272A); // 中灰 - 输入框
  static const Color darkSurfaceGlass = Color(0x4D27272A); // 30% 玻璃背景
  static const Color darkBorder = Color(0x1AFFFFFF); // 10% 白色边框
  static const Color darkBorderGlow = Color(0x4DA78BFA); // 30% 发光边框

  // === 亮色模式背景 ===
  static const Color lightBackground = Color(0xFFF4F4F5);
  static const Color lightBackgroundEnd = Color(0xFFE4E4E7);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceGlass = Color(0xB3FFFFFF); // 75% 白色玻璃
  static const Color lightBorder = Color(0x4D3B82F6); // 30% 蓝色边框
  static const Color lightBorderGlow = Color(0x4D3B82F6);

  // === 文本色 (暗色模式) ===
  static const Color darkTextPrimary = Color(0xFFFAFAFA);
  static const Color darkTextSecondary = Color(0xFFA1A1AA);
  static const Color darkTextMuted = Color(0xFF71717A);

  // === 文本色 (亮色模式) ===
  static const Color lightTextPrimary = Color(0xFF09090B);
  static const Color lightTextSecondary = Color(0xFF52525B);
  static const Color lightTextMuted = Color(0xFFA1A1AA);

  // === 状态色 ===
  static const Color success = Color(0xFF34D399);
  static const Color successLight = Color(0xFF6EE7B7);
  static const Color warning = Color(0xFFFBBF24);
  static const Color warningLight = Color(0xFFFCD34D);
  static const Color error = Color(0xFFF87171);
  static const Color errorLight = Color(0xFFFCA5A5);

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

  // === Neon Glow 效果辅助 ===
  static Color glowColor(Color baseColor, {double opacity = 0.3}) {
    return baseColor.withValues(alpha: opacity);
  }
}
