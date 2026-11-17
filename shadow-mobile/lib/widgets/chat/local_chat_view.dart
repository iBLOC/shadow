import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';
import '../../utils/conversation_title.dart';
import '../../utils/chat_quote.dart';
import '../../providers/conversation_mode_provider.dart';
import '../../utils/chat_state_l10n.dart';
import '../../utils/chat_debug_json.dart';
import '../../theme/app_colors.dart';
import '../../multimodal/multimodal.dart';
import '../../widgets/chat_bubble.dart';
import 'a2ui_inline_block.dart';
import 'message_bubbles.dart';
import 'tool_call_card.dart';
import 'unified_input_bar.dart';
import 'camera_preview.dart';
import 'message_action_sheet.dart';
import 'image_action_sheet.dart';

/// Local chat view for on-device inference
class LocalChatView extends ConsumerStatefulWidget {
  final ChatState chatState;
  final AppLocalizations l10n;
  final bool isDark;
  final ScrollController scrollController;
  final TextEditingController promptController;
  final VoidCallback onSendMessage;
  final VoidCallback onSpeak;
  final VoidCallback onPickImage;
  final VoidCallback onCaptureImage;
  final VoidCallback onPickFile;
  final VoidCallback onStartAudioRecording;

  /// 松手 ⇒ 结束录音。[cancel] 为真表示**放弃**（按住时滑到两侧松手）。
  final Future<void> Function(bool cancel) onFinishRecording;

  /// 相机钮**长按** ⇒ 拍视频（轻触是拍照片）。
  final VoidCallback onCaptureVideo;

  const LocalChatView({
    super.key,
    required this.chatState,
    required this.l10n,
    required this.isDark,
    required this.scrollController,
    required this.promptController,
    required this.onSendMessage,
    required this.onSpeak,
    required this.onPickImage,
    required this.onCaptureImage,
    required this.onPickFile,
    required this.onStartAudioRecording,
    required this.onFinishRecording,
    required this.onCaptureVideo,
  });

  @override
  ConsumerState<LocalChatView> createState() => _LocalChatViewState();
}

class _LocalChatViewState extends ConsumerState<LocalChatView> {
  /// 当前会话那行字：**标题 · 叶区名**。
  ///
  /// ⚠️ 标题 = **第一条用户发言**（`deriveConversationTitle`）⇒ ⇒
  /// 它就是**屏幕上**这条会话的话题 ⇒ ⇒ 规则只有一份
  /// （`lib/utils/conversation_title.dart`）⇒ ⇒ 列表页与对话页**不会分叉**。
  String _conversationLabel(ChatState state, AppLocalizations l10n) {
    final title = _firstUserMessage(state.messages);
    final agent = state.activeConversationAgent;
    final head = title ?? l10n.conversationNewSession;
    if (agent == null || agent.isEmpty) return head;
    return '$head · $agent';
  }

  /// 第一条**用户**发言 —— 会话的标题就是它。
  String? _firstUserMessage(List<ChatMessageModel> messages) {
    for (final m in messages) {
      if (m.role != ChatRole.user) continue;
      final title = deriveConversationTitle(m.content);
      if (title != null) return title;
    }
    return null;
  }

