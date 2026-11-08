import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { HfTokenSettings } from '../../src/components/business/HfTokenSettings';

/**
 * ⚠️ **读不到 ≠ 没有** —— 这一族的纪律测试。
 *
 * 以前这里是 `safeInvoke`（它自己把错误吞成 fallback=null ⇒ ⇒ 连 catch 都
 * 进不去）＋ 一个**空 catch 块** ⇒ ⇒ 界面**永远**显示「未配置」，
 * 而真相是：**读失败是常态**（Tauri 命令 `get_hf_token` 早已被删）
 * ⇒ ⇒ 「没有 token」这句话从来没被验证过。
 */

describe('HfTokenSettings —— 读不到 ≠ 没有', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 让 isTauri() 为真 ⇒ ⇒ 走真命令那条路（而不是 web build 的兜底）。
    (window as any).__TAURI_INTERNALS__ = {};
  });

  it('读 token 状态失败 ⇒ 说出「读不到」＋原因，**不许**说「未配置」', async () => {
    vi.mocked(invoke).mockRejectedValue(
      new Error('Command get_hf_token not found'),
    );

    render(<HfTokenSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('hf-token-read-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('hf-token-read-error');
    // 上下文（译文）＋ 原因（原文）**两者都在**
    expect(el.textContent).toContain('settings.hfToken.readFailed');
    expect(el.textContent).toContain('Command get_hf_token not found');
    // ⚠️ **读不到** ≠ **没有** ⇒ ⇒ 不许显示「未配置」
    expect(screen.queryByText('settings.hfToken.notConfigured')).not.toBeInTheDocument();
  });

  it('孪生：真的读到「没配置」⇒ 显示「未配置」，且**没有**错误条', async () => {
    vi.mocked(invoke).mockResolvedValue({ configured: false });

    render(<HfTokenSettings />);

    await waitFor(() => {
      expect(screen.getByText('settings.hfToken.notConfigured')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('hf-token-read-error')).not.toBeInTheDocument();
  });

  it('孪生：真的读到「已配置」⇒ 显示已配置，且**没有**错误条', async () => {
    vi.mocked(invoke).mockResolvedValue({
      configured: true,
      preview: 'hf_abc',
      length: 7,
    });

    render(<HfTokenSettings />);

    await waitFor(() => {
      expect(screen.getByText(/settings\.hfToken\.configured/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('hf-token-read-error')).not.toBeInTheDocument();
  });

  it('保存失败 ⇒ 说出失败＋原因（不许「点了没反应」）', async () => {
    vi.mocked(invoke).mockImplementation(((cmd: string) => {
      if (cmd === 'get_hf_token') return Promise.resolve({ configured: false });
      return Promise.reject(new Error('Command set_hf_token not found'));
    }) as any);

    render(<HfTokenSettings />);

    await waitFor(() => {
      expect(screen.getByText('settings.hfToken.notConfigured')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('settings.hfToken.placeholder'), {
      target: { value: 'hf_test_token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(screen.getByText(/settings\.hfToken\.saveFailed/)).toBeInTheDocument();
    });
    const el = screen.getByText(/settings\.hfToken\.saveFailed/);
    expect(el.textContent).toContain('Command set_hf_token not found');
    // ⚠️ 失败**不许**被说成「已保存」
    expect(screen.queryByText('settings.hfToken.saved')).not.toBeInTheDocument();
  });

  it('孪生：保存成功 ⇒ 显示「已保存」，且**没有**错误条', async () => {
    vi.mocked(invoke).mockImplementation(((cmd: string) => {
      if (cmd === 'get_hf_token') return Promise.resolve({ configured: false });
      return Promise.resolve({ configured: true, preview: 'hf_abc', length: 7 });
    }) as any);

    render(<HfTokenSettings />);

    await waitFor(() => {
      expect(screen.getByText('settings.hfToken.notConfigured')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('settings.hfToken.placeholder'), {
      target: { value: 'hf_test_token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(screen.getByText('settings.hfToken.saved')).toBeInTheDocument();
    });
    expect(screen.queryByText(/settings\.hfToken\.saveFailed/)).not.toBeInTheDocument();
  });
});
