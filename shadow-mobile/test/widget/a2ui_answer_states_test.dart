import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';
import 'package:shadow_mobile/widgets/chat/agent2ui_answer_state.dart';
import 'package:shadow_mobile/widgets/chat/agent2ui_view.dart';

/// **端脑这一次的回答有三种** —— 客户端不许把三种并成两种。
///
/// ## 为什么这个文件承重
///
/// 协议层本来就有三种结果（`telencephalon/src/api/a2ui_gateway.rs`）：
/// **有内容的 surface** / **空 surface** / **纯文本**；外加「失败」。
///
/// 而手机这一侧以前：
///
/// 1. **端脑的原话只进了日志**（`gen_ui_agent_service.dart` 的 `_logger.info`）
///    ⇒ 用户在手机上**一个字都看不到**；
/// 2. `service.lastError` **存了但从不显示**
///    ⇒ 界面把「失败」说成「未连接到端脑」（失败长得像没连上）。
///
/// ⇒ 这两处都是**用户可见的谎** ⇒ 只能靠断言钉住。
void main() {
  Future<void> pumpAnswer(
    WidgetTester tester, {
    required ConnectionStatus status,
    String? textReply,
    String? errorReason,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: [Locale('en')],
        locale: Locale('en'),
        home: Scaffold(
          body: Agent2UIAnswerState(
            status: status,
            textReply: textReply,
            errorReason: errorReason,
          ),
        ),
      ),
    );
    await tester.pump();
  }

  AppLocalizations l10nOf(WidgetTester tester) =>
      AppLocalizations.of(tester.element(find.byType(Scaffold).first))!;

  testWidgets('端脑说了话 ⇒ 显示它自己的话，且**不**说「没给出界面」', (
    WidgetTester tester,
  ) async {
    await pumpAnswer(
      tester,
      status: ConnectionStatus.connected,
      textReply: '这里能看什么',
    );

    final l10n = l10nOf(tester);

    // ✅ 端脑的原话**直接显示**（端脑自己按 Accept-Language 翻过）。
    expect(find.text('这里能看什么'), findsOneWidget);
    // ❌ 不许说「没给出界面」—— 端脑**说了话**，那不是「没有内容」。
    expect(find.text(l10n.agent2uiNoSurface), findsNothing);
    // ❌ 也不许说「未连接到端脑」—— 连上了。
    expect(find.text(l10n.agent2uiNoConnection), findsNothing);
  });

  testWidgets('端脑**什么都没说** ⇒ 说「没给出界面」（这一档才说）', (
    WidgetTester tester,
  ) async {
    await pumpAnswer(tester, status: ConnectionStatus.connected);

    final l10n = l10nOf(tester);

    expect(find.text(l10n.agent2uiNoSurface), findsOneWidget);
    // ⚠️ 断言有分辨力：这一档**不是**纯文本档。
    expect(find.text('这里能看什么'), findsNothing);
  });

  testWidgets('失败 ⇒ 说**真实原因**，而不是「未连接到端脑」', (
    WidgetTester tester,
  ) async {
    await pumpAnswer(
      tester,
      status: ConnectionStatus.error,
      errorReason: 'A2A Error: failed: boom',
    );

    final l10n = l10nOf(tester);

    // ✅ 真实原因上屏。
    expect(find.text(l10n.errorGeneric('A2A Error: failed: boom')), findsOneWidget);
    // ❌ 「未连接到端脑」是**另一件事**（那是没连上，不是失败）。
    expect(find.text(l10n.agent2uiNoConnection), findsNothing);
    // ❌ 也不许说「没给出界面」（那把失败说成「没内容」）。
    expect(find.text(l10n.agent2uiNoSurface), findsNothing);
  });

  testWidgets('没连上 ⇒ 说「未连接到端脑」（这一档**没变**）', (
    WidgetTester tester,
  ) async {
    await pumpAnswer(tester, status: ConnectionStatus.disconnected);

    final l10n = l10nOf(tester);

    expect(find.text(l10n.agent2uiNoConnection), findsOneWidget);
  });

  test('端脑的纯文本回复 ⇒ 原话进到界面能拿到的流里', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400 ⇒ 必须放开。
    HttpOverrides.global = null;

    final server = await _fakeBrain(_textOnlySse('这里能看什么'));
    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
    );

    final words = <String>[];
    final subscription = service.textReplyStream.listen((text) {
      if (text != null) words.add(text);
    });

    service.sendMessage('我的任务');
    await _waitUntil(() => words.isNotEmpty);

    // ⚠️ 端脑的原话以前**只进日志** ⇒ 手机上彻底消失。
    expect(words.first, '这里能看什么');
    expect(service.lastTextReply, '这里能看什么');

    await subscription.cancel();
    service.dispose();
    await server.close(force: true);
  });

  test('端脑报失败 ⇒ 原因进到界面能拿到的流里', () async {
    HttpOverrides.global = null;

    final server = await _fakeBrain(_failedSse('端脑内部炸了'));
    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
    );

    final reasons = <String>[];
    final subscription = service.errorReasonStream.listen((reason) {
      if (reason != null) reasons.add(reason);
    });

    service.sendMessage('我的任务');
    await _waitUntil(() => reasons.isNotEmpty);

    // ⚠️ 以前这个原因**存了但从不显示** ⇒ 界面只说「未连接到端脑」。
    expect(reasons.first, contains('A2A Error'));
    expect(service.lastError, isNotNull);

    await subscription.cancel();
    service.dispose();
    await server.close(force: true);
  });

  test('端脑在 **HTTP 层**拒了（401）⇒ 原因也要到界面上', () async {
    // ⚠️ **这一条是上一片漏掉的另一半** —— 「失败说真话」只覆盖了
    // A2A 的**任务状态**失败（`errorStream` 只报那个）；
    // 而 **HTTP 层**的失败（401 / 404 / 500 / 连接被拒）
    // **根本不会**进那条流（上游只 catch `FormatException`，
    // `a2ui_agent_connector.dart:228`）⇒ ⇒ 以前只打一行 warning
    // ⇒ 状态停在 `connecting` ⇒ ⇒ **失败长得像「还在连」**。
    HttpOverrides.global = null;

    final server = await _fakeBrainStatus(401, 'unauthorized');
    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
    );

    final reasons = <String>[];
    final subscription = service.errorReasonStream.listen((reason) {
      if (reason != null) reasons.add(reason);
    });

    service.sendMessage('我的任务');
    await _waitUntil(() => reasons.isNotEmpty);

    // ✅ 真实原因上屏（含状态码 ⇒ 用户看得懂发生了什么）。
    expect(reasons.first, contains('401'));
    // ✅ 状态必须变成「失败」，而不是停在「正在连接」。
    expect(service.connectionStatus, ConnectionStatus.error);

    await subscription.cancel();
    service.dispose();
    await server.close(force: true);
  });

  test('端脑**连不上** ⇒ 原因也要到界面上', () async {
    HttpOverrides.global = null;

    // 一个**没人听**的端口（先起再关 ⇒ 拿到一个确定没人听的端口号）。
    final dead = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final deadPort = dead.port;
    await dead.close(force: true);

    final service = GenUIAgentService(
      serverUrl: 'http://127.0.0.1:$deadPort/a2a',
      catalog: ShadowCatalog.create(),
    );

    final reasons = <String>[];
    final subscription = service.errorReasonStream.listen((reason) {
      if (reason != null) reasons.add(reason);
    });

    service.sendMessage('我的任务');
    await _waitUntil(() => reasons.isNotEmpty);

    expect(reasons.first, isNotEmpty);
    expect(service.connectionStatus, ConnectionStatus.error);

    await subscription.cancel();
    service.dispose();
  });

  testWidgets(
      '端脑回**纯文本**（它不画界面）⇒ 它的原话**真的上屏**（第五片漏掉的那一半）',
      (WidgetTester tester) async {
    // ⚠️⚠️ **这条是第五片自己没兑现的那一半**。
    //
    // 第五片只测了 `Agent2UIAnswerState` **这个零件**
    // ⇒ ⇒ **从来没走过「provider → 视图」这条真路**。
    //
    // ⇒ 真机上暴露出来的就是：**端脑明明回了纯文本，屏幕上只有一个
    // 永远转圈的圈** ⇒ 端脑的原话**永远上不了屏**
    // ⇒ ⇒ 第五片承诺的「端脑说的每一句，都得如实显示」
    // **在真机上是假的**。
    //
    // 根因：`surfaceIdsProvider` 订阅的 `surfaceIdsStream` 是**广播流**
    // ⇒ 只在**有 surface 增删**时才发事件
    // ⇒ 而端脑**回纯文本**时一个 surface 都不会有
    // ⇒ ⇒ provider **永远停在 `loading`** ⇒ ⇒ 答案块**轮不到渲染**。
    // ⚠️ 用**假 service**（不发任何 surface）而不是真 HTTP ——
    // ① 真 HTTP 在 widget 测试里会留下**未清的定时器**（测试框架会因此报错，
    //    而且报错与「这条断言到底想说什么」无关）；
    // ② 而这条测试要验的是**视图 + provider** 那条路，
    //    「端脑回纯文本 ⇒ 一个 surface 都没有」这个状态用假 service 更直接。
    final service = _TextOnlyAgentService();
    addTearDown(service.dispose);

    await tester.pumpWidget(
      ProviderScope(
        // ⚠️ **只覆盖 service** —— `surfaceIdsProvider` 等派生 provider
        // 走的是**真的**那条路 ⇒ ⇒ 这条测试才钉得住「provider 卡在 loading」。
        // ⇒ ⇒ **覆盖掉 `surfaceIdsProvider` 就等于把 bug 盖起来**。
        overrides: [genUIAgentServiceProvider.overrideWithValue(service)],
        child: MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: [Locale('en')],
          locale: Locale('en'),
          home: const Scaffold(body: Agent2UIView()),
        ),
      ),
    );
    await tester.pump();

    // 端脑这次**不画界面**，只说了一句话。
    service.replyWithWords('这里能看什么');

    // ⚠️ **不许用 pumpAndSettle** —— 万一那个圈还在转（bug 复现），
    // 它会**永远转下去** ⇒ pumpAndSettle 会超时 ⇒ 报错看不出是哪条断言坏了。
    // ⇒ 改成**有界轮询**：找不到就最多等 2 秒，然后**干净地红**。
    for (var i = 0; i < 40; i++) {
      if (find.text('这里能看什么').evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    // ✅ 端脑的原话**真的上屏了**（第五片在真机上是假的）。
    expect(find.text('这里能看什么'), findsOneWidget);

    // ❌ 不许只剩一个转圈的圈（那正是真机上看到的症状）。
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  test('端脑回**纯文本** ⇒ **上一轮**的界面不许把这句话盖住', () async {
    // ⚠️ **一次请求 = 一次回答** —— 否则端脑这次回纯文本时，
    // 界面还在渲染上一轮的 surface ⇒ ⇒ 原话又被**盖住**了（同一个病）。
    HttpOverrides.global = null;

    var call = 0;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      call++;
      // 第一次回**界面**（端脑导出的真字节），第二次回**纯文本**。
      final payload = call == 1 ? _readSseFixture() : _textOnlySse('这里能看什么');
      request.response.headers.contentType =
          ContentType('text', 'event-stream', charset: 'utf-8');
      request.response.add(utf8.encode(payload));
      await request.response.close();
    });

    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
    );

    service.sendMessage('我的任务');
    await _waitUntil(() => service.surfaceIds.isNotEmpty);
    expect(service.surfaceIds, contains('shadow.tasks'));

    service.sendMessage('你好');
    await _waitUntil(() => service.lastTextReply != null);

    // ✅ 端脑的原话到了。
    expect(service.lastTextReply, '这里能看什么');
    // ✅ 而上一轮的界面**已经让位**了 —— 不许盖住这句话。
    expect(service.surfaceIds, isEmpty);

    service.dispose();
    await server.close(force: true);
  });
}


