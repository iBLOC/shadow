import 'package:a2ui_core/a2ui_core.dart';
import 'package:a2ui_flutter/a2ui_flutter.dart';
import 'package:flutter/material.dart';
import 'package:json_schema_builder/json_schema_builder.dart';

/// 官方 v1.0 基础目录 id —— 标准组件（`Column` / `Text`）从这儿来。
const String basicCatalogId =
    'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

/// 本仓自建目录 id —— **逐字与端脑一致**。
///
/// ⚠️ 端脑在每个自定义组件上写 `catalogId` 指它
/// （`telencephalon/src/a2a/a2ui_v1.rs` 的 `SHADOW_CATALOG_ID`）
/// ⇒ ⇒ 两端必须**一字不差** ⇒ 改一边就要改另一边。
const String shadowCatalogId =
    'https://raw.githubusercontent.com/iBLOC/shadow/main/a2ui/catalogs/v1/catalog.json';

/// 本仓自建目录 —— **只有两个组件**。
///
/// ⚠️ 为什么不是「基础目录 ＋ 我们两个」而是**单独一个目录**：
/// v1.0 的解析顺序是「组件上的 `catalogId` ⇒ 面的默认 `catalogId`」
/// ⇒ ⇒ 标准组件走**面的默认**（官方基础目录），
/// 两个业务组件在自己的 `catalogId` 里找我们这份 ⇒ ⇒ 两边不必硬耦合。
CatalogImplementation shadowCatalog() => CatalogImplementation(
      id: shadowCatalogId,
      components: [taskCardComponent, agentStatusIndicatorComponent],
      protocolVersion: A2uiProtocolVersion.v1_0,
      instructions:
          'Shadow 自建目录：`TaskCard`（title/description/status/priority）'
          '与 `AgentStatusIndicator`（agentName/status/message）。',
    );

/// `TaskCard` —— 任务看板上的那张卡。
///
/// ⚠️ **status / priority 是协议值** —— 原样显示、不翻译
/// （桌面端那份也是原样显示 ⇒ 两端对同一个 surface 的说法必须一致）。
final ComponentImplementation taskCardComponent = ComponentImplementation(
  name: 'TaskCard',
  schema: Schema.fromMap(const <String, Object?>{
    'type': 'object',
    'properties': <String, Object?>{
      'component': <String, Object?>{'const': 'TaskCard'},
      'title': <String, Object?>{'type': 'string'},
      'description': <String, Object?>{'type': 'string'},
      'status': <String, Object?>{
        'type': 'string',
        // ⚠️ **五档** —— 端脑会把 `cancelled` / `overdue` 也发过来
        // （`telencephalon/src/a2a/a2ui_v1.rs` 的 `task_status_label`）
        // ⇒ ⇒ 枚举少一档 ⇒ 官方 SDK 的校验会**拒掉这条消息**
        // ⇒ ⇒ 界面「什么都没有」⇒ 失败长得像成功。
        'enum': <Object?>[
          'pending',
          'in_progress',
          'completed',
          'cancelled',
          'overdue',
        ],
      },
      'priority': <String, Object?>{
        'type': 'string',
        'enum': <Object?>['low', 'medium', 'high'],
      },
    },
    'required': <Object?>['component', 'title'],
  }),
  builder: (context, node, props, buildChild) {
    final status = props.string('status') ?? 'pending';
    final priority = props.string('priority') ?? 'medium';

    // ⚠️ **不认识的值不许当成「没事」** —— 落灰（看不懂），
    // 不落绿（看起来健康）⇒ 失败不许长得像成功。
    final (statusColor, statusIcon) = switch (status) {
      'in_progress' => (Colors.blue, Icons.play_circle_outline),
      'completed' => (Colors.green, Icons.check_circle_outline),
      _ => (Colors.grey, Icons.circle_outlined),
    };
    final priorityColor = switch (priority) {
      'high' => Colors.red,
      'medium' => Colors.orange,
      _ => Colors.green,
    };
    final description = props.string('description');

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
                    props.string('title') ?? '',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
            if (description != null && description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                description,
                style: TextStyle(color: Colors.grey[600], fontSize: 14),
              ),
            ],
          ],
        ),
      ),
    );
  },
);

/// `AgentStatusIndicator` —— 叶区状态那一枚。
///
/// ⚠️ **缺 status 声明 ≠ 「就绪」** ⇒ 缺省落 `unknown`（灰），
/// 不落 `idle`（绿）—— 「没说」和「没事」是两件事。
final ComponentImplementation agentStatusIndicatorComponent =
    ComponentImplementation(
  name: 'AgentStatusIndicator',
  schema: Schema.fromMap(const <String, Object?>{
    'type': 'object',
    'properties': <String, Object?>{
      'component': <String, Object?>{'const': 'AgentStatusIndicator'},
      'agentName': <String, Object?>{'type': 'string'},
      'status': <String, Object?>{
        'type': 'string',
        'enum': <Object?>[
          'idle',
          'thinking',
          'executing',
          'error',
          'unknown',
        ],
      },
      'message': <String, Object?>{'type': 'string'},
    },
    'required': <Object?>['component', 'agentName'],
  }),
  builder: (context, node, props, buildChild) {
    final status = props.string('status') ?? 'unknown';

    final (statusColor, statusIcon) = switch (status) {
      'idle' => (Colors.green, Icons.circle),
      'thinking' => (Colors.purple, Icons.psychology),
      'executing' => (Colors.blue, Icons.play_arrow),
      'error' => (Colors.red, Icons.error_outline),
      // ⚠️ **「我们不知道」不是「没事」** —— 端脑从没探活过的叶区
      // （占位记录）就是这一档 ⇒ 灰 ＋ 问号，不是绿灯。
      _ => (Colors.grey, Icons.help_outline),
    };

    final message = props.string('message');
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
            props.string('agentName') ?? '',
            style: TextStyle(fontWeight: FontWeight.w500, color: statusColor),
          ),
          if (message != null && message.isNotEmpty) ...[
            const SizedBox(width: 8),
            Text(
              '- $message',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ],
      ),
    );
  },
);
