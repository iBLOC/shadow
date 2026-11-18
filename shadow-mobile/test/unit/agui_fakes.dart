import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// 判据用的**假 TTS**（不发声，只占住那个位置）。
class MockTts extends TtsEngine {
  @override
  Future<TtsSpeakResult> speak(String text, {String lang = 'zh-CN', bool allowFallback = true, String? lobe, bool reportSkip = true, bool force = false}) async =>
      const TtsSpeakResult.spoke();
}

/// 端脑的**非 AG-UI 那几个**调用（建会话／喂轨迹）。
///
/// ⚠️ AG-UI 那一面（流／工具闭环）由 [FakeAguiBrain] 假 ⇒ ⇒ 那边**只假运输层**
/// ⇒ ⇒ driver／协议解析／provider 的执行器**全是真的**
/// ⇒ ⇒ 判据钉的是**生产那一路**（与桌面端 `fetchImpl` 假法同口径）。
class ToolMockClient extends TelencephalonClient {
  /// 「思维定式」ingest 调用的记录（测试断言用）。
  final List<Map<String, dynamic>> ingestCalls = <Map<String, dynamic>>[];

  ToolMockClient() : super(baseUrl: 'http://127.0.0.1:60080');

  @override
  Future<void> ingestTrace({
    required String source,
    required List<Map<String, dynamic>> trajectory,
    String? userInput,
    String? intentSignature,
  }) async {
    ingestCalls.add(<String, dynamic>{
      'source': source,
      'user_input': userInput,
      'intent_signature': intentSignature,
      'trajectory': trajectory,
    });
  }

  /// legacy 旁路（`/tool-results`）的调用记录。
  ///
  /// ⚠️ **AG-UI 那一路不许走它** ⇒ ⇒ 结果随**下一次请求**带回去 ⇒ ⇒
  /// 这里必须**空** ⇒ ⇒ 一旦有人把 `reportToTelencephalon` 打开，判据
  /// 就红（多发一次 ⇒ 端脑那边收到两份结果 ⇒ 那是另一种「失败长得像
  /// 成功」）。
  final List<Map<String, dynamic>> legacyReports = <Map<String, dynamic>>[];

  @override
  Future<void> reportToolResult(
    String conversationId, {
    required String name,
    String? toolCallId,
    required Object? result,
    bool ok = true,
  }) async {
    legacyReports.add(<String, dynamic>{
      'conversation_id': conversationId,
      'name': name,
      'tool_call_id': toolCallId,
      'result': result,
      'ok': ok,
    });
  }

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    final now = DateTime.now();
    return Conversation(
      id: 'conv-1',
      agent: agent ?? 'test-agent',
      createdAt: now,
      updatedAt: now,
      history: const [],
    );
  }
}

/// 一台**假的端脑**（AG-UI 那一面）。
///
/// ⚠️ **只假运输层** —— driver／SSE 解析／协议归约／provider 的执行器
/// **全都是真的** ⇒ ⇒ 判据钉的是**生产那一路**。
///
/// ⚠️ **与桌面端同口径**：桌面端假的是 `fetch`（`fetchImpl`）⇒ ⇒
/// 两端判据假的是**同一层** ⇒ ⇒ 端脑改一处，两端都会**当场红**。
class FakeAguiBrain extends http.BaseClient {
  /// 每一轮请求的**请求体**（断言「工具结果随下一次请求带回去」用）。
  final List<Map<String, dynamic>> requests = <Map<String, dynamic>>[];

  /// 每一轮要吐的 SSE 帧（按轮次取；取完最后一份就**重复最后一份**）。
  final List<List<String>> rounds;

  /// 某一轮要吐的帧（**按需算**）—— 「回复内容」这类**可变量**
  /// ⇒ ⇒ 必须在**发请求那一刻**才读（不然「空回复」那一档测不出来）。
  ///
  /// ⚠️ **第二个参数是那一轮的请求体** ⇒ ⇒ 「这一轮是新的一轮还是**续轮**」
  /// 判得出来（续轮 ⇒ ⇒ 请求里**带** tool 消息）⇒ ⇒ 多轮判据才立得住
  /// （否则「第二轮又点名一次」那一档测不出来）。
  final List<String> Function(int round, Map<String, dynamic> request)?
      framesFor;

