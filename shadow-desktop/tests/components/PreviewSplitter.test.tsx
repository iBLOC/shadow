import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PreviewSplitter } from '../../src/components/preview/PreviewSplitter';
import { usePreviewStore } from '../../src/stores/previewStore';

// jsdom doesn't expose getBoundingClientRect on Element by default; PreviewSplitter
// reads parentElement.getBoundingClientRect() during pointer move. Stub it once.
function stubRect(width: number) {
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 100,
      width,
      height: 100,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
}

// jsdom doesn't ship pointer-capture methods on Element. Stub them so the
// drag handler doesn't throw — the captured pointer is irrelevant to the
// store mutation we're asserting on.
function stubPointerCapture() {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function () {
      /* no-op */
    };
    Element.prototype.releasePointerCapture = function () {
      /* no-op */
    };
  }
}

describe('PreviewSplitter', () => {
  beforeEach(() => {
    stubPointerCapture();
    usePreviewStore.setState({
      paneWidth: 480,
      paneHidden: false,
      inlinePreviews: new Map(),
      activeTaskId: null,
    });
  });

  it('renders when the pane is visible', () => {
    stubRect(1024);
    const { container } = render(<PreviewSplitter />);
    expect(container.querySelector('[data-testid="preview-splitter"]')).not.toBeNull();
  });

  it('renders nothing when the pane is hidden', () => {
    usePreviewStore.setState({ paneHidden: true });
    stubRect(1024);
    const { container } = render(<PreviewSplitter />);
    expect(container.querySelector('[data-testid="preview-splitter"]')).toBeNull();
  });

  it('clamps the new pane width via the store action on drag', () => {
    stubRect(1024);
    const { getByTestId } = render(<PreviewSplitter />);
    const splitter = getByTestId('preview-splitter');

    // jsdom 25 doesn't ship `PointerEvent` (only `MouseEvent`), so React
    // testing-library's `fireEvent.pointerMove` builds a synthetic event
    // without `clientX`. Dispatch a MouseEvent named 'pointermove' so React
    // still routes through its pointer-event handler and picks up clientX.
    fireEvent.pointerDown(splitter, { pointerId: 1, clientX: 700 });
    splitter.dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: 500,
        clientY: 0,
        bubbles: true,
      }),
    );
    fireEvent.pointerUp(splitter, { pointerId: 1 });

    // New width = parentRight − clientX = 1024 − 500 = 524.
    expect(usePreviewStore.getState().paneWidth).toBe(524);
  });

  it('clamps to PREVIEW_PANE_MIN_WIDTH when dragging past the left edge', () => {
    stubRect(1024);
    const { getByTestId } = render(<PreviewSplitter />);
    const splitter = getByTestId('preview-splitter');

    fireEvent.pointerDown(splitter, { pointerId: 1 });
    splitter.dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: 1000,
        clientY: 0,
        bubbles: true,
      }),
    );
    fireEvent.pointerUp(splitter, { pointerId: 1 });

    expect(usePreviewStore.getState().paneWidth).toBe(240);
  });
});