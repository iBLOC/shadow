# Shadow 移动端 Agent 系统实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在Shadow移动端实现双Agent系统，主Agent负责协调调度，MobileActionAgent负责设备控制

**Architecture:**
- 主Agent使用Gemma4 E4B模型，通过liteRT/MNN引擎执行
- MobileActionAgent使用FunctionGemma 270m，负责设备控制
- Agent间通过A2A WebSocket通信
- Skill系统复用Gallery格式

**Tech Stack:** Flutter/Dart, Riverpod, GoRouter, WebSocket, DataStore

---

## Chunk 1: 模型配置层

### 文件结构
```
assets/config/
├── litert_models.json   # liteRT引擎模型配置
└── mnn_models.json     # MNN引擎模型配置

lib/models/
├── model_config.dart       # 模型配置数据类
├── model_engine.dart       # 引擎抽象接口
├── litert_engine.dart      # liteRT引擎实现
└── mnn_engine.dart        # MNN引擎实现
```

- [ ] **Step 1: 创建 litert_models.json**

```json
{
  "engine": "litert",
  "models": [
    {
      "id": "gemma4-e4b",
      "name": "Gemma4 E4B",
      "description": "Google最新一代旗舰模型",
      "path": "models/gemma4-e4b-lite-rt.mnn",
      "context_length": 8192,
      "quantization": "q4km",
      "supports": ["chat", "reasoning", "function_calling"]
    }
  ],
  "default_model": "gemma4-e4b"
}
```

- [ ] **Step 2: 创建 mnn_models.json**

```json
{
  "engine": "mnn",
  "models": [
    {
      "id": "qwen2.5-1.5b",
      "name": "Qwen2.5 1.5B",
      "description": "通义千问轻量版",
      "path": "models/qwen2.5-1.5b-mnn",
      "context_length": 4096,
      "quantization": "q4km",
      "supports": ["chat"]
    }
  ],
  "default_model": "qwen2.5-1.5b"
}
```

- [ ] **Step 3: 创建 lib/models/model_config.dart**

```dart
class ModelInfo {
  final String id;
  final String name;
  final String description;
  final String path;
  final int contextLength;
  final String quantization;
  final List<String> supports;

  const ModelInfo({
    required this.id,
    required this.name,
    required this.description,
    required this.path,
    required this.contextLength,
    required this.quantization,
    required this.supports,
  });

  factory ModelInfo.fromJson(Map<String, dynamic> json) {
    return ModelInfo(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      path: json['path'] as String,
      contextLength: json['context_length'] as int? ?? 4096,
      quantization: json['quantization'] as String? ?? 'q4km',
      supports: (json['supports'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
    );
  }
}

class EngineConfig {
  final String engine;
  final List<ModelInfo> models;
  final String defaultModel;

  const EngineConfig({
    required this.engine,
    required this.models,
    required this.defaultModel,
  });

  factory EngineConfig.fromJson(Map<String, dynamic> json) {
    return EngineConfig(
      engine: json['engine'] as String,
      models: (json['models'] as List<dynamic>)
          .map((e) => ModelInfo.fromJson(e as Map<String, dynamic>))
          .toList(),
      defaultModel: json['default_model'] as String,
    );
  }

  ModelInfo? get defaultModelInfo {
    try {
      return models.firstWhere((m) => m.id == defaultModel);
    } catch (_) {
      return models.isNotEmpty ? models.first : null;
    }
  }
}
```

- [ ] **Step 4: 创建 lib/models/model_engine.dart**

```dart
abstract class ModelEngine {
  String get name;
  Future<void> initialize(ModelInfo model);
  Future<String> generate(String prompt);
  Stream<String> generateStream(String prompt);
  Future<void> release();
  bool get isInitialized;
}
```

- [ ] **Step 5: 创建 lib/models/model_config_provider.dart**

```dart
final modelConfigProvider = FutureProvider.family<EngineConfig, String>((ref, engine) async {
  final jsonPath = engine == 'litert'
      ? 'assets/config/litert_models.json'
      : 'assets/config/mnn_models.json';

  final jsonString = await rootBundle.loadString(jsonPath);
  final json = jsonDecode(jsonString) as Map<String, dynamic>;
  return EngineConfig.fromJson(json);
});

final selectedEngineProvider = StateProvider<String>((ref) => 'litert');

final selectedModelProvider = Provider<ModelInfo?>((ref) {
  final engine = ref.watch(selectedEngineProvider);
  final configAsync = ref.watch(modelConfigProvider(engine));

  return configAsync.whenOrNull(
    data: (config) => config.defaultModelInfo,
  );
});
```

- [ ] **Step 6: 提交 Chunk 1**

---

## Chunk 2: 主Agent核心

### 文件结构
```
lib/agents/
├── main_agent/
│   ├── main_agent.dart           # 主Agent核心
│   ├── main_agent_prompt.dart   # 系统提示词
│   └── main_agent_tools.dart    # 工具定义
└── providers/
    └── agent_provider.dart       # Agent状态管理
```

- [ ] **Step 1: 创建 lib/agents/main_agent/main_agent_prompt.dart**

