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
import 'package:shadow_mobile/widgets/brain/lobe_capability_row.dart';
import 'package:shadow_mobile/widgets/brain/lobe_model_override_row.dart';

import 'test_helper.dart';

/// 「默认模型」卡的 widget 测试（能力 tab 首卡）。
///
/// 卡片是一张**按类的表**（不是二选一）：对话模型一行、端脑真的会读的
/// 分档各一行、叶区各一行 —— 每一行各选各的。
///
/// 卡片**直读大脑**（供应商目录 / 分档默认 / 原生叶区清单都是 FutureProvider
/// 覆盖注入，不真发 HTTP）；写入走 `applyModelSource` / `applyLobeOverride`
/// 的同一条下发链（MethodChannel mock —— `setModelRouting` 的载荷在这里
/// 逐字断言）。
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
    lastCapabilityDefaultsPushed = null;
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  /// 端脑 HEAD 的形状：词表里有对话档、三档按引擎 id 解析的、还有端脑
  /// 不读的档（向量）。
  const defaultView = CapabilityDefaultsView(
    capabilities: ['llm', 'asr', 'tts', 'embedding'],
    engineResolved: ['asr', 'tts'],
    registered: {
      'asr': ['whisper-model'],
      'tts': <String>[],
    },
  );

  const defaultLobes = [
    NativeLobeInfo(
      name: 'prefrontal',
      openaiBaseUrl: 'http://127.0.0.1:1/v1',
      description: 'Task scheduling',
    ),
    NativeLobeInfo(
      name: 'temporal',
      openaiBaseUrl: 'http://127.0.0.1:1/v1',
      description: 'Conversation / chat',
    ),
  ];

  /// 当前那张卡用的假 client（[buildCard] 里现建，用例改它的「端脑当前值」）。
  _FakeTelencephalonClient? fakeClient;
  _FakeAppSettings? fakeSettings;

  Widget buildCard({
    List<RegisteredProvider>? providers,
    CapabilityDefaultsView view = defaultView,
    List<NativeLobeInfo> lobes = defaultLobes,
    Object? lobesError,
    /// 端脑**当前**已有哪些格子（别的客户端写的）—— 假 client 用它当
    /// 写路径的合并基线。
    Map<String, String> serverDefaults = const {},
    Map<String, Map<String, String>> serverLobeDefaults = const {},
    /// 本机已存的**模型路由**（叶区覆盖的来源，开机从这里重放）。
    BrainModelRouting? initialRouting,
    bool failDefaultsRead = false,
  }) {
    mockChannel();
    fakeClient = _FakeTelencephalonClient()
      ..serverDefaults = serverDefaults
      ..serverLobeDefaults = serverLobeDefaults
      ..failCapabilityDefaultsRead = failDefaultsRead;
    fakeSettings = _FakeAppSettings();
    if (initialRouting != null) {
      fakeSettings!.values[BrainModelSource.routingSettingKey] =
          initialRouting.encode();
    }
    return ProviderScope(
      overrides: [
        // 大脑目录直读 —— 覆盖注入，不真发 HTTP。
        brainProviderOptionsProvider.overrideWith(
          (ref) => Future.value(usableBrainOptions(providers ?? const [])),
        ),
        // 分档默认（词表 ＋ 哪几档有读者）与候选 —— 同样覆盖注入。
        capabilityDefaultsProvider.overrideWith((ref) => Future.value(view)),
        capabilityOptionsProvider.overrideWith(
          (ref) => Future.value(
            capabilityOptionsByCapability(
              const {},
              view.engineResolved,
              view.registered,
            ),
          ),
        ),
        // 原生叶区清单 —— 读得到 / 读不到两种都要能造。
        nativeLobesProvider.overrideWith(
          (ref) => lobesError != null
              ? Future<List<NativeLobeInfo>>.error(lobesError)
              : Future.value(lobes),
        ),
        // 设置仓储换内存版（真库那次读是真实文件 I/O，fake-async 卡死）。
        // 存进 [fakeSettings] —— 有用例要核「本地副本到底存了哪一份」。
        appSettingsRepositoryProvider.overrideWithValue(fakeSettings!),
        // 端脑 client 换假的 —— 下发路由与分档默认都不真发 HTTP。
        telencephalonClientProvider.overrideWithValue(fakeClient!),
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

  /// 大脑目录里的一条供应商（DeepSeek 形状；capability 决定是哪一种）。
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

  /// 「对话模型」那一行的下拉。
  final chatDropdown = find.byWidgetPredicate((w) {
    final key = w.key;
    return w is DropdownButtonFormField<String> &&
        key is ValueKey<String> &&
        key.value.startsWith('chat-default-');
  });

  /// 某个叶区那一行的下拉。
  Finder lobeDropdown(String lobe) => find.descendant(
        of: find.widgetWithText(LobeModelOverrideRow, lobe),
        matching: find.byType(DropdownButton<String>),
      );

  /// 打开一个下拉、点其中一项（菜单项在浮层里 ⇒ 取 `.last`）。
  Future<void> pick(WidgetTester tester, Finder dropdown, String item) async {
    // 上一次操作的 SnackBar 还贴在屏幕底部 ⇒ 可能正好盖住要点的那一行
    // ⇒ 点到的是 SnackBar 而不是下拉 ⇒ 先清掉。
    ScaffoldMessenger.of(tester.element(find.byType(Scaffold).first))
        .removeCurrentSnackBar();
    await tester.pumpAndSettle();
    await tester.ensureVisible(dropdown);
    await tester.pumpAndSettle();
    await tester.tap(dropdown);
    await tester.pumpAndSettle();
    await tester.tap(find.text(item).last);
    await tester.pumpAndSettle();
  }

  /// 最后一次交给大脑的路由负载。
  Map<dynamic, dynamic> lastRoutingPayload() {
    final routingCalls =
        calls.where((c) => c.method == 'setModelRouting').toList();
    expect(routingCalls, isNotEmpty);
    final args = routingCalls.last.arguments as Map;
    return jsonDecode(args['json'] as String) as Map;
  }

  /// 最后一次下发到**分档默认面**的负载（逐叶区覆盖在 `lobe_defaults`）。
  Map<dynamic, dynamic> lastCapabilityDefaultsPayload() {
    expect(
      lastCapabilityDefaultsPushed,
      isNotNull,
      reason: '这一刀必须打到分档默认面（lobe_defaults），不是路由负载',
    );
    return lastCapabilityDefaultsPushed!;
  }

  group('默认模型卡 · 对话模型这一行', () {
    testWidgets('卡片在；对话行的下拉里本地权重与云端供应商都有', (tester) async {
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
      expect(chatDropdown, findsOneWidget);

      await tester.tap(chatDropdown);
      await tester.pumpAndSettle();

      expect(find.text(l10n.encephalonModelLocalNeuron), findsWidgets);
      expect(find.text('MiniMax'), findsWidgets);
    });

    testWidgets('切到本地 neuron 权重 ⇒ 全局默认回落本地，且**不重启**大脑',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();
      final startsBefore = calls.where((c) => c.method == 'start').length;

      final l10n = l10nOf(tester);
      await pick(tester, chatDropdown, l10n.encephalonModelLocalNeuron);

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
      expect(lastRoutingPayload()['default_model'], isNull);
    });

    testWidgets('⚠️ 每条云端选项带着自己是哪一种（文本 / 视觉）', (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(id: 'deepseek', name: 'DeepSeek'),
        brainProvider(
          id: 'openai-gpt4o',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          capability: 'vision',
        ),
      ]));
      await tester.pumpAndSettle();

      await tester.tap(chatDropdown);
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      // 用户语言，不出现 llm / vlm 这种缩写。
      expect(find.text(l10n.modelCategoryText), findsWidgets);
      expect(find.text(l10n.modelCategoryVision), findsWidgets);
      expect(find.text('DeepSeek'), findsWidgets);
      expect(find.text('OpenAI'), findsWidgets);
    });

    testWidgets('只有视觉模型时不出现「文本模型」字样', (tester) async {
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

      await tester.tap(chatDropdown);
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.modelCategoryVision), findsWidgets);
      expect(find.text(l10n.modelCategoryText), findsNothing);
    });

    testWidgets('⚠️ asr/tts 不能当对话上游 ⇒ 对话行不给（正控：同卡文本模型在）',
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

      await tester.tap(chatDropdown);
      await tester.pumpAndSettle();

      // 正控：同一份目录里文本模型在 ⇒ 下拉加载正常。
      expect(find.text('DeepSeek'), findsWidgets);
      expect(
        find.text('DeepSeek TTS'),
        findsNothing,
        reason: '选 tts 当对话上游必坏 ⇒ 界面不给必然失败的选项',
      );
    });

    testWidgets('⚠️ 选大脑目录里的 DeepSeek ⇒ 下发 default_model 与 providers（不带 key），不重启大脑',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [
        brainProvider(id: 'deepseek', name: 'DeepSeek'),
      ]));
      await tester.pumpAndSettle();

      // 卡片打开时「自动」已落在第一条可用云端上（即 DeepSeek 自己）。
      // 先切到本地权重再切回 DeepSeek —— 造出一次真实的「换模型」动作。
      final l10n = l10nOf(tester);
      await pick(tester, chatDropdown, l10n.encephalonModelLocalNeuron);

      final startsBefore = calls.where((c) => c.method == 'start').length;

      await pick(tester, chatDropdown, 'DeepSeek');

      final payload = lastRoutingPayload();
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

    testWidgets('这一类此刻落在哪一边说得出来：云端 ⇄ 本地', (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      // 「自动」落在第一条云端上 ⇒ 徽章是云端，并带出端点与模型。
      expect(find.text(l10n.brainModelBadgeCloud), findsOneWidget);
      expect(find.text(l10n.brainModelBadgeLocal), findsNothing);
      expect(
        find.text('https://api.deepseek.com/v1 · deepseek-chat'),
        findsOneWidget,
      );

      await pick(tester, chatDropdown, l10n.encephalonModelLocalNeuron);

      expect(find.text(l10n.brainModelBadgeLocal), findsOneWidget);
      expect(find.text(l10n.brainModelBadgeCloud), findsNothing);
    });
  });

  group('默认模型卡 · 混合态（每一类各选各的）', () {
    testWidgets('对话走云端的同时，语音识别 / 语音合成各有自己的一行',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.brainModelBadgeCloud), findsOneWidget);
      // 全局分档那几行（叶区里还会再各出现一次，那里按行数另断言）。
      expect(find.text(l10n.capAsr), findsWidgets);
      expect(find.text(l10n.capTts), findsWidgets);
    });

    testWidgets('⚠️ 对话档不再在分档里多画一行（以前同一页两个文本入口、只有一个生效）',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      // 对话那一行的标签是「对话模型」，不是能力词表里的「文本」。
      expect(find.text(l10n.brainChatModelLabel), findsOneWidget);
      expect(
        find.text(l10n.capLlm),
        findsNothing,
        reason: '分档默认里的 llm 是死槽 ⇒ 不给一个选了没用的下拉',
      );
    });

    testWidgets('⚠️ 端脑不读的档不给下拉，只说一句「暂时没得选」', (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(
        find.text(l10n.brainTiersNotReadNote(l10n.capEmbedding)),
        findsOneWidget,
      );
      // 说明里提到了「向量」，但没有一行以它为标签的下拉。
      expect(find.text(l10n.capEmbedding), findsNothing);
    });

    testWidgets('端脑没说哪几档有读者（老端脑）⇒ 除对话档外原样全给，不编说明',
        (tester) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr', 'embedding'],
        ),
      ));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.capAsr), findsOneWidget);
      expect(find.text(l10n.capEmbedding), findsOneWidget);
      expect(find.text(l10n.capLlm), findsNothing);
    });
  });

  group('默认模型卡 · 叶区（跟随全局，或单独指定）', () {
    testWidgets('每个原生叶区一行，默认都是「跟随全局」', (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.encephalonLobeRoutingTitle), findsOneWidget);
      expect(find.byType(LobeModelOverrideRow), findsNWidgets(2));
      expect(find.text('prefrontal'), findsOneWidget);
      expect(find.text('temporal'), findsOneWidget);
      // 「跟随全局」＝ 两个叶区的**对话**行（语音行也有同名选项，那是
      // 下拉展开后的菜单项，收起态不计）。
      expect(
        find.descendant(
          of: find.byType(LobeModelOverrideRow),
          matching: find.text(l10n.encephalonLobeFollowGlobal),
        ),
        findsNWidgets(2),
      );
      // 跟随全局 ⇒ 当前生效的就是全局那条云端。
      expect(
        find.text(l10n.encephalonLobeEffectiveCloud('DeepSeek')),
        findsNWidgets(2),
      );
    });

    testWidgets('⚠️ 一个叶区单独留在本地 ⇒ 只有它进覆盖表，全局默认不动',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      await pick(
        tester,
        lobeDropdown('temporal'),
        l10n.encephalonModelLocalNeuron,
      );

      final payload = lastRoutingPayload();
      final lobeModels = payload['lobe_models'] as Map;
      // `null` = 该叶区强制本地；没出现在表里的叶区 = 跟随全局默认。
      expect(lobeModels.containsKey('temporal'), isTrue);
      expect(lobeModels['temporal'], isNull);
      expect(
        lobeModels.containsKey('prefrontal'),
        isFalse,
        reason: '跟随全局的叶区不许被钉死 —— 改全局默认时它得跟着变',
      );
      expect(payload['default_model'], 'deepseek-chat');

      // 界面上也是混合态：一个本地、一个跟着全局的云端。
      expect(find.text(l10n.encephalonLobeEffectiveLocal), findsOneWidget);
      expect(
        find.text(l10n.encephalonLobeEffectiveCloud('DeepSeek')),
        findsOneWidget,
      );
    });

    testWidgets('全局留在本地、一个叶区单独走云端', (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      await pick(tester, chatDropdown, l10n.encephalonModelLocalNeuron);
      await pick(tester, lobeDropdown('prefrontal'), 'DeepSeek');

      final payload = lastRoutingPayload();
      expect(payload['default_model'], isNull);
      expect((payload['lobe_models'] as Map)['prefrontal'], 'deepseek-chat');
    });

    testWidgets('⚠️ 读不到叶区清单 ⇒ 说出来，不画成「没有叶区」', (tester) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        lobesError: Exception('lobes unreachable'),
      ));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.textContaining('lobes unreachable'), findsOneWidget);
      expect(find.text(l10n.brainLobeListEmpty), findsNothing);
      expect(find.byType(LobeModelOverrideRow), findsNothing);
    });

    testWidgets('端脑真的没有原生叶区 ⇒ 如实说没有', (tester) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        lobes: const [],
      ));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      expect(find.text(l10n.brainLobeListEmpty), findsOneWidget);
    });

    testWidgets('⚠️ 每个叶区多出语音识别 / 语音合成两行（只在端脑说它有读者时）',
        (tester) async {
      await tester.pumpWidget(buildCard(providers: [brainProvider()]));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      // 2 个叶区 × 2 档（asr / tts —— defaultView.engineResolved 里那两档）。
      expect(find.byType(LobeCapabilityRow), findsNWidgets(4));
      // 行标签是用户语言的能力词，不是 asr/tts：全局一行 ＋ 每个叶区一行。
      expect(find.text(l10n.capAsr), findsNWidgets(3));
      expect(find.text(l10n.capTts), findsNWidgets(3));
      // ⚠️ 这份视图的 `engineResolved` 里**没有** image_gen ⇒ 不画那一行
      // （画不画**由端脑说**，客户端不自己列举）。端脑哪天把 image_gen
      // 加进 engine_resolved，这里自动多两行（它的调用方已经带
      // `lobe: 'occipital'` ⇒ 配了真生效）。
      expect(find.text(l10n.capImageGen), findsNothing);
    });

    testWidgets('⚠️ 端脑没说哪几档有 per-lobe 读者（老端脑）⇒ 不画那些行', (
      tester,
    ) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr'],
          // engineResolved 空 ⇒ 客户端没依据说「这档有 per-lobe 消费点」。
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.byType(LobeCapabilityRow), findsNothing);
    });

    testWidgets('⚠️ 给某个叶区单独指定语音识别 ⇒ 下发 lobe_defaults（分档默认面），别的叶区不进表',
        (tester) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr'],
          engineResolved: ['asr'],
          registered: {
            'asr': ['whisper-model'],
          },
        ),
      ));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      // 第一个叶区（prefrontal）的 asr 行。
      final row = find.descendant(
        of: find.widgetWithText(LobeCapabilityRow, l10n.capAsr).first,
        matching: find.byType(DropdownButton<String>),
      );
      await pick(tester, row, 'whisper-model');

      // ⚠️ 走**分档默认面**（`lobe_defaults`），不是 `lobes/models`
      // （2026-11-13 订正：那一面没有这个字段 ⇒ 塞进去会被静默丢掉）。
      final pushed = lastCapabilityDefaultsPayload();
      final caps = pushed['lobe_defaults'] as Map;
      expect(caps['prefrontal'], {'asr': 'whisper-model'});
      expect(
        caps.containsKey('temporal'),
        isFalse,
        reason: '没被覆盖的叶区不进表 —— 跟随全局',
      );
      // 路由那份负载里**不许**再出现（两位读者都没有这个字段）。
      expect(lastRoutingPayload().containsKey('lobe_capability_models'), isFalse);
    });

    testWidgets('⚠️ 删掉**最后一格** ⇒ 下发的必须是「空表」，不许省略这个字段', (
      tester,
    ) async {
      // 端脑那一面是三态：**缺席＝不动／出现＝整份替换（空表＝清空）**。
      // ⚠️ 真机 2026-11-13 逮到：以前服务端把「空表」与「不带字段」同貌处理
      // ⇒ 清空被静默吞掉 ⇒ 界面说「已应用」而覆盖还在（失败长得像成功）。
      // 服务端已修（Option），客户端这边钉住「**必须把空表发出去**」——
      // 省略字段＝「什么都不改」，那才是把同一个 bug 搬到客户端。
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr'],
          engineResolved: ['asr'],
          registered: {
            'asr': ['whisper-model'],
          },
        ),
        serverLobeDefaults: const {
          'prefrontal': {'asr': 'whisper-model'},
        },
        initialRouting: const BrainModelRouting(
          lobeCapabilityOverrides: {
            'prefrontal': {'asr': 'whisper-model'},
          },
        ),
      ));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      final row = find.descendant(
        of: find.widgetWithText(LobeCapabilityRow, l10n.capAsr).first,
        matching: find.byType(DropdownButton<String>),
      );
      // 那一格现在显式覆盖着 ⇒ 选「跟随全局」＝删掉最后一格。
      await pick(tester, row, l10n.encephalonLobeFollowGlobal);

      final pushed = lastCapabilityDefaultsPushed!;
      expect(
        pushed.containsKey('lobe_defaults'),
        isTrue,
        reason: '空表必须**带字段**发出去 ⇒ 省略＝不动＝清空没发生',
      );
      expect(pushed['lobe_defaults'], isEmpty);
    });

    testWidgets('⚠️ 写之前先读端脑基线（不许盲发 —— 那一发会抹掉对方写的格子）',
        (tester) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr'],
          engineResolved: ['asr'],
          registered: {
            'asr': ['whisper-model'],
          },
        ),
      ));
      await tester.pumpAndSettle();

      final before = fakeClient!.capabilityDefaultsReads;
      final l10n = l10nOf(tester);
      final row = find.descendant(
        of: find.widgetWithText(LobeCapabilityRow, l10n.capAsr).first,
        matching: find.byType(DropdownButton<String>),
      );
      await pick(tester, row, 'whisper-model');

      expect(
        fakeClient!.capabilityDefaultsReads,
        greaterThan(before),
        reason: 'PUT 是整份替换 ⇒ 不先读基线就是把别人的表当自己的发上去',
      );
    });

    testWidgets('⚠️ 桌面矩阵卡已写的格子**不许被本机一次写抹掉**（并集下发）',
        (tester) async {
      // 摆出现场：端脑那张表里 temporal 的 asr 是**别的客户端**写的，
      // 本机这份 durable 副本**不知道**它。
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr'],
          engineResolved: ['asr'],
          registered: {
            'asr': ['whisper-model', 'sensevoice-small'],
          },
          lobeDefaults: {
            'temporal': {'asr': 'sensevoice-small'},
          },
        ),
        serverLobeDefaults: const {
          'temporal': {'asr': 'sensevoice-small'},
        },
      ));
      await tester.pumpAndSettle();

      final l10n = l10nOf(tester);
      // 本机给 prefrontal 设一格。
      final row = find.descendant(
        of: find.widgetWithText(LobeCapabilityRow, l10n.capAsr).first,
        matching: find.byType(DropdownButton<String>),
      );
      await pick(tester, row, 'whisper-model');

      final caps = lastCapabilityDefaultsPushed!['lobe_defaults'] as Map;
      expect(caps['prefrontal'], {'asr': 'whisper-model'});
      // ⚠️ **这一条是本用例的全部意义**：对方写的 temporal 必须还在。
      expect(
        caps['temporal'],
        {'asr': 'sensevoice-small'},
        reason: '端脑那张表有两个写者 ⇒ 本机一次写不许把对方抹掉',
      );
      // 本地 durable 副本也要存**合并后**那份 —— 它是开机重放的源，
      // 存窄了＝重启一次又把对方的格子重放没了。
      final persisted = BrainModelRouting.decode(
        fakeSettings!.values[BrainModelSource.routingSettingKey],
      );
      expect(persisted.lobeCapabilityOverrides['temporal'], {
        'asr': 'sensevoice-small',
      });
      expect(persisted.lobeCapabilityOverrides['prefrontal'], {
        'asr': 'whisper-model',
      });
    });

    testWidgets('⚠️ 基线读不到 ⇒ 不发（宁可不生效，也不拿半份表去整份替换）',
        (tester) async {
      await tester.pumpWidget(buildCard(
        providers: [brainProvider()],
        view: const CapabilityDefaultsView(
          capabilities: ['llm', 'asr'],
          engineResolved: ['asr'],
          registered: {
            'asr': ['whisper-model'],
          },
        ),
        failDefaultsRead: true,
      ));
      await tester.pumpAndSettle();

      lastCapabilityDefaultsPushed = null;
      final l10n = l10nOf(tester);
      final row = find.descendant(
        of: find.widgetWithText(LobeCapabilityRow, l10n.capAsr).first,
        matching: find.byType(DropdownButton<String>),
      );
      await pick(tester, row, 'whisper-model');

      expect(
        lastCapabilityDefaultsPushed,
        isNull,
        reason: '没有基线就发全量＝拿自己那一份去整份替换别人的表',
      );
      // 而且要说出来（失败不许长得像成功）。
      expect(find.text(l10n.encephalonLobeRoutingFailed), findsOneWidget);
    });
  });
}

