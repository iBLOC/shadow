import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MCPPage } from '../../src/pages/MCPPage';

const mockAddServer = vi.fn();
const mockRemoveServer = vi.fn();
const mockUpdateServer = vi.fn();

const sampleServer = {
 id: 'mcp-1',
 name: 'Filesystem Server',
 command: 'npx',
 args: ['-y', '@modelcontextprotocol/server-filesystem'],
 env: {},
 status: 'stopped' as const,
};

vi.mock('../../src/stores/mcpStore', () => ({
 useMCPStore: vi.fn(() => ({
 servers: [],
 addServer: mockAddServer,
 removeServer: mockRemoveServer,
 updateServer: mockUpdateServer,
 })),
}));

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string) => key,
 }),
}));

describe('MCP Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mockAddServer.mockClear();
 mockRemoveServer.mockClear();
 mockUpdateServer.mockClear();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/mcp']}>
 <Routes>
 <Route path="/mcp" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('renders page header and add button', async () => {
 renderWithRouter(<MCPPage />);

 await waitFor(() => {
 expect(screen.getByText('mcp.title')).toBeInTheDocument();
 const addButtons = screen.getAllByRole('button', {
 name: /mcp.addServer/i,
 });
 expect(addButtons.length).toBeGreaterThan(0);
 });
 });

 it('shows empty state when no servers', async () => {
 renderWithRouter(<MCPPage />);

 await waitFor(() => {
 expect(screen.getByText('mcp.noServers')).toBeInTheDocument();
 });
 });

 it('opens add server modal when add button clicked', async () => {
 renderWithRouter(<MCPPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /mcp.addServer/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('mcp.command')).toBeInTheDocument();
 expect(screen.getByText('mcp.arguments')).toBeInTheDocument();
 });
 });

 it('calls addServer when form submitted with name and command', async () => {
 renderWithRouter(<MCPPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /mcp.addServer/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('mcp.command')).toBeInTheDocument();
 });

 const nameInput = screen.getByPlaceholderText('My MCP Server') as HTMLInputElement;
 fireEvent.change(nameInput, { target: { value: 'My Server' } });

 const commandInput = screen.getByPlaceholderText('npx') as HTMLInputElement;
 fireEvent.change(commandInput, { target: { value: 'node' } });

 const argsInput = screen.getByPlaceholderText(
 '-y, @modelcontextprotocol/server-filesystem'
 ) as HTMLInputElement;
 fireEvent.change(argsInput, { target: { value: 'arg1, arg2' } });

 const submitButtons = screen.getAllByRole('button', {
 name: /mcp.addServer/i,
 });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 await waitFor(() => {
 expect(mockAddServer).toHaveBeenCalledTimes(1);
 const passed = mockAddServer.mock.calls[0][0];
 expect(passed.name).toBe('My Server');
 expect(passed.command).toBe('node');
 expect(passed.args).toEqual(['arg1', 'arg2']);
 expect(passed.status).toBe('stopped');
 });
 });

 it('does not call addServer when name is missing', async () => {
 renderWithRouter(<MCPPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /mcp.addServer/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('mcp.command')).toBeInTheDocument();
 });

 const commandInput = screen.getByPlaceholderText('npx') as HTMLInputElement;
 fireEvent.change(commandInput, { target: { value: 'node' } });

 const submitButtons = screen.getAllByRole('button', {
 name: /mcp.addServer/i,
 });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 expect(mockAddServer).not.toHaveBeenCalled();
 });

 it('does not call addServer when command is missing', async () => {
 renderWithRouter(<MCPPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /mcp.addServer/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('mcp.command')).toBeInTheDocument();
 });

 const nameInput = screen.getByPlaceholderText('My MCP Server') as HTMLInputElement;
 fireEvent.change(nameInput, { target: { value: 'My Server' } });

 const submitButtons = screen.getAllByRole('button', {
 name: /mcp.addServer/i,
 });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 expect(mockAddServer).not.toHaveBeenCalled();
 });
});
