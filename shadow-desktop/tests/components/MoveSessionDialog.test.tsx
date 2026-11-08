import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'common.migrate.messageCount' && opts?.count !== undefined) {
        return `${key}(${opts.count})`;
      }
      if (key === 'common.migrate.sizeKb' && opts?.kb !== undefined) {
        return `${key}(${opts.kb})`;
      }
      if (key === 'common.migrate.inProgress' && opts?.peer !== undefined) {
        return `${key}(${opts.peer})`;
      }
      if (key === 'common.migrate.success' && opts?.peer !== undefined) {
        return `${key}(${opts.peer})`;
      }
      if (key === 'common.migrate.error' && opts?.error !== undefined) {
        return `${key}(${opts.error})`;
      }
      return key;
    },
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const mockListA2APeers = vi.fn();
const mockPrepareMigration = vi.fn();
const mockImportSession = vi.fn();

vi.mock('../../src/lib/prefrontalClient', () => ({
  prefrontalClient: {
    listA2APeers: () => mockListA2APeers(),
    prepareMigration: (id: string) => mockPrepareMigration(id),
    importSession: (payload: unknown, opts: unknown) => mockImportSession(payload, opts),
  },
}));

import { MoveSessionDialog } from '../../src/components/MoveSessionDialog';

const mockPeer1: any = {
  id: 'peer-1',
  url: 'http://peer1.local:8082',
  name: 'Peer 1',
  reachable: true,
  last_seen_ms: Date.now(),
  skill_count: 5,
  capabilities: ['llm', 'asr'],
};

const mockPeer2: any = {
  id: 'peer-2',
  url: 'http://peer2.local:8082',
  name: 'Peer 2',
  reachable: true,
  last_seen_ms: Date.now(),
  skill_count: 3,
  capabilities: ['tts'],
};

const mockPeerUnreachable: any = {
  id: 'peer-3',
  url: 'http://peer3.local:8082',
  name: 'Peer 3 Unreachable',
  reachable: false,
  last_seen_ms: 0,
  skill_count: 0,
  capabilities: [],
};

function renderDialog(props: Partial<{
  open: boolean;
  sessionId: string | null;
  messageCount: number;
  onClose: () => void;
  onMigrated: (id: string, name: string) => void;
}> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onMigrated = props.onMigrated ?? vi.fn();
  return {
    onClose,
    onMigrated,
    ...render(
      <MoveSessionDialog
        open={props.open ?? true}
        sessionId={props.sessionId ?? 'session-abc'}
        messageCount={props.messageCount ?? 0}
        onClose={onClose}
        onMigrated={onMigrated}
      />,
    ),
  };
}

