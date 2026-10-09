import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const PANE_MIN_WIDTH = 240;
const PANE_MAX_RATIO = 0.7;
const PANE_DEFAULT_WIDTH = 480;

/** Clamp the right-pane width into the [min, max-window-derived] range so the
 *  splitter can never shrink the chat area to nothing or push the pane off-screen. */
function clampPaneWidth(w: number): number {
  const min = PANE_MIN_WIDTH;
  const max = Math.max(min, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1200) * PANE_MAX_RATIO));
  return Math.min(max, Math.max(min, Math.floor(w)));
}

/** Two preview kinds:
 *  - `web`: load `url` in a Tauri child webview (Rust-side).
 *  - `markdown`: fetch `url` via Rust (markdown-text body) and render the
 *    resulting string via `react-markdown` in the React tree.
 *
 *  Only `markdown` carries an in-store `content` (the fetched body). `web`
 *  previews never store content because the visible page lives in the
 *  native webview, not the React tree. */
export type InlinePreviewKind = 'web' | 'markdown';

export interface InlinePreview {
  taskId: string;
  url: string;
  kind: InlinePreviewKind;
  /** Markdown body — only populated for `kind: 'markdown'` previews,
   *  filled in by `setInlineContent` after Rust returns the fetched text. */
  content?: string;
  openedAt: number;
}

interface PreviewState {
  /** Inline (right-pane) previews keyed by task id. OS-level WebviewWindow
   *  previews opened via `preview_open` are NOT tracked here — Tauri's own
   *  window list is the source of truth for those. */
  inlinePreviews: Map<string, InlinePreview>;
  activeTaskId: string | null;
  paneWidth: number;
  paneHidden: boolean;
  openInline: (taskId: string, url: string, kind: InlinePreviewKind) => void;
  closeInline: (taskId: string) => void;
  setActive: (taskId: string) => void;
  /** Remove an inline entry without closing the underlying Rust webview —
   *  the caller is responsible for invoking `inline_preview_close` first
   *  (used by the detach-to-window flow, which then opens an OS window).
   *  For `kind: 'markdown'` there is no OS window — callers just call this
   *  directly to drop the tab. */
  detach: (taskId: string) => void;
  /** Backfill the fetched body for a markdown-kind inline preview.
   *  No-op if the task isn't known or its kind isn't 'markdown'. */
  setInlineContent: (taskId: string, content: string) => void;
  setPaneWidth: (w: number) => void;
  togglePane: () => void;
  hidePane: () => void;
  showPane: () => void;
}

function pickNextActive(
  map: Map<string, InlinePreview>,
  fallback: string | null,
): string | null {
  if (map.size === 0) return null;
  if (fallback && map.has(fallback)) return fallback;
  return map.keys().next().value ?? null;
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      inlinePreviews: new Map(),
      activeTaskId: null,
      paneWidth: PANE_DEFAULT_WIDTH,
      paneHidden: false,
      openInline: (taskId, url, kind) =>
        set((state) => {
          const next = new Map(state.inlinePreviews);
          next.set(taskId, { taskId, url, kind, openedAt: Date.now() });
          return { inlinePreviews: next, activeTaskId: taskId, paneHidden: false };
        }),
      closeInline: (taskId) =>
        set((state) => {
          if (!state.inlinePreviews.has(taskId)) return {};
          const next = new Map(state.inlinePreviews);
          next.delete(taskId);
          return {
            inlinePreviews: next,
            activeTaskId: pickNextActive(next, state.activeTaskId === taskId ? null : state.activeTaskId),
          };
        }),
      setActive: (taskId) =>
        set((state) => (state.inlinePreviews.has(taskId) ? { activeTaskId: taskId } : {})),
      detach: (taskId) =>
        set((state) => {
          if (!state.inlinePreviews.has(taskId)) return {};
          const next = new Map(state.inlinePreviews);
          next.delete(taskId);
          return {
            inlinePreviews: next,
            activeTaskId: pickNextActive(next, state.activeTaskId === taskId ? null : state.activeTaskId),
          };
        }),
      setInlineContent: (taskId, content) =>
        set((state) => {
          const existing = state.inlinePreviews.get(taskId);
          if (!existing || existing.kind !== 'markdown') return {};
          const next = new Map(state.inlinePreviews);
          next.set(taskId, { ...existing, content });
          return { inlinePreviews: next };
        }),
      setPaneWidth: (w) => set({ paneWidth: clampPaneWidth(w) }),
      togglePane: () => set((state) => ({ paneHidden: !state.paneHidden })),
      hidePane: () => set({ paneHidden: true }),
      showPane: () => set({ paneHidden: false }),
    }),
    {
      name: 'shadow-preview-pane',
      // Only the pane chrome survives reload — the open inline previews are
      // rebuilt from `inline_preview_open` calls (or the user's memory) on
      // next mount, not from a snapshot of the runtime map.
      partialize: (state) => ({
        paneWidth: state.paneWidth,
        paneHidden: state.paneHidden,
      }),
    },
  ),
);

export const PREVIEW_PANE_MIN_WIDTH = PANE_MIN_WIDTH;
export const PREVIEW_PANE_DEFAULT_WIDTH = PANE_DEFAULT_WIDTH;
export const PREVIEW_PANE_MAX_RATIO = PANE_MAX_RATIO;