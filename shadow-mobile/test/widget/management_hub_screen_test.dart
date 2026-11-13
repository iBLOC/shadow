import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/screens/manage/management_hub_screen.dart';
import 'package:shadow_mobile/services/database/database_helper.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'test_helper.dart';

/// hub 计数的**零网络**替身 —— 真 HubNotifier 构造器立刻 fire
/// `loadAllCounts()`（真网络），测试的 fake-async 区里挂着不落
/// ⇒ pumpAndSettle 超时 ⇒ 覆写成空（构造器里的那次调用按 Dart 虚分派
/// 落到这里的覆写，不会碰到网络）。
class _NoNetHubNotifier extends HubNotifier {
  _NoNetHubNotifier() : super(PrefrontalClient());

  @override
  Future<void> loadAllCounts() async {}
}

void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  /// 嵌入式大脑通道的假（镜像 agents_screen_test 的同款）——
  /// DefaultModelCard 里 `ref.read(encephalonMobileProvider.notifier)`
  /// 构造即打通道，不 mock 会 MissingPluginException。
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

  // 离线的假目录：选项固定 ⇒ 首卡高度固定 ⇒ 滚动断言不依赖网络。
  final overrides = <Override>[
    // 2 条文本（capability 'llm'）＋ 1 条视觉（'vision'）—— 对话行的候选。
    brainProviderOptionsProvider.overrideWith(
      (ref) => const [
        BrainModelOption(
          id: 'cloud:deepseek',
          name: 'DeepSeek',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com/v1',
          capability: 'llm',
        ),
        BrainModelOption(
          id: 'cloud:minimax',
          name: 'MiniMax',
          model: 'MiniMax-M3',
          baseUrl: 'https://api.minimax.chat/v1',
          capability: 'llm',
        ),
        BrainModelOption(
          id: 'cloud:vlm',
          name: 'MiniMax VL',
          model: 'MiniMax-VL',
          baseUrl: 'https://api.minimax.chat/v1',
          capability: 'vision',
        ),
      ],
    ),
    // 对话档 ＋ 两档引擎档 ⇒ 分档那几行下拉，首卡更高。
    capabilityDefaultsProvider.overrideWith(
      (ref) => const CapabilityDefaultsView(
        capabilities: ['llm', 'asr', 'tts'],
        engineResolved: ['asr', 'tts'],
      ),
    ),
    capabilityOptionsProvider.overrideWith(
      (ref) => {
        'llm': const [
          CapabilityCandidateOption(
            id: 'deepseek-chat',
            label: 'deepseek-chat',
          ),
        ],
      },
    ),
    // 三个原生叶区 ⇒ 叶区段三行（直读端脑的那张清单换成固定值）。
    nativeLobesProvider.overrideWith(
      (ref) => const [
        NativeLobeInfo(name: 'prefrontal', openaiBaseUrl: ''),
        NativeLobeInfo(name: 'temporal', openaiBaseUrl: ''),
        NativeLobeInfo(name: 'parietal', openaiBaseUrl: ''),
      ],
    ),
    hubNotifierProvider.overrideWith((ref) => _NoNetHubNotifier()),
  ];

  Future<void> pumpHub(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en')],
          locale: const Locale('en'),
          home: const ManagementHubScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('ManagementHubScreen Widget Tests', () {
    testWidgets('头部与底 tab 同名 ——「能力」页不再叫 Manage', (tester) async {
      await pumpHub(tester);

      expect(find.text('Capabilities'), findsOneWidget);
      expect(find.text('Manage'), findsNothing);
    });

    testWidgets('整页一条滚动物 —— 首卡滚过去之后能看到最后一行格子', (tester) async {
      await pumpHub(tester);

      // 首卡在初始视口里。
      expect(find.text('Default models'), findsOneWidget);
      // 最后一行格子（Flows）在首屏外 —— 旧布局里它根本滚不到（固定区
      // 把 grid 压到 0），这条同时钉住「页面总高度 > 一屏」。
      expect(find.text('Flows'), findsNothing);

      await tester.scrollUntilVisible(
        find.text('Flows'),
        300,
        scrollable: find.byType(Scrollable).first,
      );

      expect(find.text('Flows'), findsOneWidget);
      // 滚回来也通 —— 同一条滚动物，不是两个各自为政的视口。
      await tester.drag(find.byType(Scrollable).first, const Offset(0, 2000));
      await tester.pumpAndSettle();
      expect(find.text('Default models'), findsOneWidget);
    });
  });
}
