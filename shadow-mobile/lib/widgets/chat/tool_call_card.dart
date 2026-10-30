import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/chat_provider.dart';
import '../../services/client_tools/client_tool_registry.dart';

/// 一次**客户端工具调用**的卡片。
///
/// 端脑让这台设备干活时（换主题之类），对话流里会出现这张卡片：
/// 工具名 + 参数 + 执行状态 + 结果。
///
/// 「本地执行成功」和「结果已回传端脑」是**两件事**，卡片分开显示 ——
/// 本地换好了主题但端脑那头没收到，模型还在等，用户得知道这件事。
///
/// 文案用英文硬编码，与同目录的 `message_bubbles.dart` 一致
/// （附件气泡那些也是硬编码英文）—— 不去动 `app_*.arb`，
/// 免得和正在改同一批 l10n 文件的并行会话打架。
class ToolCallCard extends ConsumerWidget {
  final ToolCallModel call;

  const ToolCallCard({super.key, required this.call});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.9,
        ),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: call.status == ToolCallStatus.failed
                ? scheme.error.withValues(alpha: 0.5)
                : scheme.outlineVariant.withValues(alpha: 0.6),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(_iconFor(call.status), size: 18, color: _accentFor(context)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    call.name,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface,
                    ),
                  ),
                ),
                _StatusChip(status: call.status),
              ],
            ),
            if (call.description != null && call.description!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                call.description!,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
            if (call.args.isNotEmpty) ...[
              const SizedBox(height: 6),
              ...call.args.entries.take(4).map(
                (entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    '${entry.key}: ${_formatValue(entry.value)}',
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ],
            if (call.errorText != null) ...[
              const SizedBox(height: 6),
              Text(
                call.errorText!,
                style: TextStyle(fontSize: 12, color: scheme.error),
              ),
            ],
            if (call.reportErrorText != null) ...[
              const SizedBox(height: 4),
              Text(
                call.reportErrorText!,
                style: TextStyle(
                  fontSize: 11,
                  color: isDark ? scheme.error : scheme.error,
                ),
              ),
            ],
            if (call.status == ToolCallStatus.awaitingApproval) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  FilledButton(
                    onPressed: () =>
                        ref.read(chatProvider.notifier).approveToolCall(call.id),
                    child: const Text('Allow'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () =>
                        ref.read(chatProvider.notifier).denyToolCall(call.id),
                    child: const Text('Deny'),
                  ),
                ],
              ),
            ],
            if (_footerText != null) ...[
              const SizedBox(height: 8),
              Text(
                _footerText!,
                style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 底部那行小字：耗时 + 「结果有没有回传端脑」。
  String? get _footerText {
    if (call.status == ToolCallStatus.succeeded) {
      final took = call.latencyMs != null ? ' in ${call.latencyMs}ms' : '';
      return call.reported
          ? 'done$took · reported to telencephalon'
          : 'done$took · NOT reported to telencephalon';
    }
    if (call.status == ToolCallStatus.failed) {
      return call.reported
          ? 'failed · reported to telencephalon'
          : 'failed · NOT reported to telencephalon';
    }
    if (call.status == ToolCallStatus.awaitingApproval) {
      return 'waiting for your approval';
    }
    return null;
  }

  Color _accentFor(BuildContext context) {
    switch (call.status) {
      case ToolCallStatus.failed:
        return Theme.of(context).colorScheme.error;
      case ToolCallStatus.succeeded:
        return Theme.of(context).colorScheme.primary;
      default:
        return Theme.of(context).colorScheme.onSurfaceVariant;
    }
  }

  IconData _iconFor(ToolCallStatus status) {
    switch (status) {
      case ToolCallStatus.pending:
        return Icons.schedule;
      case ToolCallStatus.running:
        return Icons.autorenew;
      case ToolCallStatus.awaitingApproval:
        return Icons.help_outline;
      case ToolCallStatus.succeeded:
        return Icons.check_circle_outline;
      case ToolCallStatus.failed:
        return Icons.error_outline;
    }
  }

  static String _formatValue(Object? value) {
    if (value == null) return 'null';
    if (value is String) return value;
    if (value is Map || value is List) return value.toString();
    return value.toString();
  }
}

/// 状态小标签。
class _StatusChip extends StatelessWidget {
  final ToolCallStatus status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (status) {
      ToolCallStatus.pending => ('pending', scheme.onSurfaceVariant),
      ToolCallStatus.running => ('running', scheme.primary),
      ToolCallStatus.awaitingApproval => ('needs approval', scheme.tertiary),
      ToolCallStatus.succeeded => ('done', scheme.primary),
      ToolCallStatus.failed => ('failed', scheme.error),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, color: color),
      ),
    );
  }
}
