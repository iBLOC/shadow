// Draggable divider between the chat area and the right-side preview pane.
//
// Mirrors the `setPointerCapture` drag pattern from
// `src/pages/WorkflowStudioPage.tsx` (where it's used to drag graph nodes).
// The store's `setPaneWidth` action clamps into [PANE_MIN_WIDTH, 0.7 × window]
// so the drag handler itself can pass raw values without bounds checks.

import { useCallback, useRef } from 'react';
import { usePreviewStore } from '@/stores/previewStore';

const VISIBLE_WIDTH = 6;

export function PreviewSplitter() {
  const paneHidden = usePreviewStore((s) => s.paneHidden);
  const setPaneWidth = usePreviewStore((s) => s.setPaneWidth);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      // The splitter's parent is the conversation page root, which holds
      // [sidebar, chat, splitter, pane] in a horizontal flex. The right
      // edge of that root = the right edge of the pane. So
      // (rootRight − pointerX) is the new pane width.
      const root = e.currentTarget.parentElement;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      setPaneWidth(rect.right - e.clientX);
    },
    [setPaneWidth],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may have been released already — ignore.
    }
  }, []);

  if (paneHidden) return null;

  return (
    <div
      className="shrink-0 cursor-col-resize border-l border-r border-transparent bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
      style={{ width: VISIBLE_WIDTH }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="preview-splitter"
      role="separator"
      aria-orientation="vertical"
    />
  );
}