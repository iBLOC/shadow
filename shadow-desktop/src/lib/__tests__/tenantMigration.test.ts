import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../../types';

/**
 * 「`default` 桶 → 账号人格桶」一次性迁移的行为测试。
 *
 * 钉的是**语义**：
 *
 * - 记忆按 uri 去重（目标桶里已有的不重复复制）；
 * - 任务换个租户 upsert（海马体的任务键是 `{tenant}::{taskId}` ⇒ 是复制
 *   不是搬家）；
 * - **复制**不删旧行（端脑没账号时也用 `default` 桶，清空等于永久删历史）；
 * - 搬过就只搬一次（一个设备一个标记，与人格无关 —— 否则换账号会把上一个
 *   账号的遗留数据搬进新账号）。
 */

vi.mock('../hippocampusClient', () => ({
  hippocampusClient: {
    listMemories: vi.fn(),
    addMemory: vi.fn(),
  },
}));

vi.mock('../prefrontalClient', () => ({
  prefrontalClient: {
    listTasks: vi.fn(),
    copyTaskToTenant: vi.fn(),
  },
}));

const memory = (uri: string, content = 'x'): Memory => ({
  id: `id-${uri}`,
  uri,
  content,
  dimension: 'Agent',
  layer: 'L2',
  sessionId: 'session-1',
  createdAt: new Date('2026-10-30T00:00:00Z'),
  updatedAt: new Date('2026-10-30T00:00:00Z'),
});

describe('tenantMigration', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('目标还是 default ⇒ 什么都不搬', async () => {
    const { migrateLegacyTenant } = await import('../tenantMigration');
    const { hippocampusClient } = await import('../hippocampusClient');

    const result = await migrateLegacyTenant('default');

    expect(result.ran).toBe(false);
    expect(result.reason).toBe('target-is-default');
    expect(hippocampusClient.listMemories).not.toHaveBeenCalled();
  });

  it('把 default 桶里的记忆复制到人格桶（按 uri 去重）', async () => {
    const { migrateLegacyTenant } = await import('../tenantMigration');
    const { hippocampusClient } = await import('../hippocampusClient');

    vi.mocked(hippocampusClient.listMemories)
      // 源桶
      .mockResolvedValueOnce([
        memory('preference://theme/accent', '#ff8800'),
        memory('memory://1', 'likes dark mode'),
      ])
      // 目标桶：主题色那边已经有了
      .mockResolvedValueOnce([memory('preference://theme/accent', '#ff8800')]);
    vi.mocked(hippocampusClient.addMemory).mockResolvedValue(memory('memory://1'));

    const result = await migrateLegacyTenant('persona-ada');

    expect(result.ran).toBe(true);
    expect(result.memoriesCopied).toBe(1);
    expect(hippocampusClient.addMemory).toHaveBeenCalledTimes(1);
    expect(hippocampusClient.addMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'memory://1',
        content: 'likes dark mode',
        tenantId: 'persona-ada',
      })
    );
  });

  it('两个桶都查的是同一个海马体，只是租户不同', async () => {
    const { migrateLegacyTenant } = await import('../tenantMigration');
    const { hippocampusClient } = await import('../hippocampusClient');

    vi.mocked(hippocampusClient.listMemories)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(hippocampusClient.addMemory).mockResolvedValue(memory('x'));

    await migrateLegacyTenant('persona-ada');

    expect(hippocampusClient.listMemories).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenantId: 'default' })
    );
    expect(hippocampusClient.listMemories).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tenantId: 'persona-ada' })
    );
  });

  it('任务也搬过去（换租户 upsert = 复制，不是搬家）', async () => {
    const { migrateLegacyTenant } = await import('../tenantMigration');
    const { hippocampusClient } = await import('../hippocampusClient');
    const { prefrontalClient } = await import('../prefrontalClient');

    vi.mocked(hippocampusClient.listMemories)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(prefrontalClient.listTasks).mockResolvedValue([
      { task_id: 'task-1', tenant_id: 'default' } as never,
    ]);
    vi.mocked(prefrontalClient.copyTaskToTenant).mockResolvedValue({
      task_id: 'task-1',
      tenant_id: 'persona-ada',
    } as never);

    const result = await migrateLegacyTenant('persona-ada');

    expect(result.tasksCopied).toBe(1);
    expect(prefrontalClient.copyTaskToTenant).toHaveBeenCalledWith(
      'default',
      'persona-ada',
      'task-1'
    );
  });

  it('搬过一次就只搬一次（一个设备一个标记）', async () => {
    const { migrateLegacyTenant, TENANT_MIGRATION_KEY } = await import(
      '../tenantMigration'
    );
    const { hippocampusClient } = await import('../hippocampusClient');

    vi.mocked(hippocampusClient.listMemories)
      .mockResolvedValueOnce([memory('memory://1')])
      .mockResolvedValueOnce([]);
    vi.mocked(hippocampusClient.addMemory).mockResolvedValue(memory('memory://1'));

    const first = await migrateLegacyTenant('persona-ada');
    expect(first.ran).toBe(true);
    expect(localStorage.getItem(TENANT_MIGRATION_KEY)).toContain('persona-ada');

    vi.mocked(hippocampusClient.addMemory).mockClear();
    const second = await migrateLegacyTenant('persona-ada');

    expect(second.ran).toBe(false);
    expect(second.reason).toBe('already-migrated');
    expect(hippocampusClient.addMemory).not.toHaveBeenCalled();
  });

  it('换账号也不会把旧桶再搬一次（标记与人格无关）', async () => {
    const { migrateLegacyTenant, TENANT_MIGRATION_KEY } = await import(
      '../tenantMigration'
    );
    const { hippocampusClient } = await import('../hippocampusClient');

    localStorage.setItem(
      TENANT_MIGRATION_KEY,
      JSON.stringify({ target: 'persona-ada', at: '2026-10-30T00:00:00Z' })
    );
    vi.mocked(hippocampusClient.listMemories).mockResolvedValue([]);

    const result = await migrateLegacyTenant('persona-bob');

    expect(result.ran).toBe(false);
    expect(result.reason).toBe('already-migrated');
    expect(hippocampusClient.addMemory).not.toHaveBeenCalled();
  });

  it('搬的过程中出错 ⇒ 不写标记，下次还会再试', async () => {
    const { migrateLegacyTenant, TENANT_MIGRATION_KEY } = await import(
      '../tenantMigration'
    );
    const { hippocampusClient } = await import('../hippocampusClient');

    vi.mocked(hippocampusClient.listMemories)
      .mockResolvedValueOnce([memory('memory://1')])
      .mockResolvedValueOnce([]);
    vi.mocked(hippocampusClient.addMemory).mockRejectedValue(
      new Error('storage offline')
    );

    const result = await migrateLegacyTenant('persona-ada');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('storage offline');
    expect(localStorage.getItem(TENANT_MIGRATION_KEY)).toBeNull();
  });

  it('目标桶取不到时只报错误、不炸（迁移失败不该拖垮启动）', async () => {
    const { migrateLegacyTenant } = await import('../tenantMigration');
    const { hippocampusClient } = await import('../hippocampusClient');

    vi.mocked(hippocampusClient.listMemories).mockRejectedValue(
      new Error('connection refused')
    );

    const result = await migrateLegacyTenant('persona-ada');

    expect(result.ran).toBe(true);
    expect(result.memoriesCopied).toBe(0);
    expect(result.errors[0]).toContain('connection refused');
  });
});
