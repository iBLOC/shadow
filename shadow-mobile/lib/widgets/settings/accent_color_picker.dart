import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../theme/app_tokens.g.dart';

/// 「#RGB / #RRGGBB / #RRGGBBAA（取前 6 位）」→ [Color]；认不得返回 null。
///
/// 「任意色号」是用户点名要的能力 —— 输入解析独立成函数，
/// 测试钉在这里，不藏在 UI 里。alpha 被丢掉：主题色槽位不吃透明度。
Color? parseHexColor(String input) {
  var raw = input.trim();
  if (raw.startsWith('#')) raw = raw.substring(1);
  String hex;
  if (RegExp(r'^[0-9a-fA-F]{3}$').hasMatch(raw)) {
    hex = raw.split('').map((c) => '$c$c').join();
  } else if (RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(raw)) {
    hex = raw;
  } else if (RegExp(r'^[0-9a-fA-F]{8}$').hasMatch(raw)) {
    hex = raw.substring(0, 6);
  } else {
    return null;
  }
  return Color(int.parse('FF$hex', radix: 16));
}

/// 主题色自定义选择器：hex 直填 + 色相/饱和/明度三条滑杆 + 实时预览。
///
/// 预设色板是快捷方式，这个选择器才是「任意色号」的正门 ——
/// 与桌面端的系统取色器 + hex 直填同语义。
class AccentColorPicker extends StatefulWidget {
  final Color initial;

  const AccentColorPicker({super.key, required this.initial});

  @override
  State<AccentColorPicker> createState() => _AccentColorPickerState();
}

class _AccentColorPickerState extends State<AccentColorPicker> {
  late Color _color = widget.initial;
  late final TextEditingController _hexCtrl = TextEditingController(
    text: _toHex6(_color),
  );
  final FocusNode _hexFocus = FocusNode();

  static String _toHex6(Color c) {
    final v = c.toARGB32() & 0xFFFFFF;
    return '#${v.toRadixString(16).toUpperCase().padLeft(6, '0')}';
  }

  @override
  void dispose() {
    _hexCtrl.dispose();
    _hexFocus.dispose();
    super.dispose();
  }

  void _commitHex(String text) {
    final parsed = parseHexColor(text);
    if (parsed == null) return; // 输入到一半不算错，也不乱跳
    setState(() => _color = parsed);
  }

  void _setHsl(HSLColor hsl) {
    setState(() {
      _color = hsl.toColor();
      // 滑杆改的色也回写 hex 框 —— 两个入口说的是同一个色。
      // 用户正在 hex 框里打字时不动它（不打断输入）。
      if (!_hexFocus.hasFocus) {
        _hexCtrl.text = _toHex6(_color);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    final l10n = AppLocalizations.of(context)!;
    final hsl = HSLColor.fromColor(_color);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: _color,
                shape: BoxShape.circle,
                border: Border.all(color: theme.colorScheme.border),
              ),
            ),
            const SizedBox(width: AppTokens.spaceMd),
            Expanded(
              child: Text(
                _toHex6(_color),
                style: theme.textTheme.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTokens.spaceMd),
        ShadInput(
          controller: _hexCtrl,
          focusNode: _hexFocus,
          placeholder: const Text('#RRGGBB'),
          onChanged: _commitHex,
        ),
        const SizedBox(height: AppTokens.spaceMd),
        _LabeledSlider(
          label: l10n.settingsAccentHue,
          value: hsl.hue,
          min: 0,
          max: 360,
          divisions: 360,
          onChanged: (v) => _setHsl(hsl.withHue(v)),
        ),
        _LabeledSlider(
          label: l10n.settingsAccentSat,
          value: hsl.saturation,
          min: 0,
          max: 1,
          onChanged: (v) => _setHsl(hsl.withSaturation(v)),
        ),
        _LabeledSlider(
          label: l10n.settingsAccentLight,
          value: hsl.lightness,
          min: 0,
          max: 1,
          onChanged: (v) => _setHsl(hsl.withLightness(v)),
        ),
        const SizedBox(height: AppTokens.spaceMd),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            ShadButton.outline(
              child: Text(l10n.cancel),
              onPressed: () => Navigator.of(context).pop(),
            ),
            const SizedBox(width: AppTokens.spaceSm),
            ShadButton(
              child: Text(l10n.settingsAccentApply),
              onPressed: () => Navigator.of(context).pop(_color),
            ),
          ],
        ),
      ],
    );
  }
}

class _LabeledSlider extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int? divisions;
  final ValueChanged<double> onChanged;

  const _LabeledSlider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.divisions,
  });

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return Row(
      children: [
        SizedBox(
          width: 44,
          child: Text(
            label,
            style: theme.textTheme.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ),
        Expanded(
          child: ShadSlider(
            initialValue: value.clamp(min, max),
            min: min,
            max: max,
            divisions: divisions,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}
