import { hippocampusClient } from './hippocampusClient';
import { prefrontalClient } from './prefrontalClient';
import { FALLBACK_TENANT_ID } from './tenant';

/**
 * 一次性迁移：把 `"default"` 桶里的东西搬到账号人格桶。
 *
 * ## 为什么需要它
 *
 * 客户端以前把租户写死成 `'default'`，端脑写记忆却按账号人格分区 ⇒
 * **两边的数据不在同一个桶里**。切到人格桶之后，`default` 桶里的老数据
 * 就「没人看得见」了 —— 主题色、旧的偏好、看板上的历史任务，全都消失。
 *
 * 用户拍板的是「**切 + 一次性迁移**」：先把 `default` 桶里的东西复制到
 * 人格桶，之后读写只认人格桶。
 *
 * ## 三个契约（都对着 hippocampus 源码核过）
 *
 * 1. **记忆没有 upsert** —— `POST /api/memory` 永远**追加新行**
 *    （`hippocampus-server/src/handlers.rs` 的 `add_memory`），按 uri 改
 *    只能 `PUT /api/memory/{id}`，而 `PUT` **不能改 tenant**
 *    （只能改 content / dimension）⇒ 搬家只能「复制 + 删旧行」。
 * 2. **任务的键是 `{tenant_id}::{task_id}`**（`hippocampus-core/src/task.rs`
 *    的 `InMemoryTaskBackend::save`）⇒ 同一个 taskId 换个租户 upsert，得到
 *    的是**新租户里的新一行**，不是搬家 ⇒ 也是「复制」。
 * 3. `GET /api/memory?tenantId=` 省略租户时回落 `"default"`
 *    （`list_memories` 的 `unwrap_or("default")`）⇒ 显式写 `default` 和
 *    不写是同一个桶。
 *
 * ## 为什么是「复制」而不是「搬走」
 *
 * 端脑在没有账号时**也**用 `"default"` 桶（`hippo_store::hippo_auth()` 的
 * 回退分支）。所以把 `default` 清空，等于**把「这台机器还没有身份时」的
 * 那段历史永久删掉** —— 用户一旦把账号换掉/撤掉，就再也回不去了。
 * 留着旧桶只是留一份副本，代价可以忽略。
 *
 * ## 幂等
 *
 * - 记忆：**按 uri 去重** —— 目标桶里已经有这个 uri 就不重复复制；
 * - 任务：同一个 taskId 在目标桶里 upsert 是覆盖，重复跑不会多出副本；
 * - 整体：**一个设备只搬一次**（localStorage 标记）—— 标记是全局的而不是
 *   按人格分的，否则「换了个账号」会把上一个账号的遗留数据搬进新账号。
 */

/** 迁移标记的 localStorage 键。 */
export const TENANT_MIGRATION_KEY = 'shadow-tenant-migration-v1';

/** 一次搬多少条 —— 海马体 `list_memories` 默认只给 50 条。 */
const PAGE_LIMIT = 500;

export interface TenantMigrationResult {
  /** 流程跑了没有（跑了但没东西可搬也是 true）。 */
  ran: boolean;
  /** 没跑的原因。 */
  reason?: 'target-is-default' | 'already-migrated';
  /** 复制过去了几条记忆。 */
  memoriesCopied: number;
  /** 复制过去了几条任务。 */
  tasksCopied: number;
  /** 逐条的错误 —— 有错就不写标记，下次还会再试。 */
  errors: string[];
}

const msg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

function readMarker(): string | null {
  try {
    return localStorage.getItem(TENANT_MIGRATION_KEY);
  } catch {
    return null;
  }
}

function writeMarker(targetTenant: string): void {
  try {
    localStorage.setItem(
      TENANT_MIGRATION_KEY,
      JSON.stringify({ target: targetTenant, at: new Date().toISOString() })
    );
  } catch {
    // 存不下标记（隐私模式等）⇒ 下次还会再跑一遍；靠 uri 去重兜底。
  }
}

/**
 * 把 `"default"` 桶里的记忆与任务复制到 [targetTenant]。
 *
 * **不删旧行** —— 理由见文件头的「为什么是复制而不是搬走」。
 */
export async function migrateLegacyTenant(
  targetTenant: string
): Promise<TenantMigrationResult> {
  const result: TenantMigrationResult = {
    ran: false,
    memoriesCopied: 0,
    tasksCopied: 0,
    errors: [],
  };

  if (!targetTenant || targetTenant === FALLBACK_TENANT_ID) {
    result.reason = 'target-is-default';
    return result;
  }
  if (readMarker()) {
    result.reason = 'already-migrated';
    return result;
  }

  result.ran = true;

  // ---- 记忆 ----
  try {
    const [source, target] = await Promise.all([
      hippocampusClient.listMemories({
        tenantId: FALLBACK_TENANT_ID,
        limit: PAGE_LIMIT,
      }),
      hippocampusClient.listMemories({
        tenantId: targetTenant,
        limit: PAGE_LIMIT,
      }),
    ]);

    const targetUris = new Set(target.map((m) => m.uri));
    for (const memory of source) {
      if (targetUris.has(memory.uri)) continue; // 那边已经有了
      try {
        await hippocampusClient.addMemory({
          uri: memory.uri,
          content: memory.content,
          dimension: memory.dimension,
          sessionId: memory.sessionId,
          tenantId: targetTenant,
        });
        targetUris.add(memory.uri);
        result.memoriesCopied += 1;
      } catch (e) {
        result.errors.push(`memory ${memory.uri}: ${msg(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`memories: ${msg(e)}`);
  }

  // ---- 任务 ----
  try {
    const tasks = await prefrontalClient.listTasks(FALLBACK_TENANT_ID, {
      silent: true,
    });
    for (const task of tasks) {
      try {
        await prefrontalClient.copyTaskToTenant(
          FALLBACK_TENANT_ID,
          targetTenant,
          task.task_id
        );
        result.tasksCopied += 1;
      } catch (e) {
        result.errors.push(`task ${task.task_id}: ${msg(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`tasks: ${msg(e)}`);
  }

  // 一条都没出错才写标记 —— 出错了下次还能重试（靠 uri 去重兜底）。
  if (result.errors.length === 0) {
    writeMarker(targetTenant);
  }

  return result;
}