/// 等到 [predicate] 成立（上限 10 秒）。
Future<void> _waitUntil(bool Function() predicate) async {
  for (var i = 0; i < 200; i++) {
    if (predicate()) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  throw StateError('等待超时（10 秒）');
}


/// 起一个只会回指定状态码的假端脑（模拟 **HTTP 层**的拒绝）。
Future<HttpServer> _fakeBrainStatus(int status, String body) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) async {
    request.response.statusCode = status;
    request.response.write(body);
    await request.response.close();
  });
  return server;
}

/// 起一个只会说 SSE 的假端脑。
Future<HttpServer> _fakeBrain(String payload) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) async {
    request.response.headers.contentType =
        ContentType('text', 'event-stream', charset: 'utf-8');
    // ⚠️ **写字节，不写字符串**：`HttpResponse.write(String)` 默认按 latin1
    // 编码 ⇒ 载荷里的中文会抛。
    request.response.add(utf8.encode(payload));
    await request.response.close();
  });
  return server;
}

/// 端脑的**纯文本**事件 —— 逐字照端脑的形状
/// （`telencephalon/src/a2a/a2ui.rs` → `text_event`）。
String _textOnlySse(String text) =>
    'data: {"result":{"kind":"task-status-update","taskId":"t1",'
    '"contextId":"c1","status":{"state":"completed","message":'
    '{"kind":"message","messageId":"m1","role":"agent","parts":'
    '[{"kind":"text","text":"$text"}]}},"final":true}}\n\n';

