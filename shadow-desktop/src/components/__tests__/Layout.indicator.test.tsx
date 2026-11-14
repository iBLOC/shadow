import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ⚠️ status 可变（vi.hoisted 携带，vi.mock 工厂提升后仍读得到）。
const store = vi.hoisted(() => ({
  status: 'stopped' as 'stopped' | 'starting' | 'running' | 'stopping' | 'unreachable' | 'error',
}));

vi.mock('../../stores/telencephalonStore', () => ({
  useTelencephalonStore: (sel: (s: unknown) => unknown) =>
    sel({ status: store.status }),
}));

vi.mock('../../stores/resonanceStore', () => ({
  useResonanceStore: () => ({ pendingTasks: [] }),
}));

import { Layout } from '../Layout';

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

/** 侧栏 footer 的状态点（.h-2.5 圆点）—— 颜色是「真话」的载体。 */
function statusDot(): HTMLElement | null {
  return document.querySelector('aside .h-2\\.5');
}

// ⚠️ 全局 setup 的 t 是键透传 ⇒ 断言键名（仓库测试同一约定）。
describe('Layout 侧栏状态指示器（只回答「大脑在不在」）', () => {
  beforeEach(() => {
    store.status = 'stopped';
  });

  it('running ⇒ 绿点 ＋ 已连接（resonance 未连也不许说「未连接」）', () => {
    store.status = 'running';
    renderLayout();
    expect(screen.getByText('common.status.connected')).toBeInTheDocument();
    expect(statusDot()?.className).toContain('bg-green-500');
    expect(statusDot()?.className).not.toContain('animate-pulse');
  });

  it('stopped ⇒ 灰点 ＋ 未连接', () => {
    renderLayout();
    expect(screen.getByText('common.status.disconnected')).toBeInTheDocument();
    expect(statusDot()?.className).toContain('bg-muted-foreground');
  });

  it('unreachable ⇒ 红点 ＋ 未连接（问不到要说红，不说灰）', () => {
    store.status = 'unreachable';
    renderLayout();
    expect(screen.getByText('common.status.disconnected')).toBeInTheDocument();
    expect(statusDot()?.className).toContain('bg-red-500');
  });

  it('starting ⇒ 黄点脉冲 ＋ 连接中', () => {
    store.status = 'starting';
    renderLayout();
    expect(screen.getByText('common.status.connecting')).toBeInTheDocument();
    expect(statusDot()?.className).toContain('bg-yellow-500');
    expect(statusDot()?.className).toContain('animate-pulse');
  });
});
