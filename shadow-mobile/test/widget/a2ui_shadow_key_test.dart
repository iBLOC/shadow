import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/genui/gen_ui_agent_service.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// **端脑面的钥匙**真的被 A2UI 请求带出去了吗？
///
/// ## 为什么这条测试承重
///
/// 端脑的 `/a2a` 现在**要钥匙**（`telencephalon/src/api/a2ui_gateway.rs`
/// —— 它会把任务标题、agent 名字渲染成界面吐出来 ⇒ 是数据面）。
/// 而 A2UI 客户端的默认 connector 把请求头**焊死**在
/// `a2ui_agent_connector.dart:36-40` 里面 ⇒ 外面根本加不了钥匙。
///
/// ⇒ 只能自己造 transport（`services/genui/shadow_key_sse_transport.dart`）。
/// 而「自己造」最容易漏掉两件事：
///
/// 1. **`X-Shadow-Key` 忘了带** ⇒ 真机上是 401，而且**界面上什么都不显示**
///    （`A2uiContentGenerator` 的错误只进 `errorStream`）。
/// 2. **`X-A2A-Extensions` 忘了带** ⇒ 服务端认不出这是 A2UI 请求
///    （A2UI 协议常量，`a2ui_agent_connector.dart:39`）。
///
/// ## 这条测试还钉住「钥匙是请求时现读」
///
/// 真实时序是「**地址先到、钥匙后到**」：嵌入式大脑起来 ⇒ 状态里有了
/// `agentPort` ⇒ A2UI 的地址确定了；宿主才把钥匙交给端脑 client。
///
/// 若在**构造时**把钥匙焊死 ⇒ 有一个窗口「指着新地址、却还没带钥匙」
/// ⇒ 请求 401 ⇒ 而 **401 比 connection refused 难查得多**。
///
/// ⇒ 这里让钥匙**一开始是空的、后来才有**，两次请求分别断言：
/// 第一次没有这个头、第二次有 —— 证明钥匙确实是**发请求那一刻**读的。
void main() {
  test('A2UI 请求带上端脑面的钥匙，且钥匙是「请求时现读」', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400
    // （`TestWidgetsFlutterBinding` 的 `_MockHttpOverrides`）⇒ 必须放开。
    HttpOverrides.global = null;

    // 回放端脑的**真实** SSE 字节 ⇒ 客户端会真的把它消费掉
    // （消费完才有「surface 出现」这个信号 ⇒ 可以确定地等到
    // 「请求已经结束」，dispose 才不会踩到还在飞的流）。
    final sse = _readSseFixture();

    final arrivals = <Completer<void>>[];
    final seenShadowKeys = <String?>[];
    final seenExtensions = <String?>[];

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      seenShadowKeys.add(request.headers.value('x-shadow-key'));
      seenExtensions.add(request.headers.value('x-a2a-extensions'));
      request.response.headers.contentType =
          ContentType('text', 'event-stream', charset: 'utf-8');
      // ⚠️ **写字节，不写字符串**：`HttpResponse.write(String)` 默认按
      // **latin1** 编码 ⇒ 载荷里的中文会抛
      // `Invalid argument (string): Contains invalid characters.`。
      request.response.add(utf8.encode(sse));
      await request.response.close();
      if (arrivals.isNotEmpty) {
        arrivals.removeAt(0).complete();
      }
    });

    // 模拟真实时序：**地址先到、钥匙后到**。
    var key = '';
    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
      shadowKeyProvider: () => key,
    );

    // 「客户端已消费完这份响应」的信号 —— 每份响应都会带来一次
    // `beginRendering` ⇒ 一次 `SurfaceAdded` ⇒ 一次 surface 列表更新。
    var surfacesSeen = 0;
    final subscription = service.surfaceIdsStream.listen((_) {
      surfacesSeen++;
    });

    // 第一次：还没钥匙 ⇒ **不带**这个头。
    final first = Completer<void>();
    arrivals.add(first);
    service.sendMessage('我的任务');
    await first.future.timeout(const Duration(seconds: 10));
    await _waitUntil(() => surfacesSeen >= 1);

    // 第二次：钥匙到了 ⇒ **必须带上**。
    key = 'the-real-key';
    final second = Completer<void>();
    arrivals.add(second);
    service.sendMessage('我的任务');
    await second.future.timeout(const Duration(seconds: 10));
    await _waitUntil(() => surfacesSeen >= 2);

    expect(
      seenShadowKeys,
      hasLength(2),
      reason: '两次请求都应当到达服务端',
    );
    expect(
      seenShadowKeys[0],
      isNull,
      reason: '没有钥匙时不该带这个头（端脑在开发模式下也放行）',
    );
    expect(
      seenShadowKeys[1],
      'the-real-key',
      reason: '钥匙必须在**请求时现读** —— 构造时焊死就会出现'
          '「指着新地址、却还没带钥匙」的窗口 ⇒ 401',
    );

    // A2UI 协议常量头也不能少（自己造 transport 时最容易漏）。
    for (final extension in seenExtensions) {
      expect(
        extension,
        'https://a2ui.org/a2a-extension/a2ui/v0.8',
        reason: '自己造 transport 时必须补上 X-A2A-Extensions',
      );
    }

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

/// 读端脑导出的 SSE fixture。
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
    '${candidates.map((f) => f.path).join(' | ')}'
    '（当前工作目录 ${Directory.current.path}）',
  );
}
