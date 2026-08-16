import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GlassCard extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool glow; // Neon Glow 效果开关

  const GlassCard({
    super.key,
    required this.child,
    this.borderRadius = 16,
    this.padding,
    this.margin,
    this.onTap,
    this.glow = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final bgColor = isDark
        ? AppColors.darkSurfaceGlass
        : AppColors.lightSurfaceGlass;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final glowBorderColor = isDark
        ? AppColors.darkBorderGlow
        : AppColors.lightBorderGlow;
    final glowShadowColor = isDark
        ? AppColors.primaryGlow
        : AppColors.lightBorderGlow;

    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(borderRadius),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                decoration: BoxDecoration(
                  color: bgColor,
                  borderRadius: BorderRadius.circular(borderRadius),
                  border: Border.all(
                    color: glow ? glowBorderColor : borderColor,
                    width: glow ? 1.5 : 1,
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
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
