import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_page.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_provider.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_service.dart';

import 'test_helper.dart';

/// Encephalon（大脑）嵌入式运行时页面的 widget 测试。
///
/// 验的是**页面行为**：状态卡片的启停按钮按运行态启停、端口显示、
/// 推理卡片在没启动时禁用输入。
///
/// 走 MethodChannel mock —— 不需要真机，也不需要 libencephalon.so：
/// 这里验的是 Dart 侧的 UI 行为。JNI 符号本身由 Rust 仓的
/// `scripts/jni-host-test/` 覆盖。
void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  /// 装一个假的 MethodChannel：status 调用按 [running] 返回，
  /// 其余方法不响应（页面测试不点启动/停止）。
  void mockChannel({required bool running}) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'getStatus') {
        return {
          'running': running,
          'port': running ? 41234 : 0,
          'healthy': running,
        };
      }
      if (call.method == 'start') {
        return {'success': true, 'port': 41234};
      }
      if (call.method == 'stop') {
        return true;
      }
      return null;
    });
  }

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Widget buildPage() {
    return ProviderScope(
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: EncephalonMobilePage(),
      ),
    );
  }

  group('EncephalonMobilePage', () {
    testWidgets('停止态：显示停止文案，启动按钮可用、停止按钮禁用',
        (tester) async {
      mockChannel(running: false);
      await tester.pumpWidget(buildPage());
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.encephalonStatusStopped), findsOneWidget);

      final startButton = find.widgetWithText(FilledButton, l10n.encephalonStart);
      expect(startButton, findsOneWidget);
      expect(tester.widget<FilledButton>(startButton).onPressed, isNotNull);

      final stopButton = find.widgetWithText(OutlinedButton, l10n.encephalonStop);
      expect(tester.widget<OutlinedButton>(stopButton).onPressed, isNull);
    });

    testWidgets('运行态：显示端口与 neuron 地址，启动禁用、停止可用',
        (tester) async {
      mockChannel(running: true);
      await tester.pumpWidget(buildPage());
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.encephalonStatusRunning), findsOneWidget);
      expect(find.text(l10n.encephalonPort(41234)), findsOneWidget);
      // neuron's HTTP 面地址（OpenAI 兼容）
      expect(find.textContaining('127.0.0.1:41234'), findsOneWidget);

      final startButton = find.widgetWithText(FilledButton, l10n.encephalonStart);
      expect(tester.widget<FilledButton>(startButton).onPressed, isNull);

      final stopButton = find.widgetWithText(OutlinedButton, l10n.encephalonStop);
      expect(tester.widget<OutlinedButton>(stopButton).onPressed, isNotNull);
    });

    testWidgets('停止态：推理输入框被禁用', (tester) async {
      mockChannel(running: false);
      await tester.pumpWidget(buildPage());
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      final promptField = find.widgetWithText(TextField, l10n.encephalonInferPrompt);
      expect(tester.widget<TextField>(promptField).enabled, isFalse);
    });

    testWidgets('运行态：推理输入框可用', (tester) async {
      mockChannel(running: true);
      await tester.pumpWidget(buildPage());
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      final promptField = find.widgetWithText(TextField, l10n.encephalonInferPrompt);
      expect(tester.widget<TextField>(promptField).enabled, isTrue);
    });

    testWidgets('点击启动会调 native 的 start', (tester) async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        if (call.method == 'getStatus') {
          return {'running': false, 'port': 0, 'healthy': false};
        }
        if (call.method == 'start') {
          return {'success': true, 'port': 41234};
        }
        return null;
      });

      await tester.pumpWidget(buildPage());
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      await tester.tap(find.widgetWithText(FilledButton, l10n.encephalonStart));
      await tester.pumpAndSettle();

      expect(calls.any((c) => c.method == 'start'), isTrue);
    });
  });
}
