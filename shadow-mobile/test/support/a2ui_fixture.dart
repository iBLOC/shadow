import 'dart:convert';
import 'dart:io';

import 'package:shadow_mobile/services/a2ui/a2ui_agent_service.dart';
import 'package:shadow_mobile/services/a2ui/shadow_catalog.dart';

/// 端脑导出的**真实 SSE 字节** —— 权威样本。
///
/// ⚠️ 它是**共享 fixture**（桌面端 `clientTools.a2ui.test.ts` 与
/// `a2ui.inline.test.tsx` 断言的是**同一份**）
/// ⇒ ⇒ 两端吃的是同一批事件 ⇒ ⇒ 两端的形状不会漂。
String readA2uiSseFixture() => _readSharedFixture('fixtures/a2ui/tasks_sse.txt');

/// 端脑的 **v0.8 旧形状** —— 跨端仓里**另一份**共享 fixture
/// （`fixtures/a2ui/tasks_sse_v08.txt`）。
///
/// ⚠️ 它的用途是**钉住「版本没对上」那一档**：客户端声明的是 v1.0
///    ⇒ ⇒ 对端还回旧形状 ⇒ ⇒ 必须**响亮地报出来**（不许静默忽略）。
String readA2uiSseFixtureV08() =>
    _readSharedFixture('fixtures/a2ui/tasks_sse_v08.txt');

