import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart';

import '../../services/encephalon/encephalon_mobile_service.dart';

/// 大脑（neuron）后端的 [LlmProvider] —— flutter_ai_toolkit 对话面的
/// 推理实现。
///
/// ⚠️ **推理归 neuron 管**（2026-11-08 用户拍板）：请求体直接进进程内
/// adapter 管线（`EncephalonMobileService.infer` ⇒ `/v1/chat/completions`，
/// OpenAI 兼容）—— 与运行时页的推理探针同一条缝。Kotlin 侧不再有本地
/// 推理实现（LiteRT 面已删除）：本地权重、云端供应商都由大脑的目录与
/// 路由决定，这里只管把对话送进大脑。
///
/// 附件语义：
/// - **图片** → OpenAI 视觉格式（data URL）—— 目录里的视觉模型能吃；
/// - **音频**（语音笔记）→ 不发。大脑的 chat completions 没有 ASR 槽，
///   静默丢弃＝失败长得像成功 ⇒ 回一句明说「还没接 ASR」的话
///   （[audioHint]，由界面用用户语言给）。
class BrainLlmProvider extends LlmProvider with ChangeNotifier {
  final EncephalonMobileService _service;
  final List<ChatMessage> _history = [];

  /// OpenAI 格式的对话上下文（与 [_history] 平行维护 —— 不回头解析
  /// ChatMessage，工具箱的消息形状变了也不受影响）。
  final List<Map<String, dynamic>> _messages = [];

  /// 推理失败时给用户的那句话（界面用 l10n 提供，比如 `encephalonInferFailed`）。
  final String Function() failureText;

  /// 收到音频附件时回的那句话（说明语音转写还没接大脑 ASR 面）。
  final String Function() audioHint;

  BrainLlmProvider({
    EncephalonMobileService? service,
    required this.failureText,
    required this.audioHint,
    Iterable<ChatMessage>? history,
  })  : _service = service ?? EncephalonMobileService() {
    if (history != null) {
      _history.addAll(history);
    }
  }

  @override
  Stream<String> generateStream(
    String prompt, {
    Iterable<Attachment> attachments = const [],
  }) async* {
    // 一次性提问：带上既有上下文，但**不**把这一问一答记进历史
    // （工具箱的「重新生成」走这里 —— 重答不该把旧答案钉死）。
    final content = _buildContent(prompt, attachments);
    yield* _complete(_messagesFor(content, record: false));
  }

  @override
  Stream<String> sendMessageStream(
    String prompt, {
    Iterable<Attachment> attachments = const [],
  }) async* {
    final userMessage = ChatMessage.user(prompt, attachments);
    final llmMessage = ChatMessage.llm();
    _history.addAll([userMessage, llmMessage]);

    final content = _buildContent(prompt, attachments);
    final answer = await _completeText(_messagesFor(content, record: true));

    llmMessage.append(answer);
    yield answer;
    notifyListeners();
  }

  @override
  Iterable<ChatMessage> get history => _history;

  @override
  set history(Iterable<ChatMessage> history) {
    _history.clear();
    _messages.clear();
    _history.addAll(history);
    notifyListeners();
  }

  /// 组请求消息。附件里只要有音频 ⇒ 这一问原样退回提示（对话上下文
  /// 不记这条 —— 没发出去的东西不该污染上下文）。
  List<Map<String, dynamic>> _messagesFor(
    Map<String, dynamic> content, {
    required bool record,
  }) {
    final messages = [
      for (final m in _messages) Map<String, dynamic>.of(m),
    ];
    if (content['audioOnly'] == true) {
      return [
        ...messages,
        {'role': 'user', 'content': audioHint()},
      ];
    }
    final entry = {'role': 'user', 'content': content['content']};
    if (record) _messages.add(entry);
    return [...messages, entry];
  }

  /// 组 OpenAI 请求体里的用户内容。
  ///
  /// 返回 `{content: <string|array>, audioOnly: bool}`：
  /// - 纯文本 ⇒ string（最大兼容面）；
  /// - 带图片 ⇒ 数组（`image_url` data URL —— 视觉模型的标准形状）；
  /// - 只有音频（语音笔记常见：无文字）⇒ `audioOnly: true`。
  Map<String, dynamic> _buildContent(
    String prompt,
    Iterable<Attachment> attachments,
  ) {
    final images = <Map<String, dynamic>>[];
    var hasAudio = false;
    for (final attachment in attachments) {
      switch (attachment) {
        case FileAttachment(:final mimeType, :final bytes):
          if (mimeType.startsWith('image/')) {
            images.add({
              'type': 'image_url',
              'image_url': {
                'url': 'data:$mimeType;base64,${base64Encode(bytes)}',
              },
            });
          } else if (mimeType.startsWith('audio/')) {
            hasAudio = true;
          }
        case LinkAttachment():
          break;
      }
    }

    if (hasAudio && prompt.trim().isEmpty && images.isEmpty) {
      return {'content': audioHint(), 'audioOnly': true};
    }

    if (images.isEmpty) {
      return {'content': prompt, 'audioOnly': false};
    }
    return {
      'content': [
        {'type': 'text', 'text': prompt},
        ...images,
      ],
      'audioOnly': false,
    };
  }

  Stream<String> _complete(List<Map<String, dynamic>> messages) async* {
    yield await _completeText(messages);
  }

  /// 发一次进程内推理，返回助手回复（或失败说明）。
  Future<String> _completeText(List<Map<String, dynamic>> messages) async {
    final body = utf8.encode(
      jsonEncode({'messages': messages}),
    );
    final result = await _service.infer(
      path: '/v1/chat/completions',
      body: Uint8List.fromList(body),
    );

    if (result == null) {
      // .so 没加载 / 运行时没起 / native 报错 —— 把话说清楚，不装成功。
      return failureText();
    }
    if (!result.isSuccess) {
      return '${failureText()}\nHTTP ${result.status}\n'
          '${_excerpt(result.bodyText)}';
    }

    try {
      final json = jsonDecode(result.bodyText) as Map<String, dynamic>;
      final choices = json['choices'] as List?;
      if (choices == null || choices.isEmpty) {
        return '${failureText()}\n${_excerpt(result.bodyText)}';
      }
      final message = (choices.first as Map)['message'] as Map?;
      final content = message?['content'];
      final text = content is String ? content.trim() : '';
      return text.isEmpty ? failureText() : text;
    } catch (_) {
      // 形状不对 —— 原样给出片段，别把响应吞成空成功。
      return '${failureText()}\n${_excerpt(result.bodyText)}';
    }
  }

  /// 响应体截断 —— 出错时给用户看头部就够定位，整段塞进气泡没法读。
  String _excerpt(String body) {
    final text = body.trim();
    return text.length <= 200 ? text : '${text.substring(0, 200)}…';
  }
}
