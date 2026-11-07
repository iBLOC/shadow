import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/database/app_settings.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/widgets/brain/default_model_card.dart';

import 'test_helper.dart';

/// 「默认模型」卡的 widget 测试（能力 tab 首卡）。
///
/// 卡片**直读大脑供应商目录**（FutureProvider 覆盖注入，不真发 HTTP）；
/// 写入走 `applyModelSource` 的同一条下发链（MethodChannel mock ——
/// `setModelRouting` 的载荷在这里逐字断言）。
///
/// 这 6 条从嵌入式大脑页的测试移植过来（2026-11-07 刀三：卡片搬出
/// 排障页，断言跟着搬，形状不变）。
void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late List<MethodCall> calls;

  void mockChannel() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      switch (call.method) {
        case 'getStatus':
          return {
            'running': false,
            'port': 0,
            'agentPort': 0,
            'healthy': false,
          };
        case 'start':
          // start 成功 ⇒ 大脑进入运行态 ⇒ 没有重试退避的 Timer 挂着
          // （挂着的 Timer 会在测试退出时触发 pending-timer 断言）。
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

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Widget buildCard({List<RegisteredProvider>? providers}) {
    mockChannel();
    return ProviderScope(
      overrides: [
        // 大脑目录直读 —— 覆盖注入，不真发 HTTP。
        brainProviderOptionsProvider.overrideWith(
          (ref) => Future.value(usableBrainOptions(providers ?? const [])),
        ),
        // 设置仓储换内存版（真库那次读是真实文件 I/O，fake-async 卡死）。
        appSettingsRepositoryProvider.overrideWithValue(_FakeAppSettings()),
        // 端脑 client 换假的 —— 下发路由不真发 HTTP。
        telencephalonClientProvider.overrideWithValue(_FakeTelencephalonClient()),
      ],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SingleChildScrollView(child: DefaultModelCard()),
        ),
      ),
    );
  }

  /// 大脑目录里的一条供应商（DeepSeek 形状；capability 决定分组）。
  RegisteredProvider brainProvider({
    String id = 'deepseek',
    String name = 'DeepSeek',
    String baseUrl = 'https://api.deepseek.com/v1',
    String model = 'deepseek-chat',
    String? capability = 'llm',
  }) {
    return RegisteredProvider(
      id: id,
      name: name,
      baseUrl: baseUrl,
      apiStandard: 'openai',
      enabled: true,
      selectedModel: model,
      models: [
        RegisteredModel(id: model, name: model, capability: capability),
      ],
    );
  }

  group('默认模型卡', () {
    testWidgets('卡片在，本地权重与云端供应商都列出来', (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(
          id: 'minimax',
          name: 'MiniMax',
          baseUrl: 'https://api.minimax.io/v1',
          model: 'MiniMax-M3',
        ),
      ]));

      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.encephalonModelSourceTitle), findsOneWidget);
      expect(find.text(l10n.encephalonModelLocalNeuron), findsOneWidget);
      expect(find.text('MiniMax'), findsOneWidget);
    });

    testWidgets('切到本地 neuron 权重 ⇒ 全局默认回落本地，且**不重启**大脑',
        (tester) async {
      await tester.pumpWidget(buildCard());
      await tester.pumpAndSettle();
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

    testWidgets('⚠️ 大脑目录里的 DeepSeek 出现在「文本模型」组（分组回归）',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(id: 'deepseek', name: 'DeepSeek'),
      ]));

      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(
        find.text(l10n.modelCategoryText),
        findsOneWidget,
        reason: 'capability=llm ⇒ 归「文本模型」组（用户语言，不出现缩写）',
      );
      expect(find.text('DeepSeek'), findsOneWidget);
    });

    testWidgets('视觉模型单独一组；组头只在非空时出现', (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(
          id: 'openai-gpt4o',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          capability: 'vision',
        ),
      ]));

      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.modelCategoryVision), findsOneWidget);
      expect(find.text('OpenAI'), findsOneWidget);
      expect(
        find.text(l10n.modelCategoryText),
        findsNothing,
        reason: '没内容不画空组 —— 空组头也是失败长得像成功',
      );
    });

    testWidgets('⚠️ asr/tts 不能当对话上游 ⇒ 选择器不给（正控：同卡文本模型在）',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(
          id: 'ds-tts',
          name: 'DeepSeek TTS',
          model: 'tts-1',
          capability: 'tts',
        ),
        brainProvider(id: 'ds-llm', name: 'DeepSeek'),
      ]));

      await tester.pumpAndSettle();

      // 正控：同一份目录里文本模型在 ⇒ 卡片加载正常。
      expect(find.text('DeepSeek'), findsOneWidget);
      expect(
        find.text('DeepSeek TTS'),
        findsNothing,
        reason: '选 tts 当 LLM 上游必坏 ⇒ 界面不给必然失败的选项',
      );
    });

    testWidgets('⚠️ 选大脑目录里的 DeepSeek ⇒ 下发 default_model 与 providers（不带 key），不重启大脑',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(id: 'deepseek', name: 'DeepSeek'),
      ]));
      await tester.pumpAndSettle();

      // 卡片打开时「自动」可能已落在第一条可用云端上（即 DeepSeek
      // 自己）⇒ RadioListTile 对已选中项不触发 onChanged。先切到本地
      // 权重再切回 DeepSeek —— 造出一次真实的「换模型」动作。
      final l10n = l10nOf(tester);
      await tester.tap(find.text(l10n.encephalonModelLocalNeuron));
      await tester.pumpAndSettle();

      final startsBefore = calls.where((c) => c.method == 'start').length;

      await tester.tap(find.text('DeepSeek'));
      await tester.pumpAndSettle();

      final routingCalls =
          calls.where((c) => c.method == 'setModelRouting').toList();
      expect(routingCalls, isNotEmpty);
      final args = routingCalls.last.arguments as Map;
      final payload = jsonDecode(args['json'] as String) as Map;
      // ⚠️ default_model 是**上游模型 id**（neuron 拿它去供应商 API
      // 发请求），不是供应商 id —— 与下发链同一语义。
      expect(
        payload['default_model'],
        'deepseek-chat',
        reason: '能力页添加的模型必须真的能被选为默认模型',
      );
      // ⚠️ providers 条目带 id/base_url/model，**不带 api_key** ——
      // 供应商材料不出大脑，端脑按 id 从自己的商店解析。
      final providers = payload['providers'] as List;
      expect(providers, isNotEmpty);
      final entry = providers.first as Map;
      expect(entry['id'], 'deepseek');
      expect(entry['model'], 'deepseek-chat');
      expect(
        entry.containsKey('api_key'),
        isFalse,
        reason: 'key 不出大脑 —— 请求体与日志里不再出现明文 key',
      );
      expect(
        calls.where((c) => c.method == 'stop'),
        isEmpty,
        reason: '路由是运行时的 ⇒ 换模型不重启大脑',
      );
      expect(
        calls.where((c) => c.method == 'start').length,
        startsBefore,
      );
    });
  });
}

/// 假的端脑 client —— 下发路由与供应商目录都是纯本地/覆盖注入的，
/// 不该在 widget 测试里真发 HTTP。
class _FakeTelencephalonClient extends TelencephalonClient {
  _FakeTelencephalonClient() : super(baseUrl: 'http://127.0.0.1:1');

  @override
  Future<List<RegisteredProvider>> listProviders() async => const [];

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

/// 内存版的 App 设置仓储（大脑模型来源落盘）。
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
