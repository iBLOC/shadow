import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

describe('mDNS discovery protocol', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOkJson(data: unknown, status = 200) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 204 ? 'No Content' : 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => data,
    });
  }

  describe('discovery lifecycle', () => {
    it('full lifecycle: start, list, broadcast, stop', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://localhost:8082' });

      mockFetch.mockImplementationOnce(() => mockOkJson(null, 204));
      await client.startDiscovery();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/start',
        expect.anything(),
      );

      const mockDevices = [
        { id: 'dev-1', name: 'Agent Alpha', type: 'agent', capabilities: ['llm', 'vad'], host: '192.168.1.10', port: 8082, lastSeen: '2026-01-01T00:00:00Z' },
        { id: 'dev-2', name: 'Engine Beta', type: 'engine', capabilities: ['tts'], host: '192.168.1.11', port: 8083, version: '0.2.0', lastSeen: '2026-01-01T00:00:01Z' },
      ];
      mockFetch.mockImplementationOnce(() => mockOkJson(mockDevices));
      const devices = await client.getDiscoveredDevices();
      expect(devices).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/devices',
        expect.anything(),
      );

      // Broadcast discovery
      mockFetch.mockImplementationOnce(() => mockOkJson(null, 204));
      await client.broadcastDiscovery();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/broadcast',
        expect.objectContaining({ method: 'POST' }),
      );

      // Stop discovery
      mockFetch.mockImplementationOnce(() => mockOkJson(null, 204));
      await client.stopDiscovery();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/api/discovery/stop',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('handles device with all optional metadata fields', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      const richDevice = {
        id: 'dev-3', name: 'Router Gamma', type: 'router',
        capabilities: [] as string[],
        host: '10.0.0.1', port: 9090, version: '1.0.0',
        lastSeen: '2026-06-01T12:00:00Z',
        metadata: { region: 'us-east', priority: 1 },
      };

      mockFetch.mockImplementationOnce(() => mockOkJson([richDevice]));
      const [device] = await client.listAllDiscovered();

      expect(device.id).toBe('dev-3');
      expect(device.type).toBe('router');
      expect(device.version).toBe('1.0.0');
      expect(device.metadata).toEqual({ region: 'us-east', priority: 1 });
    });
  });

  describe('HTTP 204 handling', () => {
    it('returns undefined for 204 No Content response', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      mockFetch.mockImplementationOnce(() => mockOkJson(null, 204));
      const result = await client.startDiscovery();
      expect(result).toBeUndefined();
    });

    it('handles 204 for stopDiscovery', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      mockFetch.mockImplementationOnce(() => mockOkJson(null, 204));
      await expect(client.stopDiscovery()).resolves.toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('fetches /health on given host and port', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      mockFetch.mockResolvedValueOnce({ ok: true });
      await client.testConnection('10.0.0.50', 8082);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://10.0.0.50:8082/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns false when host is unreachable', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      mockFetch.mockRejectedValue(new Error('connect EHOSTUNREACH'));
      const result = await client.testConnection('10.0.0.99', 8082);
      expect(result).toBe(false);
    });
  });

  describe('base URL management', () => {
    it('defaults to http://localhost:8082', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();
      expect(client.getBaseUrl()).toBe('http://localhost:8082');
    });

    it('accepts custom baseUrl via constructor', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://custom:9999' });
      expect(client.getBaseUrl()).toBe('http://custom:9999');
    });

    it('setBaseUrl updates the base URL', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient({ baseUrl: 'http://old:8082' });
      client.setBaseUrl('http://new:8082');
      expect(client.getBaseUrl()).toBe('http://new:8082');
    });

    it('uses updated baseUrl for subsequent requests', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();
      client.setBaseUrl('http://updated:8082');

      mockFetch.mockImplementationOnce(() => mockOkJson([], 200));
      await client.getDiscoveredDevices();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://updated:8082/api/discovery/devices',
        expect.anything(),
      );
    });
  });

  describe('error propagation', () => {
    it('throws HTTP error with status and text', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Map(),
        json: async () => ({}),
      });

      await expect(client.getDiscoveredDevices()).rejects.toThrow('HTTP 503');
    });

    it('propagates fetch errors for listAllDiscovered', async () => {
      const { DiscoveryClient } = await import('../../src/lib/discoveryClient');
      const client = new DiscoveryClient();

      mockFetch.mockRejectedValue(new Error('connection refused'));
      await expect(client.listAllDiscovered()).rejects.toThrow('connection refused');
    });
  });
});
