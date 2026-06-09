import { describe, it, expect, beforeEach } from 'vitest';
import { useMCPStore } from '../../src/stores/mcpStore';
import type { MCPServer, MCPTool, MCPResource } from '../../src/types';

const sampleServer: MCPServer = {
 id: 'mcp-1',
 name: 'Filesystem',
 command: 'npx',
 args: ['-y', '@modelcontextprotocol/server-filesystem'],
 env: {},
 status: 'stopped',
};

const sampleTool: MCPTool = {
 name: 'read_file',
 description: 'Read a file from disk',
 inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
};

const sampleResource: MCPResource = {
 uri: 'file:///tmp/test.txt',
 name: 'test.txt',
 mimeType: 'text/plain',
};

describe('MCPStore', () => {
 beforeEach(() => {
 localStorage.clear();
 useMCPStore.setState({
 servers: [],
 activeTools: [],
 resources: [],
 });
 });

 describe('initial state', () => {
 it('starts with empty servers, tools, and resources', () => {
 const state = useMCPStore.getState();
 expect(state.servers).toEqual([]);
 expect(state.activeTools).toEqual([]);
 expect(state.resources).toEqual([]);
 });
 });

 describe('addServer', () => {
 it('appends server to list', () => {
 const { addServer } = useMCPStore.getState();
 addServer(sampleServer);

 expect(useMCPStore.getState().servers).toHaveLength(1);
 expect(useMCPStore.getState().servers[0]).toEqual(sampleServer);
 });

 it('appends multiple servers preserving order', () => {
 const { addServer } = useMCPStore.getState();
 addServer(sampleServer);
 addServer({ ...sampleServer, id: 'mcp-2', name: 'GitHub' });

 const servers = useMCPStore.getState().servers;
 expect(servers).toHaveLength(2);
 expect(servers[0].id).toBe('mcp-1');
 expect(servers[1].id).toBe('mcp-2');
 });
 });

 describe('removeServer', () => {
 it('removes server by id', () => {
 useMCPStore.setState({ servers: [sampleServer] });
 const { removeServer } = useMCPStore.getState();

 removeServer('mcp-1');

 expect(useMCPStore.getState().servers).toHaveLength(0);
 });

 it('keeps other servers when removing by id', () => {
 const second = { ...sampleServer, id: 'mcp-2' };
 useMCPStore.setState({ servers: [sampleServer, second] });
 const { removeServer } = useMCPStore.getState();

 removeServer('mcp-1');

 const remaining = useMCPStore.getState().servers;
 expect(remaining).toHaveLength(1);
 expect(remaining[0].id).toBe('mcp-2');
 });

 it('is a no-op when id does not exist', () => {
 useMCPStore.setState({ servers: [sampleServer] });
 const { removeServer } = useMCPStore.getState();

 removeServer('nonexistent');

 expect(useMCPStore.getState().servers).toHaveLength(1);
 });
 });

 describe('updateServer', () => {
 it('merges updates into matching server', () => {
 useMCPStore.setState({ servers: [sampleServer] });
 const { updateServer } = useMCPStore.getState();

 updateServer('mcp-1', { status: 'running' });

 const updated = useMCPStore.getState().servers[0];
 expect(updated.status).toBe('running');
 expect(updated.name).toBe('Filesystem');
 });

 it('leaves other servers untouched', () => {
 const second = { ...sampleServer, id: 'mcp-2' };
 useMCPStore.setState({ servers: [sampleServer, second] });
 const { updateServer } = useMCPStore.getState();

 updateServer('mcp-1', { status: 'error', lastError: 'crashed' });

 const servers = useMCPStore.getState().servers;
 expect(servers[0].status).toBe('error');
 expect(servers[0].lastError).toBe('crashed');
 expect(servers[1].status).toBe('stopped');
 });
 });

 describe('setTools', () => {
 it('replaces activeTools with provided array', () => {
 useMCPStore.setState({ activeTools: [sampleTool] });
 const { setTools } = useMCPStore.getState();

 const newTools: MCPTool[] = [
 sampleTool,
 { ...sampleTool, name: 'write_file' },
 ];
 setTools(newTools);

 expect(useMCPStore.getState().activeTools).toEqual(newTools);
 expect(useMCPStore.getState().activeTools).toHaveLength(2);
 });

 it('clears activeTools when set to empty array', () => {
 useMCPStore.setState({ activeTools: [sampleTool] });
 const { setTools } = useMCPStore.getState();

 setTools([]);

 expect(useMCPStore.getState().activeTools).toEqual([]);
 });
 });

 describe('setResources', () => {
 it('replaces resources with provided array', () => {
 const { setResources } = useMCPStore.getState();

 setResources([sampleResource]);

 expect(useMCPStore.getState().resources).toEqual([sampleResource]);
 });
 });
});
