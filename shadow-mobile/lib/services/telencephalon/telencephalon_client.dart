import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

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
    final envelope = (json['telencephalon'] as Map<String, dynamic>?) ??
        (json['telencephalon'] as Map<String, dynamic>?) ??
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

  factory ConversationTurn.fromJson(Map<String, dynamic> json) =>
      ConversationTurn(
        role: json['role'] as String,
        text: json['text'] as String,
        timestamp: DateTime.fromMillisecondsSinceEpoch(
          (json['timestamp'] as num).toInt(),
        ),
      );

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
  const SendMessageRequest({required this.text, this.agent});

  Map<String, dynamic> toJson() => {
    'text': text,
    if (agent != null) 'agent': agent,
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

  StreamEvent({
    required this.type,
    this.agent,
    this.delta,
    this.conversationId,
    this.state,
    this.timestamp,
    this.error,
    this.clarification,
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

class TelencephalonClient {
  static const String _defaultBaseUrl = 'http://127.0.0.1:60080';

  String _baseUrl;
  String? _apiKey;
  String? _adminToken;
  final http.Client _http;

  TelencephalonClient({
    String? baseUrl,
    String? apiKey,
    String? adminToken,
    http.Client? client,
  }) : _baseUrl = baseUrl ?? _defaultBaseUrl,
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

  Uri _u(String path) => Uri.parse('$_baseUrl$path');

  Future<Map<String, dynamic>> _get(String path) async {
    final r = await _http.get(_u(path), headers: _headers());
    if (r.statusCode != 200) {
      throw TelencephalonException('GET $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _http.post(
      _u(path),
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
      _u(path),
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
      _u(path),
      headers: _headers(jsonBody: true, admin: true),
      body: jsonEncode(body),
    );
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw TelencephalonException('POST $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _adminGet(String path) async {
    final r = await _http.get(_u(path), headers: _headers(admin: true));
    if (r.statusCode != 200) {
      throw TelencephalonException('GET $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<void> _adminDelete(String path) async {
    final r = await _http.delete(_u(path), headers: _headers(admin: true));
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
    final json = await _get('/shadow/v1/conversations');
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

  /// Stream message via SSE. Yields StreamEvent as they arrive.
  Stream<StreamEvent> streamMessage(
    String conversationId,
    SendMessageRequest req,
  ) async* {
    final headers = _headers(jsonBody: true);
    final request = http.Request(
      'POST',
      _u(
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
    final uri = Uri.parse(
      '$_baseUrl/api/flows',
    ).replace(queryParameters: query.isEmpty ? null : query);
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
    final uri = Uri.parse(
      '$_baseUrl/api/telencephalon/agents/search',
    ).replace(queryParameters: query.isEmpty ? null : query);
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