/// 读一份跨端仓里的共享 fixture。
String _readSharedFixture(String relative) {
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
List<Map<String, Object?>> a2uiFixtureEvents() =>
    _eventsOfSse(readA2uiSseFixture());

/// **v0.8 旧形状**的那一批事件（`tasks_sse_v08.txt`）。
List<Map<String, Object?>> a2uiFixtureEventsV08() =>
    _eventsOfSse(readA2uiSseFixtureV08());

/// SSE 字节 ⇒ 一条条 A2A 事件。
List<Map<String, Object?>> _eventsOfSse(String sse) {
  final out = <Map<String, Object?>>[];
  for (final line in sse.split(RegExp(r'\r?\n'))) {
    final trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    final decoded = jsonDecode(trimmed.substring('data:'.length).trim());
    if (decoded is Map) out.add(Map<String, Object?>.from(decoded));
  }
  return out;
}

/// 把一条 A2UI 消息包成端脑那种 **A2A 事件**。
///
/// ⚠️ **形状逐字照端脑**（`telencephalon/src/a2a/a2ui.rs` 的 `a2ui_event`）
/// ⇒ `result.status.message.parts[]` 里 `kind == "data"` 的那个 part
/// 的 `data` 才是 A2UI 载荷 ⇒ ⇒ 客户端只认这一处路径。
Map<String, Object?> a2aEventOf(Map<String, Object?> message) {
  return <String, Object?>{
    'result': <String, Object?>{
      'kind': 'task-status-update',
      'taskId': 't1',
      'contextId': 'c1',
      'status': <String, Object?>{
        'state': 'completed',
        'message': <String, Object?>{
          'kind': 'message',
          'messageId': 'm1',
          'role': 'agent',
          'parts': <Map<String, Object?>>[
            <String, Object?>{'kind': 'data', 'data': message},
          ],
        },
      },
      'final': true,
    },
  };
}

/// 端脑那种 A2A 事件，但 `parts[].data` **装的是原始值**（可以是字符串）。
///
/// ⚠️ 用来钉「载荷形状不对时客户端必须说真话」那一档 ——
///    官方 v1.0 要求 `data` 是对象；若对端发成 JSON 字符串 ⇒ ⇒ 官方 SDK 整条跳过
///    ⇒ ⇒ 界面空白 ⇒ ⇒ **失败长得像成功** ⇒ ⇒ 客户端必须**响亮地报**。
Map<String, Object?> a2aEventWithRawData(Object? data) {
  return <String, Object?>{
    'result': <String, Object?>{
      'kind': 'task-status-update',
      'taskId': 't1',
      'contextId': 'c1',
      'status': <String, Object?>{
        'state': 'completed',
        'message': <String, Object?>{
          'kind': 'message',
          'messageId': 'm1',
          'role': 'agent',
          'parts': <Map<String, Object?>>[
            <String, Object?>{'kind': 'data', 'data': data},
          ],
        },
      },
      'final': true,
    },
  };
}

/// 端脑**真字节**的那批事件，但把 `parts[].data` 换成 **JSON 字符串**。
///
/// ⚠️ 形状除了一处（载荷的载体）与真字节**逐字相同** ⇒ ⇒ 测的正是
///    「载荷发成字符串时客户端会不会说真话」那一格。
List<Map<String, Object?>> a2uiFixtureEventsWithStringPayload() {
  final out = <Map<String, Object?>>[];
  for (final event in a2uiFixtureEvents()) {
    final result = event['result'];
    if (result is! Map) {
      out.add(event);
      continue;
    }
    final status = result['status'];
    if (status is! Map) {
      out.add(event);
      continue;
    }
    final message = status['message'];
    if (message is! Map) {
      out.add(event);
      continue;
    }
    final parts = message['parts'];
    if (parts is! List) {
      out.add(event);
      continue;
    }
    final newParts = <Map<String, Object?>>[];
    for (final part in parts) {
      if (part is Map && part['kind'] == 'data' && part['data'] != null) {
        newParts.add(<String, Object?>{
          'kind': 'data',
          'data': jsonEncode(part['data']),
        });
      } else if (part is Map) {
        newParts.add(Map<String, Object?>.from(part));
      }
    }
    out.add(<String, Object?>{
      'result': <String, Object?>{
        ...Map<String, Object?>.from(result),
        'status': <String, Object?>{
          ...Map<String, Object?>.from(status),
          'message': <String, Object?>{
            ...Map<String, Object?>.from(message),
            'parts': newParts,
          },
        },
      },
    });
  }
  return out;
}

/// 把一批 A2A 事件写成端脑那种 SSE 字节（`data: {…}\n\n`）。
String a2uiSseOf(List<Map<String, Object?>> events) =>
    events.map((e) => 'data: ${jsonEncode(e)}\n\n').join();

/// 端脑的**纯文本**事件（没有 A2UI 载荷）—— 逐字照端脑的形状
/// （`telencephalon/src/a2a/a2ui.rs` 的 `text_event`）。
Map<String, Object?> a2aTextEventOf(String text) {
  return <String, Object?>{
    'result': <String, Object?>{
      'kind': 'task-status-update',
      'taskId': 't1',
      'contextId': 'c1',
      'status': <String, Object?>{
        'state': 'completed',
        'message': <String, Object?>{
          'kind': 'message',
          'messageId': 'm1',
          'role': 'agent',
          'parts': <Map<String, Object?>>[
            <String, Object?>{'kind': 'text', 'text': text},
          ],
        },
      },
      'final': true,
    },
  };
}

/// **测试自己拼**的那份 **v1.0 任务看板** —— 与共享 fixture 同一份内容。
///
/// ## 它管什么
///
/// 共享 fixture（`fixtures/a2ui/tasks_surface.json`）**本身已经是合规的**
/// ⇒ ⇒ 「共享 fixture 真的渲染得出来」由 `a2ui_contract_test.dart` 钉。
///
/// ⇒ 这一份**在测试里现拼**，是为了两件 fixture **钉不到**的事：
///
/// ❶ **负控**：把组件 id 换成不合规的（带连字符）⇒ ⇒ 官方 SDK **必须拒**
///    （v1.0 的 id 形状是 `[XID_Start_][XID_Continue]*` ⇒ **连字符不行**）。
/// ❷ **叶区面板**：共享 fixture 里没有 `AgentStatusIndicator` 那张面
///    ⇒ ⇒ 这里现拼一份（目录用 **`catalogId`** 点名 —— 不是 `@catalogId`：
///    v1.0 只认 `@path` / `@call` 两个保留键）。
Map<String, Object?> conformantTasksMessage({
  String surfaceId = 'shadow.tasks',
}) {
  return <String, Object?>{
    'version': '1.0',
    'createSurface': <String, Object?>{
      'surfaceId': surfaceId,
      'catalogId': basicCatalogId,
      'components': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'root',
          'component': 'Column',
          'children': <String>['title', 'task0'],
        },
        <String, Object?>{
          'id': 'title',
          'component': 'Text',
          'text': '# Tasks (1)',
        },
        <String, Object?>{
          'id': 'task0',
          'component': 'TaskCard',
          'catalogId': shadowCatalogId,
          'title': '写周报',
          'description': '本周进展汇总',
          'status': 'in_progress',
          'priority': 'high',
        },
      ],
    },
  };
}

