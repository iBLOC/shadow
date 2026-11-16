import 'dart:convert';

/// AG-UI 1.0 的 wire 形状 —— **只认端脑真发的那几种**。
///
/// ⚠️ 形状逐字对着端脑 `src/api/shadow/agui.rs` 的翻译表 ⇒ ⇒ 改那边就要改这边
/// （跨端对账的两份：移动端这里 ＋ 桌面端 `src/lib/agui/types.ts`）⇒ ⇒ 两端
/// 的「同一份协议」是**两份实现、同一份逐字口径**。
///
/// ⚠️ **失败不许长得像成功**：坏 JSON ⇒ 抛；缺 `type` ⇒ 抛；未知类型 ⇒ 忽略
/// 但**出声**（规范要求消费者忽略不认识的类型）⇒ ⇒ 三档各有一档的读数。
///
/// ⚠️ **与既有那把 transport 的差别要说清**：既有 `streamMessage` 对坏帧是
/// `// skip malformed`（**静默跳过**）⇒ ⇒ 这一层**刻意不学它** —— AG-UI 路
/// 的帧是协议帧，掉一帧就是「回复少了一段」，必须响亮。

/// 端脑发的 CUSTOM 名字（**逐字**对着端脑 `agui.rs` 里那四处 `custom(...)` 调用）。
class AguiCustomNames {
  const AguiCustomNames._();

  /// lobe 本地工具的结果（**不是** AG-UI 的 TOOL_CALL_RESULT —— 端脑刻意不发那个）。
  static const String toolResult = 'telencephalon_tool_result';
  static const String step = 'step';
  static const String route = 'route';
  static const String handoff = 'handoff';
}

/// 我们真认的那几种（**逐字**对着端脑 `agui.rs` 的翻译表）。
const List<String> aguiKnownEventTypes = <String>[
  'RUN_STARTED',
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'TOOL_CALL_START',
  'TOOL_CALL_ARGS',
  'TOOL_CALL_END',
  'RUN_FINISHED',
  'RUN_ERROR',
  'CUSTOM',
];

/// 协议层自己抛的错（**响亮**：不让坏帧静默过去）。
class AguiProtocolException implements Exception {
  final String message;

  const AguiProtocolException(this.message);

  @override
  String toString() => 'AguiProtocolException: $message';
}

/// 一个 AG-UI 事件（**保真**：原样收着，不改写）。
class AguiEvent {
  final String type;
  final Map<String, dynamic> data;

  const AguiEvent(this.type, this.data);

  /// 一行 data ⇒ ⇒ 一个事件。
  ///
  /// ⚠️ **坏 JSON ⇒ 抛**；**缺 type ⇒ 抛**；**不认识的 type ⇒ 不抛**（规范要求
  /// 消费者忽略未知类型）⇒ ⇒ 但**记下来**（见 `reduceAguiEvent`）。
  factory AguiEvent.parse(String payload) {
    Object? decoded;
    try {
      decoded = jsonDecode(payload);
    } catch (_) {
      final String head =
          payload.length > 200 ? payload.substring(0, 200) : payload;
      throw AguiProtocolException('ag-ui event is not valid JSON: $head');
    }
    if (decoded is! Map) {
      throw const AguiProtocolException('ag-ui event must be a JSON object');
    }
    final Object? rawType = decoded['type'];
    if (rawType is! String) {
      throw const AguiProtocolException('ag-ui event carries no type');
    }
    return AguiEvent(rawType, decoded.cast<String, dynamic>());
  }

  /// 认得的事件？
  bool get isKnown => aguiKnownEventTypes.contains(type);

  String? _s(String key) {
    final Object? v = data[key];
    return v is String ? v : null;
  }

  String? get messageId => _s('messageId');
  String? get role => _s('role');
  String? get delta => _s('delta');
  String? get toolCallId => _s('toolCallId');
  String? get toolCallName => _s('toolCallName');
  String? get parentMessageId => _s('parentMessageId');
  String? get runId => _s('runId');
  String? get threadId => _s('threadId');
  String? get protocolVersion => _s('protocolVersion');
  String? get name => _s('name');
  String? get message => _s('message');

