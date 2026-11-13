import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import '../client_tools/client_tool_registry.dart';
import '../capabilities/capability_declaration.dart';
import '../../utils/conversation_title.dart';

class SessionExport {
  final String sessionId;
  final List<Map<String, dynamic>> messages;
  final int sizeBytes;

  const SessionExport({
    required this.sessionId,
    required this.messages,
    required this.sizeBytes,
  });

  factory SessionExport.fromJson(Map<String, dynamic> json) {
    return SessionExport(
      sessionId: json['session_id'] ?? json['id'] ?? '',
      messages:
          (json['messages'] as List<dynamic>?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList() ??
          [],
      sizeBytes: json['size_bytes'] ?? 0,
    );
  }
}

/// Telencephalon connection config
class TelencephalonConfig {
  final String baseUrl;
  final String? apiKey;
  const TelencephalonConfig({required this.baseUrl, this.apiKey});
}

class AgentCard {
  final String name;
  final String description;
  final String version;
  final String url;
  final List<String> inputModalities;
  final List<String> outputModalities;
  final List<String> capabilities;

  AgentCard({
    required this.name,
    required this.description,
    required this.version,
    required this.url,
    required this.inputModalities,
    required this.outputModalities,
    required this.capabilities,
  });

  factory AgentCard.fromJson(Map<String, dynamic> json) {
    final meta = json['metadata'] as Map<String, dynamic>? ?? const {};
    return AgentCard(
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      version: json['version'] as String? ?? '',
      url: json['url'] as String? ?? '',
      inputModalities:
          (meta['input_modalities'] as List?)?.cast<String>() ?? const [],
      outputModalities:
          (meta['output_modalities'] as List?)?.cast<String>() ?? const [],
      capabilities: (meta['capabilities'] as List?)?.cast<String>() ?? const [],
    );
  }
}

class LobeInfo {
  final String name;
  final String kind;
  final String url;
  final bool enabled;
  final List<String> skills;
  final AgentCard agentCard;
  final String healthStatus;

  /// 端脑给这个叶区存的**配置袋**（服务端判据：
  /// `telencephalon/src/api/shadow.rs` → `lobe_to_json` → `"config": l.config`）。
  ///
  /// ⚠️ 这是「**改单个叶区**」唯一能落笔的地方 ——
  /// 端脑的 `PATCH /api/telencephalon/agents/{name}/config` 会把这里的键
  /// **合并**进去（服务端：`update_lobe_config`）⇒ ⇒ 界面上的「设置」必须写进
  /// 这个袋 ⇒ 不然点完「保存」什么也没发生 ⇒ **失败长得像成功**。
  ///
  /// ⚠️ 别拿它当「模型路由」：端脑的模型路由是**整份下发**
  /// （`POST /api/telencephalon/lobes/models`）⇒ 单叶区改模型没有诚实的做法
  /// （把各叶区的**有效值**回填会把「跟随全局默认」钉死）⇒ ⇒ 这一袋只装
  /// 叶区自己的配置。
  final Map<String, dynamic> config;

  LobeInfo({
    required this.name,
    required this.kind,
    required this.url,
    required this.enabled,
    required this.skills,
    required this.agentCard,
    required this.healthStatus,
    this.config = const {},
  });

  factory LobeInfo.fromJson(Map<String, dynamic> json) => LobeInfo(
    name: json['name'] as String,
    kind: (json['kind'] as String?) ?? 'native',
    url: (json['url'] as String?) ?? '',
    enabled: (json['enabled'] as bool?) ?? true,
    skills: ((json['skills'] as List?)?.cast<String>()) ?? const [],
    agentCard: AgentCard.fromJson(json['agent_card'] as Map<String, dynamic>),
    healthStatus: (json['health_status'] as String?) ?? 'unknown',
    config:
        (json['config'] as Map<String, dynamic>?)?.map(
          (k, v) => MapEntry(k, v),
        ) ??
        const {},
  );
}

/// 端脑的**原生叶区**（native lobe）及其当前生效的默认模型。
///
/// 这是「模型使用的最小单位是叶区」在客户端的映射。**叶区列表不硬编码**
/// —— 从端脑面读：端脑注册了哪些原生叶区就显示哪些。
///
/// **只有 native 叶区进这张表**（`LobeKind::Native` 是端脑**进程内**执行、
/// 由端脑自己发 LLM 请求的那种）：
/// - **External（外部 A2A）** —— 端脑只把请求**转发**给对端，用什么模型
///   是对端自己的事 ⇒ **不需要在这里配置模型信息**；
/// - **Wasm** —— 本质上是**自定义叶区**，有自己的配置 ⇒ **独立配置**；
/// - **Prompt** —— 端脑用系统提示词执行，不需要模型路由。
class NativeLobeInfo {
  final String name;

  /// 这个叶区请求 LLM 用的 OpenAI 兼容端点。
  final String openaiBaseUrl;

  /// 当前**生效**的默认模型。`null` = 回落本地 neuron 权重。
  final String? defaultModel;

  /// 叶区是干什么的（来自端脑的 manifest）。
  ///
  /// 用户要挑「哪个叶区用云端」时得**认得出**它是哪一块 —— 比如
  /// prefrontal 是「Task scheduling, flow selection, executive function」
  /// （任务决策），temporal 是「Conversation / chat」。
  final String description;

  const NativeLobeInfo({
    required this.name,
    required this.openaiBaseUrl,
    this.defaultModel,
    this.description = '',
  });

  factory NativeLobeInfo.fromJson(Map<String, dynamic> json) {
    final manifest = json['manifest'] as Map<String, dynamic>? ?? const {};
    return NativeLobeInfo(
      name: json['name'] as String? ?? '',
      openaiBaseUrl: json['openai_base_url'] as String? ?? '',
      defaultModel: json['default_model'] as String?,
      description: manifest['description'] as String? ?? '',
    );
  }
}

/// 端脑答的「当前是谁」。
///
/// 三件事分开，因为它们不是一回事：人（principal）、人格（persona =
/// 记忆的隔离单元）、设备。`identified` 为 false 表示背后**没有人**
/// —— 这台机器还没账号，请求也没带凭证。
class TelencephalonIdentity {
  /// 人，例如 `principal:alice`。
  final String? principal;

  /// 默认落进哪个人格。
  final String? persona;

  /// 哪台设备。
  final String? device;

  /// 背后有没有人。
  final bool identified;

  /// 这个人此刻能用的空间与角色。
  final List<IdentityPersona> personas;

  const TelencephalonIdentity({
    this.principal,
    this.persona,
    this.device,
    this.identified = false,
    this.personas = const [],
  });

  factory TelencephalonIdentity.fromJson(Map<String, dynamic> json) {
    final list = (json['personas'] as List?) ?? const [];
    return TelencephalonIdentity(
      principal: json['principal'] as String?,
      persona: json['persona'] as String?,
      device: json['device'] as String?,
      identified: json['identified'] as bool? ?? false,
      personas: list
          .whereType<Map<String, dynamic>>()
          .map(IdentityPersona.fromJson)
          .toList(),
    );
  }
}

/// 一个可用的空间与它在授权里的角色。
class IdentityPersona {
  final String persona;
  final String role;

  const IdentityPersona({required this.persona, required this.role});

  factory IdentityPersona.fromJson(Map<String, dynamic> json) {
    return IdentityPersona(
      persona: json['persona'] as String? ?? '',
      role: json['role'] as String? ?? '',
    );
  }
}

class AgentsResponse {
  final String telencephalonId;
  final String instanceName;
  final String defaultAgent;
  final List<LobeInfo> agents;

  AgentsResponse({
    required this.telencephalonId,
    required this.instanceName,
    required this.defaultAgent,
    required this.agents,
  });

