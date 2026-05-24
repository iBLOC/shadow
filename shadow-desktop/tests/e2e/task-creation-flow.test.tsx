import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TaskBoardPage } from '../../src/pages/TaskBoardPage';

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
    startPlanningWithLLM: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(() => ({
    agents: [],
    activeAgentId: null,
    setActiveAgent: vi.fn(),
  })),
}));

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: vi.fn(() => ({
    pendingTasks: [],
    sendTaskResponse: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Task Creation Flow E2E', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route path="/tasks" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('displays task board page with title', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.title')).toBeInTheDocument();
    });
  });

  it('displays backlog column', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.backlog')).toBeInTheDocument();
    });
  });

  it('displays todo column', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.todo')).toBeInTheDocument();
    });
  });

  it('displays in-progress column', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.inProgress')).toBeInTheDocument();
    });
  });

  it('displays review column', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.review')).toBeInTheDocument();
    });
  });

  it('displays done column', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.done')).toBeInTheDocument();
    });
  });

  it('has add task button', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('tasks.addTask')[0]).toBeInTheDocument();
    });
  });

  it('displays pending metric', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.pending')).toBeInTheDocument();
    });
  });

  it('displays running metric', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.running')).toBeInTheDocument();
    });
  });

  it('displays completed metric', async () => {
    renderWithRouter(<TaskBoardPage />);

    await waitFor(() => {
      expect(screen.getByText('tasks.completedLabel')).toBeInTheDocument();
    });
  });
});