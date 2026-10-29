import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../l10n/current_l10n.dart';
import 'telencephalon/telencephalon_client.dart';

/// hippocampus 的任务按租户分区。默认租户与桌面端
/// `taskBoardDataStore` 的 `DEFAULT_TENANT` 保持一致。
const String defaultTaskTenantId = 'default';

/// Telencephalon API Client
/// All backend endpoints are served by telencephalon (port 60080).
/// Task, memory, and session endpoints are served by the embedded
/// hippocampus at /hippocampus/*.
///
/// **方言警告（2026-10-28）**：这个类说的是**前额叶方言**，不是端脑
/// 方言 —— 路径是 `/api/sessions`、`/api/agents`、`/api/skills`、
/// `/api/providers`、`/api/soul/*`、`/api/mcp/servers`、
/// `/hippocampus/api/*`。而嵌入式大脑挂起来的那条面（端脑的
/// `cortex_router`）说的是**端脑方言**：`/shadow/v1/*`、
/// `/api/telencephalon/*`、`/models/providers`。
///
/// 两者**没有交集**。所以「改嵌大脑」之后，这个 client **不能**指向
/// 嵌入式大脑的端脑面 —— 那样只会把「连接被拒」换成「404」。
/// 已经迁到端脑方言的调用见 `TelencephalonClient`。
///
/// 仍然留在这里的那些（soul / tasks / memory / providers / skills /
/// mcp / agents 列表页）在端脑里**没有对应概念**，需要单独决定由
/// 零信任网络里的哪个服务提供（记忆按用户的要求走网络上的
/// hippocampus，不在移动端本地）。
class PrefrontalClient {
  /// 端脑的默认地址 —— 外部 telencephalon 进程（:60080）。
  static const String defaultBaseUrl = 'http://localhost:60080';

  /// 端脑地址。
  final String baseUrl;
  final http.Client _client;

  PrefrontalClient({String? baseUrl, http.Client? client})
    : baseUrl = baseUrl ?? defaultBaseUrl,
      _client = client ?? http.Client();

  /// 基础请求方法
  Future<T> _request<T>(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
    T Function(dynamic)? parser,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final requestHeaders = {'Content-Type': 'application/json', ...?headers};

    http.Response response;

    switch (method.toUpperCase()) {
      case 'GET':
        response = await _client.get(uri, headers: requestHeaders);
        break;
      case 'POST':
        response = await _client.post(
          uri,
          headers: requestHeaders,
          body: body != null ? json.encode(body) : null,
        );
        break;
      case 'PUT':
        response = await _client.put(
          uri,
          headers: requestHeaders,
          body: body != null ? json.encode(body) : null,
        );
        break;
      case 'DELETE':
        response = await _client.delete(uri, headers: requestHeaders);
        break;
      default:
        throw PrefrontalApiException('Unsupported method: $method');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (parser != null) {
        final data = response.body.isNotEmpty
            ? json.decode(response.body)
            : null;
        return parser(data);
      }
      return response.body.isNotEmpty ? json.decode(response.body) : null as T;
    } else {
      throw PrefrontalApiException(
        'API Error: ${response.statusCode} - ${response.body}',
      );
    }
  }

  // ============ Provider APIs ============

  /// 获取所有Provider
  Future<List<ProviderResponse>> getProviders() async {
    final data = await _request<List<dynamic>>('GET', '/api/providers');
    return data.map((p) => ProviderResponse.fromJson(p)).toList();
  }

  /// 添加Provider
  Future<ProviderResponse> addProvider(AddProviderRequest request) async {
    return await _request<ProviderResponse>(
      'POST',
      '/api/providers',
      body: request.toJson(),
      parser: (data) => ProviderResponse.fromJson(data),
    );
  }

  /// 更新Provider
  Future<ProviderResponse> updateProvider(
    String name,
    UpdateProviderRequest request,
  ) async {
    return await _request<ProviderResponse>(
      'PUT',
      '/api/providers/$name',
      body: request.toJson(),
      parser: (data) => ProviderResponse.fromJson(data),
    );
  }

  /// 删除Provider
  Future<void> deleteProvider(String name) async {
    await _request('DELETE', '/api/providers/$name');
  }

  /// 设置默认Provider
  Future<void> setDefaultProvider(String name) async {
    await _request('PUT', '/api/providers/default', body: {'name': name});
  }

  // ============ Skill APIs ============

  /// 获取所有Skill
  Future<List<SkillResponse>> getSkills() async {
    final data = await _request<List<dynamic>>('GET', '/api/skills');
    return data.map((s) => SkillResponse.fromJson(s)).toList();
  }

  /// 获取Skill详情
  Future<SkillResponse> getSkill(String name) async {
    return await _request<SkillResponse>(
      'GET',
      '/api/skills/$name',
      parser: (data) => SkillResponse.fromJson(data),
    );
  }

