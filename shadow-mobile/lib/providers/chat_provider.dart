import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import '../tts_engine.dart';
import '../multimodal/multimodal.dart';
import '../services/telencephalon/telencephalon_client.dart';
import 'conversation_mode_provider.dart';
import 'telencephalon_provider.dart';
import '../l10n/current_l10n.dart';
import '../agents/main_agent/main_agent_prompt.dart';
import '../agents/providers/agent_provider.dart';

/// Chat message model for the UI
class ChatMessageModel {
  final String content;
  final ChatRole role;
  final String? attachmentPath;
  final MultimodalInputType? attachmentType;

  ChatMessageModel(
    this.content,
    this.role, {
    this.attachmentPath,
    this.attachmentType,
  });
}

enum ChatRole { user, assistant, system }

/// L10n keys for provider messages (resolved in UI with AppLocalizations).
enum ChatStateL10nKey {
  modelInfoNotInitialized,
  modelLoaded,
  desktopMode,
  errorGeneric,

  /// 带附件发送被拒（端脑链路只处理纯文本）。
  ///
  /// 以前这个场景复用的是 `errorGeneric` + `chatImageNotAvailable`
  /// —— 那条文案写的是「LiteRT 图片功能暂时不可用」，本地 LiteRT
  /// 下线之后已经不成立了。现在有自己的 key，文案说清楚**为什么**。
  errorAttachmentNotAvailable,
}

/// Chat state
class ChatState {
  final List<ChatMessageModel> messages;
  final bool isLoading;
  final String modelInfo;
  final String? errorMessage;
  final ChatStateL10nKey? modelInfoL10nKey;
  final ChatStateL10nKey? errorMessageL10nKey;
  final String? errorMessageArg;
  final bool isRecordingAudio;
  final List<MultimodalInput> attachments;
  final VoiceState voiceState;
  final String streamingText;
  final String? sessionId;

  const ChatState({
    this.messages = const [],
    this.isLoading = false,
    this.modelInfo = 'Telencephalon',
    this.errorMessage,
    this.modelInfoL10nKey,
    this.errorMessageL10nKey,
    this.errorMessageArg,
    this.isRecordingAudio = false,
    this.attachments = const [],
    this.voiceState = VoiceState.idle,
    this.streamingText = '',
    this.sessionId,
  });

  /// 能不能发消息。
  ///
  /// 移动端**只有端脑一条链路**（`/shadow/v1/*` → 嵌入式大脑 → 端脑 → 叶区），
  /// 本地 LiteRT 已下线 ⇒ 没有任何「本地引擎就绪」的前置条件。
  ///
  /// ⚠️ 这里**曾经**是 `isInitialized || isLitertReady || mode == ChatMode.off`
  /// —— 前两个都是**本地引擎**的状态 ⇒ 没装本地模型的设备上**输入框整个
  /// 是禁用的**，移动端对话页一条消息都发不出去（`425e666` 修过一次）。
  /// 现在本地引擎没了，这个判据也就没必要了 —— UI 直接看 `isLoading`。
  bool get canChat => true;

  static const _omit = _CopyWithOmit();

  ChatState copyWith({
    List<ChatMessageModel>? messages,
    bool? isLoading,
    String? modelInfo,
    Object? errorMessage = _omit,
    ChatStateL10nKey? modelInfoL10nKey,
    Object? errorMessageL10nKey = _omit,
    Object? errorMessageArg = _omit,
    bool? isRecordingAudio,
    List<MultimodalInput>? attachments,
    VoiceState? voiceState,
    String? streamingText,
    String? sessionId,
  }) {
    final explicitError = !identical(errorMessage, _omit);
    final clearError = explicitError && errorMessage == null;
    return ChatState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      modelInfo: modelInfo ?? this.modelInfo,
      errorMessage: explicitError ? errorMessage as String? : this.errorMessage,
      modelInfoL10nKey: modelInfoL10nKey ?? this.modelInfoL10nKey,
      errorMessageL10nKey: clearError
          ? null
          : (identical(errorMessageL10nKey, _omit)
                ? this.errorMessageL10nKey
                : errorMessageL10nKey as ChatStateL10nKey?),
      errorMessageArg: clearError
          ? null
          : (identical(errorMessageArg, _omit)
                ? this.errorMessageArg
                : errorMessageArg as String?),
      isRecordingAudio: isRecordingAudio ?? this.isRecordingAudio,
      attachments: attachments ?? this.attachments,
      voiceState: voiceState ?? this.voiceState,
      streamingText: streamingText ?? this.streamingText,
      sessionId: sessionId ?? this.sessionId,
    );
  }
}

class _CopyWithOmit {
  const _CopyWithOmit();
}

