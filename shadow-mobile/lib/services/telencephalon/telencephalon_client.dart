import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import '../client_tools/client_tool_registry.dart';

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

  LobeInfo({
    required this.name,
    required this.kind,
    required this.url,
    required this.enabled,
    required this.skills,
    required this.agentCard,
    required this.healthStatus,
  });

  factory LobeInfo.fromJson(Map<String, dynamic> json) => LobeInfo(
    name: json['name'] as String,
    kind: (json['kind'] as String?) ?? 'native',
    url: (json['url'] as String?) ?? '',
    enabled: (json['enabled'] as bool?) ?? true,
    skills: ((json['skills'] as List?)?.cast<String>()) ?? const [],
    agentCard: AgentCard.fromJson(json['agent_card'] as Map<String, dynamic>),
    healthStatus: (json['health_status'] as String?) ?? 'unknown',
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

  Conversation({
    required this.id,
    required this.agent,
    required this.createdAt,
    required this.updatedAt,
    required this.history,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
    id: json['id'] as String,
    agent: (json['agent'] as String?) ?? '',
    createdAt: DateTime.parse(json['created_at'] as String),
    updatedAt: DateTime.parse(json['updated_at'] as String),
    history: ((json['history'] as List?) ?? const [])
        .map((e) => ConversationTurn.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
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

  const SendMessageRequest({
    required this.text,
    this.agent,
    this.tools,
  });

  Map<String, dynamic> toJson() => {
    'text': text,
    if (agent != null) 'agent': agent,
    if (tools != null && tools!.isNotEmpty) 'tools': tools,
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
  //   tool_call   → {type, agent, name, args}
  //   tool_result → {type, agent, name, result, latency_ms}
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

  Map<String, String> _headers({bool jsonBody = false, bool admin = false}) {
    final h = <String, String>{};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (_apiKey != null && _apiKey!.isNotEmpty) h['X-Shadow-Key'] = _apiKey!;
    if (admin && _adminToken != null && _adminToken!.isNotEmpty) {
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

  Future<void> _postExpectEmpty(
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
      headers: _headers(jsonBody: true, admin: true),
      body: jsonEncode(body),
    );
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw TelencephalonException('POST $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _adminGet(String path) async {
    final r = await _http.get(await _u(path), headers: _headers(admin: true));
    if (r.statusCode != 200) {
      throw TelencephalonException('GET $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<void> _adminDelete(String path) async {
    final r = await _http.delete(await _u(path), headers: _headers(admin: true));
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw TelencephalonException('DELETE $path → ${r.statusCode}: ${r.body}');
    }
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
    return _post('/api/telencephalon/lobes/models', {
      'default_model': defaultModel,
      'lobe_models': {
        for (final entry in lobeModels.entries) entry.key: entry.value,
      },
      'providers': providers,
    });
  }

  Future<Map<String, dynamic>> getAgent(String name) =>
      _get('/shadow/v1/agents/${Uri.encodeComponent(name)}');

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

  Future<List<Conversation>> listConversations() async {
    // This endpoint answers with a JSON array, so it must not go through
    // [_get] (which casts the body to a Map).
    final json = await _getJson('/shadow/v1/conversations');
    return (json as List<dynamic>)
        .map((e) => Conversation.fromJson(e as Map<String, dynamic>))
        .toList();
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
    final json = await _post('/api/flows', flow.raw);
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
    final json = await _post(
      '/api/flows/${Uri.encodeComponent(resolvedId)}/run',
      body,
    );
    return FlowRunResult.fromJson(json);
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
    final list = await _get('/api/flows/draft');
    return ((list['drafts'] as List?) ?? (list as List<dynamic>))
        .map((e) => FlowDefinition.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FlowDefinition> promoteDraft(String draftId) async {
    final json = await _post(
      '/api/flows/draft/${Uri.encodeComponent(draftId)}/promote',
      const {},
    );
    return FlowDefinition.fromJson(json);
  }

  Future<void> rejectDraft(String draftId) => _postExpectEmpty(
    '/api/flows/draft/${Uri.encodeComponent(draftId)}/reject',
  );

  // ---- MCP Management API ----

  Future<List<Map<String, dynamic>>> listMcpServers() async {
    final json = await _get('/api/telencephalon/mcp/servers');
    return (json['servers'] as List<dynamic>?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
  }

  Future<Map<String, dynamic>> getMcpServer(String id) async {
    return await _get('/api/telencephalon/mcp/servers/${Uri.encodeComponent(id)}');
  }

  Future<List<Map<String, dynamic>>> getMcpServerTools(String id) async {
    final json = await _get(
      '/api/telencephalon/mcp/servers/${Uri.encodeComponent(id)}/tools',
    );
    return (json as List<dynamic>)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<List<Map<String, dynamic>>> listMcpServersForAgent(
    String agentName,
  ) async {
    final json = await _get(
      '/api/telencephalon/mcp/agents/${Uri.encodeComponent(agentName)}/servers',
    );
    return (json['bindings'] as List<dynamic>?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
  }

  Future<List<Map<String, dynamic>>> getAgentMcpTools(String agentName) async {
    final json = await _get(
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
    return await _post('/api/telencephalon/agents/scan', const {});
  }

  Future<Map<String, dynamic>> syncExternalAgent(String providerId) async {
    return await _post(
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
  }) async {
    final body = <String, dynamic>{'name': name, 'system_prompt': systemPrompt};
    if (version != null) body['version'] = version;
    if (description != null) body['description'] = description;
    if (skills != null) body['skills'] = skills;
    if (modelProvider != null) body['model_provider'] = modelProvider;
    if (modelName != null) body['model_name'] = modelName;
    return await _adminPost('/api/telencephalon/admin/agents/create', body);
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
  /// 这条路由**不需要 admin token**（读是开放的），写才需要。
  /// 任务存在端脑进程内存里 —— 进程重启就没了。
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
