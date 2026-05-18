import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:genui/genui.dart' hide ChatMessage;
import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';
import '../providers/genui_provider.dart';
import '../utils/chat_state_l10n.dart';
import '../widgets/chat_bubble.dart';
import '../router/app_router.dart';
import '../theme/app_colors.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final TextEditingController _promptController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
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

    // Determine mode from chatState
    final isAgent2UI = chatState.mode == ChatMode.off && useAgent2UI;
    final isLitertMode = chatState.mode == ChatMode.litert;

    String getModeTitle() {
      if (isAgent2UI) return 'Agent2UI';
      if (isLitertMode) return 'LiteRT';
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
          // Mode toggle: Local MNN -> LiteRT -> Agent2UI -> Local MNN
          IconButton(
            icon: Icon(
              isAgent2UI
                  ? Icons.phone_android
                  : isLitertMode
                      ? Icons.psychology
                      : Icons.smart_toy,
            ),
            onPressed: () {
              final nextMode = isAgent2UI
                  ? ChatMode.localMnn
                  : isLitertMode
                      ? ChatMode.off
                      : ChatMode.litert;
              if (nextMode == ChatMode.off) {
                ref.read(useAgent2UIModeProvider.notifier).state = true;
              } else {
                ref.read(useAgent2UIModeProvider.notifier).state = false;
                ref.read(chatProvider.notifier).setMode(nextMode);
              }
            },
            tooltip: isAgent2UI
                ? 'Switch to Local MNN'
                : isLitertMode
                    ? 'Switch to Agent2UI'
                    : 'Switch to LiteRT',
          ),
          IconButton(
            icon: const Icon(Icons.model_training),
            onPressed: () {
              context.push(AppRoutes.manageModels);
            },
            tooltip: l10n.models,
          ),
          if ((chatState.isInitialized || chatState.isLitertReady) && !isAgent2UI)
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
          : _LocalChatView(
              chatState: chatState,
              l10n: l10n,
              isDark: isDark,
              scrollController: _scrollController,
              promptController: _promptController,
              onSendMessage: _sendMessage,
              onSpeak: () => ref.read(chatProvider.notifier).speakLastResponse(),
            ),
    );
  }

  void _sendMessage() {
    final prompt = _promptController.text.trim();
    if (prompt.isEmpty) return;
    _promptController.clear();
    ref.read(chatProvider.notifier).generateResponse(prompt);
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
}

/// Local MNN Chat View (existing implementation)
class _LocalChatView extends StatelessWidget {
  final ChatState chatState;
  final AppLocalizations l10n;
  final bool isDark;
  final ScrollController scrollController;
  final TextEditingController promptController;
  final VoidCallback onSendMessage;
  final VoidCallback onSpeak;

  const _LocalChatView({
    required this.chatState,
    required this.l10n,
    required this.isDark,
    required this.scrollController,
    required this.promptController,
    required this.onSendMessage,
    required this.onSpeak,
  });

  @override
  Widget build(BuildContext context) {
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
                  controller: scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: chatState.messages.length,
                  itemBuilder: (context, index) {
                    final msg = chatState.messages[index];
                    final role = _convertRole(msg.role);
                    final isAssistant = msg.role == ChatRole.assistant;
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: MessageBubble(
                            key: ValueKey(index),
                            message: _toChatMessage(msg.content, role),
                          ),
                        ),
                        if (isAssistant && chatState.mode == ChatMode.litert)
                          IconButton(
                            icon: const Icon(Icons.volume_up, size: 20),
                            onPressed: onSpeak,
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
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: promptController,
                    decoration: InputDecoration(
                      hintText: chatState.isInitialized || chatState.isLitertReady
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
                    enabled: (chatState.isInitialized || chatState.isLitertReady) && !chatState.isLoading,
                    maxLines: 4,
                    minLines: 1,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: chatState.isInitialized && !chatState.isLoading
                      ? onSendMessage
                      : null,
                  icon: chatState.isLoading
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
      error: (_, __) => AppColors.error,
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
      error: (_, __) => Icons.wifi_off,
    );
  }

  String _getStatusText(AsyncValue<ConnectionStatus> status) {
    return status.when(
      data: (s) => switch (s) {
        ConnectionStatus.connected => 'Connected to Shadow A2A Server',
        ConnectionStatus.connecting => 'Connecting to Shadow...',
        ConnectionStatus.error => 'Connection error',
        ConnectionStatus.disconnected => 'Disconnected',
      },
      loading: () => 'Connecting...',
      error: (e, _) => 'Error: ${e.toString()}',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                  _getStatusText(connectionStatus),
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
                child: const Text('Disconnect'),
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
                        'Agent2UI Ready',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(color: AppColors.primary),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Ask me anything and I will generate UI for you',
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
                  hintText: 'Ask me anything...',
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