  factory AgentsResponse.fromJson(Map<String, dynamic> json) {
    // Newer deployments answer with a "telencephalon" envelope; older ones
    // still use "cortex". Fall back to the legacy key so older instances
    // keep working.
    final envelope = (json['telencephalon'] as Map<String, dynamic>?) ??
        (json['cortex'] as Map<String, dynamic>?) ??
        const {};
    final agents = (json['agents'] as List?) ?? const [];
    return AgentsResponse(
      telencephalonId: envelope['id'] as String? ?? '',
      instanceName: envelope['instance_name'] as String? ?? '',
      defaultAgent: envelope['default_agent'] as String? ?? '',
      agents: agents
          .map((e) => LobeInfo.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// 端脑在**轮次文本**里用的机器前缀 —— 服务端用它标记「这条轮次不是人说的」。
///
/// 判据源（服务端）：
/// - `telencephalon/src/api/shadow/conversations.rs`
///   → `pub const SYSTEM_TURN_PREFIX: &str = "[system] ";`
/// - `telencephalon/src/api/shadow.rs`
///   → `pub const TOOL_RESULT_TURN_PREFIX: &str = "[tool_result] ";`
///
/// ⚠️ **为什么客户端必须认它们**：端脑把会话的**人设**存成**第一条**轮次
/// （`role=agent` + `[system] ` 前缀）⇒ 客户端若把 history 原样画成气泡，
/// 用户就会看到**自己的配置原文**被当成大脑发言顶在最上面。
///
/// ⚠️ 服务端喂模型时**只跳人设**（`history_of()`），工具结果**留在**历史里
/// （模型要读）⇒ ⇒ 客户端也**只跳人设**，工具结果剥掉前缀再显示。
const String kSystemTurnPrefix = '[system] ';
const String kToolResultTurnPrefix = '[tool_result] ';

class ConversationTurn {
  final String role;
  final String text;
  final DateTime timestamp;
  ConversationTurn({
    required this.role,
    required this.text,
    required this.timestamp,
  });

  /// 端脑（telencephalon）的会话轮次把时间放在 `at`（RFC3339 字符串），
  /// 旧的前额叶方言放在 `timestamp`（毫秒整数）。两种形状都要认 —— 只认
  /// 后者的话，会话列表读到第一条历史就会因 `null as num` 崩掉。
  factory ConversationTurn.fromJson(Map<String, dynamic> json) =>
      ConversationTurn(
        role: (json['role'] as String?) ?? 'agent',
        text: (json['text'] as String?) ?? '',
        timestamp: parseTurnTimestamp(json),
      );

  /// 这条轮次是**人设**（端脑存的第一条 agent 轮次，带 `[system] ` 前缀）。
  ///
  /// 它是**配置**，不是对话 ⇒ **不该**被画成消息气泡。
  bool get isSystemTurn => text.startsWith(kSystemTurnPrefix);

  /// 这条轮次是**客户端工具的结果**（带 `[tool_result] ` 前缀）。
  ///
  /// 它**是**这一回合真实发生的事 ⇒ 该给用户看，只是**不该**让用户看见
  /// 这个协议内部标记。
  bool get isToolResultTurn => text.startsWith(kToolResultTurnPrefix);

  /// 剥掉机器前缀后的正文。
  ///
  /// 人设那类**不剥**（它整条不显示，剥了也没意义）⇒ ⇒ 只有工具结果会真的剥。
  String get bodyText => isToolResultTurn
      ? text.substring(kToolResultTurnPrefix.length).trim()
      : text;

  /// 轮次时间戳：优先 `at`（RFC3339），退回 `timestamp`（毫秒整数）。
  static DateTime parseTurnTimestamp(Map<String, dynamic> json) {
    final at = json['at'];
    if (at is String) {
      final parsed = DateTime.tryParse(at);
      if (parsed != null) return parsed;
    }
    final ts = json['timestamp'];
    if (ts is num) return DateTime.fromMillisecondsSinceEpoch(ts.toInt());
    // 两种形状都没有：退回纪元，调用方至少不会崩。
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  Map<String, dynamic> toJson() => {
    'role': role,
    'text': text,
    'timestamp': timestamp.millisecondsSinceEpoch,
  };
}

class Conversation {
  final String id;
  final String agent;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<ConversationTurn> history;

  /// 归档 —— **软标记**（可恢复）：会话还在，只是默认不再出现在列表里。
  ///
  /// ⚠️ 服务端判据源：`telencephalon/src/api/shadow/conversations.rs`
  /// → `pub archived: bool`（`#[serde(default)]` ⇒ 老数据读得了）。
  final bool archived;

  Conversation({
    required this.id,
    required this.agent,
    required this.createdAt,
    required this.updatedAt,
    required this.history,
    this.archived = false,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
    id: json['id'] as String,
    agent: (json['agent'] as String?) ?? '',
    createdAt: DateTime.parse(json['created_at'] as String),
    updatedAt: DateTime.parse(json['updated_at'] as String),
    history: ((json['history'] as List?) ?? const [])
        .map((e) => ConversationTurn.fromJson(e as Map<String, dynamic>))
        .toList(),
    archived: (json['archived'] as bool?) ?? false,
  );

  /// 从端脑那份数据里派生的**可读标题**。
  ///
  /// 规则与实现见 `lib/utils/conversation_title.dart`（**唯一**一份）。
  ///
  /// 返回 `null` ⇒ 用户还没说过话（空会话）⇒ 由调用方决定回退文案。
  String? get derivedTitle {
    for (final turn in history) {
      if (turn.role != 'user') continue;
      final title = deriveConversationTitle(turn.text);
      if (title != null) return title;
    }
    return null;
  }
}

class SendMessageRequest {
  final String text;
  final String? agent;

  /// 这台设备**能跑的客户端工具**（OpenAI `tools` 数组的形状）。
  ///
  /// **谁声明什么由设备决定** —— 手机没有窗口可最小化，桌面端没有麦克风
  /// 权限可申请 ⇒ 两端发的清单本来就该不一样。
  ///
  /// 端脑已经认这个字段了（`SendMessageRequest.tools`）⇒ 它把清单连同
  /// JSON Schema 一起透传给叶区 ⇒ 模型看得见 `set_theme` 要吃一个 `color`。
  final List<Map<String, dynamic>>? tools;

  /// 要不要端脑**等**这台设备的工具结果、并在**同一回合**里接着说？
  ///
  /// 端脑点名让设备干活（换主题之类）之后，设备干完把结果回传 —— 那
  /// 是**另一个** HTTP 请求。端脑若在同一条 SSE 上等这个回传，就能把
  /// 结果喂回模型，让模型接着说「主题已经换成靛蓝了」⇒ 用户看到的是
  /// **一个**回合，而不是一张沉默的卡片。
  ///
  /// 端脑最多等 60 秒；设备不回答 ⇒ 端脑把这次工具调用当成**失败**，
  /// 模型据此告诉用户设备没回应（回合照样收尾，不会吊着）。
  ///
  /// 老端脑不认识这个字段（serde 忽略未知字段 ⇒ 无害）。
  final bool awaitToolResult;

  /// **这台设备给每个能力配了哪一档**（`ask`／`full`／`off`）。
  ///
  /// ⚠️ 为什么要有这一格：端脑**只看得见**「这个工具存在」＋
  /// 「它要哪个权限 token」⇒ ⇒ **看不见**「用户把它配成了哪一档」
  /// ⇒ ⇒ 「谁来按声明匹配」那条链就**缺一份输入**。
  ///
  /// ⚠️ **老端脑不认识这个字段 ⇒ 无害**（serde 忽略未知字段）
  /// ⇒ ⇒ 所以客户端**不必等端脑先改**就能先把这半边做掉。
  ///
  /// ⚠️ 键名是 **snake_case**（与 `await_tool_result` 同一条规矩）。
  final Map<String, String>? capabilityModes;

  const SendMessageRequest({
    required this.text,
    this.agent,
    this.tools,
    this.awaitToolResult = false,
    this.capabilityModes,
  });

  Map<String, dynamic> toJson() => {
    'text': text,
    if (agent != null) 'agent': agent,
    if (tools != null && tools!.isNotEmpty) 'tools': tools,
    if (awaitToolResult) 'await_tool_result': true,
    // ⚠️ 端脑认这个字段之前 ⇒ ⇒ serde 忽略未知字段 ⇒ ⇒ **无害**。
    if (capabilityModes != null && capabilityModes!.isNotEmpty)
      // ⚠️ **用常量，不用字面量** ⇒ ⇒ 键名只有**一个**来源
      // ⇒ ⇒ 改名时两处必然同步 ⇒ ⇒ 不会「判据绿、实际发出去的键却漂了」。
      capabilityModesKey: capabilityModes!,
  };
}

class SendMessageResponse {
  final String conversationId;
  final String agent;
  final String reply;
  final String state;
  final DateTime timestamp;

  SendMessageResponse({
    required this.conversationId,
    required this.agent,
    required this.reply,
    required this.state,
    required this.timestamp,
  });

  factory SendMessageResponse.fromJson(Map<String, dynamic> json) =>
      SendMessageResponse(
        conversationId: json['conversation_id'] as String,
        agent: json['agent'] as String,
        reply: json['reply'] as String,
        state: json['state'] as String,
        timestamp: DateTime.fromMillisecondsSinceEpoch(
          (json['timestamp'] as num).toInt(),
        ),
      );
}

class StreamEvent {
  final String type;
  final String? agent;
  final String? delta;
  final String? conversationId;
  final String? state;
  final DateTime? timestamp;
  final String? error;
  final ClarificationPayload? clarification;

  // ---- 工具事件（tool_call / tool_result）-----------------------------
  //
  // 端脑的 SSE 形状（`telencephalon/src/api/shadow.rs`）：
  //   tool_call   → {type, agent, name, args, tool_call_id}
  //   tool_result → {type, agent, name, result, latency_ms}
  //
  // ⚠️ `tool_call_id` 是端脑生成的 uuid —— 客户端把它**原样回传**，
  // 端脑才能把结果对回**发起它的那一次调用**（同一个工具在一轮里
  // 调两次时，按名字匹配会分不清）。
  //
  // ⚠️ `args` 线上是**字符串**（端脑的 `ToolCall.args` 是 `String`），
  // 这里解析成 map —— 解析逻辑见 `parseToolArgs`。

  /// 工具名（`tool_call` / `tool_result`）。
  final String? name;

  /// 工具参数（`tool_call`）。已经归一成 map。
  final Map<String, dynamic>? args;

  /// 工具结果（`tool_result`）。端脑那边是任意 JSON 值。
  final Object? result;

  /// 端脑自己执行这个工具花了多久（毫秒）。
  final int? latencyMs;

  /// 工具调用 id。端脑**现在带上了** —— `tool_call` 事件里有一个
  /// `tool_call_id`（端脑生成的 uuid）⇒ 消费方把它回传，端脑就能把
  /// 「结果」和「哪一次调用」精确对上号。
  ///
  /// 拿不到时（老端脑）消费方才自己合成一个。
  final String? toolCallId;

  StreamEvent({
    required this.type,
    this.agent,
    this.delta,
    this.conversationId,
    this.state,
    this.timestamp,
    this.error,
    this.clarification,
    this.name,
    this.args,
    this.result,
    this.latencyMs,
    this.toolCallId,
  });

  factory StreamEvent.fromJson(Map<String, dynamic> json) => StreamEvent(
    type: json['type'] as String,
    agent: json['agent'] as String?,
    delta: json['delta'] as String?,
    conversationId: json['conversation_id'] as String?,
    state: json['state'] as String?,
    timestamp: json['timestamp'] != null
        ? DateTime.fromMillisecondsSinceEpoch(
            (json['timestamp'] as num).toInt(),
          )
        : null,
    error: json['error'] as String?,
    clarification: json['clarification'] is Map<String, dynamic>
        ? ClarificationPayload.fromJson(
            json['clarification'] as Map<String, dynamic>,
          )
        : null,
    name: json['name'] as String?,
    // `args` 线上可能是 JSON 文本也可能是对象 —— 两种都要认。
    args: json['args'] == null ? null : parseToolArgs(json['args']),
    result: json['result'],
    latencyMs: (json['latency_ms'] as num?)?.toInt(),
    toolCallId: json['tool_call_id'] as String?,
  );
}

/// Wire shape of `metadata.shadow.clarification` carried by a
/// telencephalon stream event of type `"clarification"`. The visual-QA
/// router emits this when the LLM needs the user to pick a video
/// source (multi-camera setup, peer telencephalon candidate, etc.).
class ClarificationPayload {
  final String kind;
  final List<ClarificationCandidate> candidates;

  const ClarificationPayload({required this.kind, required this.candidates});

  factory ClarificationPayload.fromJson(Map<String, dynamic> json) {
    final raw = json['candidates'];
    final list = raw is List
        ? raw
              .whereType<Map<String, dynamic>>()
              .map(ClarificationCandidate.fromJson)
              .toList()
        : const <ClarificationCandidate>[];
    return ClarificationPayload(
      kind: (json['kind'] as String?) ?? 'unknown',
      candidates: list,
    );
  }
}

class ClarificationCandidate {
  final String sourceId;
  final String deviceLabel;
  final String? hostLabel;

  const ClarificationCandidate({
    required this.sourceId,
    required this.deviceLabel,
    this.hostLabel,
  });

  factory ClarificationCandidate.fromJson(Map<String, dynamic> json) =>
      ClarificationCandidate(
        sourceId: (json['source_id'] as String?) ?? '',
        deviceLabel: (json['device_label'] as String?) ?? '',
        hostLabel: json['host_label'] as String?,
      );
}

class FlowMeta {
  final String id;
  final String name;
  final String version;
  final bool isDraft;
  final List<String> tags;

  FlowMeta({
    required this.id,
    required this.name,
    required this.version,
    required this.isDraft,
    required this.tags,
  });

  factory FlowMeta.fromJson(Map<String, dynamic> json) => FlowMeta(
    id: json['id'] as String,
    name: json['name'] as String,
    version: (json['version'] as String?) ?? '0.1.0',
    isDraft: (json['is_draft'] as bool?) ?? false,
    tags: ((json['tags'] as List?)?.cast<String>()) ?? const [],
  );
}

class FlowDefinition {
  final String id;
  final String name;
  final String version;
  final String schemaVersion;
  final Map<String, dynamic> raw;
  FlowDefinition({
    required this.id,
    required this.name,
    required this.version,
    required this.schemaVersion,
    required this.raw,
  });

  factory FlowDefinition.fromJson(Map<String, dynamic> json) => FlowDefinition(
    id: json['id'] as String,
    name: json['name'] as String,
    version: (json['version'] as String?) ?? '0.1.0',
    schemaVersion: (json['schema_version'] as String?) ?? '1.0',
    raw: json,
  );
}

class FlowRunResult {
  final Map<String, dynamic> outputs;
  FlowRunResult({required this.outputs});
  factory FlowRunResult.fromJson(Map<String, dynamic> json) =>
      FlowRunResult(outputs: json);
}

/// 端脑任务 —— temporal lobe 的 `TaskStore` 里的一条记录。
///
/// **线上形状**（`telencephalon::lobes::task_store::Task`）有三个坑，
/// 认错任何一个都会解析出空值：
/// - `status` / `priority` 是 serde 的**变体名**（PascalCase）：
///   `Pending` / `InProgress` / `Completed` / `Cancelled` / `Overdue`，
///   `Low` / `Medium` / `High` / `Urgent`。**不是**小写、也不是 camelCase。
/// - 时间字段是 **snake_case**：`due_time` / `created_at` / `updated_at`。
/// - 端脑任务**没有子步骤** —— `steps` 是海马体 `TaskRecord` 的概念，
///   端脑这边对应的是「确认点」`confirmation_points`。
class TelencephalonTask {
  final String id;
  final String title;
  final String? description;

  /// `Pending` / `InProgress` / `Completed` / `Cancelled` / `Overdue`
  final String status;

  /// `Low` / `Medium` / `High` / `Urgent`
  final String priority;
  final DateTime? dueTime;
  final List<String> tags;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// 用户是否确认过这条任务（端脑只有确认过的任务才会被调度）。
  final bool confirmed;
  final List<String> confirmationPoints;

  const TelencephalonTask({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    required this.priority,
    this.dueTime,
    this.tags = const [],
    this.createdAt,
    this.updatedAt,
    this.confirmed = false,
    this.confirmationPoints = const [],
  });

  factory TelencephalonTask.fromJson(Map<String, dynamic> json) {
    DateTime? ts(Object? raw) =>
        raw == null ? null : DateTime.tryParse(raw.toString());

    List<String> strings(Object? raw) => raw is List
        ? raw.map((e) => e.toString()).toList()
        : const <String>[];

    return TelencephalonTask(
      id: (json['id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      description: json['description'] as String?,
      status: (json['status'] ?? 'Pending').toString(),
      priority: (json['priority'] ?? 'Medium').toString(),
      dueTime: ts(json['due_time']),
      tags: strings(json['tags']),
      createdAt: ts(json['created_at']),
      updatedAt: ts(json['updated_at']),
      confirmed: json['confirmed'] == true,
      confirmationPoints: strings(json['confirmation_points']),
    );
  }
}

/// 端脑 `TaskStatus` 的线上取值（serde 变体名，PascalCase）。
///
/// 服务端反序列化用的是变体名，发小写会被 serde 直接拒掉（400）。
class TelencephalonTaskStatus {
  const TelencephalonTaskStatus._();

  static const String pending = 'Pending';
  static const String inProgress = 'InProgress';
  static const String completed = 'Completed';
  static const String cancelled = 'Cancelled';
  static const String overdue = 'Overdue';
}

class TelencephalonClient {
  /// 端脑的默认地址 —— 外部 telencephalon 进程（:60080）。
  ///
  /// 移动端「改嵌大脑」之后，嵌入式大脑起来时这个地址会被换成 App
  /// 进程内那份端脑的地址（见 `EncephalonMobileNotifier`）。
  static const String defaultBaseUrl = 'http://127.0.0.1:60080';

  String _baseUrl;
  String? _apiKey;
  String? _adminToken;
  final http.Client _http;

  /// 端脑就绪门 —— 宿主挂上来（见 `EncephalonMobileNotifier`）。
  ///
  /// 嵌入式大脑启动要几秒（还得先把 LLM provider 交给它）；这段时间里
  /// 端脑 client 还指着没人监听的默认端口 ⇒ 请求会 connection refused。
  /// 这个门让请求**等大脑就绪**，而不是直接失败。
  ///
  /// 约定：返回一个 Future，没就绪就一直等（超时由宿主自己管）；
  /// **没挂门**（= 用外部端脑）就立即返回，行为跟以前完全一样。
  Future<void> Function()? readinessGate;

  /// 挂/摘就绪门。
  void setReadinessGate(Future<void> Function()? gate) {
    readinessGate = gate;
  }

  TelencephalonClient({
    String? baseUrl,
    String? apiKey,
    String? adminToken,
    http.Client? client,
  }) : _baseUrl = baseUrl ?? defaultBaseUrl,
       _apiKey = apiKey,
       _adminToken = adminToken,
       _http = client ?? http.Client();

  String get baseUrl => _baseUrl;
  void setBaseUrl(String url) => _baseUrl = url;
  String? get apiKey => _apiKey;
  void setApiKey(String? key) => _apiKey = key;
  String? get adminToken => _adminToken;
  void setAdminToken(String? token) => _adminToken = token;

  /// 这一张面要带的**全部**钥匙。
  ///
  /// ⚠️ **一条规则、一处实现**：客户端递的凭据集合必须与**门形**一致 ——
  /// 门认哪几把，客户端就递哪几把（判据源：
  /// `telencephalon/src/api/door_policy.txt` ⇒ 读门 = **影子锁 ∪ admin token**，
  /// 写门 = admin ⇒ 判据实现 `security/api_key.rs::verify_read_credential`）。
  ///
  /// ⇒ 以前读面**只递影子锁**（admin 只在写面才带）⇒ ⇒ 在「那台端脑只认
  /// admin token」时 ⇒ 读面 **401** ⇒ 而界面把它画成「没有 / 连不上」
  /// ⇒ ⇒ **失败长得像成功**。
  ///
  /// ⚠️ **拿不到就不带那个头** —— 绝不塞空串：空串与空串 `ct_eq` 相等
  /// ⇒ 等于把门骗开（`security/api_key.rs::verify_admin_token`）。
  Map<String, String> _headers({bool jsonBody = false}) {
    final h = <String, String>{};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (_apiKey != null && _apiKey!.isNotEmpty) h['X-Shadow-Key'] = _apiKey!;
    if (_adminToken != null && _adminToken!.isNotEmpty) {
      h['X-Admin-Token'] = _adminToken!;
    }
    return h;
  }

  /// 端脑地址 —— **所有**请求的唯一收口。
  ///
  /// 这里 `await` 一下就绪门：门开完再读 `_baseUrl`，拿到的就是刚更新过
  /// 的端脑面地址（嵌入式大脑起来时 `setBaseUrl` 才会改它）。
  ///
  /// 门挂在**拼地址**这一步而不是发请求那一步 —— 因为地址是发请求前
  /// 拼好的，等晚了拼出来的还是那个没人监听的端口。
  Future<Uri> _u(String path) async {
    await _awaitReady();
    return Uri.parse('$_baseUrl$path');
  }

  /// 等大脑就绪（没挂门就立即返回）。
  Future<void> _awaitReady() async {
    final gate = readinessGate;
    if (gate == null) return;
    try {
      await gate();
    } catch (_) {
      // 门自己抛错不该把请求一起带崩 —— 照常发出去，按原来的语义失败。
    }
  }

  /// Raw GET — returns the decoded JSON body as-is. Use this for endpoints
  /// that answer with a JSON array; [_get] assumes an object body.
  Future<dynamic> _getJson(String path) async {
    final r = await _http.get(await _u(path), headers: _headers());
    if (r.statusCode != 200) {
      throw TelencephalonException('GET $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body);
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final decoded = await _getJson(path);
    return decoded as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _http.post(
      await _u(path),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw TelencephalonException('POST $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  /// POST expecting **no body** — the admin variant of the empty-body POST.

  /// ⚠ 2026-11-01（步 3）：POST /api/flows/draft/{id}/reject 落进了端脑的
  /// **写门（admin token）** ⇒ 走这一档。
  ///
  /// ⚠ _post 不带 admin ⇒ 门一上就 401 ⇒ 「失败长得像成功」
  /// —— 用户看到的是「驳回草稿失败」，真因是「没带钥匙」。
  Future<void> _adminPostExpectEmpty(
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final r = await _http.post(
      await _u(path),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body ?? const {}),
    );
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw TelencephalonException('POST $path → ${r.statusCode}: ${r.body}');
    }
  }

  Future<Map<String, dynamic>> _adminPost(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _http.post(
      await _u(path),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw TelencephalonException('POST $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _adminGet(String path) async {
    final r = await _http.get(await _u(path), headers: _headers());
    if (r.statusCode != 200) {
      throw TelencephalonException('GET $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<void> _adminDelete(String path) async {
    final r = await _http.delete(await _u(path), headers: _headers());
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw TelencephalonException('DELETE $path → ${r.statusCode}: ${r.body}');
    }
  }

  /// PATCH —— 端脑**改单个叶区**用的动词。
  ///
  /// ⚠️ **门型**：`/api/telencephalon/agents/*` 在门型表里是 `auto`
  /// ⇒ ⇒ **按方法派生**（判据：`telencephalon/src/api/door.rs` → 「`auto` 是
  /// **按方法派生**：GET/HEAD ⇒ `read`；其余 ⇒ `admin`」）⇒ ⇒ **PATCH 落 admin 门**
  /// ⇒ ⇒ 必须带 admin 钥匙。
  ///
  /// ⇒ `_headers()` 本来就**两把都带**（影子锁 + admin token）⇒ 这一档直接用它。
  Future<Map<String, dynamic>> _patch(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _http.patch(
      await _u(path),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    if (r.statusCode != 200) {
      throw TelencephalonException('PATCH $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  /// Probe telencephalon: GET /.well-known/agent.json
  Future<Map<String, dynamic>> health() => _get('/.well-known/agent.json');

  /// List registered lobes (returns telencephalon id + agent list)
  Future<AgentsResponse> listAgents() async {
    final json = await _get('/shadow/v1/agents');
    return AgentsResponse.fromJson(json);
  }

  /// 当前是谁 —— 人 / 人格 / 设备。
  ///
  /// 桌面与手机用**同一个账号**时，这里报出的是**同一个人**、同一个人格
  /// ⇒ 两端写进同一份记忆。
  Future<TelencephalonIdentity> getIdentity() async {
    final json = await _getJson('/shadow/v1/identity');
    return TelencephalonIdentity.fromJson(json);
  }

  /// 导入一个账号 —— 这台设备从此是导出方的那个人。
  ///
  /// [code] 是另一台设备导出的账号密钥，**它就是身份本身**。
  /// 端脑写文件、换掉进程级身份 ⇒ 立即生效，不用重启大脑。
  ///
  /// 端点跟着 `X-Shadow-Key` 一起受保护（`_headers()` 已经带上）。
  Future<TelencephalonIdentity> importAccount(String code) async {
    final json = await _post('/shadow/v1/identity', {'code': code});
    return TelencephalonIdentity.fromJson(json);
  }

  /// 端脑注册的**原生叶区**清单 + 每个叶区当前生效的默认模型。
  ///
  /// **叶区列表不硬编码** —— 从端脑面读，端脑注册了哪些原生叶区就显示
  /// 哪些。外部 A2A 对端**不需要**配置模型信息（端脑只转发），WASM 是
  /// **自定义叶区、独立配置** —— 两者都不在这张表里。
  Future<List<NativeLobeInfo>> listNativeLobes() async {
    final decoded = await _getJson('/api/telencephalon/lobes/list');
    final list = decoded is List ? decoded : const [];
    return list
        .whereType<Map>()
        .map((e) => NativeLobeInfo.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// 一次下发**整份** per-lobe 模型路由。
  ///
  /// 请求体与写进大脑槽位的**完全一样**：
  /// ```json
  /// {
  ///   "default_model": "MiniMax-M3",
  ///   "lobe_models": {"prefrontal": null, "temporal": "MiniMax-M3"},
  ///   "providers": [{"base_url": "...", "api_key": "...", "model": "..."}]
  /// }
  /// ```
  /// - [defaultModel] —— **全局默认**（`null` = 全体回落本地）；
  /// - [lobeModels] —— **完整的覆盖集合**：叶区名 → 模型 id，
  ///   `null` = 该叶区强制本地；**没出现在表里的叶区 = 跟随全局默认**；
  /// - [providers] —— 要注册进 neuron 派发表的全部远端引擎 ——
  ///   **注册是运行时的**，所以换模型来源不必重启大脑。
  ///
  /// 为什么是整份而不是一条条改：全局默认与 per-lobe 覆盖合在一起才是
  /// **有效路由**，拆成单条更新就得让调用方自己算优先级 —— 而那份规则
  /// 必须在大脑和客户端两边一模一样，很容易走偏。
  Future<Map<String, dynamic>> applyLobeModels({
    required String? defaultModel,
    required Map<String, String?> lobeModels,
    List<Map<String, String>> providers = const [],
  }) async {
    return _adminPost('/api/telencephalon/lobes/models', {
      'default_model': defaultModel,
      'lobe_models': {
        for (final entry in lobeModels.entries) entry.key: entry.value,
      },
      'providers': providers,
      // ⚠️ **per-lobe 分档覆盖不在这里**（2026-11-13 订正）：端脑这一面
      // **没有**这个字段 ⇒ ⇒ 塞进来会被 serde 静默丢掉 ⇒ ⇒ 用户配的叶区
      // 语音模型永远不生效（失败长得像成功）。它走分档默认面
      // （`setCapabilityDefaults(lobeDefaults: …)`）。
    });
  }

  /// **模型能力的人工覆盖**（`model_id` → 端脑词表里的词）。
  ///
  /// ⚠️ 按 `model_id` **全局**：同一模型在多家供应商下改一次全生效
  /// （能力是**模型**的属性，不是供应商的）。
  /// ⚠️ 与「拉模型列表」分开存（那个整份替换 `provider.models` ⇒ ⇒ 写进
  /// 模型的标注必被冲掉）。
  Future<Map<String, dynamic>> getCapabilityOverrides() =>
      _adminGet('/models/capability-overrides');

  /// 写人工覆盖（**增量合并**；`null` = 删掉这条覆盖、回到自动判定）。
  ///
  /// ⚠️ 值必须是端脑词表里的词（未知词整份 400 且回词表）。
  Future<Map<String, dynamic>> putCapabilityOverrides(
    Map<String, String?> patch,
  ) =>
      _put('/models/capability-overrides', {
        'overrides': patch,
      });

  Future<Map<String, dynamic>> getAgent(String name) =>
      _get('/shadow/v1/agents/${Uri.encodeComponent(name)}');

  /// 改**单个叶区**的配置袋 —— 端脑面
  /// `PATCH /api/telencephalon/agents/{name}/config`。
  ///
  /// ⚠️ 服务端是**合并**语义（`update_lobe_config`：新键覆盖旧键，其余原样留着）
  /// ⇒ ⇒ 只传要改的那几个键就行，**不要**把整个袋回传（会把没改的键也写一遍）。
  ///
  /// ⚠️ 门是 **admin**（见 `_patch` 的门型说明）⇒ 没带 admin 钥匙 ⇒ 401。
  Future<Map<String, dynamic>> patchAgentConfig(
    String name,
    Map<String, dynamic> config,
  ) async {
    return _patch(
      '/api/telencephalon/agents/${Uri.encodeComponent(name)}/config',
      {'config': config},
    );
  }

  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    final body = <String, dynamic>{};
    if (agent != null) body['agent'] = agent;
    if (systemPrompt != null) body['system'] = systemPrompt;
    final json = await _post('/shadow/v1/conversations', body);
    return Conversation.fromJson(json);
  }

  Future<Conversation> getConversation(String id) async {
    final json = await _get(
      '/shadow/v1/conversations/${Uri.encodeComponent(id)}',
    );
    return Conversation.fromJson(json);
  }

  /// 列出会话。
  ///
  /// ⚠️ **默认只列未归档的** —— 归档是软标记，默认列表里不该再看见它
  /// （这正是归档的意义）。`archivedOnly: true` ⇒ ⇒ 只列归档的那批
  /// （归档箱）；`includeArchived: true` ⇒ ⇒ 两批都列。
  ///
  /// 判据源：`telencephalon/src/api/shadow.rs` → `ListConversationsQuery`。
  Future<List<Conversation>> listConversations({
    bool includeArchived = false,
    bool archivedOnly = false,
  }) async {
    // This endpoint answers with a JSON array, so it must not go through
    // [_get] (which casts the body to a Map).
    final params = <String, String>{};
    if (includeArchived) params['include_archived'] = 'true';
    if (archivedOnly) params['archived_only'] = 'true';
    final query = params.isEmpty ? '' : '?${Uri(queryParameters: params).query}';
    final json = await _getJson('/shadow/v1/conversations$query');
    return (json as List<dynamic>)
        .map((e) => Conversation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// **归档**一条会话（软标记 —— 会话还在，只是不在默认列表里）。
  ///
  /// 端点：`POST /shadow/v1/conversations/{id}/archive`
  Future<Conversation> archiveConversation(String id) async {
    final json = await _adminPost(
      '/shadow/v1/conversations/${Uri.encodeComponent(id)}/archive',
      <String, dynamic>{},
    );
    return Conversation.fromJson(json);
  }

  /// 把归档的会话**取回**默认列表。
  ///
  /// 端点：`POST /shadow/v1/conversations/{id}/unarchive`
  Future<Conversation> unarchiveConversation(String id) async {
    final json = await _adminPost(
      '/shadow/v1/conversations/${Uri.encodeComponent(id)}/unarchive',
      <String, dynamic>{},
    );
    return Conversation.fromJson(json);
  }

  /// **物理**删除一条会话。
  ///
  /// ⚠️ 它连**海马体里的那份**一起删 —— 会话行 + 它的全部消息。
  /// ⚠️ 端脑的会话**本来就存在海马体**（`LancePersistence` →
  /// `hippocampus_core::session::SessionManager`）⇒ ⇒ 删会话 = 删海马体那一份。
  /// ⚠️ **删不掉的是记忆条目**：海马体抽出来的记忆 uri 是
  /// `hippocampus://session/memories/<uuid>.md` ⇒ ⇒ 里面**没有会话 id**
  /// ⇒ ⇒ 没有键可按 ⇒ ⇒ 它们留着。
  ///
  /// 端点：`DELETE /shadow/v1/conversations/{id}`
  Future<void> deleteConversation(String id) async {
    await _adminDelete(
      '/shadow/v1/conversations/${Uri.encodeComponent(id)}',
    );
  }

  Future<Conversation> importSessionAsConversation({
    required SessionExport export,
    String agent = 'prefrontal',
  }) async {
    final history = export.messages
        .map(
          (m) => {
            'role': m['role'] ?? 'user',
            'text': m['text'] ?? '',
            'timestamp': (m['timestamp'] is int)
                ? m['timestamp']
                : (m['timestamp'] as num?)?.toInt() ??
                      DateTime.now().millisecondsSinceEpoch,
          },
        )
        .toList();
    final body = {'agent': agent, 'history': history};
    final json = await _post(
      '/shadow/v1/conversations/${Uri.encodeComponent(export.sessionId)}/import',
      body,
    );
    return Conversation.fromJson(json);
  }

  Future<SendMessageResponse> sendMessage(
    String conversationId,
    SendMessageRequest req,
  ) async {
    final json = await _post(
      '/shadow/v1/conversations/${Uri.encodeComponent(conversationId)}/messages',
      req.toJson(),
    );
    return SendMessageResponse.fromJson(json);
  }

  /// 把**客户端工具**的执行结果回传给端脑。
  ///
  /// 端脑的 `tool_call` 事件到达客户端 → 客户端本地执行（换主题之类）
  /// → 结果回传端脑 → 端脑喂回模型，模型才知道「主题已经换好了」。
  /// 没有这一步，端脑那边会一直等着这个工具的结果。
  ///
  /// 端点：`POST /shadow/v1/conversations/{id}/tool-results`
  ///
  /// ⚠️ 调用方要自己兜住，别让「结果回传失败」把整条对话带崩。
  /// 这里的 404 现在表示**会话 id 不对**（或者连的是没这条路由的旧端脑）——
  /// 这条路由本身在端脑侧**已经上线**了。
  Future<void> reportToolResult(
    String conversationId, {
    required String name,
    String? toolCallId,
    required Object? result,
    bool ok = true,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'result': result,
      'ok': ok,
    };
    if (toolCallId != null) body['tool_call_id'] = toolCallId;
    await _post(
      '/shadow/v1/conversations/${Uri.encodeComponent(conversationId)}/tool-results',
      body,
    );
  }

  /// Stream message via SSE. Yields StreamEvent as they arrive.
  Stream<StreamEvent> streamMessage(
    String conversationId,
    SendMessageRequest req,
  ) async* {
    final headers = _headers(jsonBody: true);
    final request = http.Request(
      'POST',
      await _u(
        '/shadow/v1/conversations/${Uri.encodeComponent(conversationId)}/messages:stream',
      ),
    );
    request.headers.addAll(headers);
    request.body = jsonEncode(req.toJson());

    final response = await _http.send(request);
    if (response.statusCode != 200) {
      throw TelencephalonException('streamMessage → ${response.statusCode}');
    }
    final lines = response.stream
        .transform(utf8.decoder)
        .transform(const LineSplitter());
    String? pendingData;
    await for (final raw in lines) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      if (line.startsWith('data:')) {
        pendingData = line.substring(5).trim();
        if (pendingData.isEmpty) continue;
        try {
          final json = jsonDecode(pendingData) as Map<String, dynamic>;
          yield StreamEvent.fromJson(json);
        } catch (_) {
          // skip malformed
        }
      }
    }
  }

  // ---- Flow runtime API ----

  Future<List<FlowMeta>> listFlows({
    String? name,
    String? tag,
    bool? isDraft,
  }) async {
    final query = <String, String>{};
    if (name != null) query['name'] = name;
    if (tag != null) query['tag'] = tag;
    if (isDraft != null) query['is_draft'] = isDraft.toString();
    final uri = (await _u('/api/flows')).replace(
      queryParameters: query.isEmpty ? null : query,
    );
    final r = await _http.get(uri, headers: _headers());
    if (r.statusCode != 200)
      throw TelencephalonException('listFlows → ${r.statusCode}');
    final list = jsonDecode(r.body) as List<dynamic>;
    return list
        .map((e) => FlowMeta.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FlowDefinition> createFlow(FlowDefinition flow) async {
    final json = await _adminPost('/api/flows', flow.raw);
    return FlowDefinition.fromJson(json);
  }

  Future<FlowDefinition> getFlow(String id) async {
    final json = await _get('/api/flows/${Uri.encodeComponent(id)}');
    return FlowDefinition.fromJson(json);
  }

  Future<FlowRunResult> runFlow(
    String flowIdOrName,
    Map<String, dynamic> inputs, {
    String? sessionId,
  }) async {
    // Telencephalon only exposes POST /api/flows/{id}/run; resolve by name
    // via listFlows first. The id path short-circuits the list call when the
    // caller already has a UUID-shaped flowId.
    final resolvedId = _looksLikeFlowId(flowIdOrName)
        ? flowIdOrName
        : await _resolveFlowIdByName(flowIdOrName);
    final body = <String, dynamic>{'inputs': inputs};
    if (sessionId != null) body['session_id'] = sessionId;
    final json = await _adminPost(
      '/api/flows/${Uri.encodeComponent(resolvedId)}/run',
      body,
    );
    return FlowRunResult.fromJson(json);
  }

  /// 把**本机真实跑出来的**工具轨迹喂给端脑的「思维定式」闭环
  /// （POST /api/flows/traces/ingest）—— learner 会把成功轨迹蒸馏成
  /// flow 草稿（人工 promote/reject 后成为可复用的思维定式）。
  /// ⚠️ 失败轨迹也照喂（轨迹行里 `ok: false`）—— 意图检索要能
  /// 避开已知的失败路径、复用成功的。
  Future<void> ingestTrace({
    required String source,
    required List<Map<String, dynamic>> trajectory,
    String? userInput,
    String? intentSignature,
  }) async {
    final body = <String, dynamic>{'source': source, 'trajectory': trajectory};
    if (userInput != null) body['user_input'] = userInput;
    if (intentSignature != null) body['intent_signature'] = intentSignature;
    await _adminPost('/api/flows/traces/ingest', body);
  }

  bool _looksLikeFlowId(String s) {
    if (s.isEmpty) return false;
    final uuidLike = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    );
    return uuidLike.hasMatch(s);
  }

  Future<String> _resolveFlowIdByName(String name) async {
    final flows = await listFlows(name: name);
    if (flows.isEmpty) {
      throw TelencephalonException('flow not found: $name');
    }
    final match = flows.firstWhere(
      (f) => f.name == name,
      orElse: () => flows.first,
    );
    return match.id;
  }

  Future<List<FlowDefinition>> listDrafts() async {
    // 服务端（telencephalon flow/api/drafts.rs）回的是**裸 JSON 数组**，元素是
    // DraftFlow = { flow, provenance }（flow 嵌套在内层）—— `_get` 假定对象体，
    // 对数组 cast 直接抛 ⇒ 这里走 `_getJson`，并容忍两种形状：
    // 裸数组（现状）/ {"drafts": [...]}（历史写法）；元素外层带 flow 就解包。
    final dynamic decoded = await _getJson('/api/flows/draft');
    final List<dynamic> items;
    if (decoded is List) {
      items = decoded;
    } else if (decoded is Map && decoded['drafts'] is List) {
      items = decoded['drafts'] as List<dynamic>;
    } else {
      return const [];
    }
    return items.map((e) {
      final m = e as Map<String, dynamic>;
      final flow = m['flow'];
      return FlowDefinition.fromJson(
        flow is Map<String, dynamic> ? flow : m,
      );
    }).toList();
  }

  Future<FlowDefinition> promoteDraft(String draftId) async {
    final json = await _adminPost(
      '/api/flows/draft/${Uri.encodeComponent(draftId)}/promote',
      const {},
    );
    return FlowDefinition.fromJson(json);
  }

  Future<void> rejectDraft(String draftId) => _adminPostExpectEmpty(
    '/api/flows/draft/${Uri.encodeComponent(draftId)}/reject',
  );

  // ---- MCP Management API ----

  Future<List<Map<String, dynamic>>> listMcpServers() async {
    final json = await _adminGet('/api/telencephalon/mcp/servers');
    return (json['servers'] as List<dynamic>?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
  }

  Future<Map<String, dynamic>> getMcpServer(String id) async {
    return await _adminGet('/api/telencephalon/mcp/servers/${Uri.encodeComponent(id)}');
  }

  Future<List<Map<String, dynamic>>> getMcpServerTools(String id) async {
    final json = await _adminGet(
      '/api/telencephalon/mcp/servers/${Uri.encodeComponent(id)}/tools',
    );
    return (json as List<dynamic>)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<List<Map<String, dynamic>>> listMcpServersForAgent(
    String agentName,
  ) async {
    final json = await _adminGet(
      '/api/telencephalon/mcp/agents/${Uri.encodeComponent(agentName)}/servers',
    );
    return (json['bindings'] as List<dynamic>?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
  }

  Future<List<Map<String, dynamic>>> getAgentMcpTools(String agentName) async {
    final json = await _adminGet(
      '/api/telencephalon/mcp/agents/${Uri.encodeComponent(agentName)}/tools',
    );
    return (json as List<dynamic>)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<Map<String, dynamic>> createMcpServer({
    required String name,
    required String wasmName,
    required String wasmVersion,
    required String wasmSha256,
    int? memoryBytes,
    int? fuel,
    int? wallClockMs,
    String? description,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'wasm': {'name': wasmName, 'version': wasmVersion, 'sha256': wasmSha256},
    };
    if (memoryBytes != null || fuel != null || wallClockMs != null) {
      body['quota'] = {
        'memory_bytes': ?memoryBytes,
        'fuel': ?fuel,
        'wall_clock_ms': ?wallClockMs,
      };
    }
    if (description != null) body['description'] = description;
    return await _adminPost('/api/telencephalon/admin/mcp/servers', body);
  }

  Future<void> deleteMcpServer(String id) async {
    await _adminDelete(
      '/api/telencephalon/admin/mcp/servers/${Uri.encodeComponent(id)}',
    );
  }

  Future<Map<String, dynamic>> startMcpServer(String id) async {
    return await _adminPost(
      '/api/telencephalon/admin/mcp/servers/${Uri.encodeComponent(id)}/start',
      const {},
    );
  }

  Future<Map<String, dynamic>> stopMcpServer(String id) async {
    return await _adminPost(
      '/api/telencephalon/admin/mcp/servers/${Uri.encodeComponent(id)}/stop',
      const {},
    );
  }

  Future<Map<String, dynamic>> bindMcpServerToAgent(
    String agentName,
    String serverId,
  ) async {
    return await _adminPost(
      '/api/telencephalon/admin/mcp/agents/${Uri.encodeComponent(agentName)}/servers/${Uri.encodeComponent(serverId)}',
      const {},
    );
  }

  Future<void> unbindMcpServerFromAgent(
    String agentName,
    String serverId,
  ) async {
    await _adminDelete(
      '/api/telencephalon/admin/mcp/agents/${Uri.encodeComponent(agentName)}/servers/${Uri.encodeComponent(serverId)}',
    );
  }

  // ---- Agent Management API ----

  Future<Map<String, dynamic>> scanExternalAgents() async {
    return await _adminPost('/api/telencephalon/agents/scan', const {});
  }

  Future<Map<String, dynamic>> syncExternalAgent(String providerId) async {
    return await _adminPost(
      '/api/telencephalon/agents/sync/${Uri.encodeComponent(providerId)}',
      const {},
    );
  }

  Future<Map<String, dynamic>> discoverAgents() async {
    return await _get('/api/telencephalon/agents/discover');
  }

  Future<Map<String, dynamic>> searchAgents({String? skill, String? q}) async {
    final query = <String, String>{};
    if (skill != null) query['skill'] = skill;
    if (q != null) query['q'] = q;
    final uri = (await _u('/api/telencephalon/agents/search')).replace(
      queryParameters: query.isEmpty ? null : query,
    );
    final r = await _http.get(uri, headers: _headers());
    if (r.statusCode != 200) {
      throw TelencephalonException('searchAgents → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> listInstalledWasm() async {
    final json = await _adminGet('/api/telencephalon/admin/agents/installed');
    return (json['entries'] as List<dynamic>?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
  }

  Future<void> deleteWasm(String name, String version) async {
    await _adminDelete(
      '/api/telencephalon/admin/agents/${Uri.encodeComponent(name)}/${Uri.encodeComponent(version)}',
    );
  }

  Future<Map<String, dynamic>> createPromptAgent({
    required String name,
    required String systemPrompt,
    String? version,
    String? description,
    List<String>? skills,
    String? modelProvider,
    String? modelName,
    List<String>? requiredCapabilities,
  }) async {
    final body = <String, dynamic>{'name': name, 'system_prompt': systemPrompt};
    if (version != null) body['version'] = version;
    if (description != null) body['description'] = description;
    if (skills != null) body['skills'] = skills;
    if (modelProvider != null) body['model_provider'] = modelProvider;
    if (modelName != null) body['model_name'] = modelName;
    // ⚠️ **能力声明**（llm / asr / tts …）—— 端脑按 `Capability` 词表
    // 校验 ⇒ ⇒ 不认识的词会被**整个拒绝**。
    if (requiredCapabilities != null) {
      body['required_capabilities'] = requiredCapabilities;
    }
    return await _adminPost('/api/telencephalon/admin/agents/create', body);
  }

  /// **分档默认模型** —— 「这一类能力用哪个模型」。
  ///
  /// ⚠️ 键是**能力词**（llm / asr / tts …）⇒ ⇒ 端脑的 `Capability` 词表
  /// 是单一真源（这个 GET 把合法词表一起回来）。
  Future<Map<String, dynamic>> getCapabilityDefaults() async {
    return await _get('/api/telencephalon/lobes/capability-defaults');
  }

  /// 写**分档默认模型**（写门 ⇒ `_headers()` 两把钥匙都带）。
  ///
  /// ⚠️ **`defaults` 整份替换** —— 下发的是全量 ⇒ ⇒ 两端不会各留一半。
  ///
  /// ⚠️ **`lobeDefaults` 是可加段**（2026-11-13）：`null`（不传）⇒ 端脑
  /// **不动**已有的逐叶区表（只改全局的调用方不该顺手抹掉叶区选择）；
  /// 传了（含空表）⇒ 整份替换那张表 —— 空表 = 清空 ⇒ 全部叶区回到跟随
  /// 全局。
  Future<Map<String, dynamic>> setCapabilityDefaults(
    Map<String, String> defaults, {
    Map<String, Map<String, String>>? lobeDefaults,
  }) async {
    return await _put('/api/telencephalon/lobes/capability-defaults', {
      'defaults': defaults,
      if (lobeDefaults != null)
        'lobe_defaults': {
          for (final e in lobeDefaults.entries)
            e.key: Map<String, String>.from(e.value),
        },
    });
  }

  Future<Map<String, dynamic>> generateAgentDescription(
    String systemPrompt,
  ) async {
    return await _adminPost(
      '/api/telencephalon/admin/agents/generate-description',
      {'system_prompt': systemPrompt},
    );
  }

  void dispose() => _http.close();

  // ============ Task APIs（端脑 temporal lobe）============

  /// 列出端脑任务（temporal lobe 的 `TaskStore`）。
  ///
  /// ⚠️ **读门不是「敞着」** —— 这条路由的门型是 **read**（`door_policy.txt` 里
  /// `/api/telencephalon/tasks GET read`）⇒ ⇒ **读门认 shadow key ∪ admin token**
  /// ⇒ ⇒ 端脑**配了影子锁**时，没钥匙就是 **401**。
  /// ⚠️ **旧注释在这两件事上都是错的**（2026-11-09 实测订正）：
  /// ① 「读是开放的」—— 实测：**不带任何凭据 ⇒ 401**；带**错的**影子锁 ⇒ 401；
  ///    带 admin token ⇒ **200**（真端脑进程实测，不是读源码推断）。
  /// ② 「任务存在端脑进程内存里 —— 进程重启就没了」—— 实测：**落盘层编进来了**
  ///    （`encephalon` 的 `mobile` feature 转发 `telencephalon/flow` ⇒ `serde_json`
  ///    ⇒ `task_store` 的 `persist` 那段 `#[cfg]` 编译在）⇒ ⇒ 宿主又把
  ///    `TELENCEPHALON_PROVIDERS_FILE` 指到 App 私有目录 ⇒ ⇒ 任务库落在
  ///    **同目录的 `tasks.json`** ⇒ ⇒ **端脑重启后任务仍在**（桌面端真跑级实测：
  ///    杀进程 → 重启 → 那条任务还在）。
  ///    ⚠️ 手机上的**真机读数**待跑（见父仓台账 U+3443 条）⇒ ⇒ 这一句目前是
  ///    「按编译期事实与宿主接线推的」，**不是**真机实测。
  Future<List<TelencephalonTask>> listTasks() async {
    final decoded = await _getJson('/api/telencephalon/tasks');
    if (decoded is! List) return const <TelencephalonTask>[];
    return decoded
        .whereType<Map<String, dynamic>>()
        .map(TelencephalonTask.fromJson)
        .toList();
  }

  /// 新建一条任务。
  ///
  /// [priority] 传小写（`low` / `medium` / `high` / `urgent`）—— 服务端
  /// `parse_priority` 自己认大小写，写成 `High` 也行，但小写更直观。
  /// [dueTime] 是自由文本（`parse_due_time` 认 ISO8601 与「明天下午3点」
  /// 这类中文相对时间），服务端解析失败会回 400。
  Future<TelencephalonTask> createTask({
    required String title,
    String? description,
    String? dueTime,
    String? priority,
    List<String>? tags,
  }) async {
    final body = <String, dynamic>{'title': title};
    if (description != null && description.isNotEmpty) {
      body['description'] = description;
    }
    if (dueTime != null && dueTime.isNotEmpty) body['due_time'] = dueTime;
    if (priority != null && priority.isNotEmpty) body['priority'] = priority;
    if (tags != null && tags.isNotEmpty) body['tags'] = tags;
    final json = await _adminPost('/api/telencephalon/tasks', body);
    return TelencephalonTask.fromJson(json);
  }

  /// 改任务状态。
  ///
  /// [status] 必须是 serde 的变体名（`Pending` / `InProgress` /
  /// `Completed` / `Cancelled` / `Overdue`）—— 发小写会被 serde 拒掉。
  Future<TelencephalonTask> updateTaskStatus(
    String taskId,
    String status,
  ) async {
    final json = await _adminPost(
      '/api/telencephalon/tasks/${Uri.encodeComponent(taskId)}/status',
      {'status': status},
    );
    return TelencephalonTask.fromJson(json);
  }

  /// 确认（或取消确认）一条任务。
  ///
  /// **只有 `Pending` 的任务能确认** —— 服务端在别的状态上会回 400
  /// （`only Pending tasks are confirmable`）。确认时可以顺带改
  /// 标题 / 截止时间 / 优先级（`modifications`），这是端脑**唯一**能改
  /// 这些字段的入口。
  Future<TelencephalonTask> confirmTask(
    String taskId, {
    required bool confirmed,
    String? title,
    String? dueTime,
    String? priority,
  }) async {
    final modifications = <String, dynamic>{};
    if (title != null && title.isNotEmpty) modifications['title'] = title;
    if (dueTime != null && dueTime.isNotEmpty) modifications['due_time'] = dueTime;
    if (priority != null && priority.isNotEmpty) {
      modifications['priority'] = priority;
    }
    final body = <String, dynamic>{
      'task_id': taskId,
      'confirmed': confirmed,
      if (modifications.isNotEmpty) 'modifications': modifications,
    };
    final json = await _adminPost(
      '/api/telencephalon/tasks/${Uri.encodeComponent(taskId)}/confirm',
      body,
    );
    return TelencephalonTask.fromJson(json);
  }

  /// **改任务** —— 端脑面 `POST /api/telencephalon/tasks/{id}/update`。
  ///
  /// ⚠️ **为什么需要它**（2026-11-09）：任务板以前**只能改状态**
  /// ⇒ ⇒ 「对话里能改标题、界面上改不了」⇒ ⇒ 两张面不齐
  /// ⇒ ⇒ 用户得先回对话才能改标题。
  ///
  /// ⚠️ **只改给了的字段**（没给的字段服务端不动）⇒ ⇒ 传 `null` = 不改。
  /// ⚠️ [status] 收**大小写不敏感**的词表（`in_progress` / `InProgress` 都行）
  /// ⇒ ⇒ 与对话面**同一把尺**（服务端同一个解析器）。
  /// ⚠️ 认不得的值服务端**明确报错**（400）⇒ ⇒ 不会静默回落成 Medium。
  Future<TelencephalonTask> updateTask(
    String taskId, {
    String? title,
    String? status,
    String? priority,
    String? dueTime,
  }) async {
    final body = <String, dynamic>{};
    if (title != null && title.isNotEmpty) body['title'] = title;
    if (status != null && status.isNotEmpty) body['status'] = status;
    if (priority != null && priority.isNotEmpty) body['priority'] = priority;
    if (dueTime != null && dueTime.isNotEmpty) body['due_time'] = dueTime;
    final json = await _adminPost(
      '/api/telencephalon/tasks/${Uri.encodeComponent(taskId)}/update',
      body,
    );
    return TelencephalonTask.fromJson(json);
  }

  /// 删掉一条任务。
  Future<void> deleteTask(String taskId) => _adminDelete(
    '/api/telencephalon/tasks/${Uri.encodeComponent(taskId)}',
  );

/// Build the telencephalon WebRTC signaling URL for a session.
/// Endpoint not yet exposed by telencephalon (spec §4 unimplemented).
/// Kept here as the canonical URL when telencephalon adds the endpoint.
  Uri webrtcSignalingUrl(String sessionId, {String modality = 'voice'}) {
    return Uri.parse(
      '$_baseUrl/api/webrtc/$modality/sessions/${Uri.encodeComponent(sessionId)}/ws',
    );
  }

  // ============ 云供应商（**大脑是唯一提供方**）============

  /// 读**大脑自己**的供应商清单（端脑面 `GET /models/providers`）。
  ///
  /// ⚠️ **大脑是唯一提供方**（2026-11-02 的架构决定）：桌面端与手机端读
  /// **同一张表** ⇒ ⇒ 两端看到的、配置的、**推理用的**全是同一份数据。
  ///
  /// ⚠️ 旧路径 `/api/providers` 是**前额叶方言**，端脑**不提供** ⇒ 404 ⇒
  /// ⇒ 界面把它画成「还没有供应商」⇒ ⇒ **失败长得像成功**。
  Future<List<RegisteredProvider>> listProviders() async {
    final data = await _getJson('/models/providers');
    if (data is! List) {
      throw TelencephalonException(
        'GET /models/providers → 形状不对：${data.runtimeType}',
      );
    }
    return data
        .cast<Map<String, dynamic>>()
        .map(RegisteredProvider.fromJson)
        .toList();
  }

  /// 读**预设目录**（端脑面 `GET /models/providers/presets`）。
  ///
  /// ⚠️ 权威在 `synapse::providers::catalog` ⇒ ⇒ 手机**不必硬编码**一份
  /// 供应商清单（硬编码那份**已经漂了**：`qwen` 的地址与目录不同、少了 8 个）。
  Future<List<ProviderPreset>> listProviderPresets() async {
    final data = await _getJson('/models/providers/presets');
    if (data is! List) {
      throw TelencephalonException(
        'GET /models/providers/presets → 形状不对：${data.runtimeType}',
      );
    }
    return data
        .cast<Map<String, dynamic>>()
        .map(ProviderPreset.fromJson)
        .toList();
  }

  /// 加一个供应商。
  ///
  /// ⚠️ 给了 [presetId] 就**只需要 API key**（base URL + API 标准由大脑的
  /// 目录给）⇒ ⇒ 这正是桌面端那套交互 ⇒ ⇒ 两端现在**打同一个接口**。
  ///
  /// ⚠️⚠️ **[providerType] 不能省**（2026-11-04 补齐）—— 大脑对「没给标准」
  /// 的兜底是 OpenAi（telencephalon/src/api/providers.rs 的 add_provider）
  /// ⇒ ⇒ 手机上加的自定义供应商**一律**是 openai 标准 ⇒ ⇒ 加一个 Claude
  /// 协议的端点 ⇒ ⇒ 大脑按 OpenAI 格式发 ⇒ ⇒ 400/401 ⇒ ⇒ 而读回来的
  /// api_standard 也是 openai ⇒ ⇒ **界面看不出异常** ⇒ ⇒ 失败长得像成功。
  /// ⇒ ⇒ 桌面端 provider_add_custom 一直带这个字段 ⇒ ⇒ 两端对齐。
  Future<RegisteredProvider> addProvider({
    String? presetId,
    String? name,
    String? baseUrl,
    String? providerType,
    String? apiKey,
  }) async {
    final body = <String, dynamic>{};
    if (presetId != null) body['preset_id'] = presetId;
    if (name != null) body['name'] = name;
    if (baseUrl != null) body['api_base'] = baseUrl;
    if (providerType != null) body['provider_type'] = providerType;
    if (apiKey != null) body['api_key'] = apiKey;
    return RegisteredProvider.fromJson(await _post('/models/providers', body));
  }

  /// 改一个供应商（启停 / 选模型 / 换 key / 改定义）。
  ///
  /// ⚠️ [providerType] 与 addProvider 同理 —— 少了它 ⇒ ⇒ 大脑那条
  /// provider_type 不会被改 ⇒ ⇒ 「界面说一个标准、盘上是另一个」⇒ ⇒
  /// 改不动的那种不一致。
  Future<RegisteredProvider> updateProvider(
    String id, {
    bool? enabled,
    String? selectedModel,
    String? apiKey,
    String? name,
    String? baseUrl,
    String? providerType,
  }) async {
    final body = <String, dynamic>{};
    if (enabled != null) body['enabled'] = enabled;
    if (selectedModel != null) body['selected_model'] = selectedModel;
    if (apiKey != null) body['api_key'] = apiKey;
    if (name != null) body['name'] = name;
    if (baseUrl != null) body['api_base'] = baseUrl;
    if (providerType != null) body['provider_type'] = providerType;
    return RegisteredProvider.fromJson(
      await _put('/models/providers/${Uri.encodeComponent(id)}', body),
    );
  }

  /// 删一个供应商。
  Future<void> deleteProvider(String id) async {
    final r = await _http.delete(
      await _u('/models/providers/${Uri.encodeComponent(id)}'),
      headers: _headers(),
    );
    if (r.statusCode != 204 && r.statusCode != 200) {
      throw TelencephalonException(
        'DELETE /models/providers/$id → ${r.statusCode}: ${r.body}',
      );
    }
  }

  /// 「测试并获取模型」—— **无状态**预览（大脑面 POST /models/providers/preview）。
  ///
  /// ⚠️ 与桌面端 provider_preview_fetch **同一个端点** ⇒ ⇒ 两端「添加前
  /// 看看这个供应商有哪些模型」是同一件事 ⇒ ⇒ 不可能漂。
  ///
  /// ⚠️ **无状态** ⇒ 不落盘、不进列表 ⇒ ⇒ 预览失败不会把供应商搞坏。
  Future<List<RegisteredModel>> previewProviderModels({
    String? presetId,
    String? baseUrl,
    String? apiStandard,
    String? apiKey,
  }) async {
    final body = <String, dynamic>{};
    if (presetId != null) body['preset_id'] = presetId;
    if (baseUrl != null) body['api_base'] = baseUrl;
    if (apiStandard != null) body['api_standard'] = apiStandard;
    if (apiKey != null) body['api_key'] = apiKey;
    final data = await _post('/models/providers/preview', body);
    return _modelsFrom(data);
  }

  /// 拉模型列表并**落盘**（大脑面 POST /models/providers/{id}/fetch-models）。
  ///
  /// ⚠️ 与桌面端 provider_refresh **同一个端点** ⇒ ⇒ 模型列表的**真相只有一份**
  /// ⇒ ⇒ 手机上刷新了，桌面端也看得到（反之亦然）。
  Future<List<RegisteredModel>> fetchProviderModels(String id) async {
    final data = await _post(
      '/models/providers/${Uri.encodeComponent(id)}/fetch-models',
      const <String, dynamic>{},
    );
    return _modelsFrom(data);
  }

  // =========================================================================
  // neuron 目录面（挂载在脑面上的 `/v1/models` —— 与 OpenAI 推理面同一挂载）
  // =========================================================================

  /// neuron 目录**全量**（含「目录里有、还没下载」的条目）。
  ///
  /// ⚠️ 与 `/models/providers` 里内置条目的读视图是**两份形状**：这边带
  /// `engine`／`default_repo`（发起下载要用的两样）⇒ ⇒ 那边没有 ⇒ ⇒
  /// 「下载弹窗」的数据源是**这一份**，不是内置条目那份。
  Future<List<NeuronCatalogEntry>> neuronCatalog() async {
    final decoded = await _getJson('/v1/models');
    final map = decoded as Map<String, dynamic>;
    final raw = (map['data'] as List?) ?? const [];
    return raw
        .cast<Map<String, dynamic>>()
        .map(NeuronCatalogEntry.fromJson)
        .toList();
  }

  /// 发起下载（neuron `POST /v1/models/pull`）—— 成功码是 **202**。
  ///
  /// ⚠️ 这条端点是**异步任务**（202 Accepted ＋ job_id）⇒ ⇒ `_post`
  /// （只认 200/201）会把「已受理」当失败抛 ⇒ ⇒ 单独写。
  Future<String> neuronPull({
    required String reference,
    required String engine,
    required String id,
  }) async {
    final r = await _http.post(
      await _u('/v1/models/pull'),
      headers: _headers(jsonBody: true),
      body: jsonEncode(<String, dynamic>{
        'reference': reference,
        'engine': engine,
        'id': id,
      }),
    );
    if (r.statusCode != 200 && r.statusCode != 202) {
      throw TelencephalonException(
        'POST /v1/models/pull → ${r.statusCode}: ${r.body}',
      );
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    return body['job_id'] as String;
  }

  /// 下载任务列表（进度轮询用）。
  Future<List<NeuronPullJob>> neuronPullJobs() async {
    final map = await _get('/v1/models/pull');
    final raw = (map['data'] as List?) ?? const [];
    return raw
        .cast<Map<String, dynamic>>()
        .map(NeuronPullJob.fromJson)
        .toList();
  }

  /// 取消一个下载任务（neuron `DELETE /v1/models/pull/{job_id}`）。
  Future<void> neuronPullCancel(String jobId) async {
    final r = await _http.delete(
      await _u('/v1/models/pull/${Uri.encodeComponent(jobId)}'),
      headers: _headers(),
    );
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw TelencephalonException(
        'DELETE /v1/models/pull/$jobId → ${r.statusCode}: ${r.body}',
      );
    }
  }

  // =========================================================================
  // 图片生成面（`image_gen` 档的门面 —— admin 门）
  // =========================================================================

  /// **图片生成**（大脑面 POST /api/telencephalon/images/generations）。
  ///
  /// ⚠️ **门面会自己分流**：`model` 落在云供应商模型表 ⇒ 端脑代理
  /// （key 不出大脑）；否则 ⇒ 内嵌 neuron 的 imagegen 注册表。
  /// `model` 不给就用 `image_gen` 分档默认。
  ///
  /// ⚠️ **门是 admin** ⇒ `_headers()` 本来就**两把都带**（影子锁 ∪ admin
  /// token）⇒ 与 TTS 那一格同一档。
  ///
  /// ⚠️ body 形状与桌面端 `GenerateImageRequest` 同一份
  /// （prompt 必填；size = "WxH" 16 的倍数；n 1..=4）⇒ 两端一种请求形状。
  Future<Map<String, dynamic>> generateImage(Map<String, dynamic> body) async {
    return _post('/api/telencephalon/images/generations', body);
  }

  // =========================================================================
  // 配置中心（`/api/telencephalon/config/*`）—— 记忆存储的落点写在这里
  // =========================================================================

  /// 读一个配置段（`entries` ＋ `applies_when`）。
  ///
  /// ⚠️ 控制面未连接时端脑回 **503**（`config_centre_unavailable`）——
  /// 那不是「空列表」，是**读不到** ⇒ 界面必须分开说。
  Future<Map<String, dynamic>> configSection(String section) async {
    return _get('/api/telencephalon/config/${Uri.encodeComponent(section)}');
  }

  /// 写一条配置。`secret: true` ⇒ 服务端密封入库、读回掩码（`***`）。
  Future<Map<String, dynamic>> putConfig(
    String section,
    String key,
    Object? value, {
    bool secret = false,
  }) async {
    return _put(
      '/api/telencephalon/config/${Uri.encodeComponent(section)}/${Uri.encodeComponent(key)}',
      <String, dynamic>{'value': value, 'secret': secret},
    );
  }

  /// 删一条配置（切后端后清掉不再适用的键）。
  ///
  /// ⚠️ 404（本来就没有）**不算失败** —— 目标状态已经成立。
  Future<void> deleteConfig(String section, String key) async {
    final r = await _http.delete(
      await _u(
        '/api/telencephalon/config/${Uri.encodeComponent(section)}/${Uri.encodeComponent(key)}',
      ),
      headers: _headers(),
    );
    if (r.statusCode != 200 && r.statusCode != 204 && r.statusCode != 404) {
      throw TelencephalonException(
        'DELETE /api/telencephalon/config/$section/$key → ${r.statusCode}: ${r.body}',
      );
    }
  }

  /// **大脑两个模型端点的**形状不一样** ⇒ ⇒ 一个解析器吃两种。
  ///
  /// * preview ⇒ synapse 目录那份 ModelSummary（display_name / capability）
  /// * fetch-models ⇒ 大脑自己的 ModelInfo（name / capabilities[]）
  ///
  /// ⚠️ 只认一种 ⇒ ⇒ 另一半的「显示名」与「能力」会**静默丢成 null**
  /// ⇒ ⇒ 界面上分不出「这条是聊天模型还是语音模型」。
  static List<RegisteredModel> _modelsFrom(Map<String, dynamic> data) {
    final raw = (data['models'] as List?) ?? const [];
    return raw
        .cast<Map<String, dynamic>>()
        .map(RegisteredModel.fromJson)
        .toList();
  }

  /// PUT —— 这张面**没有**现成的 PUT helper（端脑的写面大多是 POST）。
  Future<Map<String, dynamic>> _put(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _http.put(
      await _u(path),
      headers: _headers(jsonBody: true),
      body: jsonEncode(body),
    );
    if (r.statusCode != 200) {
      throw TelencephalonException('PUT $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }
}

/// 大脑提供的一条**已配置**供应商（端脑面 `/models/providers` 的读模型）。
///
/// ⚠️ 字段名**跟大脑对齐**（不是两端各抄一套）⇒ ⇒ 两端读**同一份数据**。
class RegisteredProvider {
  final String id;
  final String name;
  final String baseUrl;
  final String apiStandard;
  final bool enabled;
  final String? selectedModel;
  final String? presetId;
  final List<RegisteredModel> models;
  final String? lastError;
  final String? lastRefreshedAt;
  ///
  /// **内置供应商**（neuron）—— 大脑自带的那个**本地模型**供应商。
  ///
  /// ⚠️ 它在注册表里**只读**（读视图里合成，不在存储里）⇒ ⇒ 界面据此不给
  /// 「启停 / 选模型 / 编辑 / 删除」—— 那些动作**写不进去** ⇒ ⇒ 按下去只会
  /// 拿到 400（大脑那边明确拒），界面不能给用户一个必然失败的按钮。
  final bool builtin;

  const RegisteredProvider({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.apiStandard,
    required this.enabled,
    this.selectedModel,
    this.presetId,
    this.models = const [],
    this.lastError,
    this.lastRefreshedAt,
    this.builtin = false,
  });

  factory RegisteredProvider.fromJson(Map<String, dynamic> json) {
    final providerType = (json['provider_type'] as String?) ?? '';
    return RegisteredProvider(
      id: (json['id'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      // ⚠️ `base_url` 是大脑给的别名；`api_base` 是它自己的老字段 ⇒ 两个都读。
      baseUrl:
          (json['base_url'] as String?) ?? (json['api_base'] as String?) ?? '',
      apiStandard:
          (json['api_standard'] as String?) ?? _deriveStandard(providerType),
      enabled: json['enabled'] as bool? ?? true,
      selectedModel: json['selected_model'] as String?,
      presetId: json['preset_id'] as String?,
      models: ((json['models'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(RegisteredModel.fromJson)
          .toList(),
      lastError: json['last_error'] as String?,
      lastRefreshedAt: json['last_refreshed_at'] as String?,
      // ⚠️ 大脑那边的内置条目会自报家门（`builtin: true`）⇒ ⇒ 老数据没这个
      // 字段时按「不是内置」处理（**不**把普通供应商误判成内置）。
      builtin: json['builtin'] as bool? ?? false,
    );
  }

  /// 大脑没给标准时，按它自己的 `provider_type` 派生（存量里是
  /// `openai_compatible` 这种自由文本）。
  static String _deriveStandard(String providerType) {
    final t = providerType.toLowerCase();
    return (t.contains('claude') || t.contains('anthropic'))
        ? 'claude'
        : 'openai';
  }
}

/// 大脑给的**模型列表**里的一条。
class RegisteredModel {
  final String id;
  final String name;

  /// **能力**（llm / asr / tts / embedding / vision / rerank / ocr）。
  ///
  /// ⚠️ 内置条目（neuron 目录）的模型**横跨七种能力** ⇒ ⇒ 不带它 ⇒ ⇒ 界面
  /// ⇒ ⇒ 分不出「这条是聊天模型还是语音模型」。
  final String? capability;

  /// **盘上真的有吗** —— 没下载 ⇒ 选了也跑不起来 ⇒ ⇒ 界面**不许选**它。
  ///
  /// ⚠️ 没有这个字段 ＝ **不知道** ⇒ ⇒ 按「可用」处理。
  final bool? available;

  const RegisteredModel({
    required this.id,
    required this.name,
    this.capability,
    this.available,
  });

  factory RegisteredModel.fromJson(Map<String, dynamic> json) => RegisteredModel(
    id: (json['id'] as String?) ?? (json['model_id'] as String?) ?? '',
    // ⚠️ **两种形状各有一个「显示名」字段名** ⇒ ⇒ 两个都读：
    //   * 大脑自己的 ModelInfo ⇒ name
    //   * synapse 目录那份 ModelSummary（preview 端点回的就是它）⇒ display_name
    // 只认一种 ⇒ ⇒ 另一半的显示名**静默退化成 id**。
    name:
        (json['name'] as String?) ??
        (json['display_name'] as String?) ??
        (json['id'] as String?) ??
        '',
    capability: _firstCapability(json),
    available: json['available'] as bool?,
  );

  /// 取**第一个**能力（没有 ⇒ null）。
  ///
  /// ⚠️ 两种形状：synapse 目录那份是**单个** capability（字符串），大脑自己
  /// 那份是 capabilities 数组 ⇒ ⇒ 两个都读。
  static String? _firstCapability(Map<String, dynamic> json) {
    final single = json['capability'];
    if (single is String && single.isNotEmpty) return single;
    final caps = json['capabilities'];
    if (caps is! List) return null;
    for (final c in caps) {
      if (c is String && c.isNotEmpty) return c;
    }
    return null;
  }
}

/// 大脑给的**预设目录**里的一条（端脑面 `/models/providers/presets`）。
///
/// ⚠️ 权威在 `synapse::providers::catalog` ⇒ ⇒ 客户端**只读**它，不自己抄。
class ProviderPreset {
  final String id;
  final String name;
  final String baseUrl;
  final String apiStandard;
  final String? defaultModel;
  final bool requiresKey;

  const ProviderPreset({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.apiStandard,
    this.defaultModel,
    required this.requiresKey,
  });

  factory ProviderPreset.fromJson(Map<String, dynamic> json) => ProviderPreset(
    id: (json['id'] as String?) ?? '',
    name: (json['name'] as String?) ?? '',
    baseUrl: (json['base_url'] as String?) ?? '',
    apiStandard: (json['api_standard'] as String?) ?? 'openai',
    defaultModel: json['default_model'] as String?,
    requiresKey: json['requires_key'] as bool? ?? true,
  );
}

class TelencephalonException implements Exception {
  final String message;
  TelencephalonException(this.message);
  @override
  String toString() => 'TelencephalonException: $message';
}

class TelencephalonConnection {
  final String baseUrl;
  final String? apiKey;
  const TelencephalonConnection({required this.baseUrl, this.apiKey});
}

final defaultTelencephalonClient = TelencephalonClient();
final defaultTelencephalonConnection = TelencephalonConnection(
  baseUrl: 'http://127.0.0.1:60080',
);

/// neuron 目录面的一条（脑面挂载 `/v1/models` 的 `data[]` 元素）。
///
/// ⚠️ `id` 是 `engine/model` 组合形状（如 `asr/sensevoice-small`）⇒ ⇒
/// pull 端点要的 `id` 是**去掉 engine 前缀**的那截 ⇒ ⇒ 用 [modelId]。
class NeuronCatalogEntry {
  final String id;
  final String engine;

  /// **盘上真的有吗** —— false ＝ 目录里有、还没下载（可以发下载）。
  final bool available;
  final int? sizeBytes;

  /// 默认仓库（`huggingface:owner/repo`）—— **直接当 pull 的 reference**。
  final String? defaultRepo;

  /// 目录自带的**能力词**（llm / vision / asr / tts / embedding / rerank…）
  /// —— 端脑的能力目录说了算 ⇒ ⇒ 下载后客户端拿它当**默认参数**，
  /// 不让用户手填（「添加自持模型 ＝ 挑一个下载」那一刀）。
  final List<String> capabilities;

  const NeuronCatalogEntry({
    required this.id,
    required this.engine,
    required this.available,
    this.sizeBytes,
    this.defaultRepo,
    this.capabilities = const [],
  });

  factory NeuronCatalogEntry.fromJson(Map<String, dynamic> json) =>
      NeuronCatalogEntry(
        id: json['id'] as String? ?? '',
        engine: json['engine'] as String? ?? '',
        available: json['available'] as bool? ?? false,
        sizeBytes: json['size_bytes'] as int?,
        defaultRepo: json['default_repo'] as String?,
        capabilities:
            (json['capabilities'] as List?)?.whereType<String>().toList() ??
            const [],
      );

  /// pull 端点要的 id —— **去掉 engine 前缀**（`asr/x` → `x`；
  /// `llm/a/b` → `a/b`，按**第一个**斜杠拆）。
  String get modelId =>
      id.contains('/') ? id.substring(id.indexOf('/') + 1) : id;
}

/// 一个下载任务（`GET /v1/models/pull` 的 `data[]` 元素）。
class NeuronPullJob {
  final String jobId;

  /// pending / in_progress / completed / failed / cancelled
  final String status;
  final String reference;
  final String engine;
  final int bytesDownloaded;
  final int? totalBytes;
  final String? currentFile;
  final String? error;

  const NeuronPullJob({
    required this.jobId,
    required this.status,
    required this.reference,
    required this.engine,
    required this.bytesDownloaded,
    this.totalBytes,
    this.currentFile,
    this.error,
  });

  factory NeuronPullJob.fromJson(Map<String, dynamic> json) => NeuronPullJob(
        jobId: json['job_id'] as String? ?? '',
        status: json['status'] as String? ?? '',
        reference: json['reference'] as String? ?? '',
        engine: json['engine'] as String? ?? '',
        bytesDownloaded: json['bytes_downloaded'] as int? ?? 0,
        totalBytes: json['total_bytes'] as int?,
        currentFile: json['current_file'] as String?,
        error: json['error'] as String?,
      );

  /// 还在跑（要不要继续轮询）。
  bool get isActive => status == 'pending' || status == 'in_progress';

  /// 下载完成。
  bool get isDone => status == 'completed';

  /// 失败（错误文本在 [error]）。
  bool get isFailed => status == 'failed';
}