```dart
class MainAgentPrompt {
  static const String defaultSystemPrompt = '''
你是用户的AI影子，代表用户执行日常任务和操作。

## 核心角色

你是一个任务协调者，理解用户需求后：
1. 简单操作 → 委托给设备控制Agent
2. Skill/MCP → 直接调用
3. 复杂任务 → 创建任务交给任务系统

## 可用能力

### 1. Skill系统
Skill是模块化的能力扩展，通过自然语言触发。

可用Skill:
___SKILLS___

### 2. MCP工具
MCP (Model Context Protocol) 工具提供系统级能力。

可用MCP工具:
___TOOLS___

### 3. 设备控制 (MobileActionAgent)
用于快速设备操作，如：
- 开/关闪光灯
- 创建联系人
- 发送邮件
- 显示位置
- 创建日历事件
- 打开设置

### 4. 任务系统
对于复杂任务，创建任务交给任务系统执行。

## 执行策略 (混合模式)

对于每个用户请求，按顺序尝试：

1. **检查Skill**: 是否有匹配的Skill？
   - 是 → 调用 load_skill + run_js/run_intent

2. **检查MCP**: 是否有匹配的MCP工具？
   - 是 → 调用 run_mcp_tool

3. **检查设备控制**: 是否为设备操作？
   - 是 → 委托给 MobileActionAgent (A2A)

4. **执行失败或复杂任务**: 创建任务
   - 调用 create_task
   - 返回任务确认

## 决策规则

| 请求类型 | 动作 |
|----------|------|
| "开灯"、"关灯" | 委托MobileActionAgent |
| "发邮件给张三" | 委托MobileActionAgent |
| "创建明天下午3点会议" | 委托MobileActionAgent |
| 匹配某个Skill | 执行该Skill |
| 匹配MCP工具 | 调用MCP工具 |
| "帮我规划5日游" | 创建任务 |
| "研究竞品报告" | 创建任务 |

## 错误处理

- Skill/MCP执行失败 → 尝试委托MobileActionAgent
- 设备控制失败 → 建议创建任务
- 不确定 → 询问用户

## 输出格式

执行成功后，返回简洁的结果描述。
如果需要创建任务，返回:
- 任务标题
- 预计完成时间
- 下一步建议
''';

  static String buildSystemPrompt({
    String? customPrompt,
    List<String>? skills,
    List<String>? mcpTools,
  }) {
    var prompt = customPrompt ?? defaultSystemPrompt;

    if (skills != null && skills.isNotEmpty) {
      final skillsSection = skills.join('\n');
      prompt = prompt.replaceAll('___SKILLS___', skillsSection);
    } else {
      prompt = prompt.replaceAll('___SKILLS___', '（无可用Skill）');
    }

    if (mcpTools != null && mcpTools.isNotEmpty) {
      final toolsSection = mcpTools.join('\n');
      prompt = prompt.replaceAll('___TOOLS___', toolsSection);
    } else {
      prompt = prompt.replaceAll('___TOOLS___', '（无可用MCP工具）');
    }

    return prompt;
  }
}
```

- [ ] **Step 2: 创建 lib/agents/main_agent/main_agent_tools.dart**

```dart
import 'package:flutter/foundation.dart';

/// 主Agent可用工具定义
class MainAgentTool {
  final String name;
  final String description;
  final Map<String, ToolParam> parameters;

  const MainAgentTool({
    required this.name,
    required this.description,
    required this.parameters,
  });
}

class ToolParam {
  final String type;
  final String description;
  final bool required;

  const ToolParam({
    required this.type,
    required this.description,
    this.required = true,
  });
}

/// 工具注册表
class MainAgentToolsRegistry {
  static const loadSkill = MainAgentTool(
    name: 'load_skill',
    description: '加载Skill指令到上下文',
    parameters: {
      'skill_name': ToolParam(
        type: 'string',
        description: '要加载的Skill名称',
      ),
    },
  );

  static const runJs = MainAgentTool(
    name: 'run_js',
    description: '执行JS Skill',
    parameters: {
      'skill_name': ToolParam(type: 'string', description: 'Skill名称'),
      'script_name': ToolParam(type: 'string', description: '脚本名称'),
      'data': ToolParam(type: 'string', description: '传递给脚本的数据'),
    },
  );

  static const runMcpTool = MainAgentTool(
    name: 'run_mcp_tool',
    description: '调用MCP工具',
    parameters: {
      'tool_name': ToolParam(type: 'string', description: '工具名称'),
      'input': ToolParam(type: 'string', description: '工具输入参数(JSON)'),
    },
  );

  static const delegateToActionAgent = MainAgentTool(
    name: 'delegate_to_action_agent',
    description: '委托请求给MobileActionAgent执行设备控制',
    parameters: {
      'task': ToolParam(type: 'string', description: '用户请求任务描述'),
      'required_capabilities': ToolParam(
        type: 'array',
        description: '需要的设备能力',
        required: false,
      ),
    },
  );

  static const createTask = MainAgentTool(
    name: 'create_task',
    description: '创建复杂任务交给Prefrontal执行',
    parameters: {
      'title': ToolParam(type: 'string', description: '任务标题'),
      'description': ToolParam(
        type: 'string',
        description: '任务详细描述',
        required: false,
      ),
      'priority': ToolParam(
        type: 'string',
        description: '优先级: high, normal, low',
        required: false,
      ),
    },
  );

  static List<MainAgentTool> get allTools => [
        loadSkill,
        runJs,
        runMcpTool,
        delegateToActionAgent,
        createTask,
      ];

  static MainAgentTool? findTool(String name) {
    try {
      return allTools.firstWhere((t) => t.name == name);
    } catch (_) {
      return null;
    }
  }
}
```

