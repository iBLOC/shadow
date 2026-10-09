import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

describe('CortexClient flow API', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: import('../cortexClient').CortexClient;

  beforeEach(async () => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    const { CortexClient } = await import('../cortexClient');
    client = new CortexClient({ baseUrl: 'http://localhost:60080' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listFlows', () => {
    it('calls GET /api/flows with query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: 'flow-1', name: 'TestFlow', version: '1.0.0', is_draft: false, tags: ['test'] },
        ],
      });

      const result = await client.listFlows({ name: 'TestFlow', tag: 'test', isDraft: false });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows?name=TestFlow&tag=test&is_draft=false',
        expect.any(Object),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TestFlow');
    });

    it('calls GET /api/flows without params when none provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });

      await client.listFlows();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows',
        expect.any(Object),
      );
    });
  });

  describe('createFlow', () => {
    it('POSTs the flow body and returns FlowDefinition', async () => {
      const flowDef = {
        id: 'new-flow',
        name: 'NewFlow',
        version: '0.1.0',
        schema_version: '1.0',
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => flowDef,
      });

      const result = await client.createFlow(flowDef as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(flowDef),
        }),
      );
      expect(result.id).toBe('new-flow');
    });
  });

  describe('getFlow', () => {
    it('calls GET /api/flows/{id}', async () => {
      const flowDef = { id: 'flow-123', name: 'Test', version: '1.0', schema_version: '1.0' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => flowDef,
      });

      const result = await client.getFlow('flow-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows/flow-123',
        expect.any(Object),
      );
      expect(result.id).toBe('flow-123');
    });
  });

  describe('runFlow', () => {
    it('calls POST /api/flows/by-name/{name}/invoke with inputs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ outputs: { result: 'done' } }),
      });

      const result = await client.runFlow('my-flow', { input1: 'value1' }, { sessionId: 'sess-123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows/by-name/my-flow/invoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ inputs: { input1: 'value1' }, session_id: 'sess-123' }),
        }),
      );
      expect(result.outputs).toEqual({ result: 'done' });
    });

    it('includes version in path when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ outputs: {} }),
      });

      await client.runFlow('my-flow', {}, { version: '2.0.0' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows/by-name/my-flow/2.0.0/invoke',
        expect.any(Object),
      );
    });
  });

  describe('listDrafts', () => {
    it('calls GET /api/flows/draft and returns drafts array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          drafts: [
            { id: 'draft-1', name: 'Draft1', version: '0.1.0', schema_version: '1.0' },
          ],
        }),
      });

      const result = await client.listDrafts();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows/draft',
        expect.any(Object),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('draft-1');
    });

    it('handles response as array directly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 'draft-2', name: 'Draft2', version: '0.1.0', schema_version: '1.0' }],
      });

      const result = await client.listDrafts();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('draft-2');
    });
  });

  describe('promoteDraft', () => {
    it('POSTs to /api/flows/draft/{id}/promote and returns FlowDefinition', async () => {
      const promoted = { id: 'flow-promoted', name: 'Promoted', version: '1.0.0', schema_version: '1.0' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => promoted,
      });

      const result = await client.promoteDraft('draft-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows/draft/draft-123/promote',
        expect.objectContaining({
          method: 'POST',
          body: '{}',
        }),
      );
      expect(result.id).toBe('flow-promoted');
    });
  });

  describe('rejectDraft', () => {
    it('POSTs to /api/flows/draft/{id}/reject', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      await client.rejectDraft('draft-456');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:60080/api/flows/draft/draft-456/reject',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
