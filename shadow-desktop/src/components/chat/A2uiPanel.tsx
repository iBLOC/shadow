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
 *
 * ## The brain's answers — three of them, plus a failure
 *
 * | the brain said | panel phase | what the user sees |
 * |---|---|---|
 * | a surface **with** content | `ready` | the drawn surface |
 * | a surface that is **empty** (only `Column`/`Text`) | `ready` | the drawn surface — the brain already said the truth inside it (`Tasks (0)` / `No tasks yet.`) |
 * | **plain text** | `text` | the brain's own words — **no** "no data" label |
 * | **nothing at all** | `empty` | "no data" — the only case where the client speaks |
 * | the request **failed** | `error` | the reason |
 *
 * ⚠️ "no data" belongs to exactly **one** case: the brain said *nothing*.
 * Printing it above a plain-text answer turns "the brain has something to
 * tell you" into "there is no data" — a flat lie.
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
  /** 端脑**什么都没说** —— 没有 surface，也没有一句话。只有这一档才说「暂无数据」。 */
  | { phase: 'empty'; texts: string[]; warnings: string[] }
  /** 端脑回的是**纯文本**（它这次不画界面，而是说话）⇒ 原话直接显示。 */
  | { phase: 'text'; texts: string[]; warnings: string[] }
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
        // ⚠️ **没有可渲染的 surface** ⇒ 端脑这次要么回的是**纯文本**
        // （「这里能看什么」），要么**一个字都没说**。
        //
        // ⚠️ 这两件事**必须分开** —— 旧版并成一种 ⇒ 纯文本时先压一句
        // 「暂无数据」，那是**假话**：端脑明明说了话。
        // ⇒ 「暂无数据」只在端脑**什么都没说**时才出现。
        if (result.texts.length > 0) {
          setState({ phase: 'text', texts: result.texts, warnings: result.errors });
          return;
        }
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

      {state.phase === 'text' ? (
        // ⚠️ **端脑的原话直接显示** —— 不压「暂无数据」。
        // 端脑已经按 `Accept-Language` 把话翻成了用户的语言
        // （`telencephalon/src/a2a/a2ui_i18n.rs`）
        // ⇒ 客户端**不许**再补一句自己的概括
        // （补了就把「有话要说」说成「没数据」—— 又一句假话）。
        <div className="flex flex-col gap-2" data-testid="a2ui-text">
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

      {state.phase === 'empty' ? (
        <div className="flex flex-col gap-2" data-testid="a2ui-empty">
          <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
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