  /// HH:mm（24 小时制）—— 与桌面端
  /// `toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`
  /// 同一条口径。手动拼，不拉 DateFormat（省掉 locale data 初始化）。
  String _formatMessageTime(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final chatState = widget.chatState;
    final isDark = widget.isDark;
    final l10n = widget.l10n;
    final convState = ref.watch(conversationModeProvider);
    final isConversationMode = convState.mode == ConversationMode.conversation;

    return Column(
      children: [
        // Error banner
        //
        // ⚠️ 长按横幅 ⇒ 毛玻璃菜单（复制原始错误 / 重试上次发送 /
        // 撤销＝关掉横幅）。右侧的关闭按钮照旧 —— 长按是加法，不是替代。
        if (chatState.errorMessage != null)
          GestureDetector(
            onLongPress: () => _showErrorActions(context),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: (isDark ? AppColors.error : AppColors.errorLight)
                    .withValues(alpha: 0.2),
                border: Border(
                  bottom: BorderSide(
                    color: isDark
                        ? AppColors.darkBorder
                        : AppColors.lightBorder,
                  ),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline, color: AppColors.error, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      chatState.displayErrorMessage(l10n) ??
                          chatState.errorMessage!,
                      style: TextStyle(color: AppColors.error, fontSize: 12),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    // ⚠️ 这里**曾经**是一个**空闭包**（注释写着
                    // "This will be handled by the parent"）——
                    // 但父级从来没处理 ⇒ 横幅**关不掉**，它会一直挂在
                    // 对话页顶上。
                    //
                    // `ChatNotifier.clearError()` 之前是**零调用方**的死方法，
                    // 现在接上了。
                    onPressed: () =>
                        ref.read(chatProvider.notifier).clearError(),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    color: AppColors.error,
                  ),
                ],
              ),
            ),
          ),
        // 当前是**哪条会话**。
        //
        // ⚠️ 端脑的会话**没有标题字段** ⇒ 标题是客户端**派生**的 ⇒ ⇒
        // 多会话里唯一的身份线索就是它 ⇒ ⇒ 不显示它 ⇒ 用户根本不知道
        // 自己在哪条会话里 ⇒ ⇒ 「消息落到哪条会话」成了一件**用户猜**的事。
        //
        // ✅ 关键：标题从 ~state.messages~（**屏幕上真正显示的那些消息**）
        // 派生 ⇒ ⇒ 而不是另存一份 ⇒ ⇒ 界面显示的这条，与「下一条消息会
        // 落进去的那条」，**必然是同一条** ⇒ ⇒ 不变量是**结构上**成立的。
        //
        // ⚠️ 切会话失败时这里显示的**仍然是旧那条**（失败就不换）⇒ ⇒
        // 用户看得见自己还在哪儿 ⇒ ⇒ 而输入框同时被禁用（~canChat~）
        // ⇒ ⇒ 在他明确承认之前，不会有消息落进**别的**会话。
        if (chatState.sessionId != null)
          Padding(
            key: const ValueKey('active-conversation'),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                Icon(
                  Icons.forum_outlined,
                  size: 14,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.lightTextSecondary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _conversationLabel(chatState, l10n),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.lightTextSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        // Video preview (shown in conversation mode with camera enabled)
        if (isConversationMode && convState.videoState != VideoState.off)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                // Camera preview
                const CameraPreviewWrapper(),
                const SizedBox(width: 12),
                // Video status and controls
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.videocam,
                            size: 16,
                            color: AppColors.success,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            getVideoStatusText(convState.videoState),
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark
                                  ? AppColors.darkTextSecondary
                                  : AppColors.lightTextSecondary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      // Video control buttons
                      Row(
                        children: [
                          VideoControlButton(
                            icon: Icons.flip_camera_ios,
                            label: AppLocalizations.of(context)!.cameraFlip,
                            onPressed: () {
                              ref
                                  .read(conversationModeProvider.notifier)
                                  .flipCamera();
                            },
                          ),
                          const SizedBox(width: 8),
                          VideoControlButton(
                            icon: Icons.videocam_off,
                            label: AppLocalizations.of(context)!.cameraClose,
                            onPressed: () {
                              ref
                                  .read(conversationModeProvider.notifier)
                                  .toggleCamera();
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        // Message list
        Expanded(
          child: chatState.messages.isEmpty
              // 空状态**必须能滚动**。
              //
              // 为什么：键盘弹起后消息区（这个 `Expanded`）在**小屏横屏**
              // 上会被压到 0 高 —— 2026-10-31 真机（RK3566 / Android 11 /
              // 1280x720）实测报「BOTTOM OVERFLOWED BY 102 PIXELS」。
              //
              // 根因：`Center` 给子件的是**松约束**，而原来那个 `Column`
              // 是 `mainAxisSize: max` ⇒ 它取的是 `maxHeight`（= 0）⇒
              // 64(图标) + 16(间距) + 22(文字) = 102px 的内容正好溢出 102px，
              // 图标因此被画到输入栏上面。
              //
              // 修法（Flutter 官方那套「可滚动区里居中」的配方）：
              // `SingleChildScrollView` + `ConstrainedBox(minHeight)` ——
              // 有空间就居中，没空间就**滚动**，**任何情况下都不溢出**。
              ? LayoutBuilder(
                  builder: (context, constraints) => SingleChildScrollView(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.chat_bubble_outline,
                            size: 64,
                            color: isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.lightTextSecondary,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            l10n.startConversation,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(
                                  color: isDark
                                      ? AppColors.darkTextSecondary
                                      : AppColors.lightTextSecondary,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              : ListView.builder(
                  controller: widget.scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount:
                      chatState.messages.length +
                      (chatState.streamingText.isNotEmpty ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (chatState.streamingText.isNotEmpty &&
                        index == chatState.messages.length) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: MessageBubble(
                              key: const ValueKey('streaming'),
                              message: ChatMessage.assistant(
                                chatState.streamingText,
                              ),
                            ),
                          ),
                          const SizedBox(width: 40),
                        ],
                      );
                    }
                    final msg = chatState.messages[index];
                    final role = _convertRole(msg.role);
                    final isAssistant = msg.role == ChatRole.assistant;
                    final isVoice =
                        msg.attachmentType == MultimodalInputType.voice;
                    final isImage =
                        msg.attachmentType == MultimodalInputType.image ||
                        msg.attachmentType == MultimodalInputType.camera;
                    final isAudio =
                        msg.attachmentType == MultimodalInputType.audio;
                    final isVideo =
                        msg.attachmentType == MultimodalInputType.video;
                    final isFile =
                        msg.attachmentType == MultimodalInputType.file;
                    // 工具卡片不进长按菜单 —— 它是对话状态机的一半
                    // （授权/执行/回传都挂着号），撤/重试都会把它搅乱。
                    final isToolCard = msg.toolCall != null;
                    final bubble = Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: msg.toolCall != null
                              ? Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    ToolCallCard(call: msg.toolCall!),
                                    // ⚠️ **界面画在这条消息里** —— 不是顶部面板、
                                    // 不是另一个页面。
                                    // ⇒ 模型点名要的那块界面，就画在**它被点名的
                                    // 那一句话下面** ⇒ ⇒ 「对话里内联」。
                                    A2uiInlineBlock(call: msg.toolCall!),
                                  ],
                                )
                              : isVoice
                              ? VoiceMessageBubble(
                                  durationMs: null,
                                  onPlay: () => ref
                                      .read(chatProvider.notifier)
                                      .playVoiceMessage(index),
                                )
                              : isImage
                              ? ImageMessageBubble(
                                  imagePath: msg.attachmentPath,
                                  onTap: () {
                                    if (msg.attachmentPath != null) {
                                      debugPrint(
                                        'Image tapped: ${msg.attachmentPath}',
                                      );
                                    }
                                  },
                                  // ⚠️ **长按 ⇒ ⇒ 保存到相册 / 分享到微信**
                                  // （2026-11-17）—— 用户自己发进来的那张
                                  // 图**也能带走**。
                                  onLongPress: msg.attachmentPath == null
                                      ? null
                                      : () => showImageActionsForFile(
                                            context,
                                            msg.attachmentPath!,
                                          ),
                                )
                              : isAudio
                              ? AudioMessageBubble(
                                  onPlay: () => ref
                                      .read(chatProvider.notifier)
                                      .playVoiceMessage(index),
                                )
                              : isVideo
                              ? VideoMessageBubble(
                                  videoPath: msg.attachmentPath,
                                )
                              : isFile
                              ? FileMessageBubble(
                                  filePath: msg.attachmentPath,
                                  fileName: msg.content.isNotEmpty
                                      ? msg.content
                                      : null,
                                )
                              : MessageBubble(
                                  key: ValueKey(index),
                                  message: _toChatMessage(msg.content, role),
                                ),
                        ),
                        if (isAssistant &&
                            !isVoice &&
                            !isImage &&
                            !isVideo &&
                            !isFile &&
                            msg.toolCall == null)
                          IconButton(
                            icon: const Icon(Icons.volume_up, size: 20),
                            onPressed: widget.onSpeak,
                            tooltip: 'Speak response',
                          ),
                      ],
                    );
                    // ⚠️ 助手文本气泡的卡片下方带一行**读数**：时间 ＋
                    // token 速度／总量（服务端历史没有这份读数 ⇒ 只显时间，
                    // 不编数字）。工具卡片与附件气泡不是回复 ⇒ 不带。
                    final showMeta =
                        isAssistant &&
                        !isVoice &&
                        !isImage &&
                        !isAudio &&
                        !isVideo &&
                        !isFile;
                    final content =
                        showMeta
                            ? Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  bubble,
                                  // ⚠️ **AG-UI 承载的那块面** —— 画在这条消息下面
                                  // ⇒ ⇒ 不是顶部面板、不是另开一页。
                                  if (msg.a2uiSurfaceIds.isNotEmpty)
                                    A2uiSurfacesBlock(
                                      surfaceIds: msg.a2uiSurfaceIds,
                                    ),
                                  MessageMetaRow(
                                    timeText:
                                        msg.createdAt == null
                                            ? null
                                            : _formatMessageTime(
                                              msg.createdAt!,
                                            ),
                                    statsText:
                                        msg.tokenStats == null
                                            ? null
                                            : l10n.messageTokenStatsSummary(
                                              msg.tokenStats!.tokens,
                                              msg.tokenStats!.tokensPerSecond
                                                  .toStringAsFixed(1),
                                            ),
                                  ),
                                  // ⚠️ **「这次没朗读」就地看得见** ＋ 一个
                                  // 「仍要朗读」开关（用户 2026-11-16 原话：
                                  // 「回复的时候给个开关提示如果用户执意要
                                  // 打开也可以打开」）⇒ ⇒ 跳过不吞死（文字
                                  // 还在屏上），用户执意要听就能点。
                                  if (msg.ttsSkipped)
                                    _TtsSkippedRow(
                                      notice: l10n.ttsSkippedNotice(
                                        msg.ttsSkipReason ?? '',
                                      ),
                                      label: l10n.ttsSpeakAnyway,
                                      onSpeakAnyway: () => ref
                                          .read(chatProvider.notifier)
                                          .speakText(msg.content, force: true),
                                    ),
                                ],
                              )
                            : bubble;
                    if (isToolCard) {
                      // 工具卡片：**只给调试 JSON**（没有纯文本可复制，
                      // 撤/重试会搅乱状态机 —— 见上方注释）。工具卡片的
                      // 参数/结果恰恰是调试最缺的那一半，所以长按保留，
                      // 菜单按能力裁剪后只剩「复制为 JSON」与「取消」。
                      return GestureDetector(
                        onLongPress: () => _showMessageActions(
                          context,
                          index,
                          msg,
                          toolCard: true,
                        ),
                        child: bubble,
                      );
                    }
                    return GestureDetector(
                      onLongPress: () =>
                          _showMessageActions(context, index, msg),
                      child: content,
                    );
                  },
                ),
        ),
        // Input bar
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark
                ? AppColors.darkSurfaceGlass
                : AppColors.lightSurfaceGlass,
            border: Border(
              top: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
              ),
            ),
          ),
          child: SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Attachments preview
                if (chatState.attachments.isNotEmpty)
                  Container(
                    height: 60,
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: chatState.attachments.length,
                      itemBuilder: (context, index) {
                        final attachment = chatState.attachments[index];
                        return AttachmentChip(
                          type: attachment.type,
                          path: attachment.path ?? '',
                          // ⚠️ 这里**曾经**是一个 TODO 空闭包 ——
                          // 附件选了之后**删不掉**。
                          onRemove: () => ref
                              .read(chatProvider.notifier)
                              .removeAttachment(index),
                        );
                      },
                    ),
                  ),
                // ⚠️ **引用条** —— 长按气泡 ⇒ ⇒「引用」⇒ ⇒ 引用条出现在
                // 输入框**上方**（不是塞进输入框里的字）⇒ ⇒ 用户接着打的
                // 那句**不受打扰**⇒ ⇒ 要取消就点那个 ×。
                if (chatState.quotedMessage != null)
                  _QuoteBar(
                    quote: chatState.quotedMessage!,
                    authorLabel:
                        chatState.quotedMessage!.role == ChatRole.user
                        ? l10n.chatQuoteFromUser
                        : l10n.chatQuoteFromAssistant,
                    dismissLabel: l10n.chatQuoteDismiss,
                    onDismiss: () =>
                        ref.read(chatProvider.notifier).clearQuotedMessage(),
                  ),
                // ⚠️ **一个**输入框 —— 轻触打字、长按说话；文件入口挪到
                // 右边变成「＋」；相机钮轻触拍照、**长按录像**。
                //
                // ⚠️ 以前这一行是「附件钮 ＋ 键盘/麦克风切换钮 ＋（TextField
                // 或 VoiceInputView 二选一）＋ 发送钮」⇒ ⇒ 「我想说话」要先
                // **切模式**、再长按 ⇒ ⇒ 两步 ⇒ ⇒ 现在**一步**。
                UnifiedInputBar(
                  controller: widget.promptController,
                  enabled: chatState.canChat && !chatState.isLoading,
                  isLoading: chatState.isLoading,
                  hintText: l10n.tapToTypeHoldToTalk,
                  focusedHintText: l10n.askSomething,
                  recordingText: l10n.releaseToSend,
                  cancelText: l10n.releaseToCancel,
                  cancelZoneText: l10n.cancel,
                  cameraText: l10n.releaseToCamera,
                  galleryLabel: l10n.gallery,
                  fileLabel: l10n.file,
                  cameraLabel: l10n.photoOrVideo,
                  onSend: widget.onSendMessage,
                  onStartRecording: widget.onStartAudioRecording,
                  onFinishRecording: widget.onFinishRecording,
                  onPickImage: widget.onPickImage,
                  onPickFile: widget.onPickFile,
                  onCapturePhoto: widget.onCaptureImage,
                  onCaptureVideo: widget.onCaptureVideo,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ---- 长按毛玻璃菜单（消息 / 错误横幅）--------------------------------

  /// 长按一条消息 ⇒ 毛玻璃菜单（复制 / 复制为 JSON / 重试 / 撤销）。
  ///
  /// 动作按消息类型裁剪：
  /// - 复制：只有**有文字内容**的气泡给（附件气泡的内容是路径/空，
  ///   复制它没有意义）。⚠️ 工具卡片不给（`content` 本来就是空）。
  /// - 复制为 JSON：**所有消息都给**（含工具卡片）—— 这是给开发 agent
  ///   调试用的，它要看的恰恰是解析后的字段（工具参数/结果、token 读数、
  ///   会话 id），纯文本复制拿不到这些。
  /// - 重试：用户消息 ⇒ 从这条重来；助手消息 ⇒ 重新生成；
  ///   附件气泡与工具卡片不给。
  /// - 撤销：文本气泡都给；工具卡片整格不给（见上）。
  Future<void> _showMessageActions(
    BuildContext context,
    int index,
    ChatMessageModel msg, {
    bool toolCard = false,
  }) async {
    final l10n = AppLocalizations.of(context)!;
    final canCopy = !toolCard && msg.content.isNotEmpty;
    final canRetry =
        canCopy &&
        (msg.role == ChatRole.user || msg.role == ChatRole.assistant);
    // ⚠️ **引用**与「复制」同一条规则：只有**有文字**的那条能给
    // （工具卡片的内容是空的、附件气泡的是**路径** ⇒ ⇒ 引用它们没有
    // 意义 ⇒ ⇒ 那一格在菜单里就被裁掉了）。
    final canQuote = canCopy;
    final action = await showMessageActionSheet(
      context,
      canCopy: canCopy,
      // 调试 JSON 永远可复制 —— 连**空内容**的消息也算（工具卡片就是
      // 空 content + toolCall），所以不跟着 `canCopy` 走。
      canCopyJson: true,
      canCopyConversationJson: widget.chatState.messages.isNotEmpty,
      canRetry: canRetry,
      canUndo: !toolCard,
      canQuote: canQuote,
      labels: MessageActionLabels(
        copy: l10n.messageActionCopy,
        copyJson: l10n.messageActionCopyJson,
        copyConversationJson: l10n.messageActionCopyConversationJson,
        retry: l10n.messageActionRetry,
        undo: l10n.messageActionUndo,
        cancel: l10n.cancel,
        quote: l10n.messageActionQuote,
      ),
    );
    if (!context.mounted || action == null || action == MessageAction.dismiss) {
      return;
    }
    final chatState = widget.chatState;
    final notifier = ref.read(chatProvider.notifier);
    switch (action) {
      case MessageAction.copy:
        await Clipboard.setData(ClipboardData(text: msg.content));
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageCopiedToast),
            duration: const Duration(seconds: 1),
          ),
        );
      case MessageAction.copyJson:
        // 载荷是**这一条 + 会话上下文**（第几条、一共几条、会话 id、
        // 叶区）—— 只有一条消息的 JSON 在调试里几乎没用。
        await Clipboard.setData(
          ClipboardData(
            text: buildChatMessageDebugJson(
              message: msg,
              index: index,
              messages: chatState.messages,
              sessionId: chatState.sessionId,
              agent: chatState.activeConversationAgent,
            ),
          ),
        );
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageDebugJsonCopiedToast),
            duration: const Duration(seconds: 1),
          ),
        );
      case MessageAction.copyConversationJson:
        // 整段聊天记录 —— 开发 agent 一次拿到完整因果链（谁先说了什么、
        // 工具在哪一轮被点名、流式尾巴与原始错误）。
        await Clipboard.setData(
          ClipboardData(
            text: buildChatConversationDebugJson(
              messages: chatState.messages,
              sessionId: chatState.sessionId,
              agent: chatState.activeConversationAgent,
              streamingText: chatState.streamingText,
              errorMessage: chatState.errorMessage,
            ),
          ),
        );
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageDebugJsonCopiedToast),
            duration: const Duration(seconds: 1),
          ),
        );
      case MessageAction.retry:
        if (msg.role == ChatRole.user) {
          await notifier.retryFromUserMessage(index);
        } else {
          await notifier.retryAssistantMessage(index);
        }
      case MessageAction.undo:
        notifier.undoMessage(index);
      case MessageAction.quote:
        // ⚠️ **引用**＝把这一条放进「待发的那句」里 ⇒ ⇒ 引用条出现在
        // 输入框上方 ⇒ ⇒ **下一句**发出去时会带着它（见
        // `ChatNotifier._consumePendingQuote`）⇒ ⇒ 用完即清。
        notifier.quoteMessage(index);
      case MessageAction.dismiss:
        break;
    }
  }

  /// 长按错误横幅 ⇒ 复制原始错误 / 重试上次发送 / 撤销（关掉横幅）。
  Future<void> _showErrorActions(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final chatState = widget.chatState;
    final raw = chatState.errorMessage ?? '';
    // 切会话失败的闸门还关着 ⇒ 重试没有意义（横幅说的就是这件事）。
    final hasRetryableUser =
        chatState.failedSwitchSessionId == null &&
        chatState.messages.any((m) => m.role == ChatRole.user);
    final action = await showMessageActionSheet(
      context,
      canCopy: raw.isNotEmpty,
      // 错误横幅不是一条消息 ⇒ 没有「单条 JSON」；但**整段聊天记录 + 错误**
      // 正是要贴给开发 agent 的那一份 ⇒ ⇒ 给整段那项。
      canCopyConversationJson: chatState.messages.isNotEmpty,
      canRetry: hasRetryableUser,
      canUndo: true,
      labels: MessageActionLabels(
        copy: l10n.messageActionCopy,
        copyJson: l10n.messageActionCopyJson,
        copyConversationJson: l10n.messageActionCopyConversationJson,
        retry: l10n.messageActionRetry,
        undo: l10n.messageActionUndo,
        cancel: l10n.cancel,
        // ⚠️ 错误横幅**不是一条消息** ⇒ ⇒ 没有「引用谁」⇒ ⇒ 菜单里
        // **不给**这一项（`canQuote` 保持假）。
        quote: l10n.messageActionQuote,
      ),
    );
    if (!context.mounted || action == null || action == MessageAction.dismiss) {
      return;
    }
    final notifier = ref.read(chatProvider.notifier);
    switch (action) {
      case MessageAction.copy:
        // 复制**原始**错误文本（不带 l10n 包装）—— 给报错/贴日志用的就是它。
        await Clipboard.setData(ClipboardData(text: raw));
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageCopiedToast),
            duration: const Duration(seconds: 1),
          ),
        );
      case MessageAction.copyJson:
        // 横幅没有「这一条」⇒ 菜单永远不给这项；这里只是穷尽 switch。
        break;
      case MessageAction.copyConversationJson:
        await Clipboard.setData(
          ClipboardData(
            text: buildChatConversationDebugJson(
              messages: chatState.messages,
              sessionId: chatState.sessionId,
              agent: chatState.activeConversationAgent,
              streamingText: chatState.streamingText,
              errorMessage: chatState.errorMessage,
            ),
          ),
        );
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.messageDebugJsonCopiedToast),
            duration: const Duration(seconds: 1),
          ),
        );
      case MessageAction.retry:
        await notifier.retryLastFailure();
      case MessageAction.undo:
        notifier.clearError();
      case MessageAction.quote:
        // ⚠️ 横幅**不是消息** ⇒ ⇒ 不许引用（菜单里根本没给这一项）
        // ⇒ ⇒ 这一支只是穷尽 switch。
        break;
      case MessageAction.dismiss:
        break;
    }
  }

  MessageRole _convertRole(ChatRole role) {
    switch (role) {
      case ChatRole.user:
        return MessageRole.user;
      case ChatRole.assistant:
        return MessageRole.assistant;
      case ChatRole.system:
        return MessageRole.system;
    }
  }

  ChatMessage _toChatMessage(String content, MessageRole role) {
    switch (role) {
      case MessageRole.user:
        return ChatMessage.user(content);
      case MessageRole.assistant:
        return ChatMessage.assistant(content);
      case MessageRole.system:
        return ChatMessage.system(content);
    }
  }
}