  Object? get value => data['value'];

  Map<String, dynamic>? get metadata {
    final Object? m = data['metadata'];
    return m is Map ? m.cast<String, dynamic>() : null;
  }

  Map<String, dynamic>? get outcome {
    final Object? o = data['outcome'];
    return o is Map ? o.cast<String, dynamic>() : null;
  }
}

/// 文本消息段（一段 = 一条 messageId）。
class AguiMessageSegment {
  final String messageId;
  final String role;
  final String text;
  final bool ended;

  const AguiMessageSegment({
    required this.messageId,
    required this.role,
    required this.text,
    required this.ended,
  });

  AguiMessageSegment copyWith({String? role, String? text, bool? ended}) {
    return AguiMessageSegment(
      messageId: messageId,
      role: role ?? this.role,
      text: text ?? this.text,
      ended: ended ?? this.ended,
    );
  }
}

/// 工具调用（一次 = 一个 toolCallId）。
class AguiToolCallState {
  final String toolCallId;
  final String toolCallName;
  final String args;
  final String? parentMessageId;
  final bool ended;

  const AguiToolCallState({
    required this.toolCallId,
    required this.toolCallName,
    required this.args,
    required this.parentMessageId,
    required this.ended,
  });

  AguiToolCallState copyWith({String? toolCallName, String? args, bool? ended}) {
    return AguiToolCallState(
      toolCallId: toolCallId,
      toolCallName: toolCallName ?? this.toolCallName,
      args: args ?? this.args,
      parentMessageId: parentMessageId,
      ended: ended ?? this.ended,
    );
  }
}

/// 端脑发的 CUSTOM（**原样**：不解释、不改写）。
class AguiCustomRecord {
  final String name;
  final Object? value;

  const AguiCustomRecord({required this.name, required this.value});
}

/// 端脑发的那种工具结果（**lobe 本地工具**，走 CUSTOM 而不是 TOOL_CALL_RESULT）。
class AguiToolResultRecord {
  final String agent;
  final String name;
  final Object? result;
  final String? toolCallId;

  const AguiToolResultRecord({
    required this.agent,
    required this.name,
    required this.result,
    required this.toolCallId,
  });
}

/// 一轮对话在客户端这一侧归约出来的状态。
class AguiTurnState {
  final String? runId;
  final String? threadId;
  final String? protocolVersion;

  /// `running` ／ `finished` ／ `failed`。
  final String status;

  /// 文本消息段（一段 = 一条 messageId）。
  final List<AguiMessageSegment> messages;

  /// 工具调用（一次 = 一个 toolCallId）。
  final List<AguiToolCallState> toolCalls;

  /// 失败时端脑的原话（**不改写**）。
  final String? error;

  /// 1.0 的收口结果（缺省即 success ⇒ ⇒ 没有这一项时是 null）。
  final String? outcome;

  /// 不认识的事件类型（规范：忽略，但**出声**）。
  final List<String> unknownEventTypes;

  /// 端脑发的 CUSTOM（工具结果／step／route／handoff）—— **原样收着，不丢**。
  final List<AguiCustomRecord> customs;

  /// 端脑自己的收口状态（`RUN_FINISHED.metadata.telencephalonState`）—— 原样带出。
  final String? endState;

  const AguiTurnState({
    required this.runId,
    required this.threadId,
    required this.protocolVersion,
    required this.status,
    required this.messages,
    required this.toolCalls,
    required this.error,
    required this.outcome,
    required this.unknownEventTypes,
    required this.customs,
    required this.endState,
  });

