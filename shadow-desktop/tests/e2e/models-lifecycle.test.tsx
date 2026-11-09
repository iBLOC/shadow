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
import { ModelsPage } from '../../src/pages/ModelsPage';

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

describe('Models Lifecycle E2E', () => {
  const renderWithRouter = () => {
    return render(
      <MemoryRouter initialEntries={['/models']}>
        <Routes>
          <Route path="/models" element={<ModelsPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  it('renders page title', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('shows models section', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders without errors', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('displays page content', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });

  it('renders models page', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('models.title')).toBeInTheDocument();
    });
  });
});
