import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    it('renders all primary nav items', () => {
      // Mirrors `navItems` in `src/components/Layout.tsx` — kept in sync when
      // routes are added/removed. `discovery`, `agents`, and `models` were
      // removed in the 2026-08-23 ModelsPage consolidation. The 2026-09
      // audit cycle added `flows`, `trace`, `computerUse`, `workflowStudio`
      // (`recording` went away with the standalone RecordingPage).
      // `previews` was folded into the right pane of `ConversationPage`
      // (2026-09-25) and removed from the top-level nav.
      renderLayout();
      expect(screen.getByText(/nav\.tasks/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.chat/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.flows/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.trace/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.computerUse/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.workflowStudio/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.mcp/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.jdmEditor/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.skills/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.promptSettings/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.memory/i)).toBeInTheDocument();
      expect(screen.getByText(/nav\.logs/i)).toBeInTheDocument();
      expect(screen.queryByText(/nav\.previews/i)).not.toBeInTheDocument();
    });

    it('renders settings nav link in sidebar footer', () => {
      renderLayout();
      expect(screen.getByText(/nav\.settings/i)).toBeInTheDocument();
    });

    it('does not render tasks badge when pendingTasks is empty', () => {
      resonanceState.pendingTasks = [];
      const { container } = renderLayout();
      const badges = container.querySelectorAll('[class*="rounded-full"]');
      const navBadges = Array.from(badges).filter(el => el.textContent && /^\d+$/.test(el.textContent.trim()));
      expect(navBadges.length).toBe(0);
    });
  });

  describe('active nav highlighting', () => {
    it('marks active NavLink with bg-primary/10 class', () => {
      const { container } = renderLayout('/mcp');
      const activeLinks = Array.from(container.querySelectorAll('a')).filter(
        (el) => el.className.includes('bg-primary/10')
      );
      expect(activeLinks.length).toBe(1);
      expect(activeLinks[0]).toHaveTextContent(/nav\.mcp/i);
    });

    it('highlights settings link when on /settings', () => {
      const { container } = renderLayout('/settings');
      const settingsLink = Array.from(container.querySelectorAll('a')).find(
        (el) => el.textContent === 'nav.settings',
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