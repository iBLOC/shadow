import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * 「**读不到**」与「**没有**」不许同屏（2026-11-13）。
 *
 * ⚠️ 场景就是「无海马体的桌面客户端」：记忆面没挂 ⇒ `/hippocampus/*` 404
 * ⇒ store 的 `error` 有值。以前页面**同时**画红色错误块和「暂无记忆」空态
 * ⇒ 用户看到的是「这台大脑没有记忆」，而不是「这台大脑没有记忆体 / 读不到」。
 *
 * ⚠️ i18n 的 `t` 在 vitest 全局 setup 里是**键透传** ⇒ 断言用键名。
 */

// 可变状态：每个用例改它再 render（页面一进来就会调 fetchMemories）。
const state: {
  memories: unknown[];
  searchResults: unknown[];
  hasSearched: boolean;
  isLoading: boolean;
  error: string | null;
  fetchMemories: ReturnType<typeof vi.fn>;
  searchMemories: ReturnType<typeof vi.fn>;
  addMemory: ReturnType<typeof vi.fn>;
  removeMemory: ReturnType<typeof vi.fn>;
} = {
  memories: [],
  searchResults: [],
  hasSearched: false,
  isLoading: false,
  error: null,
  fetchMemories: vi.fn(),
  searchMemories: vi.fn(),
  addMemory: vi.fn(),
  removeMemory: vi.fn(),
};

vi.mock('../../stores/memoryStore', () => ({
  useMemoryStore: () => state,
}));

import { MemoryPage } from '../MemoryPage';

afterEach(() => {
  vi.clearAllMocks();
  state.error = null;
  state.memories = [];
  state.searchResults = [];
  state.hasSearched = false;
  state.isLoading = false;
});

describe('MemoryPage —— 读不到与没有必须分开', () => {
  it('⚠️ 有错误（例如没有海马体 ⇒ 404）⇒ 只画错误，**不画**「暂无记忆」空态', () => {
    state.error = 'HTTP 404: /hippocampus/api/memory';
    render(<MemoryPage />);

    expect(screen.getByText(state.error)).toBeInTheDocument();
    expect(
      screen.queryByText('memory.noMemories'),
      '没有记忆体 ≠ 没有记忆 —— 空态不许和错误同屏',
    ).toBeNull();
  });

  it('正控：没有错误、列表为空 ⇒ 才画空态（证明上一条不是把空态删掉了）', () => {
    state.error = null;
    render(<MemoryPage />);

    expect(screen.getByText('memory.noMemories')).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 404/)).toBeNull();
  });
});