  /// `copyWith` 的空值语义：**空值覆盖不了旧值**。
  ///
  /// ⚠️ 这一族没有「把已设的值清掉」的场景（`runId`／`error`／`outcome`／
  /// `endState` 都只会被设一次）⇒ ⇒ 这个限制**不会**造成说谎。
  AguiTurnState copyWith({
    String? runId,
    String? threadId,
    String? protocolVersion,
    String? status,
    List<AguiMessageSegment>? messages,
    List<AguiToolCallState>? toolCalls,
    String? error,
    String? outcome,
    List<String>? unknownEventTypes,
    List<AguiCustomRecord>? customs,
    String? endState,
  }) {
    return AguiTurnState(
      runId: runId ?? this.runId,
      threadId: threadId ?? this.threadId,
      protocolVersion: protocolVersion ?? this.protocolVersion,
      status: status ?? this.status,
      messages: messages ?? this.messages,
      toolCalls: toolCalls ?? this.toolCalls,
      error: error ?? this.error,
      outcome: outcome ?? this.outcome,
      unknownEventTypes: unknownEventTypes ?? this.unknownEventTypes,
      customs: customs ?? this.customs,
      endState: endState ?? this.endState,
    );
  }
}

/// 一轮开始时的状态。
AguiTurnState initialAguiTurnState() {
  return const AguiTurnState(
    runId: null,
    threadId: null,
    protocolVersion: null,
    status: 'running',
    messages: <AguiMessageSegment>[],
    toolCalls: <AguiToolCallState>[],
    error: null,
    outcome: null,
    unknownEventTypes: <String>[],
    customs: <AguiCustomRecord>[],
    endState: null,
  );
}

