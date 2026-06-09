import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentsPage } from '../../src/pages/AgentsPage';

const mockAddAgent = vi.fn();
const mockUpdateAgent = vi.fn();
const mockRemoveAgent = vi.fn();
const mockFetchOpenCodeInstances = vi.fn().mockResolvedValue(undefined);
const mockCheckOpenCodeInstalled = vi.fn().mockResolvedValue(false);

const sampleAgent = {
 id: 'agent-1',
 name: 'Test Agent',
 category: 'external' as const,
 externalType: 'custom' as const,
 endpoint: 'http://localhost:9000',
 status: 'offline' as const,
 description: 'A test agent',
 capabilities: ['chat', 'tools'],
 createdAt: new Date(),
 updatedAt: new Date(),
};

vi.mock('../../src/stores/agentStore', () => ({
 useAgentStore: vi.fn(() => ({
 agents: [],
 addAgent: mockAddAgent,
 removeAgent: mockRemoveAgent,
 updateAgent: mockUpdateAgent,
 opencodeConfig: { port:3000, autoLaunch: false, autoInstall: false },
 opencodeInstances: [],
 opencodeInstalled: false,
 isLoadingOpenCode: false,
 setOpenCodeConfig: vi.fn(),
 fetchOpenCodeInstances: mockFetchOpenCodeInstances,
 launchOpenCode: vi.fn().mockResolvedValue(undefined),
 stopOpenCode: vi.fn().mockResolvedValue(undefined),
 checkOpenCodeInstalled: mockCheckOpenCodeInstalled,
 installOpenCode: vi.fn().mockResolvedValue(undefined),
 })),
}));

vi.mock('@tauri-apps/api/core', () => ({
 invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string) => key,
 }),
}));

describe('Agents Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mockAddAgent.mockClear();
 mockUpdateAgent.mockClear();
 mockRemoveAgent.mockClear();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/agents']}>
 <Routes>
 <Route path="/agents" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('opens add agent modal when clicking add button', async () => {
 renderWithRouter(<AgentsPage />);

 const addButton = await screen.findByRole('button', { name: /agents.addAgent/i });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('agents.category')).toBeInTheDocument();
 expect(screen.getByText('agents.type')).toBeInTheDocument();
 });
 });

 it('expands external agents section to reveal empty state', async () => {
 renderWithRouter(<AgentsPage />);

 const externalHeading = await screen.findByText('agents.externalAgents');
 fireEvent.click(externalHeading);

 await waitFor(() => {
 expect(screen.getByText('agents.noExternal')).toBeInTheDocument();
 });
 });

 it('expands opencode section to show install option when not installed', async () => {
 renderWithRouter(<AgentsPage />);

 const opencodeHeading = await screen.findByText('agents.openCodeSection');
 fireEvent.click(opencodeHeading);

 await waitFor(() => {
 expect(screen.getByText('agents.notInstalled')).toBeInTheDocument();
 expect(
 screen.getByRole('button', { name: /agents.installOpenCode/i })
 ).toBeInTheDocument();
 });
 });

 it('calls addAgent when add form is submitted with name', async () => {
 renderWithRouter(<AgentsPage />);

 const addButtons = await screen.findAllByRole('button', { name: /agents.addAgent/i });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('agents.category')).toBeInTheDocument();
 });

 const nameInput = screen.getByPlaceholderText('My Agent') as HTMLInputElement;
 fireEvent.change(nameInput, { target: { value: 'My New Agent' } });

 const submitButtons = screen.getAllByRole('button', { name: /agents.addAgent/i });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 await waitFor(() => {
 expect(mockAddAgent).toHaveBeenCalledTimes(1);
 const passedAgent = mockAddAgent.mock.calls[0][0];
 expect(passedAgent.name).toBe('My New Agent');
 });
 });

 it('does not call addAgent when name is empty', async () => {
 renderWithRouter(<AgentsPage />);

 const addButtons = await screen.findAllByRole('button', { name: /agents.addAgent/i });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('agents.category')).toBeInTheDocument();
 });

 const submitButtons = screen.getAllByRole('button', { name: /agents.addAgent/i });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 expect(mockAddAgent).not.toHaveBeenCalled();
 });

 it('expands built-in section by default and shows empty state', async () => {
 renderWithRouter(<AgentsPage />);

 await waitFor(() => {
 expect(screen.getByText('agents.noBuiltIn')).toBeInTheDocument();
 });
 });

 it('renders all three section headers', async () => {
 renderWithRouter(<AgentsPage />);

 await waitFor(() => {
 expect(screen.getByText('agents.builtInAgents')).toBeInTheDocument();
 expect(screen.getByText('agents.externalAgents')).toBeInTheDocument();
 expect(screen.getByText('agents.openCodeSection')).toBeInTheDocument();
 });
 });
});
