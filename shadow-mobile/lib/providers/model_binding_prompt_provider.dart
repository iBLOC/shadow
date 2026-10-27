import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 一个可选的模型绑定项。
///
/// telencephalon 在返回 `LLM_NOT_REGISTERED` 时可以附带若干候选绑定项，
/// 弹窗把它们逐条列出，让用户知道有哪些模型可选。
class ModelBindingOption {
  final String label;
  final String description;

  const ModelBindingOption({required this.label, required this.description});

  factory ModelBindingOption.fromJson(Map<String, dynamic> json) {
    return ModelBindingOption(
      label: (json['label'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
    );
  }
}

/// 模型绑定引导的内容。状态为 null 时弹窗不渲染。
class ModelBindingPrompt {
  /// 服务端带来的提示文案。缺省时弹窗回落到"去设置绑定"。
  final String? userMessage;

  /// 可选的绑定项。为空时弹窗只提示去设置页完成绑定。
  final List<ModelBindingOption>? bindingOptions;

  const ModelBindingPrompt({this.userMessage, this.bindingOptions});

  factory ModelBindingPrompt.fromJson(Map<String, dynamic> json) {
    final raw = json['bindingOptions'] ?? json['binding_options'];
    return ModelBindingPrompt(
      userMessage:
          (json['userMessage'] ?? json['user_message'])?.toString(),
      bindingOptions: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(ModelBindingOption.fromJson)
              .toList()
          : null,
    );
  }
}

/// 引导弹窗的状态持有者。
class ModelBindingPromptNotifier extends StateNotifier<ModelBindingPrompt?> {
  ModelBindingPromptNotifier() : super(null);

  /// 展示引导。
  void show(ModelBindingPrompt prompt) => state = prompt;

  /// 关闭引导。
  void dismiss() => state = null;
}

/// 模型绑定引导弹窗的状态。
///
/// 弹窗本身在 `lib/widgets/model_binding_prompt_dialog.dart`。
final modelBindingPromptProvider =
    StateNotifierProvider<ModelBindingPromptNotifier, ModelBindingPrompt?>(
  (ref) => ModelBindingPromptNotifier(),
);
