// AG-UI 的**请求面** —— 端脑 `RunAgentInputLite` 那一半。
//
// ⚠️ **事件那半在 `agui_events.dart`**（这一份只放请求面）⇒ ⇒ 两份合起来
// 才是一份完整协议 ⇒ ⇒ 与桌面端 `src/lib/agui/types.ts` 逐字对账。
//
// ⚠️ **请求面要整份带**（messages／tools／threadId／runId）⇒ ⇒ 只发 messages
// ⇒ ⇒ 模型**不知道这台设备会什么** ⇒ ⇒ 设备工具**静默失灵**
// （这一格真踩过：桌面端那一刀就是在这里丢的 —— 只发 messages ⇒ 工具清单没进
// 请求 ⇒ 模型不调 ⇒ 界面什么都不显示 ⇒ 「失败长得像成功」的产品级形态）。
//
// ⚠️ **零新增依赖**：形状用官方的，依赖不引入官方的。

/// 一条消息（用户／助手／工具结果）。
class AguiMessage {
  /// `user` ／ `assistant` ／ `tool`。
  final String role;

  /// 文本（String）或多模态 part 列表（`List<Map<String, dynamic>>`）。
  final Object content;

  /// 工具结果消息要带它 —— 端脑按它把结果配回那次调用（缺了就认不出是哪一次）。
  final String? toolCallId;

  /// 工具**失败**的原因 —— 端脑那边「error 在场 ⇒ 状态就是 failed」。
  ///
  /// ⚠️ 失败**不许**长得像成功 ⇒ ⇒ 工具失败必须把这个字段带上，不能只把失败
  /// 原因塞进 `content`（那样端脑会当成成功的结果）。
  final String? error;

  const AguiMessage({
    required this.role,
    required this.content,
    this.toolCallId,
    this.error,
  });

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'role': role,
      'content': content,
      if (toolCallId != null) 'toolCallId': toolCallId,
      if (error != null) 'error': error,
    };
  }
}

/// AG-UI 的工具（**扁平**：`{name, description?, parameters?}` —— **不套 function**）。
///
/// ⚠️ 端脑自己再包成 OpenAI 形状（端脑那一侧有判据钉着）⇒ ⇒ 两端各包一次是
/// **两处真相** ⇒ ⇒ 客户端这一处**不许**包。
class AguiTool {
  final String name;
  final String? description;
  final Object? parameters;

  const AguiTool({required this.name, this.description, this.parameters});

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'name': name,
      if (description != null) 'description': description,
      if (parameters != null) 'parameters': parameters,
    };
  }
}

/// 一轮请求 —— **整份带**（messages／tools／threadId／runId）。
class AguiRunRequest {
  final String? threadId;
  final String? runId;
  final List<AguiMessage> messages;
  final List<AguiTool>? tools;

  const AguiRunRequest({
    this.threadId,
    this.runId,
    required this.messages,
    this.tools,
  });

  AguiRunRequest copyWith({List<AguiMessage>? messages}) {
    return AguiRunRequest(
      threadId: threadId,
      runId: runId,
      messages: messages ?? this.messages,
      tools: tools,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      if (threadId != null) 'threadId': threadId,
      if (runId != null) 'runId': runId,
      'messages': messages.map((AguiMessage m) => m.toJson()).toList(),
      if (tools != null)
        'tools': tools!.map((AguiTool t) => t.toJson()).toList(),
    };
  }
}
