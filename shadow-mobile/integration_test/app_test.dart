import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App-Level Integration Tests', () {
    testWidgets('app launches successfully', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.byType(MaterialApp), findsOneWidget);
    });

    testWidgets('app has navigation elements', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.byType(NavigationBar), findsWidgets);
    });

    testWidgets('app shows scaffold', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('app initializes without crash', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // ⚠️ **「不崩」要显式断言** —— 以前这条用例**一条断言都没有**
      //   ⇒ ⇒ 它只能靠「测试框架把异常算成失败」这一条隐含机制
      //   ⇒ ⇒ 而「跑过了」这个事实本身没有任何东西在核。
      //   ⇒ ⇒ `takeException()` 能抓到**框架记录**的异常（含异步那部分）
      //   ⇒ ⇒ 比「用例没红」更硬。
      expect(
        tester.takeException(),
        isNull,
        reason: 'app 起手就炸了 ⇒ ⇒ 这一轮不算「初始化成功」',
      );
    });
  });
}