  /// 某一轮的 HTTP 状态码（默认 200 ⇒ ⇒ 非 2xx 用它验「抛带原话」）。
  final List<int> statuses;

  /// 某一轮要回的**错误正文**（非 2xx 时用）。
  final List<String> bodies;

  /// 每帧之间的间隔（**造「真的流过」的计时窗**用）。
  final Duration frameDelay;

  int _round = 0;

  FakeAguiBrain({
    required this.rounds,
    this.framesFor,
    this.statuses = const <int>[],
    this.bodies = const <String>[],
    this.frameDelay = Duration.zero,
  });

  /// 已经接过几轮请求（0 起）—— 断言「结果随**下一次**请求带回去」用。
  int get roundCount => _round;

  /// **legacy 形状**的回传记录（老判据断言「结果回传端脑了」用）。
  ///
  /// ⚠️ AG-UI 那一路**没有** `/tool-results` 旁路 ⇒ ⇒ 结果随**下一次请求**
  /// 带回去 ⇒ ⇒ 这里把那条 tool 消息**翻译成**老判据认识的形状
  /// ⇒ ⇒ 老判据的断言**一个字不用改** ⇒ ⇒ 而它钉的机制**是真的**
  /// （结果确实走了下一次请求 —— 没有它，这里就是空的）。
  final List<Map<String, dynamic>> reports = <Map<String, dynamic>>[];

  /// 工具名（按调用 id 记）—— 老判据要断言 `name`。
  final Map<String, String> toolNames = <String, String>{};

  /// 每一轮请求的 URL（**会话 id 在路径里**）。
  final List<String> requestUrls = [];

  /// 最近一次请求用的**会话 id**。
  ///
  /// ⚠️ AG-UI 那一路的会话 id 在**路径**里（`/conversations/{id}/ag-ui:stream`）
  /// ⇒ ⇒ 「这条消息续在哪条会话上」从这儿看 ⇒ ⇒ 与 legacy 那个入参同一个意思。
  String? get lastConversationId {
    if (requestUrls.isEmpty) return null;
    final List<String> segments = Uri.parse(requestUrls.last).pathSegments;
    for (int i = 0; i < segments.length - 1; i++) {
      if (segments[i] == 'conversations') return segments[i + 1];
    }
    return null;
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final String body = await request.finalize().bytesToString();
    requestUrls.add(request.url.toString());
    final Map<String, dynamic> parsed =
        jsonDecode(body) as Map<String, dynamic>;
    requests.add(parsed);
    _recordToolResult(parsed);
    final int roundIndex = _round;
    final int index =
        roundIndex < rounds.length ? roundIndex : rounds.length - 1;
    // ⚠️ **按需算的那一份优先** ⇒ ⇒ 「回复内容」这类变量在**发请求那一刻**
    // 才读 ⇒ ⇒ 「空回复＝失败」那一档才测得出来。
    final List<String> frames = framesFor != null
        ? framesFor!(roundIndex, parsed)
        : (rounds.isEmpty ? const <String>[] : rounds[index]);
    _round++;
    // ⚠️ 状态码按**轮次**取（不是按帧的下标）⇒ ⇒ 「先失败 N 次」
    // ⇒ ⇒ 第 N+1 次真的就成功了（按帧下标取会永远失败）。
    final int status =
        roundIndex < statuses.length ? statuses[roundIndex] : 200;
    _recordToolNames(frames);
    if (status >= 200 && status < 300) {
      return http.StreamedResponse(
        frameDelay == Duration.zero
            ? Stream<List<int>>.fromIterable(
                frames.map((String frame) => utf8.encode(frame)),
              )
            : _delayed(frames),
        status,
        headers: const <String, String>{'content-type': 'text/event-stream'},
      );
    }
    // ⚠️ **非 2xx ⇒ 回一段正文** ⇒ ⇒ 端脑的原话要能被客户端看见。
    final String text =
        roundIndex < bodies.length ? bodies[roundIndex] : 'boom';
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(text)),
      status,
      headers: const <String, String>{'content-type': 'application/json'},
    );
  }

  /// 一帧一帧地吐（中间**等**一下）⇒ ⇒ 「真的流过」那个计时窗才成立。
  Stream<List<int>> _delayed(List<String> frames) async* {
    for (final String frame in frames) {
      await Future<void>.delayed(frameDelay);
      yield utf8.encode(frame);
    }
  }

  /// 把这一轮请求里那条 **tool 消息**记成 legacy 形状的回传。
  void _recordToolResult(Map<String, dynamic> request) {
    final List<dynamic> messages =
        request['messages'] as List<dynamic>? ?? const <dynamic>[];
    for (final dynamic m in messages.reversed) {
      final Map<String, dynamic> msg = (m as Map).cast<String, dynamic>();
      if (msg['role'] != 'tool') continue;
      final String? id = msg['toolCallId'] as String?;
      reports.add(<String, dynamic>{
        'conversation_id': 'conv-1',
        'name': (id == null ? '' : toolNames[id] ?? ''),
        'tool_call_id': id,
        'result': _decodeToolContent(msg['content']),
        'ok': msg['error'] == null,
        // ⚠️ **失败原因也要在** —— AG-UI 这一路失败**带 error**（content 是空）
        // ⇒ ⇒ 模型看到的是**那句原因** ⇒ ⇒ 判据要能看见它。
        'error': msg['error'],
      });
      return;
    }
  }

  /// 记下这一轮点名了哪些工具（老判据要断言工具名）。
  void _recordToolNames(List<String> frames) {
    for (final String frame in frames) {
      if (!frame.startsWith('data:')) continue;
      Map<String, dynamic>? data;
      try {
        data = jsonDecode(frame.substring(5).trim()) as Map<String, dynamic>;
      } catch (_) {
        continue;
      }
      if (data['type'] != 'TOOL_CALL_START') continue;
      final String? id = data['toolCallId'] as String?;
      final String? name = data['toolCallName'] as String?;
      if (id != null && name != null) toolNames[id] = name;
    }
  }

  /// tool 消息的 content 是 **JSON 字符串** ⇒ ⇒ 老判据要的是**对象**。
  Object? _decodeToolContent(Object? content) {
    if (content is! String) return content;
    try {
      return jsonDecode(content);
    } catch (_) {
      return content;
    }
  }
}

