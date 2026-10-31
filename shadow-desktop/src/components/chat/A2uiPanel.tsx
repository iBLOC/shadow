import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '../ui';
import { requestA2uiSurface } from '../../lib/a2uiClient';
import type { A2uiSurfaceSnapshot, A2uiView } from '../../lib/a2uiProtocol';
import { A2uiSurface, hasRenderableContent } from './A2uiSurface';

/**
 * The A2UI panel — the desktop entry point for server-drawn interfaces.
 *
 * ## What it does
 *
 * Asks the brain for one surface (`POST {baseUrl}/a2a`) and renders whatever
 * component tree comes back. The brain decides what the screen looks like;
 * this panel only draws it.
 *
 * ## Why the panel owns the request (and not the page)
 *
 * The request is a *separate* call from the chat stream — a surface is not a
 * chat message. Keeping the request here means the page only has to hand over
 * an address and a key, and the panel can be reused from any surface of the
 * app later.
 *
 * ## Why the state distinguishes "empty" from "failed"
 *
 * The brain answers a request it cannot render with a **plain-text** reply
 * ("here is what I can show you") instead of an error
 * (`telencephalon/src/api/a2ui_gateway.rs` → `text_reply`). Collapsing that
 * into "no data" would hide the difference between *the brain had nothing to
 * draw* and *the request failed*.
 */

export interface A2uiPanelProps {
  /** Brain address — `telencephalonClient.getBaseUrl()`. */
  baseUrl: string;
  /** Shadow key — `telencephalonClient.getApiKey()`. Empty means dev mode. */
  apiKey?: string;
  /** Which view to ask for. */
  view?: A2uiView;
  /** Called when the user closes the panel. */
  onClose?: () => void;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

type PanelState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'empty'; texts: string[]; warnings: string[] }
  | { phase: 'ready'; surface: A2uiSurfaceSnapshot; texts: string[]; warnings: string[] };

const VIEW_LABEL_KEY: Record<A2uiView, string> = {
  tasks: 'surface.tasks',
  agents: 'surface.agents',
};

export function A2uiPanel({
  baseUrl,
  apiKey,
  view: initialView = 'tasks',
  onClose,
  fetchImpl,
}: A2uiPanelProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<A2uiView>(initialView);
  const [state, setState] = useState<PanelState>({ phase: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setState({ phase: 'loading' });

    requestA2uiSurface({
      baseUrl,
      apiKey,
      view,
      // ⚠️ **界面文案随用户的语言走** —— 端脑据此产出中文/英文界面
      // （真相源在服务端：`telencephalon/src/a2a/a2ui_i18n.rs`）。
      locale: i18n.language,
      signal: controller.signal,
      fetchImpl,
    })
      .then((result) => {
        if (cancelled) return;
        const surface = result.model.renderableSurfaces[0];
        if (hasRenderableContent(surface)) {
          setState({
            phase: 'ready',
            surface: surface as A2uiSurfaceSnapshot,
            texts: result.texts,
            warnings: result.errors,
          });
          return;
        }
        // ⚠️ No renderable surface: the brain either answered with plain text
        // ("here is what I can show") or sent nothing drawable at all.
        setState({ phase: 'empty', texts: result.texts, warnings: result.errors });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (controller.signal.aborted) return;
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [baseUrl, apiKey, view, reloadToken, fetchImpl, i18n.language]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  return (
    <section
      className="flex flex-col gap-3 border-b border-border bg-card/40 p-4"
      data-testid="a2ui-panel"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{t('surface.a2ui')}</span>
          <div className="ml-2 flex items-center gap-1">
            {(['tasks', 'agents'] as A2uiView[]).map((candidate) => (
              <Button
                key={candidate}
                variant={candidate === view ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView(candidate)}
                data-testid={`a2ui-view-${candidate}`}
              >
                {t(VIEW_LABEL_KEY[candidate])}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label={t('common.refresh')}
            data-testid="a2ui-refresh"
          >
            <RefreshCw size={16} />
          </Button>
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('common.close')}
              data-testid="a2ui-close"
            >
              <X size={16} />
            </Button>
          ) : null}
        </div>
      </header>

      {state.phase === 'loading' ? (
        <p className="text-sm text-muted-foreground" data-testid="a2ui-loading">
          {t('common.loading')}
        </p>
      ) : null}

      {state.phase === 'error' ? (
        <p className="text-sm text-destructive" data-testid="a2ui-error">
          {state.message}
        </p>
      ) : null}

      {state.phase === 'empty' ? (
        <div className="flex flex-col gap-2" data-testid="a2ui-empty">
          <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
          {state.texts.map((text, index) => (
            <p key={index} className="text-sm text-foreground" data-testid="a2ui-text-reply">
              {text}
            </p>
          ))}
          {state.warnings.map((warning, index) => (
            <p key={index} className="text-xs text-[hsl(var(--warning))]" data-testid="a2ui-warning">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {state.phase === 'ready' ? (
        <div className="flex flex-col gap-2">
          <A2uiSurface surface={state.surface} />
          {state.texts.map((text, index) => (
            <p key={index} className="text-xs text-muted-foreground" data-testid="a2ui-text-reply">
              {text}
            </p>
          ))}
          {state.warnings.map((warning, index) => (
            <p key={index} className="text-xs text-[hsl(var(--warning))]" data-testid="a2ui-warning">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