- [ ] **Step 3: 创建 lib/agents/main_agent/main_agent.dart**

```dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../model_engine.dart';
import 'main_agent_prompt.dart';
import 'main_agent_tools.dart';

class MainAgentMessage {
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime timestamp;

  MainAgentMessage({
    required this.role,
    required this.content,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();
}

class MainAgentState {
  final List<MainAgentMessage> messages;
  final bool isLoading;
  final String? error;
  final ModelInfo? currentModel;

  const MainAgentState({
    this.messages = const [],
    this.isLoading = false,
    this.error,
    this.currentModel,
  });

  MainAgentState copyWith({
    List<MainAgentMessage>? messages,
    bool? isLoading,
    String? error,
    ModelInfo? currentModel,
  }) {
    return MainAgentState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      currentModel: currentModel ?? this.currentModel,
    );
  }
}

class MainAgent extends StateNotifier<MainAgentState> {
  final ModelEngine _engine;
  final String _systemPrompt;

  MainAgent({
    required ModelEngine engine,
    String? customSystemPrompt,
  })  : _engine = engine,
        _systemPrompt = customSystemPrompt ?? MainAgentPrompt.defaultSystemPrompt,
        super(const MainAgentState());

  /// 发送消息并获取响应
  Future<String> sendMessage(String userMessage) async {
    state = state.copyWith(isLoading: true, error: null);

    // 添加用户消息
    final messages = [
      ...state.messages,
      MainAgentMessage(role: 'user', content: userMessage),
    ];
    state = state.copyWith(messages: messages);

    try {
      // 构建完整prompt
      final fullPrompt = _buildPrompt(messages);

      // 调用模型
      final response = await _engine.generate(fullPrompt);

      // 添加助手消息
      state = state.copyWith(
        messages: [
          ...state.messages,
          MainAgentMessage(role: 'assistant', content: response),
        ],
        isLoading: false,
      );

      return response;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      rethrow;
    }
  }

  String _buildPrompt(List<MainAgentMessage> messages) {
    final buffer = StringBuffer();
    buffer.writeln(_systemPrompt);
    buffer.writeln('\n\n## 对话历史\n');

    for (final msg in messages) {
      buffer.writeln('${msg.role}: ${msg.content}');
    }

    buffer.write('\nassistant:');
    return buffer.toString();
  }

  /// 更新系统提示词
  void updateSystemPrompt(String newPrompt) {
    // 需要重新初始化agent
  }

  /// 切换模型
  Future<void> switchModel(ModelInfo model) async {
    await _engine.release();
    await _engine.initialize(model);
    state = state.copyWith(currentModel: model);
  }
}
```

- [ ] **Step 4: 创建 lib/agents/providers/agent_provider.dart**

```dart
final modelEngineProvider = Provider<ModelEngine>((ref) {
  // 根据选择的引擎返回对应实现
  final engineName = ref.watch(selectedEngineProvider);
  // TODO: 返回对应的引擎实例
  throw UnimplementedError('需要实现引擎初始化');
});

final mainAgentProvider = StateNotifierProvider<MainAgent, MainAgentState>((ref) {
  final engine = ref.watch(modelEngineProvider);
  return MainAgent(engine: engine);
});

final customPromptProvider = StateProvider<String?>((ref) => null);
```

- [ ] **Step 5: 提交 Chunk 2**

---

## Chunk 3: Skill系统基础

### 文件结构
```
lib/skills/
├── skill.dart              # Skill数据类
├── skill_loader.dart      # Skill加载器
├── skill_manager.dart      # Skill管理器
└── skill_executor.dart     # Skill执行器
```

- [ ] **Step 1: 创建 lib/skills/skill.dart**

```dart
class Skill {
  final String name;
  final String description;
  final String? homepage;
  final SkillType type;
  final String instructions;
  final bool requireSecret;
  final String? requireSecretDescription;

  const Skill({
    required this.name,
    required this.description,
    this.homepage,
    required this.type,
    required this.instructions,
    this.requireSecret = false,
    this.requireSecretDescription,
  });

  factory Skill.fromSkILLMd(String name, String content) {
    // 解析SKILL.md格式
    // 提取frontmatter和指令
    throw UnimplementedError('需要实现SKILL.md解析');
  }
}

enum SkillType {
  js,     // JS Skill, 通过Webview执行
  native, // Native Skill, 通过Intent执行
}
```

- [ ] **Step 2: 创建 lib/skills/skill_loader.dart**

```dart
import 'package:flutter/services.dart';
import 'dart:convert';
import 'skill.dart';

class SkillLoader {
  /// 从assets加载内置Skill
  Future<List<Skill>> loadBuiltInSkills() async {
    final skills = <Skill>[];

    try {
      final manifestContent = await rootBundle.loadString('AssetManifest.json');
      final manifest = jsonDecode(manifestContent) as Map<String, dynamic>;

      // 查找所有SKILL.md文件
      for (final path in manifest.keys) {
        if (path.startsWith('assets/skills/') && path.endsWith('SKILL.md')) {
          final content = await rootBundle.loadString(path);
          final skill = _parseSkillFile(path, content);
          if (skill != null) {
            skills.add(skill);
          }
        }
      }
    } catch (e) {
      debugPrint('Failed to load built-in skills: $e');
    }

    return skills;
  }

  Skill? _parseSkillFile(String path, String content) {
    // 解析SKILL.md格式
    // 1. 解析frontmatter (---name: xxx---)
    // 2. 提取instructions
    throw UnimplementedError('需要实现SKILL.md解析');
  }
}
```

