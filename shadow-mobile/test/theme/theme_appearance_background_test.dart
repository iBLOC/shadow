import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/theme/theme_appearance.dart';

/// chatBackgroundPath 槽位的值语义：copyWith / clear / == / hashCode。
void main() {
  group('ThemeAppearance — chatBackgroundPath', () {
    test('defaults to null (default gradient stays)', () {
      const appearance = ThemeAppearance();
      expect(appearance.chatBackgroundPath, isNull);
    });

    test('copyWith sets the path without touching other slots', () {
      const appearance = ThemeAppearance();
      final withBg = appearance.copyWith(chatBackgroundPath: '/data/bg.webp');
      expect(withBg.chatBackgroundPath, '/data/bg.webp');
      expect(withBg.accentSeed, appearance.accentSeed);
      expect(withBg.glassIntensity, appearance.glassIntensity);
      expect(withBg.surfaceOverride, appearance.surfaceOverride);
    });

    test('clearChatBackgroundPath wins over a path argument', () {
      const appearance = ThemeAppearance(chatBackgroundPath: '/data/bg.webp');
      final cleared = appearance.copyWith(
        chatBackgroundPath: '/other.webp',
        clearChatBackgroundPath: true,
      );
      expect(cleared.chatBackgroundPath, isNull);
    });

    test('copyWith without clear keeps an existing path', () {
      const appearance = ThemeAppearance(chatBackgroundPath: '/data/bg.webp');
      expect(appearance.copyWith().chatBackgroundPath, '/data/bg.webp');
    });

    test('== and hashCode cover the background slot', () {
      const a = ThemeAppearance(chatBackgroundPath: '/data/bg.webp');
      const b = ThemeAppearance(chatBackgroundPath: '/data/bg.webp');
      const c = ThemeAppearance(chatBackgroundPath: '/data/other.webp');
      const d = ThemeAppearance();
      expect(a, equals(b));
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(equals(c)));
      expect(a, isNot(equals(d)));
    });
  });
}
