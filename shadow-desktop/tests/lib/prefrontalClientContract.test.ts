import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/platform', () => ({
  prefrontalUrl: () => 'http://localhost:8085',
}));

type MockFetch = ReturnType<typeof vi.fn>;

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function errorResponse(status: number, statusText: string, body?: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => body ?? { error: { message: statusText } },
    text: async () => JSON.stringify(body ?? { error: { message: statusText } }),
  });
}

describe('PrefrontalClient contract tests', () => {
  let mockFetch: MockFetch;
  let client: import('../../src/lib/prefrontalClient').PrefrontalClient;
  let PrefrontalClient: typeof import('../../src/lib/prefrontalClient').PrefrontalClient;

  beforeEach(async () => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    const mod = await import('../../src/lib/prefrontalClient');
    PrefrontalClient = mod.PrefrontalClient;
    client = new PrefrontalClient('http://localhost:8085');
  });

  function expectRequest(
    method: string,
    path: string,
    bodyMatcher?: (body: unknown) => void,
  ) {
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:8085${path}`,
      expect.objectContaining({
        method,
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    if (bodyMatcher && mockFetch.mock.calls.length > 0) {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body as string);
      bodyMatcher(body);
    }
  }

  describe('sessions', () => {
    it('healthCheck sends GET /health', async () => {
      mockFetch.mockResolvedValue(okJson({ status: 'ok' }));
      const result = await client.healthCheck();
      expect(result).toBe(true);
      expectRequest('GET', '/health');
    });

    it('healthCheck returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });

    it('createSession sends POST /api/sessions with name', async () => {
      mockFetch.mockResolvedValue(
        okJson({
          success: true,
          data: { id: 'ses-1', createdAt: '2026-01-01T00:00:00Z' },
        }),
      );
      const session = await client.createSession('test-session');
      expect(session.id).toBe('ses-1');
      expectRequest('POST', '/api/sessions', (b) => {
        expect(b).toEqual({ name: 'test-session' });
      });
    });

    it('createSession sends POST /api/sessions without name', async () => {
      mockFetch.mockResolvedValue(
        okJson({
          success: true,
          data: { id: 'ses-2', createdAt: '2026-01-01T00:00:00Z' },
        }),
      );
      const session = await client.createSession();
      expect(session.id).toBe('ses-2');
      expectRequest('POST', '/api/sessions', (b) => {
        expect(b).toEqual({ name: undefined });
        expect(b).not.toHaveProperty('name');
      });
    });

    it('listSessions sends GET /api/sessions', async () => {
      mockFetch.mockResolvedValue(
        okJson({ success: true, data: [{ id: 'ses-1' }, { id: 'ses-2' }] }),
      );
      const sessions = await client.listSessions();
      expect(sessions).toHaveLength(2);
      expectRequest('GET', '/api/sessions');
    });

    it('getSession sends GET /api/sessions/:id', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'ses-1', name: 'test', createdAt: '2026-01-01T00:00:00Z' }));
      const session = await client.getSession('ses-1');
      expect(session.id).toBe('ses-1');
      expectRequest('GET', '/api/sessions/ses-1');
    });

    it('deleteSession sends DELETE /api/sessions/:id', async () => {
      mockFetch.mockResolvedValue(okJson(null));
      await client.deleteSession('ses-1');
      expectRequest('DELETE', '/api/sessions/ses-1');
    });

    it('addSessionMessage sends POST /api/sessions/:id/messages', async () => {
      mockFetch.mockResolvedValue(okJson(null));
      await client.addSessionMessage('ses-1', 'user', 'Hello');
      expectRequest('POST', '/api/sessions/ses-1/messages', (b) => {
        expect(b).toEqual({ role: 'user', content: 'Hello' });
      });
    });

    it('processMessage sends POST /api/sessions/:id/process', async () => {
      mockFetch.mockResolvedValue(okJson({ response: 'Hi there' }));
      const result = await client.processMessage('ses-1', 'Hello', true);
      expect(result.response).toBe('Hi there');
      expectRequest('POST', '/api/sessions/ses-1/process', (b) => {
        expect(b).toEqual({ message: 'Hello', useTools: true });
      });
    });
  });

  describe('providers', () => {
    it('listProviders sends GET /api/providers', async () => {
      mockFetch.mockResolvedValue(okJson([{ type: 'openai', baseUrl: 'https://api.openai.com' }]));
      const providers = await client.listProviders();
      expect(providers).toHaveLength(1);
      expectRequest('GET', '/api/providers');
    });

    it('addProvider sends POST /api/providers with provider config', async () => {
      mockFetch.mockResolvedValue(okJson(null));
      const provider = { type: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-xxx', model: 'gpt-4' };
      await client.addProvider(provider);
      expectRequest('POST', '/api/providers', (b) => {
        expect(b).toEqual(provider);
      });
    });

    it('deleteProvider sends DELETE /api/providers/:type', async () => {
      mockFetch.mockResolvedValue(okJson(null));
      await client.deleteProvider('openai');
      expectRequest('DELETE', '/api/providers/openai');
    });

    it('listModelProviders sends GET /api/model-providers', async () => {
      mockFetch.mockResolvedValue(okJson([{ type: 'ollama', baseUrl: 'http://localhost:11434' }]));
      const providers = await client.listModelProviders();
      expect(providers).toHaveLength(1);
      expectRequest('GET', '/api/model-providers');
    });
  });

  describe('agents and tasks', () => {
    it('listAgents sends GET /api/agents', async () => {
      mockFetch.mockResolvedValue(
        okJson({ success: true, data: [{ id: 'agent-1', name: 'Helper' }] }),
      );
      const agents = await client.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Helper');
      expectRequest('GET', '/api/agents');
    });

    it('getAgent sends GET /api/agents/:id', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'agent-1', name: 'Helper', description: 'A helpful agent' }));
      const agent = await client.getAgent('agent-1');
      expect(agent.description).toBe('A helpful agent');
      expectRequest('GET', '/api/agents/agent-1');
    });

    it('listTasks sends GET /api/tasks', async () => {
      mockFetch.mockResolvedValue(okJson([{ id: 'task-1', status: 'completed' }]));
      const tasks = await client.listTasks();
      expect(tasks).toHaveLength(1);
      expectRequest('GET', '/api/tasks');
    });

    it('getTask sends GET /api/tasks/:id', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'task-1', status: 'running', message: 'Processing' }));
      const task = await client.getTask('task-1');
      expect(task.status).toBe('running');
      expectRequest('GET', '/api/tasks/task-1');
    });

    it('rejects with HTTP error for non-ok responses', async () => {
      mockFetch.mockResolvedValue(errorResponse(404, 'Not Found'));
      await expect(client.getAgent('nonexistent')).rejects.toThrow('HTTP 404');
    });
  });

  describe('skills, MCP, memory, conversations', () => {
    it('listSkills sends GET /api/skills', async () => {
      mockFetch.mockResolvedValue(okJson([{ name: 'code-review' }]));
      const skills = await client.listSkills();
      expect(skills).toHaveLength(1);
      expectRequest('GET', '/api/skills');
    });

    it('listMcpServers sends GET /api/mcp/servers', async () => {
      mockFetch.mockResolvedValue(okJson([{ name: 'filesystem', command: 'npx' }]));
      const servers = await client.listMcpServers();
      expect(servers).toHaveLength(1);
      expectRequest('GET', '/api/mcp/servers');
    });

    it('listMemories sends GET /api/memory/search with query params', async () => {
      mockFetch.mockResolvedValue(okJson([{ id: 'mem-1', content: 'some memory' }]));
      const memories = await client.listMemories('test', 5);
      expect(memories).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/api/memory/search?q=test&limit=5',
        expect.anything(),
      );
    });

    it('listMemories sends default limit=10 without query', async () => {
      mockFetch.mockResolvedValue(okJson([]));
      await client.listMemories();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/api/memory/search?limit=10',
        expect.anything(),
      );
    });

    it('listConversations sends GET /api/conversations', async () => {
      mockFetch.mockResolvedValue(okJson([{ id: 'conv-1' }]));
      const convs = await client.listConversations();
      expect(convs).toHaveLength(1);
      expectRequest('GET', '/api/conversations');
    });
  });

  describe('A2A delegation', () => {
    it('listA2APeers sends GET /api/a2a/peers', async () => {
      mockFetch.mockResolvedValue(okJson({ count: 1, data: [{ id: 'peer-1' }] }));
      const peers = await client.listA2APeers();
      expect(peers.count).toBe(1);
      expectRequest('GET', '/api/a2a/peers');
    });

    it('registerA2APeer sends POST /api/a2a/peers', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'peer-1' }));
      await client.registerA2APeer('peer-1', 'http://peer:8082', true);
      expectRequest('POST', '/api/a2a/peers', (b) => {
        expect(b).toEqual({ id: 'peer-1', url: 'http://peer:8082', fetch_card: true });
      });
    });

    it('registerA2APeer defaults fetchCard to true', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'peer-1' }));
      await client.registerA2APeer('peer-1', 'http://peer:8082');
      expectRequest('POST', '/api/a2a/peers', (b) => {
        expect(b.fetch_card).toBe(true);
      });
    });

    it('delegateToPeer sends POST /api/a2a/delegate', async () => {
      mockFetch.mockResolvedValue(okJson({ text: 'done', task_id: 't-1', state: 'completed' }));
      const result = await client.delegateToPeer('peer-1', 'do thing', true);
      expect(result.state).toBe('completed');
      expectRequest('POST', '/api/a2a/delegate', (b) => {
        expect(b).toEqual({ peer_id: 'peer-1', message: 'do thing', wait: true });
      });
    });

    it('getA2ATask sends GET /api/a2a/peers/:id/tasks/:taskId', async () => {
      mockFetch.mockResolvedValue(okJson({ task_id: 't-1', state: 'completed', result: { text: 'done' } }));
      const task = await client.getA2ATask('peer-1', 't-1');
      expect(task.result?.text).toBe('done');
      expectRequest('GET', '/api/a2a/peers/peer-1/tasks/t-1');
    });

    it('cancelA2ATask sends DELETE /api/a2a/peers/:id/tasks/:taskId/cancel', async () => {
      mockFetch.mockResolvedValue(okJson({ success: true }));
      const result = await client.cancelA2ATask('peer-1', 't-1');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/api/a2a/peers/peer-1/tasks/t-1/cancel',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('session migration', () => {
    it('exportSession sends GET /api/sessions/:id/export', async () => {
      mockFetch.mockResolvedValue(okJson({ messages: [] }));
      const exported = await client.exportSession('ses-1');
      expect(exported).toEqual({ messages: [] });
      expectRequest('GET', '/api/sessions/ses-1/export');
    });

    it('prepareMigration sends GET /api/sessions/:id/migrate', async () => {
      mockFetch.mockResolvedValue(okJson({ ready_for_migration: true, session_id: 'ses-1', payload: {}, size_bytes: 100 }));
      const result = await client.prepareMigration('ses-1');
      expect(result.ready_for_migration).toBe(true);
      expectRequest('GET', '/api/sessions/ses-1/migrate');
    });

    it('importSession sends POST /api/sessions/import with payload', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'ses-imported' }));
      const payload = { messages: [] };
      await client.importSession(payload, { newId: true });
      expectRequest('POST', '/api/sessions/import', (b) => {
        expect(b).toEqual({ payload, new_id: true });
      });
    });

    it('importSession defaults newId to true', async () => {
      mockFetch.mockResolvedValue(okJson({ id: 'ses-imported' }));
      await client.importSession({ messages: [] });
      expectRequest('POST', '/api/sessions/import', (b) => {
        expect(b.new_id).toBe(true);
      });
    });
  });

  describe('auth token', () => {
    it('setAuthToken adds Authorization header', async () => {
      mockFetch.mockResolvedValue(okJson({ status: 'ok' }));
      client.setAuthToken('my-token');
      await client.healthCheck();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/health',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
        }),
      );
    });

    it('clearAuthToken removes Authorization header', async () => {
      mockFetch.mockResolvedValue(okJson({ status: 'ok' }));
      client.setAuthToken('my-token');
      client.clearAuthToken();
      await client.healthCheck();
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Authorization');
    });
  });
});
