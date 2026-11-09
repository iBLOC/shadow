import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndbrainTaskSection } from '../../src/components/task/EndbrainTaskSection';
import { telencephalonClient } from '../../src/lib/telencephalonClient';

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: {
    getTasks: vi.fn(),
    confirmTask: vi.fn(),
  },
}));

const getTasks = telencephalonClient.getTasks as unknown as ReturnType<typeof vi.fn>;
const confirmTask = telencephalonClient.confirmTask as unknown as ReturnType<typeof vi.fn>;

describe('端脑任务分区', () => {
  beforeEach(() => {
    getTasks.mockReset();
    confirmTask.mockReset();
    getTasks.mockResolvedValue([
      { id: 'task-1', title: '和客户开会', status: 'Pending', priority: 'High', confirmed: false },
      { id: 'task-2', title: '写周报', status: 'Completed', priority: 'Medium', confirmed: true },
    ]);
    confirmTask.mockResolvedValue({});
  });

  it('把端脑的任务画出来（对话里建的那些）', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-1')).toBeInTheDocument());
    expect(screen.getByTestId('endbrain-task-task-2')).toBeInTheDocument();
    expect(screen.getByText('和客户开会')).toBeInTheDocument();
  });

  it('待确认的那条给确认按钮，确认过的不给', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-1')).toBeInTheDocument());
    expect(screen.getByTestId('endbrain-task-task-1-confirm')).toBeInTheDocument();
    expect(screen.queryByTestId('endbrain-task-task-2-confirm')).toBeNull();
  });

  it('点确认 ⇒ 真的打端脑那张面（不是本地假装成功）', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-1-confirm')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('endbrain-task-task-1-confirm'));
    await waitFor(() => expect(confirmTask).toHaveBeenCalledWith('task-1', true));
  });

  it('形状认不得的那几条 ⇒ 出声（不是静默丢）', async () => {
    getTasks.mockResolvedValue([{ title: '没有号' }, { id: 'task-9', title: '好的' }]);
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-9')).toBeInTheDocument());
    expect(screen.getByText(/有 1 条任务形状认不得/)).toBeInTheDocument();
  });
});
