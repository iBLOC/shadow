import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/model_management_screen.dart';
import 'package:shadow_mobile/services/database/app_settings.dart';
import 'package:shadow_mobile/services/database/database_helper.dart';
import 'package:shadow_mobile/services/database/model_item.dart';
import 'package:shadow_mobile/services/database/repositories.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_page.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

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
        case 'setModelRouting':
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
        // 设置仓储换成内存版 —— 真库（SQLite）的那次读是**真实文件 I/O**，
        // 在 `testWidgets` 的 fake-async 区里永远不会完成 ⇒ 自动启动会
        // 一直卡在「启动中」。
        appSettingsRepositoryProvider.overrideWithValue(_FakeAppSettings()),
        // 端脑 client 换成假的 —— 「叶区列表」和「下发路由」不该真发 HTTP。
        telencephalonClientProvider.overrideWithValue(_FakeTelencephalonClient()),
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
      // 页面底部多了一张「叶区模型路由」卡片 ⇒ 推理卡片被推到屏幕外。
      // `ListView` 是**懒构建**的 ⇒ 得先滚过去才找得到那个输入框。
      await tester.dragUntilVisible(
        find.widgetWithText(TextField, l10n.encephalonInferPrompt),
        find.byType(ListView),
        const Offset(0, -250),
      );
      await tester.pumpAndSettle();

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

    /// 「大脑模型来源」卡片。
    ///
    /// 云端（MiniMax token plan 那类）与本地 neuron 权重是**两条不同的
    /// 供给链**：云端要注册远端引擎，本地就是 neuron 自己的权重。
    group('大脑模型来源卡片', () {
      testWidgets('卡片在，本地权重与云端供应商都列出来', (tester) async {
        mockChannel(running: false);
        await tester.pumpWidget(buildPage());

        await pumpUntil(
          tester,
          () => brainState(tester).status == EncephalonMobileStatus.running,
        );

        final l10n = l10nOf(tester);
        expect(find.text(l10n.encephalonModelSourceTitle), findsOneWidget);
        expect(find.text(l10n.encephalonModelLocalNeuron), findsOneWidget);
        expect(find.text('MiniMax'), findsOneWidget);
      });

      testWidgets('切到本地 neuron 权重 ⇒ 全局默认回落本地，且**不重启**大脑',
          (tester) async {
        mockChannel(running: false);
        await tester.pumpWidget(buildPage());

        await pumpUntil(
          tester,
          () => brainState(tester).status == EncephalonMobileStatus.running,
        );
        final startsBefore = calls.where((c) => c.method == 'start').length;

        final l10n = l10nOf(tester);
        await tester.tap(find.text(l10n.encephalonModelLocalNeuron));
        await tester.pumpAndSettle();

        // 路由是**运行时**的 —— 换来源不用把大脑停掉重来。
        expect(
          calls.where((c) => c.method == 'stop'),
          isEmpty,
          reason: '停大脑会让正在用的会话断掉 —— 路由是运行时的',
        );
        expect(
          calls.where((c) => c.method == 'start').length,
          startsBefore,
        );

        // 交给大脑的那份路由：全局默认 = null（回落本地权重）。
        final routingCalls =
            calls.where((c) => c.method == 'setModelRouting').toList();
        expect(routingCalls, isNotEmpty);
        final args = routingCalls.last.arguments as Map;
        final payload = jsonDecode(args['json'] as String) as Map;
        expect(payload['default_model'], isNull);
      });
    });

    /// 「叶区模型路由」卡片 —— 模型使用的**最小单位是叶区**。
    group('叶区模型路由卡片', () {
      testWidgets('列出端脑的叶区，每个叶区都有独立的模型下拉框',
          (tester) async {
        mockChannel(running: false);
        await tester.pumpWidget(buildPage());

        await pumpUntil(
          tester,
          () => brainState(tester).status == EncephalonMobileStatus.running,
        );
        await tester.pumpAndSettle();

        final l10n = l10nOf(tester);
        expect(find.text(l10n.encephalonLobeRoutingTitle), findsOneWidget);
        // 叶区列表**从端脑读**，不硬编码。
        expect(find.text('temporal'), findsOneWidget);
        expect(find.text('prefrontal'), findsOneWidget);
        expect(find.text('parietal'), findsOneWidget);
        // 每个叶区一行 ⇒ 三个下拉框。
        expect(find.byType(DropdownButton<String>), findsNWidgets(3));
      });
    });
  });
}

/// 假的端脑 client —— 「叶区列表」和「下发路由」两条是纯本地的，
/// 不该在 widget 测试里真发 HTTP。
class _FakeTelencephalonClient extends TelencephalonClient {
  _FakeTelencephalonClient()
      : super(baseUrl: 'http://127.0.0.1:1');

  @override
  Future<List<NativeLobeInfo>> listNativeLobes() async => const [
        NativeLobeInfo(
          name: 'temporal',
          openaiBaseUrl: 'http://127.0.0.1:1',
        ),
        NativeLobeInfo(
          name: 'prefrontal',
          openaiBaseUrl: 'http://127.0.0.1:1',
        ),
        NativeLobeInfo(
          name: 'parietal',
          openaiBaseUrl: 'http://127.0.0.1:1',
        ),
      ];

  @override
  Future<Map<String, dynamic>> applyLobeModels({
    required String? defaultModel,
    required Map<String, String?> lobeModels,
    List<Map<String, String>> providers = const [],
  }) async {
    return {
      'default_model': defaultModel,
      'applied': lobeModels,
    };
  }
}

/// 空的模型仓储 —— 自动启动要读它（把云端供应商交给大脑）。
class _FakeModelRepository implements IModelRepository {
  final List<ModelItem> models;

  _FakeModelRepository([List<ModelItem>? models])
      : models = models ?? [_miniMaxModel];

  @override
  Future<void> initializeDefaultModels() async {}

  @override
  Future<List<ModelItem>> getAll() async => models;

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

/// 内存版的 App 设置仓储（大脑模型来源）。
class _FakeAppSettings implements AppSettingsRepository {
  final Map<String, String> values = {};

  @override
  Future<String?> get(String key) async => values[key];

  @override
  Future<void> set(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

/// 一个云端供应商（像「MiniMax token plan」那种）。
final ModelItem _miniMaxModel = ModelItem(
  id: 'cloud_minimax',
  name: 'MiniMax',
  path: 'https://api.minimax.io/v1',
  type: 'text',
  size: 0,
  isLoaded: false,
  isLocal: false,
  source: ModelSource.cloudProvider,
  endpoint: 'https://api.minimax.io/v1',
  apiKey: 'sk-test',
  model: 'MiniMax-M3',
);
