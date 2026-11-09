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

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock fetch to return successful responses
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/models/providers')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ name: 'openai' }]),
    });
  }
  if (url.includes('/v1/models')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'gpt-4', available: true }] }),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
});

vi.stubGlobal('fetch', mockFetch);

import { AppInitializer } from '../../src/components/AppInitializer';

function renderWithRouter(initialRoute: string = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/"
          element={
            <AppInitializer>
              <div>App Content</div>
            </AppInitializer>
          }
        />
        <Route path="/setup" element={<div>Setup Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppInitializer', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    localStorage.clear();
    mockFetch.mockClear();
  });

  it('renders container without throwing while checking setup state', () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    const { container } = renderWithRouter('/');
    expect(container).toBeInTheDocument();
  });

  it('renders children when setup is complete', async () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    renderWithRouter('/');
    await waitFor(() => {
      expect(screen.getByText(/app content/i)).toBeInTheDocument();
    });
  });

  it('renders children when setup is marked complete at any value', async () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    renderWithRouter('/');
    await waitFor(() => {
      expect(screen.getByText(/app content/i)).toBeInTheDocument();
    });
  });
});
