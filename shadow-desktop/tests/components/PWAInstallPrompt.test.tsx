import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../src/lib/platform', () => ({
  isWeb: () => true,
  isTauri: () => false,
}));

import { PWAInstallPrompt } from '../../src/components/PWAInstallPrompt';

interface FakeInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function makeFakePrompt(): FakeInstallPrompt {
  const evt = new Event('beforeinstallprompt') as FakeInstallPrompt;
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome: 'accepted' as const });
  return evt;
}

describe('PWAInstallPrompt', () => {
  let matchMediaSpy: any;

  beforeEach(() => {
    localStorage.clear();
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: false,
          media: '',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as any,
    );
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('returns null when no install event received and not standalone', () => {
    const { container } = render(<PWAInstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('renders install dialog after beforeinstallprompt event fires', async () => {
    render(<PWAInstallPrompt />);
    const fakePrompt = makeFakePrompt();
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/pwa.installTitle/i)).toBeInTheDocument();
    expect(screen.getByText(/pwa.installDesc/i)).toBeInTheDocument();
  });

  it('hides prompt after install (appinstalled event)', async () => {
    render(<PWAInstallPrompt />);
    const fakePrompt = makeFakePrompt();
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns null when running in standalone mode', async () => {
    matchMediaSpy.mockImplementation(
      () =>
        ({
          matches: true,
          media: '(display-mode: standalone)',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as any,
    );
    const { container } = render(<PWAInstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render if dismiss is within DISMISS_DAYS window', async () => {
    localStorage.setItem('shadow.pwa.install.dismissed', String(Date.now()));
    render(<PWAInstallPrompt />);
    const fakePrompt = makeFakePrompt();
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('re-shows prompt if dismiss is older than DISMISS_DAYS', async () => {
    const eightDaysAgo = Date.now() - 8 * 86400000;
    localStorage.setItem('shadow.pwa.install.dismissed', String(eightDaysAgo));
    render(<PWAInstallPrompt />);
    const fakePrompt = makeFakePrompt();
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking accept calls prompt() and shows installed state', async () => {
    const user = userEvent.setup();
    const fakePrompt = makeFakePrompt();
    render(<PWAInstallPrompt />);
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    await user.click(screen.getByRole('button', { name: /pwa\.install/i }));
    await waitFor(() => {
      expect(fakePrompt.prompt).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('clicking dismiss hides prompt and stores timestamp', async () => {
    const user = userEvent.setup();
    render(<PWAInstallPrompt />);
    const fakePrompt = makeFakePrompt();
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    const dismissBtn = screen.getByRole('button', { name: /common\.close/i });
    await user.click(dismissBtn);
    expect(localStorage.getItem('shadow.pwa.install.dismissed')).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('handles accepted outcome by hiding prompt', async () => {
    const user = userEvent.setup();
    const fakePrompt = makeFakePrompt();
    fakePrompt.userChoice = Promise.resolve({ outcome: 'accepted' });
    render(<PWAInstallPrompt />);
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    await user.click(screen.getByRole('button', { name: /pwa\.install/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('handles dismissed outcome by hiding prompt without installed state', async () => {
    const user = userEvent.setup();
    const fakePrompt = makeFakePrompt();
    fakePrompt.userChoice = Promise.resolve({ outcome: 'dismissed' });
    render(<PWAInstallPrompt />);
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    await user.click(screen.getByRole('button', { name: /pwa\.install/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('removes event listeners on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<PWAInstallPrompt />);
    unmount();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain('beforeinstallprompt');
    expect(removed).toContain('appinstalled');
  });

  it('renders close (X) icon button alongside install button', async () => {
    render(<PWAInstallPrompt />);
    const fakePrompt = makeFakePrompt();
    await act(async () => {
      window.dispatchEvent(fakePrompt);
    });
    expect(screen.getByRole('button', { name: /pwa\.install/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /common\.close/i })).toBeInTheDocument();
  });
});
