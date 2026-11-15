import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/widgets/settings/accent_color_picker.dart';

/// parseHexColor 的判据钉在这里 —— 「任意色号」的输入解析不藏在 UI 里。
///
/// 与桌面端 normalizeHexColor 同语义：#RGB / #RRGGBB / #RRGGBBAA（取前 6 位）/ 无 #；
/// 认不得返回 null；alpha 一律丢弃（主题色槽位不吃透明度）。
void main() {
  group('parseHexColor', () {
    test('accepts 6-digit hex with #', () {
      expect(parseHexColor('#7C3AED'), Color(0xFF7C3AED));
    });

    test('accepts 6-digit hex without #', () {
      expect(parseHexColor('7C3AED'), Color(0xFF7C3AED));
    });

    test('expands 3-digit form and accepts lowercase', () {
      expect(parseHexColor('#f0a'), Color(0xFFFF00AA));
      expect(parseHexColor('abc'), Color(0xFFAABBCC));
    });

    test('8-digit input is read as RRGGBBAA: RGB kept, alpha dropped', () {
      // 与桌面端 normalizeHexColor 同口径：前 6 位是 RGB，末 2 位 alpha 丢弃。
      expect(parseHexColor('#807C3AED'), Color(0xFF807C3A));
      expect(parseHexColor('#007C3AED'), Color(0xFF007C3A));
    });

    test('surrounding whitespace is tolerated', () {
      expect(parseHexColor('  #7C3AED  '), Color(0xFF7C3AED));
    });

    test('returns null for empty, wrong length, and non-hex input', () {
      expect(parseHexColor(''), isNull);
      expect(parseHexColor('#'), isNull);
      expect(parseHexColor('#12345'), isNull);
      expect(parseHexColor('#1234567'), isNull);
      expect(parseHexColor('red'), isNull);
      expect(parseHexColor('#ZZZZZZ'), isNull);
      expect(parseHexColor('#7C3AED; drop'), isNull);
    });
  });
}
