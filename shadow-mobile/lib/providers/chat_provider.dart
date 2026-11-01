import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import '../tts_engine.dart';
import '../multimodal/multimodal.dart';
import '../services/telencephalon/telencephalon_client.dart';
import '../services/client_tools/client_tool_registry.dart';
import 'conversation_mode_provider.dart';
import 'telencephalon_provider.dart';
import 'theme_provider.dart';
import '../l10n/current_l10n.dart';
import '../agents/main_agent/main_agent_prompt.dart';
import '../agents/providers/agent_provider.dart';

/// Chat message model for the UI
class ChatMessageModel {
  final String content;
  final ChatRole role;
  final String? attachmentPath;
  final MultimodalInputType? attachmentType;

  /// 这条消息其实是**一张工具调用卡片**（不是文字气泡）。
  ///
  /// 端脑让客户端干活时（换主题之类），对话流里插入一条 `role=assistant`
  /// 但 `content` 为空、带着 [toolCall] 的消息 —— UI 渲染成卡片。
  final ToolCallModel? toolCall;

  ChatMessageModel(
    this.content,
    this.role, {
    this.attachmentPath,
    this.attachmentType,
    this.toolCall,
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

  /// 当前会话的**叶区名**（端脑的 ~agent~）。
  ///
  /// ⚠️ 它只是**副标签** —— 会话的「身份」是标题（从
  /// ~messages~ 派生，见 ~lib/utils/conversation_title.dart~），
  /// 端脑那份数据里**没有标题字段**。
  final String? activeConversationAgent;

  /// **切会话失败**时记下打不开的是**哪一条**（会话 id）。
  ///
  /// ⚠️ 它同时是**闸门**：非空 ⇒ ~canChat~ 为假 ⇒ ⇒ 切失败之后
  /// **不许再往别的会话里写消息** ⇒ ⇒ 否则用户以为自己在 B、
  /// 消息却落进 A ⇒ ⇒ **消息落错会话**（它看起来是成功的 ⇒ 比
  /// 「发不出去」严重得多）。
  final String? failedSwitchSessionId;

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
    this.activeConversationAgent,
    this.failedSwitchSessionId,
  });

  /// 能不能发消息。
  ///
  /// 移动端**只有端脑一条链路**（`/shadow/v1/*` → 嵌入式大脑 → 端脑 → 叶区），
  /// 本地 LiteRT 已下线 ⇒ 没有任何「本地引擎就绪」的前置条件。
  ///
  /// ⚠️ 这里**曾经**是 `isInitialized || isLitertReady || mode == ChatMode.off`
  /// —— 前两个都是**本地引擎**的状态 ⇒ 没装本地模型的设备上**输入框整个
  /// 是禁用的**，移动端对话页一条消息都发不出去（`425e666` 修过一次）。
  /// ⇒ ⇒ **别再拿「本地引擎状态」当可用性判据**。
  ///
  /// ✅ 现在只剩**一个**前置条件：**当前会话的身份是确定的**
  /// ⇒ ⇒ 判据 = 「上一次切会话**没有失败**」。
  ///
  /// ⚠️ 为什么切失败就不许写：切失败 ⇒ **没有换会话**（界面上的还是
  /// 上一条）⇒ ⇒ 而用户以为他已经换过去了 ⇒ ⇒ 再写下去，消息会落进
  /// **另一条**会话 ⇒ ⇒ **消息落错会话**（它看起来是成功的）。
  /// ⇒ ⇒ 用户明确「关掉错误横幅」= 接受留在当前这条 ⇒ 那时闸门打开
  /// （见 `clearError()`）。
  bool get canChat => failedSwitchSessionId == null;

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
    // ⚠️ 用哨兵才能把它**置空** —— 「草稿会话」（还没在端脑建）就是
    // 「没有 session id」⇒ ⇒ 而 `sessionId ?? this.sessionId` 永远清不掉。
    Object? sessionId = _omit,
    Object? activeConversationAgent = _omit,
    Object? failedSwitchSessionId = _omit,
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
      sessionId: identical(sessionId, _omit)
          ? this.sessionId
          : sessionId as String?,
      activeConversationAgent: identical(activeConversationAgent, _omit)
          ? this.activeConversationAgent
          : activeConversationAgent as String?,
      failedSwitchSessionId: identical(failedSwitchSessionId, _omit)
          ? this.failedSwitchSessionId
          : failedSwitchSessionId as String?,
    );
  }
}

