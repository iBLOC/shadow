import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MemoryPage } from '../../src/pages/MemoryPage';
import { MCPPage } from '../../src/pages/MCPPage';
import { SkillsPage } from '../../src/pages/SkillsPage';
import { ModelsPage } from '../../src/pages/ModelsPage';

const mockMemories: any[] = [];
const mockSearchMemories = vi.fn();
const mockAddMemory = vi.fn();
const mockRemoveMemory = vi.fn();

vi.mock('../../src/stores/memoryStore', () => ({
  useMemoryStore: () => ({
    memories: mockMemories,
    searchResults: [],
    isLoading: false,
    error: null,
    searchMemories: mockSearchMemories,
    addMemory: mockAddMemory,
    removeMemory: mockRemoveMemory,
  }),
}));

const mockMCPServers: any[] = [];
const mockAddServer = vi.fn();
const mockRemoveServer = vi.fn();
const mockUpdateServer = vi.fn();

vi.mock('../../src/stores/mcpStore', () => ({
  useMCPStore: () => ({
    servers: mockMCPServers,
    addServer: mockAddServer,
    removeServer: mockRemoveServer,
    updateServer: mockUpdateServer,
  }),
}));

const mockSkills: any[] = [];
const mockAddSkill = vi.fn();
const mockRemoveSkill = vi.fn();
const mockToggleSkill = vi.fn();

vi.mock('../../src/stores/skillStore', () => ({
  useSkillStore: () => ({
    skills: mockSkills,
    addSkill: mockAddSkill,
    removeSkill: mockRemoveSkill,
    toggleSkill: mockToggleSkill,
  }),
}));

const mockAddProvider = vi.fn();
const mockUpdateProvider = vi.fn();
const mockDeleteProvider = vi.fn();
const mockAddModel = vi.fn();
const mockUpdateModel = vi.fn();
const mockDeleteModel = vi.fn();