/// 没有配置人设时的取值。
///
/// 具名函数而不是闭包字面量 —— 初始化列表里的 `() => null` 会被 Dart
/// 当成构造器体（`=>` 在初始化列表里有别的含义），解析直接炸。
String? noSystemPrompt() => null;

/// Chat notifier
class ChatNotifier extends StateNotifier<ChatState> {
  static final _log = Logger('ChatNotifier');

  final TtsEngine _ttsEngine;

  /// 端脑 client —— 对话走**端脑方言**（`/shadow/v1/conversations`），
  /// 与桌面端同一条链路，也正是嵌入式大脑挂起来的那条面。
  ///
  /// 之前这里用的是 `PrefrontalClient`（前额叶方言：
  /// `/api/sessions` + `/hippocampus/api/sessions`）—— 那条路在
  /// 「改嵌大脑」之后不存在了：端脑面是 `/shadow/v1/*`。
  final TelencephalonClient _telencephalonClient;
  final MultimodalInputManager _multimodalManager = MultimodalInputManager();

  /// 人设提示词 —— 随**会话创建**送进端脑（`createConversation({ system })`）。
  ///
  /// 端脑把它记进会话记录并转发给叶区，模型才真的按这个人设说话。
  /// 用函数而不是值：提示词设置页改了人设之后，**下一个**会话就用新的，
  /// 而不必重建整个 ChatNotifier（那会把当前对话冲掉）。
  final String? Function() _systemPromptProvider;

  /// 端脑侧的会话 id（`/shadow/v1/conversations/{id}`）。
  String? _currentSessionId;

  ChatNotifier(
    this._ttsEngine,
    this._telencephalonClient, {
    String? Function()? systemPromptProvider,
  }) : _systemPromptProvider = systemPromptProvider ?? noSystemPrompt,
       super(const ChatState());

