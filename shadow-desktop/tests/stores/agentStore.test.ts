import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAgentStore } from '../../src/stores/agentStore';
import type { Agent, AgentTask } from '../../src/types';

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
    });
  });

  /**
   * ⚠️ **不许回来** —— 这里曾经有一个 `fetchAgents`：
   * 它打的是旧的 `/api/agents`（今天 404），而且它 `set({ agents })`
   * ⇒ ⇒ 会把**用户自建的 custom agents**（这个 store 是持久化的）
   * **整份覆盖**成大脑的叶区列表 ⇒ ⇒ 那是一次**静默的数据覆盖**
   * ⇒ ⇒ 它没有调用方 ⇒ ⇒ 所以它是**删掉**，不是「修好」。
   *
   * 大脑那一边的 agent 列表在 `stores/telencephalonStore.ts` 的 lobes 里
   * （`GET /shadow/v1/agents`）。
   */
  describe('fetchAgents（已删除）', () => {
    it('store 上**不许**再有 fetchAgents / isLoading / error', () => {
      const state = useAgentStore.getState() as unknown as Record<string, unknown>;
      expect(state.fetchAgents).toBeUndefined();
      expect(state.isLoading).toBeUndefined();
      expect(state.error).toBeUndefined();
    });

    it('用户自建的 custom agents 留着不动（没有任何自动同步会顶掉它）', async () => {
      useAgentStore.getState().addAgent({
        id: 'custom-1',
        name: '我的 agent',
        description: '',
        category: 'custom',
        status: 'online',
        capabilities: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // 让所有 pending 的 promise 落地（万一还有人在偷偷同步）
      await Promise.resolve();
      await Promise.resolve();
      const agents = useAgentStore.getState().agents;
      expect(agents).toHaveLength(1);
      expect(agents[0].category).toBe('custom');
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
      });
      
      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(1);
    });
  });
});