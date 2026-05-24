import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TaskBoardPage } from '../../src/pages/TaskBoardPage';
import type { Task } from '../../src/types';

vi.mock('../../src/stores/taskBoardStore', () => ({
  useTaskBoardStore: vi.fn(() => ({
    columns: [
      { id: 'backlog', order: 0 },
      { id: 'todo', order: 1 },
      { id: 'in-progress', order: 2 },
      { id: 'review', order: 3 },
      { id: 'done', order: 4 },
    ],
    tasks: [],
    addTask: vi.fn(),
    removeTask: vi.fn(),
    approveTask: vi.fn(),
    rejectTask: vi.fn(),
    startPlanningWithLLM: vi.fn(),
  })),
}));

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(() => ({
    agents: [],
  })),
}));

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: vi.fn(() => ({
    pendingTasks: [],
    sendTaskResponse: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('TaskBoardPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route path="/tasks" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page header', async () => {
    renderWithRouter(<TaskBoardPage />);
    
    await waitFor(() => {
      expect(screen.getByText('tasks.title')).toBeInTheDocument();
    });
  });

  it('renders board columns', async () => {
    renderWithRouter(<TaskBoardPage />);
    
    await waitFor(() => {
      expect(screen.getByText('tasks.backlog')).toBeInTheDocument();
      expect(screen.getByText('tasks.todo')).toBeInTheDocument();
      expect(screen.getByText('tasks.inProgress')).toBeInTheDocument();
      expect(screen.getByText('tasks.done')).toBeInTheDocument();
    });
  });

  it('renders metrics dashboard', async () => {
    renderWithRouter(<TaskBoardPage />);
    
    await waitFor(() => {
      expect(screen.getByText('tasks.pending')).toBeInTheDocument();
      expect(screen.getByText('tasks.running')).toBeInTheDocument();
      expect(screen.getByText('tasks.completedLabel')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    const { container } = renderWithRouter(<TaskBoardPage />);
    await waitFor(() => {
      expect(container.querySelector('.taskboard-page')).toBeInTheDocument();
    });
  });
});