class _CopyWithOmit {
  const _CopyWithOmit();
}

/// 等用户点头的一次工具调用。
class _PendingToolCall {
  final String sessionId;
  final ToolCallModel model;
  final ClientTool tool;

  const _PendingToolCall({
    required this.sessionId,
    required this.model,
    required this.tool,
  });
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

  /// 客户端工具注册表 —— 端脑让**这台设备**干的活（换主题之类）。
  ///
  /// 与端脑本地工具的分工：端脑本地工具改端脑自己的状态，客户端工具
  /// 改**用户眼前这台设备**的状态。
  final ClientToolRegistry _clientTools;

  /// 等用户点头的工具调用（调用 id → 这次调用的上下文）。
  ///
  /// 用户点「允许」之后要能接着执行 ⇒ 光有卡片不够，得把
  /// 「会话 id + 参数 + 工具」一起留着。
  final Map<String, _PendingToolCall> _pendingToolCalls = {};

  /// 客户端合成调用 id 用的计数器。
  ///
  /// 端脑**会带**调用 id（`tool_call_id`，端脑生成的 uuid）⇒ 这个计数器
  /// 只是**兜底**：端脑没带（老端脑）时客户端自己造一个。
  /// 用**单调递增**的序号而不是随机串：同一次会话里序号唯一就够，
  /// 而且卡片按 id 排序时是稳定的（随机串会让卡片顺序看起来乱跳）。
  int _toolCallCounter = 0;

  /// 端脑侧的会话 id（`/shadow/v1/conversations/{id}`）。
  String? _currentSessionId;

  ChatNotifier(
    this._ttsEngine,
    this._telencephalonClient, {
    String? Function()? systemPromptProvider,
    ClientToolRegistry? clientTools,
  }) : _systemPromptProvider = systemPromptProvider ?? noSystemPrompt,
       _clientTools = clientTools ?? ClientToolRegistry(),
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
    // ⚠️ **闸门（漏斗就在这儿）**：上一次切会话失败了 ⇒ 现在**不知道自己在
    // 哪条会话里** ⇒ ⇒ 不许写 ⇒ ⇒ 否则用户以为自己在 B、消息却落进 A
    // ⇒ ⇒ **消息落错会话**（它看起来是成功的）。
    // ⚠️ 原来的错误横幅**留着**（它已经说明了为什么）⇒ 别用新文案盖掉它。
    // ⚠️ 这一层是**兜底**：界面本来就用 ~canChat~ 把输入框禁了 ⇒
    // ⇒ 但守卫放在**漏斗**上 ⇒ 所有入口都归它管（一条规则、一处实现）。
    if (state.failedSwitchSessionId != null) return;

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
      String sessionId;
      String? createdAgent;
      final existing = _currentSessionId;
      if (existing != null) {
        sessionId = existing;
      } else {
        final created = await _telencephalonClient.createConversation(
          systemPrompt: _systemPromptProvider(),
        );
        sessionId = created.id;
        createdAgent = created.agent;
      }
      _currentSessionId = sessionId;
      state = state.copyWith(sessionId: sessionId);
      if (createdAgent != null) {
        state = state.copyWith(activeConversationAgent: createdAgent);
      }

      final buffer = StringBuffer();
      state = state.copyWith(streamingText: '');

      // 这一轮有没有发生工具调用。
      //
      // 端脑让客户端干完活之后**可能不再说话**（这一轮就只有一次工具
      // 调用）—— 那时候「空回复」不是错误，工具卡片本身就是回复。
      var toolCallSeen = false;

