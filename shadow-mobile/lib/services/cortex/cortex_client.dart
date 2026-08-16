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

/// Cortex connection config
class CortexConfig {
  final String baseUrl;
  final String? apiKey;
  const CortexConfig({required this.baseUrl, this.apiKey});
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
      inputModalities: (meta['input_modalities'] as List?)?.cast<String>() ?? const [],
      outputModalities: (meta['output_modalities'] as List?)?.cast<String>() ?? const [],
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
  final String cortexId;
  final String instanceName;
  final String defaultAgent;
  final List<LobeInfo> agents;

  AgentsResponse({
    required this.cortexId,
    required this.instanceName,
    required this.defaultAgent,
    required this.agents,
  });

  factory AgentsResponse.fromJson(Map<String, dynamic> json) {
    final cortex = json['cortex'] as Map<String, dynamic>? ?? const {};
    final agents = (json['agents'] as List?) ?? const [];
    return AgentsResponse(
      cortexId: cortex['id'] as String? ?? '',
      instanceName: cortex['instance_name'] as String? ?? '',
      defaultAgent: cortex['default_agent'] as String? ?? '',
      agents: agents.map((e) => LobeInfo.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}

class ConversationTurn {
  final String role;
  final String text;
  final DateTime timestamp;
  ConversationTurn({required this.role, required this.text, required this.timestamp});

  factory ConversationTurn.fromJson(Map<String, dynamic> json) => ConversationTurn(
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

  Map<String, dynamic> toJson() => {'text': text, if (agent != null) 'agent': agent};
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

  factory SendMessageResponse.fromJson(Map<String, dynamic> json) => SendMessageResponse(
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

  StreamEvent({
    required this.type,
    this.agent,
    this.delta,
    this.conversationId,
    this.state,
    this.timestamp,
    this.error,
  });

  factory StreamEvent.fromJson(Map<String, dynamic> json) => StreamEvent(
    type: json['type'] as String,
    agent: json['agent'] as String?,
    delta: json['delta'] as String?,
    conversationId: json['conversation_id'] as String?,
    state: json['state'] as String?,
    timestamp: json['timestamp'] != null
        ? DateTime.fromMillisecondsSinceEpoch((json['timestamp'] as num).toInt())
        : null,
    error: json['error'] as String?,
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
  FlowDefinition({required this.id, required this.name, required this.version, required this.schemaVersion, required this.raw});

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
  factory FlowRunResult.fromJson(Map<String, dynamic> json) => FlowRunResult(outputs: json);
}

class CortexClient {
  static const String _defaultBaseUrl = 'http://127.0.0.1:60080';

  String _baseUrl;
  String? _apiKey;
  final http.Client _http;

  CortexClient({String? baseUrl, String? apiKey, http.Client? client})
      : _baseUrl = baseUrl ?? _defaultBaseUrl,
        _apiKey = apiKey,
        _http = client ?? http.Client();

  String get baseUrl => _baseUrl;
  void setBaseUrl(String url) => _baseUrl = url;
  String? get apiKey => _apiKey;
  void setApiKey(String? key) => _apiKey = key;

  Map<String, String> _headers({bool jsonBody = false}) {
    final h = <String, String>{};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (_apiKey != null && _apiKey!.isNotEmpty) h['X-Shadow-Key'] = _apiKey!;
    return h;
  }

  Uri _u(String path) => Uri.parse('$_baseUrl$path');

  Future<Map<String, dynamic>> _get(String path) async {
    final r = await _http.get(_u(path), headers: _headers());
    if (r.statusCode != 200) {
      throw CortexException('GET $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final r = await _http.post(_u(path), headers: _headers(jsonBody: true), body: jsonEncode(body));
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw CortexException('POST $path → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<void> _postExpectEmpty(String path, [Map<String, dynamic>? body]) async {
    final r = await _http.post(_u(path), headers: _headers(jsonBody: true), body: jsonEncode(body ?? const {}));
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw CortexException('POST $path → ${r.statusCode}: ${r.body}');
    }
  }

  /// Probe cortex: GET /.well-known/agent.json
  Future<Map<String, dynamic>> health() => _get('/.well-known/agent.json');

  /// List registered lobes (returns cortex id + agent list)
  Future<AgentsResponse> listAgents() async {
    final json = await _get('/shadow/v1/agents');
    return AgentsResponse.fromJson(json);
  }

  Future<Map<String, dynamic>> getAgent(String name) =>
      _get('/shadow/v1/agents/${Uri.encodeComponent(name)}');

  Future<Conversation> createConversation({String? agent, String? systemPrompt}) async {
    final body = <String, dynamic>{};
    if (agent != null) body['agent'] = agent;
    if (systemPrompt != null) body['system'] = systemPrompt;
    final json = await _post('/shadow/v1/conversations', body);
    return Conversation.fromJson(json);
  }

  Future<Conversation> getConversation(String id) async {
    final json = await _get('/shadow/v1/conversations/${Uri.encodeComponent(id)}');
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
    final history = export.messages.map((m) => {
      'role': m['role'] ?? 'user',
      'text': m['text'] ?? '',
      'timestamp': (m['timestamp'] is int) ? m['timestamp'] : (m['timestamp'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
    }).toList();
    final body = {
      'agent': agent,
      'history': history,
    };
    final json = await _post(
      '/shadow/v1/conversations/${Uri.encodeComponent(export.sessionId)}/import',
      body,
    );
    return Conversation.fromJson(json);
  }

  Future<SendMessageResponse> sendMessage(String conversationId, SendMessageRequest req) async {
    final json = await _post(
      '/shadow/v1/conversations/${Uri.encodeComponent(conversationId)}/messages',
      req.toJson(),
    );
    return SendMessageResponse.fromJson(json);
  }

  /// Stream message via SSE. Yields StreamEvent as they arrive.
  Stream<StreamEvent> streamMessage(String conversationId, SendMessageRequest req) async* {
    final headers = _headers(jsonBody: true);
    final request = http.Request('POST', _u('/shadow/v1/conversations/${Uri.encodeComponent(conversationId)}/messages:stream'));
    request.headers.addAll(headers);
    request.body = jsonEncode(req.toJson());

    final response = await _http.send(request);
    if (response.statusCode != 200) {
      throw CortexException('streamMessage → ${response.statusCode}');
    }
    final lines = response.stream.transform(utf8.decoder).transform(const LineSplitter());
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

  Future<List<FlowMeta>> listFlows({String? name, String? tag, bool? isDraft}) async {
    final query = <String, String>{};
    if (name != null) query['name'] = name;
    if (tag != null) query['tag'] = tag;
    if (isDraft != null) query['is_draft'] = isDraft.toString();
    final uri = Uri.parse('$_baseUrl/api/flows').replace(queryParameters: query.isEmpty ? null : query);
    final r = await _http.get(uri, headers: _headers());
    if (r.statusCode != 200) throw CortexException('listFlows → ${r.statusCode}');
    final list = jsonDecode(r.body) as List<dynamic>;
    return list.map((e) => FlowMeta.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<FlowDefinition> createFlow(FlowDefinition flow) async {
    final json = await _post('/api/flows', flow.raw);
    return FlowDefinition.fromJson(json);
  }

  Future<FlowDefinition> getFlow(String id) async {
    final json = await _get('/api/flows/${Uri.encodeComponent(id)}');
    return FlowDefinition.fromJson(json);
  }

  Future<FlowRunResult> runFlow(String flowIdOrName, Map<String, dynamic> inputs, {String? sessionId}) async {
    final body = <String, dynamic>{'inputs': inputs};
    if (sessionId != null) body['session_id'] = sessionId;
    final json = await _post('/api/flows/by-name/${Uri.encodeComponent(flowIdOrName)}/invoke', body);
    return FlowRunResult.fromJson(json);
  }

  Future<List<FlowDefinition>> listDrafts() async {
    final list = await _get('/api/flows/draft');
    return ((list['drafts'] as List?) ?? (list as List<dynamic>))
        .map((e) => FlowDefinition.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FlowDefinition> promoteDraft(String draftId) async {
    final json = await _post('/api/flows/draft/${Uri.encodeComponent(draftId)}/promote', const {});
    return FlowDefinition.fromJson(json);
  }

  Future<void> rejectDraft(String draftId) =>
      _postExpectEmpty('/api/flows/draft/${Uri.encodeComponent(draftId)}/reject');

  // ---- MCP Management API ----

  Future<List<Map<String, dynamic>>> listMcpServers() async {
    final json = await _get('/api/cortex/mcp/servers');
    return (json['servers'] as List<dynamic>?)
        ?.map((e) => Map<String, dynamic>.from(e as Map))
        .toList() ?? [];
  }

  Future<Map<String, dynamic>> getMcpServer(String id) async {
    return await _get('/api/cortex/mcp/servers/${Uri.encodeComponent(id)}');
  }

  Future<List<Map<String, dynamic>>> getMcpServerTools(String id) async {
    final json = await _get('/api/cortex/mcp/servers/${Uri.encodeComponent(id)}/tools');
    return (json as List<dynamic>)
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<List<Map<String, dynamic>>> listMcpServersForAgent(String agentName) async {
    final json = await _get('/api/cortex/mcp/agents/${Uri.encodeComponent(agentName)}/servers');
    return (json['bindings'] as List<dynamic>?)
        ?.map((e) => Map<String, dynamic>.from(e as Map))
        .toList() ?? [];
  }

  Future<List<Map<String, dynamic>>> getAgentMcpTools(String agentName) async {
    final json = await _get('/api/cortex/mcp/agents/${Uri.encodeComponent(agentName)}/tools');
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
      'wasm': {
        'name': wasmName,
        'version': wasmVersion,
        'sha256': wasmSha256,
      },
    };
    if (memoryBytes != null || fuel != null || wallClockMs != null) {
      body['quota'] = {
        if (memoryBytes != null) 'memory_bytes': memoryBytes,
        if (fuel != null) 'fuel': fuel,
        if (wallClockMs != null) 'wall_clock_ms': wallClockMs,
      };
    }
    if (description != null) body['description'] = description;
    return await _post('/api/cortex/admin/mcp/servers', body);
  }

  Future<void> deleteMcpServer(String id) async {
    await _http.delete(
      Uri.parse('$_baseUrl/api/cortex/admin/mcp/servers/${Uri.encodeComponent(id)}'),
      headers: _headers(),
    );
  }

  Future<Map<String, dynamic>> startMcpServer(String id) async {
    return await _post('/api/cortex/admin/mcp/servers/${Uri.encodeComponent(id)}/start', const {});
  }

  Future<Map<String, dynamic>> stopMcpServer(String id) async {
    return await _post('/api/cortex/admin/mcp/servers/${Uri.encodeComponent(id)}/stop', const {});
  }

  Future<Map<String, dynamic>> bindMcpServerToAgent(String agentName, String serverId) async {
    return await _post(
      '/api/cortex/admin/mcp/agents/${Uri.encodeComponent(agentName)}/servers/${Uri.encodeComponent(serverId)}',
      const {},
    );
  }

  Future<void> unbindMcpServerFromAgent(String agentName, String serverId) async {
    await _http.delete(
      Uri.parse(
        '$_baseUrl/api/cortex/admin/mcp/agents/${Uri.encodeComponent(agentName)}/servers/${Uri.encodeComponent(serverId)}',
      ),
      headers: _headers(),
    );
  }

  // ---- Agent Management API ----

  Future<Map<String, dynamic>> scanExternalAgents() async {
    return await _post('/api/cortex/agents/scan', const {});
  }

  Future<Map<String, dynamic>> syncExternalAgent(String providerId) async {
    return await _post('/api/cortex/agents/sync/${Uri.encodeComponent(providerId)}', const {});
  }

  Future<Map<String, dynamic>> discoverAgents() async {
    return await _get('/api/cortex/agents/discover');
  }

  Future<Map<String, dynamic>> searchAgents({String? skill, String? q}) async {
    final query = <String, String>{};
    if (skill != null) query['skill'] = skill;
    if (q != null) query['q'] = q;
    final uri = Uri.parse('$_baseUrl/api/cortex/agents/search')
        .replace(queryParameters: query.isEmpty ? null : query);
    final r = await _http.get(uri, headers: _headers());
    if (r.statusCode != 200) {
      throw CortexException('searchAgents → ${r.statusCode}: ${r.body}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> listInstalledWasm() async {
    final json = await _get('/api/cortex/admin/agents/installed');
    return (json['entries'] as List<dynamic>?)
        ?.map((e) => Map<String, dynamic>.from(e as Map))
        .toList() ?? [];
  }

  Future<void> deleteWasm(String name, String version) async {
    await _http.delete(
      Uri.parse('$_baseUrl/api/cortex/admin/agents/${Uri.encodeComponent(name)}/${Uri.encodeComponent(version)}'),
      headers: _headers(),
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
    final body = <String, dynamic>{
      'name': name,
      'system_prompt': systemPrompt,
    };
    if (version != null) body['version'] = version;
    if (description != null) body['description'] = description;
    if (skills != null) body['skills'] = skills;
    if (modelProvider != null) body['model_provider'] = modelProvider;
    if (modelName != null) body['model_name'] = modelName;
    return await _post('/api/cortex/admin/agents/create', body);
  }

  Future<Map<String, dynamic>> generateAgentDescription(String systemPrompt) async {
    return await _post('/api/cortex/admin/agents/generate-description', {
      'system_prompt': systemPrompt,
    });
  }

  void dispose() => _http.close();

  /// Build the cortex WebRTC signaling URL for a session.
  /// Endpoint not yet exposed by cortex (spec §4 unimplemented).
  /// Kept here as the canonical URL when cortex adds the endpoint.
  Uri webrtcSignalingUrl(String sessionId, {String modality = 'voice'}) {
    return Uri.parse('$_baseUrl/api/webrtc/$modality/sessions/${Uri.encodeComponent(sessionId)}/ws');
  }
}

class CortexException implements Exception {
  final String message;
  CortexException(this.message);
  @override
  String toString() => 'CortexException: $message';
}

class CortexConnection {
  final String baseUrl;
  final String? apiKey;
  const CortexConnection({required this.baseUrl, this.apiKey});
}

final defaultCortexClient = CortexClient();
final defaultCortexConnection = CortexConnection(baseUrl: 'http://127.0.0.1:60080');
