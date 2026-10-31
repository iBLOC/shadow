import 'package:flutter/material.dart';
import 'package:genui/genui.dart';
import 'package:json_schema_builder/json_schema_builder.dart';

class ShadowCatalog {
  static Catalog create() {
    return CoreCatalogItems.asCatalog().copyWith([
      _taskCard,
      _memoryCard,
      _agentStatusIndicator,
      _progressStepper,
      _notificationToast,
      _toolCallCard,
      _conversationBubble,
      _quickActionButton,
    ]);
  }
}

final _taskCard = CatalogItem(
  name: 'TaskCard',
  dataSchema: S.object(
    properties: {
      'title': S.string(description: 'Task title'),
      'description': S.string(description: 'Task description'),
      'status': S.string(description: 'pending|in_progress|completed'),
      'priority': S.string(description: 'low|medium|high'),
    },
    required: ['title'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final status = data['status'] as String? ?? 'pending';
    final priority = data['priority'] as String? ?? 'medium';

    Color statusColor;
    IconData statusIcon;
    switch (status) {
      case 'in_progress':
        statusColor = Colors.blue;
        statusIcon = Icons.play_circle_outline;
        break;
      case 'completed':
        statusColor = Colors.green;
        statusIcon = Icons.check_circle_outline;
        break;
      default:
        statusColor = Colors.grey;
        statusIcon = Icons.circle_outlined;
    }

    Color priorityColor;
    switch (priority) {
      case 'high':
        priorityColor = Colors.red;
        break;
      case 'medium':
        priorityColor = Colors.orange;
        break;
      default:
        priorityColor = Colors.green;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(statusIcon, color: statusColor, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    data['title'] as String? ?? '',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: priorityColor.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    priority.toUpperCase(),
                    style: TextStyle(fontSize: 10, color: priorityColor),
                  ),
                ),
              ],
            ),
            if (data['description'] != null) ...[
              const SizedBox(height: 8),
              Text(
                data['description'] as String,
                style: TextStyle(color: Colors.grey[600], fontSize: 14),
              ),
            ],
          ],
        ),
      ),
    );
  },
);