/// 归约一个事件 ⇒ ⇒ 新状态（**纯函数**：不碰 UI、不发请求）。
AguiTurnState reduceAguiEvent(AguiTurnState state, AguiEvent event) {
  // ⚠️ **不认识的事件类型 ⇒ 记下来、不炸**（规范：消费者忽略未知类型）
  // ⇒ ⇒ 这一段**必须在 switch 之前**。
  if (!event.isKnown) {
    if (state.unknownEventTypes.contains(event.type)) return state;
    return state.copyWith(
      unknownEventTypes: <String>[...state.unknownEventTypes, event.type],
    );
  }
  switch (event.type) {
    case 'RUN_STARTED':
      return state.copyWith(
        runId: event.runId ?? state.runId,
        threadId: event.threadId ?? state.threadId,
        protocolVersion: event.protocolVersion ?? state.protocolVersion,
      );
    case 'TEXT_MESSAGE_START':
      final List<AguiMessageSegment> messages =
          List<AguiMessageSegment>.of(state.messages);
      final String id = event.messageId ?? '';
      final int at = messages.indexWhere((AguiMessageSegment m) => m.messageId == id);
      if (at >= 0) {
        messages[at] = messages[at].copyWith(role: event.role ?? messages[at].role);
      } else {
        messages.add(AguiMessageSegment(
          messageId: id,
          role: event.role ?? '',
          text: '',
          ended: false,
        ));
      }
      return state.copyWith(messages: messages);
    case 'TEXT_MESSAGE_CONTENT':
      final List<AguiMessageSegment> messages =
          List<AguiMessageSegment>.of(state.messages);
      final String id = event.messageId ?? '';
      final int at = messages.indexWhere((AguiMessageSegment m) => m.messageId == id);
      if (at >= 0) {
        messages[at] = messages[at].copyWith(text: messages[at].text + (event.delta ?? ''));
      }
      return state.copyWith(messages: messages);
    case 'TEXT_MESSAGE_END':
      final String id = event.messageId ?? '';
      return state.copyWith(
        messages: state.messages
            .map((AguiMessageSegment m) =>
                m.messageId == id ? m.copyWith(ended: true) : m)
            .toList(),
      );
    case 'TOOL_CALL_START':
      final List<AguiToolCallState> toolCalls =
          List<AguiToolCallState>.of(state.toolCalls);
      final String id = event.toolCallId ?? '';
      final int at = toolCalls.indexWhere((AguiToolCallState t) => t.toolCallId == id);
      if (at >= 0) {
        toolCalls[at] = toolCalls[at].copyWith(toolCallName: event.toolCallName);
      } else {
        toolCalls.add(AguiToolCallState(
          toolCallId: id,
          toolCallName: event.toolCallName ?? '',
          args: '',
          parentMessageId: event.parentMessageId,
          ended: false,
        ));
      }
      return state.copyWith(toolCalls: toolCalls);
    case 'TOOL_CALL_ARGS':
      final String id = event.toolCallId ?? '';
      return state.copyWith(
        toolCalls: state.toolCalls
            .map((AguiToolCallState t) =>
                t.toolCallId == id ? t.copyWith(args: t.args + (event.delta ?? '')) : t)
            .toList(),
      );
    case 'TOOL_CALL_END':
      final String id = event.toolCallId ?? '';
      return state.copyWith(
        toolCalls: state.toolCalls
            .map((AguiToolCallState t) =>
                t.toolCallId == id ? t.copyWith(ended: true) : t)
            .toList(),
      );
    case 'RUN_FINISHED':
      final Map<String, dynamic>? outcome = event.outcome;
      final Object? rawOutcome = outcome == null ? null : outcome['type'];
      final Map<String, dynamic>? metadata = event.metadata;
      final Object? rawEndState = metadata == null ? null : metadata['telencephalonState'];
      return state.copyWith(
        status: 'finished',
        runId: event.runId ?? state.runId,
        threadId: event.threadId ?? state.threadId,
        outcome: rawOutcome is String ? rawOutcome : null,
        endState: rawEndState is String ? rawEndState : null,
      );
    case 'RUN_ERROR':
      // ⚠️ `RunErrorEvent` 的 schema 是闭合的 ⇒ ⇒ runId 配在 metadata 里
      // ⇒ ⇒ **失败也要能对上这一轮**（不然报错落不到具体哪一轮）。
      final Map<String, dynamic>? metadata = event.metadata;
      final Object? rawRunId = metadata == null ? null : metadata['runId'];
      return state.copyWith(
        status: 'failed',
        error: event.message ?? '',
        runId: rawRunId is String ? rawRunId : state.runId,
      );
    case 'CUSTOM':
      // ⚠️ lobe 本地工具的结果、step／route／handoff **全走 CUSTOM**
      // ⇒ ⇒ 归约器**不许吞掉** ⇒ ⇒ 原样收着（**不解释、不改写**）。
      return state.copyWith(
        customs: <AguiCustomRecord>[
          ...state.customs,
          AguiCustomRecord(name: event.name ?? '', value: event.value),
        ],
      );
    default:
      // ⚠️ 认得的那几种都归约完了 ⇒ ⇒ 这里**到不了**。
      return state;
  }
}

/// 从 CUSTOM 里挑出工具结果 —— **只挑端脑真发的那种名字**（不猜、不编）。
///
/// ⚠️ 端脑**刻意不发** AG-UI 的 `TOOL_CALL_RESULT`（那要客户端把结果回传上去，
/// 与影仓「结果直接落在会话里」的架构不合）⇒ ⇒ 工具结果只走 CUSTOM 这一条路。
List<AguiToolResultRecord> aguiToolResults(AguiTurnState state) {
  final List<AguiToolResultRecord> out = <AguiToolResultRecord>[];
  for (final AguiCustomRecord c in state.customs) {
    if (c.name != AguiCustomNames.toolResult) continue;
    final Object? raw = c.value;
    final Map<String, dynamic> v =
        raw is Map ? raw.cast<String, dynamic>() : <String, dynamic>{};
    final Object? agent = v['agent'];
    final Object? name = v['name'];
    final Object? toolCallId = v['toolCallId'];
    out.add(AguiToolResultRecord(
      agent: agent is String ? agent : '',
      name: name is String ? name : '',
      result: v['result'],
      toolCallId: toolCallId is String ? toolCallId : null,
    ));
  }
  return out;
}