      await for (final event in _telencephalonClient.streamMessage(
        sessionId,
        SendMessageRequest(
          text: prompt,
          // **这台设备能跑的工具**告诉模型 —— 端脑透传给 LLM，模型才知道
          // `set_theme` 要吃一个 `color`。
          tools: toOpenAiTools(_clientTools),
          // 让端脑**等**这台设备把工具干完 —— 它就能把结果喂回模型，
          // 在**同一条流**上接着说「主题已经换成靛蓝了」⇒ 用户看到的
          // 是一个回合，而不是一张沉默的卡片。
          awaitToolResult: true,
        ),
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
          case 'tool_call':
            // 端脑让**这台设备**干活（换主题之类）。
            //
            // 这是「模型自己让客户端换主题」这条产品线的客户端一半：
            // 端脑只负责**点名**（工具名 + 参数），真正干活的是客户端，
            // 干完再把结果回传端脑，模型才知道主题换好了。
            toolCallSeen = true;
            await _handleToolCall(sessionId, event);
            break;
          default:
            // tool_result / route / handoff / step 等进度事件：
            // 移动端目前不渲染，先记一条日志。
            _log.fine('stream event: ${event.type}');
        }
      }

      final response = buffer.toString();
      if (response.isEmpty && !toolCallSeen) {
        throw Exception(currentL10n().chatSorryErrorShort);
      }

      state = state.copyWith(
        messages: [
          ...state.messages,
          // 空回复 + 有工具调用 ⇒ 不插一条空气泡（工具卡片已经在了）。
          if (response.isNotEmpty)
            ChatMessageModel(response, ChatRole.assistant),
        ],
        isLoading: false,
        attachments: [],
        streamingText: '',
      );
      if (response.isNotEmpty) {
        await _ttsEngine.speak(response);
      }
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

  /// 切到**已有的**端脑会话，并把它的历史装进当前对话流。
  ///
  /// ⚠️ 为什么以前切不了：移动端只有**一条**会话（`_currentSessionId`）
  /// ⇒ 会话列表页点开任何一条历史会话，**看到的还是当前那条**
  /// ⇒ 「点了一下像切了会话，实际没切」⇒ **失败长得像成功**。
  /// 而且那个 `sessionId` 是 `context.push(..., extra: {...})` 带过去的，
  /// 路由**压根没读**（⇒ 带过去就丢了）。
  ///
  /// 现在：`_currentSessionId` 指向它 + 历史消息填进 `messages`
  /// ⇒ 下一条消息**续在它上面**（端脑那边也是同一个会话 id）。
  Future<bool> switchTo(String sessionId) async {
    if (sessionId.isEmpty) return false;
    try {
      final conversation = await _telencephalonClient.getConversation(sessionId);
      _currentSessionId = conversation.id;
      state = state.copyWith(
        sessionId: conversation.id,
        // 当前会话的**叶区名**（副标签）。会话的「身份」是标题 ——
        // 标题从 ~state.messages~ 派生（屏幕上真正显示的那些消息）⇒ ⇒
        // 界面显示的这条，与下一条消息会落进去的那条，**必然是同一条**。
        activeConversationAgent: conversation.agent,
        // 切成功了 ⇒ 上一次的失败**作废** ⇒ 闸门打开。
        failedSwitchSessionId: null,
        // ⚠️ **人设轮次不画成气泡** —— 端脑把会话的**人设**存成第一条轮次
        // （`role=agent` + `[system] ` 前缀）⇒ 它是**配置**，不是对话 ⇒
        // 原样画出来 ⇒ 用户看到自己的配置原文被当成大脑发言顶在最上面。
        // 口径与服务端一致：`history_of()` 喂模型时也**只跳人设**。
        messages: conversation.history
            .where((t) => !t.isSystemTurn)
            .map(_messageFromTurn)
            .toList(),
        isLoading: false,
        streamingText: '',
        errorMessage: null,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Error: $e',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        errorMessageArg: e.toString(),
        // ⚠️ **不换会话**（当前会话原样留着）⇒ ⇒ 但**记下打不开的是哪条**
        // ⇒ ⇒ ~canChat~ 变假 ⇒ ⇒ 切失败之后**不许再往别的会话里写**
        // ⇒ ⇒ 否则用户以为自己在 B、消息却落进 A ⇒ **消息落错会话**。
        // ⚠️ 界面同时显示的仍是**当前**那条（标题从 ~state.messages~ 派生）
        // ⇒ ⇒ 用户看得见自己还在哪儿 ⇒ ⇒ 这不是「静默」，是「说真话」。
        failedSwitchSessionId: sessionId,
      );
      return false;
    }
  }

