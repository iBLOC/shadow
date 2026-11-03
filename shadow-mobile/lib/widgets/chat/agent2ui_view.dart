import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:genui/genui.dart' hide ChatMessage;

import '../../generated/l10n/app_localizations.dart';
import '../../providers/genui_provider.dart';
import '../../theme/app_colors.dart';
import '../responsive.dart';
import 'agent2ui_answer_state.dart';

/// Agent2UI View using GenUiConversation
class Agent2UIView extends ConsumerWidget {
  const Agent2UIView({super.key});

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

    // ⚠️ **端脑的原话 / 失败原因** —— 从 service 的广播流来。
    // ⚠️ 兜底读 `service.lastTextReply` / `service.lastError`：
    // 广播流**不重放** ⇒ 回复先到、provider 后订阅 ⇒ 会漏掉那一句。
    final textReply =
        ref.watch(a2uiTextReplyProvider).valueOrNull ?? service.lastTextReply;
    final errorReason =
        ref.watch(a2uiErrorReasonProvider).valueOrNull ?? service.lastError;

    // 折叠屏展开后内容限宽居中（状态栏 / 表面区 / 输入条一起收进
    // kContentMaxWidth），与 LocalChatView 同一形状。
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kContentMaxWidth),
        child: Column(
          children: [
            // Connection status bar
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _getStatusColor(connectionStatus).withValues(alpha: 0.1),
                border: Border(
                  bottom: BorderSide(
                    color: _getStatusColor(connectionStatus)
                        .withValues(alpha: 0.3),
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
                    // ⚠️ **端脑这一次的回答有三种**（外加「失败」）——
                    // 判据全在 `Agent2UIAnswerState` 里（单独一个文件：
                    // 三态的**判定顺序**有讲究，埋在状态栏代码里会被忘掉）。
                    return Agent2UIAnswerState(
                      status: connectionStatus.valueOrNull,
                      textReply: textReply,
                      errorReason: errorReason,
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
                      Icon(
                        Icons.error_outline,
                        size: 48,
                        color: AppColors.error,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        l10n.connectionError,
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
            Agent2UIInputBar(service: service),
          ],
        ),
      ),
    );
  }
}

/// Agent2UI Input Bar
class Agent2UIInputBar extends ConsumerStatefulWidget {
  final GenUIAgentService service;

  const Agent2UIInputBar({super.key, required this.service});

  @override
  ConsumerState<Agent2UIInputBar> createState() => _Agent2UIInputBarState();
}

class _Agent2UIInputBarState extends ConsumerState<Agent2UIInputBar> {
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
                  // ⚠️ **不能与对话那个输入框用同一句占位文案** ——
                  // 同页共存 ⇒ 两个输入框同屏 ⇒ 一模一样的「问点什么」
                  // ⇒ 用户分不清在跟谁说话 ⇒ ⇒ 这里说清是**跟端脑画界面**。
                  hintText: AppLocalizations.of(context)!.askAgent2UI,
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
