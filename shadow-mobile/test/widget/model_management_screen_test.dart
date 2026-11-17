import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/model_management_screen.dart';
import 'package:shadow_mobile/services/database/database_helper.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'test_helper.dart';

/// 离线的大脑假 client —— 只覆写模型管理页会打到的方法（供应商目录
/// ＋ neuron 目录面），其余永远不该被本页触到。
class _FakeBrainClient extends TelencephalonClient {
  @override
  Future<List<RegisteredProvider>> listProviders() async => const [];

  @override
  Future<List<NeuronCatalogEntry>> neuronCatalog() async => const [
    // 老模型（recommended=false ⇒ 历史支持模型库）＋ 引擎档／主源亮行。
    NeuronCatalogEntry(
      id: 'llm/qwen2.5-0.5b',
      engine: 'llm',
      engineImpl: 'candle',
      recommended: false,
      source: 'modelscope',
      available: false,
      defaultRepo: 'modelscope:Qwen/Qwen2.5-0.5B-Instruct',
      capabilities: ['llm'],
    ),
    // 当前世代（recommended 缺省 true ⇒ 推荐段）。
    NeuronCatalogEntry(
      id: 'llm/qwen3-0.6b',
      engine: 'llm',
      engineImpl: 'candle',
      source: 'modelscope',
      available: false,
      defaultRepo: 'modelscope:Qwen/Qwen3-0.6B',
      capabilities: ['llm'],
    ),
    NeuronCatalogEntry(
      id: 'asr/sensevoice-small',
      engine: 'asr',
      available: true,
      capabilities: ['asr'],
    ),
  ];

  @override
  Future<List<NeuronPullJob>> neuronPullJobs() async => const [];
}

void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  /// 嵌入式大脑通道的假（镜像 agents_screen_test 的同款）——
  /// _BrainStatusBar watch encephalonMobileProvider ⇒ 构造即打通道。
  void mockChannel() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          switch (call.method) {
            case 'getStatus':
              return {
                'running': false,
                'port': 0,
                'agentPort': 0,
                'healthy': false,
              };
            case 'start':
              return {'success': false, 'port': 0};
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

  setUp(mockChannel);

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  setUpAll(() async {
    // 真 I/O 开库一次（fake-async 区里永远开不完）—— 与大脑页测试同款。
    await DatabaseHelper.instance.database;
  });

  Future<void> pumpModels(WidgetTester tester) async {
    // ⚠️ 真 I/O（sqflite ffi 的设置/元数据读取）必须走 runAsync ——
    // 假时钟区里 await 真实 I/O 永远不醒（见 backend_settings_card_test
    // 文件头的说明）⇒ 泄漏一个 10s 的 pending timer ⇒ 测试挂。
    await tester.runAsync(() async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            telencephalonClientProvider.overrideWithValue(_FakeBrainClient()),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const ModelManagementScreen(),
          ),
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
  }

  group('ModelManagementScreen Widget Tests', () {
    testWidgets('「添加自持模型」＝ neuron 目录下载弹窗 —— 没有手填参数表单', (tester) async {
      await pumpModels(tester);

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // 下载弹窗开着（离线假目录 ⇒ 列表渲染）。
      expect(find.text('Download local models'), findsOneWidget);
      // ⚠️ 旧手填表单的字段**不在场** —— 参数不需要用户配置。
      expect(find.text('Model ID'), findsNothing);
      expect(find.text('Endpoint (OpenAI-compatible base URL)'), findsNothing);
    });

    testWidgets('目录两段式：推荐档在上，老模型收进历史支持模型库（折叠）', (tester) async {
      await pumpModels(tester);

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      // 推荐段头 ＋ 当前世代条目直接可见。
      expect(find.text('Recommended'), findsOneWidget);
      expect(find.text('qwen3-0.6b'), findsOneWidget);
      // 引擎档徽标亮在行上（同一模型不同引擎要下载的文件不一样）。
      expect(find.text('candle'), findsWidgets);
      // 主源亮在行上（国内默认魔搭）。
      expect(find.textContaining('modelscope'), findsWidgets);

      // 老模型默认**折叠**：段头在场、条目不在场。
      expect(find.text('Legacy model library (1)'), findsOneWidget);
      expect(find.text('qwen2.5-0.5b'), findsNothing);

      // 展开 ⇒ 老模型可挑可下载（历史库不是隐藏，是不占推荐位）。
      await tester.tap(find.text('Legacy model library (1)'));
      await tester.pumpAndSettle();
      expect(find.text('qwen2.5-0.5b'), findsOneWidget);
      // 老模型的下载入口照常在场。
      expect(find.text('Download'), findsWidgets);
    });
  });
}
