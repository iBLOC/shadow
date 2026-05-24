import 'dart:convert';

/// A2A消息类型
enum A2AMessageType {
  delegateRequest,
  delegateResponse,
  taskPush,
  taskResult,
  error,
}

/// A2A消息信封
class A2AMessage {
  final A2AMessageType type;
  final String id;
  final DateTime timestamp;
  final Map<String, dynamic> payload;

  A2AMessage({
    required this.type,
    required this.id,
    DateTime? timestamp,
    required this.payload,
  }) : timestamp = timestamp ?? DateTime.now();

  factory A2AMessage.fromJson(Map<String, dynamic> json) {
    return A2AMessage(
      type: A2AMessageType.values.firstWhere(
        (e) => e.name == json['type'],
        orElse: () => A2AMessageType.error,
      ),
      id: json['id'] as String,
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'] as String)
          : DateTime.now(),
      payload: json['payload'] as Map<String, dynamic>? ?? {},
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'type': type.name,
      'id': id,
      'timestamp': timestamp.toIso8601String(),
      'payload': payload,
    };
  }

  String toJsonString() => jsonEncode(toJson());

  static A2AMessage fromJsonString(String jsonString) {
    return A2AMessage.fromJson(jsonDecode(jsonString) as Map<String, dynamic>);
  }
}

/// 委托请求
class DelegateRequest {
  final String taskId;
  final String userRequest;
  final List<String> requiredCapabilities;
  final Map<String, dynamic>? context;

  DelegateRequest({
    required this.taskId,
    required this.userRequest,
    required this.requiredCapabilities,
    this.context,
  });

  factory DelegateRequest.fromPayload(Map<String, dynamic> payload) {
    return DelegateRequest(
      taskId: payload['task_id'] as String,
      userRequest: payload['user_request'] as String,
      requiredCapabilities:
          (payload['required_capabilities'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      context: payload['context'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toPayload() {
    return {
      'task_id': taskId,
      'user_request': userRequest,
      'required_capabilities': requiredCapabilities,
      if (context != null) 'context': context,
    };
  }
}

/// 委托响应
class DelegateResponse {
  final String taskId;
  final String status; // success, failed, partial
  final String? actionTaken;
  final Map<String, dynamic>? result;
  final String? error;

  DelegateResponse({
    required this.taskId,
    required this.status,
    this.actionTaken,
    this.result,
    this.error,
  });

  Map<String, dynamic> toPayload() {
    return {
      'task_id': taskId,
      'status': status,
      if (actionTaken != null) 'action_taken': actionTaken,
      if (result != null) 'result': result,
      if (error != null) 'error': error,
    };
  }
}

/// Agent Card - 用于服务注册
class AgentCard {
  final String name;
  final String description;
  final String protocolVersion;
  final String url;
  final List<AgentSkill> skills;
  final AgentCapabilities capabilities;

  const AgentCard({
    required this.name,
    required this.description,
    required this.protocolVersion,
    required this.url,
    required this.skills,
    required this.capabilities,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'description': description,
      'protocol_version': protocolVersion,
      'url': url,
      'skills': skills.map((s) => s.toJson()).toList(),
      'capabilities': capabilities.toJson(),
    };
  }
}

/// Agent技能描述
class AgentSkill {
  final String id;
  final String name;
  final String description;
  final List<String>? tags;

  const AgentSkill({
    required this.id,
    required this.name,
    required this.description,
    this.tags,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      if (tags != null) 'tags': tags,
    };
  }
}

/// Agent能力
class AgentCapabilities {
  final bool streaming;
  final bool pushNotifications;

  const AgentCapabilities({
    this.streaming = false,
    this.pushNotifications = false,
  });

  Map<String, dynamic> toJson() {
    return {'streaming': streaming, 'pushNotifications': pushNotifications};
  }
}