/// **引用条** —— 输入框上方那一行「你正在引用哪一条」。
///
/// ⚠️ **为什么是「条」而不是把引文塞进输入框**：用户接着要打的那句
/// **不该被引文占着**（那是两件事）⇒ ⇒ 引文单独一行、点 × 就取消
/// ⇒ ⇒ 用户接着打的字**一个字都不用改**。
///
/// ⚠️ **为什么写「谁说的」**：引的是助手那句还是自己那句 ⇒ ⇒ 意思完全
/// 不同 ⇒ ⇒ 只给一段文字 ⇒ ⇒ 用户会分不清「我引的是它」还是「我说的」。
class _QuoteBar extends StatelessWidget {
  final QuotedMessage quote;
  final String authorLabel;
  final String dismissLabel;
  final VoidCallback onDismiss;

  const _QuoteBar({
    required this.quote,
    required this.authorLabel,
    required this.dismissLabel,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: scheme.primary, width: 3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.format_quote, size: 16, color: scheme.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  authorLabel,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: scheme.primary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  quoteSnippet(quote.text),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onDismiss,
            icon: const Icon(Icons.close, size: 18),
            tooltip: dismissLabel,
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

/// **「这次没朗读」＋「仍要朗读」** —— 就地的一行提示。
///
/// ⚠️ **为什么就地，而不是全局横幅**：全局横幅会打断阅读，而这一格是
/// **每条回复自己的**事实（「这一条刚才没出声」）⇒ ⇒ 挂在它自己的气泡下
/// 面最贴切。
///
/// ⚠️ **跳过 ≠ 失败** ⇒ ⇒ 弱化色（不是横幅那种红）⇒ ⇒ 用户不会以为
/// TTS 坏了。
class _TtsSkippedRow extends StatelessWidget {
  const _TtsSkippedRow({
    required this.notice,
    required this.label,
    required this.onSpeakAnyway,
  });

  final String notice;
  final String label;
  final VoidCallback onSpeakAnyway;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.disabledColor;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.volume_off_outlined, size: 14, color: muted),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              notice,
              style: theme.textTheme.bodySmall?.copyWith(color: muted),
            ),
          ),
          const SizedBox(width: 4),
          // ⚠️ **开关** ⇒ ⇒ 点它 ⇒ ⇒ 绕过安静判定，强制出声（用户既然
          // 执意要听，就别替他省这一次算力）。
          TextButton(
            onPressed: onSpeakAnyway,
            style: TextButton.styleFrom(
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            child: Text(label),
          ),
        ],
      ),
    );
  }
}