  /// 开一条**新的**会话 —— **草稿**：先只在客户端存在，**真有话说**了才在端脑建。
  ///
  /// ⚠️ 为什么不能「点了就建」（2026-11-01 实测端脑的路由表）：
  /// 端脑的 shadow API **没有删会话的端点**（`telencephalon/src/api/shadow.rs`
  /// 的路由表只有 list / create / get / messages / messages:stream /
  /// tool-results / import ⇒ **没有 DELETE**）⇒ ⇒ 每点一次「新对话」就往
  /// 端脑塞一条**空**会话 ⇒ ⇒ 而空会话会**落盘**（`FilePersistence` 写
  /// `conversations.json` ⇒ 活过 App 重启）⇒ ⇒ 用户点完「新对话」又返回，
  /// 那条空会话就**永久留在列表里**，而且**删不掉** ⇒ ⇒ 列表被自己的
  /// 垃圾填满 ⇒ ⇒ 「管理多个会话」被「新对话」这个按钮堵住。
  ///
  /// ✅ 现在：**草稿**只在客户端存在 ⇒ 第一条消息发出时才在端脑建
  /// （走 `_sendToTelencephalon` 里**已有**的「没有当前会话 ⇒ 先建一条」
  /// 那条路 ⇒ 人设照旧带上）⇒ ⇒ 点「新对话」又返回 ⇒ 端脑**什么都没多**。
  ///
  /// ⚠️ 顺带：草稿**还没有**服务端会话 ⇒ ⇒ 对话页那行「当前会话」不画
  /// （`sessionId == null`）—— 没有会话可指 ⇒ 等第一条消息把它建出来，
  /// 那行自己会出现 ⇒ ⇒ 那时标题 = 用户自己说的第一句话。
  Future<bool> startNewConversation() async {
    // ⚠️ **不在端脑建会话** —— 见上面那段「为什么」。
    _currentSessionId = null;
    state = state.copyWith(
      // 草稿**还没有**服务端会话 ⇒ ⇒ 这两样要**清空**（不是沿用上一条）。
      sessionId: null,
      activeConversationAgent: null,
      // 新开一条 ⇒ 上一次切会话的失败**作废** ⇒ 闸门打开。
      failedSwitchSessionId: null,
      messages: const [],
      isLoading: false,
      streamingText: '',
      errorMessage: null,
    );
    return true;
  }

  /// 端脑的轮次角色 → 客户端的气泡角色。
  ///
  /// ⚠️ 线上是 `TurnRole` 的小写名：**`user` / `agent`**
  /// —— **不是** `assistant` ⇒ 只认 `assistant` 的话，
  /// **每一句**助手回复都会被画成「系统消息」气泡。
  ChatMessageModel _messageFromTurn(ConversationTurn turn) => ChatMessageModel(
    // 工具结果那轮带 `[tool_result] ` 前缀 ⇒ 那是**协议内部标记**：
    // 用户该看见「工具跑过了」，不该看见前缀本身 ⇒ 剥掉。
    turn.bodyText,
    switch (turn.role) {
      'user' => ChatRole.user,
      'agent' || 'assistant' => ChatRole.assistant,
      _ => ChatRole.system,
    },
  );

  // ---- 客户端工具（端脑让这台设备干的活）-------------------------------

