import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

describe('discoveryClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DiscoveryClient', () => {
    it('startDiscovery() POSTs to /api/discovery/start', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        json: async () => ({}),
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });
      await client.startDiscovery();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/start',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('stopDiscovery() POSTs to /api/discovery/stop', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        json: async () => ({}),
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });
      await client.stopDiscovery();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/stop',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('getDiscoveredDevices() GETs /api/discovery/devices', async () => {
      const mockDevices = [
        { id: 'device-1', name: 'Agent 1', type: 'agent' as const, capabilities: ['llm'] as const[], host: '192.168.1.100', port: 8082, lastSeen: '2024-01-01T00:00:00Z' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockDevices,
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });
      const result = await client.getDiscoveredDevices();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(mockDevices);
    });

    it('listAllDiscovered() GETs /api/discovery/list', async () => {
      const mockDevices = [
        { id: 'device-2', name: 'Agent 2', type: 'engine' as const, capabilities: ['tts'] as const[], host: '192.168.1.101', port: 8082, lastSeen: '2024-01-01T00:00:00Z' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockDevices,
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });
      const result = await client.listAllDiscovered();

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(mockDevices);
    });

    it('broadcastDiscovery() POSTs to /api/discovery/broadcast', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        json: async () => ({}),
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });
      await client.broadcastDiscovery();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/broadcast',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
        json: async () => ({}),
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });

      await expect(client.getDiscoveredDevices()).rejects.toThrow('HTTP 500');
    });

    it('returns Promise resolving with response data', async () => {
      const mockDevices = [
        { id: 'device-1', name: 'Test Device', type: 'agent' as const, capabilities: [] as const[], host: 'localhost', port: 8082, lastSeen: '2024-01-01T00:00:00Z' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockDevices,
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient();
      const promise = client.getDiscoveredDevices();

      expect(promise).toBeInstanceOf(Promise);
      const result = await promise;
      expect(result).toEqual(mockDevices);
    });
  });

  describe('testConnection', () => {
    it('returns true on successful health check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient();
      const result = await client.testConnection('192.168.1.100', 8082);

      expect(result).toBe(true);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient();
      const result = await client.testConnection('192.168.1.100', 8082);

      expect(result).toBe(false);
    });

    it('returns false on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
      });

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient();
      const result = await client.testConnection('192.168.1.100', 8082);

      expect(result).toBe(false);
    });
  });

  describe('network error propagation', () => {
    it('propagates network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const { DiscoveryClient } = await import('../discoveryClient');
      const client = new DiscoveryClient();

      await expect(client.startDiscovery()).rejects.toThrow('Network failure');
    });
  });
});