  /// 切换Skill启用状态
  Future<List<SkillResponse>> toggleSkill(String name, bool enabled) async {
    final data = await _request<List<dynamic>>(
      'PUT',
      '/api/skills/$name',
      body: {'enabled': enabled},
    );
    return data.map((s) => SkillResponse.fromJson(s)).toList();
  }

  /// 添加自定义Skill
  Future<List<SkillResponse>> addCustomSkill(
    String name,
    String description,
  ) async {
    final data = await _request<List<dynamic>>(
      'POST',
      '/api/skills',
      body: {'name': name, 'description': description},
    );
    return data.map((s) => SkillResponse.fromJson(s)).toList();
  }

  /// 删除自定义Skill
  Future<List<SkillResponse>> deleteCustomSkill(String name) async {
    final data = await _request<List<dynamic>>('DELETE', '/api/skills/$name');
    return data.map((s) => SkillResponse.fromJson(s)).toList();
  }

  // ============ Agent APIs ============

  /// 获取所有Agent
  Future<List<AgentResponse>> getAgents() async {
    final data = await _request<List<dynamic>>('GET', '/api/agents');
    return data.map((a) => AgentResponse.fromJson(a)).toList();
  }

  /// 创建Agent
  Future<AgentResponse> createAgent(CreateAgentRequest request) async {
    return await _request<AgentResponse>(
      'POST',
      '/api/agents',
      body: request.toJson(),
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  /// 获取单个Agent
  Future<AgentResponse> getAgent(String agentId) async {
    return await _request<AgentResponse>(
      'GET',
      '/api/agents/$agentId',
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  /// 删除Agent
  Future<void> deleteAgent(String agentId) async {
    await _request('DELETE', '/api/agents/$agentId');
  }

  /// 更新Agent模型
  Future<AgentResponse> updateAgentModel(String agentId, String model) async {
    return await _request<AgentResponse>(
      'PUT',
      '/api/agents/$agentId/model',
      body: {'model': model},
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  /// Agent添加Skill
  Future<AgentResponse> addAgentSkill(String agentId, String skill) async {
    return await _request<AgentResponse>(
      'POST',
      '/api/agents/$agentId/skills',
      body: {'skill': skill},
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  /// Agent移除Skill
  Future<AgentResponse> removeAgentSkill(String agentId, String skill) async {
    return await _request<AgentResponse>(
      'DELETE',
      '/api/agents/$agentId/skills',
      body: {'skill': skill},
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  /// Agent添加MCP Server
  Future<AgentResponse> addAgentMcp(String agentId, String server) async {
    return await _request<AgentResponse>(
      'POST',
      '/api/agents/$agentId/mcps',
      body: {'server': server},
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  /// Agent移除MCP Server
  Future<AgentResponse> removeAgentMcp(String agentId, String server) async {
    return await _request<AgentResponse>(
      'DELETE',
      '/api/agents/$agentId/mcps',
      body: {'server': server},
      parser: (data) => AgentResponse.fromJson(data),
    );
  }

  // ============ Task APIs ============

  /// 获取任务列表
  Future<List<TaskResponse>> getTasks() async {
    final data = await _request<List<dynamic>>('GET', '/hippocampus/api/tasks');
    return data.map((t) => TaskResponse.fromJson(t)).toList();
  }

  /// 创建任务
  Future<TaskResponse> createTask(CreateTaskRequest request) async {
    return await _request<TaskResponse>(
      'POST',
      '/hippocampus/api/tasks',
      body: request.toJson(),
      parser: (data) => TaskResponse.fromJson(data),
    );
  }

  /// 查询单个任务
  Future<TaskResponse> getTask(
    String taskId, {
    String tenantId = defaultTaskTenantId,
  }) async {
    return await _request<TaskResponse>(
      'GET',
      '/hippocampus/api/tasks/$tenantId/$taskId',
      parser: (data) => TaskResponse.fromJson(data),
    );
  }

  /// 更新任务。
  ///
  /// hippocampus 的 upsert 只接受 `TaskRecord` 的字段；title /
  /// description / priority 会被服务端丢弃 —— 与桌面端
  /// `prefrontalClient.updateTask` 的行为一致（同样是仅前端字段）。
  Future<TaskResponse> updateTask(
    String taskId, {
    String tenantId = defaultTaskTenantId,
    String? title,
    String? description,
    String? priority,
    String? status,
    List<String>? tags,
  }) async {
    final current = await getTask(taskId, tenantId: tenantId);
    final body = <String, dynamic>{
      'taskId': current.id,
      'tenantId': tenantId,
      'source': current.source ?? 'local',
      'targetAgent': current.targetAgent ?? '',
      'status': status ?? current.status,
      'receivedAt': current.createdAt.toIso8601String(),
      'completedAt': current.completedAt?.toIso8601String(),
      'tags': tags ?? current.tags,
      'steps': current.steps.map((s) => s.toJson()).toList(),
      // 仅前端字段：hippocampus 的 UpsertTaskRequest 没有这些列，
      // serde 默认忽略未知字段，所以这里带上也不会报错 —— 但也不会被持久化。
      if (title != null) 'title': title,
      if (description != null) 'description': description,
      if (priority != null) 'priority': priority,
    };
    return await _request<TaskResponse>(
      'POST',
      '/hippocampus/api/tasks',
      body: body,
      parser: (data) => TaskResponse.fromJson(data),
    );
  }

  /// 删除任务
  Future<void> deleteTask(
    String taskId, {
    String tenantId = defaultTaskTenantId,
  }) async {
    await _request<void>('DELETE', '/hippocampus/api/tasks/$tenantId/$taskId');
  }

  // ============ Memory APIs ============

  /// 搜索记忆
  Future<List<MemoryResponse>> searchMemory(String query) async {
    final data = await _request<List<dynamic>>(
      'GET',
      '/hippocampus/api/memory/search?q=${Uri.encodeComponent(query)}',
    );
    return data.map((m) => MemoryResponse.fromJson(m)).toList();
  }

  /// 添加记忆
  Future<void> addMemory(AddMemoryRequest request) async {
    await _request('POST', '/hippocampus/api/memory', body: request.toJson());
  }

  // ============ Conversation APIs ============

  /// 获取会话列表
  Future<List<ConversationResponse>> getConversations() async {
    final data = await _request<List<dynamic>>('GET', '/api/conversations');
    return data.map((c) => ConversationResponse.fromJson(c)).toList();
  }

  /// 获取会话消息
  Future<List<MessageResponse>> getConversationMessages(
    String sessionId,
  ) async {
    final data = await _request<List<dynamic>>(
      'GET',
      '/api/conversations/$sessionId/messages',
    );
    return data.map((m) => MessageResponse.fromJson(m)).toList();
  }

  /// 删除会话
  Future<void> deleteSession(String sessionId) async {
    await _request('DELETE', '/hippocampus/api/sessions/$sessionId');
  }

  // ============ Soul APIs ============

  /// 获取Soul
  Future<SoulResponse?> getSoul(String agentId) async {
    try {
      final data = await _request<Map<String, dynamic>>(
        'GET',
        '/api/soul/$agentId',
      );
      if (data['success'] == true && data['data'] != null) {
        return SoulResponse.fromJson(data['data']);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// 更新Soul
  Future<SoulResponse?> updateSoul({
    required String agentId,
    required String soul,
    required String source,
    String? reason,
    String? conversationSummary,
    String? triggerType,
  }) async {
    final body = {
      'soul': soul,
      'source': source,
      'reason': ?reason,
      'conversation_summary': ?conversationSummary,
      'trigger_type': ?triggerType,
    };

    final data = await _request<Map<String, dynamic>>(
      'PUT',
      '/api/soul/$agentId',
      body: body,
    );
    if (data['success'] == true && data['data'] != null) {
      return SoulResponse.fromJson(data['data']);
    }
    return null;
  }

  /// 获取Soul历史版本
  Future<List<SoulVersionResponse>> getSoulHistory(String agentId) async {
    try {
      final data = await _request<List<dynamic>>(
        'GET',
        '/api/soul/$agentId/history',
      );
      return data.map((v) => SoulVersionResponse.fromJson(v)).toList();
    } catch (e) {
      return [];
    }
  }

  /// 获取Soul指定版本
  Future<SoulVersionResponse?> getSoulVersion(
    String agentId,
    String versionId,
  ) async {
    try {
      final data = await _request<Map<String, dynamic>>(
        'GET',
        '/api/soul/$agentId/version/$versionId',
      );
      if (data['success'] == true && data['data'] != null) {
        return SoulVersionResponse.fromJson(data['data']);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ============ MCP APIs ============

  /// 获取MCP服务器列表
  Future<List<MCPServerResponse>> getMCPServers() async {
    final data = await _request<List<dynamic>>('GET', '/api/mcp/servers');
    return data.map((s) => MCPServerResponse.fromJson(s)).toList();
  }

  /// 添加MCP服务器
  Future<MCPServerResponse> addMCPServer(AddMCPServerRequest request) async {
    return await _request<MCPServerResponse>(
      'POST',
      '/api/mcp/servers',
      body: request.toJson(),
      parser: (data) => MCPServerResponse.fromJson(data),
    );
  }

  /// 删除MCP服务器
  Future<void> deleteMCPServer(String name) async {
    await _request('DELETE', '/api/mcp/servers/$name');
  }

  /// 切换MCP服务器启用状态
  Future<List<MCPServerResponse>> toggleMCPServer(
    String name,
    bool enabled,
  ) async {
    final data = await _request<List<dynamic>>(
      'PUT',
      '/api/mcp/servers/$name',
      body: {'enabled': enabled},
    );
    return data.map((s) => MCPServerResponse.fromJson(s)).toList();
  }

  // ============ Session APIs ============

  Future<SessionResponse> createSession({String? name}) async {
    final data = await _request<Map<String, dynamic>>(
      'POST',
      '/hippocampus/api/sessions',
      body: {'name': name},
      parser: (data) => data,
    );
    return SessionResponse.fromJson(data);
  }

  Future<List<String>> listSessions() async {
    final data = await _request<List<dynamic>>(
      'GET',
      '/hippocampus/api/sessions',
    );
    return data.map((s) => s.toString()).toList();
  }

  Future<SessionResponse?> getSession(String sessionId) async {
    try {
      final data = await _request<Map<String, dynamic>>(
        'GET',
        '/hippocampus/api/sessions/$sessionId',
      );
      if (data['success'] == true && data['data'] != null) {
        return SessionResponse.fromJson(data['data']);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  Future<bool> addSessionMessage({
    required String sessionId,
    required String role,
    required String content,
  }) async {
    await _request(
      'POST',
      '/hippocampus/api/sessions/$sessionId/messages',
      body: {'role': role, 'content': content},
    );
    return true;
  }

  Future<ProcessResponse> processMessage({
    required String sessionId,
    required String message,
    bool useTools = false,
  }) async {
    final data = await _request<Map<String, dynamic>>(
      'POST',
      '/hippocampus/api/sessions/$sessionId/process',
      body: {'message': message, 'use_tools': useTools},
    );
    if (data['success'] == true && data['data'] != null) {
      return ProcessResponse.fromJson(data['data']);
    }
    throw PrefrontalApiException(data['error']?.toString() ?? 'Unknown error');
  }

  Stream<String> processMessageStream({
    required String sessionId,
    required String message,
    bool useTools = false,
  }) async* {
    final uri = Uri.parse('$baseUrl/api/sessions/$sessionId/stream');
    final requestHeaders = {'Content-Type': 'application/json'};

    final client = http.Client();
    try {
      final request = http.Request('POST', uri);
      request.headers.addAll(requestHeaders);
      request.body = json.encode({'message': message, 'use_tools': useTools});

      final response = await client.send(request);

      if (response.statusCode != 200) {
        throw PrefrontalApiException('Stream error: ${response.statusCode}');
      }

      String buffer = '';
      await for (final bytes in response.stream) {
        buffer += utf8.decode(bytes);
        final lines = buffer.split('\n');
        buffer = lines.removeLast();
        for (final line in lines) {
          if (line.startsWith('data: ')) {
            final data = line.substring(6);
            if (data.isNotEmpty) {
              yield data;
            }
          }
        }
      }
    } finally {
      client.close();
    }
  }

  Future<String> chatCompletions({
    String? model,
    required List<Map<String, dynamic>> messages,
    bool stream = false,
    bool useTools = false,
  }) async {
    final uri = Uri.parse('$baseUrl/api/chat/completions');
    final requestHeaders = {'Content-Type': 'application/json'};

    final body = <String, dynamic>{
      'model': ?model,
      'messages': messages,
      'stream': stream,
      'use_tools': useTools,
    };

    final response = await _client.post(
      uri,
      headers: requestHeaders,
      body: json.encode(body),
    );

    if (response.statusCode != 200) {
      throw PrefrontalApiException(
        'Chat completions error: ${response.statusCode}',
      );
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final choices = data['choices'] as List<dynamic>?;
    if (choices == null || choices.isEmpty) {
      throw PrefrontalApiException('No response choices');
    }

    final firstChoice = choices.first as Map<String, dynamic>;
    final message = firstChoice['message'] as Map<String, dynamic>?;
    if (message == null) {
      throw PrefrontalApiException('No message in response');
    }

    return message['content'] as String? ?? '';
  }

  Stream<String> chatCompletionsStream({
    String? model,
    required List<Map<String, dynamic>> messages,
    bool useTools = false,
  }) async* {
    final uri = Uri.parse('$baseUrl/api/chat/completions');
    final requestHeaders = {'Content-Type': 'application/json'};

    final client = http.Client();
    try {
      final body = <String, dynamic>{
        'model': ?model,
        'messages': messages,
        'stream': true,
        'use_tools': useTools,
      };

      final request = http.Request('POST', uri);
      request.headers.addAll(requestHeaders);
      request.body = json.encode(body);

      final response = await client.send(request);

      if (response.statusCode != 200) {
        throw PrefrontalApiException(
          'Chat completions stream error: ${response.statusCode}',
        );
      }

      String buffer = '';
      await for (final bytes in response.stream) {
        buffer += utf8.decode(bytes);
        final lines = buffer.split('\n');
        buffer = lines.removeLast();
        for (final line in lines) {
          if (line.startsWith('data: ')) {
            final data = line.substring(6);
            if (data.isNotEmpty && data != '[DONE]') {
              yield data;
            }
          }
        }
      }
    } finally {
      client.close();
    }
  }

  void dispose() {
    _client.close();
  }

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final requestHeaders = {'Content-Type': 'application/json'};

    http.Response response;

    switch (method.toUpperCase()) {
      case 'GET':
        response = await _client.get(uri, headers: requestHeaders);
        break;
      case 'POST':
        response = await _client.post(
          uri,
          headers: requestHeaders,
          body: body != null ? json.encode(body) : null,
        );
        break;
      case 'PUT':
        response = await _client.put(
          uri,
          headers: requestHeaders,
          body: body != null ? json.encode(body) : null,
        );
        break;
      case 'DELETE':
        response = await _client.delete(uri, headers: requestHeaders);
        break;
      default:
        throw PrefrontalApiException('Unsupported method: $method');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isNotEmpty) {
        return json.decode(response.body);
      }
      return {};
    } else {
      throw PrefrontalApiException(
        'API Error: ${response.statusCode} - ${response.body}',
      );
    }
  }

  Future<List<dynamic>> requestList(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final requestHeaders = {'Content-Type': 'application/json'};

    http.Response response;

    switch (method.toUpperCase()) {
      case 'GET':
        response = await _client.get(uri, headers: requestHeaders);
        break;
      case 'POST':
        response = await _client.post(
          uri,
          headers: requestHeaders,
          body: body != null ? json.encode(body) : null,
        );
        break;
      case 'PUT':
        response = await _client.put(
          uri,
          headers: requestHeaders,
          body: body != null ? json.encode(body) : null,
        );
        break;
      case 'DELETE':
        response = await _client.delete(uri, headers: requestHeaders);
        break;
      default:
        throw PrefrontalApiException('Unsupported method: $method');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isNotEmpty) {
        final decoded = json.decode(response.body);
        if (decoded is List) return decoded;
        if (decoded is Map && decoded['data'] is List) return decoded['data'];
      }
      return [];
    } else {
      throw PrefrontalApiException(
        'API Error: ${response.statusCode} - ${response.body}',
      );
    }
  }
}

// ============ Request/Response Models ============

class AddProviderRequest {
  final String type;
  final String apiKey;
  final String? baseUrl;
  final String? model;

  AddProviderRequest({
    required this.type,
    required this.apiKey,
    this.baseUrl,
    this.model,
  });

  Map<String, dynamic> toJson() => {
    'type': type,
    'api_key': apiKey,
    if (baseUrl != null) 'base_url': baseUrl,
    if (model != null) 'model': model,
  };
}

class UpdateProviderRequest {
  final String? apiKey;
  final String? baseUrl;
  final String? model;
  final bool? enabled;

  UpdateProviderRequest({this.apiKey, this.baseUrl, this.model, this.enabled});

  Map<String, dynamic> toJson() => {
    if (apiKey != null) 'api_key': apiKey,
    if (baseUrl != null) 'base_url': baseUrl,
    if (model != null) 'model': model,
    if (enabled != null) 'enabled': enabled,
  };
}

class ProviderResponse {
  final String name;
  final String type;
  final String model;
  final String? baseUrl;
  final bool enabled;
  final DateTime? createdAt;

  ProviderResponse({
    required this.name,
    required this.type,
    required this.model,
    this.baseUrl,
    required this.enabled,
    this.createdAt,
  });

  factory ProviderResponse.fromJson(Map<String, dynamic> json) {
    return ProviderResponse(
      name: json['name'] ?? '',
      type: json['type'] ?? '',
      model: json['model'] ?? '',
      baseUrl: json['base_url'],
      enabled: json['enabled'] ?? true,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : null,
    );
  }
}

class SkillResponse {
  final String name;
  final String description;
  final Map<String, dynamic> inputSchema;
  final bool enabled;

  SkillResponse({
    required this.name,
    required this.description,
    required this.inputSchema,
    required this.enabled,
  });

  factory SkillResponse.fromJson(Map<String, dynamic> json) {
    return SkillResponse(
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      inputSchema: json['input_schema'] ?? {},
      enabled: json['enabled'] ?? true,
    );
  }
}

class AgentResponse {
  final String id;
  final String name;
  final String? description;
  final String model;
  final List<String> skills;
  final List<String> mcpServers;
  final DateTime createdAt;
  final bool isOnline;
  final bool isDefault;

  AgentResponse({
    required this.id,
    required this.name,
    this.description,
    required this.model,
    required this.skills,
    required this.mcpServers,
    required this.createdAt,
    required this.isOnline,
    required this.isDefault,
  });

  factory AgentResponse.fromJson(Map<String, dynamic> json) {
    return AgentResponse(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      model: json['model'] ?? '',
      skills:
          (json['skills'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      mcpServers:
          (json['mcp_servers'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
      isOnline: json['is_online'] ?? false,
      isDefault: json['is_default'] ?? false,
    );
  }
}

class CreateAgentRequest {
  final String name;
  final String? description;
  final String model;
  final List<String>? skills;

  CreateAgentRequest({
    required this.name,
    this.description,
    required this.model,
    this.skills,
  });

  Map<String, dynamic> toJson() => {
    'name': name,
    if (description != null) 'description': description,
    'model': model,
    if (skills != null) 'skills': skills,
  };
}

/// Sub-task (step) of a hippocampus task record.
///
/// The backend serialises `TaskStep` in camelCase (`stepId`, `dependsOn`,
/// `startedAt`, ...), matching the desktop `TaskStep` contract in
/// `shadow-desktop/src/lib/prefrontalClient.ts`.
class TaskStepResponse {
  final String stepId;
  final int order;
  final List<String> dependsOn;
  final String status;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? error;
  /// Raw `StepTarget` payload. Kept verbatim so an update round-trip can
  /// hand the server back exactly what it sent — `TaskStep.target` is a
  /// required field on the Rust side.
  final Map<String, dynamic>? target;

  TaskStepResponse({
    required this.stepId,
    this.order = 0,
    this.dependsOn = const [],
    this.status = 'pending',
    this.startedAt,
    this.completedAt,
    this.error,
    this.target,
  });

  factory TaskStepResponse.fromJson(Map<String, dynamic> json) {
    DateTime? parse(String? key) {
      final raw = json[key];
      if (raw == null) return null;
      return DateTime.tryParse(raw.toString());
    }

    final rawTarget = json['target'];
    return TaskStepResponse(
      stepId: (json['stepId'] ?? json['step_id'] ?? '').toString(),
      order: (json['order'] as num?)?.toInt() ?? 0,
      dependsOn: (json['dependsOn'] ?? json['depends_on']) is List
          ? ((json['dependsOn'] ?? json['depends_on']) as List)
              .map((e) => e.toString())
              .toList()
          : const <String>[],
      status: (json['status'] ?? 'pending').toString(),
      startedAt: parse('startedAt') ?? parse('started_at'),
      completedAt: parse('completedAt') ?? parse('completed_at'),
      error: json['error'] as String?,
      target: rawTarget is Map<String, dynamic>
          ? Map<String, dynamic>.from(rawTarget)
          : null,
    );
  }

  /// Wire representation — mirrors the Rust `TaskStep` serde
  /// (`rename_all = "camelCase"`).
  Map<String, dynamic> toJson() => {
        'stepId': stepId,
        'order': order,
        'dependsOn': dependsOn,
        'status': status,
        'startedAt': startedAt?.toIso8601String(),
        'completedAt': completedAt?.toIso8601String(),
        'error': error,
        if (target != null) 'target': target,
      };
}

/// 任务的展示标题。
///
/// `TaskRecord` 没有 title 列，所以正常情况下标题写在 `payload.title`
/// （客户端创建任务时放进去的那份）。旧数据可能直接带 `title` 字段，
/// 两种都读。
String taskTitleOf(Map<String, dynamic> json) {
  final direct = json['title'];
  if (direct != null && direct.toString().trim().isNotEmpty) {
    return direct.toString();
  }
  final payload = json['payload'];
  if (payload is Map) {
    final nested = payload['title'];
    if (nested != null && nested.toString().trim().isNotEmpty) {
      return nested.toString();
    }
  }
  return '';
}

/// A task record as returned by the hippocampus task API.
///
/// Field names follow `hippocampus-core/src/task.rs::TaskRecord`, which
/// carries `#[serde(rename_all = "camelCase")]` — so the wire format is
/// `taskId` / `receivedAt` / `targetAgent`. The snake_case spelling is
/// accepted as a fallback so the client keeps working if that attribute
/// is ever dropped.
///
/// `title` / `description` / `priority` are presentation-only — the
/// hippocampus `TaskRecord` has no such columns, so an upsert drops them
/// and the list API never returns them. Same caveat as the desktop client.
class TaskResponse {
  final String id;
  final String title;
  final String status;
  final String? priority;
  final String? description;
  final String? source;
  final String? targetAgent;
  final List<String> tags;
  final List<TaskStepResponse> steps;
  final DateTime createdAt;
  final DateTime? completedAt;

  TaskResponse({
    required this.id,
    required this.title,
    required this.status,
    this.priority,
    this.description,
    this.source,
    this.targetAgent,
    this.tags = const [],
    this.steps = const [],
    required this.createdAt,
    this.completedAt,
  });

  factory TaskResponse.fromJson(Map<String, dynamic> json) {
    final rawSteps = json['steps'];
    DateTime? parseDate(String camel, String snake) {
      final raw = json[camel] ?? json[snake];
      if (raw == null) return null;
      return DateTime.tryParse(raw.toString());
    }

    return TaskResponse(
      id: (json['taskId'] ?? json['task_id'] ?? json['id'] ?? '').toString(),
      title: taskTitleOf(json),
      status: (json['status'] ?? 'pending').toString(),
      priority: json['priority'] as String?,
      description: json['description'] as String?,
      source: json['source'] as String?,
      targetAgent:
          (json['targetAgent'] ?? json['target_agent'])?.toString(),
      tags: json['tags'] is List
          ? (json['tags'] as List).map((e) => e.toString()).toList()
          : const <String>[],
      steps: rawSteps is List
          ? rawSteps
              .whereType<Map<String, dynamic>>()
              .map(TaskStepResponse.fromJson)
              .toList()
          : const <TaskStepResponse>[],
      createdAt: parseDate('receivedAt', 'received_at') ??
          parseDate('createdAt', 'created_at') ??
          DateTime.now(),
      completedAt: parseDate('completedAt', 'completed_at'),
    );
  }
}

/// 创建 hippocampus 任务。
///
/// `UpsertTaskRequest`（hippocampus-server/src/handlers.rs）的
/// `taskId` / `targetAgent` 是必填字段，缺任意一个后端都会返回 400。
/// `title` / `priority` 在 `TaskRecord` 里没有对应列，upsert 会丢弃它们
/// —— 因此改放进 `payload`：`payload` 是后端真实持久化的 JSON 列，
/// 列表接口再从 `payload.title` 把标题读回来。
class CreateTaskRequest {
  final String title;
  final String? priority;
  final String? taskId;
  final String? targetAgent;
  final String? status;
  final Map<String, dynamic>? payload;

  CreateTaskRequest({
    required this.title,
    this.priority,
    this.taskId,
    this.targetAgent,
    this.status,
    this.payload,
  });

  Map<String, dynamic> toJson() => {
    if (taskId != null) 'taskId': taskId,
    if (targetAgent != null) 'targetAgent': targetAgent,
    if (status != null) 'status': status,
    'source': 'local',
    if (payload != null) 'payload': payload,
    // 仅前端字段：后端没有这些列，serde 默认忽略未知字段。
    'title': title,
    if (priority != null) 'priority': priority,
  };
}

class MemoryResponse {
  final String id;
  final String content;
  final DateTime createdAt;
  final double? score;

  MemoryResponse({
    required this.id,
    required this.content,
    required this.createdAt,
    this.score,
  });

  factory MemoryResponse.fromJson(Map<String, dynamic> json) {
    return MemoryResponse(
      id: json['id'] ?? '',
      content: json['content'] ?? '',
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
      score: json['score']?.toDouble(),
    );
  }
}

class AddMemoryRequest {
  final String content;
  final Map<String, String>? metadata;

  AddMemoryRequest({required this.content, this.metadata});

  Map<String, dynamic> toJson() => {
    'content': content,
    if (metadata != null) 'metadata': metadata,
  };
}

class ConversationResponse {
  final String id;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int messageCount;

  ConversationResponse({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    required this.messageCount,
  });

  factory ConversationResponse.fromJson(Map<String, dynamic> json) {
    return ConversationResponse(
      id: json['id'] ?? '',
      title: json['title'] ?? currentL10n().conversationNewSession,
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
      updatedAt: DateTime.parse(
        json['updated_at'] ?? DateTime.now().toIso8601String(),
      ),
      messageCount: json['message_count'] ?? 0,
    );
  }
}

class MessageResponse {
  final String id;
  final String role;
  final String content;
  final DateTime createdAt;

  MessageResponse({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  factory MessageResponse.fromJson(Map<String, dynamic> json) {
    return MessageResponse(
      id: json['id'] ?? '',
      role: json['role'] ?? 'user',
      content: json['content'] ?? '',
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
    );
  }
}

class MCPServerResponse {
  final String name;
  final String command;
  final List<String> args;
  final Map<String, String> env;
  final bool enabled;

  MCPServerResponse({
    required this.name,
    required this.command,
    required this.args,
    required this.env,
    required this.enabled,
  });

  factory MCPServerResponse.fromJson(Map<String, dynamic> json) {
    return MCPServerResponse(
      name: json['name'] ?? '',
      command: json['command'] ?? '',
      args: List<String>.from(json['args'] ?? []),
      env: Map<String, String>.from(json['env'] ?? {}),
      enabled: json['enabled'] ?? true,
    );
  }
}

class AddMCPServerRequest {
  final String name;
  final String command;
  final List<String> args;
  final Map<String, String> env;

  AddMCPServerRequest({
    required this.name,
    required this.command,
    required this.args,
    required this.env,
  });

  Map<String, dynamic> toJson() => {
    'name': name,
    'command': command,
    'args': args,
    'env': env,
  };
}

class SoulResponse {
  final String agentId;
  final String soul;
  final DateTime updatedAt;

  SoulResponse({
    required this.agentId,
    required this.soul,
    required this.updatedAt,
  });

  factory SoulResponse.fromJson(Map<String, dynamic> json) {
    return SoulResponse(
      agentId: json['agentId'] as String,
      soul: json['soul'] as String,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

class SoulVersionResponse {
  final String id;
  final String agentId;
  final String content;
  final String source;
  final String? reason;
  final String? conversationSummary;
  final String triggerType;
  final int version;
  final DateTime createdAt;

  SoulVersionResponse({
    required this.id,
    required this.agentId,
    required this.content,
    required this.source,
    this.reason,
    this.conversationSummary,
    required this.triggerType,
    required this.version,
    required this.createdAt,
  });

  factory SoulVersionResponse.fromJson(Map<String, dynamic> json) {
    return SoulVersionResponse(
      id: json['id'] as String,
      agentId: json['agentId'] as String,
      content: json['content'] as String,
      source: json['source'] as String,
      reason: json['reason'] as String?,
      conversationSummary: json['conversationSummary'] as String?,
      triggerType: json['triggerType'] as String,
      version: json['version'] as int,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class PrefrontalApiException implements Exception {
  final String message;
  PrefrontalApiException(this.message);

  @override
  String toString() => 'PrefrontalApiException: $message';
}

class SessionResponse {
  final String id;
  final String? name;
  final DateTime createdAt;

  SessionResponse({required this.id, this.name, required this.createdAt});

  factory SessionResponse.fromJson(Map<String, dynamic> json) {
    return SessionResponse(
      id: json['id'] ?? '',
      name: json['name'],
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
    );
  }
}

class ProcessResponse {
  final String response;
  final List<String>? toolCalls;

  ProcessResponse({required this.response, this.toolCalls});

  factory ProcessResponse.fromJson(Map<String, dynamic> json) {
    return ProcessResponse(
      response: json['response'] ?? '',
      toolCalls: json['tool_calls'] != null
          ? List<String>.from(json['tool_calls'])
          : null,
    );
  }
}

// ============ Hub State (for Management Hub) ============

/// Hub state holding counts for all management categories
class HubState {
  final int providerCount;
  final int skillCount;
  final int agentCount;
  final int mcpServerCount;
  final int memoryCount;
  final int flowCount;
  final bool isLoading;
  final String? error;

  const HubState({
    this.providerCount = 0,
    this.skillCount = 0,
    this.agentCount = 0,
    this.mcpServerCount = 0,
    this.memoryCount = 0,
    this.flowCount = 0,
    this.isLoading = false,
    this.error,
  });

  HubState copyWith({
    int? providerCount,
    int? skillCount,
    int? agentCount,
    int? mcpServerCount,
    int? memoryCount,
    int? flowCount,
    bool? isLoading,
    String? error,
  }) {
    return HubState(
      providerCount: providerCount ?? this.providerCount,
      skillCount: skillCount ?? this.skillCount,
      agentCount: agentCount ?? this.agentCount,
      mcpServerCount: mcpServerCount ?? this.mcpServerCount,
      memoryCount: memoryCount ?? this.memoryCount,
      flowCount: flowCount ?? this.flowCount,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

/// Hub notifier that fetches counts from Prefrontal API
class HubNotifier extends StateNotifier<HubState> {
  final PrefrontalClient _client;

  /// 流程走端脑（telencephalon）—— 它是端脑面才有的能力。
  final TelencephalonClient _telencephalonClient;

  HubNotifier(this._client, {TelencephalonClient? telencephalonClient})
    : _telencephalonClient = telencephalonClient ?? TelencephalonClient(),
      super(const HubState()) {
    loadAllCounts();
  }

  Future<void> loadAllCounts() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // Fetch all counts in parallel
      final results = await Future.wait([
        _client.getProviders(),
        _client.getSkills(),
        _client.getAgents(),
        _client.getMCPServers(),
        _client.searchMemory(''),
      ]);

      final providers = results[0];
      final skills = results[1];
      final agents = results[2];
      final mcpServers = results[3];
      final memories = results[4];

      // 流程计数单独取 —— 端脑不可用时不影响其它计数
      var flowCount = 0;
      try {
        flowCount = (await _telencephalonClient.listFlows()).length;
      } catch (_) {
        flowCount = 0;
      }

      state = state.copyWith(
        providerCount: providers.length,
        skillCount: skills.length,
        agentCount: agents.length,
        mcpServerCount: mcpServers.length,
        memoryCount: memories.length,
        flowCount: flowCount,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

// ============ Provider ============

final prefrontalClientProvider = Provider<PrefrontalClient>((ref) {
  return PrefrontalClient();
});

/// Provider for management hub state
final hubNotifierProvider = StateNotifierProvider<HubNotifier, HubState>((ref) {
  final client = ref.watch(prefrontalClientProvider);
  return HubNotifier(client);
});
