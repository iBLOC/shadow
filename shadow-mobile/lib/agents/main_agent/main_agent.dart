import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/model_config.dart';
import '../../models/model_engine.dart';
import 'main_agent_prompt.dart';
import 'main_agent_tools.dart';

/// 主Agent消息
class MainAgentMessage {
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime timestamp;

  MainAgentMessage({
    required this.role,
    required this.content,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() {
    return {
      'role': role,
      'content': content,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

/// 主Agent状态
class MainAgentState {
  final List<MainAgentMessage> messages;
  final bool isLoading;
  final String? error;
  final ModelInfo? currentModel;
  final String? customSystemPrompt;

  const MainAgentState({
    this.messages = const [],
    this.isLoading = false,
    this.error,
    this.currentModel,
    this.customSystemPrompt,
  });

  MainAgentState copyWith({
    List<MainAgentMessage>? messages,
    bool? isLoading,
    String? error,
    ModelInfo? currentModel,
    String? customSystemPrompt,
    bool clearError = false,
  }) {
    return MainAgentState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      currentModel: currentModel ?? this.currentModel,
      customSystemPrompt: customSystemPrompt ?? this.customSystemPrompt,
    );
  }
}

/// 主Agent状态管理器
class MainAgentNotifier extends StateNotifier<MainAgentState> {
  final ModelEngine _engine;
  final String _defaultPrompt;

  MainAgentNotifier({required ModelEngine engine, String? customSystemPrompt})
    : _engine = engine,
      _defaultPrompt = MainAgentPrompt.defaultSystemPrompt,
      super(
        MainAgentState(
          currentModel: engine.currentModel,
          customSystemPrompt: customSystemPrompt,
        ),
      );

  /// 获取当前系统提示词
  String get systemPrompt {
    return state.customSystemPrompt ?? _defaultPrompt;
  }

  /// 发送消息并获取响应
  Future<String> sendMessage(String userMessage) async {
    state = state.copyWith(isLoading: true, clearError: true);

    // 添加用户消息
    final userMsg = MainAgentMessage(role: 'user', content: userMessage);
    final messages = [...state.messages, userMsg];
    state = state.copyWith(messages: messages);

    try {
      // 构建完整prompt
      final fullPrompt = _buildPrompt(messages);

      // 调用模型
      final response = await _engine.generate(fullPrompt);

      // 添加助手消息
      final assistantMsg = MainAgentMessage(
        role: 'assistant',
        content: response,
      );
      state = state.copyWith(
        messages: [...state.messages, assistantMsg],
        isLoading: false,
      );

      return response;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  String _buildPrompt(List<MainAgentMessage> messages) {
    final buffer = StringBuffer();
    buffer.writeln(systemPrompt);
    buffer.writeln('\n\n## 可用工具\n');
    buffer.writeln(
      MainAgentToolsRegistry.allTools
          .map((t) => '- ${t.name}: ${t.description}')
          .join('\n'),
    );
    buffer.writeln('\n\n## 对话历史\n');

    for (final msg in messages) {
      buffer.writeln('${msg.role}: ${msg.content}');
    }

    buffer.write('\nassistant:');
    return buffer.toString();
  }

  /// 更新系统提示词
  void updateSystemPrompt(String? newPrompt) {
    state = state.copyWith(customSystemPrompt: newPrompt);
  }

  /// 切换模型
  Future<void> switchModel(ModelInfo model) async {
    await _engine.release();
    await _engine.initialize(model);
    state = state.copyWith(currentModel: model);
  }

  /// 清除对话历史
  void clearHistory() {
    state = state.copyWith(messages: [], clearError: true);
  }

  /// 清除错误
  void clearError() {
    state = state.copyWith(clearError: true);
  }
}