- [ ] **Step 3: 创建 lib/skills/skill_manager.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'skill.dart';
import 'skill_loader.dart';

class SkillManagerState {
  final List<Skill> availableSkills;
  final List<String> selectedSkillNames;
  final bool isLoading;
  final String? error;

  const SkillManagerState({
    this.availableSkills = const [],
    this.selectedSkillNames = const [],
    this.isLoading = false,
    this.error,
  });

  List<Skill> get selectedSkills {
    return availableSkills
        .where((s) => selectedSkillNames.contains(s.name))
        .toList();
  }

  SkillManagerState copyWith({
    List<Skill>? availableSkills,
    List<String>? selectedSkillNames,
    bool? isLoading,
    String? error,
  }) {
    return SkillManagerState(
      availableSkills: availableSkills ?? this.availableSkills,
      selectedSkillNames: selectedSkillNames ?? this.selectedSkillNames,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class SkillManager extends StateNotifier<SkillManagerState> {
  final SkillLoader _loader;

  SkillManager({SkillLoader? loader})
      : _loader = loader ?? SkillLoader(),
        super(const SkillManagerState()) {
    _loadSkills();
  }

  Future<void> _loadSkills() async {
    state = state.copyWith(isLoading: true);

    try {
      final skills = await _loader.loadBuiltInSkills();
      state = state.copyWith(
        availableSkills: skills,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  void selectSkill(String name) {
    if (!state.selectedSkillNames.contains(name)) {
      state = state.copyWith(
        selectedSkillNames: [...state.selectedSkillNames, name],
      );
    }
  }

  void deselectSkill(String name) {
    state = state.copyWith(
      selectedSkillNames: state.selectedSkillNames.where((n) => n != name).toList(),
    );
  }

  Skill? getSkill(String name) {
    try {
      return state.availableSkills.firstWhere((s) => s.name == name);
    } catch (_) {
      return null;
    }
  }
}
```

- [ ] **Step 4: 创建 lib/skills/skill_executor.dart**

```dart
import 'package:flutter/foundation.dart';
import 'skill.dart';

class SkillResult {
  final bool success;
  final String? result;
  final String? error;

  SkillResult({
    required this.success,
    this.result,
    this.error,
  });
}

class SkillExecutor {
  /// 执行JS Skill
  Future<SkillResult> executeJsSkill({
    required String skillPath,
    required String data,
    String? secret,
  }) async {
    // 1. 构建Webview URL
    // 2. 注入secret（如需要）
    // 3. 执行JS并等待结果
    throw UnimplementedError('需要实现JS Skill执行');
  }

  /// 执行Native Skill
  Future<SkillResult> executeNativeSkill({
    required String intent,
    required Map<String, dynamic> parameters,
  }) async {
    // 调用Android Intent
    throw UnimplementedError('需要实现Native Skill执行');
  }

  /// 执行Skill
  Future<SkillResult> execute(Skill skill, Map<String, dynamic> params) async {
    switch (skill.type) {
      case SkillType.js:
        return executeJsSkill(
          skillPath: skill.instructions,
          data: params['data'] as String? ?? '{}',
          secret: params['secret'] as String?,
        );
      case SkillType.native:
        return executeNativeSkill(
          intent: skill.instructions,
          parameters: params,
        );
    }
  }
}
```

- [ ] **Step 5: 提交 Chunk 3**

---

## Chunk 4: A2A协议实现

### 文件结构
```
lib/agents/a2a/
├── a2a_protocol.dart      # 协议定义
├── a2a_message.dart       # 消息类
├── a2a_client.dart        # A2A客户端
└── a2a_server.dart        # A2A服务端
```

- [ ] **Step 1: 创建 lib/agents/a2a/a2a_message.dart**

```dart
enum A2AMessageType {
  delegateRequest,
  delegateResponse,
  taskPush,
  taskResult,
  error,
}

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
          ? DateTime.parse(json['timestamp'])
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
}

// 委托请求
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
      requiredCapabilities: (payload['required_capabilities'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
      context: payload['context'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toPayload() => {
        'task_id': taskId,
        'user_request': userRequest,
        'required_capabilities': requiredCapabilities,
        if (context != null) 'context': context,
      };
}

// 委托响应
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

  Map<String, dynamic> toPayload() => {
        'task_id': taskId,
        'status': status,
        if (actionTaken != null) 'action_taken': actionTaken,
        if (result != null) 'result': result,
        if (error != null) 'error': error,
      };
}
```

- [ ] **Step 2: 创建 lib/agents/a2a/a2a_client.dart**

```dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'a2a_message.dart';

typedef DelegateCallback = Future<DelegateResponse> Function(DelegateRequest request);

class A2AClient {
  final String serverUrl;
  final String agentId;
  WebSocketChannel? _channel;
  final _messageController = StreamController<A2AMessage>.broadcast();
  final _pendingRequests = <String, Completer<A2AMessage>>{};
  DelegateCallback? _requestHandler;
  bool _isConnected = false;

  A2AClient({
    required this.serverUrl,
    required this.agentId,
  });

  bool get isConnected => _isConnected;

  /// 设置请求处理器（当收到委托请求时调用）
  void setRequestHandler(DelegateCallback handler) {
    _requestHandler = handler;
  }

  /// 连接到A2A服务器
  Future<void> connect() async {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(serverUrl));
      _isConnected = true;

      _channel!.stream.listen(
        (data) => _handleMessage(data),
        onError: (error) => _handleError(error),
        onDone: () => _handleDisconnect(),
      );
    } catch (e) {
      _isConnected = false;
      rethrow;
    }
  }

  /// 断开连接
  Future<void> disconnect() async {
    await _channel?.sink.close();
    _channel = null;
    _isConnected = false;
  }

  /// 发送委托请求并等待响应
  Future<DelegateResponse> delegate(DelegateRequest request) async {
    if (!_isConnected || _channel == null) {
      throw StateError('A2A client not connected');
    }

    final message = A2AMessage(
      type: A2AMessageType.delegateRequest,
      id: request.taskId,
      payload: request.toPayload(),
    );

    final completer = Completer<A2AMessage>();
    _pendingRequests[message.id] = completer;

    _channel!.sink.add(jsonEncode(message.toJson()));

    try {
      final response = await completer.future.timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('Request timeout'),
      );

      final payload = response.payload;
      return DelegateResponse(
        taskId: payload['task_id'] as String,
        status: payload['status'] as String,
        actionTaken: payload['action_taken'] as String?,
        result: payload['result'] as Map<String, dynamic>?,
        error: payload['error'] as String?,
      );
    } finally {
      _pendingRequests.remove(request.taskId);
    }
  }

  void _handleMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String) as Map<String, dynamic>;
      final message = A2AMessage.fromJson(json);

      // 检查是否是响应
      if (_pendingRequests.containsKey(message.id)) {
        _pendingRequests[message.id]!.complete(message);
        return;
      }

      // 检查是否是请求（需要处理）
      if (message.type == A2AMessageType.delegateRequest && _requestHandler != null) {
        _handleDelegateRequest(message);
        return;
      }

      _messageController.add(message);
    } catch (e) {
      debugPrint('Failed to handle A2A message: $e');
    }
  }