describe('MoveSessionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `mockReset` clears the per-test `mockImplementation(...)` overrides
    // that prior tests in this file set with `setTimeout` delays. Without
    // it, a delayed `prepareMigration` from the previous test can leak
    // into the next one and cause the "shows preparing phase" assertion
    // to race against a state transition to `sending`.
    mockListA2APeers.mockReset();
    mockPrepareMigration.mockReset();
    mockImportSession.mockReset();
    mockListA2APeers.mockImplementation(() =>
      Promise.resolve({ data: [mockPeer1, mockPeer2, mockPeerUnreachable] }),
    );
    mockPrepareMigration.mockImplementation(() =>
      Promise.resolve({ payload: 'serialized-data', size_bytes: 2048 }),
    );
    mockImportSession.mockImplementation(() =>
      Promise.resolve({ data: { id: 'new-session-id' } }),
    );
  });

  describe('visibility', () => {
    it('renders nothing when open=false', () => {
      const { container } = renderDialog({ open: false });
      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when open=true', () => {
      renderDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders title and description', () => {
      renderDialog();
      expect(screen.getByText(/common\.migrate\.title/)).toBeInTheDocument();
      expect(screen.getByText(/common\.migrate\.description/)).toBeInTheDocument();
    });
  });

  describe('peer loading', () => {
    it('calls listA2APeers when opened', async () => {
      renderDialog();
      await waitFor(() => {
        expect(mockListA2APeers).toHaveBeenCalledTimes(1);
      });
    });

    it('shows loading state while fetching peers', () => {
      mockListA2APeers.mockImplementation(() => new Promise(() => {}));
      const { container } = renderDialog();
      expect(container.querySelector('.move-session-loading')).toBeInTheDocument();
    });

    it('renders reachable peers after load', async () => {
      renderDialog();
      expect(await screen.findByText('Peer 1')).toBeInTheDocument();
      expect(await screen.findByText('Peer 2')).toBeInTheDocument();
    });

    it('does not render unreachable peers', async () => {
      renderDialog();
      await screen.findByText('Peer 1');
      expect(screen.queryByText(/Peer 3 Unreachable/)).not.toBeInTheDocument();
    });

    it('handles null data from listA2APeers', async () => {
      mockListA2APeers.mockImplementation(() => Promise.resolve({ data: null }));
      const { container } = renderDialog();
      await waitFor(() => {
        expect(container.querySelector('.move-session-empty')).toBeInTheDocument();
      });
    });

    it('shows empty state when no peers found', async () => {
      mockListA2APeers.mockImplementation(() => Promise.resolve({ data: [] }));
      const { container } = renderDialog();
      await waitFor(() => {
        expect(container.querySelector('.move-session-empty')).toBeInTheDocument();
        expect(screen.getByText(/common\.migrate\.noPeers/)).toBeInTheDocument();
      });
    });

    it('shows error message when listA2APeers fails', async () => {
      mockListA2APeers.mockImplementation(() =>
        Promise.reject(new Error('Network error')),
      );
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });

    /**
     * ⚠️ **「读不到」≠「没有」** —— 端脑这一面**根本没有** peer 列表路由
     * ⇒ ⇒ 列表读失败时**不许**显示「未发现 Shadow 节点」的空态。
     */
    it('列表读不到 ⇒ 上下文＋原因都在，且**不**显示「未发现节点」空态', async () => {
      mockListA2APeers.mockImplementation(() =>
        Promise.reject(new Error('HTTP 404: Not Found')),
      );
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.peerListFailed/)).toBeInTheDocument();
      });
      // 上下文（译文）＋ 原因（原文）**两者都在**
      const errEl = screen.getByText(/common\.migrate\.peerListFailed/);
      expect(errEl.textContent).toContain('HTTP 404: Not Found');
      // 「读不到」**不许**被渲染成「一个节点都没有」
      expect(screen.queryByText(/common\.migrate\.noPeers/)).not.toBeInTheDocument();
    });

    /**
     * 孪生用例：列表**真的读到空** ⇒ ⇒ 空态**该出现**（且**没有**错误条）。
     */
    it('列表**真的读到空** ⇒ 空态出现（孪生：把「读不到」与「没有」分开）', async () => {
      mockListA2APeers.mockImplementation(() => Promise.resolve({ data: [] }));
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.noPeers/)).toBeInTheDocument();
      });
      expect(screen.queryByText(/common\.migrate\.peerListFailed/)).not.toBeInTheDocument();
    });

    it('resets state when re-opened', async () => {
      const { rerender } = renderDialog({ open: false });
      rerender(
        <MoveSessionDialog
          open
          sessionId="session-abc"
          messageCount={0}
          onClose={vi.fn()}
          onMigrated={vi.fn()}
        />,
      );
      await waitFor(() => {
        expect(mockListA2APeers).toHaveBeenCalled();
      });
    });
  });

  describe('peer selection', () => {
    it('shows peer name and URL', async () => {
      renderDialog();
      await screen.findByText('Peer 1');
      expect(screen.getByText('http://peer1.local:8082')).toBeInTheDocument();
    });

    it('shows capability chips', async () => {
      renderDialog();
      await screen.findByText('Peer 1');
      expect(screen.getByText('llm')).toBeInTheDocument();
      expect(screen.getByText('asr')).toBeInTheDocument();
    });

    it('clicking peer marks it as selected', async () => {
      const user = userEvent.setup();
      renderDialog();
      const peer1Card = await screen.findByText('Peer 1');
      await user.click(peer1Card);
      const selected = peer1Card.closest('.move-session-peer-card');
      expect(selected).toHaveClass('selected');
    });

    it('clicking another peer changes selection', async () => {
      const user = userEvent.setup();
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      const peer2 = await screen.findByText('Peer 2');
      await user.click(peer1);
      await user.click(peer2);
      expect(peer2.closest('.move-session-peer-card')).toHaveClass('selected');
      expect(peer1.closest('.move-session-peer-card')).not.toHaveClass('selected');
    });

    it('migrate button is disabled when no peer selected', async () => {
      renderDialog();
      await screen.findByText('Peer 1');
      const migrateBtn = screen.getByRole('button', { name: /common\.migrate\.confirm/ });
      expect(migrateBtn).toBeDisabled();
    });

    it('migrate button is enabled when peer selected', async () => {
      const user = userEvent.setup();
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      const migrateBtn = screen.getByRole('button', { name: /common\.migrate\.confirm/ });
      expect(migrateBtn).not.toBeDisabled();
    });
  });

  describe('migrate flow', () => {
    it('clicking migrate calls prepareMigration with sessionId', async () => {
      const user = userEvent.setup();
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(mockPrepareMigration).toHaveBeenCalledWith('session-abc');
      });
    });

    it('clicking migrate calls importSession with newId=true', async () => {
      const user = userEvent.setup();
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(mockImportSession).toHaveBeenCalledWith('serialized-data', { newId: true });
      });
    });

    it('shows success message after successful migration', async () => {
      const user = userEvent.setup();
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.success\(Peer 1\)/)).toBeInTheDocument();
      });
    });

    it('calls onMigrated with new session id and peer name', async () => {
      const user = userEvent.setup();
      const onMigrated = vi.fn();
      renderDialog({ onMigrated });
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(onMigrated).toHaveBeenCalledWith('new-session-id', 'Peer 1');
      });
    });

    it('shows preparing phase during prepareMigration', async () => {
      const user = userEvent.setup();
      // 500ms delay: long enough that the assertion below reliably catches
      // the `preparing` phase before it transitions to `sending`. The 100ms
      // version used to flake in CI when the local timer was throttled.
      mockPrepareMigration.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ payload: '', size_bytes: 100 }), 500)),
      );
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      expect(await screen.findByText(/common\.migrate\.preparing/)).toBeInTheDocument();
    });

    it('shows sending phase after prepare completes', async () => {
      const user = userEvent.setup();
      mockPrepareMigration.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ payload: '', size_bytes: 100 }), 50)),
      );
      mockImportSession.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: { id: 'x' } }), 100)),
      );
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.inProgress\(Peer 1\)/)).toBeInTheDocument();
      });
    });

    it('shows error message when prepareMigration fails', async () => {
      const user = userEvent.setup();
      mockPrepareMigration.mockImplementation(() =>
        Promise.reject(new Error('Prepare failed')),
      );
      renderDialog();
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.error\(Error: Prepare failed\)/)).toBeInTheDocument();
      });
    });

    it('does nothing when migrate is clicked without sessionId', async () => {
      const user = userEvent.setup();
      renderDialog({ sessionId: null });
      mockPrepareMigration.mockClear();
      mockPrepareMigration.mockImplementation(() => Promise.resolve({ payload: '', size_bytes: 0 }));
      await waitFor(() => expect(mockListA2APeers).toHaveBeenCalled());
      expect(mockPrepareMigration).not.toHaveBeenCalled();
    });
  });

  describe('modal actions', () => {
    it('clicking close button calls onClose', async () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      await screen.findByText('Peer 1');
      const closeBtn = screen.getByRole('button', { name: /common\.close/ });
      await userEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking cancel calls onClose', async () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      await screen.findByText('Peer 1');
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/ });
      await userEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking backdrop calls onClose', async () => {
      const onClose = vi.fn();
      const { container } = renderDialog({ onClose });
      await screen.findByText('Peer 1');
      const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking inside dialog does not close', async () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(dialog);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('after success, shows confirm button instead of cancel/migrate', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderDialog({ onClose });
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.success/)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /common\.cancel/ })).not.toBeInTheDocument();
      const confirmBtn = screen.getByRole('button', { name: /common\.confirm/ });
      expect(confirmBtn).toBeInTheDocument();
      await user.click(confirmBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('message count summary', () => {
    it('shows message count when messageCount > 0', async () => {
      renderDialog({ messageCount: 42 });
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.messageCount\(42\)/)).toBeInTheDocument();
      });
    });

    it('does not show message count when messageCount is 0', async () => {
      renderDialog({ messageCount: 0 });
      await waitFor(() => {
        expect(mockListA2APeers).toHaveBeenCalled();
      });
      expect(screen.queryByText(/common\.migrate\.messageCount/)).not.toBeInTheDocument();
    });

    it('shows payload size badge after preparing migration', async () => {
      const user = userEvent.setup();
      renderDialog({ messageCount: 5 });
      const peer1 = await screen.findByText('Peer 1');
      await user.click(peer1);
      await user.click(screen.getByRole('button', { name: /common\.migrate\.confirm/ }));
      await waitFor(() => {
        expect(screen.getByText(/common\.migrate\.sizeKb\(2\)/)).toBeInTheDocument();
      });
    });
  });
});