  // Multimodal input methods
  Future<void> pickImage() async {
    final input = await _multimodalManager.pickImageFromGallery();
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  Future<void> captureImage() async {
    final input = await _multimodalManager.captureImage();
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  Future<void> pickFile() async {
    final input = await _multimodalManager.pickFile();
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  void setAudioChunkCallback(void Function(Uint8List)? callback) {
    _multimodalManager.setAudioChunkCallback(callback);
  }

  Future<void> startAudioRecording() async {
    final hasPermission = await _multimodalManager.hasAudioPermission();
    if (!hasPermission) {
      state = state.copyWith(errorMessage: 'Microphone permission denied');
      return;
    }
    final path = await _multimodalManager.startAudioRecording();
    if (path != null) {
      state = state.copyWith(isRecordingAudio: true);
    }
  }

  Future<void> stopAudioRecording() async {
    final input = await _multimodalManager.stopAudioRecording();
    state = state.copyWith(isRecordingAudio: false);
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  void removeAttachment(int index) {
    final attachments = List<MultimodalInput>.from(state.attachments);
    if (index >= 0 && index < attachments.length) {
      attachments.removeAt(index);
      state = state.copyWith(attachments: attachments);
    }
  }

  void clearAttachments() {
    state = state.copyWith(attachments: []);
  }

  void sendGreeting() {
    final greeting = currentL10n().chatGreeting;
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel(greeting, ChatRole.assistant),
      ],
    );
  }

  Future<void> generateResponse(String prompt) async {
    if (prompt.isEmpty || state.isLoading) return;

    // ⚠️ 这里**曾经**有个守卫：`mode == ChatMode.litert && isLitertReady`。
    // 那两个条件说的都是**本地** LiteRT 引擎 ⇒ 没装本地模型的设备上
    // **一条消息都发不出去**（函数直接返回，什么都不发生）。
    //
    // 现在本地 LiteRT 已下线，移动端**只有端脑一条链路** ——
    // 「所有通信都要走 大脑 → 端脑 → 叶区」这条规则在移动端也成立。
    await _sendToTelencephalon(prompt);
  }

  /// 带附件的发送。
  ///
  /// 端脑那条链路（`/shadow/v1/conversations`）**只处理纯文本** ——
  /// 本地 LiteRT 已下线，附件没有第二条路可走。
  ///
  /// 所以这里**任何**附件都直接明确报错，而不是把消息悄悄丢掉
  /// （否则用户会以为消息发出去了，其实根本没发）。
  Future<void> generateResponseWithAttachments(
    String prompt,
    List<MultimodalInput> attachments,
  ) async {
    if (state.isLoading) return;
    if (attachments.isNotEmpty) {
      state = state.copyWith(
        errorMessage: currentL10n().chatAttachmentNotAvailable,
        errorMessageL10nKey: ChatStateL10nKey.errorAttachmentNotAvailable,
      );
      return;
    }
    await _sendToTelencephalon(prompt);
  }

  /// 真正把一条消息送进「大脑 → 端脑 → 叶区」。
  ///
  /// 移动端**只有这一条路**（端脑方言 `/shadow/v1/conversations`）。
  /// 本地 LiteRT 已下线 ⇒ 这里**没有**第二条路：端脑不通就是不通，
  /// **直接把错误抛给用户**，不要静默回退 ——
  /// 静默回退的年代，本地引擎其实**从来没起来过**（`_getModelPath()`
  /// 给的是文件路径，Kotlin 那边要的是目录），用户看到的只是一条
  /// 「已就绪」的红横幅和一句永远等不来的回复。
  Future<void> _sendToTelencephalon(String prompt) async {
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel(prompt, ChatRole.user),
      ],
      isLoading: true,
      errorMessage: null,
    );

    try {
      // 端脑（嵌入式大脑）侧的会话 —— `/shadow/v1/conversations`。
      //
      // 与桌面端同一条链路：桌面端的 `ConversationPage.tsx` 也是
      // `createConversation` + `streamMessage`，人设提示词走
      // `createConversation({ system })`。
      final sessionId =
          _currentSessionId ??
          (await _telencephalonClient.createConversation(
            systemPrompt: _systemPromptProvider(),
          )).id;
      _currentSessionId = sessionId;
      state = state.copyWith(sessionId: sessionId);

      final buffer = StringBuffer();
      state = state.copyWith(streamingText: '');

      await for (final event in _telencephalonClient.streamMessage(
        sessionId,
        SendMessageRequest(text: prompt),
      )) {
        switch (event.type) {
          case 'delta':
            final delta = event.delta ?? '';
            if (delta.isEmpty) break;
            buffer.write(delta);
            state = state.copyWith(streamingText: buffer.toString());
            break;
          case 'error':
            throw Exception(event.error ?? currentL10n().chatSorryErrorShort);
          default:
            // tool_call / tool_result / route / handoff / step 等
            // 进度事件：移动端目前不渲染，先记一条日志。
            _log.fine('stream event: ${event.type}');
        }
      }

      final response = buffer.toString();
      if (response.isEmpty) {
        throw Exception(currentL10n().chatSorryErrorShort);
      }

      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessageModel(response, ChatRole.assistant),
        ],
        isLoading: false,
        attachments: [],
        streamingText: '',
      );
      await _ttsEngine.speak(response);
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Error: $e',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        errorMessageArg: e.toString(),
        messages: [
          ...state.messages,
          ChatMessageModel('Error: $e', ChatRole.system),
        ],
        isLoading: false,
        attachments: [],
        streamingText: '',
      );
    }
  }

  Future<void> speakLastResponse() async {
    final lastAssistant = state.messages.lastWhere(
      (m) => m.role == ChatRole.assistant,
      orElse: () => ChatMessageModel('', ChatRole.assistant),
    );
    if (lastAssistant.content.isNotEmpty) {
      await _ttsEngine.speak(lastAssistant.content);
    }
  }

  Future<void> playVoiceMessage(int index) async {
    if (index < 0 || index >= state.messages.length) return;
    final message = state.messages[index];
    if (message.attachmentType != MultimodalInputType.voice &&
        message.attachmentType != MultimodalInputType.audio) {
      return;
    }
    await _ttsEngine.speak(
      message.content.isNotEmpty ? message.content : 'Audio message',
    );
  }

  /// 清空当前对话。
  ///
  /// **不再**释放本地引擎（本地 LiteRT 已下线）——以前这里
  /// `release()` 掉引擎再 `_initLiteRT()` 重来一遍。
  ///
  /// 也**不**销毁多模态管理器：它的 `dispose()` 会把录音器关掉，
  /// 而这个管理器是被复用的 —— 销毁一次之后语音录制就永久失灵了。
  /// 会话 id 一并清掉，下一条消息在端脑侧开一个**新会话**。
  Future<void> reset() async {
    _currentSessionId = null;
    state = const ChatState();
  }

  void clearError() {
    state = state.copyWith(errorMessage: null);
  }
}

/// Provider for TtsEngine
final ttsEngineProvider = Provider<TtsEngine>((ref) {
  return TtsEngine();
});

/// Provider for ChatNotifier
final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(ttsEngineProvider),
    ref.watch(telencephalonClientProvider),
    // 人设：提示词设置页存的那份（没设置就用默认人设）。
    // 用 read 而不是 watch —— 改人设不该重建 ChatNotifier（会把当前对话冲掉）。
    systemPromptProvider: () =>
        ref.read(customPromptProvider) ?? MainAgentPrompt.defaultSystemPrompt,
  );
});

/// Provider for MultimodalInputManager
final multimodalInputManagerProvider = Provider<MultimodalInputManager>((ref) {
  return MultimodalInputManager();
});
