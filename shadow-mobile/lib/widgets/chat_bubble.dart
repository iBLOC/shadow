import 'package:flutter/material.dart';

import '../services/telencephalon/telencephalon_client.dart';
import 'responsive.dart';
import 'visual_qa_clarification_chip.dart';

class ChatMessage {
  final String content;
  final MessageRole role;
  final ClarificationPayload? clarification;

  ChatMessage._(this.content, this.role, {this.clarification});

  factory ChatMessage.user(String content) =>
      ChatMessage._(content, MessageRole.user);

  factory ChatMessage.assistant(String content) =>
      ChatMessage._(content, MessageRole.assistant);

  factory ChatMessage.system(String content) =>
      ChatMessage._(content, MessageRole.system);

  factory ChatMessage.assistantWithClarification(
    String content,
    ClarificationPayload clarification,
  ) => ChatMessage._(
    content,
    MessageRole.assistant,
    clarification: clarification,
  );
}

enum MessageRole { user, assistant, system }

class MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final void Function(ClarificationCandidate candidate)? onClarificationPick;

  const MessageBubble({
    super.key,
    required this.message,
    this.onClarificationPick,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == MessageRole.user;
    final isSystem = message.role == MessageRole.system;

    if (message.clarification != null && !isUser) {
      return Align(
        alignment: Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: cappedBubbleWidth(context, fraction: 0.9, cap: 560),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (message.content.isNotEmpty)
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest
                        .withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    message.content,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
              VisualQaClarificationChip(
                clarification: message.clarification!,
                onPick: (c) => onClarificationPick?.call(c),
              ),
            ],
          ),
        ),
      );
    }

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(
          maxWidth: cappedBubbleWidth(context, fraction: 0.75, cap: 480),
        ),
        decoration: BoxDecoration(
          color: isUser
              ? Theme.of(context).colorScheme.primary
              : isSystem
              ? Theme.of(context).colorScheme.errorContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
          // 助手回复是一张**卡片**（与桌面端同一条样式：border border-border
          // bg-card）—— 用户气泡实底主色、系统气泡错误底色，都不描边。
          border:
              isUser || isSystem
                  ? null
                  : Border.all(
                    color: Theme.of(context).colorScheme.outlineVariant,
                  ),
        ),
        child: Text(
          message.content,
          style: TextStyle(
            color: isUser
                ? Theme.of(context).colorScheme.onPrimary
                : isSystem
                ? Theme.of(context).colorScheme.onErrorContainer
                : Theme.of(context).colorScheme.onSurface,
          ),
        ),
      ),
    );
  }
}

/// 卡片下方那一行小字：时间（左）＋ token 读数徽章。
///
/// 纯展示件 —— 数字由调用方格式化；布局与桌面端 ConversationPage 的
/// meta 行同一条：时间 · 「N tokens · X.X tok/s」小徽章（bg-muted、
/// mono、10px）。两个字段都是 null ⇒ 什么都不画。
class MessageMetaRow extends StatelessWidget {
  final String? timeText;
  final String? statsText;

  const MessageMetaRow({super.key, this.timeText, this.statsText});

  @override
  Widget build(BuildContext context) {
    final time = timeText;
    final stats = statsText;
    if (time == null && stats == null) return const SizedBox.shrink();
    final secondary = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (time != null)
            Text(time, style: TextStyle(fontSize: 11, color: secondary)),
          if (time != null && stats != null) const SizedBox(width: 8),
          if (stats != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                stats,
                style: TextStyle(
                  fontSize: 10,
                  color: secondary,
                  fontFamily: 'monospace',
                ),
              ),
            ),
        ],
      ),
    );
  }
}
