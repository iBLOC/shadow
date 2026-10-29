import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/theme_provider.dart';
import '../../theme/app_tokens.g.dart';
import '../../widgets/glass_card.dart';
import 'settings_row.dart';

/// 外观设置 —— 主题模式 / 主题色 / 玻璃强度 / 对话框背景。
///
/// 这是「每个用户有自己的影子」在产品上的落点：影子本身没有颜色，
/// 所以主题色是**用户挑的**，不是产品强加的。
///
/// 数值（可选色板）来自仓根 `design-tokens.json`，显示名走 l10n。
///
/// 它作为**外观组的内容**渲染（[AppearanceSectionBody]），
/// 而不是自己占一张卡 —— 原来它单独一张卡，和上面的「模型信息 + 明暗模式」
/// 割裂成两张，用户要来回扫。
class AppearanceSection extends ConsumerWidget {
  const AppearanceSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      padding: EdgeInsets.zero,
      child: const AppearanceSectionBody(),
    );
  }
}

/// 外观组的内容（不含外层玻璃卡）。
///
/// 拆出来是为了让设置页能把「外观」整组塞进一张卡里 ——
/// 主题模式行 + 主题色 + 玻璃强度 + 对话框背景。
class AppearanceSectionBody extends ConsumerWidget {
  const AppearanceSectionBody({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final appearance = ref.watch(themeAppearanceProvider);
    final notifier = ref.read(themeAppearanceProvider.notifier);
    final themeMode = ref.watch(themeModeProvider);
    final theme = ShadTheme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // 主题模式 —— 原来是一排 SegmentedButton 图标，这里换成 shadcn 的
        // 下拉：三态（浅/深/跟随系统）在窄屏上比三段按钮更好点。
        SettingsRow(
          title: l10n.theme,
          icon: Icons.brightness_6_outlined,
          trailing: SizedBox(
            width: 132,
            child: ShadSelect<ThemeMode>(
              initialValue: themeMode,
              selectedOptionBuilder: (context, value) =>
                  Text(_themeModeLabel(l10n, value)),
              options: [
                ShadOption(
                  value: ThemeMode.light,
                  child: Text(_themeModeLabel(l10n, ThemeMode.light)),
                ),
                ShadOption(
                  value: ThemeMode.dark,
                  child: Text(_themeModeLabel(l10n, ThemeMode.dark)),
                ),
                ShadOption(
                  value: ThemeMode.system,
                  child: Text(_themeModeLabel(l10n, ThemeMode.system)),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                ref.read(themeModeProvider.notifier).setThemeMode(value);
              },
            ),
          ),
        ),
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppTokens.spaceLg,
            AppTokens.spaceMd,
            AppTokens.spaceLg,
            AppTokens.spaceMd,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.settingsThemeColor,
                style: theme.textTheme.p.copyWith(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 2),
              Text(
                l10n.settingsThemeColorHint,
                style: theme.textTheme.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const SizedBox(height: AppTokens.spaceMd),
              Wrap(
                spacing: AppTokens.spaceMd,
                runSpacing: AppTokens.spaceMd,
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
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppTokens.spaceLg,
            vertical: AppTokens.spaceMd,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.settingsGlassIntensity,
                      style: theme.textTheme.p.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  Text(
                    appearance.glassIntensity <= 0.01
                        ? l10n.settingsGlassOff
                        : l10n.settingsGlassFull,
                    style: theme.textTheme.small.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppTokens.spaceSm),
              ShadSlider(
                initialValue: appearance.glassIntensity,
                onChanged: (v) => notifier.setGlassIntensity(v, persist: false),
                onChangeEnd: (_) => notifier.persistGlassIntensity(),
              ),
            ],
          ),
        ),
        const ShadSeparator.horizontal(
          margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
        ),
        SettingsRow(
          title: l10n.settingsDialogBackground,
          icon: Icons.layers_outlined,
          onTap: () => _pickSurface(context, ref),
          trailing: Icon(
            Icons.chevron_right,
            size: 18,
            color: theme.colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }

  static String _themeModeLabel(AppLocalizations l10n, ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return l10n.settingsThemeModeLight;
      case ThemeMode.dark:
        return l10n.settingsThemeModeDark;
      case ThemeMode.system:
        return l10n.settingsFollowTheme;
    }
  }

  Future<void> _pickSurface(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final theme = ShadTheme.of(context);
    final notifier = ref.read(themeAppearanceProvider.notifier);
    final current = ref.read(themeAppearanceProvider).surfaceOverride;

    // shadcn 的底部弹层（原来用 Material 的 showModalBottomSheet）
    final picked = await showShadSheet<Color?>(
      context: context,
      side: ShadSheetSide.bottom,
      builder: (sheetContext) {
        return ShadSheet(
          title: Text(l10n.settingsDialogBackground),
          description: Text(l10n.settingsDialogBackgroundDesc),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SettingsRow(
                title: l10n.settingsFollowTheme,
                trailing: current == null
                    ? Icon(
                        Icons.check,
                        size: 18,
                        color: theme.colorScheme.primary,
                      )
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(),
              ),
              for (final option in _surfaceOptions)
                SettingsRow(
                  title: _surfaceLabel(l10n, option.color),
                  trailing: current != null && _sameColor(current, option.color)
                      ? Icon(
                          Icons.check,
                          size: 18,
                          color: theme.colorScheme.primary,
                        )
                      : null,
                  onTap: () => Navigator.of(sheetContext).pop(option.color),
                ),
              const SizedBox(height: AppTokens.spaceMd),
              ShadButton.outline(
                width: double.infinity,
                child: Text(l10n.cancel),
                onPressed: () => Navigator.of(sheetContext).pop(),
              ),
            ],
          ),
        );
      },
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
    if (_sameColor(color, const Color(0xFF0A0A0B))) {
      return l10n.settingsSurfaceInk;
    }
    if (_sameColor(color, const Color(0xFF18181B))) {
      return l10n.settingsSurfaceDeep;
    }
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
    final theme = ShadTheme.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        onTap: onTap,
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
                      ? theme.colorScheme.primary
                      : Colors.transparent,
                  width: 2,
                ),
              ),
              child: selected
                  ? Icon(Icons.check, size: 20, color: bestForeground(color))
                  : null,
            ),
            const SizedBox(height: AppTokens.spaceXs),
            Text(
              label,
              style: theme.textTheme.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
