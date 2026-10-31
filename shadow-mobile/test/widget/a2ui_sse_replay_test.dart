import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/genui/gen_ui_agent_service.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// **端到端回放测试**：端脑吐出的**真实 SSE 字节** ⇒ 真的 A2UI 客户端能解出界面。
///
/// ## 它补的是哪个洞
///
/// `a2ui_contract_test.dart` 已经验了「A2UI 载荷 ⇒ 客户端渲染得出来」，
/// 但它**绕过了 A2A 信封**（直接喂 `surfaceUpdate` / `beginRendering`）。
///
/// 而 A2UI 在这层有**三个静默丢弃**的点：
///
/// 1. SSE 的 JSON 里没有 `result` ⇒ **静默丢弃**
///    （`genui_a2ui/lib/src/a2a/client/sse_parser.dart:45-49`）
/// 2. `result.kind` 不认识 ⇒ 解析异常
/// 3. A2UI 载荷不在 `status.message.parts[].data` ⇒ **静默丢弃**
///    （`genui_a2ui/lib/src/a2ui_agent_connector.dart:182-186`）
///
/// ⇒ 光在**服务端**断言 JSON 结构，证明不了客户端真的收得到。
/// 这个测试起一个**真的本地 HTTP 服务**把端脑的原始 SSE 字节回放出去，
/// 让**真的** `GenUIAgentService`（→ `A2uiContentGenerator` → `A2uiAgentConnector`
/// → SSE 解析器 → `A2uiMessageProcessor`）去连它 ⇒ 只要有一个字节不对，
/// surface 就不会出现，测试就红。
///
/// ## 那份字节从哪来
///
/// `shadow/fixtures/a2ui/tasks_sse.txt` —— 由端脑侧的集成测试导出
/// （`telencephalon/tests/a2ui.rs`，设 `A2UI_DUMP_SSE` 环境变量即可落盘）。
void main() {
  test('端脑的 SSE 字节 ⇒ 真的 A2UI 客户端能解出 surface', () async {
    // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400
    // （`TestWidgetsFlutterBinding` 的 `_MockHttpOverrides`）⇒ 必须放开。
    HttpOverrides.global = null;

    final sse = _readSseFixture();

    // 一个只会说 SSE 的假端脑。
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      request.response.headers.contentType = ContentType(
        'text',
        'event-stream',
        charset: 'utf-8',
      );
      // ⚠️ **写字节，不写字符串**：`HttpResponse.write(String)` 默认按
      // **latin1** 编码 ⇒ 载荷里的中文（「写周报」）会抛
      // `Invalid argument (string): Contains invalid characters.`。
      // （`response.encoding = utf8` 也救不了：一旦响应头发出，
      // sink 的编码就**不可变**了 ⇒ `IOSink encoding is not mutable`。）
      //
      // （真客户端那条路没问题：`SseTransport` 是
      // `response.stream.transform(utf8.decoder)` 显式按 UTF-8 解流的，
      // `sse_transport.dart:68-71`。）
      request.response.add(utf8.encode(sse));
      await request.response.close();
    });

    final service = GenUIAgentService(
      serverUrl: 'http://${server.address.address}:${server.port}/a2a',
      catalog: ShadowCatalog.create(),
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
    service.dispose();
    await server.close(force: true);
  });
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