/// 假的端脑 client —— 下发路由与分档默认都是纯本地的，
/// 不该在 widget 测试里真发 HTTP。
class _FakeTelencephalonClient extends TelencephalonClient {
  _FakeTelencephalonClient() : super(baseUrl: 'http://127.0.0.1:1');

  @override
  Future<List<RegisteredProvider>> listProviders() async => const [];

  /// 端脑**当前**的分档默认（写路径要先读它当**合并基线**）。
  ///
  /// 用例用它摆出「别的客户端（桌面矩阵卡）已经写了哪些格子」⇒ ⇒
  /// 才能钉住「本机一次写不许把对方抹掉」。
  Map<String, String> serverDefaults = const {};
  Map<String, Map<String, String>> serverLobeDefaults = const {};

  /// 基线读了几次（钉「**不许盲发**」：写之前必须有一次 GET）。
  int capabilityDefaultsReads = 0;

  /// 置 true ⇒ 读取失败（大脑没起 / 钥匙不对）—— 用来钉「读不到基线 ⇒
  /// **不发**」这一格。
  bool failCapabilityDefaultsRead = false;

  @override
  Future<Map<String, dynamic>> getCapabilityDefaults() async {
    capabilityDefaultsReads++;
    if (failCapabilityDefaultsRead) {
      throw Exception('capability-defaults unreachable');
    }
    return {
      'capabilities': const ['llm', 'asr', 'tts', 'image_gen'],
      'engine_resolved': const ['asr', 'tts', 'image_gen'],
      'defaults': Map<String, String>.from(serverDefaults),
      'lobe_defaults': {
        for (final e in serverLobeDefaults.entries)
          e.key: Map<String, String>.from(e.value),
      },
      'registered': const <String, List<String>>{},
    };
  }

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

  @override
  Future<Map<String, dynamic>> setCapabilityDefaults(
    Map<String, String> defaults, {
    Map<String, Map<String, String>>? lobeDefaults,
  }) async {
    final payload = <String, dynamic>{
      'defaults': Map<String, String>.from(defaults),
      if (lobeDefaults != null)
        'lobe_defaults': {
          for (final e in lobeDefaults.entries)
            e.key: Map<String, String>.from(e.value),
        },
    };
    lastCapabilityDefaultsPushed = payload;
    return payload;
  }
}

/// 最后一次下发到分档默认面的负载（`_FakeTelencephalonClient` 记录）。
Map<String, dynamic>? lastCapabilityDefaultsPushed;

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