/// 这一轮请求里**带** tool 消息没有（= 这是不是**续轮**）。
///
/// ⚠️ AG-UI 的工具闭环是「结果随**下一次请求**带回去」⇒ ⇒ 续轮那一轮的
/// 请求里**多一条** role == 'tool' 的消息 ⇒ ⇒ 用它分辨「新的一轮」与
/// 「上一轮的结果回来了」。
bool aguiHasToolMessage(Map<String, dynamic> request) {
  final List<dynamic> messages =
      request['messages'] as List<dynamic>? ?? const <dynamic>[];
  for (final dynamic m in messages) {
    final Map<String, dynamic> msg = (m as Map).cast<String, dynamic>();
    if (msg['role'] == 'tool') return true;
  }
  return false;
}

/// 一条 AG-UI 请求里**内联附件**那几个 part（文本 part 不算）。
///
/// ⚠️ AG-UI 的附件 part 是 `{type, source:{type:'data', value, mimeType}}`
/// ⇒ ⇒ 键名是 **mimeType**（驼峰）—— 不是 legacy 的 media_type。
List<Map<String, dynamic>> aguiAttachmentParts(
  Map<String, dynamic> request,
) {
  final List<Map<String, dynamic>> parts = <Map<String, dynamic>>[];
  final List<dynamic> messages =
      request['messages'] as List<dynamic>? ?? const <dynamic>[];
  for (final dynamic m in messages) {
    final Map<String, dynamic> msg = (m as Map).cast<String, dynamic>();
    final Object? content = msg['content'];
    if (content is! List) continue;
    for (final dynamic part in content) {
      final Map<String, dynamic> p = (part as Map).cast<String, dynamic>();
      if (p['type'] == 'text') continue;
      parts.add(p);
    }
  }
  return parts;
}

/// 一条 AG-UI 请求里第一份内联附件的 MIME（**驼峰** mimeType）。
String? aguiAttachmentMimeType(Map<String, dynamic> request) {
  final List<Map<String, dynamic>> parts = aguiAttachmentParts(request);
  if (parts.isEmpty) return null;
  final Object? source = parts.first['source'];
  if (source is! Map) return null;
  return source['mimeType'] as String?;
}

