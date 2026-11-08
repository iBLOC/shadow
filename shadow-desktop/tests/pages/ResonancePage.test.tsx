import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { discoveryClient } from '../../src/lib/discoveryClient';
import { ResonancePage } from '../../src/pages/ResonancePage';

vi.mock('../../src/lib/discoveryClient', () => ({
  discoveryClient: {
    startDiscovery: vi.fn(),
    stopDiscovery: vi.fn(),
    listAllDiscovered: vi.fn(),
    broadcastDiscovery: vi.fn(),
    testConnection: vi.fn(),
  },
}));

/**
 * ⚠️ **失败不许长得像成功** —— 这一族的纪律测试。
 *
 * ❶ 复制失败被 `.catch(() => {})` 吞掉 ⇒ ⇒ 用户以为配对码已复制；
 * ❷ 已发现列表读失败 ⇒ ⇒ `catch { setDiscoveredPeers([]) }` ⇒ ⇒
 *    「读不到」被说成「一台 peer 都没有」；
 * ❸ 广播失败一路抛出去 ⇒ ⇒ 界面上**什么也没发生**。
 */

const peer = {
  id: 'peer-1',
  name: 'Peer One',
  type: 'agent',
  capabilities: ['llm'],
  host: '10.0.0.9',
  port: 8080,
  lastSeen: '2026-11-08T10:00:00Z',
};

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

async function turnDiscoveryOn() {
  fireEvent.click(screen.getByRole('button', { name: 'resonance.discoveryOff' }));
  await waitFor(() => {
    expect(discoveryClient.startDiscovery).toHaveBeenCalled();
  });
}

describe('ResonancePage —— 失败不许长得像成功', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discoveryClient.startDiscovery).mockResolvedValue(undefined);
    vi.mocked(discoveryClient.listAllDiscovered).mockResolvedValue([]);
  });

  it('复制失败 ⇒ 说出「复制失败」＋原因（配对码仍留在界面上）', async () => {
    vi.mocked(discoveryClient.listAllDiscovered).mockResolvedValue([peer] as any);
    stubClipboard(() => Promise.reject(new Error('clipboard denied by policy')));

    render(<ResonancePage />);
    await turnDiscoveryOn();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'resonance.pair' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'resonance.pair' }));

    await waitFor(() => {
      expect(screen.getByTestId('resonance-copy-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('resonance-copy-error');
    // 上下文（译文）＋ 原因（原文）**两者都在**
    expect(el.textContent).toContain('resonance.copyFailed');
    expect(el.textContent).toContain('clipboard denied by policy');
  });

  it('孪生：复制成功 ⇒ **没有**错误条', async () => {
    vi.mocked(discoveryClient.listAllDiscovered).mockResolvedValue([peer] as any);
    stubClipboard(() => Promise.resolve());

    render(<ResonancePage />);
    await turnDiscoveryOn();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'resonance.pair' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'resonance.pair' }));

    await waitFor(() => {
      expect(screen.getByText(/resonance\.pairingCode/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('resonance-copy-error')).not.toBeInTheDocument();
  });

  it('已发现列表读不到 ⇒ 说出「读不到」＋原因，而不是装作「一台都没有」', async () => {
    vi.mocked(discoveryClient.listAllDiscovered).mockRejectedValue(
      new Error('mDNS socket closed'),
    );

    render(<ResonancePage />);
    await turnDiscoveryOn();

    await waitFor(() => {
      expect(screen.getByTestId('resonance-discovery-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('resonance-discovery-error');
    expect(el.textContent).toContain('resonance.discoveryReadFailed');
    expect(el.textContent).toContain('mDNS socket closed');
  });

  it('孪生：列表**真的读到空** ⇒ **没有**错误条', async () => {
    render(<ResonancePage />);
    await turnDiscoveryOn();

    await waitFor(() => {
      expect(discoveryClient.listAllDiscovered).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('resonance-discovery-error')).not.toBeInTheDocument();
  });

  it('广播失败 ⇒ 说出「广播失败」＋原因（不是界面毫无反应）', async () => {
    vi.mocked(discoveryClient.broadcastDiscovery).mockRejectedValue(
      new Error('broadcast: address already in use'),
    );

    render(<ResonancePage />);
    await turnDiscoveryOn();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'resonance.scan' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'resonance.scan' }));

    await waitFor(() => {
      expect(screen.getByTestId('resonance-scan-error')).toBeInTheDocument();
    });
    const el = screen.getByTestId('resonance-scan-error');
    expect(el.textContent).toContain('resonance.scanFailed');
    expect(el.textContent).toContain('broadcast: address already in use');
  });
});
