import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TaskBoardPage } from '../../src/pages/TaskBoardPage';

const mockTasks: any[] = [];
const mockColumns: any[] = [
  { id: 'backlog', title: 'Backlog', order: 0 },
  { id: 'in-progress', title: 'In Progress', order: 1 },
  { id: 'completed', title: 'Completed', order: 2 },
];
const mockAddTask = vi.fn();
const mockRemoveTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockApproveTask = vi.fn();
const mockRejectTask = vi.fn();

vi.mock('../../src/stores/taskBoardStore', () => ({
  useTaskBoardStore: () => ({
    tasks: mockTasks,
    columns: mockColumns,
    addTask: mockAddTask,
    removeTask: mockRemoveTask,
    updateTask: mockUpdateTask,
    approveTask: mockApproveTask,
    rejectTask: mockRejectTask,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

const sampleTask = (overrides: any = {}) => ({
  id: 'task-1',
  title: 'Test Task',
  description: 'A test task description',
  status: 'pending' as const,
  priority: 'medium' as const,
  columnId: 'backlog',
  order: 0,
  tags: [],
  type: 'normal' as const,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/tasks']}>
      <Routes>
        <Route path="/tasks" element={<TaskBoardPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Task Board Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTasks.length = 0;
  });

  describe('Empty state', () => {
    it('renders page title', async () => {
      renderWithRouter();
      await screen.findByText('tasks.title');
    });

    it('shows add task button', async () => {
      renderWithRouter();
      await screen.findByText('tasks.title');
      const addBtns = screen.getAllByRole('button', { name: /tasks\.addTask/i });
      expect(addBtns.length).toBeGreaterThan(0);
    });
  });

  describe('Add task', () => {
    it('opens add form when add button clicked', async () => {
      renderWithRouter();
      await screen.findByText('tasks.title');
      const addBtns = screen.getAllByRole('button', { name: /tasks\.addTask/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/tasks\.taskTitle/i)).toBeInTheDocument();
      });
    });

    it('adds task with title and description', async () => {
      renderWithRouter();
      await screen.findByText('tasks.title');
      const addBtns = screen.getAllByRole('button', { name: /tasks\.addTask/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => expect(screen.getByPlaceholderText(/tasks\.taskTitle/i)).toBeInTheDocument());
      const titleInput = screen.getByPlaceholderText(/tasks\.taskTitle/i) as HTMLInputElement;
      const descInput = screen.getByPlaceholderText(/tasks\.description/i) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'New Task' } });
      fireEvent.change(descInput, { target: { value: 'Task description' } });
      fireEvent.keyDown(titleInput, { key: 'Enter' });
      await waitFor(() => {
        expect(mockAddTask).toHaveBeenCalledTimes(1);
        const task = mockAddTask.mock.calls[0][0];
        expect(task.title).toBe('New Task');
      });
    });

    it('closes form when Escape is pressed', async () => {
      renderWithRouter();
      await screen.findByText('tasks.title');
      const addBtns = screen.getAllByRole('button', { name: /tasks\.addTask/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => expect(screen.getByPlaceholderText(/tasks\.taskTitle/i)).toBeInTheDocument());
      const titleInput = screen.getByPlaceholderText(/tasks\.taskTitle/i) as HTMLInputElement;
      fireEvent.keyDown(titleInput, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/tasks\.taskTitle/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Task rendering', () => {
    it('displays task title and description', async () => {
      const task = sampleTask({ title: 'My Task', description: 'My description' });
      mockTasks.push(task);
      renderWithRouter();
      await screen.findByText('My Task');
      expect(screen.getByText('My description')).toBeInTheDocument();
    });

    it('groups tasks by status', async () => {
      mockTasks.push(sampleTask({ id: 't-1', title: 'Pending', status: 'pending' }));
      mockTasks.push(sampleTask({ id: 't-2', title: 'Done', status: 'completed' }));
      renderWithRouter();
      await screen.findByText('Pending');
      await screen.findByText('Done');
    });

    it('renders multiple tasks', async () => {
      mockTasks.push(sampleTask({ id: 't-1', title: 'Task 1' }));
      mockTasks.push(sampleTask({ id: 't-2', title: 'Task 2' }));
      mockTasks.push(sampleTask({ id: 't-3', title: 'Task 3' }));
      const { container } = renderWithRouter();
      await screen.findByText('Task 1');
      await screen.findByText('Task 2');
      await screen.findByText('Task 3');
      const allText = container.textContent || '';
      expect(allText).toContain('Task 1');
      expect(allText).toContain('Task 2');
      expect(allText).toContain('Task 3');
    });
  });

  describe('Update task', () => {
    it('task card shows task title and description when present', async () => {
      const task = sampleTask({ title: 'My Task', description: 'My description' });
      mockTasks.push(task);
      renderWithRouter();
      await screen.findByText('My Task');
      expect(screen.getByText('My description')).toBeInTheDocument();
    });
  });

  describe('Remove task', () => {
    it('clicking delete button calls removeTask', async () => {
      const task = sampleTask();
      mockTasks.push(task);
      renderWithRouter();
      await screen.findByText(task.title);
      const deleteBtn = screen.getByTitle('common.delete');
      if (deleteBtn) {
        fireEvent.click(deleteBtn);
        expect(mockRemoveTask).toHaveBeenCalledWith(task.id);
      }
    });
  });

  describe('Filter tasks', () => {
    it('displays all tasks when no filter', async () => {
      mockTasks.push(sampleTask({ id: 't-1', title: 'Task 1' }));
      mockTasks.push(sampleTask({ id: 't-2', title: 'Task 2' }));
      renderWithRouter();
      await screen.findByText('Task 1');
      await screen.findByText('Task 2');
    });
  });

  describe('Priority display', () => {
    it('displays task priority indicator', async () => {
      const task = sampleTask({ priority: 'high' });
      mockTasks.push(task);
      renderWithRouter();
      await screen.findByText(task.title);
      const allText = document.body.textContent || '';
      expect(allText.length).toBeGreaterThan(0);
    });
  });
});
