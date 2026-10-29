import 'dart:ui';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_tokens.g.dart';
import '../theme/theme_appearance.dart';

/// 半影层（glassmorphism）—— 影子的边缘是柔的，不是硬的。
///
/// 与桌面端 `.glass`（`shadow-desktop/src/index.css`）是同一套语义：
/// 模糊 + 半透明白 + 1px 边。数值全部来自仓根 `design-tokens.json`。
///
/// 玻璃强度由用户在设置页调整（[ThemeAppearance.glassIntensity]）：
/// 0 = 关掉玻璃（落回实心表面），1 = 全强度。
class GlassCard extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  /// 辉光边框。
  ///
  /// 语义提醒：辉光是**实时信号**（agent 在线 / 正在思考）用的，不是装饰 ——
  /// 满屏发光会让信号失去意义。
  final bool glow;

  const GlassCard({
    super.key,
    required this.child,
    this.borderRadius = AppTokens.radiusLg,
    this.padding,
    this.margin,
    this.onTap,
    this.glow = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final intensity = ThemeAppearance.current.glassIntensity;

    final baseGlass = isDark
        ? AppTokens.surfaceDarkGlass
        : AppTokens.surfaceLightGlass;
    final bgColor = _scaleAlpha(baseGlass, intensity);
    final borderColor =
        isDark ? AppTokens.borderDarkDefault : AppTokens.borderLightDefault;
    final glowBorderColor = AppColors.primaryGlow;
    final glowShadowColor = AppColors.primaryGlow;

    final sigma = AppTokens.glassBlur * intensity;

    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(borderRadius),
              child: AnimatedContainer(
                duration: AppTokens.durationNormal,
                curve: Curves.easeOut,
                decoration: BoxDecoration(
                  color: bgColor,
                  borderRadius: BorderRadius.circular(borderRadius),
                  border: Border.all(
                    color: glow ? glowBorderColor : borderColor,
                    width: glow ? 1.5 : AppTokens.glassBorderWidth,
                  ),
                  boxShadow: glow
                      ? [
                          BoxShadow(
                            color: glowShadowColor,
                            blurRadius: 20,
                            spreadRadius: -5,
                          ),
                        ]
                      : null,
                ),
                padding: padding ?? const EdgeInsets.all(16),
                // 玻璃层自带背景色，而 Material 组件（ListTile / InkWell …）
                // 把自己的水波纹画在**最近的 Material 祖先**上 —— 那在外层，
                // 会被这层背景盖住，点击看不到反馈。
                //
                // Flutter 3.47 起在 debug 模式下会对此直接断言报错
                // （"ListTile background color or ink splashes may be invisible"）。
                // 给 child 套一层自己的透明 Material，水波纹就画在玻璃**上面**，
                // 背景透过来，玻璃感不变。
                child: Material(
                  type: MaterialType.transparency,
                  child: child,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// 按玻璃强度缩放半透明色的 alpha。
  ///
  /// 强度 0 时落回**不透明**的表面色 —— 玻璃关了应该是实心的，不是透明的。
  static Color _scaleAlpha(Color color, double intensity) {
    final k = intensity.clamp(0.0, 1.0);
    if (k >= 1.0) return color;
    return Color.from(
      alpha: color.a * k + (1 - k),
      red: color.r,
      green: color.g,
      blue: color.b,
    );
  }
}
