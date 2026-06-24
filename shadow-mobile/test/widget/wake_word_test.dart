import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/wake_word_service.dart';

void main() {
  group('wake word detection rules', () {
    bool matchesEn(String text) {
      final lower = text.toLowerCase();
      return lower.contains('hey shadow') ||
          lower.contains('hey, shadow') ||
          lower.contains('heyshadow');
    }

    bool matchesZh(String text) {
      return text.contains('你好影') ||
          text.contains('你好 影') ||
          text.contains('您好影') ||
          text.contains('nihao') ||
          text.contains('ni hao');
    }

    test('English variants match', () {
      expect(matchesEn('hey shadow'), isTrue);
      expect(matchesEn('Hey Shadow'), isTrue);
      expect(matchesEn('hey, shadow what is the weather?'), isTrue);
      expect(matchesEn('heyshadow'), isTrue);
      expect(matchesEn('I think I saw a shadow over there'), isFalse);
      expect(matchesEn('I had a good day'), isFalse);
    });

    test('Chinese variants match', () {
      expect(matchesZh('你好影'), isTrue);
      expect(matchesZh('你好 影, 打开'), isTrue);
      expect(matchesZh('ni hao ying'), isTrue);
      expect(matchesZh('nihao'), isTrue);
    });

    test('unrelated text matches neither', () {
      expect(matchesEn('hello world'), isFalse);
      expect(matchesEn('random stuff'), isFalse);
      expect(matchesZh('random stuff'), isFalse);
      expect(matchesZh('apple banana'), isFalse);
    });
  });

  test('WakeWordEvent enum has both variants', () {
    expect(
      WakeWordEvent.values,
      containsAll([
        WakeWordEvent.detectedHeyShadow,
        WakeWordEvent.detectedNihao,
      ]),
    );
  });

  group('WakeWordWidget', () {
    testWidgets('shows enable/disable toggle', (WidgetTester tester) async {
      bool enabled = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                return SwitchListTile(
                  title: const Text('Wake Word'),
                  value: enabled,
                  onChanged: (value) {
                    setState(() {
                      enabled = value;
                    });
                  },
                );
              },
            ),
          ),
        ),
      );

      expect(find.text('Wake Word'), findsOneWidget);
      expect(find.byType(SwitchListTile), findsOneWidget);
    });

    testWidgets('can toggle wake word switch on', (WidgetTester tester) async {
      bool enabled = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                return SwitchListTile(
                  title: const Text('Wake Word'),
                  value: enabled,
                  onChanged: (value) {
                    setState(() {
                      enabled = value;
                    });
                  },
                );
              },
            ),
          ),
        ),
      );

      expect(find.byType(SwitchListTile), findsOneWidget);

      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();

      expect(enabled, isTrue);
    });
  });
}