  Future<void> _handleDelegateRequest(A2AMessage message) async {
    if (_requestHandler == null) return;

    try {
      final request = DelegateRequest.fromPayload(message.payload);
      final response = await _requestHandler!(request);

      final responseMessage = A2AMessage(
        type: A2AMessageType.delegateResponse,
        id: message.id,
        payload: response.toPayload(),
      );

      _channel?.sink.add(jsonEncode(responseMessage.toJson()));
    } catch (e) {
      debugPrint('Failed to handle delegate request: $e');
    }
  }

  void _handleError(dynamic error) {
    debugPrint('A2A WebSocket error: $error');
    _isConnected = false;
  }

  void _handleDisconnect() {
    _isConnected = false;
  }

  Stream<A2AMessage> get messages => _messageController.stream;
}
```

- [ ] **Step 3: 创建 lib/agents/a2a/a2a_server.dart**

```dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'a2a_message.dart';

class A2AServer {
  final int port;
  WebSocketServer? _server;
  final _clients = <String, WebSocketChannel>{};
  final _messageController = StreamController<A2AMessage>.broadcast();

  A2AServer({this.port = 8083});

  bool get isRunning => _server != null;

  /// 启动A2A服务器
  Future<void> start() async {
    // Flutter中无法直接创建WebSocket服务器
    // 需要通过platform channel调用原生代码
    // 这里先预留接口
    throw UnimplementedError('需要通过Platform Channel实现WebSocket服务端');
  }

  /// 停止服务器
  Future<void> stop() async {
    for (final client in _clients.values) {
      await client.sink.close();
    }
    _clients.clear();
    _server = null;
  }

  /// 广播消息给所有客户端
  Future<void> broadcast(A2AMessage message) async {
    final data = jsonEncode(message.toJson());
    for (final client in _clients.values) {
      client.sink.add(data);
    }
  }

  /// 发送消息给指定客户端
  Future<void> sendTo(String clientId, A2AMessage message) async {
    final client = _clients[clientId];
    if (client != null) {
      client.sink.add(jsonEncode(message.toJson()));
    }
  }

  Stream<A2AMessage> get messages => _messageController.stream;
}
```

- [ ] **Step 4: 提交 Chunk 4**

---

## Chunk 5: MobileActionAgent实现

### 文件结构
```
lib/agents/mobile_action_agent/
├── mobile_action_agent.dart      # Agent核心
├── actions.dart                 # Action类型定义
├── mobile_actions_tools.dart    # Tool函数定义
└── mobile_actions_viewmodel.dart # Action执行逻辑
```

- [ ] **Step 1: 创建 lib/agents/mobile_action_agent/actions.dart**

```dart
import 'package:flutter/material.dart';

enum ActionType {
  flashlightOn,
  flashlightOff,
  createContact,
  sendEmail,
  showLocation,
  openWifi,
  createCalendar,
}

abstract class Action {
  final ActionType type;
  final IconData icon;
  final String functionName;
  final Map<String, String> parameters;

  const Action({
    required this.type,
    required this.icon,
    required this.functionName,
    required this.parameters,
  });
}

class FlashlightOnAction extends Action {
  FlashlightOnAction()
      : super(
          type: ActionType.flashlightOn,
          icon: Icons.flashlight_on,
          functionName: 'turnOnFlashlight',
          parameters: {},
        );
}

