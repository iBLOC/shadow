import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../generated/l10n/app_localizations.dart';
import '../providers/theme_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_tokens.g.dart';
import 'glass_card.dart';

/// 外观设置 —— 主题色 / 玻璃强度 / 对话框背景。
///
/// 这是「每个用户有自己的影子」在产品上的落点：影子本身没有颜色，
/// 所以主题色是**用户挑的**，不是产品强加的。
///
/// 数值（可选色板）来自仓根 `design-tokens.json`，显示名走 l10n。
class AppearanceSection extends ConsumerWidget {
  const AppearanceSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final appearance = ref.watch(themeAppearanceProvider);
    final notifier = ref.read(themeAppearanceProvider.notifier);

    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            leading: Icon(Icons.palette_outlined, color: AppColors.primary),
            title: Text(l10n.settingsAppearance),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.settingsThemeColor,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  l10n.settingsThemeColorHint,
                  style: TextStyle(
                    fontSize: AppTokens.fontSizeXs,
                    color: AppColors.darkTextSecondary,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final preset in AppTokens.accentPresets)
                      _AccentSwatch(
                        color: preset.color,
                        label: _accentLabel(l10n, preset.id),
                        selected: _sameColor(preset.color, appearance.accentSeed),
                        onTap: () => notifier.setAccentColor(preset.color),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          ListTile(
            title: Text(l10n.settingsGlassIntensity),
            subtitle: Slider(
              value: appearance.glassIntensity,
              onChanged: (v) => notifier.setGlassIntensity(v, persist: false),
              onChangeEnd: (_) => notifier.persistGlassIntensity(),
            ),
            trailing: Text(
              appearance.glassIntensity <= 0.01
                  ? l10n.settingsGlassOff
                  : l10n.settingsGlassFull,
              style: TextStyle(
                fontSize: AppTokens.fontSizeXs,
                color: AppColors.darkTextSecondary,
              ),
            ),
          ),
          const Divider(height: 1),
          ListTile(
            title: Text(l10n.settingsDialogBackground),
            subtitle: Text(_surfaceLabel(l10n, appearance.surfaceOverride)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickSurface(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _pickSurface(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final notifier = ref.read(themeAppearanceProvider.notifier);
    final current = ref.read(themeAppearanceProvider).surfaceOverride;

    final picked = await showModalBottomSheet<Color?>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => GlassCard(
        margin: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.settingsDialogBackground,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            _SurfaceOption(
              label: l10n.settingsFollowTheme,
              selected: current == null,
              onTap: () => Navigator.of(sheetContext).pop(),
            ),
            for (final option in _surfaceOptions)
              _SurfaceOption(
                label: _surfaceLabel(l10n, option.color),
                selected: current != null && _sameColor(current, option.color),
                onTap: () => Navigator.of(sheetContext).pop(option.color),
              ),
          ],
        ),
      ),
    );

    if (picked == null && current == null) return;
    await notifier.setSurfaceOverride(picked);
  }

  /// 对话框背景的可选值。null = 跟随主题。
  static const List<({String id, Color color})> _surfaceOptions = [
    (id: 'ink', color: Color(0xFF0A0A0B)),
    (id: 'deep', color: Color(0xFF18181B)),
    (id: 'neutral', color: Color(0xFFF4F4F5)),
    (id: 'light', color: Color(0xFFFFFFFF)),
  ];

  static String _surfaceLabel(AppLocalizations l10n, Color? color) {
    if (color == null) return l10n.settingsFollowTheme;
    if (_sameColor(color, const Color(0xFF0A0A0B))) return l10n.settingsSurfaceInk;
    if (_sameColor(color, const Color(0xFF18181B))) return l10n.settingsSurfaceDeep;
    if (_sameColor(color, const Color(0xFFF4F4F5))) {
      return l10n.settingsSurfaceNeutral;
    }
    return l10n.settingsSurfaceLight;
  }

  static String _accentLabel(AppLocalizations l10n, String id) {
    switch (id) {
      case 'slate':
        return l10n.appearanceAccentSlate;
      case 'indigo':
        return l10n.appearanceAccentIndigo;
      case 'cyan':
        return l10n.appearanceAccentCyan;
      case 'emerald':
        return l10n.appearanceAccentEmerald;
      case 'amber':
        return l10n.appearanceAccentAmber;
      case 'rose':
        return l10n.appearanceAccentRose;
      default:
        return l10n.appearanceAccentNeutral;
    }
  }

  static bool _sameColor(Color a, Color b) => a.toARGB32() == b.toARGB32();
}

class _AccentSwatch extends StatelessWidget {
  final Color color;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _AccentSwatch({
    required this.color,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTokens.radius['pill']!),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected
                        ? Theme.of(context).colorScheme.primary
                        : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: selected
                    ? Icon(
                        Icons.check,
                        size: 20,
                        color: bestForeground(color),
                      )
                    : null,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: AppTokens.fontSizeXs,
                  color: AppColors.darkTextSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SurfaceOption extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _SurfaceOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      title: Text(label),
      trailing: selected ? const Icon(Icons.check, size: 18) : null,
      onTap: onTap,
    );
  }
}
