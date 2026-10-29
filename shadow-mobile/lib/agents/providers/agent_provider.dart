import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/model_engine.dart';
import '../../models/model_providers.dart';
import '../main_agent/main_agent_tools.dart';

/// 自定义提示词 Provider
final customPromptProvider = StateProvider<String?>((ref) => null);

/// 模型引擎 Provider
/// 根据选择的引擎创建对应的引擎实例
final modelEngineProvider = Provider<ModelEngine>((ref) {
  final selectedEngine = ref.watch(selectedEngineProvider);
  final factory = ref.watch(engineFactoryProvider);
  return factory.createEngine(selectedEngine);
});

/// Agent工具注册表 Provider
final agentToolsProvider = Provider<List<MainAgentTool>>((ref) {
  return MainAgentToolsRegistry.allTools;
});

/// 当前工具描述列表 Provider（用于prompt注入）
final agentToolsDescriptionProvider = Provider<List<String>>((ref) {
  return MainAgentToolsRegistry.getToolDescriptions();
});