/// 一个**不发任何 surface**的假端脑服务。
///
/// ⚠️ 它复现的正是真机上那个病：**端脑回纯文本**（它这次不画界面）
/// ⇒ **一个 surface 都不会有** ⇒ ⇒ `surfaceIdsProvider` 订阅的那条流
/// **永远不发事件** ⇒ ⇒ 没有修复时，provider 永远停在 `loading`
/// ⇒ ⇒ 视图只剩一个永远转圈的圈 ⇒ ⇒ 端脑的原话**上不了屏**。
class _TextOnlyAgentService extends GenUIAgentService {
  _TextOnlyAgentService()
      : super(
          serverUrl: 'http://127.0.0.1:1/a2a',
          catalog: ShadowCatalog.create(),
        );

  final _texts = StreamController<String?>.broadcast();
  final _errors = StreamController<String?>.broadcast();
  final _statuses = StreamController<ConnectionStatus>.broadcast();
  final _surfaces = StreamController<List<String>>.broadcast();

  String? _words;

  @override
  Stream<String?> get textReplyStream => _texts.stream;

  @override
  Stream<String?> get errorReasonStream => _errors.stream;

  @override
  Stream<ConnectionStatus> get connectionStatusStream => _statuses.stream;

  @override
  Stream<List<String>> get surfaceIdsStream => _surfaces.stream;

