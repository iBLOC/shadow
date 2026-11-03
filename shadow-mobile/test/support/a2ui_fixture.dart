import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/genui/gen_ui_agent_service.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// 端脑导出的**真实 SSE 字节** —— 权威样本。
///
/// ⚠️ 它是**共享 fixture**（桌面端 `clientTools.a2ui.test.ts` 与
/// `a2ui.inline.test.tsx` 断言的是**同一份**）
/// ⇒ ⇒ 两端吃的是同一批事件 ⇒ ⇒ 两端的形状不会漂。
String readA2uiSseFixture() {
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

/// fixture 的每一行 `data: {...}` ⇒ 一个 A2A 事件对象。
///
/// ⚠️ **逐字同形**的那一份：去掉 `data: ` 前缀，**不改字段**
/// ⇒ ⇒ 这就是「端脑 `POST /a2a` 发出的那条事件本身」。
List<Map<String, Object?>> a2uiFixtureEvents() {
  final out = <Map<String, Object?>>[];
  for (final line in readA2uiSseFixture().split(RegExp(r'\r?\n'))) {
    final trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    final decoded = jsonDecode(trimmed.substring('data:'.length).trim());
    if (decoded is Map) out.add(Map<String, Object?>.from(decoded));
  }
  return out;
}

/// 一个只会回放这段 SSE 的端脑 —— 但走的是**真的**传输层
/// （`ShadowKeySseTransport` → `SseTransport` → SSE 解析器）。
///
/// ⚠️ **为什么不用假 fetcher**：假 fetcher 会把「传输层有没有把 `result`
/// 信封包回去」这件事**测掉** ⇒ ⇒ 那样断言的就不是「端脑发的那条事件」
/// 了 ⇒ ⇒ 契约就漏检了。
GenUIAgentService a2uiFixtureService({String? body}) {
  final payload = body ?? readA2uiSseFixture();
  final mock = http_testing.MockClient((request) async {
    // ⚠️ **必须写字节，不写字符串** —— `http.Response(String)` 默认按
    // **latin1** 编码 ⇒ 载荷里的中文（「写周报」）会抛
    // 「Invalid argument (string): Contains invalid characters.」
    // ⇒ ⇒ 这里显式按 **UTF-8** 编（真客户端那条路是
    // `response.stream.transform(utf8.decoder)` 显式按 UTF-8 解流的）。
    return http.Response.bytes(
      utf8.encode(payload),
      200,
      headers: const {'content-type': 'text/event-stream'},
    );
  });
  return GenUIAgentService(
    serverUrl: 'http://127.0.0.1:60080/a2a',
    catalog: ShadowCatalog.create(),
    client: mock,
  );
}
