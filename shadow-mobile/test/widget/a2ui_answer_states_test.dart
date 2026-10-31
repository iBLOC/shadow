import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/services/genui/gen_ui_agent_service.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';
import 'package:shadow_mobile/widgets/chat/agent2ui_answer_state.dart';

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
}

/// 等到 [predicate] 成立（上限 10 秒）。
Future<void> _waitUntil(bool Function() predicate) async {
  for (var i = 0; i < 200; i++) {
    if (predicate()) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  throw StateError('等待超时（10 秒）');
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

/// 端脑报**失败**的事件（`status.state = failed`）。
String _failedSse(String text) =>
    'data: {"result":{"kind":"task-status-update","taskId":"t1",'
    '"contextId":"c1","status":{"state":"failed","message":'
    '{"kind":"message","messageId":"m1","role":"agent","parts":'
    '[{"kind":"text","text":"$text"}]}},"final":true}}\n\n';
