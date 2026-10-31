import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:genui/genui.dart' hide ChatMessage;
import '../../generated/l10n/app_localizations.dart';
import '../../providers/genui_provider.dart';
import '../../theme/app_colors.dart';

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
                // ⚠️ **空态文案必须看真实连接状态** ——
                // 以前这里只判 `ids.isEmpty` ⇒ 无论**没连上**还是**连上了但服务端
                // 没产出**，一律显示「Agent2UI 就绪 / 问我任何问题」⇒
                // 用户被明确告知「就绪」，然后永远等不到任何界面。
                // ⚠️ 而端脑目前**根本不产出 A2UI**（见
                // docs/superpowers/architecture/2026-10-31-multi-end-a2ui-usability.md），
                // 所以「就绪」这句话今天是**假的**。
                //
                // 现在按连接状态分三种说法：
                //   未连接 ⇒ 说实话（连不上）
                //   连接中 ⇒ 说在等
                //   已连接但空 ⇒ 说「连上了，但服务端还没给内容」（不是「就绪」）
                //
                // ⚠️ 关键：**空态不复读状态栏**。状态栏已经在讲「连上了没」，
                // 空态要讲的是「**缺什么**」—— 复读不只是啰嗦，
                // 还会让同一句话在屏幕上出现两次（断言时分不清说的是哪块）。
                //
                // ⚠️ 副标题原来那句「问我任何问题，我会为您生成界面」也是
                // **假承诺** —— 端脑根本不产出 A2UI（见
                // docs/superpowers/architecture/2026-10-31-multi-end-a2ui-usability.md），
                // 说了也永远不会兑现 ⇒ 改成只描述机制、不承诺结果。
                final status = connectionStatus.valueOrNull;
                final connected = status == ConnectionStatus.connected;
                final connecting = status == ConnectionStatus.connecting;

                final message = connected
                    ? l10n.agent2uiNoSurface
                    : (connecting
                          ? l10n.agent2uiWaiting
                          : l10n.agent2uiNoConnection);

                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        connected
                            ? Icons.psychology
                            : (connecting
                                  ? Icons.wifi_find
                                  : Icons.cloud_off),
                        size: 64,
                        color: AppColors.primary.withValues(alpha: 0.5),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        message,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(color: AppColors.primary),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        l10n.agent2uiSurfaceHint,
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
        Agent2UIInputBar(service: service),
      ],
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