  /// 处理端脑发来的 `tool_call`。
  ///
  /// 端脑只负责**点名**（工具名 + 参数）；真正干活的是这台设备，
  /// 干完再把结果回传端脑 —— 端脑把它喂回模型，模型才知道
  /// 「主题已经换好了」，否则模型会一直等一个不来的结果。
  Future<void> _handleToolCall(String sessionId, StreamEvent event) async {
    final name = event.name;
    if (name == null || name.isEmpty) {
      _log.warning('tool_call event without a name — ignored');
      return;
    }
    final args = event.args ?? <String, dynamic>{};

    // 端脑**带**调用 id（`tool_call_id`）⇒ 直接用端脑那个，
    // 这样「卡片」和「结果回传」能和端脑那边对上号；
    // 端脑没带（老端脑）时才自己合成一个兜底。
    final callId =
        event.toolCallId ?? 'client-tool-${_toolCallCounter++}-$name';

    final tool = _clientTools.lookup(name);
    final model = ToolCallModel(
      id: callId,
      name: name,
      description: tool?.description,
      args: args,
    );
    _upsertToolCall(model);

    if (tool == null) {
      // 端脑点了一个这台设备不会的活。**明确失败并回传** ——
      // 闷着不吭声的话，模型会一直等一个永远不来的结果。
      _upsertToolCall(
        model.copyWith(
          status: ToolCallStatus.failed,
          errorText: 'unsupported tool: $name',
        ),
      );
      unawaited(
        _reportToolResult(
          sessionId,
          callId,
          name,
          ok: false,
          result: <String, dynamic>{'error': 'unsupported tool'},
        ),
      );
      return;
    }

    if (tool.requiresApproval) {
      final pending = model.copyWith(
        status: ToolCallStatus.awaitingApproval,
      );
      _pendingToolCalls[callId] = _PendingToolCall(
        sessionId: sessionId,
        model: pending,
        tool: tool,
      );
      _upsertToolCall(pending);
      return;
    }

    // 执行 + 回传**不阻塞** SSE 读循环 —— 回传是个 HTTP 请求，
    // 端脑还没上这个端点时会 404；拖着读循环不放会让整条对话卡住。
    //
    // 回传是**独立的一条 HTTP 连接**，与 SSE 无关 ⇒ 端脑那头在同一条
    // 流里等着结果（将来端脑支持了 (c)）时，这个 POST 照样立刻到。
    unawaited(
      _runToolCall(
        sessionId: sessionId,
        callId: callId,
        tool: tool,
        args: args,
      ),
    );
  }

  /// 执行一个客户端工具，然后把结果回传端脑。
  Future<void> _runToolCall({
    required String sessionId,
    required String callId,
    required ClientTool tool,
    required Map<String, dynamic> args,
  }) async {
    final current = _toolCallById(callId);
    if (current != null) {
      _upsertToolCall(current.copyWith(status: ToolCallStatus.running));
    }

    final watch = Stopwatch()..start();
    Object? result;
    String? errorText;
    var ok = true;
    try {
      result = await tool.execute(args);
    } catch (e) {
      ok = false;
      errorText = e.toString();
    }
    final elapsed = watch.elapsedMilliseconds;

    final base =
        _toolCallById(callId) ??
        ToolCallModel(id: callId, name: tool.name, args: args);
    _upsertToolCall(
      base.copyWith(
        status: ok ? ToolCallStatus.succeeded : ToolCallStatus.failed,
        result: result,
        errorText: errorText,
        latencyMs: elapsed,
      ),
    );

    await _reportToolResult(
      sessionId,
      callId,
      tool.name,
      ok: ok,
      result: result ?? <String, dynamic>{'error': errorText},
    );
  }

  /// 把执行结果回传端脑。
  ///
  /// 回传失败**不能**把整条对话带崩 —— 工具在本地已经做完了，
  /// 用户看到的结果是真的；只是端脑那头模型还在等。这两件事
  /// 在卡片上分开显示（[ToolCallModel.reported] /
  /// [ToolCallModel.reportErrorText]）。
  Future<void> _reportToolResult(
    String sessionId,
    String callId,
    String name, {
    required bool ok,
    required Object? result,
  }) async {
    try {
      await _telencephalonClient.reportToolResult(
        sessionId,
        name: name,
        toolCallId: callId,
        result: result,
        ok: ok,
      );
      final base =
          _toolCallById(callId) ?? ToolCallModel(id: callId, name: name);
      _upsertToolCall(base.copyWith(reported: true));
    } catch (e) {
      _log.warning('tool result report failed for $name: $e');
      final base =
          _toolCallById(callId) ?? ToolCallModel(id: callId, name: name);
      _upsertToolCall(
        base.copyWith(reportErrorText: 'not reported to telencephalon: $e'),
      );
    }
  }

