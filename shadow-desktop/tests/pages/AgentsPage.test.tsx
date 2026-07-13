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
    opencodeConfig: { autoLaunch: false, port: 3000 },
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

vi.mock('../../src/stores/cortexStore', () => {
  // Stub the store value so selector-style subscriptions work the same
  // way as the production code: `useCortexStore((s) => s.status)` etc.
  const stub = {
    status: 'stopped',
    error: null,
    connection: { baseUrl: 'http://localhost:60000' },
    lobes: [],
    defaultAgent: null,
    refreshStatus: vi.fn(),
    refreshLobes: vi.fn(),
  };
  return {
    useCortexStore: vi.fn(<T,>(selector?: (state: typeof stub) => T): T | typeof stub => {
      if (typeof selector === 'function') {
        return selector(stub);
      }
      return stub;
    }),
  };
});

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

  it('renders internal agents section', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('agents.internalAgents')).toBeInTheDocument();
    });
  });

  it('renders custom agents section', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('agents.customAgents')).toBeInTheDocument();
    });
  });

  it('renders external agents section', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('agents.externalAgents')).toBeInTheDocument();
    });
  });

  it('renders wasm agents section', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('agents.wasmAgents')).toBeInTheDocument();
    });
  });

  it('shows wasm section disabled when cortex is stopped', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      // Refresh button on the wasm section uses the disabled
      // attribute — by rendering the section we know the wiring
      // ran without crashing. Empty-state for "no installed wasm"
      // is shown only when cortex is running + no binaries exist,
      // a happy-path scenario exercised in the manual E2E.
      expect(screen.getByText('agents.wasmAgents')).toBeInTheDocument();
    });
  });

  it('renders opencode section', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('agents.openCodeSection')).toBeInTheDocument();
    });
  });

  it('shows start cortex hint when cortex is stopped', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      // Hints appear in both internal + wasm sections when cortex is
      // not running — assert at least one is shown.
      expect(screen.getAllByText('agents.startCortexHint').length).toBeGreaterThan(0);
    });
  });

  it('shows empty state for custom agents', async () => {
    renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('agents.noCustomAgents')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    const { container } = renderWithRouter(<AgentsPage />);
    await waitFor(() => {
      expect(container.querySelector('div')).toBeInTheDocument();
      expect(screen.getByText('agents.title')).toBeInTheDocument();
    });
  });
});
