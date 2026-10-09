// Right-side preview pane for the conversation page.
//
// Hosts two preview kinds side-by-side:
//   - `kind: 'web'` — load the URL in a Tauri child webview (the
//     ResizeObserver below forwards container bounds to Rust).
//   - `kind: 'markdown'` — fetch the URL's body via Rust, then render
//     the markdown string with `<MarkdownPreview>` (React + react-markdown).
//
// Tab semantics: at most one inline preview is visible at a time (the
// `activeTaskId`). Non-active web-kind tabs still hold their child
// webviews alive at 0×0 so users don't lose in-page state when switching;
// markdown-kind tabs just unmount their renderer (the body stays in the
// store). Toggling the pane hidden collapses every inline webview to 0×0.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { X, ExternalLink, EyeOff, Plus, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  usePreviewStore,
  type InlinePreviewKind,
} from '@/stores/previewStore';
import { MarkdownPreview } from './MarkdownPreview';

export function PreviewPane() {
  const { t } = useTranslation();
  const paneWidth = usePreviewStore((s) => s.paneWidth);
  const paneHidden = usePreviewStore((s) => s.paneHidden);
  const inlinePreviews = usePreviewStore((s) => s.inlinePreviews);
  const activeTaskId = usePreviewStore((s) => s.activeTaskId);
  const openInline = usePreviewStore((s) => s.openInline);
  const closeInline = usePreviewStore((s) => s.closeInline);
  const setActive = usePreviewStore((s) => s.setActive);
  const detach = usePreviewStore((s) => s.detach);
  const setInlineContent = usePreviewStore((s) => s.setInlineContent);
  const hidePane = usePreviewStore((s) => s.hidePane);

  const containerRef = useRef<HTMLDivElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<InlinePreviewKind>('web');
  const [taskIdInput, setTaskIdInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const entries = Array.from(inlinePreviews.values()).sort(
    (a, b) => b.openedAt - a.openedAt,
  );
  const active = activeTaskId ? inlinePreviews.get(activeTaskId) ?? null : null;

  // Forward container bounds to Rust so the embedded webview tracks the
  // visual area. When the pane is hidden or the container collapses to 0,
  // we move the webview off-stage (0×0) so it doesn't bleed over the chat.
  // Markdown-kind previews don't need this — they're React-rendered.
  useEffect(() => {
    if (!active || active.kind !== 'web') return;
    const el = containerRef.current;
    if (!el) return;

    const syncBounds = async () => {
      const rect = el.getBoundingClientRect();
      const hidden = paneHidden || rect.width === 0 || rect.height === 0;
      try {
        await invoke('inline_preview_set_bounds', {
          taskId: active.taskId,
          x: hidden ? 0 : rect.left,
          y: hidden ? 0 : rect.top,
          width: hidden ? 0 : rect.width,
          height: hidden ? 0 : rect.height,
        });
      } catch (err) {
        console.warn('inline_preview_set_bounds failed', err);
      }
    };

    syncBounds();
    const observer = new ResizeObserver(() => {
      void syncBounds();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, paneHidden]);

  const handleOpenInline = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const tid = taskIdInput.trim();
      const u = urlInput.trim();
      if (!tid || !u) return;
      setSubmitting(true);
      setError('');
      try {
        if (kind === 'web') {
          const rect = containerRef.current?.getBoundingClientRect();
          await invoke('inline_preview_open', {
            taskId: tid,
            url: u,
            parentLabel: 'main',
            x: rect?.left ?? 0,
            y: rect?.top ?? 0,
            width: rect?.width ?? 480,
            height: rect?.height ?? 600,
          });
          openInline(tid, u, 'web');
        } else {
          // Markdown: fetch via Rust first, then store the body so
          // tab-switch / pane-hide don't refetch.
          const content = (await invoke<string>(
            'inline_preview_fetch_markdown',
            { url: u },
          )) as string;
          openInline(tid, u, 'markdown');
          setInlineContent(tid, content);
        }
        setTaskIdInput('');
        setUrlInput('');
        setShowForm(false);
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [kind, taskIdInput, urlInput, openInline, setInlineContent],
  );

  const handleClose = useCallback(
    async (taskId: string) => {
      // For web kind, ask Rust to close the child webview. Markdown kind
      // has nothing to clean up on the native side — drop the store entry.
      const entry = inlinePreviews.get(taskId);
      if (entry?.kind === 'web') {
        try {
          await invoke('inline_preview_close', { taskId });
        } catch (err) {
          console.warn('inline_preview_close failed', err);
        }
      }
      closeInline(taskId);
    },
    [inlinePreviews, closeInline],
  );

  const handleDetach = useCallback(
    async (taskId: string, url: string) => {
      const entry = inlinePreviews.get(taskId);
      if (!entry || entry.kind !== 'web') return; // detach is web-only
      setError('');
      try {
        // Close the inline child webview, then spawn an OS-level window
        // for the same task. The tab disappears from the right pane
        // (per the 2026-09-25 redesign; detach = content relocates).
        await invoke('inline_preview_close', { taskId });
        await invoke('preview_open', { taskId, url });
        detach(taskId);
      } catch (err) {
        setError(String(err));
      }
    },
    [inlinePreviews, detach],
  );

  return (
    <aside
      ref={containerRef}
      className="flex flex-col border-l border-border bg-card"
      style={{ width: paneHidden ? 0 : paneWidth, overflow: 'hidden' }}
      data-testid="preview-pane"
      aria-label={t('preview.pane.title')}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Eye className="h-3.5 w-3.5" />
          <span>{t('preview.pane.title')}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowForm((v) => !v)}
            aria-label={t('preview.pane.addNew')}
            title={t('preview.pane.addNew')}
            data-testid="preview-pane-add"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={hidePane}
            aria-label={t('preview.pane.hide')}
            title={t('preview.pane.hide')}
            data-testid="preview-pane-hide"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleOpenInline}
          className="flex shrink-0 flex-col gap-1.5 border-b border-border p-2"
        >
          <div className="flex items-center gap-1">
            <span className="w-20 text-[11px] text-muted-foreground">
              {t('preview.pane.kindLabel')}
            </span>
            <div
              className="flex overflow-hidden rounded border border-border text-[11px]"
              role="radiogroup"
              aria-label={t('preview.pane.kindLabel')}
            >
              <button
                type="button"
                role="radio"
                aria-checked={kind === 'web'}
                className={`flex items-center gap-1 px-2 py-1 ${
                  kind === 'web'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setKind('web')}
                data-testid="preview-pane-kind-web"
              >
                <ExternalLink className="h-3 w-3" />
                Web
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={kind === 'markdown'}
                className={`flex items-center gap-1 border-l border-border px-2 py-1 ${
                  kind === 'markdown'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => setKind('markdown')}
                data-testid="preview-pane-kind-markdown"
              >
                <FileText className="h-3 w-3" />
                Markdown
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="preview-pane-task-id" className="w-20 text-[11px]">
              {t('preview.pane.taskIdLabel')}
            </Label>
            <Input
              id="preview-pane-task-id"
              value={taskIdInput}
              onChange={(e) => setTaskIdInput(e.target.value)}
              placeholder="task-007"
              required
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="preview-pane-url" className="w-20 text-[11px]">
              {t('preview.pane.urlLabel')}
            </Label>
            <Input
              id="preview-pane-url"
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={
                kind === 'markdown'
                  ? 'https://example.com/README.md'
                  : 'http://localhost:3000'
              }
              required
              className="h-7 text-xs"
            />
          </div>
          {error && (
            <p className="text-[11px] text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={
                submitting || !taskIdInput.trim() || !urlInput.trim()
              }
              className="h-7 gap-1 px-2 text-[11px]"
              data-testid="preview-pane-submit"
            >
              <ExternalLink className="h-3 w-3" />
              {submitting
                ? t('preview.pane.opening')
                : kind === 'markdown'
                  ? t('preview.pane.openMarkdown')
                  : t('preview.pane.openInline')}
            </Button>
          </div>
        </form>
      )}

      {entries.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border p-1">
          {entries.map((entry) => {
            const isActive = entry.taskId === activeTaskId;
            return (
              <div
                key={entry.taskId}
                className={`group flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => setActive(entry.taskId)}
                data-testid={`preview-tab-${entry.taskId}`}
                data-active={isActive ? 'true' : 'false'}
                data-kind={entry.kind}
              >
                {entry.kind === 'markdown' ? (
                  <FileText className="h-3 w-3" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                <span className="font-mono">{entry.taskId}</span>
                {entry.kind === 'web' && (
                  <button
                    type="button"
                    className="ml-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDetach(entry.taskId, entry.url);
                    }}
                    aria-label={t('preview.pane.detachTitle', {
                      taskId: entry.taskId,
                    })}
                    title={t('preview.pane.detachTitle', {
                      taskId: entry.taskId,
                    })}
                    data-testid={`preview-tab-detach-${entry.taskId}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleClose(entry.taskId);
                  }}
                  aria-label={t('preview.pane.closeTab')}
                  title={t('preview.pane.closeTab')}
                  data-testid={`preview-tab-close-${entry.taskId}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative flex-1 bg-muted/30">
        {entries.length === 0 && (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {t('preview.pane.empty')}
          </div>
        )}
        {/* Active preview body — branches on kind:
         *  - `web`: Tauri child webview is rendered natively by Rust at
         *    this container's getBoundingClientRect() (see ResizeObserver
         *    above). The URL chip below is just a visual cue.
         *  - `markdown`: React renders the fetched body via
         *    `<MarkdownPreview>`. */}
        {active?.kind === 'markdown' && (
          <MarkdownPreview content={active.content ?? ''} />
        )}
        {active?.kind === 'web' && (
          <div className="pointer-events-none absolute bottom-1 right-1 max-w-[60%] truncate rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {active.url}
          </div>
        )}
      </div>
    </aside>
  );
}