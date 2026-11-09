import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 看板（本地那几列）的**落盘**判据 —— 「重启后还在」这件事要**测出来**，
 * 不能靠印象。
 *
 * ⚠️ **为什么要有这一条**：账本里曾写着「本地看板列仍不落盘
 * （`crypto.randomUUID()` ⇒ 重启即失）」⇒ ⇒ 而源码里那个 store **本来就**
 * 用了 zustand 的 `persist`（键名 `prefrontal-taskboard-storage`）⇒ ⇒
 * 「不落盘」这个说法**可能是错的** ⇒ ⇒ 说法对不对，得由判据说了算。
 *
 * ⚠️ **「模拟重启」怎么做**：清掉模块缓存 ＋ 重新 import ⇒ ⇒ store 重新构造
 * ⇒ ⇒ `persist` 从 localStorage **回填** ⇒ ⇒ 这就是「进程重启后看到的那份」。
 */
describe('看板的本地落盘', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('加的那一列 ⇒ 「重启」后还在（不是只在内存里）', async () => {
    const first = await import('../../src/stores/taskBoardStore');
    first.useTaskBoardStore.getState().addColumn({
      id: 'col-x',
      title: '我自己加的列',
      order: 9,
    });

    // —— 模拟「重启」——
    vi.resetModules();
    const again = await import('../../src/stores/taskBoardStore');

    const cols = again.useTaskBoardStore.getState().columns;
    expect(cols.map((c) => c.id), '「重启」后我自己加的那列必须还在').toContain('col-x');
    expect(cols.find((c) => c.id === 'col-x')?.title).toBe('我自己加的列');
  });

  it('本地加的卡片（`crypto.randomUUID()` 那个）⇒ 「重启」后也在', async () => {
    const first = await import('../../src/stores/taskBoardStore');
    first.useTaskBoardStore.getState().addTask({
      id: 'card-local-1',
      title: '本地卡片',
      description: '',
      columnId: 'todo',
      order: 0,
      priority: 'medium',
      type: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.resetModules();
    const again = await import('../../src/stores/taskBoardStore');
    expect(
      again.useTaskBoardStore.getState().tasks.map((t) => t.id),
      '「重启」后本地卡片必须还在（那个随机号是**建卡那一刻**给的，不是每次重启重发）',
    ).toContain('card-local-1');
  });

  it('落盘落在**哪把钥匙**上（键名被改 ⇒ ⇒ 旧数据就找不到了）', async () => {
    const mod = await import('../../src/stores/taskBoardStore');
    mod.useTaskBoardStore.getState().addColumn({ id: 'col-y', title: 'Y', order: 8 });

    const raw = localStorage.getItem('prefrontal-taskboard-storage');
    expect(raw, '落盘必须写在 `prefrontal-taskboard-storage` 这把钥匙下').toBeTruthy();
    expect(raw).toContain('col-y');
  });
});
