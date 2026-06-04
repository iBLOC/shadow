import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

describe('prefrontalClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
        'http://localhost:8082/api/a2a/delegate',
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
        'http://localhost:8082/api/a2a/peers/peer-uuid/tasks/task-789',
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
        'http://localhost:8082/api/a2a/peers/peer-uuid/tasks/task-789/cancel',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});