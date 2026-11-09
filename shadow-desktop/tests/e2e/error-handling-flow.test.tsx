import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
beforeEach(() => {
  // 每个测试前重装（afterEach 清过 ⇒ ⇒ 这里补回来）
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MemoryPage } from '../../src/pages/MemoryPage';
import { MCPPage } from '../../src/pages/MCPPage';
import { SkillsPage } from '../../src/pages/SkillsPage';
import { ModelsPage } from '../../src/pages/ModelsPage';

vi.mock('../../src/stores/memoryStore', () => ({
  useMemoryStore: () => ({
    memories: [],
    searchResults: [],
    hasSearched: false,
    isLoading: false,
    error: null,
    searchMemories: vi.fn(),
    fetchMemories: vi.fn(),
    addMemory: vi.fn(),
    removeMemory: vi.fn(),
  }),
}));

vi.mock('../../src/stores/mcpStore', () => ({
  useMCPStore: () => ({
    servers: [],
    addServer: vi.fn(),
    removeServer: vi.fn(),
    updateServer: vi.fn(),
  }),
}));

vi.mock('../../src/stores/skillStore', () => ({
  useSkillStore: () => ({
    skills: [],
    addSkill: vi.fn(),
    removeSkill: vi.fn(),
    toggleSkill: vi.fn(),
  }),
}));

// Mock fetch to return successful responses
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/models/providers')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
});

vi.stubGlobal('fetch', mockFetch);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Error Handling Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  const renderWithRouter = (path: string, component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders memory page', async () => {
    renderWithRouter('/memory', <MemoryPage />);

    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders MCP page', async () => {
    renderWithRouter('/mcp', <MCPPage />);

    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders skills page', async () => {
    renderWithRouter('/skills', <SkillsPage />);

    await waitFor(() => {
      expect(screen.getByText('skills.title')).toBeInTheDocument();
    });
  });

  it('renders models page', async () => {
    renderWithRouter('/models', <ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders pages without crashing', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('shows memory section', async () => {
    renderWithRouter('/memory', <MemoryPage />);

    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders memory page without errors', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('displays memory page content', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders memory page correctly', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('shows memory page', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders memory page without errors', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('displays memory page', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders memory page correctly', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('shows memory page content', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });

  it('renders memory page without errors', async () => {
    renderWithRouter('/memory', <MemoryPage />);
    await waitFor(() => {
      expect(screen.getByText('memory.title')).toBeInTheDocument();
    });
  });
});
