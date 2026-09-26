// @vitest-environment jsdom
// `vi.mock` is hoisted to the top of the file by the vitest transformer, so any
// reference to a top-level `const`/`let` inside the factory throws
// `ReferenceError: Cannot access '<name>' before initialization`. Wrap the
// shared handle in `vi.hoisted` so it lives in a hoisted scope too.
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue([]),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
  convertFileSrc: vi.fn((p: string) => p),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioEventChip } from '../components/chat/AudioEventChip';
import { FeishuPublishedCard } from '../components/chat/FeishuPublishedCard';
import { ComputerUsePendingModal } from '../components/computerUse/ComputerUsePendingModal';

// Mock window.matchMedia (used by some UI components).
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

describe('AudioEventChip', () => {
  it('renders event content and confidence', () => {
    // The setup.ts i18n mock returns the key verbatim with no
    // interpolation, so the rendered text is the key name as a
    // substring (the class line is `audioEvent.class · home-mic`
    // since the chip appends the source). Use regex matchers to
    // tolerate the trailing ` · ${source}` text fragment.
    render(
      <AudioEventChip classId="baby_cry" confidence={0.92} source="home-mic" timestamp={1700000000} />
    );
    expect(screen.getByTestId('audio-event-chip')).toBeDefined();
    expect(screen.getByText(/audioEvent\.class/)).toBeDefined();
    expect(screen.getByText(/audioEvent\.confidence/)).toBeDefined();
  });
});

describe('FeishuPublishedCard', () => {
  it('renders the share URL', () => {
    render(
      <FeishuPublishedCard data={{ taskId: 't-1', title: 'Test Doc', url: 'https://example.feishu.cn/sheets/abc' }} />
    );
    expect(screen.getByTestId('feishu-published-card')).toBeDefined();
    expect(screen.getByText(/example.feishu.cn/)).toBeDefined();
  });
});

describe('ComputerUsePendingModal', () => {
  it('renders nothing when action is null', () => {
    const { container } = render(
      <ComputerUsePendingModal action={null} onResolved={() => {}} />
    );
    expect(container.querySelector('[data-testid="computer-use-pending-modal"]')).toBeNull();
  });
});