final _memoryCard = CatalogItem(
  name: 'MemoryCard',
  dataSchema: S.object(
    properties: {
      'content': S.string(description: 'Memory content'),
      'timestamp': S.string(description: 'Creation timestamp'),
      'type': S.string(description: 'fact|conversation|entity'),
    },
    required: ['content'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final type = data['type'] as String? ?? 'fact';

    IconData typeIcon;
    Color typeColor;
    switch (type) {
      case 'conversation':
        typeIcon = Icons.chat_bubble_outline;
        typeColor = Colors.purple;
        break;
      case 'entity':
        typeIcon = Icons.person_outline;
        typeColor = Colors.blue;
        break;
      default:
        typeIcon = Icons.lightbulb_outline;
        typeColor = Colors.amber;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(typeIcon, color: typeColor, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data['content'] as String? ?? '',
                    style: const TextStyle(fontSize: 14),
                  ),
                  if (data['timestamp'] != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      data['timestamp'] as String,
                      style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  },
);

final _agentStatusIndicator = CatalogItem(
  name: 'AgentStatusIndicator',
  dataSchema: S.object(
    properties: {
      'agentName': S.string(description: 'Name of the agent'),
      'status': S.string(
        description: 'idle|thinking|executing|error|unknown',
      ),
      'message': S.string(description: 'Current status message'),
    },
    required: ['agentName'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    // ⚠️ **缺 status 声明 ≠ 「就绪」** ⇒ 缺省落 `unknown`（灰），
    // 不落 `idle`（绿）—— 「没说」和「没事」是两件事。
    // ⚠️ **缺 status 声明 ≠ 「就绪」** ⇒ 缺省落 `unknown`（灰），
    // 不落 `idle`（绿）—— 「没说」和「没事」是两件事。
    final status = data['status'] as String? ?? 'unknown';

    Color statusColor;
    IconData statusIcon;
    switch (status) {
      case 'idle':
        statusColor = Colors.green;
        statusIcon = Icons.circle;
        break;
      case 'thinking':
        statusColor = Colors.purple;
        statusIcon = Icons.psychology;
        break;
      case 'executing':
        statusColor = Colors.blue;
        statusIcon = Icons.play_arrow;
        break;
      case 'error':
        statusColor = Colors.red;
        statusIcon = Icons.error_outline;
        break;
      case 'unknown':
        // ⚠️ **「我们不知道」不是「没事」** ——
        // 端脑从没探活过的叶区（占位记录）就是这一档。
        statusColor = Colors.grey;
        statusIcon = Icons.help_outline;
        break;
      default:
        // ⚠️ **不认识的值不许当成「没事」** ——
        // 以前 default 是绿色 ⇒ 端脑一旦多说一个词，手机上就是一片绿灯
        // ⇒ 典型的「失败长得像成功」。
        //
        // ⚠️ 而且手机这一侧**只显示颜色、不显示 status 文本** ⇒
        // 颜色就是全部的话 ⇒ 落绿 = 撒谎。
        // ⇒ 现在 default 与 `unknown` 同档：顶多「看不懂」，绝不「看起来健康」。
        statusColor = Colors.grey;
        statusIcon = Icons.help_outline;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: statusColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(statusIcon, color: statusColor, size: 16),
          const SizedBox(width: 8),
          Text(
            data['agentName'] as String? ?? '',
            style: TextStyle(fontWeight: FontWeight.w500, color: statusColor),
          ),
          if (data['message'] != null) ...[
            const SizedBox(width: 8),
            Text(
              '- ${data['message']}',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ],
      ),
    );
  },
);

final _progressStepper = CatalogItem(
  name: 'ProgressStepper',
  dataSchema: S.object(
    properties: {
      'steps': S.string(description: 'Pipe-separated list of step names'),
      'currentStep': S.number(description: 'Current step index (0-based)'),
      'status': S.string(description: 'pending|in_progress|completed'),
    },
    required: ['steps', 'currentStep'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final stepsRaw = data['steps'] as String? ?? '';
    final steps = stepsRaw.isEmpty ? <String>[] : stepsRaw.split('|');
    final currentStep = (data['currentStep'] as num?)?.toInt() ?? 0;
    final status = data['status'] as String? ?? 'pending';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  status == 'completed' ? Icons.check_circle : Icons.pending,
                  color: status == 'completed' ? Colors.green : Colors.blue,
                  size: 20,
                ),
                const SizedBox(width: 8),
                const Text(
                  'Progress',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...List.generate(steps.length, (index) {
              final isCompleted = index < currentStep;
              final isCurrent = index == currentStep;
              final isPending = index > currentStep;

              Color stepColor;
              IconData stepIcon;
              if (isCompleted) {
                stepColor = Colors.green;
                stepIcon = Icons.check;
              } else if (isCurrent) {
                stepColor = status == 'in_progress' ? Colors.blue : Colors.grey;
                stepIcon = Icons.play_arrow;
              } else {
                stepColor = Colors.grey;
                stepIcon = Icons.circle_outlined;
              }

              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: stepColor.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(stepIcon, color: stepColor, size: 14),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        steps[index],
                        style: TextStyle(
                          color: isPending ? Colors.grey : null,
                          fontWeight: isCurrent ? FontWeight.bold : null,
                        ),
                      ),
                    ),
                    if (isCurrent && status == 'in_progress')
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.blue,
                        ),
                      ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  },
);

final _notificationToast = CatalogItem(
  name: 'NotificationToast',
  dataSchema: S.object(
    properties: {
      'type': S.string(description: 'success|error|warning|info'),
      'title': S.string(description: 'Notification title'),
      'message': S.string(description: 'Notification message'),
      'duration': S.number(description: 'Display duration in ms'),
    },
    required: ['type', 'title'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final type = data['type'] as String? ?? 'info';

    IconData icon;
    Color color;
    switch (type) {
      case 'success':
        icon = Icons.check_circle;
        color = Colors.green;
        break;
      case 'error':
        icon = Icons.error;
        color = Colors.red;
        break;
      case 'warning':
        icon = Icons.warning;
        color = Colors.orange;
        break;
      default:
        icon = Icons.info;
        color = Colors.blue;
    }

    return Container(
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  data['title'] as String? ?? '',
                  style: TextStyle(fontWeight: FontWeight.bold, color: color),
                ),
                if (data['message'] != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    data['message'] as String,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  },
);

final _toolCallCard = CatalogItem(
  name: 'ToolCallCard',
  dataSchema: S.object(
    properties: {
      'toolName': S.string(description: 'Name of the tool being called'),
      'parameters': S.object(
        description: 'Tool parameters',
        additionalProperties: S.string(),
      ),
      'status': S.string(description: 'executing|completed|error'),
      'result': S.string(description: 'Tool execution result'),
      'duration': S.number(description: 'Execution duration in ms'),
    },
    required: ['toolName', 'status'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final status = data['status'] as String? ?? 'executing';
    final duration = (data['duration'] as num?)?.toInt();

    Color statusColor;
    IconData statusIcon;
    switch (status) {
      case 'completed':
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        break;
      case 'error':
        statusColor = Colors.red;
        statusIcon = Icons.error;
        break;
      default:
        statusColor = Colors.blue;
        statusIcon = Icons.play_circle;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (status == 'executing')
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.blue,
                    ),
                  )
                else
                  Icon(statusIcon, color: statusColor, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    data['toolName'] as String? ?? '',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (duration != null)
                  Text(
                    '${duration}ms',
                    style: TextStyle(fontSize: 10, color: Colors.grey[500]),
                  ),
              ],
            ),
            if (data['parameters'] != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  (data['parameters'] as Map).entries
                      .map((e) => '${e.key}: ${e.value}')
                      .join('\n'),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
                ),
              ),
            ],
            if (data['result'] != null && status == 'completed') ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  data['result'] as String,
                  style: TextStyle(fontSize: 11, color: Colors.grey[700]),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  },
);

final _conversationBubble = CatalogItem(
  name: 'ConversationBubble',
  dataSchema: S.object(
    properties: {
      'content': S.string(description: 'Message content'),
      'role': S.string(description: 'user|assistant|system'),
      'timestamp': S.string(description: 'ISO timestamp'),
      'isStreaming': S.boolean(description: 'Whether message is streaming'),
    },
    required: ['content', 'role'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final role = data['role'] as String? ?? 'assistant';
    final isStreaming = data['isStreaming'] as bool? ?? false;

    final isUser = role == 'user';
    final bubbleColor = isUser ? Colors.blue : Colors.grey[200]!;
    final textColor = isUser ? Colors.white : Colors.black87;
    final alignment = isUser ? Alignment.centerRight : Alignment.centerLeft;

    return Align(
      alignment: alignment,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
        padding: const EdgeInsets.all(12),
        constraints: const BoxConstraints(maxWidth: 280),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: isUser
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isUser)
                  Icon(Icons.psychology, size: 14, color: Colors.purple[300]),
                if (!isUser) const SizedBox(width: 4),
                Text(
                  isUser ? 'You' : 'Assistant',
                  style: TextStyle(
                    fontSize: 10,
                    color: isUser ? Colors.white70 : Colors.purple[300],
                  ),
                ),
                if (isStreaming) ...[
                  const SizedBox(width: 4),
                  SizedBox(
                    width: 8,
                    height: 8,
                    child: CircularProgressIndicator(
                      strokeWidth: 1,
                      color: isUser ? Colors.white70 : Colors.purple[300],
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 4),
            Text(
              data['content'] as String? ?? '',
              style: TextStyle(color: textColor),
            ),
            if (data['timestamp'] != null) ...[
              const SizedBox(height: 4),
              Text(
                data['timestamp'] as String,
                style: TextStyle(
                  fontSize: 9,
                  color: isUser ? Colors.white54 : Colors.grey[500],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  },
);

final _quickActionButton = CatalogItem(
  name: 'QuickActionButton',
  dataSchema: S.object(
    properties: {
      'label': S.string(description: 'Button label'),
      'icon': S.string(description: 'Icon name'),
      'action': S.string(description: 'Action type'),
    },
    required: ['label'],
  ),
  widgetBuilder: (context) {
    final data = context.data as Map<String, Object?>;
    final iconName = data['icon'] as String? ?? 'play_arrow';

    final iconMap = {
      'play_arrow': Icons.play_arrow,
      'pause': Icons.pause,
      'stop': Icons.stop,
      'refresh': Icons.refresh,
      'settings': Icons.settings,
      'search': Icons.search,
      'add': Icons.add,
      'delete': Icons.delete,
      'edit': Icons.edit,
      'send': Icons.send,
    };

    return ElevatedButton.icon(
      onPressed: () {},
      icon: Icon(iconMap[iconName] ?? Icons.play_arrow, size: 18),
      label: Text(data['label'] as String? ?? ''),
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  },
);
