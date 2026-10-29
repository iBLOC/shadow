import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/theme/app_tokens.g.dart';

/// 主题色派生的**跨端契约**。
///
/// 移动端（app_tokens.g.dart 的 deriveAccentTones）与桌面端
/// （accent.g.ts 的 deriveAccentTones）是两套独立实现 —— 它们必须对同一个
/// seed 算出同一个色调，否则「同一个主题色」在两端就是两回事。
///
/// 契约快照在仓根 `scripts/accent-tones.fixture.json`，两端测试都断言它。
void main() {
  test('主题色派生与跨端契约快照一致', () {
    final file = File('../scripts/accent-tones.fixture.json');
    expect(
      file.existsSync(),
      isTrue,
      reason: '找不到契约快照 ${file.path}（相对包根 shadow-mobile/）',
    );

    final data = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    final cases = data['cases'] as List<dynamic>;
    expect(cases, isNotEmpty);

    for (final raw in cases) {
      final c = raw as Map<String, dynamic>;
      final seedHex = c['seed'] as String;
      final seed = Color(
        int.parse(seedHex.substring(1), radix: 16) | 0xFF000000,
      );

      final tones = deriveAccentTones(seed);

      expectSameColor(tones.darkTone, c['darkTone'] as String, '$seedHex darkTone');
      expectSameColor(tones.lightTone, c['lightTone'] as String, '$seedHex lightTone');
      expectSameColor(tones.darkToneFg, c['darkToneFg'] as String, '$seedHex darkToneFg');
      expectSameColor(tones.lightToneFg, c['lightToneFg'] as String, '$seedHex lightToneFg');
      expectSameColor(tones.fg, c['fg'] as String, '$seedHex fg');
    }
  });

  test('中性主题色走「反色」：暗底上是光，亮底上是影', () {
    final tones = deriveAccentTones(AppTokens.accentSeed);

    // 影子本身没有颜色 —— 中性色下暗色模式应当接近光，亮色模式接近影。
    expect(tones.darkTone.computeLuminance(), greaterThan(0.8));
    expect(tones.lightTone.computeLuminance(), lessThan(0.1));
  });

  test('前景色按 WCAG 对比度选，不写死', () {
    // 亮色相（青）→ 用近黑前景；深色相（绛）→ 用近白前景。
    final cyan = deriveAccentTones(const Color(0xFF22D3EE));
    expect(cyan.fg, const Color(0xFF09090B));

    final rose = deriveAccentTones(const Color(0xFF4C1D3F));
    expect(rose.fg, const Color(0xFFFFFFFF));
  });
}

/// 逐通道比较，容差 ±2 —— Flutter 的 HSL→sRGB 与 JS 的取整可能差 1。
void expectSameColor(Color actual, String expectedHex, String reason) {
  final expected = int.parse(expectedHex.substring(1), radix: 16);
  final ar = (actual.r * 255).round();
  final ag = (actual.g * 255).round();
  final ab = (actual.b * 255).round();

  final dr = (ar - ((expected >> 16) & 255)).abs();
  final dg = (ag - ((expected >> 8) & 255)).abs();
  final db = (ab - (expected & 255)).abs();

  expect(
    dr <= 2 && dg <= 2 && db <= 2,
    isTrue,
    reason: '$reason：期望 $expectedHex，实际 '
        '#${ar.toRadixString(16).padLeft(2, '0')}'
        '${ag.toRadixString(16).padLeft(2, '0')}'
        '${ab.toRadixString(16).padLeft(2, '0')}',
  );
}