class FlashlightOffAction extends Action {
  FlashlightOffAction()
      : super(
          type: ActionType.flashlightOff,
          icon: Icons.flashlight_off,
          functionName: 'turnOffFlashlight',
          parameters: {},
        );
}

class CreateContactAction extends Action {
  final String name;
  final String? phone;
  final String? email;

  CreateContactAction({
    required this.name,
    this.phone,
    this.email,
  }) : super(
          type: ActionType.createContact,
          icon: Icons.person_add,
          functionName: 'createContact',
          parameters: {
            'name': name,
            if (phone != null) 'phone': phone!,
            if (email != null) 'email': email!,
          },
        );
}

class SendEmailAction extends Action {
  final String to;
  final String subject;
  final String body;

  SendEmailAction({
    required this.to,
    required this.subject,
    required this.body,
  }) : super(
          type: ActionType.sendEmail,
          icon: Icons.email,
          functionName: 'sendEmail',
          parameters: {
            'to': to,
            'subject': subject,
            'body': body,
          },
        );
}

class ShowLocationAction extends Action {
  final String query;

  ShowLocationAction({required this.query})
      : super(
          type: ActionType.showLocation,
          icon: Icons.location_on,
          functionName: 'showLocation',
          parameters: {'query': query},
        );
}

class OpenWifiAction extends Action {
  OpenWifiAction()
      : super(
          type: ActionType.openWifi,
          icon: Icons.wifi,
          functionName: 'openWifiSettings',
          parameters: {},
        );
}

class CreateCalendarAction extends Action {
  final String title;
  final DateTime startTime;
  final DateTime? endTime;
  final String? description;
  final String? location;

  CreateCalendarAction({
    required this.title,
    required this.startTime,
    this.endTime,
    this.description,
    this.location,
  }) : super(
          type: ActionType.createCalendar,
          icon: Icons.calendar_today,
          functionName: 'createCalendarEvent',
          parameters: {
            'title': title,
            'start_time': startTime.toIso8601String(),
            if (endTime != null) 'end_time': endTime!.toIso8601String(),
            if (description != null) 'description': description!,
            if (location != null) 'location': location!,
          },
        );
}
```

- [ ] **Step 2: 创建 lib/agents/mobile_action_agent/mobile_actions_tools.dart**

```dart
import 'package:flutter/foundation.dart';
import 'package:model_context_protocol/kotlin/sdk';
import '../actions.dart';

/// MobileActionAgent的工具定义
/// 参考Gallery的AgentTools.kt实现
class MobileActionsTools {
  final void Function(Action) onActionCalled;

  MobileActionsTools({required this.onActionCalled});

  @Tool(description: 'Turn on the flashlight')
  Map<String, String> turnOnFlashlight() {
    onActionCalled(FlashlightOnAction());
    return {'result': 'Flashlight turned on'};
  }

  @Tool(description: 'Turn off the flashlight')
  Map<String, String> turnOffFlashlight() {
    onActionCalled(FlashlightOffAction());
    return {'result': 'Flashlight turned off'};
  }

  @Tool(description: 'Create a new contact')
  Map<String, String> createContact(
    @ToolParam(description: 'Contact name') String name,
    @ToolParam(description: 'Phone number', required: false) String? phone,
    @ToolParam(description: 'Email address', required: false) String? email,
  ) {
    onActionCalled(CreateContactAction(
      name: name,
      phone: phone,
      email: email,
    ));
    return {'result': 'Contact creation initiated', 'name': name};
  }

  @Tool(description: 'Send an email')
  Map<String, String> sendEmail(
    @ToolParam(description: 'Recipient email') String to,
    @ToolParam(description: 'Email subject') String subject,
    @ToolParam(description: 'Email body') String body,
  ) {
    onActionCalled(SendEmailAction(to: to, subject: subject, body: body));
    return {'result': 'Email compose opened', 'to': to};
  }

  @Tool(description: 'Show a location on map')
  Map<String, String> showLocation(
    @ToolParam(description: 'Location query') String query,
  ) {
    onActionCalled(ShowLocationAction(query: query));
    return {'result': 'Map opened', 'query': query};
  }

  @Tool(description: 'Open WiFi settings')
  Map<String, String> openWifiSettings() {
    onActionCalled(OpenWifiAction());
    return {'result': 'WiFi settings opened'};
  }

