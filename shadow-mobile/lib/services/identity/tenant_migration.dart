import '../app_config_service.dart';
import '../prefrontal_client.dart';

/// 兜底租户 —— 「背后没有人」时读写的就是这一桶。
///
/// 海马体自己省略租户时也回落 `"default"`
/// （`hippocampus-server/src/handlers.rs` 的 `unwrap_or("default")`）。
const String fallbackTenantId = 'default';

/// 一次迁移的结果。
class TenantMigrationResult {
  /// 流程跑了没有（跑了但没东西可搬也是 true）。
  final bool ran;

  /// 没跑的原因。
  final String? reason;

  /// 复制过去了几条记忆。
  final int memoriesCopied;

  /// 复制过去了几条任务。
  final int tasksCopied;

  /// 逐条的错误 —— 有错就不写标记，下次还会再试。
  final List<String> errors;

  const TenantMigrationResult({
    required this.ran,
    this.reason,
    this.memoriesCopied = 0,
    this.tasksCopied = 0,
    this.errors = const [],
  });
}

/// 把 `default` 桶里的记忆与任务**复制**到账号人格桶。
///
/// ## 为什么需要它
///
/// 客户端以前把租户写死成 `'default'`，端脑写记忆却按账号人格分区 ⇒
/// **两边的数据不在同一个桶里**。切到人格桶之后，`default` 桶里的老数据
/// 就「没人看得见」了。
///
/// ## 三个契约（都对着 hippocampus 源码核过）
///
/// 1. **记忆没有 upsert** —— `POST /api/memory` 永远**追加新行**，按 uri
///    改只能 `PUT /api/memory/{id}`，而 `PUT` **不能改 tenant** ⇒ 搬家
///    只能「复制」。
/// 2. **任务的键是 `{tenant_id}::{task_id}`**
///    （`hippocampus-core/src/task.rs`）⇒ 换个租户 upsert 得到的是**新
///    租户里的新一行**，也是复制。
/// 3. `GET /api/memory?tenantId=` 省略租户时回落 `"default"` ⇒ 显式写
///    `default` 和不写是同一个桶。
///
/// ## 为什么是「复制」而不是「搬走」
///
/// 端脑在没有账号时**也**用 `"default"` 桶 ⇒ 把旧桶清空，等于**把「这台
/// 机器还没有身份时」的那段历史永久删掉**。留着旧桶只是留一份副本。
///
/// ## 幂等
///
/// - 记忆：**按 uri 去重**（目标桶里已经有这个 uri 就不重复复制）；
/// - 任务：同一个 taskId 在目标桶里 upsert 是覆盖，重复跑不会多出副本；
/// - 整体：**一台设备只搬一次**（标记存在 `AppConfigService`）—— 标记是
///   全局的而不是按人格分的，否则「换了个账号」会把上一个账号的遗留数据
///   搬进新账号。
Future<TenantMigrationResult> migrateLegacyTenant({
  required PrefrontalClient client,
  required String targetTenant,
  AppConfigService? config,
}) async {
  final cfg = config ?? AppConfigService();

  if (targetTenant.isEmpty || targetTenant == fallbackTenantId) {
    return const TenantMigrationResult(
      ran: false,
      reason: 'target-is-default',
    );
  }
  if (cfg.tenantMigrationTarget != null) {
    return const TenantMigrationResult(
      ran: false,
      reason: 'already-migrated',
    );
  }

  var memoriesCopied = 0;
  var tasksCopied = 0;
  final errors = <String>[];

  // ---- 记忆 ----
  try {
    final source = await client.listMemories(tenantId: fallbackTenantId);
    final target = await client.listMemories(tenantId: targetTenant);
    final targetUris = target.map((m) => m.uri).toSet();

    for (final memory in source) {
      if (memory.uri.isNotEmpty && targetUris.contains(memory.uri)) {
        continue; // 那边已经有了
      }
      try {
        await client.copyMemory(
          uri: memory.uri.isEmpty ? 'memory://migrated-${memory.id}' : memory.uri,
          content: memory.content,
          dimension: memory.dimension,
          tenantId: targetTenant,
        );
        targetUris.add(memory.uri);
        memoriesCopied++;
      } catch (e) {
        errors.add('memory ${memory.uri}: $e');
      }
    }
  } catch (e) {
    errors.add('memories: $e');
  }

  // ---- 任务 ----
  try {
    final tasks = await client.getTasks(tenantId: fallbackTenantId);
    for (final task in tasks) {
      try {
        await client.copyTaskToTenant(
          taskId: task.id,
          fromTenant: fallbackTenantId,
          toTenant: targetTenant,
        );
        tasksCopied++;
      } catch (e) {
        errors.add('task ${task.id}: $e');
      }
    }
  } catch (e) {
    errors.add('tasks: $e');
  }

  // 一条都没出错才写标记 —— 出错了下次还能重试（靠 uri 去重兜底）。
  if (errors.isEmpty) {
    await cfg.setTenantMigrationTarget(targetTenant);
  }

  return TenantMigrationResult(
    ran: true,
    memoriesCopied: memoriesCopied,
    tasksCopied: tasksCopied,
    errors: errors,
  );
}