  @override
  String? get lastTextReply => _words;

  /// 模拟「端脑这次不画界面，只是说了一句话」。
  void replyWithWords(String words) {
    _words = words;
    _texts.add(words);
    _statuses.add(ConnectionStatus.connected);
  }

  @override
  void dispose() {
    _texts.close();
    _errors.close();
    _statuses.close();
    _surfaces.close();
    super.dispose();
  }
}

/// 读端脑导出的 SSE fixture（真字节）。
String _readSseFixture() {
  const relative = 'fixtures/a2ui/tasks_sse.txt';
  final candidates = <File>[
    File('../$relative'),
    File('../../$relative'),
    File(relative),
  ];
  for (final candidate in candidates) {
    if (candidate.existsSync()) {
      return candidate.readAsStringSync();
    }
  }
  throw StateError(
    '找不到 SSE fixture。试过：'
    '${candidates.map((f) => f.path).join(' | ')}',
  );
}

/// 端脑报**失败**的事件（`status.state = failed`）。
String _failedSse(String text) =>
    'data: {"result":{"kind":"task-status-update","taskId":"t1",'
    '"contextId":"c1","status":{"state":"failed","message":'
    '{"kind":"message","messageId":"m1","role":"agent","parts":'
    '[{"kind":"text","text":"$text"}]}},"final":true}}\n\n';
