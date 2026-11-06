import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/agents_screen.dart';
import 'package:shadow_mobile/services/database/app_settings.dart';
import 'package:shadow_mobile/services/database/database_helper.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'test_helper.dart';

void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late List<MethodCall> calls;

  /// 嵌入式大脑通道的假（镜像 encephalon_mobile_page_test 的同款）——
  /// 模型覆盖下发走 `setModelRouting`，这里把它记下来供断言。
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

  setUp(() {
    calls = <MethodCall>[];
  });

  setUpAll(() async {
    // 真 I/O 开库一次（fake-async 区里永远开不完）—— 与大脑页测试同款。
    await DatabaseHelper.instance.database;
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  group('AgentsScreen Widget Tests', () {
    testWidgets('renders agents screen with app bar', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const AgentsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('shows the agents title', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const AgentsScreen(),
          ),
        ),
      );

      expect(find.text('Agents'), findsOneWidget);
    });

    testWidgets('has refresh button', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const AgentsScreen(),
          ),
        ),
      );

      expect(find.byIcon(Icons.refresh), findsOneWidget);
    });

    testWidgets('shows empty state when no agents', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const AgentsScreen(),
          ),
        ),
      );

      expect(find.byIcon(Icons.psychology_outlined), findsOneWidget);
    });
  });

  group('AgentsScreen model override (native lobe only)', () {
    // 叶区登记表：一个原生叶区（temporal）＋一个 prompt agent（writer）。
    // 供应商目录：一条 DeepSeek（capability=llm ⇒ 能当对话上游）。
    Widget buildScreen() {
      mockChannel();
      return ProviderScope(
        overrides: [
          // 大脑目录直读 —— FutureProvider 覆盖注入，不真发 HTTP。
          brainProviderOptionsProvider.overrideWith(
            (ref) => Future.value(usableBrainOptions(_brainProviders())),
          ),
          // 设置仓储换内存版（真库那次读是真实文件 I/O，fake-async 卡死）。
          appSettingsRepositoryProvider.overrideWithValue(_FakeAppSettings()),
          // 端脑 client 换假的 —— 叶区登记表与下发路由不真发 HTTP。
          telencephalonClientProvider.overrideWithValue(_FakeAgentClient()),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          locale: const Locale('en'),
          home: const AgentsScreen(),
        ),
      );
    }

    /// 等到条件成立 —— 叶区列表要经真异步（client → notifier → setState），
    /// pumpAndSettle 会在异步完成前提前返回（与大脑页测试同款）。
    Future<void> pumpUntil(
      WidgetTester tester,
      bool Function() condition,
    ) async {
      final deadline = DateTime.now().add(const Duration(seconds: 20));
      while (!condition()) {
        if (DateTime.now().isAfter(deadline)) {
          fail('条件在 20s 内没成立');
        }
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pumpAndSettle();
    }

    testWidgets('native lobe gets the override dropdown, prompt agent does not', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(tester, buildScreen());
      await pumpUntil(tester, () => find.text('temporal').evaluate().isNotEmpty);

      expect(find.text('temporal'), findsOneWidget);
      expect(find.text('writer'), findsOneWidget);
      // 只有原生叶区有下拉 —— prompt agent 不给一个静默无效的选项。
      expect(find.byType(DropdownButton<String>), findsOneWidget);
    });

    testWidgets('dropdown offers follow-global, local, and cloud options', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(tester, buildScreen());
      await pumpUntil(tester, () => find.text('temporal').evaluate().isNotEmpty);

      await tester.tap(find.byType(DropdownButton<String>));
      await tester.pumpAndSettle();

      expect(find.text('Follow global').last, findsOneWidget);
      expect(find.text('Local neuron weights').last, findsOneWidget);
      expect(find.text('DeepSeek').last, findsOneWidget);
    });

    testWidgets('changing override routes through applyLobeOverride', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(tester, buildScreen());
      await pumpUntil(tester, () => find.text('temporal').evaluate().isNotEmpty);

      await tester.tap(find.byType(DropdownButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('DeepSeek').last);
      await tester.pumpAndSettle();

      // 下发链真的走了一遍（大脑下次启动读的路由槽位被写入）。
      expect(
        calls.any((c) => c.method == 'setModelRouting'),
        isTrue,
        reason: '模型覆盖必须经 setModelRouting 落到 Rust 侧槽位',
      );
      // 结果要说出来（成功或失败都有反馈，不静默）。
      expect(find.byType(SnackBar), findsOneWidget);

      // 把启动重试的退避定时器冲干净（start 假失败 ⇒ 2s/4s 重试 ⇒ 3 次
      // 后放弃）—— 不冲的话测试退出时挂着 Timer，触发 pending-timer 断言
      // （与大脑页测试 startFails 分支同款处理）。
      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle();
    });
  });
}

// ── 测试替身 ─────────────────────────────────────────────────────────

/// 大脑供应商目录里的一条（DeepSeek 形状，capability=llm ⇒ 可当对话上游）。
List<RegisteredProvider> _brainProviders() => [
      RegisteredProvider(
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiStandard: 'openai',
        enabled: true,
        selectedModel: 'deepseek-chat',
        models: [
          RegisteredModel(
            id: 'deepseek-chat',
            name: 'deepseek-chat',
            capability: 'llm',
          ),
        ],
      ),
    ];

/// 端脑 client 的假：叶区登记表给一个原生叶区＋一个 prompt agent。
class _FakeAgentClient extends TelencephalonClient {
  _FakeAgentClient() : super(baseUrl: 'http://127.0.0.1:1');

  LobeInfo _lobe(String name, String kind) => LobeInfo(
        name: name,
        kind: kind,
        url: '',
        enabled: true,
        skills: const [],
        agentCard: AgentCard(
          name: name,
          description: '',
          version: '0',
          url: '',
          inputModalities: const ['text'],
          outputModalities: const ['text'],
          capabilities: const [],
        ),
        healthStatus: 'healthy',
      );

  @override
  Future<AgentsResponse> listAgents() async => AgentsResponse(
        telencephalonId: 'e2e',
        instanceName: 'test',
        defaultAgent: 'temporal',
        agents: [
          _lobe('temporal', 'native'),
          _lobe('writer', 'prompt'),
        ],
      );

  @override
  Future<List<RegisteredProvider>> listProviders() async => _brainProviders();

  @override
  Future<Map<String, dynamic>> applyLobeModels({
    required String? defaultModel,
    required Map<String, String?> lobeModels,
    List<Map<String, String>> providers = const [],
  }) async {
    return {'default_model': defaultModel, 'applied': lobeModels};
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
