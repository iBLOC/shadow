import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('mcpStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with empty servers array', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { servers } = useMCPStore.getState();
    expect(servers).toEqual([]);
  });

  it('starts with empty activeTools', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { activeTools } = useMCPStore.getState();
    expect(activeTools).toEqual([]);
  });

  it('starts with empty resources', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { resources } = useMCPStore.getState();
    expect(resources).toEqual([]);
  });

  it('addServer adds server to list', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { addServer } = useMCPStore.getState();

    addServer({ id: 'mcp-1', name: 'Test Server', command: 'npx', args: ['serve'] });

    const { servers } = useMCPStore.getState();
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe('mcp-1');
  });

  it('removeServer removes server by id', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { addServer, removeServer } = useMCPStore.getState();

    addServer({ id: 'mcp-1', name: 'Test', command: 'npx', args: [] });
    removeServer('mcp-1');

    const { servers } = useMCPStore.getState();
    expect(servers).toHaveLength(0);
  });

  it('updateServer updates server fields', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { addServer, updateServer } = useMCPStore.getState();

    addServer({ id: 'mcp-1', name: 'Test', command: 'npx', args: [] });
    updateServer('mcp-1', { name: 'Updated' });

    const { servers } = useMCPStore.getState();
    expect(servers[0].name).toBe('Updated');
  });

  it('setTools updates active tools', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { setTools } = useMCPStore.getState();

    const tools = [{ name: 'tool1', description: 'A tool' }];
    setTools(tools);

    const { activeTools } = useMCPStore.getState();
    expect(activeTools).toHaveLength(1);
  });

  it('setResources updates resources', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { setResources } = useMCPStore.getState();

    const resources = [{ uri: 'file://test', name: 'Test' }];
    setResources(resources);

    const { resources: r } = useMCPStore.getState();
    expect(r).toHaveLength(1);
  });

  it('addServer preserves existing servers', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { addServer } = useMCPStore.getState();

    addServer({ id: 'mcp-1', name: 'First', command: 'npx', args: [] });
    addServer({ id: 'mcp-2', name: 'Second', command: 'npx', args: [] });

    const { servers } = useMCPStore.getState();
    expect(servers).toHaveLength(2);
  });

  it('removeServer preserves other servers', async () => {
    const { useMCPStore } = await import('../../stores/mcpStore');
    const { addServer, removeServer } = useMCPStore.getState();

    addServer({ id: 'mcp-1', name: 'First', command: 'npx', args: [] });
    addServer({ id: 'mcp-2', name: 'Second', command: 'npx', args: [] });
    removeServer('mcp-1');

    const { servers } = useMCPStore.getState();
    expect(servers).toHaveLength(1);
    expect(servers[0].id).toBe('mcp-2');
  });
});