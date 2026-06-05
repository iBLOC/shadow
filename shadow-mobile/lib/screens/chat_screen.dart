import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:genui/genui.dart' hide ChatMessage;
import 'package:camera/camera.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart' as ai_toolkit;
import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';
import '../providers/genui_provider.dart';
import '../providers/wake_word_provider.dart';
import '../services/wake_word_service.dart';
import '../providers/conversation_mode_provider.dart';
import '../providers/ai/prefrontal_provider.dart';
import '../services/network_service.dart';
import '../utils/chat_state_l10n.dart';
import '../widgets/chat_bubble.dart';
import '../router/app_router.dart';
import '../theme/app_colors.dart';
import '../multimodal/multimodal.dart';
import '../widgets/continue_on_desktop_dialog.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final TextEditingController _promptController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  ProviderSubscription<AsyncValue<WakeWordEvent>>? _wakeWordSub;

  @override
  void initState() {
    super.initState();
    _wakeWordSub = ref.listenManual<AsyncValue<WakeWordEvent>>(
      wakeWordEventsProvider,
      (prev, next) {
        if (next is AsyncData<WakeWordEvent>) {
          _onWakeWord(next.value!);
        }
      },
    );
  }

  void _onWakeWord(WakeWordEvent event) {
    if (!mounted) return;
    if (_promptController.text.isEmpty) {
      _promptController.text = 'Hello!';
      _scrollToBottom();
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('🎤 Heard you'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  void dispose() {
    _wakeWordSub?.close();
    _promptController.dispose();
    _scrollController.dispose();
    super.dispose();
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

  bool _downloadDialogShown = false;

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatProvider);
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final useAgent2UI = ref.watch(useAgent2UIModeProvider);

    ref.listen(chatProvider, (previous, next) {
      if (previous?.messages.length != next.messages.length) {
        _scrollToBottom();
      }
    });

    // Listen for transcriptions from Rust-side VAD in conversation mode
    ref.listen<ConversationModeNotifier>(conversationModeProvider.notifier, (
      previous,
      next,
    ) {
      next.transcriptionStream.listen((transcription) {
        if (transcription.isNotEmpty) {
          ref.read(chatProvider.notifier).generateResponse(transcription);
        }
      });
    });

    // Set up audio chunk callback when conversation mode changes
    ref.listen<ConversationState>(conversationModeProvider, (previous, next) {
      if (next.mode == ConversationMode.conversation) {
        ref
            .read(chatProvider.notifier)
            .setAudioChunkCallback(
              (chunk) => ref
                  .read(conversationModeProvider.notifier)
                  .sendAudioData(chunk),
            );
      } else {
        ref.read(chatProvider.notifier).setAudioChunkCallback(null);
      }
    });

    final bool modelNotReady =
        chatState.modelNotFound &&
        chatState.mode == ChatMode.litert &&
        !useAgent2UI;

    if (modelNotReady && !_downloadDialogShown) {
      _downloadDialogShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showDownloadDialog(context);
      });
    } else if (!modelNotReady && _downloadDialogShown) {
      _downloadDialogShown = false;
    }

    final isAgent2UI = chatState.mode == ChatMode.off && useAgent2UI;
    final isLitertMode = chatState.mode == ChatMode.litert;

    String getModeTitle() {
      if (isAgent2UI) return l10n.agent2UI;
      if (isLitertMode) return l10n.liteRT;
      return l10n.appTitle;
    }

    IconData getModeIcon() {
      if (isAgent2UI) return Icons.psychology;
      if (isLitertMode) return Icons.smart_toy;
      return Icons.chat_bubble_outline;
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Row(
          children: [
            Icon(getModeIcon(), color: AppColors.primary),
            const SizedBox(width: 8),
            Text(getModeTitle()),
          ],
        ),
        actions: [
          if ((chatState.isInitialized || chatState.isLitertReady) &&
              !isAgent2UI &&
              chatState.sessionId != null)
            IconButton(
              icon: const Icon(Icons.swap_horiz),
              onPressed: () {
                final sessionId = chatState.sessionId;
                if (sessionId != null) {
                  showContinueOnDesktopDialog(context, sessionId);
                }
              },
              tooltip: l10n.continueDesktopTitle,
            ),
          if ((chatState.isInitialized || chatState.isLitertReady) &&
              !isAgent2UI)
            _ModeSwitcher(),
          if ((chatState.isInitialized || chatState.isLitertReady) &&
              !isAgent2UI)
            IconButton(
              icon: const Icon(Icons.settings),
              onPressed: () =>
                  _showSettings(context, chatState.displayModelInfo(l10n)),
              tooltip: l10n.settings,
            ),
        ],
      ),
      body: isAgent2UI
          ? const _Agent2UIView()
          : isLitertMode
          ? const _PrefrontalChatView()
          : _LocalChatView(
              chatState: chatState,
              l10n: l10n,
              isDark: isDark,
              scrollController: _scrollController,
              promptController: _promptController,
              onSendMessage: _sendMessage,
              onSpeak: () =>
                  ref.read(chatProvider.notifier).speakLastResponse(),
              onPickImage: () => ref.read(chatProvider.notifier).pickImage(),
              onCaptureImage: () =>
                  ref.read(chatProvider.notifier).captureImage(),
              onPickFile: () => ref.read(chatProvider.notifier).pickFile(),
              onStartAudioRecording: () =>
                  ref.read(chatProvider.notifier).startAudioRecording(),
              onStopAudioRecording: () =>
                  ref.read(chatProvider.notifier).stopAudioRecording(),
              onStopAndSend: _stopRecordingAndSend,
            ),
    );
  }

  void _sendMessage() {
    final prompt = _promptController.text.trim();
    final chatState = ref.read(chatProvider);
    final hasAttachments = chatState.attachments.isNotEmpty;

    // 如果没有文字也没有附件，直接返回
    if (prompt.isEmpty && !hasAttachments) return;

    _promptController.clear();

    if (chatState.mode == ChatMode.litert && chatState.isLitertReady) {
      ref
          .read(chatProvider.notifier)
          .generateResponseWithAttachments(prompt, chatState.attachments);
    } else {
      // 清除附件（如果已发送）
      if (hasAttachments) {
        ref.read(chatProvider.notifier).clearAttachments();
      }
      if (prompt.isNotEmpty) {
        ref.read(chatProvider.notifier).generateResponse(prompt);
      }
    }
  }

  Future<void> _stopRecordingAndSend() async {
    await ref.read(chatProvider.notifier).stopAudioRecording();
    _sendMessage();
  }

  void _showSettings(BuildContext context, String modelInfo) {
    context.push(
      AppRoutes.settings,
      extra: {
        'modelInfo': modelInfo,
        'onReset': () {
          ref.read(chatProvider.notifier).reset();
        },
      },
    );
  }

  void _showDownloadDialog(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final chatNotifier = ref.read(chatProvider.notifier);
    final networkService = NetworkService();
    final networkType = await networkService.getNetworkType();
    final chatState = ref.read(chatProvider);
    final agent = chatState.currentAgent;
    final modelSize = agent.model.sizeString;

    if (networkType == NetworkType.mobile) {
      final navigator = Navigator.of(context);
      final result = await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: Text(l10n.mobileNetworkDetected),
          content: Text(l10n.downloadOnMobile(modelSize)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop('wifi'),
              child: Text(l10n.waitForWifi),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop('download'),
              child: Text(l10n.downloadNow),
            ),
          ],
        ),
      );

      if (result == 'wifi') {
        navigator.pop();
        return;
      }
    }

    if (!context.mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return Consumer(
          builder: (context, ref, child) {
            final chatState = ref.watch(chatProvider);
            final progress = chatState.downloadProgress;
            final isDownloading = progress >= 0 && progress < 1;
            final isComplete = chatState.isLitertReady;
            final hasError = chatState.errorMessage != null && !isDownloading;
            final currentAgent = chatState.currentAgent;

            return AlertDialog(
              title: Text(
                '${l10n.downloadNow} ${currentAgent.model.displayName}',
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    networkType == NetworkType.mobile
                        ? l10n.mobileNetworkDetected
                        : 'This model (${currentAgent.model.sizeString}) is required for ${currentAgent.type.displayName}. '
                              'Download from hf-mirror.com (China mirror)?',
                  ),
                  const SizedBox(height: 24),
                  if (isDownloading) ...[
                    LinearProgressIndicator(value: progress),
                    const SizedBox(height: 8),
                    Text('${(progress * 100).toStringAsFixed(1)}%'),
                  ] else if (isComplete) ...[
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 48,
                    ),
                    const SizedBox(height: 8),
                    Text(l10n.downloadComplete),
                  ] else if (hasError) ...[
                    const Icon(
                      Icons.error_outline,
                      color: Colors.red,
                      size: 48,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      chatState.errorMessage ?? l10n.downloadFailed,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ] else ...[
                    const CircularProgressIndicator(),
                  ],
                ],
              ),
              actions: [
                if (hasError)
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: Text(l10n.cancel),
                  ),
                if (!isComplete && !isDownloading) ...[
                  TextButton(
                    onPressed: () {
                      ref.read(useAgent2UIModeProvider.notifier).state = true;
                      ref.read(chatProvider.notifier).setMode(ChatMode.off);
                      Navigator.of(dialogContext).pop();
                    },
                    child: const Text('Use Agent2UI'),
                  ),
                  TextButton(
                    onPressed: () => chatNotifier.downloadModel(),
                    child: Text(l10n.downloadNow),
                  ),
                ],
                if (isComplete)
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: Text(l10n.startChatting),
                  ),
              ],
            );
          },
        );
      },
    );
  }
}