/// 一条 AG-UI 请求里**用户那句话**（老判据要断言「发出去的是哪一句」）。
///
/// ⚠️ AG-UI 的 content 是**part 列表**（文本 ＋ 内联附件）⇒ ⇒ 那一句在
/// `type == 'text'` 的那个 part 里。
String aguiSentText(Map<String, dynamic> request) {
  final List<dynamic> messages =
      request['messages'] as List<dynamic>? ?? const <dynamic>[];
  for (final dynamic m in messages.reversed) {
    final Map<String, dynamic> msg = (m as Map).cast<String, dynamic>();
    if (msg['role'] != 'user') continue;
    final Object? content = msg['content'];
    if (content is String) return content;
    if (content is List) {
      for (final dynamic part in content) {
        final Map<String, dynamic> p = (part as Map).cast<String, dynamic>();
        if (p['type'] == 'text') return (p['text'] as String?) ?? '';
      }
    }
  }
  return '';
}

/// 一帧 AG-UI 事件（端脑只发 `data:` 行 —— **不带** event 名）。
String aguiFrame(
  String type, [
  Map<String, dynamic> extra = const <String, dynamic>{},
]) {
  return "data:${jsonEncode(<String, dynamic>{'type': type, ...extra})}\n\n";
}

/// 文本增量。
String aguiText(String delta, {String messageId = 'm1'}) {
  return aguiFrame('TEXT_MESSAGE_CONTENT', <String, dynamic>{
    'messageId': messageId,
    'delta': delta,
  });
}

/// 一次工具点名（**三帧**：start ＋ args ＋ end —— 协议如此）。
List<String> aguiToolCall({
  required String toolCallId,
  required String toolCallName,
  String argsJson = '{}',
}) {
  return <String>[
    aguiFrame('TOOL_CALL_START', <String, dynamic>{
      'toolCallId': toolCallId,
      'toolCallName': toolCallName,
    }),
    aguiFrame('TOOL_CALL_ARGS', <String, dynamic>{
      'toolCallId': toolCallId,
      'delta': argsJson,
    }),
    aguiFrame('TOOL_CALL_END', <String, dynamic>{'toolCallId': toolCallId}),
  ];
}

/// 收口（RUN_FINISHED）。
String aguiFinished({String runId = 'r1', String threadId = 't'}) {
  return aguiFrame('RUN_FINISHED', <String, dynamic>{
    'threadId': threadId,
    'runId': runId,
  });
}

/// **判据侧**的翻译器：legacy 的 `StreamEvent` ⇒ AG-UI 的帧。
///
/// ⚠️ 为什么需要它：老判据用 `StreamEvent` 描述「端脑发了什么」
/// ⇒ ⇒ 这一层把它们翻成 AG-UI 的帧 ⇒ ⇒ 老判据的**输入**一个字不用改
/// ⇒ ⇒ 而它钉的机制**是真的**（真 driver／真协议／真执行器）。
///
/// ⚠️ **不是生产代码** —— 生产那一路早就是 AG-UI 了 ⇒ ⇒ 这里只是让老判据
/// 的**输入**还能用 ⇒ ⇒ 而**断言**仍钉在真机制上。
List<String> aguiFramesFromStreamEvents(List<StreamEvent> events) {
  final List<String> frames = <String>[];
  for (final StreamEvent ev in events) {
    if (ev.type == 'delta') {
      final String delta = ev.delta ?? '';
      if (delta.isNotEmpty) frames.add(aguiText(delta));
      continue;
    }
    if (ev.type == 'tool_call') {
      final String name = ev.name ?? '';
      frames.addAll(aguiToolCall(
        toolCallId: ev.toolCallId ?? 'legacy-$name',
        toolCallName: name,
        argsJson: jsonEncode(ev.args ?? <String, dynamic>{}),
      ));
      continue;
    }
    if (ev.type == 'error') {
      frames.add(aguiError(ev.error ?? 'legacy stream error'));
      continue;
    }
  }
  frames.add(aguiFinished());
  return frames;
}

/// 失败（RUN_ERROR —— **带端脑的原话**，不改写）。
String aguiError(String message, {String runId = 'r9'}) {
  return aguiFrame('RUN_ERROR', <String, dynamic>{
    'message': message,
    'metadata': <String, dynamic>{'runId': runId},
  });
}
