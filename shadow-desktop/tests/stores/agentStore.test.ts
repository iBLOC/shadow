import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAgentStore } from '../../src/stores/agentStore';
import type { Agent, AgentTask } from '../../src/types';

vi.mock('../../src/lib/prefrontalClient', () => ({
  prefrontalClient: {
    listAgents: vi.fn(),
  },
}));

vi.mock('../../src/lib/tauriSafe', () => ({
  safeInvoke: vi.fn(),
}));

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('AgentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    
    useAgentStore.setState({
      agents: [],
      tasks: [],
      activeAgentId: null,
      isLoading: false,
      error: null,
      opencodeConfig: {
        port: 3000,
        autoLaunch: false,
        autoInstall: false,
      },
      opencodeInstances: [],
      opencodeInstalled: false,
      isLoadingOpenCode: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('starts with empty agents and tasks', () => {
      const state = useAgentStore.getState();
      expect(state.agents).toEqual([]);
      expect(state.tasks).toEqual([]);
      expect(state.activeAgentId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchAgents', () => {
    it('populates agents array from HTTP client', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', description: 'Test agent 1' },
        { id: 'agent-2', name: 'Agent 2', description: 'Test agent 2' },
      ];
      
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      vi.mocked(prefrontalClient.listAgents).mockResolvedValueOnce(mockAgents);
      
      const { fetchAgents } = useAgentStore.getState();
      await fetchAgents();
      
      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(2);
      expect(state.agents[0].id).toBe('agent-1');
      expect(state.agents[0].name).toBe('Agent 1');
      expect(state.isLoading).toBe(false);
    });

    it('sets default fields on fetched agents', async () => {
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      vi.mocked(prefrontalClient.listAgents).mockResolvedValueOnce([
        { id: 'agent-1', name: 'Test Agent' },
      ]);
      
      const { fetchAgents } = useAgentStore.getState();
      await fetchAgents();
      
      const state = useAgentStore.getState();
      expect(state.agents[0].category).toBe('external');
      expect(state.agents[0].status).toBe('online');
      expect(state.agents[0].capabilities).toEqual([]);
      expect(state.agents[0].createdAt).toBeInstanceOf(Date);
      expect(state.agents[0].updatedAt).toBeInstanceOf(Date);
    });

    it('sets isLoading during fetch', async () => {
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      
      let loadingDuringFetch: boolean | undefined;
      const fetchAgents = useAgentStore.getState().fetchAgents;
      
      const originalListAgents = prefrontalClient.listAgents;
      vi.mocked(prefrontalClient.listAgents).mockImplementation(async () => {
        loadingDuringFetch = useAgentStore.getState().isLoading;
        await originalListAgents();
        return [];
      });
      
      const promise = fetchAgents();
      
      expect(useAgentStore.getState().isLoading).toBe(true);
      
      await promise;
      
      expect(loadingDuringFetch).toBe(true);
      expect(useAgentStore.getState().isLoading).toBe(false);
    });

    it('handles errors gracefully', async () => {
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      vi.mocked(prefrontalClient.listAgents).mockRejectedValueOnce(new Error('Network error'));
      
      const { fetchAgents } = useAgentStore.getState();
      await fetchAgents();
      
      const state = useAgentStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
      expect(state.agents).toEqual([]);
    });

    it('clears error before fetching', async () => {
      useAgentStore.setState({ error: 'Previous error' });
      
      const mockAgents = [{ id: 'agent-1', name: 'Test Agent' }];
      const { prefrontalClient } = await import('../../src/lib/prefrontalClient');
      vi.mocked(prefrontalClient.listAgents).mockResolvedValueOnce(mockAgents);
      
      const { fetchAgents } = useAgentStore.getState();
      await fetchAgents();
      
      const state = useAgentStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('CRUD operations', () => {
    it('addAgent adds to agents array', () => {
      const agent: Agent = {
        id: 'agent-new',
        name: 'New Agent',
        description: 'A new agent',
        category: 'custom',
        status: 'online',
        capabilities: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const { addAgent } = useAgentStore.getState();
      addAgent(agent);
      
      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('agent-new');
    });

    it('removeAgent removes by id', () => {
      useAgentStore.setState({
        agents: [
          {
            id: 'agent-1',
            name: 'Agent 1',
            category: 'external',
            status: 'online',
            capabilities: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      
      const { removeAgent } = useAgentStore.getState();
      removeAgent('agent-1');
      
      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(0);
    });

    it('updateAgent updates existing agent', () => {
      useAgentStore.setState({
        agents: [
          {
            id: 'agent-1',
            name: 'Original Name',
            category: 'external',
            status: 'online',
            capabilities: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      
      const { updateAgent } = useAgentStore.getState();
      updateAgent('agent-1', { name: 'Updated Name' });
      
      const state = useAgentStore.getState();
      expect(state.agents[0].name).toBe('Updated Name');
      expect(state.agents[0].updatedAt).toBeInstanceOf(Date);
    });

    it('setActiveAgent sets activeAgentId', () => {
      const { setActiveAgent } = useAgentStore.getState();
      setActiveAgent('agent-special');
      
      const state = useAgentStore.getState();
      expect(state.activeAgentId).toBe('agent-special');
    });

    it('setActiveAgent clears when null', () => {
      useAgentStore.setState({ activeAgentId: 'agent-1' });
      
      const { setActiveAgent } = useAgentStore.getState();
      setActiveAgent(null);
      
      const state = useAgentStore.getState();
      expect(state.activeAgentId).toBeNull();
    });
  });

  describe('tasks', () => {
    it('addTask adds to tasks array', () => {
      const task: AgentTask = {
        id: 'task-1',
        status: 'pending',
        message: 'Test task',
      };
      
      const { addTask } = useAgentStore.getState();
      addTask(task);
      
      const state = useAgentStore.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe('task-1');
    });

    it('updateTask updates existing task', () => {
      useAgentStore.setState({
        tasks: [
          {
            id: 'task-1',
            status: 'pending',
            message: 'Original message',
          },
        ],
      });
      
      const { updateTask } = useAgentStore.getState();
      updateTask('task-1', { status: 'completed', message: 'Updated message' });
      
      const state = useAgentStore.getState();
      expect(state.tasks[0].status).toBe('completed');
      expect(state.tasks[0].message).toBe('Updated message');
    });
  });

  describe('opencodeConfig', () => {
    it('setOpenCodeConfig updates configuration', () => {
      const { setOpenCodeConfig } = useAgentStore.getState();
      setOpenCodeConfig({ port: 4000, autoLaunch: true });
      
      const state = useAgentStore.getState();
      expect(state.opencodeConfig.port).toBe(4000);
      expect(state.opencodeConfig.autoLaunch).toBe(true);
      expect(state.opencodeConfig.autoInstall).toBe(false);
    });

    it('merges partial config', () => {
      useAgentStore.setState({
        opencodeConfig: { port: 3000, autoLaunch: false, autoInstall: false },
      });
      
      const { setOpenCodeConfig } = useAgentStore.getState();
      setOpenCodeConfig({ autoInstall: true });
      
      const state = useAgentStore.getState();
      expect(state.opencodeConfig.port).toBe(3000);
      expect(state.opencodeConfig.autoInstall).toBe(true);
    });
  });

  describe('persistence', () => {
    it('preserves agents across state updates', () => {
      const agents = [
        {
          id: 'agent-persisted',
          name: 'Persisted Agent',
          category: 'external',
          status: 'online',
          capabilities: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      
      useAgentStore.setState({
        agents,
        opencodeConfig: { port: 5000, autoLaunch: true, autoInstall: false },
      });
      
      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(1);
      expect(state.opencodeConfig.port).toBe(5000);
    });
  });
});