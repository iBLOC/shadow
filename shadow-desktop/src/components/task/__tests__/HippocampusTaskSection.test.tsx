import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { prefrontalClient } from '../../../lib/prefrontalClient';
import type { Task } from '../../../lib/prefrontalClient';
import { useTaskBoardDataStore } from '../../../stores/taskBoardDataStore';
import { HippocampusTaskSection } from '../HippocampusTaskSection';

vi.mock('../../../lib/prefrontalClient', () => ({
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
    { step_id: 'step-1', order: 0, status: 'completed' },
    { step_id: 'step-2', order: 1, status: 'running' },
  ],
};

describe('HippocampusTaskSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskBoardDataStore.setState({
      hippocampusTasks: [],
      isLoadingHippocampus: false,
      hippocampusError: null,
      detail: { taskId: null, activeTab: 'overview' },
    });
    vi.mocked(prefrontalClient.listTasks).mockResolvedValue([TASK]);
    vi.mocked(prefrontalClient.getTask).mockResolvedValue(TASK);
  });

  it('renders the task id when the backend has no title column', async () => {
    render(<HippocampusTaskSection />);

    await waitFor(() => {
      expect(screen.getByText('task-1')).toBeTruthy();
    });
    expect(screen.getByTestId('hippocampus-task-section')).toBeTruthy();
  });

  it('renders the status and the subtask progress', async () => {
    render(<HippocampusTaskSection />);

    await waitFor(() => {
      expect(screen.getByText('running')).toBeTruthy();
    });
    const section = screen.getByTestId('hippocampus-task-section');
    expect(section.textContent).toContain('1/2');
    expect(screen.getByText('prefrontal')).toBeTruthy();
  });

  it('shows the listing failure inline', async () => {
    vi.mocked(prefrontalClient.listTasks).mockRejectedValue(
      new Error('fetch failed')
    );

    render(<HippocampusTaskSection />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('alert').textContent).toContain('fetch failed');
  });

  it('renders nothing when the backend has no records', async () => {
    vi.mocked(prefrontalClient.listTasks).mockResolvedValue([]);

    const { container } = render(<HippocampusTaskSection />);

    await waitFor(() => {
      expect(prefrontalClient.listTasks).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it('opens the detail dialog for the clicked task', async () => {
    render(<HippocampusTaskSection />);

    await waitFor(() => {
      expect(screen.getByText('task-1')).toBeTruthy();
    });

    screen.getByText('task-1').click();

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
    expect(useTaskBoardDataStore.getState().detail.taskId).toBe('task-1');
  });
});
