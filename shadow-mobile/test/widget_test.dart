// This is a basic Flutter widget test for Shadow app.

import 'package:flutter_test/flutter_test.dart';

import 'package:shadow_mobile/main.dart';

void main() {
  testWidgets('Shadow app loads', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const ShadowApp());

    // Verify that the app title is displayed
    expect(find.text('Shadow'), findsOneWidget);
  });
}
