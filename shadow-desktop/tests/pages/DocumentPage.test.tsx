import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ taskId: 'task-1' }),
  useNavigate: () => vi.fn(),
}));

import { DocumentPage } from '../../src/pages/DocumentPage';

/**
 * ⚠️ **「读不到」≠「没有」** —— 这一族缺陷在桌面端反复出现：
 * 读失败被渲染成「一个都没有」⇒ ⇒ 用户以为那台机器真的什么都没录。
 *
 * ⇒ ⇒ 这条钉住**三格分开**：读失败 ⇒ 「读不到」；读到空 ⇒ 「没有」；
 * 读到东西 ⇒ 列表。
 */
describe('DocumentPage 的读失败', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('事件列表读不到 ⇒ 说「读不到」＋原因，**不**说「没有事件」', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'recording_events') return Promise.reject(new Error('HTTP 500: boom'));
      return Promise.resolve(null);
    });

    render(<DocumentPage />);

    await waitFor(() => {
      expect(screen.getByText(/Can't read the event list/)).toBeInTheDocument();
    });
    // ⚠️ 原因**也要在**（不能只有一个笼统的「读不到」）
    expect(screen.getByText(/HTTP 500: boom/)).toBeInTheDocument();
    // ❗ **不许**说成「没有事件」
    expect(screen.queryByText(/No events recorded for this session/)).not.toBeInTheDocument();
  });

  it('孪生：事件列表**真的读到空** ⇒ 仍然说「没有事件」（两件事必须分得开）', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'recording_events') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<DocumentPage />);

    await waitFor(() => {
      expect(screen.getByText(/No events recorded for this session/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Can't read the event list/)).not.toBeInTheDocument();
  });

  it('报告读不到 ⇒ 说「读不到」＋原因（**不**装作「没有报告」）', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'recording_report') return Promise.reject(new Error('HTTP 404: Not Found'));
      return Promise.resolve([]);
    });

    render(<DocumentPage />);

    await waitFor(() => {
      expect(screen.getByText(/Can't read the summary report/)).toBeInTheDocument();
    });
    expect(screen.getByText(/HTTP 404: Not Found/)).toBeInTheDocument();
  });
});