import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/genui/gen_ui_agent_service.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// 「这一轮的响应**被消费完了**」这个信号 —— **不许**拿「surface 列表变了」来代理。
///
/// ## 这条测试钉的是哪条坑
///
/// `GenUIAgentService.sendMessage` 现在会在**发请求之前**把上一轮的 surface 清掉
/// （`gen_ui_agent_service.dart`：`_surfaceIds.clear()` + 广播一个**空列表**）
/// ⇒ ⇒ `surfaceIdsStream` 多了一种事件：**空列表**。
///
/// 而三条同族测试里，有两条拿「**列表变了**」当「响应已被消费完」的信号
/// （`a2ui_locale_test.dart` / `a2ui_shadow_key_test.dart`）
/// ⇒ ⇒ 那个代理信号**变了两义**：
///
/// - 「空列表」= 「这一轮开始了，上一轮清干净了」；
/// - 「非空列表」= 「端脑这次真的画了一个界面」。
///
/// ⚠️ **拿空列表当「消费完了」⇒ 提前 dispose**
/// ⇒ `dispose()` 会关掉 transport 的 `http.Client`
/// ⇒ **还在飞的响应流当场报错**
/// ⇒ 变成测试区里的**未处理异常** ⇒ 测试偶发红。
///
/// （这条坑本来就在 ㊻ 条里记过一次：「在客户端读完 SSE 之前就 dispose()
/// ⇒ 多文件并行时偶发失败」—— 当时是**靠等 surface 出现**绕过去的；
/// 而「清空上一轮」这个新事件，把那条绕法又拆了。）
///
/// ## 为什么这条测试要**把 SSE 分两半发**
///
/// 因为「响应还没读完」这件事在别处是**竞态**（时好时坏 ⇒ 偶发红 ⇒ 查不出根因）。
/// 这里让服务端**发一半、停 400ms、再发另一半**
/// ⇒ 「提前 dispose ⇒ 在飞的流报错」变成**确定**的 ⇒ 断言钉得住。
void main() {
  test('「空列表」是「这一轮开始了」，不是「响应消费完了」', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400 ⇒ 必须放开。
    HttpOverrides.global = null;

    final sse = _readSseFixture();

    // 服务端：**按请求**记下「整个 SSE 的最后一块写出去」的时刻。
    final bodySentAts = <DateTime>[];
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      request.response.headers.contentType = ContentType(
        'text',
        'event-stream',
        charset: 'utf-8',
      );
      // ⚠️ **写字节，不写字符串**（`write(String)` 默认 latin1 ⇒ 中文会抛）。
      final bytes = utf8.encode(sse);
      final cut = bytes.length ~/ 2;
      request.response.add(bytes.sublist(0, cut));
      await request.response.flush();
      // ⚠️ **这里停顿** ⇒ 客户端此刻一定还没读完整个响应。
      await Future<void>.delayed(const Duration(milliseconds: 400));
      request.response.add(bytes.sublist(cut));
      bodySentAts.add(DateTime.now());
      await request.response.close();
    });

    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
    );

    // 记下**每一次**列表更新（空与非空都记）—— 用来断言它们的**语义**不同。
    final updates = <List<String>>[];
    // ⚠️ **消费信号 = 非空的那次更新**（空列表只是「这一轮开始了」）。
    var surfacesSeen = 0;
    final surfaceAts = <DateTime>[];
    final subscription = service.surfaceIdsStream.listen((ids) {
      updates.add(ids);
      if (ids.isEmpty) return;
      surfacesSeen++;
      surfaceAts.add(DateTime.now());
    });

    // 第一轮：等端脑真的画了一个界面（非空）。
    service.sendMessage('我的任务');
    await _waitUntil(() => surfacesSeen >= 1);

    // 第二轮：**先**应该来一个空列表（上一轮被清掉）⇒ 那是「这一轮开始了」。
    service.sendMessage('我的任务');
    await _waitUntil(() => updates.length >= 2);
    expect(
      updates[1],
      isEmpty,
      reason: '第二轮开始时应该先清空上一轮 —— 那是一个**空列表**事件',
    );

    // ⚠️ **正确的消费信号** ⇒ 等「非空」的那次更新。
    await _waitUntil(() => surfacesSeen >= 2);
    expect(
      bodySentAts.length,
      greaterThanOrEqualTo(2),
      reason: '两轮请求的响应都应该发完了',
    );
    expect(
      surfaceAts.length,
      greaterThanOrEqualTo(2),
      reason: '两轮都应该真的看到端脑画出来的界面（**空列表不算**）',
    );
    expect(
      surfaceAts[1].isBefore(bodySentAts[1]),
      isFalse,
      reason: '端脑画的界面不可能在**整个响应发完之前**就到了 —— '
          '所以「非空更新」才真的是「响应消费完了」的信号；'
          '拿「空列表」当消费信号会**提前 dispose**（在飞的流报错 ⇒ 偶发红）',
    );

    await subscription.cancel();
    service.dispose();
    await server.close(force: true);
  });

  test('请求还在飞时 dispose ⇒ 之后才回来的失败不许炸', () async {
    HttpOverrides.global = null;

    // 一个「收下请求但**不回答**」的服务器 ⇒ 请求一直在飞。
    final arrived = Completer<void>();
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      if (!arrived.isCompleted) arrived.complete();
      await Future<void>.delayed(const Duration(seconds: 10));
    });

    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
    );

    service.sendMessage('在飞的请求');
    await arrived.future.timeout(const Duration(seconds: 10));
    await Future<void>.delayed(const Duration(milliseconds: 200));

    // ⚠️ dispose 会关掉 transport 的 `http.Client`
    // ⇒ **在飞的请求当场断** ⇒ 它的失败**在 dispose 之后**才回来。
    service.dispose();

    // 等那次迟到的失败落地。
    await Future<void>.delayed(const Duration(milliseconds: 800));

    // ⚠️ 「没炸」这件事由测试框架兜着（未处理异常 ⇒ 这条测试红）；
    //    这里断言的是「**失败路径真的跑过了**」⇒ 否则这条测试可能空转。
    expect(
      service.lastError,
      isNotNull,
      reason: '那次迟到的失败应该被如实记下来（只是**不许**再往已关的流里写）',
    );

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
