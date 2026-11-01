import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/log_provider.dart';
import 'package:shadow_mobile/widgets/log_panel_section.dart';

import 'test_helper.dart';

/// 日志面板（设置 → 高级 → 日志）的数据桥 —— 2026-11-01 之前它**永远空白**：
///
/// 原先唯一的数据源是 `Runtime.exec("logcat …")`，而 MIUI 对 app uid 的
/// logcat 是彻底封锁的（真机实测 `run-as … logcat -d` 挂死且零输出）；
/// 备用的 Prefrontal SSE 读的是遗留运行时的端口（默认不启动 ⇒ null ⇒
/// 静默跳过）。这里钉住修复后的两座桥：
///
///  1. **EventChannel 桥**：宿主侧 AppLog（写入端抄送 + 回放）经
///     `com.ibloc.shadow/mnn_logs` 进面板 —— mock 通道在 onListen 时
///     先推回放（端脑冷启动日志）再实时；
///  2. **Dart logging 桥**：`wireDartLoggingIntoLogPanel` 把
///     `Logger.root.onRecord` 领进面板。
///
/// 另外钉住显示契约：每条日志标**真实 tag**（EncephalonRuntime…），
/// 不是写死的 `[MNN]`/`[Pre]`；面板收起重展**不重复**回放。
void main() {
  testSetup();

  final replayEntries = [
    {
      'timestamp': 1730000000000,
      'level': 'info',
      'tag': 'EncephalonRuntime',
      'message': '✅ Encephalon started on port 41207 (agent surface: 39811)',
    },
    {
      'timestamp': 1730000001000,
      'level': 'error',
      'tag': 'EncephalonRuntime',
      'message': '❌ nativeSetAdminToken returned: -3',
    },
  ];

  MockStreamHandlerEventSink? liveSink;
  var listenCount = 0;

  void installStreamMock() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockStreamHandler(
      const EventChannel('com.ibloc.shadow/mnn_logs'),
      MockStreamHandler.inline(
        onListen: (arguments, events) {
          listenCount++;
          liveSink = events;
          // 宿主 AppLog.subscribe(replay = true) 的形状：先回放存量。
          for (final entry in replayEntries) {
            events.success(entry);
          }
        },
        onCancel: (arguments) {
          liveSink = null;
        },
      ),
    );
  }

  /// mock 必须在**每个 testWidgets body 内**（pump 之前）安装 —— 装在
  /// `setUp` 里事件会静默丢失（listen 被拦截、回送不达；2026-11-01 实测，
  /// 同一 mock 装在 body 里就正常）。疑为 binding 在 setUp 与 testWidgets
  /// 之间的重置时序问题。
  Future<void> pumpPanel(WidgetTester tester) {
    installStreamMock();
    return pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
        ],
        child: withShadTheme(
          MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh'), Locale('en')],
            home: const Scaffold(
              body: SizedBox(
                height: 600,
                width: 500,
                child: LogPanelSection(),
              ),
            ),
          ),
        ),
      ),
    );
  }

  setUp(() {
    listenCount = 0;
    liveSink = null;
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockStreamHandler(
      const EventChannel('com.ibloc.shadow/mnn_logs'),
      null,
    );
  });

  testWidgets('EventChannel 桥：回放的端脑启动日志直接出现在面板里', (tester) async {
    await pumpPanel(tester);
    await tester.pump(const Duration(milliseconds: 100));

    final l10n = l10nOf(tester);
    expect(find.text(l10n.logsEmpty), findsNothing,
        reason: '有回放日志时不得显示空态');
    expect(
      find.textContaining('Encephalon started on port 41207'),
      findsOneWidget,
    );
  });

  testWidgets('显示契约：条目标真实 tag，不是写死的 [MNN]/[Pre]', (tester) async {
    await pumpPanel(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('[EncephalonRuntime]'), findsNWidgets(2));
    expect(find.text('[MNN]'), findsNothing);
    expect(find.text('[Pre]'), findsNothing);
  });

  testWidgets('实时事件：onListen 之后推的也进面板', (tester) async {
    await pumpPanel(tester);
    await tester.pump(const Duration(milliseconds: 100));

    liveSink?.success({
      'timestamp': 1730000002000,
      'level': 'warning',
      'tag': 'EncephalonRuntime',
      'message': 'Health check failed: timeout',
    });
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('Health check failed'), findsOneWidget);
  });

  testWidgets('Dart logging 桥：Logger 记录经 wiring 进面板', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final sub = wireDartLoggingIntoLogPanel(container);
    addTearDown(sub.cancel);

    Logger('EncephalonMobileNotifier').info('嵌入式大脑启动成功, 端口: 41207');
    await tester.pumpWidget(const SizedBox());

    // wiring 写的是这个 container 的 LogService —— 直接读状态断言。
    final state = container.read(logServiceProvider);
    expect(
      state.logs.any((e) =>
          e.source.name == 'app' &&
          e.tag == 'EncephalonMobileNotifier' &&
          e.message.contains('嵌入式大脑启动成功')),
      isTrue,
      reason: 'wireDartLoggingIntoLogPanel 必须把 root logger 的记录领进面板数据',
    );
  });

  testWidgets('SEVERE 级别映射为 error', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final sub = wireDartLoggingIntoLogPanel(container);
    addTearDown(sub.cancel);

    Logger('ChatProvider').severe('发送失败');
    await tester.pumpWidget(const SizedBox());

    final state = container.read(logServiceProvider);
    expect(
      state.logs.any((e) => e.level.name == 'error' && e.message == '发送失败'),
      isTrue,
    );
  });

  testWidgets('幂等：面板收起重展不重复回放（connectMnn 只 listen 一次）',
      (tester) async {
    installStreamMock();

    // 设置页的折叠/重展**不重建 ProviderScope**（scope 挂在进程级的
    // UncontrolledProviderScope 上）—— 幂等要在**同一个 LogService** 上验：
    // 面板子树销毁 → 重建（两次 initState），但 connectMnn 只 listen 一次。
    var showPanel = true;
    late StateSetter setter;
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
        ],
        child: withShadTheme(
          MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh'), Locale('en')],
            home: StatefulBuilder(
              builder: (context, setState) {
                setter = setState;
                return Scaffold(
                  body: SizedBox(
                    height: 600,
                    width: 500,
                    child: showPanel ? const LogPanelSection() : null,
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(listenCount, 1);
    expect(find.textContaining('Encephalon started on port 41207'),
        findsOneWidget);

    // 折叠：子树销毁；再重展：重新 initState —— LogService 是同一个。
    setter(() => showPanel = false);
    await tester.pump(const Duration(milliseconds: 100));
    setter(() => showPanel = true);
    await tester.pump(const Duration(milliseconds: 100));

    expect(listenCount, 1,
        reason: 'connectMnn 必须幂等 —— 否则每次展开都重复回放同一批存量');
    expect(find.textContaining('Encephalon started on port 41207'),
        findsOneWidget);
  });
}
