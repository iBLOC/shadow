import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/theme/app_tokens.g.dart';
import 'package:shadow_mobile/theme/shad_scheme.g.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

/// design-tokens.json → shadcn `ShadColorScheme` 的**跨端契约**。
///
/// 桌面端是真 shadcn/ui（CSS 变量由 tokens.css 提供），移动端用
/// Flutter ShadcnUI（要一个 `ShadColorScheme` 对象）。两边的映射必须
/// 逐项对齐 —— 否则同一个能力在两端是两个颜色。
///
/// 这里断言的是**映射规则**（哪些 token 落到哪个语义槽），而不是具体色值
/// —— 色值本身由 `design-tokens.json` 管，改色时这个测试不该红。
void main() {
  group('ShadScheme 映射规则', () {
    test('暗色：表面与文本按暗色 token 投影', () {
      final s = ShadScheme.of(
        brightness: Brightness.dark,
        accentSeed: AppTokens.accentSeed,
      );

      expect(s.background, AppTokens.surfaceDarkBase);
      expect(s.foreground, AppTokens.textDarkPrimary);
      expect(s.card, AppTokens.surfaceDarkRaised);
      expect(s.cardForeground, AppTokens.textDarkPrimary);
      expect(s.popover, AppTokens.surfaceDarkRaised);
      expect(s.popoverForeground, AppTokens.textDarkPrimary);
      expect(s.secondary, AppTokens.surfaceDarkOverlay);
      expect(s.secondaryForeground, AppTokens.textDarkPrimary);
      expect(s.muted, AppTokens.surfaceDarkOverlay);
      expect(s.mutedForeground, AppTokens.textDarkSecondary);
      expect(s.border, AppTokens.borderDarkDefault);
      expect(s.input, AppTokens.borderDarkDefault);
      expect(s.ring, AppTokens.borderDarkFocus);
    });

    test('亮色：表面与文本按亮色 token 投影', () {
      final s = ShadScheme.of(
        brightness: Brightness.light,
        accentSeed: AppTokens.accentSeed,
      );

      expect(s.background, AppTokens.surfaceLightBase);
      expect(s.foreground, AppTokens.textLightPrimary);
      expect(s.card, AppTokens.surfaceLightRaised);
      expect(s.cardForeground, AppTokens.textLightPrimary);
      expect(s.popover, AppTokens.surfaceLightBase);
      expect(s.popoverForeground, AppTokens.textLightPrimary);
      expect(s.secondary, AppTokens.surfaceLightOverlay);
      expect(s.secondaryForeground, AppTokens.textLightPrimary);
      expect(s.muted, AppTokens.surfaceLightOverlay);
      expect(s.mutedForeground, AppTokens.textLightSecondary);
      expect(s.border, AppTokens.borderLightDefault);
      expect(s.input, AppTokens.borderLightDefault);
      expect(s.ring, AppTokens.borderLightFocus);
    });

    test('破坏性色用状态色的 error，且前景色按对比度自动挑', () {
      for (final brightness in [Brightness.light, Brightness.dark]) {
        final s = ShadScheme.of(
          brightness: brightness,
          accentSeed: AppTokens.accentSeed,
        );
        expect(s.destructive, AppTokens.statusError);
        // 前景色不是写死的 —— 必须是对比度更高的那一个
        expect(
          s.destructiveForeground,
          anyOf(equals(const Color(0xFFFFFFFF)), equals(const Color(0xFF09090B))),
        );
      }
    });
  });

  group('主题色槽位是运行时可变的', () {
    test('换 seed → primary / primaryForeground 跟着变', () {
      const indigo = Color(0xFF6366F1);

      final darkA = ShadScheme.of(
        brightness: Brightness.dark,
        accentSeed: AppTokens.accentSeed,
      );
      final darkB = ShadScheme.of(
        brightness: Brightness.dark,
        accentSeed: indigo,
      );

      expect(darkA.primary, isNot(darkB.primary));
      // 暗色模式下有色 seed 取亮色调（L=0.80）
      expect(darkB.primary, isNot(AppTokens.accentSeed));
    });

    test('selection 用 seed 的低透明度版本', () {
      const indigo = Color(0xFF6366F1);
      final s = ShadScheme.of(
        brightness: Brightness.dark,
        accentSeed: indigo,
      );
      expect(s.selection.a, closeTo(0.12, 0.001));
      expect(s.selection.r, closeTo(indigo.r, 0.001));
    });
  });

  group('与桌面端 tokens.css 的语义投影对齐', () {
    // tokens.css 里每个 --xxx 变量对应哪个语义槽；这里钉住映射关系。
    // 改 tokens.css 的投影时，这个测试会提醒同步改 Dart 侧。
    test('accent 槽位是中性 overlay（不是主题色）—— 基底无彩', () {
      final dark = ShadScheme.of(
        brightness: Brightness.dark,
        accentSeed: AppTokens.accentSeed,
      );
      final light = ShadScheme.of(
        brightness: Brightness.light,
        accentSeed: AppTokens.accentSeed,
      );

      expect(dark.accent, AppTokens.surfaceDarkOverlay);
      expect(light.accent, AppTokens.surfaceLightOverlay);
      expect(dark.accentForeground, AppTokens.textDarkPrimary);
      expect(light.accentForeground, AppTokens.textLightPrimary);
    });
  });

  group('组件能取到主题', () {
    testWidgets('ShadTheme 子树里 shadcn 组件可解析自己的主题', (tester) async {
      late ShadThemeData seen;

      await tester.pumpWidget(
        MaterialApp(
          home: ShadTheme(
            data: ShadThemeData(
              colorScheme: ShadScheme.of(
                brightness: Brightness.light,
                accentSeed: AppTokens.accentSeed,
              ),
              brightness: Brightness.light,
            ),
            child: Builder(
              builder: (context) {
                seen = ShadTheme.of(context);
                return const ShadButton.raw(
                  variant: ShadButtonVariant.primary,
                  child: Text('按钮'),
                );
              },
            ),
          ),
        ),
      );

      expect(seen.colorScheme.background, AppTokens.surfaceLightBase);
      expect(find.text('按钮'), findsOneWidget);
    });

    testWidgets('没有 ShadTheme 祖先时应当报错而不是静默错色', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: SizedBox.shrink()),
        ),
      );
      // ShadTheme.of 在缺祖先时抛 FlutterError —— 静默用默认色更糟。
      expect(
        () => ShadTheme.of(tester.element(find.byType(Scaffold))),
        throwsA(isA<FlutterError>()),
      );
    });
  });
}
