import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MCPPage } from '../../src/pages/MCPPage';

const mockServers: any[] = [];
const mockAddServer = vi.fn();
const mockRemoveServer = vi.fn();
const mockUpdateServer = vi.fn();

vi.mock('../../src/stores/mcpStore', () => ({
  useMCPStore: () => ({
    servers: mockServers,
    addServer: mockAddServer,
    removeServer: mockRemoveServer,
    updateServer: mockUpdateServer,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

const sampleServer = (overrides: any = {}) => ({
  id: 'mcp-1',
  name: 'Test Server',
  command: 'npx',
  args: ['-y', 'test'],
  env: {},
  status: 'stopped' as const,
  ...overrides,
});

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/mcp']}>
      <Routes>
        <Route path="/mcp" element={<MCPPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('MCP Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServers.length = 0;
  });

  describe('Empty state', () => {
    it('shows empty state when no servers', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('mcp.noServers')).toBeInTheDocument();
        expect(screen.getByText('mcp.noServersHint')).toBeInTheDocument();
      });
    });

    it('shows add server button in empty state', async () => {
      renderWithRouter();
      await waitFor(() => {
        const addBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
        expect(addBtns.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Add server', () => {
    it('opens add form when add button clicked', async () => {
      renderWithRouter();
      const addBtns = await screen.findAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => {
        expect(screen.getByText('mcp.command')).toBeInTheDocument();
        expect(screen.getByText('mcp.arguments')).toBeInTheDocument();
      });
    });

    it('adds server with name, command, args', async () => {
      renderWithRouter();
      const addBtns = await screen.findAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const nameInput = screen.getByPlaceholderText('My MCP Server') as HTMLInputElement;
      const commandInput = screen.getByPlaceholderText('npx') as HTMLInputElement;
      const argsInput = screen.getByPlaceholderText('-y, @modelcontextprotocol/server-filesystem') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Server' } });
      fireEvent.change(commandInput, { target: { value: 'node' } });
      fireEvent.change(argsInput, { target: { value: 'arg1, arg2' } });
      const submitBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      await waitFor(() => {
        expect(mockAddServer).toHaveBeenCalledTimes(1);
        const server = mockAddServer.mock.calls[0][0];
        expect(server.name).toBe('My Server');
        expect(server.command).toBe('node');
        expect(server.args).toEqual(['arg1', 'arg2']);
        expect(server.status).toBe('stopped');
      });
    });

    it('does not add server with empty name', async () => {
      renderWithRouter();
      const addBtns = await screen.findAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const commandInput = screen.getByPlaceholderText('npx') as HTMLInputElement;
      fireEvent.change(commandInput, { target: { value: 'node' } });
      const submitBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      expect(mockAddServer).not.toHaveBeenCalled();
    });

    it('does not add server with empty command', async () => {
      renderWithRouter();
      const addBtns = await screen.findAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const nameInput = screen.getByPlaceholderText('My MCP Server') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Server' } });
      const submitBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      expect(mockAddServer).not.toHaveBeenCalled();
    });

    it('closes form when cancel clicked', async () => {
      renderWithRouter();
      const addBtns = await screen.findAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(addBtns[0]);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('mcp.command')).not.toBeInTheDocument();
      });
    });
  });

  describe('Server rendering', () => {
    it('renders server card with name and command', async () => {
      const server = sampleServer({ name: 'My Server', command: 'npx' });
      mockServers.push(server);
      renderWithRouter();
      await screen.findByText('My Server');
      const allText = document.body.textContent || '';
      expect(allText).toContain('npx');
    });

    it('shows status indicator based on server status', async () => {
      const server = sampleServer({ status: 'running' });
      mockServers.push(server);
      renderWithRouter();
      await screen.findByText(server.name);
      const cards = document.querySelectorAll('.border-l-4');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('renders multiple servers', async () => {
      mockServers.push(sampleServer({ id: 'mcp-1', name: 'Server 1' }));
      mockServers.push(sampleServer({ id: 'mcp-2', name: 'Server 2' }));
      renderWithRouter();
      await screen.findByText('Server 1');
      await screen.findByText('Server 2');
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBe(2);
    });
  });

  describe('Expand server card', () => {
    it('clicking server header shows details', async () => {
      const server = sampleServer();
      mockServers.push(server);
      renderWithRouter();
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => {
        expect(screen.getByText('mcp.command')).toBeInTheDocument();
      });
    });

    it('clicking expanded server collapses it', async () => {
      const server = sampleServer();
      mockServers.push(server);
      renderWithRouter();
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      fireEvent.click(header);
      await waitFor(() => {
        expect(screen.queryByText('mcp.command')).not.toBeInTheDocument();
      });
    });
  });

  describe('Start/stop server', () => {
    it('clicking start on stopped server calls updateServer with running', async () => {
      const server = sampleServer({ status: 'stopped' });
      mockServers.push(server);
      renderWithRouter();
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const startBtn = screen.getByRole('button', { name: /mcp\.start/i });
      fireEvent.click(startBtn);
      expect(mockUpdateServer).toHaveBeenCalledWith(server.id, { status: 'running' });
    });

    it('clicking stop on running server calls updateServer with stopped', async () => {
      const server = sampleServer({ status: 'running' });
      mockServers.push(server);
      renderWithRouter();
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const stopBtn = screen.getByRole('button', { name: /mcp\.stop/i });
      fireEvent.click(stopBtn);
      expect(mockUpdateServer).toHaveBeenCalledWith(server.id, { status: 'stopped' });
    });
  });

  describe('Delete server', () => {
    it('clicking delete calls removeServer', async () => {
      const server = sampleServer();
      mockServers.push(server);
      renderWithRouter();
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => expect(screen.getByText('mcp.command')).toBeInTheDocument());
      const deleteBtn = screen.getByText('common.delete').closest('button') as HTMLButtonElement;
      fireEvent.click(deleteBtn);
      expect(mockRemoveServer).toHaveBeenCalledWith(server.id);
    });
  });

  describe('Server error display', () => {
    it('shows lastError when server has an error', async () => {
      const server = sampleServer({ lastError: 'Connection refused' });
      mockServers.push(server);
      renderWithRouter();
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => {
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });
  });
});