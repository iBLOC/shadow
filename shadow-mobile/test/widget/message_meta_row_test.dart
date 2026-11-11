import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/widgets/chat_bubble.dart';

void main() {
  testWidgets('MessageMetaRow ⇒ 显时间与读数徽章', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MessageMetaRow(
            timeText: '14:32',
            statsText: '12 tokens · 3.0 tok/s',
          ),
        ),
      ),
    );
    expect(find.text('14:32'), findsOneWidget);
    expect(find.text('12 tokens · 3.0 tok/s'), findsOneWidget);
  });

  testWidgets('MessageMetaRow 两字段全空 ⇒ 什么都不画', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: MessageMetaRow())),
    );
    expect(find.byType(Text), findsNothing);
  });
}
