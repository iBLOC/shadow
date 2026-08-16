import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/theme/app_colors.dart';

void main() {
  group('AppColors', () {
    test('primary color is defined', () {
      expect(AppColors.primary, isA<Color>());
      expect(AppColors.primary, isNot(Colors.transparent));
    });

    test('error color is defined', () {
      expect(AppColors.error, isA<Color>());
      expect(AppColors.error, isNot(Colors.transparent));
    });

    test('success color is defined', () {
      expect(AppColors.success, isA<Color>());
      expect(AppColors.success, isNot(Colors.transparent));
    });

    test('warning color is defined', () {
      expect(AppColors.warning, isA<Color>());
      expect(AppColors.warning, isNot(Colors.transparent));
    });

    test('dark surface colors are defined', () {
      expect(AppColors.darkSurface, isA<Color>());
      expect(AppColors.darkSurfaceGlass, isA<Color>());
      expect(AppColors.darkBorder, isA<Color>());
      expect(AppColors.darkTextPrimary, isA<Color>());
      expect(AppColors.darkTextSecondary, isA<Color>());
      expect(AppColors.darkTextMuted, isA<Color>());
    });

    test('light surface colors are defined', () {
      expect(AppColors.lightSurface, isA<Color>());
      expect(AppColors.lightSurfaceGlass, isA<Color>());
      expect(AppColors.lightBorder, isA<Color>());
      expect(AppColors.lightTextPrimary, isA<Color>());
      expect(AppColors.lightTextSecondary, isA<Color>());
    });

    test('error light color is defined', () {
      expect(AppColors.errorLight, isA<Color>());
    });
  });
}
