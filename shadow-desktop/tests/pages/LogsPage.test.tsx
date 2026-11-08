import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useErrorLogStore } from '../../src/stores/errorLogStore';
import { LogsPage } from '../../src/pages/LogsPage';

/**
 * ⚠️ **失败不许长得像成功** —— 复制失败不许被吞。
 *
 * 以前这里是**空 catch 块** ⇒ ⇒ 复制失败时界面
 * **毫无反应** ⇒ ⇒ 用户以为日志已经复制走了（与 ResonancePage 的配对码
 * 复制是**同一个形状**）。
 */
const entry = {
  id: 'e1',
  timestamp: '2026-11-08T10:00:00Z',
  source: 'http' as const,
  endpoint: '/v1/chat/completions',
  method: 'POST',
  status: 500,
  message: 'boom',
};

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('LogsPage —— 复制失败不许被吞', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useErrorLogStore.setState({ entries: [entry] });
  });

  it('复制失败 ⇒ 说出「复制失败」＋原因', async () => {
    stubClipboard(() => Promise.reject(new Error('clipboard denied by policy')));

    render(<LogsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'logsPage.copy' }));

    await waitFor(() => {
      expect(screen.getByTestId('logs-copy-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('logs-copy-error');
    expect(el.textContent).toContain('logsPage.copyFailed');
    expect(el.textContent).toContain('clipboard denied by policy');
    // ⚠️ 失败**不许**被说成「已复制」
    expect(screen.queryByText('logsPage.copied')).not.toBeInTheDocument();
  });

  it('孪生：复制成功 ⇒ 显示「已复制」，且**没有**错误条', async () => {
    stubClipboard(() => Promise.resolve());

    render(<LogsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'logsPage.copy' }));

    await waitFor(() => {
      expect(screen.getByText('logsPage.copied')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('logs-copy-error')).not.toBeInTheDocument();
  });
});