class _LocalChatView extends ConsumerStatefulWidget {
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

  const _LocalChatView({
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
  ConsumerState<_LocalChatView> createState() => _LocalChatViewState();
}

class _LocalChatViewState extends ConsumerState<_LocalChatView> {
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
                  onPressed: () {
                    // This will be handled by the parent
                  },
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
                _CameraPreviewWrapper(),
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
                            _getVideoStatusText(convState.videoState),
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
                          _VideoControlButton(
                            icon: Icons.flip_camera_ios,
                            label: '翻转',
                            onPressed: () {
                              ref
                                  .read(conversationModeProvider.notifier)
                                  .flipCamera();
                            },
                          ),
                          const SizedBox(width: 8),
                          _VideoControlButton(
                            icon: Icons.videocam_off,
                            label: '关闭',
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
                          child: isVoice
                              ? _VoiceMessageBubble(
                                  durationMs: null,
                                  onPlay: () => ref
                                      .read(chatProvider.notifier)
                                      .playVoiceMessage(index),
                                )
                              : isImage
                              ? _ImageMessageBubble(
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
                              ? _AudioMessageBubble(
                                  onPlay: () => ref
                                      .read(chatProvider.notifier)
                                      .playVoiceMessage(index),
                                )
                              : isVideo
                              ? _VideoMessageBubble(
                                  videoPath: msg.attachmentPath,
                                )
                              : isFile
                              ? _FileMessageBubble(
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
                            chatState.mode == ChatMode.litert &&
                            !isVoice &&
                            !isImage &&
                            !isVideo &&
                            !isFile)
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
                        return _AttachmentChip(
                          type: attachment.type,
                          path: attachment.path ?? '',
                          onRemove: () {
                            // TODO: Implement attachment removal
                            // Issue: Need access to chat state notifier to remove attachment
                          },
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
                          ? _VoiceInputView(
                              isRecording: chatState.isRecordingAudio,
                              isEnabled:
                                  (chatState.isInitialized ||
                                      chatState.isLitertReady) &&
                                  !chatState.isLoading,
                              onStartRecording: widget.onStartAudioRecording,
                              onStopAndSend: widget.onStopAndSend,
                            )
                          : TextField(
                              controller: widget.promptController,
                              decoration: InputDecoration(
                                hintText:
                                    chatState.isInitialized ||
                                        chatState.isLitertReady
                                    ? l10n.askSomething
                                    : l10n.initializing,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(24),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                              ),
                              enabled:
                                  (chatState.isInitialized ||
                                      chatState.isLitertReady) &&
                                  !chatState.isLoading,
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
                            (chatState.isInitialized ||
                                    chatState.isLitertReady) &&
                                !chatState.isLoading
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

/// Prefrontal Chat View using LlmChatView with PrefrontalProvider
class _PrefrontalChatView extends ConsumerStatefulWidget {
  const _PrefrontalChatView();

  @override
  ConsumerState<_PrefrontalChatView> createState() =>
      _PrefrontalChatViewState();
}

class _PrefrontalChatViewState extends ConsumerState<_PrefrontalChatView> {
  PrefrontalProvider? _provider;
  String? _sessionId;

  @override
  void initState() {
    super.initState();
    _initProvider();
  }

  Future<void> _initProvider() async {
    final provider = PrefrontalProvider();
    final sessionId = await provider.createSession();
    if (mounted) {
      setState(() {
        _provider = provider;
        _sessionId = sessionId;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_provider == null || _sessionId == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(l10n.initializing),
          ],
        ),
      );
    }

    return ai_toolkit.LlmChatView(
      provider: _provider!,
      enableAttachments: true,
      enableVoiceNotes: true,
      welcomeMessage: l10n.welcomeMessage,
      suggestions: [l10n.tellMeStory, l10n.whatCanYouHelp, l10n.howAudioWorks],
    );
  }
}

/// Agent2UI View using GenUiConversation
class _Agent2UIView extends ConsumerWidget {
  const _Agent2UIView();

  Color _getStatusColor(AsyncValue<ConnectionStatus> status) {
    return status.when(
      data: (s) => switch (s) {
        ConnectionStatus.connected => AppColors.success,
        ConnectionStatus.connecting => AppColors.warning,
        ConnectionStatus.error => AppColors.error,
        ConnectionStatus.disconnected => AppColors.darkTextMuted,
      },
      loading: () => AppColors.warning,
      error: (e, s) => AppColors.error,
    );
  }

  IconData _getStatusIcon(AsyncValue<ConnectionStatus> status) {
    return status.when(
      data: (s) => switch (s) {
        ConnectionStatus.connected => Icons.wifi,
        ConnectionStatus.connecting => Icons.wifi_find,
        ConnectionStatus.error => Icons.wifi_off,
        ConnectionStatus.disconnected => Icons.cloud_off,
      },
      loading: () => Icons.wifi_find,
      error: (e, s) => Icons.wifi_off,
    );
  }

  String _getStatusText(
    AsyncValue<ConnectionStatus> status,
    AppLocalizations l10n,
  ) {
    return status.when(
      data: (s) => switch (s) {
        ConnectionStatus.connected => l10n.connectedToShadowA2AServer,
        ConnectionStatus.connecting => l10n.connectingToShadow,
        ConnectionStatus.error => l10n.connectionError,
        ConnectionStatus.disconnected => l10n.disconnected,
      },
      loading: () => l10n.connecting,
      error: (e, _) => l10n.errorGeneric(e.toString()),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final service = ref.watch(genUIAgentServiceProvider);
    final surfaceIds = ref.watch(surfaceIdsProvider);
    final connectionStatus = ref.watch(a2uiConnectionStatusProvider);

    return Column(
      children: [
        // Connection status bar
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _getStatusColor(connectionStatus).withValues(alpha: 0.1),
            border: Border(
              bottom: BorderSide(
                color: _getStatusColor(connectionStatus).withValues(alpha: 0.3),
              ),
            ),
          ),
          child: Row(
            children: [
              Icon(
                _getStatusIcon(connectionStatus),
                color: _getStatusColor(connectionStatus),
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _getStatusText(connectionStatus, l10n),
                  style: TextStyle(
                    color: _getStatusColor(connectionStatus),
                    fontSize: 12,
                  ),
                ),
              ),
              TextButton(
                onPressed: () {
                  ref.read(useAgent2UIModeProvider.notifier).state = false;
                },
                child: Text(l10n.disconnect),
              ),
            ],
          ),
        ),
        // GenUI Surface area
        Expanded(
          child: surfaceIds.when(
            data: (ids) {
              if (ids.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.psychology,
                        size: 64,
                        color: AppColors.primary.withValues(alpha: 0.5),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        l10n.agent2uiReady,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(color: AppColors.primary),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        l10n.askMeAnything,
                        style: TextStyle(
                          color: AppColors.darkTextMuted,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                );
              }
              // Render surfaces - GenUiSurface takes a GenUiHost and surfaceId
              return ListView.builder(
                itemCount: ids.length,
                itemBuilder: (context, index) {
                  final surfaceId = ids[index];
                  return GenUiSurface(
                    host: service.messageProcessor,
                    surfaceId: surfaceId,
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 48, color: AppColors.error),
                  const SizedBox(height: 16),
                  Text(
                    'Connection Error',
                    style: TextStyle(color: AppColors.error),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    err.toString(),
                    style: TextStyle(
                      color: AppColors.darkTextMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        // Agent2UI input bar
        _Agent2UIInputBar(service: service),
      ],
    );
  }
}

/// Agent2UI Input Bar
class _Agent2UIInputBar extends ConsumerStatefulWidget {
  final GenUIAgentService service;

  const _Agent2UIInputBar({required this.service});

  @override
  ConsumerState<_Agent2UIInputBar> createState() => _Agent2UIInputBarState();
}

class _Agent2UIInputBarState extends ConsumerState<_Agent2UIInputBar> {
  final _controller = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _isLoading = true);
    _controller.clear();
    widget.service.sendMessage(text);
    // In a real app, you'd listen to the conversation state
    // and set _isLoading = false when response arrives
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) setState(() => _isLoading = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
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
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                decoration: InputDecoration(
                  hintText: AppLocalizations.of(context)!.askSomething,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                ),
                enabled: !_isLoading,
                maxLines: 4,
                minLines: 1,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _isLoading ? null : _sendMessage,
              icon: _isLoading
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
        ),
      ),
    );
  }
}

/// Attachment chip widget for multimodal inputs
class _AttachmentChip extends StatelessWidget {
  final MultimodalInputType type;
  final String path;
  final VoidCallback onRemove;

  const _AttachmentChip({
    required this.type,
    required this.path,
    required this.onRemove,
  });

  IconData get _icon {
    switch (type) {
      case MultimodalInputType.audio:
        return Icons.mic;
      case MultimodalInputType.image:
        return Icons.image;
      case MultimodalInputType.camera:
        return Icons.camera_alt;
      case MultimodalInputType.file:
        return Icons.insert_drive_file;
      case MultimodalInputType.voice:
        return Icons.voice_chat;
      case MultimodalInputType.video:
        return Icons.videocam;
    }
  }

  String get _label {
    final fileName = path.split('/').last;
    return fileName.length > 15 ? '${fileName.substring(0, 12)}...' : fileName;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      child: Chip(
        avatar: Icon(_icon, size: 18),
        label: Text(_label, style: const TextStyle(fontSize: 12)),
        deleteIcon: const Icon(Icons.close, size: 16),
        onDeleted: onRemove,
      ),
    );
  }
}

class _ModeSwitcher extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convNotifier = ref.read(conversationModeProvider.notifier);
    final chatNotifier = ref.read(chatProvider.notifier);

    return IconButton(
      icon: Icon(Icons.phone, color: AppColors.primary),
      onPressed: () {
        chatNotifier.sendGreeting();
        convNotifier.startConversationMode();
      },
      tooltip: 'Voice Mode',
    );
  }
}

class _VoiceMessageBubble extends StatelessWidget {
  final int? durationMs;
  final VoidCallback onPlay;

  const _VoiceMessageBubble({required this.durationMs, required this.onPlay});

  String get _durationText {
    if (durationMs == null) return 'Voice';
    final seconds = durationMs! ~/ 1000;
    if (seconds < 60) return '${seconds}s';
    return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: Icon(
              Icons.play_circle_fill,
              color: AppColors.primary,
              size: 40,
            ),
            onPressed: onPlay,
            tooltip: 'Play voice message',
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Voice message',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
              Text(
                _durationText,
                style: TextStyle(
                  fontSize: 12,
                  color: isDark ? Colors.white60 : Colors.black54,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ImageMessageBubble extends StatelessWidget {
  final String? imagePath;
  final VoidCallback? onTap;

  const _ImageMessageBubble({required this.imagePath, this.onTap});

  @override
  Widget build(BuildContext context) {
    if (imagePath == null) {
      return GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey[300],
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.broken_image, color: Colors.grey),
        ),
      );
    }

    final file = File(imagePath!);
    final fileExists = file.existsSync();

    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: fileExists
            ? Image.file(
                file,
                width: 200,
                height: 200,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    width: 200,
                    height: 200,
                    color: Colors.grey[300],
                    child: const Center(
                      child: Icon(
                        Icons.broken_image,
                        color: Colors.grey,
                        size: 48,
                      ),
                    ),
                  );
                },
              )
            : Container(
                width: 200,
                height: 200,
                color: Colors.grey[300],
                child: const Center(
                  child: Icon(
                    Icons.image_not_supported,
                    color: Colors.grey,
                    size: 48,
                  ),
                ),
              ),
      ),
    );
  }
}

