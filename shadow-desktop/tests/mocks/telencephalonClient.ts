import { vi } from 'vitest';

// Global mock for telencephalonClient to prevent actual HTTP requests in tests
export const mockCortexClient = {
  // Health & Status
  health: vi.fn().mockResolvedValue({ id: 'cortex-test', status: 'ok' }),
  
  // Agents
  listAgents: vi.fn().mockResolvedValue({
    cortex: { id: 'cortex-test', instance_name: 'test', default_agent: 'temporal' },
    agents: [],
  }),
  scanExternalAgents: vi.fn().mockResolvedValue({ scanned_at: new Date().toISOString(), hosts: [], detected: [] }),
  syncExternalAgent: vi.fn().mockResolvedValue(undefined),
  searchAgents: vi.fn().mockResolvedValue({ results: [] }),
  
  // WASM
  listInstalledWasm: vi.fn().mockResolvedValue({ count: 0, entries: [] }),
  installWasm: vi.fn().mockResolvedValue({ name: 'test', version: '0.1.0' }),
  uninstallWasm: vi.fn().mockResolvedValue(undefined),
  
  // MCP
  listMcpServers: vi.fn().mockResolvedValue({ count: 0, servers: [] }),
  getMcpServer: vi.fn().mockResolvedValue(null),
  getMcpServerTools: vi.fn().mockResolvedValue([]),
  createMcpServer: vi.fn().mockResolvedValue({ id: 'test' }),
  deleteMcpServer: vi.fn().mockResolvedValue(undefined),
  startMcpServer: vi.fn().mockResolvedValue(undefined),
  stopMcpServer: vi.fn().mockResolvedValue(undefined),
  bindMcpAgent: vi.fn().mockResolvedValue(undefined),
  unbindMcpAgent: vi.fn().mockResolvedValue(undefined),
  getAgentMcpServers: vi.fn().mockResolvedValue([]),
  getAgentMcpTools: vi.fn().mockResolvedValue([]),
  
  // Conversations
  createConversation: vi.fn().mockResolvedValue({
    id: 'test-conv',
    agent: 'temporal',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    history: [],
  }),
  getConversation: vi.fn().mockResolvedValue({
    id: 'test-conv',
    agent: 'temporal',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    history: [],
  }),
  listConversations: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn().mockResolvedValue({
    conversation_id: 'test-conv',
    agent: 'temporal',
    reply: 'test reply',
    state: 'COMPLETED',
    timestamp: Date.now(),
  }),
  
  // Flows
  listFlows: vi.fn().mockResolvedValue([]),
  getFlow: vi.fn().mockResolvedValue(null),
  createFlow: vi.fn().mockResolvedValue({ id: 'test-flow' }),
  updateFlow: vi.fn().mockResolvedValue(undefined),
  deleteFlow: vi.fn().mockResolvedValue(undefined),
  runFlow: vi.fn().mockResolvedValue({ outputs: {} }),
  validateFlow: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  
  // Agent Description
  generateAgentDescription: vi.fn().mockResolvedValue('A test agent description'),
  
  // Configuration
  setBaseUrl: vi.fn(),
  setApiKey: vi.fn(),
  getBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:60080'),
};

vi.mock('../../src/lib/telencephalonClient', () => ({
  telencephalonClient: mockCortexClient,
  default: mockCortexClient,
}));

// Also mock the path relative to src/pages/
vi.mock('../../../src/lib/telencephalonClient', () => ({
  telencephalonClient: mockCortexClient,
  default: mockCortexClient,
}));

// Mock telencephalonStore to use the correct port
vi.mock('../../src/stores/telencephalonStore', () => ({
  useTelencephalonStore: vi.fn((selector?: any) => {
    const state = {
      status: 'running',
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
      cortexId: 'cortex-test',
      defaultAgent: 'temporal',
      lobes: [],
      flows: [],
      lastCheck: null,
      error: null,
      refreshStatus: vi.fn().mockResolvedValue(undefined),
      refreshLobes: vi.fn().mockResolvedValue(undefined),
      refreshFlows: vi.fn().mockResolvedValue(undefined),
      startCortex: vi.fn().mockResolvedValue(undefined),
      stopCortex: vi.fn().mockResolvedValue(undefined),
      setBaseUrl: vi.fn(),
      setApiKey: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));
