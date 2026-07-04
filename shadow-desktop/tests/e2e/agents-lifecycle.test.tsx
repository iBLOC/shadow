import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentsPage } from '../../src/pages/AgentsPage';

const mockAddAgent = vi.fn();
const mockUpdateAgent = vi.fn();
const mockRemoveAgent = vi.fn();
const mockLaunchOpenCode = vi.fn().mockResolvedValue(undefined);
const mockStopOpenCode = vi.fn().mockResolvedValue(undefined);
const mockInstallOpenCode = vi.fn().mockResolvedValue(undefined);
const mockCheckOpenCodeInstalled = vi.fn().mockResolvedValue(false);

const agentStoreMock: any = {
  agents: [],
  opencodeConfig: { port: 3000, autoLaunch: false, autoInstall: false },
  opencodeInstances: [],
  opencodeInstalled: false,
  isLoadingOpenCode: false,
  addAgent: mockAddAgent,
  removeAgent: mockRemoveAgent,
  updateAgent: mockUpdateAgent,
  setOpenCodeConfig: vi.fn(),
  fetchOpenCodeInstances: vi.fn().mockResolvedValue(undefined),
  launchOpenCode: mockLaunchOpenCode,
  stopOpenCode: mockStopOpenCode,
  checkOpenCodeInstalled: mockCheckOpenCodeInstalled,
  installOpenCode: mockInstallOpenCode,
};