  @Tool(description: 'Create a calendar event')
  Map<String, String> createCalendarEvent(
    @ToolParam(description: 'Event title') String title,
    @ToolParam(description: 'Start time (ISO8601)') String startTime,
    @ToolParam(description: 'End time (ISO8601)', required: false) String? endTime,
    @ToolParam(description: 'Event description', required: false) String? description,
    @ToolParam(description: 'Event location', required: false) String? location,
  ) {
    onActionCalled(CreateCalendarAction(
      title: title,
      startTime: DateTime.parse(startTime),
      endTime: endTime != null ? DateTime.parse(endTime) : null,
      description: description,
      location: location,
    ));
    return {'result': 'Calendar event created', 'title': title};
  }
}
```

- [ ] **Step 3: 创建 lib/agents/mobile_action_agent/mobile_actions_viewmodel.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'actions.dart';

/// MobileActionAgent的Action执行器
/// 参考Gallery的MobileActionsViewModel实现
class MobileActionsViewModel {
  BuildContext? context;

  void setContext(BuildContext ctx) {
    context = ctx;
  }

  /// 执行Action
  Future<String> performAction(Action action) async {
    switch (action.type) {
      case ActionType.flashlightOn:
        return _turnOnFlashlight();
      case ActionType.flashlightOff:
        return _turnOffFlashlight();
      case ActionType.createContact:
        return _createContact(action as CreateContactAction);
      case ActionType.sendEmail:
        return _sendEmail(action as SendEmailAction);
      case ActionType.showLocation:
        return _showLocation(action as ShowLocationAction);
      case ActionType.openWifi:
        return _openWifiSettings();
      case ActionType.createCalendar:
        return _createCalendar(action as CreateCalendarAction);
    }
  }

  Future<String> _turnOnFlashlight() async {
    // 调用CameraManager.setTorchMode
    // 需要通过Platform Channel调用原生代码
    const platform = MethodChannel('com.ibloc.shadow/flashlight');
    await platform.invokeMethod('turnOn');
    return 'Flashlight turned on';
  }

  Future<String> _turnOffFlashlight() async {
    const platform = MethodChannel('com.ibloc.shadow/flashlight');
    await platform.invokeMethod('turnOff');
    return 'Flashlight turned off';
  }

  Future<String> _createContact(CreateContactAction action) async {
    // 打开联系人创建界面
    final uri = Uri(
      scheme: 'content',
      path: 'com.android.contacts',
    );
    // 使用Intent打开系统联系人应用
    // 需要通过platform channel
    return 'Contact creation: ${action.name}';
  }

  Future<String> _sendEmail(SendEmailAction action) async {
    // 使用mailto: Intent
    final uri = Uri(
      scheme: 'mailto',
      path: action.to,
      queryParameters: {
        'subject': action.subject,
        'body': action.body,
      },
    );
    // 打开邮件客户端
    return 'Email to: ${action.to}';
  }

  Future<String> _showLocation(ShowLocationAction action) async {
    // 使用geo: Intent打开地图
    final uri = Uri(
      scheme: 'geo',
      path: '0,0',
      queryParameters: {'q': action.query},
    );
    return 'Showing location: ${action.query}';
  }

  Future<String> _openWifiSettings() async {
    // 打开WiFi设置
    // Settings.ACTION_WIFI_SETTINGS
    return 'WiFi settings opened';
  }

  Future<String> _createCalendar(CreateCalendarAction action) async {
    // 使用CalendarContract.Intent
    return 'Calendar event created: ${action.title}';
  }
}
```

- [ ] **Step 4: 创建 lib/agents/mobile_action_agent/mobile_action_agent.dart**

```dart
import 'dart:async';
import 'a2a/a2a_client.dart';
import 'a2a/a2a_message.dart';
import 'actions.dart';
import 'mobile_actions_tools.dart';
import 'mobile_actions_viewmodel.dart';

/// MobileActionAgent
/// 处理设备控制请求的Agent
class MobileActionAgent {
  final MobileActionsTools _tools;
  final MobileActionsViewModel _viewModel;
  final A2AClient? _a2aClient;

  MobileActionAgent({
    MobileActionsTools? tools,
    MobileActionsViewModel? viewModel,
    A2AClient? a2aClient,
  })  : _tools = tools ?? MobileActionsTools(onActionCalled: (_) {}),
        _viewModel = viewModel ?? MobileActionsViewModel(),
        _a2aClient = a2aClient {
    _setupA2AClient();
  }

  void _setupA2AClient() {
    if (_a2aClient != null) {
      _a2aClient!.setRequestHandler(_handleDelegateRequest);
    }
  }

  /// 处理来自主Agent的委托请求
  Future<DelegateResponse> _handleDelegateRequest(DelegateRequest request) async {
    try {
      // 根据userRequest创建对应的Action
      final action = _parseUserRequest(request.userRequest);
      if (action == null) {
        return DelegateResponse(
          taskId: request.taskId,
          status: 'failed',
          error: 'Cannot understand request: ${request.userRequest}',
        );
      }

      // 执行Action
      final result = await _viewModel.performAction(action);

      return DelegateResponse(
        taskId: request.taskId,
        status: 'success',
        actionTaken: action.functionName,
        result: {'message': result},
      );
    } catch (e) {
      return DelegateResponse(
        taskId: request.taskId,
        status: 'failed',
        error: e.toString(),
      );
    }
  }

  /// 解析用户请求为Action
  Action? _parseUserRequest(String request) {
    final lower = request.toLowerCase();

    if (lower.contains('开灯') || lower.contains('打开闪光灯')) {
      return FlashlightOnAction();
    }
    if (lower.contains('关灯') || lower.contains('关闭闪光灯')) {
      return FlashlightOffAction();
    }
    if (lower.contains('联系人') || lower.contains('创建联系人')) {
      // 需要从request中提取姓名等信息
      return null; // 需要更复杂的解析
    }
    if (lower.contains('邮件') || lower.contains('发邮件')) {
      return null; // 需要从request中提取收件人等信息
    }
    // ... 更多解析逻辑

    return null;
  }

  /// 连接A2A服务器
  Future<void> connect(String serverUrl) async {
    await _a2aClient?.connect();
  }

  /// 断开连接
  Future<void> disconnect() async {
    await _a2aClient?.disconnect();
  }
}
```

- [ ] **Step 5: 提交 Chunk 5**

---

## Chunk 6: UI集成

