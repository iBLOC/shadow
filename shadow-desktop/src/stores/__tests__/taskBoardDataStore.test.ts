import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefrontalClient } from '../../lib/prefrontalClient';
import type { Task } from '../../lib/prefrontalClient';
import { useTaskBoardDataStore } from '../taskBoardDataStore';

/**
 * 看板的租户不再写死 —— 由身份 store 决定（端脑说你是谁，就是哪个桶）。
 * 这里把身份 store 换成可控的假身，断言「看板跟着身份走」。
 */
const { identityMock } = vi.hoisted(() => ({
  identityMock: {
    tenantId: 'default' as string,
    resolve: vi.fn(async () => identityMock.tenantId),
  },
}));

vi.mock('../identityStore', () => ({
  useIdentityStore: {
    getState: () => identityMock,
  },
}));

vi.mock('../../lib/prefrontalClient', () => ({
  prefrontalClient: {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

const TASK: Task = {
  task_id: 'task-1',
  source: 'local',
  target_agent: 'prefrontal',
  status: 'running',
  tenant_id: 'default',
  received_at: '2026-01-01T00:00:00Z',
  completed_at: null,
  tags: ['alpha'],
  steps: [
    {
      step_id: 'step-1',
      order: 0,
      status: 'completed',
      target: { type: 'agent', skill: 'plan' },
    },
    {
      step_id: 'step-2',
      order: 1,
      status: 'running',
      target: { type: 'tool', tool_name: 'shell' },
    },
  ],
};

describe('taskBoardDataStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.tenantId = 'default';
    useTaskBoardDataStore.setState({
      hippocampusTasks: [],
      isLoadingHippocampus: false,
      hippocampusError: null,
      detail: { taskId: null, activeTab: 'overview' },
    });
  });

  it('lists tasks in the default tenant without raising the global error dialog', async () => {
    vi.mocked(prefrontalClient.listTasks).mockResolvedValue([TASK]);

    await useTaskBoardDataStore.getState().fetchHippocampusTasks();

    expect(prefrontalClient.listTasks).toHaveBeenCalledWith('default', {
      silent: true,
    });
    expect(useTaskBoardDataStore.getState().hippocampusTasks).toEqual([TASK]);
    expect(useTaskBoardDataStore.getState().hippocampusError).toBeNull();
    expect(useTaskBoardDataStore.getState().isLoadingHippocampus).toBe(false);
  });

  it('records a failed listing inline instead of throwing', async () => {
    vi.mocked(prefrontalClient.listTasks).mockRejectedValue(
      new Error('fetch failed')
    );

    await useTaskBoardDataStore.getState().fetchHippocampusTasks();

    expect(useTaskBoardDataStore.getState().hippocampusError).toBe('fetch failed');
    expect(useTaskBoardDataStore.getState().isLoadingHippocampus).toBe(false);
    expect(useTaskBoardDataStore.getState().hippocampusTasks).toEqual([]);
  });

  it('keeps frontend-only fields the backend drops on upsert', async () => {
    useTaskBoardDataStore.setState({ hippocampusTasks: [TASK] });
    // hippocampus has no title/description/priority columns, so the
    // upsert response never carries them back.
    vi.mocked(prefrontalClient.updateTask).mockResolvedValue({
      ...TASK,
      status: 'completed',
    });

    await useTaskBoardDataStore.getState().updateHippocampusTask('task-1', {
      title: '写周报',
      description: '每周总结',
      priority: 'high',
      status: 'completed',
    });

    const updated = useTaskBoardDataStore.getState().hippocampusTasks[0];
    expect(updated.status).toBe('completed');
    expect(updated.title).toBe('写周报');
    expect(updated.description).toBe('每周总结');
    expect(updated.priority).toBe('high');
  });

  it('refuses to update a task that is not in the cache', async () => {
    await expect(
      useTaskBoardDataStore.getState().updateHippocampusTask('missing', {
        status: 'completed',
      })
    ).rejects.toThrow(/not found/);
    expect(prefrontalClient.updateTask).not.toHaveBeenCalled();
  });

  it('removes a deleted task and closes its detail view', async () => {
    useTaskBoardDataStore.setState({
      hippocampusTasks: [TASK],
      detail: { taskId: 'task-1', activeTab: 'overview' },
    });
    vi.mocked(prefrontalClient.deleteTask).mockResolvedValue(undefined);

    await useTaskBoardDataStore.getState().deleteHippocampusTask('task-1');

    expect(prefrontalClient.deleteTask).toHaveBeenCalledWith(
      'default',
      'task-1'
    );
    expect(useTaskBoardDataStore.getState().hippocampusTasks).toEqual([]);
    expect(useTaskBoardDataStore.getState().detail.taskId).toBeNull();
  });

  it('computes subtask progress from the step list', () => {
    const progress = useTaskBoardDataStore
      .getState()
      .computeSubtaskProgress(TASK);

    expect(progress).toEqual({ completed: 1, total: 2, ratio: 0.5 });
  });

  it('身份解析出账号人格 ⇒ 看板读那个桶，不再是 default', async () => {
    identityMock.tenantId = 'persona-ada';
    vi.mocked(prefrontalClient.listTasks).mockResolvedValue([]);

    await useTaskBoardDataStore.getState().fetchHippocampusTasks();

    expect(prefrontalClient.listTasks).toHaveBeenCalledWith('persona-ada', {
      silent: true,
    });
  });

  it('删除任务也用当前租户（别删到别人的桶里去）', async () => {
    identityMock.tenantId = 'persona-ada';
    useTaskBoardDataStore.setState({ hippocampusTasks: [TASK] });
    vi.mocked(prefrontalClient.deleteTask).mockResolvedValue(undefined);

    await useTaskBoardDataStore.getState().deleteHippocampusTask('task-1');

    expect(prefrontalClient.deleteTask).toHaveBeenCalledWith(
      'persona-ada',
      'task-1'
    );
  });
});
