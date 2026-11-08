import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowStudioPage } from '../../src/pages/WorkflowStudioPage';

/**
 * ⚠️ **读不到 ≠ 没有 / 写不进 ≠ 写进了** —— 工作流存档这一族。
 *
 * 以前这里是两个**空 catch**：
 *   ❶ 读失败 ⇒ 「无存档 — 空画布」⇒ ⇒ **读不到被说成没有**；
 *   ❷ 写失败（配额满）⇒ 「静默」⇒ ⇒ **写不进被说成写进了**（刷新就没了）。
 */

/** 装一个**可控**的 localStorage（jsdom 的 Storage 不方便 spyOn ⇒ 整个换掉）。 */
function installStorage(opts: { failRead?: boolean; failWrite?: boolean }) {
  const store = new Map<string, string>();
  const fake = {
    getItem: vi.fn((k: string) => {
      if (opts.failRead) throw new Error('SecurityError: localStorage is not available');
      return store.has(k) ? store.get(k)! : null;
    }),
    setItem: vi.fn((k: string, v: string) => {
      if (opts.failWrite) throw new DOMException('quota', 'QuotaExceededError');
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => { store.delete(k); }),
    clear: vi.fn(() => { store.clear(); }),
    key: vi.fn(() => null),
    length: 0,
  };
  Object.defineProperty(window, 'localStorage', { value: fake, configurable: true, writable: true });
  return fake;
}

/**
 * ⚠️⚠️ 修法：换掉 `localStorage` 之后**必须还原**。
 *
 *   原生 `Object.defineProperty` **不受** `vi.unstubAllGlobals` 保护
 *   ⇒ ⇒ 装在测试里的 mock 会**泄漏给后续文件**
 *   ⇒ ⇒ 后续受害者从 mock 读到 `null`／`undefined`（而不是真 Storage 的语义）
 *   ⇒ ⇒ 断言随机翻转、**红点逐轮漂**。
 */
const __origLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (__origLocalStorage) Object.defineProperty(globalThis, 'localStorage', __origLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('WorkflowStudioPage —— 存档读写失败不许被说成成功', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('存档读失败 ⇒ 说出「读不到」＋原因', async () => {
    installStorage({ failRead: true });

    render(<WorkflowStudioPage />);

    await waitFor(() => {
      expect(screen.getByTestId('workflow-storage-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('workflow-storage-error');
    // 上下文（译文）＋ 原因（原文）**两者都在**
    expect(el.textContent).toContain('workflowStudio.loadFailed');
    expect(el.textContent).toContain('SecurityError: localStorage is not available');
  });

  it('孪生：存档**真的读到空** ⇒ **没有**错误条', async () => {
    installStorage({});

    render(<WorkflowStudioPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('workflowStudio.namePlaceholder')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workflow-storage-error')).not.toBeInTheDocument();
  });

  it('存档写失败（配额满）⇒ 说出「保存失败」＋原因', async () => {
    installStorage({ failWrite: true });

    render(<WorkflowStudioPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'workflowStudio.addNodeSource' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'workflowStudio.addNodeSource' }));

    await waitFor(() => {
      expect(screen.getByTestId('workflow-storage-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('workflow-storage-error');
    expect(el.textContent).toContain('workflowStudio.saveFailed');
    expect(el.textContent).toContain('quota');
  });

  it('孪生：存档**写得进** ⇒ **没有**错误条', async () => {
    installStorage({});

    render(<WorkflowStudioPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'workflowStudio.addNodeSource' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'workflowStudio.addNodeSource' }));

    // 节点加上了 ⇒ ⇒ 「画布是空的」那句**该消失** ⇒ ⇒ 说明写路径真的跑过
    await waitFor(() => {
      expect(screen.queryByText('workflowStudio.empty')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('workflow-storage-error')).not.toBeInTheDocument();
  });
});