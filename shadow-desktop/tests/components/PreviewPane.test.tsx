import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { PreviewPane } from '../../src/components/preview/PreviewPane';
import { usePreviewStore } from '../../src/stores/previewStore';

// jsdom doesn't ship ResizeObserver — PreviewPane uses it to forward
// container bounds to Rust. Provide a minimal stub that records callbacks.
const resizeCallbacks: Array<() => void> = [];
class ResizeObserverStub {
  cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
    resizeCallbacks.push(cb);
  }
  observe() {
    /* no-op */
  }
  unobserve() {
    /* no-op */
  }
  disconnect() {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

import { invoke } from '@tauri-apps/api/core';
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

describe('PreviewPane', () => {
  beforeEach(() => {
    usePreviewStore.setState({
      inlinePreviews: new Map(),
      activeTaskId: null,
      paneWidth: 480,
      paneHidden: false,
    });
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('renders the empty hint when no previews are open', () => {
    const { getByText } = render(<PreviewPane />);
    expect(getByText(/preview\.pane\.empty/i)).toBeInTheDocument();
  });

  it('hides the splitter-less pane (width 0) when paneHidden is true', () => {
    usePreviewStore.setState({ paneHidden: true });
    const { getByTestId } = render(<PreviewPane />);
    const pane = getByTestId('preview-pane');
    expect(pane.style.width).toBe('0px');
  });

  it('forwards container bounds to Rust via inline_preview_set_bounds when an inline preview is active', async () => {
    usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');

    // jsdom doesn't compute layout; stub getBoundingClientRect with a non-zero size.
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 100,
        y: 50,
        top: 50,
        left: 100,
        right: 600,
        bottom: 700,
        width: 500,
        height: 650,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };

    render(<PreviewPane />);

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (c) => c[0] === 'inline_preview_set_bounds',
      );
      expect(calls.length).toBeGreaterThan(0);
    });

    const last = invokeMock.mock.calls
      .filter((c) => c[0] === 'inline_preview_set_bounds')
      .pop()![1] as Record<string, unknown>;

    expect(last.taskId).toBe('task-007');
    expect(last.x).toBe(100);
    expect(last.y).toBe(50);
    expect(last.width).toBe(500);
    expect(last.height).toBe(650);
  });

  it('sends 0×0 bounds when the pane is hidden (so the webview collapses off-stage)', async () => {
    usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 100,
        y: 50,
        top: 50,
        left: 100,
        right: 600,
        bottom: 700,
        width: 500,
        height: 650,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };
    const { rerender } = render(<PreviewPane />);

    // First frame: bounds = (100, 50, 500, 650)
    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some((c) => c[0] === 'inline_preview_set_bounds'),
      ).toBe(true);
    });

    invokeMock.mockClear();
    usePreviewStore.setState({ paneHidden: true });
    rerender(<PreviewPane />);

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (c) => c[0] === 'inline_preview_set_bounds',
      );
      expect(calls.length).toBeGreaterThan(0);
    });

    const last = invokeMock.mock.calls
      .filter((c) => c[0] === 'inline_preview_set_bounds')
      .pop()![1] as Record<string, number>;

    expect(last.x).toBe(0);
    expect(last.y).toBe(0);
    expect(last.width).toBe(0);
    expect(last.height).toBe(0);
  });

  it('closes an inline preview when the close icon is clicked', async () => {
    usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };

    const { getByTestId } = render(<PreviewPane />);

    const closeBtn = await waitFor(() =>
      getByTestId('preview-tab-close-task-007'),
    );
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          (c) => c[0] === 'inline_preview_close' && (c[1] as { taskId?: string })?.taskId === 'task-007',
        ),
      ).toBe(true);
    });
    expect(usePreviewStore.getState().inlinePreviews.size).toBe(0);
  });

  it('detaches: closes inline webview, opens OS window, removes the tab', async () => {
    usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };

    const { getByTestId } = render(<PreviewPane />);

    const detachBtn = await waitFor(() =>
      getByTestId('preview-tab-detach-task-007'),
    );
    fireEvent.click(detachBtn);

    await waitFor(() => {
      // Order: inline_preview_close(task-007) then preview_open(task-007, url).
      const closeIdx = invokeMock.mock.calls.findIndex(
        (c) => c[0] === 'inline_preview_close' && (c[1] as { taskId?: string })?.taskId === 'task-007',
      );
      const openIdx = invokeMock.mock.calls.findIndex(
        (c) => c[0] === 'preview_open' && (c[1] as { taskId?: string })?.taskId === 'task-007',
      );
      expect(closeIdx).toBeGreaterThanOrEqual(0);
      expect(openIdx).toBeGreaterThanOrEqual(0);
      expect(openIdx).toBeGreaterThan(closeIdx);
    });

    // Tab removed.
    expect(usePreviewStore.getState().inlinePreviews.has('task-007')).toBe(false);
  });

  it('opens an inline preview via the form: invokes inline_preview_open + updates the store', async () => {
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 480,
        bottom: 600,
        width: 480,
        height: 600,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };

    const { getByTestId, getByLabelText } = render(<PreviewPane />);

    // Expand the form (collapsed by default).
    fireEvent.click(getByTestId('preview-pane-add'));

    const taskInput = getByLabelText(/preview\.pane\.taskIdLabel/i) as HTMLInputElement;
    const urlInput = getByLabelText(/preview\.pane\.urlLabel/i) as HTMLInputElement;
    fireEvent.change(taskInput, { target: { value: 'task-007' } });
    fireEvent.change(urlInput, { target: { value: 'http://localhost:3000' } });

    fireEvent.click(getByTestId('preview-pane-submit'));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some(
          (c) =>
            c[0] === 'inline_preview_open' &&
            (c[1] as { taskId?: string; url?: string }).taskId === 'task-007' &&
            (c[1] as { url?: string }).url === 'http://localhost:3000',
        ),
      ).toBe(true);
    });

    expect(usePreviewStore.getState().inlinePreviews.get('task-007')?.url).toBe(
      'http://localhost:3000',
    );
    expect(usePreviewStore.getState().activeTaskId).toBe('task-007');
  });

  it('switches activeTaskId when a non-active tab is clicked', async () => {
    usePreviewStore.getState().openInline('a', 'http://a', 'web');
    usePreviewStore.getState().openInline('b', 'http://b', 'web');
    usePreviewStore.setState({ activeTaskId: 'a' });

    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };

    const { getByTestId } = render(<PreviewPane />);

    fireEvent.click(getByTestId('preview-tab-b'));

    await waitFor(() => {
      expect(usePreviewStore.getState().activeTaskId).toBe('b');
    });

    // The newly-active webview's bounds get re-synced to the container.
    const setBoundsForB = invokeMock.mock.calls.filter(
      (c) =>
        c[0] === 'inline_preview_set_bounds' &&
        (c[1] as { taskId?: string }).taskId === 'b',
    );
    expect(setBoundsForB.length).toBeGreaterThan(0);
  });

  it('opens a markdown-kind preview: fetches via Rust, stores body, renders via React', async () => {
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };

    // Mock the markdown fetch returning some content.
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'inline_preview_fetch_markdown') return '# Hello markdown';
      return undefined;
    });

    const { getByTestId, getByLabelText } = render(<PreviewPane />);

    fireEvent.click(getByTestId('preview-pane-add'));
    // Switch to Markdown kind.
    fireEvent.click(getByTestId('preview-pane-kind-markdown'));

    const taskInput = getByLabelText(/preview\.pane\.taskIdLabel/i) as HTMLInputElement;
    const urlInput = getByLabelText(/preview\.pane\.urlLabel/i) as HTMLInputElement;
    fireEvent.change(taskInput, { target: { value: 'doc-1' } });
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/README.md' },
    });

    fireEvent.click(getByTestId('preview-pane-submit'));

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (c) => c[0] === 'inline_preview_fetch_markdown',
      );
      expect(calls.length).toBe(1);
      const args = calls[0][1] as { url?: string };
      expect(args.url).toBe('https://example.com/README.md');
    });

    // Store has the entry with content backfilled.
    const entry = usePreviewStore.getState().inlinePreviews.get('doc-1');
    expect(entry?.kind).toBe('markdown');
    expect(entry?.content).toBe('# Hello markdown');

    // The body renders via react-markdown.
    await waitFor(() => {
      expect(getByTestId('markdown-preview')).not.toBeNull();
    });
    const h1 = document.querySelector('h1');
    expect(h1?.textContent).toBe('Hello markdown');
  });

  it('hides the detach icon on markdown-kind tabs (no OS-window detach)', () => {
    usePreviewStore.getState().openInline('doc-1', 'https://x.md', 'markdown');
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };
    const { queryByTestId } = render(<PreviewPane />);
    expect(queryByTestId('preview-tab-doc-1')).not.toBeNull();
    expect(queryByTestId('preview-tab-detach-doc-1')).toBeNull();
  });

  it('closes a markdown-kind tab without invoking inline_preview_close (no native webview)', async () => {
    usePreviewStore.getState().openInline('doc-1', 'https://x.md', 'markdown');
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };
    const { getByTestId } = render(<PreviewPane />);
    fireEvent.click(getByTestId('preview-tab-close-doc-1'));

    await waitFor(() => {
      expect(usePreviewStore.getState().inlinePreviews.has('doc-1')).toBe(false);
    });
    const closeCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === 'inline_preview_close',
    );
    expect(closeCalls.length).toBe(0);
  });
});