/// 合规的 v1.0 任务看板 ⇒ 端脑那种 **A2A 事件**（客户端吃的就是这一份）。
List<Map<String, Object?>> conformantTasksEvents({
  String surfaceId = 'shadow.tasks',
}) {
  return <Map<String, Object?>>[
    a2aEventOf(conformantTasksMessage(surfaceId: surfaceId)),
  ];
}

/// 端脑的**纯文本**事件 ⇒ **SSE 字节**（端脑 `POST /a2a` 发的那个形状）。
///
/// ⚠️ 端脑「这次没有可渲染的视图」时走这条 ⇒ ⇒ 客户端必须把那段话
///    **如实显示**（不许显示一个空 surface）。
String a2aTextSse(String text) => 'data: ${jsonEncode(a2aTextEventOf(text))}\n\n';

/// 合规的 v1.0 任务看板 ⇒ **SSE 字节**（端脑 `POST /a2a` 发的那个形状）。
String conformantTasksSse({String surfaceId = 'shadow.tasks'}) {
  return 'data: ${jsonEncode(a2aEventOf(conformantTasksMessage(surfaceId: surfaceId)))}\n\n';
}

/// 合规的 v1.0 **叶区面板**（`AgentStatusIndicator` 那一个自建组件）。
///
/// ⚠️ 目录用 `catalogId` 点名（不是 `@catalogId`）⇒ ⇒ 它走**自建目录**
/// ⇒ ⇒ 标准组件（`Column`）走**面的默认目录**（官方基础目录）。
Map<String, Object?> conformantAgentsMessage({
  String surfaceId = 'shadow.agents',
}) {
  return <String, Object?>{
    'version': '1.0',
    'createSurface': <String, Object?>{
      'surfaceId': surfaceId,
      'catalogId': basicCatalogId,
      'components': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'root',
          'component': 'Column',
          'children': <String>['a0', 'a1'],
        },
        <String, Object?>{
          'id': 'a0',
          'component': 'AgentStatusIndicator',
          'catalogId': shadowCatalogId,
          'agentName': 'parietal',
          'status': 'unknown',
          'message': 'not probed',
        },
        <String, Object?>{
          'id': 'a1',
          'component': 'AgentStatusIndicator',
          'catalogId': shadowCatalogId,
          'agentName': 'frontal',
          'status': 'idle',
        },
      ],
    },
  };
}

/// 一个**只会回放这段 SSE**的端脑 —— 但走的是**真的**传输层
/// （`ShadowKeySseTransport` → 真 HTTP → SSE 解析）。
///
/// ⚠️ **为什么不用假 fetcher**：假 fetcher 会把「传输层有没有把 `result`
/// 信封包回去」这件事**测掉** ⇒ ⇒ 那样断言的就不是「端脑发的那条事件」
/// 了 ⇒ ⇒ 契约就漏检了。
///
/// ⚠️ **客户端不再支持注入 `http.Client`**（`A2uiAgentService` 的构造
/// 里没有这一格）⇒ ⇒ 这里起一个**真的本地 HTTP 服务**来回放。
Future<A2uiAgentService> a2uiFixtureService({String? body}) async {
  final payload = body ?? readA2uiSseFixture();
  // ⚠️ 测试框架默认把**所有** HTTP 请求打成 400
  // （`TestWidgetsFlutterBinding` 的 `_MockHttpOverrides`）⇒ 必须放开。
  HttpOverrides.global = null;
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) async {
    request.response.headers.contentType =
        ContentType('text', 'event-stream', charset: 'utf-8');
    // ⚠️ **写字节，不写字符串**：`HttpResponse.write(String)` 默认按
    // **latin1** 编码 ⇒ 载荷里的中文（「写周报」）会抛
    // 「Invalid argument (string): Contains invalid characters.」。
    request.response.add(utf8.encode(payload));
    await request.response.close();
  });
  return _FixtureAgentService(
    serverUrl: 'http://${server.address.address}:${server.port}/a2a',
    shadowKeyProvider: () => null,
    server: server,
  );
}

/// 真的本地端脑 —— `dispose()` 时把那个 HTTP 服务一起关掉。
class _FixtureAgentService extends A2uiAgentService {
  _FixtureAgentService({
    required super.serverUrl,
    required super.shadowKeyProvider,
    required this.server,
  });

  final HttpServer server;

  @override
  Future<void> dispose() async {
    await super.dispose();
    await server.close(force: true);
  }
}
