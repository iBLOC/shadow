import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefrontalClient } from '../../lib/prefrontalClient';
import type { Task } from '../../lib/prefrontalClient';
import { useTaskBoardDataStore } from '../taskBoardDataStore';

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
    useTaskBoardDataStore.setState({
      cortexTasks: [],
      isLoadingCortex: false,
      cortexError: null,
      detail: { taskId: null, activeTab: 'overview' },
    });
  });

  it('lists tasks in the default tenant without raising the global error dialog', async () => {
    vi.mocked(prefrontalClient.listTasks).mockResolvedValue([TASK]);

    await useTaskBoardDataStore.getState().fetchCortexTasks();

    expect(prefrontalClient.listTasks).toHaveBeenCalledWith('default', {
      silent: true,
    });
    expect(useTaskBoardDataStore.getState().cortexTasks).toEqual([TASK]);
    expect(useTaskBoardDataStore.getState().cortexError).toBeNull();
    expect(useTaskBoardDataStore.getState().isLoadingCortex).toBe(false);
  });

  it('records a failed listing inline instead of throwing', async () => {
    vi.mocked(prefrontalClient.listTasks).mockRejectedValue(
      new Error('fetch failed')
    );

    await useTaskBoardDataStore.getState().fetchCortexTasks();

    expect(useTaskBoardDataStore.getState().cortexError).toBe('fetch failed');
    expect(useTaskBoardDataStore.getState().isLoadingCortex).toBe(false);
    expect(useTaskBoardDataStore.getState().cortexTasks).toEqual([]);
  });

  it('keeps frontend-only fields the backend drops on upsert', async () => {
    useTaskBoardDataStore.setState({ cortexTasks: [TASK] });
    // hippocampus has no title/description/priority columns, so the
    // upsert response never carries them back.
    vi.mocked(prefrontalClient.updateTask).mockResolvedValue({
      ...TASK,
      status: 'completed',
    });

    await useTaskBoardDataStore.getState().updateCortexTask('task-1', {
      title: '写周报',
      description: '每周总结',
      priority: 'high',
      status: 'completed',
    });

    const updated = useTaskBoardDataStore.getState().cortexTasks[0];
    expect(updated.status).toBe('completed');
    expect(updated.title).toBe('写周报');
    expect(updated.description).toBe('每周总结');
    expect(updated.priority).toBe('high');
  });

  it('refuses to update a task that is not in the cache', async () => {
    await expect(
      useTaskBoardDataStore.getState().updateCortexTask('missing', {
        status: 'completed',
      })
    ).rejects.toThrow(/not found/);
    expect(prefrontalClient.updateTask).not.toHaveBeenCalled();
  });

  it('removes a deleted task and closes its detail view', async () => {
    useTaskBoardDataStore.setState({
      cortexTasks: [TASK],
      detail: { taskId: 'task-1', activeTab: 'overview' },
    });
    vi.mocked(prefrontalClient.deleteTask).mockResolvedValue(undefined);

    await useTaskBoardDataStore.getState().deleteCortexTask('task-1');

    expect(prefrontalClient.deleteTask).toHaveBeenCalledWith(
      'default',
      'task-1'
    );
    expect(useTaskBoardDataStore.getState().cortexTasks).toEqual([]);
    expect(useTaskBoardDataStore.getState().detail.taskId).toBeNull();
  });

  it('computes subtask progress from the step list', () => {
    const progress = useTaskBoardDataStore
      .getState()
      .computeSubtaskProgress(TASK);

    expect(progress).toEqual({ completed: 1, total: 2, ratio: 0.5 });
  });
});
