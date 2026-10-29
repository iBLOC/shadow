import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/model_management_screen.dart';
import 'package:shadow_mobile/services/database/database_helper.dart';
import 'package:shadow_mobile/services/database/model_item.dart';
import 'package:shadow_mobile/services/database/repositories.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_page.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_provider.dart';

import 'test_helper.dart';

/// Encephalon（大脑）嵌入式运行时页面的 widget 测试。
///
/// 验的是**页面行为**：嵌入式大脑**默认启动** ⇒ 页面打开时它已经在跑；
/// 「启动大脑」**只在没在跑的时候出现**（它是失败/手动停掉之后的恢复
/// 入口，不是常驻开关）；端口显示；推理卡片随运行态启用。
///
/// 走 MethodChannel mock —— 不需要真机，也不需要 libencephalon.so：
/// 这里验的是 Dart 侧的 UI 行为。JNI 符号本身由 Rust 仓的
/// `scripts/jni-host-test/` 覆盖。
void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late List<MethodCall> calls;

  /// 装一个假的 MethodChannel。
  ///
  /// [running] = native 那边「已经在跑」；[startFails] = start 一直失败
  /// （用来造出「没在跑」的页面状态）。
  void mockChannel({required bool running, bool startFails = false}) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      switch (call.method) {
        case 'getStatus':
          return {
            'running': running,
            'port': running ? 41234 : 0,
            'agentPort': running ? 41235 : 0,
            'healthy': running,
          };
        case 'start':
          if (startFails) return {'success': false, 'port': 0};
          return {'success': true, 'port': 41234, 'agentPort': 41235};
        case 'stop':
          return true;
        case 'setLlmProvider':
          return true;
      }
      return null;
    });
  }

  setUp(() {
    calls = <MethodCall>[];
  });

  setUpAll(() async {
    // 在**真异步**区把本地库打开一次。
    //
    // 自动启动要先读模型列表（把云端供应商交给大脑），而那份列表要等
    // 数据库 —— sqflite ffi 的开库是**真实文件 I/O**，在 `testWidgets`
    // 的 fake-async 区里永远不会完成 ⇒ 自动启动会一直卡在「启动中」。
    // 这里先打开一次，之后 `DatabaseHelper.instance.database` 直接返回
    // 缓存的实例，fake-async 区里也能立刻完成。
    await DatabaseHelper.instance.database;
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Widget buildPage() {
    return ProviderScope(
      overrides: [
        modelRepositoryProvider.overrideWithValue(_FakeModelRepository()),
      ],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: EncephalonMobilePage(),
      ),
    );
  }

  /// 读页面所在容器里的嵌入式大脑状态。
  EncephalonMobileState brainState(WidgetTester tester) {
    final ctx = tester.element(find.byType(EncephalonMobilePage));
    return ProviderScope.containerOf(ctx).read(encephalonMobileProvider);
  }

  /// 等到条件成立。
  ///
  /// 自动启动要走 MethodChannel + SQLite（都是真的异步）⇒ `pumpAndSettle`
  /// 会在它们还没完成时就认为「没有待处理的帧」而提前返回。所以这里自己
  /// 一边 pump 一边等条件。
  Future<void> pumpUntil(
    WidgetTester tester,
    bool Function() condition, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (!condition()) {
      if (DateTime.now().isAfter(deadline)) {
        fail('条件在 ${timeout.inSeconds}s 内没成立');
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
  }

  group('EncephalonMobilePage', () {
    testWidgets('默认启动：页面打开时大脑已经在跑', (tester) async {
      // native 那边没在跑 —— 页面自己把它拉起来（用户不需要点按钮）。
      mockChannel(running: false);
      await tester.pumpWidget(buildPage());

      await pumpUntil(
        tester,
        () => brainState(tester).status == EncephalonMobileStatus.running,
      );

      final l10n = l10nOf(tester);
      expect(
        calls.any((c) => c.method == 'start'),
        isTrue,
        reason: '嵌入式大脑默认启动 —— 不该要求用户去点按钮',
      );
      expect(find.text(l10n.encephalonStatusRunning), findsOneWidget);
      expect(find.text(l10n.encephalonPort(41234)), findsOneWidget);
      // neuron's HTTP 面地址（OpenAI 兼容）
      expect(find.textContaining('127.0.0.1:41234'), findsOneWidget);
    });

    testWidgets('运行态：只有「停止大脑」，不再摆一个「启动大脑」的开关',
        (tester) async {
      mockChannel(running: false);
      await tester.pumpWidget(buildPage());

      await pumpUntil(
        tester,
        () => brainState(tester).status == EncephalonMobileStatus.running,
      );

      final l10n = l10nOf(tester);
      expect(find.text(l10n.encephalonStatusRunning), findsOneWidget);

      // 跑着的时候**不该**有「启动大脑」按钮 —— 它不是常驻开关。
      expect(
          find.widgetWithText(FilledButton, l10n.encephalonStart), findsNothing);

      final stopButton =
          find.widgetWithText(OutlinedButton, l10n.encephalonStop);
      expect(stopButton, findsOneWidget);
      expect(tester.widget<OutlinedButton>(stopButton).onPressed, isNotNull);
    });

    testWidgets('启动失败时：「启动大脑」作为恢复入口出现', (tester) async {
      // start 一直失败 ⇒ 自动重试若干次后停在 error。
      mockChannel(running: false, startFails: true);
      await tester.pumpWidget(buildPage());

      await pumpUntil(
        tester,
        () => brainState(tester).status == EncephalonMobileStatus.error,
        timeout: const Duration(seconds: 30),
      );

      // 把剩下的重试定时器跑完 —— 测试结束时还有 pending timer 会报错。
      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.encephalonStatusError), findsOneWidget);

      final startButton =
          find.widgetWithText(FilledButton, l10n.encephalonStart);
      expect(startButton, findsOneWidget);
      expect(tester.widget<FilledButton>(startButton).onPressed, isNotNull);

      // 停止按钮不在（没在跑）。
      expect(
          find.widgetWithText(OutlinedButton, l10n.encephalonStop), findsNothing);
    });

    testWidgets('推理输入框在大脑起来后可用', (tester) async {
      mockChannel(running: false);
      await tester.pumpWidget(buildPage());

      await pumpUntil(
        tester,
        () => brainState(tester).status == EncephalonMobileStatus.running,
      );

      final l10n = l10nOf(tester);
      final promptField =
          find.widgetWithText(TextField, l10n.encephalonInferPrompt);
      expect(tester.widget<TextField>(promptField).enabled, isTrue);
    });

    testWidgets('点「停止大脑」会调 native 的 stop', (tester) async {
      mockChannel(running: false);
      await tester.pumpWidget(buildPage());

      await pumpUntil(
        tester,
        () => brainState(tester).status == EncephalonMobileStatus.running,
      );

      final l10n = l10nOf(tester);
      await tester.tap(find.widgetWithText(OutlinedButton, l10n.encephalonStop));
      await tester.pumpAndSettle();

      expect(calls.any((c) => c.method == 'stop'), isTrue);
    });
  });
}

/// 空的模型仓储 —— 自动启动要读它（把云端供应商交给大脑）。
class _FakeModelRepository implements IModelRepository {
  @override
  Future<void> initializeDefaultModels() async {}

  @override
  Future<List<ModelItem>> getAll() async => const [];

  @override
  Future<List<ModelItem>> getLocalModels() async => const [];

  @override
  Future<List<ModelItem>> getCloudModels() async => const [];

  @override
  Future<ModelItem?> getById(String id) async => null;

  @override
  Future<void> insert(ModelItem item) async {}

  @override
  Future<void> update(ModelItem item) async {}

  @override
  Future<void> delete(String id) async {}

  @override
  Future<void> setModelLoaded(String id, bool isLoaded) async {}
}