vi.mock('../../src/stores/agentStore', () => ({
  useAgentStore: (selector?: any) => {
    if (typeof selector === 'function') {
      return selector(agentStoreMock);
    }
    return agentStoreMock;
  },
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

const sampleAgent = (overrides: any = {}) => ({
  id: 'agent-1',
  name: 'Test Agent',
  category: 'external' as const,
  externalType: 'custom' as const,
  endpoint: 'http://localhost:9000',
  status: 'offline' as const,
  description: 'A test agent',
  capabilities: ['chat', 'tools'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/agents']}>
      <Routes>
        <Route path="/agents" element={<AgentsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Agents Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentStoreMock.agents = [];
    agentStoreMock.opencodeInstalled = false;
    agentStoreMock.opencodeInstances = [];
  });

  describe('Page initialization', () => {
    it('renders page header', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('agents.title')).toBeInTheDocument();
        expect(screen.getByText('agents.subtitle')).toBeInTheDocument();
      });
    });

    it('renders add agent button', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /agents\.addAgent/i })).toBeInTheDocument();
      });
    });
  });

  describe('Section expansion', () => {
    it('built-in section is expanded by default', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('agents.builtInAgents')).toBeInTheDocument();
        expect(screen.getByText('agents.noBuiltIn')).toBeInTheDocument();
      });
    });

    it('external section starts collapsed', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('agents.externalAgents')).toBeInTheDocument();
        expect(screen.queryByText('agents.noExternal')).not.toBeInTheDocument();
      });
    });

    it('clicking external section expands it', async () => {
      renderWithRouter();
      const externalHeading = await screen.findByText('agents.externalAgents');
      fireEvent.click(externalHeading);
      await waitFor(() => {
        expect(screen.getByText('agents.noExternal')).toBeInTheDocument();
      });
    });

    it('opencode section starts collapsed', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('agents.openCodeSection')).toBeInTheDocument();
        expect(screen.queryByText('agents.notInstalled')).not.toBeInTheDocument();
      });
    });
  });

  describe('Add agent', () => {
    it('opens add modal when add button clicked', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /agents\.addAgent/i });
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('agents.category')).toBeInTheDocument();
        expect(screen.getByText('agents.type')).toBeInTheDocument();
      });
    });

    it('adds agent when form submitted with valid data', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /agents\.addAgent/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('agents.category')).toBeInTheDocument());
      const nameInput = screen.getByPlaceholderText('My Agent') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Agent' } });
      const submitButtons = screen.getAllByRole('button', { name: /agents\.addAgent/i });
      fireEvent.click(submitButtons[submitButtons.length - 1]);
      await waitFor(() => {
        expect(mockAddAgent).toHaveBeenCalledTimes(1);
        expect(mockAddAgent.mock.calls[0][0].name).toBe('New Agent');
      });
    });

    it('does not add agent when name is empty', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /agents\.addAgent/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('agents.category')).toBeInTheDocument());
      const submitButtons = screen.getAllByRole('button', { name: /agents\.addAgent/i });
      fireEvent.click(submitButtons[submitButtons.length - 1]);
      expect(mockAddAgent).not.toHaveBeenCalled();
    });

    it('closes modal when cancel clicked', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /agents\.addAgent/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('agents.category')).toBeInTheDocument());
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('agents.category')).not.toBeInTheDocument();
      });
    });
  });

  describe('Remove agent', () => {
    it('calls removeAgent when delete button clicked', async () => {
      const agent = sampleAgent();
      agentStoreMock.agents = [agent];
      renderWithRouter();
      const externalHeading = await screen.findByText('agents.externalAgents');
      fireEvent.click(externalHeading);
      await screen.findByText(agent.name);
      const agentName = screen.getByText(agent.name);
      const card = agentName.closest('div.flex.flex-col');
      const buttons = card?.querySelectorAll('button') || [];
      const trashBtn = buttons[buttons.length - 1] as HTMLButtonElement;
      expect(trashBtn).toBeTruthy();
      fireEvent.click(trashBtn);
      expect(mockRemoveAgent).toHaveBeenCalledWith(agent.id);
    });

    it('renders multiple agent cards', async () => {
      const agent1 = sampleAgent({ id: 'a-1', name: 'Agent One' });
      const agent2 = sampleAgent({ id: 'a-2', name: 'Agent Two' });
      agentStoreMock.agents = [agent1, agent2];
      renderWithRouter();
      const externalHeading = await screen.findByText('agents.externalAgents');
      fireEvent.click(externalHeading);
      await screen.findByText('Agent One');
      await screen.findByText('Agent Two');
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('OpenCode section', () => {
    it('shows not installed state when not installed', async () => {
      agentStoreMock.opencodeInstalled = false;
      renderWithRouter();
      const opencodeHeading = await screen.findByText('agents.openCodeSection');
      fireEvent.click(opencodeHeading);
      await waitFor(() => {
        expect(screen.getByText('agents.notInstalled')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /agents\.installOpenCode/i })).toBeInTheDocument();
      });
    });

    it('calls installOpenCode when install button clicked', async () => {
      agentStoreMock.opencodeInstalled = false;
      renderWithRouter();
      const opencodeHeading = await screen.findByText('agents.openCodeSection');
      fireEvent.click(opencodeHeading);
      await waitFor(() => expect(screen.getByText('agents.notInstalled')).toBeInTheDocument());
      const installBtn = screen.getByRole('button', { name: /agents\.installOpenCode/i });
      fireEvent.click(installBtn);
      await waitFor(() => {
        expect(mockInstallOpenCode).toHaveBeenCalledTimes(1);
      });
    });

    it('shows installed state when opencode is installed', async () => {
      agentStoreMock.opencodeInstalled = true;
      agentStoreMock.opencodeInstances = [{
        id: 'inst-1',
        name: 'OpenCode',
        port: 3000,
        status: 'running',
        version: '1.0.0',
      }];
      renderWithRouter();
      const opencodeHeading = await screen.findByText('agents.openCodeSection');
      fireEvent.click(opencodeHeading);
      await waitFor(() => {
        expect(screen.queryByText('agents.notInstalled')).not.toBeInTheDocument();
      });
    });

    it('calls launchOpenCode when launch button clicked', async () => {
      agentStoreMock.opencodeInstalled = true;
      agentStoreMock.opencodeInstances = [{
        id: 'inst-1',
        name: 'OpenCode',
        port: 3000,
        status: 'stopped',
        version: '1.0.0',
      }];
      renderWithRouter();
      const opencodeHeading = await screen.findByText('agents.openCodeSection');
      fireEvent.click(opencodeHeading);
      await waitFor(() => {
        const launchBtn = screen.getByRole('button', { name: /agents\.launchInstance/i });
        fireEvent.click(launchBtn);
        expect(mockLaunchOpenCode).toHaveBeenCalled();
      });
    });

    it('calls stopOpenCode when stop button clicked on running instance', async () => {
      agentStoreMock.opencodeInstalled = true;
      agentStoreMock.opencodeInstances = [{
        id: 'inst-1',
        name: 'OpenCode',
        port: 3000,
        status: 'running',
        version: '1.0.0',
      }];
      renderWithRouter();
      const opencodeHeading = await screen.findByText('agents.openCodeSection');
      fireEvent.click(opencodeHeading);
      await waitFor(() => {
        const stopBtn = screen.getByRole('button', { name: /agents\.stop/i });
        fireEvent.click(stopBtn);
        expect(mockStopOpenCode).toHaveBeenCalled();
      });
    });
  });

  describe('Agent rendering', () => {
    it('displays agent name and description', async () => {
      const agent = sampleAgent({ name: 'My Agent', description: 'My description' });
      agentStoreMock.agents = [agent];
      renderWithRouter();
      const externalHeading = await screen.findByText('agents.externalAgents');
      fireEvent.click(externalHeading);
      await screen.findByText('My Agent');
      expect(screen.getByText('My description')).toBeInTheDocument();
    });

    it('displays agent start/stop button based on status', async () => {
      const agent = sampleAgent({ status: 'online' });
      agentStoreMock.agents = [agent];
      renderWithRouter();
      const externalHeading = await screen.findByText('agents.externalAgents');
      fireEvent.click(externalHeading);
      await screen.findByText(agent.name);
      expect(screen.getByRole('button', { name: /agents\.stop/i })).toBeInTheDocument();
    });
  });
});
