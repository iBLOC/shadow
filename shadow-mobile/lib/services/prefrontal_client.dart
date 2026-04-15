import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

/// Prefrontal API Client
/// 负责与 Prefrontal (port 8082) 通信
class PrefrontalClient {
  final String baseUrl;
  final http.Client _client;

  PrefrontalClient({String? baseUrl, http.Client? client})
    : baseUrl = baseUrl ?? 'http://localhost:8082',
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

  // ============ Task APIs ============

  /// 获取任务列表
  Future<List<TaskResponse>> getTasks() async {
    final data = await _request<List<dynamic>>('GET', '/api/tasks');
    return data.map((t) => TaskResponse.fromJson(t)).toList();
  }

  /// 创建任务
  Future<TaskResponse> createTask(CreateTaskRequest request) async {
    return await _request<TaskResponse>(
      'POST',
      '/api/tasks',
      body: request.toJson(),
      parser: (data) => TaskResponse.fromJson(data),
    );
  }

  // ============ Memory APIs ============

  /// 搜索记忆
  Future<List<MemoryResponse>> searchMemory(String query) async {
    final data = await _request<List<dynamic>>(
      'GET',
      '/api/memory/search?q=${Uri.encodeComponent(query)}',
    );
    return data.map((m) => MemoryResponse.fromJson(m)).toList();
  }

  /// 添加记忆
  Future<void> addMemory(AddMemoryRequest request) async {
    await _request('POST', '/api/memory', body: request.toJson());
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
    await _request('DELETE', '/api/sessions/$sessionId');
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

  void dispose() {
    _client.close();
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
  final String? skills;
  final DateTime createdAt;

  AgentResponse({
    required this.id,
    required this.name,
    this.description,
    required this.model,
    this.skills,
    required this.createdAt,
  });

  factory AgentResponse.fromJson(Map<String, dynamic> json) {
    return AgentResponse(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      model: json['model'] ?? '',
      skills: json['skills'],
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
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

class TaskResponse {
  final String id;
  final String title;
  final String status;
  final String? priority;
  final DateTime createdAt;
  final DateTime? completedAt;

  TaskResponse({
    required this.id,
    required this.title,
    required this.status,
    this.priority,
    required this.createdAt,
    this.completedAt,
  });

  factory TaskResponse.fromJson(Map<String, dynamic> json) {
    return TaskResponse(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      status: json['status'] ?? 'pending',
      priority: json['priority'] as String?,
      createdAt: DateTime.parse(
        json['created_at'] ?? DateTime.now().toIso8601String(),
      ),
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'])
          : null,
    );
  }
}

class CreateTaskRequest {
  final String title;
  final String? priority;

  CreateTaskRequest({required this.title, this.priority});

  Map<String, dynamic> toJson() => {
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
      title: json['title'] ?? '新会话',
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

class PrefrontalApiException implements Exception {
  final String message;
  PrefrontalApiException(this.message);

  @override
  String toString() => 'PrefrontalApiException: $message';
}

// ============ Provider ============

final prefrontalClientProvider = Provider<PrefrontalClient>((ref) {
  return PrefrontalClient();
});
