import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '../mocks/cortexClient';
import { AgentsPage } from '../../src/pages/AgentsPage';

const mockAddAgent = vi.fn();
const mockRemoveAgent = vi.fn();
const mockUpdateAgent = vi.fn();

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: vi.fn(() => ({
    agents: [],
    addAgent: mockAddAgent,
    removeAgent: mockRemoveAgent,
    updateAgent: mockUpdateAgent,
  })),
}));

vi.mock('../../src/stores/opencodeStore', () => ({
  useOpenCodeStore: vi.fn(() => ({
    config: { port: 3000, autoLaunch: false, autoInstall: false },
    instances: [],
    installed: false,
    isLoading: false,
    setConfig: vi.fn(),
    fetchInstances: vi.fn().mockResolvedValue(undefined),
    launch: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    checkInstalled: vi.fn().mockResolvedValue(false),
    install: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Agents Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = () =>
    render(
      <MemoryRouter initialEntries={['/agents']}>
        <Routes>
          <Route path="/agents" element={<AgentsPage />} />
        </Routes>
      </MemoryRouter>
    );

  it('renders page title', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('agents.title')).toBeInTheDocument();
    });
  });

  it('renders section headers', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('agents.internalAgents')).toBeInTheDocument();
      expect(screen.getByText('agents.customAgents')).toBeInTheDocument();
      expect(screen.getByText('agents.wasmAgents')).toBeInTheDocument();
      expect(screen.getByText('agents.externalAgents')).toBeInTheDocument();
    });
  });

  it('shows empty state for internal agents', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('agents.noInternal')).toBeInTheDocument();
    });
  });

  it('shows empty state for custom agents', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('agents.noCustomAgents')).toBeInTheDocument();
    });
  });

  it('shows search section', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('agents.searchTitle')).toBeInTheDocument();
    });
  });

  it('shows new custom agent button', async () => {
    renderWithRouter();

    await waitFor(() => {
      const buttons = screen.getAllByText('agents.newCustomAgent');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