### 文件结构
```
lib/screens/
├── home_screen.dart           # 首页（主Agent对话）
├── agents_screen.dart          # Agent管理页面
├── model_settings_screen.dart  # 模型设置
└── prompt_settings_screen.dart # 提示词设置

lib/providers/
└── agent_provider.dart         # Agent状态管理
```

- [ ] **Step 1: 更新 lib/screens/home_screen.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../agents/providers/agent_provider.dart';
import '../widgets/chat_bubble.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    _controller.clear();

    try {
      await ref.read(mainAgentProvider.notifier).sendMessage(text);
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final agentState = ref.watch(mainAgentProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shadow'),
        actions: [
          IconButton(
            icon: const Icon(Icons.psychology),
            onPressed: () => Navigator.pushNamed(context, '/agents'),
            tooltip: 'Agent管理',
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: agentState.messages.isEmpty
                ? const Center(
                    child: Text('开始与你的AI影子对话'),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: agentState.messages.length,
                    itemBuilder: (context, index) {
                      final msg = agentState.messages[index];
                      return ChatBubble(
                        message: msg.content,
                        isUser: msg.role == 'user',
                      );
                    },
                  ),
          ),
          if (agentState.isLoading)
            const Padding(
              padding: EdgeInsets.all(8.0),
              child: CircularProgressIndicator(),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: const InputDecoration(
                      hintText: '输入消息...',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.send),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 创建 lib/screens/model_settings_screen.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../agents/providers/agent_provider.dart';

class ModelSettingsScreen extends ConsumerWidget {
  const ModelSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedEngine = ref.watch(selectedEngineProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('模型设置'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildEngineSection(ref, selectedEngine),
          const SizedBox(height: 24),
          _buildModelSection(ref, selectedEngine),
        ],
      ),
    );
  }

  Widget _buildEngineSection(WidgetRef ref, String selectedEngine) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '推理引擎',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'litert', label: Text('liteRT')),
            ButtonSegment(value: 'mnn', label: Text('MNN')),
          ],
          selected: {selectedEngine},
          onSelectionChanged: (selected) {
            ref.read(selectedEngineProvider.notifier).state = selected.first;
          },
        ),
      ],
    );
  }

  Widget _buildModelSection(WidgetRef ref, String engine) {
    // TODO: 根据引擎加载对应模型列表
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '选择模型',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        // TODO: 动态加载模型列表
        const Text('(模型列表加载中...)'),
      ],
    );
  }
}
```

- [ ] **Step 3: 创建 lib/screens/prompt_settings_screen.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../agents/providers/agent_provider.dart';
import '../agents/main_agent/main_agent_prompt.dart';

class PromptSettingsScreen extends ConsumerStatefulWidget {
  const PromptSettingsScreen({super.key});

  @override
  ConsumerState<PromptSettingsScreen> createState() =>
      _PromptSettingsScreenState();
}

class _PromptSettingsScreenState
    extends ConsumerState<PromptSettingsScreen> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: ref.read(customPromptProvider) ?? MainAgentPrompt.defaultSystemPrompt,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _save() {
    ref.read(customPromptProvider.notifier).state = _controller.text;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('提示词已保存')),
    );
  }

  void _reset() {
    _controller.text = MainAgentPrompt.defaultSystemPrompt;
    ref.read(customPromptProvider.notifier).state = null;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已恢复默认提示词')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('提示词设置'),
        actions: [
          TextButton(
            onPressed: _save,
            child: const Text('保存'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '主Agent系统提示词',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Expanded(
              child: TextField(
                controller: _controller,
                maxLines: null,
                expands: true,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: '输入系统提示词...',
                ),
              ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _reset,
                icon: const Icon(Icons.restore),
                label: const Text('恢复默认'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: 更新路由配置**

```dart
// 在 app_router.dart 中添加新路由
static const String modelSettings = '/settings/model';
static const String promptSettings = '/settings/prompt';

GoRoute(
  path: AppRoutes.modelSettings,
  builder: (context, state) => const ModelSettingsScreen(),
),
GoRoute(
  path: AppRoutes.promptSettings,
  builder: (context, state) => const PromptSettingsScreen(),
),
```

- [ ] **Step 5: 提交 Chunk 6**

---

## 实现顺序建议

```
Phase 1: 基础框架
├── Chunk 1: 模型配置层 (先建立配置体系)
├── Chunk 2: 主Agent核心 (系统提示词 + 工具定义)
└── Chunk 3: Skill系统基础 (复用Gallery格式)

Phase 2: Agent间通信
├── Chunk 4: A2A协议实现 (WebSocket通信)
└── Chunk 5: MobileActionAgent实现 (设备控制)

Phase 3: UI集成
└── Chunk 6: UI集成 (首页 + 设置页面)
```

---

## 依赖检查清单

- [ ] `web_socket_channel` - WebSocket通信
- [ ] `json_annotation` - JSON序列化
- [ ] `riverpod` - 状态管理
- [ ] `go_router` - 路由管理

---

## 测试验证点

1. **模型配置**: 切换引擎后模型列表正确更新
2. **主Agent对话**: 发送消息获取响应
3. **Skill加载**: 内置Skill正确加载和执行
4. **A2A通信**: 主Agent成功委托MobileActionAgent
5. **设备控制**: 闪光灯、日历等Action正确执行
6. **提示词保存**: 自定义提示词正确保存和加载
