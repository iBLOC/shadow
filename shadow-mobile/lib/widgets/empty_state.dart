import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'glass_button.dart';

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? description;
  final String? buttonLabel;
  final VoidCallback? onButtonPressed;
  final bool useShadowGlow; // Shadow 品牌发光效果

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.description,
    this.buttonLabel,
    this.onButtonPressed,
    this.useShadowGlow = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark
        ? AppColors.darkTextSecondary
        : AppColors.lightTextSecondary;
    final iconGlowColor = isDark
        ? AppColors.primaryGlow
        : AppColors.lightBorderGlow;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Shadow-themed icon with glow effect
            Container(
              padding: const EdgeInsets.all(24),
              decoration: useShadowGlow
                  ? BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: iconGlowColor,
                          blurRadius: 30,
                          spreadRadius: 5,
                        ),
                      ],
                    )
                  : null,
              child: Icon(
                icon,
                size: 64,
                color: textColor.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(color: textColor),
              textAlign: TextAlign.center,
            ),
            if (description != null) ...[
              const SizedBox(height: 8),
              Text(
                description!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: isDark
                      ? AppColors.darkTextMuted
                      : AppColors.lightTextMuted,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (buttonLabel != null && onButtonPressed != null) ...[
              const SizedBox(height: 24),
              GlassButton(
                label: buttonLabel!,
                icon: Icons.add,
                onPressed: onButtonPressed,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
