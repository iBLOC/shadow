import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/a2ui/a2ui_surface_events.dart';
import 'package:shadow_mobile/services/a2ui/a2ui_agent_service.dart';

import '../support/a2ui_fixture.dart';

/// **端到端回放测试**：端脑吐出的**真实 SSE 字节** ⇒ 真的 A2UI 客户端能解出界面。
///
/// ## 它补的是哪个洞
///
/// `a2ui_contract_test.dart` 已经验了「A2UI 载荷 ⇒ 客户端渲染得出来」，
/// 但它**绕过了 A2A 信封**（直接喂 v1.0 消息）。
///
/// 而 A2UI 在这层有**三个静默丢弃**的点：
///
/// 1. SSE 的 JSON 里没有 `result` ⇒ **静默丢弃**
/// 2. `result.kind` 不认识 ⇒ 解析异常
/// 3. A2UI 载荷不在 `status.message.parts[].data` ⇒ **静默丢弃**
///
/// ⇒ 光在**服务端**断言 JSON 结构，证明不了客户端真的收得到。
/// 这个测试起一个**真的本地 HTTP 服务**把端脑的原始 SSE 字节回放出去，
/// 让**真的** `A2uiAgentService`（→ 自己的传输层 → SSE 解析 →
/// `MessageProcessor`）去连它 ⇒ 只要有一个字节不对，surface 就不会出现，
/// 测试就红。
///
/// ## 那份字节从哪来
///
/// `shadow/fixtures/a2ui/tasks_sse.txt` —— 跨端仓里的**共享 fixture**。
void main() {
  test('端脑的 SSE 字节 ⇒ 传输层与解析层都读得出来', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400
    // （`TestWidgetsFlutterBinding` 的 `_MockHttpOverrides`）⇒ 必须放开。
    HttpOverrides.global = null;

    final service = await a2uiFixtureService();
    addTearDown(service.dispose);

    // 真的走一遍传输层（真 HTTP → 真 SSE 解析）。
    final events = await service.fetchSurfaceEvents('tasks');

    // ⚠️ **逐字同形** —— 客户端拿到的那条事件与端脑发出来的那条**一模一样**
    //    ⇒ ⇒ 两端吃的是同一批字节。
    expect(events, hasLength(a2uiFixtureEvents().length));
    expect(events.first, equals(a2uiFixtureEvents().first));

    // ✅ 解析层把 v1.0 的消息挖出来了（**结构**那一层没问题）。
    final messages = a2uiV1MessagesFromEvents(events);
    expect(messages, hasLength(1));
    expect(messages.first['version'], '1.0');
    expect(
      a2uiRenderableSurfaceIdsFromEvents(events),
      <String>['shadow.tasks'],
      reason: '「画得出来」只认「有 createSurface」这件事 ⇒ '
          '端脑加了新组件也不会被误判成空',
    );
  });

  test('合规的 v1.0 字节 ⇒ 真的 A2UI 客户端能解出 surface', () async {
    HttpOverrides.global = null;

    // 一个只会说合规 v1.0 SSE 的假端脑。
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      request.response.headers.contentType = ContentType(
        'text',
        'event-stream',
        charset: 'utf-8',
      );
      // ⚠️ **写字节，不写字符串**：`HttpResponse.write(String)` 默认按
      // latin1 编码 ⇒ 载荷里的中文（「写周报」）会抛
      // `Invalid argument (string): Contains invalid characters.`。
      request.response.add(utf8.encode(conformantTasksSse()));
      await request.response.close();
    });

    final service = A2uiAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      shadowKeyProvider: () => null,
    );

    final surfaces = <String>[];
    final subscription = service.surfaceIdsStream.listen((ids) {
      surfaces
        ..clear()
        ..addAll(ids);
    });

    service.sendMessage('我的任务');

    // 真实 I/O —— 轮询等 surface 出现（上限 5 秒）。
    for (var i = 0; i < 100 && surfaces.isEmpty; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }

    expect(
      surfaces,
      contains('shadow.tasks'),
      reason: '客户端没从 SSE 里解出 surface —— '
          '多半是 SSE 格式 / result 包层 / data part 位置有一处对不上',
    );

    await subscription.cancel();
    await service.dispose();
    await server.close(force: true);
  });

  test('官方 SDK 拒收的消息 ⇒ 客户端**必须报出来**（不许只记日志）',
      () async {
    // ⚠️ **这一条钉住「不许静默」** —— 官方 SDK 的校验错误只走 `onError`
    //    这一个出口 ⇒ ⇒ 客户端**必须**把它变成界面上的失败
    //    （`a2ui_agent_service.dart` 的 `_reportFailure`）
    //    ⇒ ⇒ 否则用户看到的是「已连接，但端脑这次没有给出界面」
    //    ⇒ ⇒ **失败长得像成功**。
    //
    // ⚠️ 载荷用的是**不合规的组件 id**（`task-0` 不是合法的 UAX #31
    //    标识符）⇒ ⇒ 与共享 fixture 当前的状态无关 ⇒ ⇒ 稳定。
    //
    // ⚠️ 载荷用的是**不合规的组件 id**（`task-0` 不是合法的 UAX #31
    //    标识符）⇒ ⇒ 与共享 fixture 当前的状态无关 ⇒ ⇒ 稳定。
    final service = A2uiAgentService(
      serverUrl: 'http://127.0.0.1:1/a2a',
      shadowKeyProvider: () => null,
    );
    addTearDown(service.dispose);

    service.ingestSurfaceEvents(<Map<String, Object?>>[
      a2aEventOf(
        <String, Object?>{
          'version': '1.0',
          'createSurface': <String, Object?>{
            'surfaceId': 'shadow.tasks',
            'catalogId':
                'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
            'components': <Map<String, Object?>>[
              <String, Object?>{
                'id': 'root',
                'component': 'Column',
                'children': <String>['task-0'],
              },
              <String, Object?>{
                'id': 'task-0',
                'component': 'TaskCard',
                'catalogId':
                    'https://raw.githubusercontent.com/iBLOC/shadow/main/a2ui/catalogs/v1/catalog.json',
                'title': '写周报',
                'status': 'in_progress',
                'priority': 'high',
              },
            ],
          },
        },
      ),
    ]);
    await Future<void>.delayed(const Duration(milliseconds: 200));

    // ❗ 没有面（被拒了）⇒ 而且**必须有错误** ⇒ 界面不许一片安静。
    expect(service.surfaceIds, isEmpty);
    expect(
      service.lastError,
      isNotNull,
      reason: '官方 SDK 的拒收必须变成界面上的失败 ⇒ '
          '否则失败长得像成功（用户只会看到「没有界面」）',
    );
  });
}
