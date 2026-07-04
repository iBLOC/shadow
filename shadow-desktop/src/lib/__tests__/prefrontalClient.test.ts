import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const { cortexState } = vi.hoisted(() => ({
  cortexState: { connection: { baseUrl: 'http://localhost:8085' } },
}));

vi.mock('../platform', () => ({
  prefrontalUrl: () => 'http://localhost:8085',
}));

vi.mock('../cortexClient', () => ({
  cortexClient: { setBaseUrl: vi.fn() },
}));

vi.mock('../../stores/cortexStore', () => ({
  useCortexStore: {
    getState: () => ({
      connection: cortexState.connection,
      setBaseUrl: (url: string) => { cortexState.connection.baseUrl = url; },
    }),
  },
}));

describe('prefrontalClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cortexState.connection.baseUrl = 'http://localhost:8085';
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cortex-aware baseUrl', () => {
    it('accepts custom baseUrl override', async () => {
      const { PrefrontalClient } = await import('../prefrontalClient');
      const client = new PrefrontalClient('http://custom:9090');
      mockFetch.mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ status: 'ok' }),
        text: async () => '{"status":"ok"}',
      });
      await client.healthCheck();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom:9090/health',
        expect.any(Object),
      );
    });

    it('falls back to platform prefrontalUrl when no cortex override', async () => {
      const { PrefrontalClient } = await import('../prefrontalClient');
      const client = new PrefrontalClient();
      mockFetch.mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ status: 'ok' }),
        text: async () => '{"status":"ok"}',
      });
      await client.healthCheck();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/health',
        expect.any(Object),
      );
    });
  });

  describe('A2A delegation', () => {
    it('delegateToPeer sends POST /api/a2a/delegate with peer_id, message, wait', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          text: 'Delegated response from peer',
          task_id: 'task-123',
          state: 'completed',
        }),
      });

      const { prefrontalClient } = await import('../prefrontalClient');
      const result = await prefrontalClient.delegateToPeer('peer-uuid', 'Hello peer', true);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/api/a2a/delegate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            peer_id: 'peer-uuid',
            message: 'Hello peer',
            wait: true,
          }),
        })
      );
      expect(result.text).toBe('Delegated response from peer');
      expect(result.task_id).toBe('task-123');
      expect(result.state).toBe('completed');
    });

    it('delegateToPeer waits=false for fire-and-forget mode', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          text: '',
          task_id: 'task-456',
          state: 'queued',
        }),
      });

      const { prefrontalClient } = await import('../prefrontalClient');
      const result = await prefrontalClient.delegateToPeer('peer-uuid', 'Run async task', false);

      const call = mockFetch.mock.calls[0];
      expect(JSON.parse(call[1].body as string)).toEqual({
        peer_id: 'peer-uuid',
        message: 'Run async task',
        wait: false,
      });
      expect(result.state).toBe('queued');
    });

    it('returns error shape on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          error: {
            code: 'invalid_request',
            message: 'Peer not found',
            param: 'peer_id',
          },
        }),
      });

      const { prefrontalClient } = await import('../prefrontalClient');
      await expect(
        prefrontalClient.delegateToPeer('invalid-peer', 'test', true)
      ).rejects.toThrow('HTTP 400');
    });

    it('getA2ATask fetches GET /api/a2a/peers/{peer_id}/tasks/{task_id}', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          task_id: 'task-789',
          state: 'completed',
          result: { text: 'Task result' },
        }),
      });

      const { prefrontalClient } = await import('../prefrontalClient');
      const result = await prefrontalClient.getA2ATask('peer-uuid', 'task-789');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/api/a2a/peers/peer-uuid/tasks/task-789',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.task_id).toBe('task-789');
      expect(result.state).toBe('completed');
    });

    it('cancelA2ATask sends DELETE /api/a2a/peers/{peer_id}/tasks/{task_id}/cancel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true }),
      });

      const { prefrontalClient } = await import('../prefrontalClient');
      await prefrontalClient.cancelA2ATask('peer-uuid', 'task-789');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8085/api/a2a/peers/peer-uuid/tasks/task-789/cancel',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});