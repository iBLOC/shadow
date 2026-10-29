import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const { resonanceState, cortexState } = vi.hoisted(() => {
  return {
    resonanceState: {
      pendingTasks: [] as unknown[],
      connectionStatus: 'disconnected' as 'connected' | 'connecting' | 'disconnected',
    },
    cortexState: {
      status: 'stopped' as 'stopped' | 'starting' | 'running' | 'unreachable' | 'error',
    },
  };
});

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: (selector?: (s: typeof resonanceState) => unknown) =>
    selector ? selector(resonanceState) : resonanceState,
}));

vi.mock('../../src/stores/telencephalonStore', () => ({
  useTelencephalonStore: (selector?: (s: typeof cortexState) => unknown) =>
    selector ? selector(cortexState) : cortexState,
}));

import { Layout } from '../../src/components/Layout';

function renderLayout(initialRoute: string = '/conversation') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/conversation" element={<div>Conversation</div>} />
          <Route path="/tasks" element={<div>Tasks</div>} />
          <Route path="/discovery" element={<div>Discovery</div>} />
          <Route path="/agents" element={<div>Agents</div>} />
          <Route path="/models" element={<div>Models</div>} />
          <Route path="/mcp" element={<div>Mcp</div>} />
          <Route path="/skills" element={<div>Skills</div>} />
          <Route path="/memory" element={<div>Memory</div>} />
          <Route path="/settings" element={<div>Settings</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  beforeEach(() => {
    resonanceState.pendingTasks = [];
    resonanceState.connectionStatus = 'disconnected';
    cortexState.status = 'stopped';
  });

  describe('brand header', () => {
    it('renders brand name from i18n key', () => {
      renderLayout();
      expect(screen.getByText(/layout\.brandName/i)).toBeInTheDocument();
    });

    it('renders brand subtitle from i18n key', () => {
      renderLayout();
      expect(screen.getByText(/layout\.brandSubtitle/i)).toBeInTheDocument();
    });
  });

  describe('navigation items', () => {
    it('renders the always-visible items only (对话 / 任务 / 群组)', () => {
      // 导航结构来自 agent-surface.json（scripts/gen_nav.mjs 生成）。
      // 对话为主：常驻只留主干与工作产物，能力与「更多」默认收起。
      renderLayout();
      expect(screen.getByText('surface.chat')).toBeInTheDocument();
      expect(screen.getByText('surface.tasks')).toBeInTheDocument();
      expect(screen.getByText('surface.group')).toBeInTheDocument();
    });

    it('renders collapsible section headers 能力 / 更多', () => {
      renderLayout();
      expect(screen.getByText('nav.section.capability')).toBeInTheDocument();
      expect(screen.getByText('nav.section.more')).toBeInTheDocument();
    });

    it('keeps capability items hidden until the section is expanded', () => {
      renderLayout();
      expect(screen.queryByText('surface.mcp')).not.toBeInTheDocument();
      expect(screen.queryByText('surface.skills')).not.toBeInTheDocument();
    });

    it('reveals capability items when the section is expanded', () => {
      renderLayout();
      fireEvent.click(screen.getByText('nav.section.capability'));
      expect(screen.getByText('surface.mcp')).toBeInTheDocument();
      expect(screen.getByText('surface.skills')).toBeInTheDocument();
      expect(screen.getByText('surface.memory')).toBeInTheDocument();
    });

    it('renders settings nav link in sidebar footer', () => {
      renderLayout();
      expect(screen.getByText('surface.settings')).toBeInTheDocument();
    });

    it('does not render tasks badge when pendingTasks is empty', () => {
      resonanceState.pendingTasks = [];
      const { container } = renderLayout();
      const badges = container.querySelectorAll('[class*="rounded-full"]');
      const navBadges = Array.from(badges).filter(el => el.textContent && /^\d+$/.test(el.textContent.trim()));
      expect(navBadges.length).toBe(0);
    });

    it('shows a badge on 任务 when there are pending tasks', () => {
      resonanceState.pendingTasks = [{ id: 't1' }, { id: 't2' }];
      const { container } = renderLayout();
      const badges = Array.from(container.querySelectorAll('[class*="rounded-full"]')).filter(
        el => el.textContent && /^\d+$/.test(el.textContent.trim()),
      );
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toBe('2');
    });
  });

  describe('active nav highlighting', () => {
    it('marks active NavLink with bg-primary/10 class', () => {
      const { container } = renderLayout('/mcp');
      // /mcp 在「能力」段里 —— 段默认收起，先展开
      fireEvent.click(screen.getByText('nav.section.capability'));
      const activeLinks = Array.from(container.querySelectorAll('a')).filter(
        (el) => el.className.includes('bg-primary/10')
      );
      expect(activeLinks.length).toBe(1);
      expect(activeLinks[0]).toHaveTextContent('surface.mcp');
    });

    it('highlights settings link when on /settings', () => {
      const { container } = renderLayout('/settings');
      const settingsLink = Array.from(container.querySelectorAll('a')).find(
        (el) => el.textContent === 'surface.settings',
      );
      expect(settingsLink).toBeDefined();
      expect(settingsLink!.className).toContain('bg-primary/10');
    });
  });

  describe('connection indicator', () => {
    it('shows disconnected label when cortex is stopped', () => {
      cortexState.status = 'stopped';
      resonanceState.connectionStatus = 'disconnected';
      renderLayout();
      expect(screen.getByText(/common\.status\.disconnected/i)).toBeInTheDocument();
    });

    it('shows disconnected label when cortex is unreachable', () => {
      cortexState.status = 'unreachable';
      resonanceState.connectionStatus = 'disconnected';
      renderLayout();
      expect(screen.getByText(/common\.status\.disconnected/i)).toBeInTheDocument();
    });

    it('shows connecting label when cortex is starting', () => {
      cortexState.status = 'starting';
      renderLayout();
      expect(screen.getByText(/common\.status\.connecting/i)).toBeInTheDocument();
    });

    it('shows connecting label when cortex running and resonance connecting', () => {
      cortexState.status = 'running';
      resonanceState.connectionStatus = 'connecting';
      renderLayout();
      expect(screen.getByText(/common\.status\.connecting/i)).toBeInTheDocument();
    });

    it('shows connected label when cortex running and resonance connected', () => {
      cortexState.status = 'running';
      resonanceState.connectionStatus = 'connected';
      renderLayout();
      expect(screen.getByText(/common\.status\.connected/i)).toBeInTheDocument();
    });

    it('applies green-500 to connection dot when fully connected', () => {
      cortexState.status = 'running';
      resonanceState.connectionStatus = 'connected';
      const { container } = renderLayout();
      const dot = container.querySelector('[class*="bg-green-500"]');
      expect(dot).toBeDefined();
    });

    it('applies yellow-500 animate-pulse when connecting', () => {
      cortexState.status = 'starting';
      const { container } = renderLayout();
      const dot = container.querySelector('[class*="bg-yellow-500"]');
      expect(dot).toBeDefined();
    });

    it('applies muted-foreground to connection dot when cortex stopped', () => {
      cortexState.status = 'stopped';
      const { container } = renderLayout();
      const dot = container.querySelector('[class*="bg-muted-foreground"]');
      expect(dot).toBeDefined();
    });
  });

  describe('outlet content', () => {
    it('renders child route content via Outlet', () => {
      renderLayout('/conversation');
      expect(screen.getByText(/conversation/i)).toBeInTheDocument();
    });

    it('renders correct child for /tasks route', () => {
      renderLayout('/tasks');
      expect(screen.getByText(/^tasks$/i)).toBeInTheDocument();
    });

    it('renders correct child for /memory route', () => {
      renderLayout('/memory');
      expect(screen.getByText(/^memory$/i)).toBeInTheDocument();
    });
  });
});