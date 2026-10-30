import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../generated/l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';
import '../../providers/conversation_mode_provider.dart';
import '../../utils/chat_state_l10n.dart';
import '../../theme/app_colors.dart';
import '../../multimodal/multimodal.dart';
import '../../widgets/chat_bubble.dart';
import 'message_bubbles.dart';
import 'tool_call_card.dart';
import 'voice_input_view.dart';
import 'camera_preview.dart';

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
  final VoidCallback onStopAudioRecording;
  final VoidCallback onStopAndSend;

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
    required this.onStopAudioRecording,
    required this.onStopAndSend,
  });

  @override
  ConsumerState<LocalChatView> createState() => _LocalChatViewState();
}

class _LocalChatViewState extends ConsumerState<LocalChatView> {
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
        if (chatState.errorMessage != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: (isDark ? AppColors.error : AppColors.errorLight)
                  .withValues(alpha: 0.2),
              border: Border(
                bottom: BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
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
              ? Center(
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
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: msg.toolCall != null
                              ? ToolCallCard(call: msg.toolCall!)
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
                Row(
                  children: [
                    // Attachment menu
                    PopupMenuButton<String>(
                      icon: const Icon(Icons.attach_file),
                      onSelected: (value) {
                        switch (value) {
                          case 'gallery':
                            widget.onPickImage();
                            break;
                          case 'camera':
                            widget.onCaptureImage();
                            break;
                          case 'file':
                            widget.onPickFile();
                            break;
                        }
                      },
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          value: 'gallery',
                          child: Row(
                            children: [
                              const Icon(Icons.photo_library),
                              const SizedBox(width: 8),
                              Text(l10n.gallery),
                            ],
                          ),
                        ),
                        PopupMenuItem(
                          value: 'camera',
                          child: Row(
                            children: [
                              const Icon(Icons.camera_alt),
                              const SizedBox(width: 8),
                              Text(l10n.camera),
                            ],
                          ),
                        ),
                        PopupMenuItem(
                          value: 'file',
                          child: Row(
                            children: [
                              const Icon(Icons.insert_drive_file),
                              const SizedBox(width: 8),
                              Text(l10n.file),
                            ],
                          ),
                        ),
                      ],
                    ),
                    // Voice mode toggle button
                    IconButton(
                      icon: Icon(
                        isConversationMode ? Icons.keyboard : Icons.mic,
                        color: isConversationMode
                            ? Theme.of(context).colorScheme.primary
                            : null,
                      ),
                      onPressed: () {
                        final notifier = ref.read(
                          conversationModeProvider.notifier,
                        );
                        if (isConversationMode) {
                          notifier.startMessageMode();
                        } else {
                          notifier.startConversationMode();
                        }
                      },
                    ),
                    // Input area: voice mode or text mode
                    Expanded(
                      child: isConversationMode
                          ? VoiceInputView(
                              isRecording: chatState.isRecordingAudio,
                              isEnabled:
                                  chatState.canChat && !chatState.isLoading,
                              onStartRecording: widget.onStartAudioRecording,
                              onStopAndSend: widget.onStopAndSend,
                            )
                          : TextField(
                              controller: widget.promptController,
                              decoration: InputDecoration(
                                // `canChat` 现在恒真（本地 LiteRT 下线后
                                // 没有「引擎没就绪」这个前置条件了），
                                // 所以这里**永远**是问句提示，不再有
                                // 「初始化中…」那种永远转不完的状态。
                                hintText: l10n.askSomething,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(24),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                              ),
                              enabled:
                                  chatState.canChat && !chatState.isLoading,
                              maxLines: 4,
                              minLines: 1,
                              textInputAction: TextInputAction.send,
                              onSubmitted: (_) => widget.onSendMessage(),
                            ),
                    ),
                    if (!isConversationMode) ...[
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed:
                            chatState.canChat && !chatState.isLoading
                            ? widget.onSendMessage
                            : null,
                        icon:
                            chatState.isLoading &&
                                chatState.streamingText.isEmpty
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
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