class _AudioMessageBubble extends StatelessWidget {
  final VoidCallback onPlay;

  const _AudioMessageBubble({required this.onPlay});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: Icon(
              Icons.play_circle_fill,
              color: AppColors.primary,
              size: 40,
            ),
            onPressed: onPlay,
            tooltip: 'Play audio',
          ),
          const SizedBox(width: 8),
          Text(
            'Audio message',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoMessageBubble extends StatelessWidget {
  final String? videoPath;

  const _VideoMessageBubble({required this.videoPath});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.videocam, color: AppColors.primary, size: 40),
          const SizedBox(width: 8),
          Text(
            videoPath != null ? 'Video' : 'Video (no file)',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}

class _FileMessageBubble extends StatelessWidget {
  final String? filePath;
  final String? fileName;

  const _FileMessageBubble({required this.filePath, this.fileName});

  String get _displayName {
    if (fileName != null && fileName!.isNotEmpty) return fileName!;
    if (filePath == null) return 'File';
    return filePath!.split('/').last;
  }

  String get _fileExtension {
    final name = _displayName;
    final dotIndex = name.lastIndexOf('.');
    if (dotIndex == -1) return '';
    return name.substring(dotIndex + 1).toLowerCase();
  }

  IconData get _fileIcon {
    switch (_fileExtension) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'doc':
      case 'docx':
        return Icons.description;
      case 'xls':
      case 'xlsx':
        return Icons.table_chart;
      case 'ppt':
      case 'pptx':
        return Icons.slideshow;
      case 'zip':
      case 'rar':
      case 'tar':
      case 'gz':
        return Icons.folder_zip;
      case 'mp3':
      case 'wav':
      case 'aac':
      case 'flac':
        return Icons.audio_file;
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'mkv':
        return Icons.video_file;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'bmp':
        return Icons.image;
      case 'txt':
      case 'md':
      case 'json':
      case 'xml':
      case 'html':
      case 'css':
      case 'js':
        return Icons.code;
      default:
        return Icons.insert_drive_file;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_fileIcon, color: AppColors.primary, size: 40),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _displayName,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: isDark ? Colors.white : Colors.black87,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (_fileExtension.isNotEmpty)
                  Text(
                    _fileExtension.toUpperCase(),
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? Colors.white60 : Colors.black54,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceInputView extends StatelessWidget {
  final bool isRecording;
  final bool isEnabled;
  final VoidCallback onStartRecording;
  final VoidCallback onStopAndSend;

  const _VoiceInputView({
    required this.isRecording,
    required this.isEnabled,
    required this.onStartRecording,
    required this.onStopAndSend,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (!isEnabled) {
      return Center(
        child: Text(
          l10n.initializing,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      );
    }

    return GestureDetector(
      onLongPressStart: (_) {
        if (!isRecording) {
          onStartRecording();
        }
      },
      onLongPressEnd: (_) {
        if (isRecording) {
          onStopAndSend();
        }
      },
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          color: isRecording
              ? Colors.red.withValues(alpha: 0.1)
              : Theme.of(context).colorScheme.primaryContainer,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: isRecording
                ? Colors.red
                : Theme.of(context).colorScheme.primary,
            width: 2,
          ),
        ),
        child: Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isRecording ? Icons.mic : Icons.mic_none,
                color: isRecording
                    ? Colors.red
                    : Theme.of(context).colorScheme.primary,
                size: 28,
              ),
              const SizedBox(width: 8),
              Text(
                isRecording ? l10n.recording : l10n.holdToRecord,
                style: TextStyle(
                  color: isRecording
                      ? Colors.red
                      : Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Camera preview wrapper widget
class _CameraPreviewWrapper extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convState = ref.watch(conversationModeProvider);
    final videoCollector = ref.watch(videoCollectorProvider);

    if (convState.videoState == VideoState.off ||
        !videoCollector.isInitialized) {
      return const SizedBox.shrink();
    }

    return Container(
      width: 100,
      height: 130,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Mirrored preview for front camera
            Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..scale(convState.isMirrored ? -1.0 : 1.0, 1.0),
              child:
                  videoCollector.controller != null &&
                      videoCollector.controller!.value.isInitialized
                  ? CameraPreview(videoCollector.controller!)
                  : Container(color: Colors.black),
            ),
            // Streaming indicator
            if (convState.videoState == VideoState.streaming)
              Positioned(
                top: 4,
                right: 4,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Get video status text
String _getVideoStatusText(VideoState videoState) {
  switch (videoState) {
    case VideoState.off:
      return '摄像头关闭';
    case VideoState.on:
      return '摄像头就绪';
    case VideoState.streaming:
      return '采集中...';
  }
}

/// Video control button
class _VideoControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  const _VideoControlButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.grey.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
