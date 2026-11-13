import 'dart:ui';

import 'package:flutter/material.dart';

/// 长按消息 / 错误横幅弹出的操作菜单里，用户选的那个动作。
enum MessageAction {
  copy,
  copyJson,
  copyConversationJson,
  retry,
  undo,
  dismiss,
}

/// 菜单文案 —— 由调用方从 l10n 取（这个文件不 import 生成代码，
/// 桌面/测试环境里没有 ~AppLocalizations~ 也能实例化）。
class MessageActionLabels {
  final String copy;
  final String copyJson;
  final String copyConversationJson;
  final String retry;
  final String undo;
  final String cancel;

  const MessageActionLabels({
    required this.copy,
    required this.copyJson,
    required this.copyConversationJson,
    required this.retry,
    required this.undo,
    required this.cancel,
  });
}

/// 毛玻璃操作菜单。
///
/// 「毛玻璃」的实现 = 底板是**半透明**色 ＋ [BackdropFilter] 把**背后的
/// 内容**模糊掉（sigma 18）⇒ 菜单浮在对话上、对话还隐约看得见 ⇒
/// 长按的那条消息不丢上下文。
///
/// 返回用户选的动作；点在菜单外 / 点「取消」⇒ [MessageAction.dismiss]。
Future<MessageAction?> showMessageActionSheet(
  BuildContext context, {
  required bool canCopy,
  bool canCopyJson = false,
  bool canCopyConversationJson = false,
  required bool canRetry,
  required bool canUndo,
  required MessageActionLabels labels,
}) {
  return showModalBottomSheet<MessageAction>(
    context: context,
    backgroundColor: Colors.transparent,
    // 遮罩本身淡淡的 —— 主要的「遮」由菜单自己的模糊完成，
    // 否则背后全黑，毛玻璃就只剩玻璃没有毛了。
    barrierColor: Colors.black.withValues(alpha: 0.25),
    builder: (context) => _GlassActionSheet(
      canCopy: canCopy,
      canCopyJson: canCopyJson,
      canCopyConversationJson: canCopyConversationJson,
      canRetry: canRetry,
      canUndo: canUndo,
      labels: labels,
    ),
  );
}

class _GlassActionSheet extends StatelessWidget {
  final bool canCopy;
  final bool canCopyJson;
  final bool canCopyConversationJson;
  final bool canRetry;
  final bool canUndo;
  final MessageActionLabels labels;

  const _GlassActionSheet({
    required this.canCopy,
    required this.canCopyJson,
    required this.canCopyConversationJson,
    required this.canRetry,
    required this.canUndo,
    required this.labels,
  });

  void _pick(BuildContext context, MessageAction action) =>
      Navigator.of(context).pop(action);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: Container(
              decoration: BoxDecoration(
                color: scheme.surface.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: scheme.outlineVariant, width: 0.5),
              ),
              child: SingleChildScrollView(
                // 动作变多之后（复制 / 复制 JSON / 复制聊天记录 / 重试 /
                // 撤销 / 取消），矮屏上这一列会超过 bottom sheet 的默认
                // 高度（约 9/16 屏）⇒ ⇒ 不滚就是 RenderFlex overflow
                // （黄黑条纹 + 最后一项点不到）。滚起来：宁可多划一下，
                // 不许有一项被裁掉。
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (canCopy)
                      _ActionTile(
                        icon: Icons.copy_all_outlined,
                        label: labels.copy,
                        onTap: () => _pick(context, MessageAction.copy),
                      ),
                    // 调试用：给开发 agent 贴上下文，不是给人读的纯文本。
                    // 放在「复制」之下、重试之上 —— 它是复制的一种，只是
                    // 载荷换成带信封的 JSON。
                    if (canCopyJson)
                      _ActionTile(
                        icon: Icons.data_object,
                        label: labels.copyJson,
                        onTap: () => _pick(context, MessageAction.copyJson),
                      ),
                    if (canCopyConversationJson)
                      _ActionTile(
                        icon: Icons.article_outlined,
                        label: labels.copyConversationJson,
                        onTap: () =>
                            _pick(context, MessageAction.copyConversationJson),
                      ),
                    if (canRetry) ...[
                      if (canCopy || canCopyJson || canCopyConversationJson)
                        Divider(height: 1, color: scheme.outlineVariant),
                      _ActionTile(
                        icon: Icons.refresh,
                        label: labels.retry,
                        onTap: () => _pick(context, MessageAction.retry),
                      ),
                    ],
                    if (canUndo) ...[
                      Divider(height: 1, color: scheme.outlineVariant),
                      _ActionTile(
                        icon: Icons.undo,
                        label: labels.undo,
                        onTap: () => _pick(context, MessageAction.undo),
                      ),
                    ],
                    Divider(height: 1, color: scheme.outlineVariant),
                    _ActionTile(
                      icon: Icons.close,
                      label: labels.cancel,
                      onTap: () => _pick(context, MessageAction.dismiss),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        alignment: Alignment.centerLeft,
        child: Row(
          children: [
            Icon(icon, size: 20, color: scheme.onSurface),
            const SizedBox(width: 14),
            Text(
              label,
              style: TextStyle(fontSize: 15, color: scheme.onSurface),
            ),
          ],
        ),
      ),
    );
  }
}
