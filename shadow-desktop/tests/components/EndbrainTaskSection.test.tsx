import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndbrainTaskSection } from '../../src/components/task/EndbrainTaskSection';
import { telencephalonClient } from '../../src/lib/telencephalonClient';

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: {
    getTasks: vi.fn(),
    confirmTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

const getTasks = telencephalonClient.getTasks as unknown as ReturnType<typeof vi.fn>;
const confirmTask = telencephalonClient.confirmTask as unknown as ReturnType<typeof vi.fn>;
const updateTask = telencephalonClient.updateTask as unknown as ReturnType<typeof vi.fn>;
const deleteTask = telencephalonClient.deleteTask as unknown as ReturnType<typeof vi.fn>;

describe('端脑任务分区', () => {
  beforeEach(() => {
    getTasks.mockReset();
    confirmTask.mockReset();
    updateTask.mockReset();
    deleteTask.mockReset();
    getTasks.mockResolvedValue([
      { id: 'task-1', title: '和客户开会', status: 'Pending', priority: 'High', confirmed: false },
      { id: 'task-2', title: '写周报', status: 'Completed', priority: 'Medium', confirmed: true },
    ]);
    confirmTask.mockResolvedValue({});
    updateTask.mockResolvedValue({});
    deleteTask.mockResolvedValue(undefined);
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

  it('每条都有「改」与「删」（不是只有待确认的那条才有）', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-2')).toBeInTheDocument());
    expect(screen.getByTestId('endbrain-task-task-1-edit')).toBeInTheDocument();
    expect(screen.getByTestId('endbrain-task-task-1-delete')).toBeInTheDocument();
    // ⚠️ **已确认 / 已完成的那条也要能改能删**（对话里建的任务随时能改）
    expect(screen.getByTestId('endbrain-task-task-2-edit')).toBeInTheDocument();
    expect(screen.getByTestId('endbrain-task-task-2-delete')).toBeInTheDocument();
  });

  it('点「改」⇒ 改标题与优先级 ⇒ 保存 ⇒ 真的打端脑那张面', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-1-edit')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('endbrain-task-task-1-edit'));
    const titleInput = screen.getByTestId('endbrain-task-task-1-edit-title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '改过的标题');
    await userEvent.selectOptions(
      screen.getByTestId('endbrain-task-task-1-edit-priority'),
      'High',
    );
    await userEvent.click(screen.getByTestId('endbrain-task-task-1-edit-save'));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ title: '改过的标题', priority: 'High' }),
      ),
    );
  });

  it('截止时间 ⇒ 本地裸值换成 RFC3339 再发出去', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-1-edit')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('endbrain-task-task-1-edit'));
    const dueInput = screen.getByTestId('endbrain-task-task-1-edit-due');
    // ⚠️ **用 fireEvent.change，不用 userEvent.type** —— jsdom 对
    // `datetime-local` 的**键入模拟**不可靠（它按文本键入，而那个输入框
    // 只接受 `YYYY-MM-DDTHH:mm` 形状）⇒ ⇒ 直接给值。
    fireEvent.change(dueInput, { target: { value: '2030-01-02T03:04' } });
    await userEvent.click(screen.getByTestId('endbrain-task-task-1-edit-save'));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          // ⇒ ⇒ 发出去必须是**带时区**的瞬间（端脑的 parse_due_time 认 ISO8601）
          dueTime: expect.stringMatching(/Z$/),
        }),
      ),
    );
  });

  it('点「删」⇒ 真的打端脑那张面（不是本地假装删掉）', async () => {
    render(<EndbrainTaskSection />);
    await waitFor(() => expect(screen.getByTestId('endbrain-task-task-1-delete')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('endbrain-task-task-1-delete'));
    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith('task-1'));
  });
});
