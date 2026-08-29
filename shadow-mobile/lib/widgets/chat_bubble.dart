import 'package:flutter/material.dart';
import '../services/cortex/cortex_client.dart';
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
  ) =>
      ChatMessage._(content, MessageRole.assistant, clarification: clarification);
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
            maxWidth: MediaQuery.of(context).size.width * 0.9,
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
                    color: Theme.of(context)
                        .colorScheme
                        .surfaceContainerHighest
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
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        decoration: BoxDecoration(
          color: isUser
              ? Theme.of(context).colorScheme.primary
              : isSystem
              ? Theme.of(context).colorScheme.errorContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
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
