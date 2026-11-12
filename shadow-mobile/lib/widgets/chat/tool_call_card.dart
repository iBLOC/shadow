import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/chat_provider.dart';
import '../../services/capabilities/capability.dart';
import '../../services/capabilities/capability_i18n.dart';
import '../../services/client_tools/client_tool_registry.dart';
import '../responsive.dart';

/// 一次**客户端工具调用**的卡片。
///
/// 端脑让这台设备干活时（换主题之类），对话流里会出现这张卡片：
/// 工具名 + 参数 + 执行状态 + 结果。
///
/// 「本地执行成功」和「结果已回传端脑」是**两件事**，卡片分开显示 ——
/// 本地换好了主题但端脑那头没收到，模型还在等，用户得知道这件事。
///
/// ⚠️ **授权那两颗按钮走 l10n**（2026-11-03 设备能力授权）——
/// 它们是「每次询问」档位下用户**唯一**的授权入口 ⇒ ⇒ 硬编码英文
/// 会让中文用户在最需要看懂的一屏上看到英文。
/// （其余文案仍是英文硬编码，与同目录的 `message_bubbles.dart` 一致。）
class ToolCallCard extends ConsumerWidget {
  final ToolCallModel call;

  const ToolCallCard({super.key, required this.call});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final l10n = AppLocalizations.of(context)!;
    // ⚠️ **图片内联** —— generate_image 的结果里带了 base64 图片 ⇒ 画在
    // **这张卡片里**（用户往回翻还能看见）；base64 本身**不许**再进
    // 「结果」那几行文字（几百 KB 的字节摊在界面上 = 一坨协议字节）。
    final imageBytes = imageAttachmentBytesOf(call.result);

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(
          maxWidth: cappedBubbleWidth(context, fraction: 0.9, cap: 520),
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
                Icon(
                  _iconFor(call.status),
                  size: 18,
                  color: _accentFor(context),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _title(l10n),
                    style: TextStyle(
                      // ⚠️ 能力工具用**正文字体** —— 中文标签套等宽字体很难看；
                      // 普通工具仍是等宽（那是命令名，等宽才对）。
                      fontFamily: call.capability == null ? 'monospace' : null,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface,
                    ),
                  ),
                ),
                _StatusChip(status: call.status),
              ],
            ),
            if (_description(l10n) != null) ...[
              const SizedBox(height: 4),
              Text(
                _description(l10n)!,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
            // ⚠️ 能力工具的参数**说人话**（时间范围 / 标题 / 关键词…）；
            // 普通工具仍按 `key: value` 摊出来（那是命令的原始形状）。
            if (call.capability != null) ...[
              if (_summary(l10n).isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  _summary(l10n),
                  style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                ),
              ],
            ] else if (call.args.isNotEmpty) ...[
              const SizedBox(height: 6),
              ...call.args.entries
                  .take(4)
                  .map(
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
            // ⚠️ 「这次调用要哪个权限」—— **写给人话**（能力标签，不是 token）
            // ⇒ ⇒ 用户点头前就知道这扇门通向哪儿。
            if (call.requiredPermissions.isNotEmpty && call.capability != null) ...[
              const SizedBox(height: 6),
              Text(
                l10n.capabilityPermissionRequired(_permissionHint(l10n)),
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
            if (call.errorText != null) ...[
              const SizedBox(height: 6),
              Text(
                call.errorText!,
                style: TextStyle(fontSize: 12, color: scheme.error),
              ),
            ],
            if (imageBytes.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final bytes in imageBytes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(bytes, fit: BoxFit.fitWidth),
                  ),
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
                    onPressed: () => ref
                        .read(chatProvider.notifier)
                        .approveToolCall(call.id),
                    child: Text(l10n.toolCallAllow),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () =>
                        ref.read(chatProvider.notifier).denyToolCall(call.id),
                    child: Text(l10n.toolCallDeny),
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

  /// 卡片标题 —— 能力工具显示**人话**，普通工具显示命令名。
  ///
  /// ⚠️ 用户点头前看到的那个字符串 ⇒ ⇒ 「读取日历」远比
  /// `calendar_read_events` 有用（后者只有写工具的人才看得懂）。
  /// 「这次调用要哪个系统权限」—— **写成人话**。
  ///
  /// ⚠️ 「手机操作」那一档要的是**无障碍服务那个系统开关**
  /// ⇒ ⇒ 写「需要的系统权限：手机操作」等于**没说**
  /// ⇒ ⇒ 那一档单独说一句「无障碍服务（手机操作）」。
  String _permissionHint(AppLocalizations l10n) {
    final capability = call.capability!;
    if (capability == Capability.mobileUse) {
      return l10n.capabilityPermissionRequiredAccessibility;
    }
    return capabilityLabel(l10n, capability);
  }

  String _title(AppLocalizations l10n) {
    final capability = call.capability;
    if (capability == null) return call.name;
    return capabilityLabel(l10n, capability);
  }

  /// 卡片说明 —— 能力工具说「模型想做什么」；
  /// 普通工具沿用注册表里那一句（那是**给模型**的说明）。
  String? _description(AppLocalizations l10n) {
    final capability = call.capability;
    if (capability != null) {
      // ⚠️ 带**工具名** ⇒ ⇒ 「手机操作」那一族六个工具能各说各的话
      // ⇒ ⇒ 否则用户在「允许」那颗按钮前面只看到一句含糊的「要操作这台手机」。
      return capabilityRequestText(l10n, capability, toolName: call.name);
    }
    final description = call.description;
    if (description == null || description.isEmpty) return null;
    return description;
  }

  /// 能力工具的参数摘要。
  String _summary(AppLocalizations l10n) {
    final capability = call.capability;
    if (capability == null) return '';
    return capabilityArgsSummary(
      l10n,
      capability,
      call.args,
      toolName: call.name,
    );
  }

  Color _accentFor(BuildContext context) {    switch (call.status) {
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
      child: Text(label, style: TextStyle(fontSize: 11, color: color)),
    );
  }
}