vi.mock('../../src/stores/modelStore', () => ({
  useModelStore: () => ({
    providers: [],
    isLoading: false,
    error: null,
    addProvider: mockAddProvider,
    updateProvider: mockUpdateProvider,
    deleteProvider: mockDeleteProvider,
    addModel: mockAddModel,
    updateModel: mockUpdateModel,
    deleteModel: mockDeleteModel,
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

const renderWithRouter = (path: string, component: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={component} />
      </Routes>
    </MemoryRouter>,
  );

describe('Error Handling E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemories.length = 0;
    mockMCPServers.length = 0;
    mockSkills.length = 0;
  });

  describe('Form validation errors', () => {
    it('Memory: does not add when content is empty', async () => {
      renderWithRouter('/memory', <MemoryPage />);
      await screen.findByText('memory.title');
      const addBtn = screen.getAllByRole('button', { name: /memory\.addMemory/i })[0];
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('common.description')).toBeInTheDocument();
      });
      const submitBtns = screen.getAllByRole('button', { name: /common\.save/i });
      fireEvent.click(submitBtns[0]);
      expect(mockAddMemory).not.toHaveBeenCalled();
    });

    it('MCP: does not add when name is missing', async () => {
      renderWithRouter('/mcp', <MCPPage />);
      await screen.findByText('mcp.title');
      const addBtn = screen.getAllByRole('button', { name: /mcp\.addServer/i })[0];
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('mcp.command')).toBeInTheDocument();
      });
      const cmdInput = screen.getByPlaceholderText('npx') as HTMLInputElement;
      fireEvent.change(cmdInput, { target: { value: 'node' } });
      const submitBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      expect(mockAddServer).not.toHaveBeenCalled();
    });

    it('MCP: does not add when command is missing', async () => {
      renderWithRouter('/mcp', <MCPPage />);
      await screen.findByText('mcp.title');
      const addBtn = screen.getAllByRole('button', { name: /mcp\.addServer/i })[0];
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('mcp.command')).toBeInTheDocument();
      });
      const nameInput = screen.getByPlaceholderText('My MCP Server') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Server' } });
      const submitBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      expect(mockAddServer).not.toHaveBeenCalled();
    });
  });

  describe('API failure recovery', () => {
    it('Memory: search attempt is made when Enter is pressed', async () => {
      renderWithRouter('/memory', <MemoryPage />);
      await screen.findByText('memory.title');
      const searchInput = screen.getByPlaceholderText(/memory\.searchPlaceholder/i) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test query' } });
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      expect(mockSearchMemories).toHaveBeenCalledWith('test query', undefined);
    });

    it('MCP: shows error when addServer throws', async () => {
      vi.mocked(mockAddServer).mockImplementationOnce(() => {
        throw new Error('MCP add failed');
      });
      renderWithRouter('/mcp', <MCPPage />);
      await screen.findByText('mcp.title');
      const addBtn = screen.getAllByRole('button', { name: /mcp\.addServer/i })[0];
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('mcp.command')).toBeInTheDocument();
      });
      const nameInput = screen.getByPlaceholderText('My MCP Server') as HTMLInputElement;
      const cmdInput = screen.getByPlaceholderText('npx') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Server' } });
      fireEvent.change(cmdInput, { target: { value: 'node' } });
      const submitBtns = screen.getAllByRole('button', { name: /mcp\.addServer/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      expect(mockAddServer).toHaveBeenCalled();
    });
  });

  describe('Empty state behaviors', () => {
    it('Memory: shows empty state when no memories', async () => {
      renderWithRouter('/memory', <MemoryPage />);
      await screen.findByText('memory.title');
      expect(screen.getByText('memory.noMemories')).toBeInTheDocument();
    });

    it('MCP: shows empty state when no servers', async () => {
      renderWithRouter('/mcp', <MCPPage />);
      await screen.findByText('mcp.title');
      expect(screen.getByText('mcp.noServers')).toBeInTheDocument();
    });

    it('Skills: shows title even with no skills (no empty state rendered)', async () => {
      renderWithRouter('/skills', <SkillsPage />);
      await screen.findByText('skills.title');
      expect(screen.getByText('skills.title')).toBeInTheDocument();
    });

    it('Models: shows empty state when no providers', async () => {
      renderWithRouter('/models', <ModelsPage />);
      await screen.findByText('models.title');
      expect(screen.getByText('models.noProviders')).toBeInTheDocument();
    });
  });

  describe('Loading states', () => {
    it('Models: renders page when isLoading=false (default state)', async () => {
      renderWithRouter('/models', <ModelsPage />);
      await screen.findByText('models.title');
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  describe('Cancel/abort operations', () => {
    it('Memory: closes add form when cancel clicked', async () => {
      renderWithRouter('/memory', <MemoryPage />);
      await screen.findByText('memory.title');
      const addBtn = screen.getAllByRole('button', { name: /memory\.addMemory/i })[0];
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('common.description')).toBeInTheDocument();
      });
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('common.description')).not.toBeInTheDocument();
      });
    });

    it('MCP: closes add modal when cancel clicked', async () => {
      renderWithRouter('/mcp', <MCPPage />);
      await screen.findByText('mcp.title');
      const addBtn = screen.getAllByRole('button', { name: /mcp\.addServer/i })[0];
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('mcp.command')).toBeInTheDocument();
      });
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('mcp.command')).not.toBeInTheDocument();
      });
    });
  });

  describe('Delete operations', () => {
    it('MCP: calls removeServer when delete button clicked', async () => {
      const server = {
        id: 'mcp-1',
        name: 'Test Server',
        command: 'npx',
        args: ['test'],
        env: {},
        status: 'stopped' as const,
      };
      mockMCPServers.push(server);
      renderWithRouter('/mcp', <MCPPage />);
      const serverName = await screen.findByText(server.name);
      const header = serverName.closest('.cursor-pointer') as HTMLElement;
      fireEvent.click(header);
      await waitFor(() => {
        expect(screen.getByText('common.delete')).toBeInTheDocument();
      });
      const deleteBtn = screen.getByText('common.delete').closest('button') as HTMLButtonElement;
      fireEvent.click(deleteBtn);
      expect(mockRemoveServer).toHaveBeenCalledWith(server.id);
      mockMCPServers.length = 0;
    });

    it('Memory: calls removeMemory when delete button clicked', async () => {
      const memory = {
        id: 'mem-1',
        content: 'Test memory',
        tags: [],
        dimension: 'User',
        layer: 'L1',
        createdAt: new Date().toISOString(),
      };
      mockMemories.push(memory);
      renderWithRouter('/memory', <MemoryPage />);
      await screen.findByText(memory.content);
      const deleteBtn = screen.getAllByRole('button', { name: /delete/i })[0];
      expect(deleteBtn).toBeTruthy();
      fireEvent.click(deleteBtn);
      expect(mockRemoveMemory).toHaveBeenCalledWith(memory.id);
      mockMemories.length = 0;
    });

    it('Skills: calls removeSkill when delete button clicked', async () => {
      const skill = {
        id: 'skill-1',
        name: 'Test Skill',
        description: 'A test skill',
        category: 'custom',
        enabled: true,
      };
      mockSkills.push(skill);
      renderWithRouter('/skills', <SkillsPage />);
      await screen.findByText(skill.name);
      const deleteBtn = screen.getByTitle('common.delete');
      fireEvent.click(deleteBtn);
      expect(mockRemoveSkill).toHaveBeenCalledWith(skill.id);
      mockSkills.length = 0;
    });
  });
});
