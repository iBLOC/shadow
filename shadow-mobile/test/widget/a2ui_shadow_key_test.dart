import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/a2ui/a2ui_agent_service.dart';
import 'package:shadow_mobile/services/a2ui/shadow_key_sse_transport.dart';

import '../support/a2ui_fixture.dart';

/// **端脑面的钥匙**真的被 A2UI 请求带出去了吗？
///
/// ## 为什么这条测试承重
///
/// 端脑的 `/a2a` 现在**要钥匙**（`telencephalon/src/api/a2ui_gateway.rs`
/// —— 它会把任务标题、agent 名字渲染成界面吐出来 ⇒ 是数据面）。
/// 而官方 A2UI SDK **没有**传输层（只有协议栈）⇒ ⇒ 这一层归我们自己
/// （`services/a2ui/shadow_key_sse_transport.dart`）。
/// 而「自己造」最容易漏掉三件事：
///
/// 1. **`X-Shadow-Key` 忘了带** ⇒ 真机上是 401，而且**界面上什么都不显示**。
/// 2. **`X-A2A-Extensions` 忘了带** ⇒ 服务端认不出这是 A2UI 请求
///    ⇒ ⇒ **它会回旧形状（v0.8）** ⇒ ⇒ 界面画不出来。
/// 3. **空值也把头带出去** ⇒ 空串头与「没这个头」在门那边**等价**
///    ⇒ ⇒ 等于把门骗开。
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
  test('传输层：空值**不下发**，协议常量头**不能少**', () async {
    // ⚠️ 这一层**不碰真网络** —— 注入假 client ⇒ 只验「头带得对不对」。
    final sent = <http.BaseRequest>[];
    final mock = http_testing.MockClient((request) async {
      sent.add(request);
      return http.Response(
        '',
        200,
        headers: const {'content-type': 'text/event-stream'},
      );
    });

    var key = '';
    var admin = '';

    // ⚠️ provider 是**回调** ⇒ ⇒ 要能在**请求那一刻**变
    //    （这正是「地址先到、钥匙后到」那个窗口的根治办法）。
    final live = ShadowKeySseTransport(
      url: 'http://127.0.0.1:60080/a2a',
      shadowKeyProvider: () => key,
      adminTokenProvider: () => admin,
      localeProvider: () => 'zh',
      client: mock,
    );
    await live.sendStream(<String, Object?>{'ping': true}).toList();

    // ❌ 空钥匙 ⇒ **不带**这个头（空串与「没这个头」在门那边等价）。
    expect(sent.single.headers.containsKey('x-shadow-key'), isFalse);
    expect(sent.single.headers.containsKey('x-admin-token'), isFalse);
    // ✅ 协议常量头（**v1.0**）不能少 —— 少了端脑会回旧形状。
    expect(
      sent.single.headers['x-a2a-extensions'],
      'https://a2ui.org/a2a-extension/a2ui/v1.0',
    );
    // ✅ 语言也要带上。
    expect(sent.single.headers['accept-language'], 'zh');
    live.close();

    // 钥匙到了 ⇒ 必须带上。
    key = 'the-real-key';
    admin = 'the-real-admin';
    sent.clear();
    final live2 = ShadowKeySseTransport(
      url: 'http://127.0.0.1:60080/a2a',
      shadowKeyProvider: () => key,
      adminTokenProvider: () => admin,
      client: mock,
    );
    await live2.sendStream(<String, Object?>{'ping': true}).toList();
    expect(sent.single.headers['x-shadow-key'], 'the-real-key');
    expect(sent.single.headers['x-admin-token'], 'the-real-admin');
    live2.close();
  });

  test('A2UI 请求带上端脑面的钥匙，且钥匙是「请求时现读」', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400
    // （`TestWidgetsFlutterBinding` 的 `_MockHttpOverrides`）⇒ 必须放开。
    HttpOverrides.global = null;

    // 回放端脑那种 **v1.0** 的 SSE 字节 ⇒ 客户端会真的把它消费掉
    // （消费完才有「这一轮结束了」这个信号 ⇒ 可以确定地等到
    // 「请求已经结束」，dispose 才不会踩到还在飞的流）。
    final sse = conformantTasksSse();

    final arrivals = <Completer<void>>[];
    final seenShadowKeys = <String?>[];

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      seenShadowKeys.add(request.headers.value('x-shadow-key'));
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
    final service = A2uiAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      shadowKeyProvider: () => key,
    );

    // 第一次：还没钥匙 ⇒ **不带**这个头。
    final first = Completer<void>();
    arrivals.add(first);
    service.sendMessage('我的任务');
    await first.future.timeout(const Duration(seconds: 10));
    await _waitUntil(
      () => service.connectionStatus == ConnectionStatus.connected,
    );

    // 第二次：钥匙到了 ⇒ **必须带上**。
    key = 'the-real-key';
    final second = Completer<void>();
    arrivals.add(second);
    service.sendMessage('我的任务');
    await second.future.timeout(const Duration(seconds: 10));
    await _waitUntil(
      () => service.connectionStatus == ConnectionStatus.connected,
    );

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

    await service.dispose();
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