  /// 用户点了「允许」—— 执行这个工具并把结果回传端脑。
  Future<void> approveToolCall(String callId) async {
    final pending = _pendingToolCalls.remove(callId);
    if (pending == null) return;
    await _runToolCall(
      sessionId: pending.sessionId,
      callId: callId,
      tool: pending.tool,
      args: pending.model.args,
    );
  }

  /// 用户点了「拒绝」—— 把拒绝本身回传端脑，
  /// 模型才知道这条路走不通（而不是干等着）。
  Future<void> denyToolCall(String callId) async {
    final pending = _pendingToolCalls.remove(callId);
    if (pending == null) return;
    _upsertToolCall(
      pending.model.copyWith(
        status: ToolCallStatus.failed,
        errorText: 'denied by user',
      ),
    );
    await _reportToolResult(
      pending.sessionId,
      callId,
      pending.tool.name,
      ok: false,
      result: <String, dynamic>{'error': 'denied by user'},
    );
  }

  /// 把工具调用的最新状态写回对话流里那张卡片。
  void _upsertToolCall(ToolCallModel model) {
    // ⚠️ 工具是在**后台**跑的（执行 + 回传不阻塞 SSE 读循环）。
    // 用户在工具跑完之前离开页面 ⇒ notifier 已经被 dispose ⇒
    // 这时候再写 `state` 会抛「Bad state: Tried to modify a disposed
    // provider」。所以每次写之前先看一眼自己还在不在。
    if (!mounted) return;
    final messages = List<ChatMessageModel>.from(state.messages);
    final index = messages.indexWhere((m) => m.toolCall?.id == model.id);
    if (index >= 0) {
      final existing = messages[index];
      messages[index] = ChatMessageModel(
        existing.content,
        existing.role,
        attachmentPath: existing.attachmentPath,
        attachmentType: existing.attachmentType,
        toolCall: model,
      );
    } else {
      messages.add(ChatMessageModel('', ChatRole.assistant, toolCall: model));
    }
    state = state.copyWith(messages: messages);
  }

  /// 按调用 id 找到对话流里那张工具卡片。
  ToolCallModel? _toolCallById(String id) {
    // ⚠️ 读 `state` 在 dispose 之后**也会抛**（不只是写）。
    // 工具在后台跑，用户可能已经离开页面了 ⇒ 先看自己在不在。
    if (!mounted) return null;
    for (final message in state.messages) {
      final call = message.toolCall;
      if (call != null && call.id == id) return call;
    }
    return null;
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
    state = state.copyWith(
      errorMessage: null,
      // ⚠️ 关掉横幅 = 用户明确接受「我就留在当前这条会话里」⇒ ⇒ 闸门打开
      // ⇒ ⇒ 这时候界面必须**显示当前会话**（标题从 ~state.messages~ 派生）
      // ⇒ ⇒ 「消息落到哪条会话」依然不靠猜。
      failedSwitchSessionId: null,
    );
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
    // 客户端工具 —— 端脑让**这台设备**干的活。
    //
    // 主题色 / 明暗走的是**用户的外观偏好** provider，和设置页改的
    // 是同一份 ⇒ 模型让手机换主题，换完设置页里也是同一个值。
    clientTools: buildMobileClientTools(
      setAccentColor: (color) =>
          ref.read(themeAppearanceProvider.notifier).setAccentColor(color),
      setDarkMode: (dark) async => ref
          .read(themeModeProvider.notifier)
          .setThemeMode(dark ? ThemeMode.dark : ThemeMode.light),
    ),
  );
});

/// Provider for MultimodalInputManager
final multimodalInputManagerProvider = Provider<MultimodalInputManager>((ref) {
  return MultimodalInputManager();
});
