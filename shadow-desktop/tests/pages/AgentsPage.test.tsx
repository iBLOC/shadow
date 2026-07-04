import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentsPage } from '../../src/pages/AgentsPage';

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(() => ({
    agents: [],
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    updateAgent: vi.fn(),
    opencodeConfig: { autoLaunch: false },
    opencodeInstances: [],
    opencodeInstalled: false,
    isLoadingOpenCode: false,
    setOpenCodeConfig: vi.fn(),
    fetchOpenCodeInstances: vi.fn(),
    launchOpenCode: vi.fn(),
    stopOpenCode: vi.fn(),
    checkOpenCodeInstalled: vi.fn(),
    installOpenCode: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('AgentsPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/agents']}>
        <Routes>
          <Route path="/agents" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page header', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('agents.title')).toBeInTheDocument();
    });
  });

  it('renders add agent button', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /agents.addAgent/i })).toBeInTheDocument();
    });
  });

  it('renders built-in agents section', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('agents.builtInAgents')).toBeInTheDocument();
    });
  });

  it('renders external agents section', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('agents.externalAgents')).toBeInTheDocument();
    });
  });

  it('renders opencode section', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('agents.openCodeSection')).toBeInTheDocument();
    });
  });

  it('shows empty state for built-in agents', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('agents.noBuiltIn')).toBeInTheDocument();
    });
  });

  it('renders external agents section', async () => {
    renderWithRouter(<AgentsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('agents.externalAgents')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    const { container } = renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(container.querySelector('main') || container.querySelector('div')).toBeInTheDocument();
      expect(screen.getByText('agents.title')).toBeInTheDocument();
    });
  });
});