import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';
import '../providers/genui_provider.dart';
import '../providers/wake_word_provider.dart';
import '../services/wake_word_service.dart';
import '../providers/conversation_mode_provider.dart';
import '../services/network_service.dart';
import '../utils/chat_state_l10n.dart';
import '../widgets/continue_on_desktop_dialog.dart';
import '../widgets/chat/local_chat_view.dart';
import '../widgets/chat/prefrontal_chat_view.dart';
import '../widgets/chat/agent2ui_view.dart';
import '../widgets/chat/mode_switcher.dart';
import '../widgets/chat/conversation_mode_switcher.dart';
import '../theme/app_colors.dart';
import '../router/app_router.dart';

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
          _onWakeWord(next.value);
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
            const ModeSwitcher(),
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
      body: Column(
        children: [
          // 对话形态（对话 / 语音 / 直播 / 客服）是对话的方式，不是并列 tab
          const ConversationModeSwitcher(),
          Expanded(
            child: isAgent2UI
                ? const Agent2UIView()
                : isLitertMode
                ? const PrefrontalChatView()
                : LocalChatView(
                    chatState: chatState,
                    l10n: l10n,
                    isDark: isDark,
                    scrollController: _scrollController,
                    promptController: _promptController,
                    onSendMessage: _sendMessage,
                    onSpeak: () =>
                        ref.read(chatProvider.notifier).speakLastResponse(),
                    onPickImage: () =>
                        ref.read(chatProvider.notifier).pickImage(),
                    onCaptureImage: () =>
                        ref.read(chatProvider.notifier).captureImage(),
                    onPickFile: () =>
                        ref.read(chatProvider.notifier).pickFile(),
                    onStartAudioRecording: () =>
                        ref.read(chatProvider.notifier).startAudioRecording(),
                    onStopAudioRecording: () =>
                        ref.read(chatProvider.notifier).stopAudioRecording(),
                    onStopAndSend: _stopRecordingAndSend,
                  ),
          ),
        ],
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
