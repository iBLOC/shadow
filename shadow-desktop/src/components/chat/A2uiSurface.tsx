import { useTranslation } from 'react-i18next';
import type {
  A2uiComponent,
  A2uiProps,
  A2uiSurfaceSnapshot,
} from '../../lib/a2uiProtocol';

/**
 * Renders an A2UI surface.
 *
 * ## Why a second renderer instead of reusing the tool cards
 *
 * The desktop already has a component-rendering pipeline for chat tool
 * parts (`ToolPartRouter` / `ClientToolForm` / `ToolCallMessageCard`).
 * The capability manifest argues that the cheaper path is to teach *that*
 * pipeline the A2UI data model (`agent-surface.json` → `a2ui` →
 * `desktop._endSideExclusive`).
 *
 * This file is deliberately **not** that. The reason is structural, not
 * stylistic: the tool pipeline is driven by the AI SDK's `UIMessage` part
 * shape and is wired into the chat message list, while A2UI surfaces arrive
 * out-of-band — a separate HTTP call to `POST /a2a` that returns its own
 * component tree, keyed by its own surface id. Folding that into the tool
 * pipeline would mean teaching the chat message store about surfaces that
 * are not messages.
 *
 * So this is a **separate, narrow** renderer over the A2UI catalog. It stays
 * small on purpose: the brain only emits four component types
 * (`telencephalon/src/a2a/a2ui.rs`), and the catalog below is exactly
 * those four. Unknown types degrade to a placeholder rather than throwing —
 * a newer brain must not white-screen an older desktop.
 */

/** Props of `Column` — children are component ids, resolved by the model. */
interface ColumnProps extends A2uiProps {
  children?: string[];
  alignment?: string;
}

/** Props of `Text` — the payload is either a literal string or a text node. */
interface TextProps extends A2uiProps {
  text?: unknown;
  usageHint?: string;
}

/** Props of `TaskCard` — mirrors the mobile catalog item of the same name. */
interface TaskCardProps extends A2uiProps {
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

/** Props of `AgentStatusIndicator` — same catalog item on mobile. */
interface AgentStatusIndicatorProps extends A2uiProps {
  agentName?: string;
  status?: 'idle' | 'thinking' | 'executing' | 'error';
  message?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** `Text.text` is `{ literalString: "…" }` on the wire, but a bare string is legal too. */
function textLiteral(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const literal = (value as Record<string, unknown>).literalString;
    if (typeof literal === 'string') return literal;
  }
  return '';
}

/**
 * Status → visual treatment.
 *
 * ⚠️ The colors come from the design tokens (`--success` / `--warning` /
 * `--destructive`), never from hard-coded hex: `check-agent-surface.mjs`
 * keeps the desktop palette token-driven, and a raw hex here would be a
 * silent palette fork.
 *
 * ⚠️ The status / priority **tokens** are shown verbatim (`in_progress`,
 * `HIGH`, …) rather than translated. They are protocol values, and the
 * mobile catalog shows the same raw tokens
 * (`shadow-mobile/lib/services/genui/shadow_catalog.dart:90` renders
 * `priority.toUpperCase()`) ⇒ translating them on one side would make the
 * two clients disagree about the same surface.
 */
const TASK_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-brand/10 text-[hsl(var(--warning))]',
  completed: 'bg-brand/10 text-[hsl(var(--success))]',
};

const AGENT_STATUS_STYLE: Record<string, string> = {
  idle: 'bg-muted text-muted-foreground',
  thinking: 'bg-brand/10 text-[hsl(var(--warning))]',
  executing: 'bg-brand/10 text-brand',
  error: 'bg-destructive/10 text-destructive',
};

export interface A2uiSurfaceProps {
  surface: A2uiSurfaceSnapshot;
}

export function A2uiSurface({ surface }: A2uiSurfaceProps) {
  const { t } = useTranslation();
  const byId = new Map(surface.components.map((c) => [c.id, c]));

  if (!surface.rootId) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        data-testid="a2ui-surface-no-root"
      >
        {surface.rendered ? t('a2ui.missingRoot') : t('a2ui.waitingForRender')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="a2ui-surface" data-surface-id={surface.surfaceId}>
      <A2uiNode id={surface.rootId} byId={byId} path={new Set()} />
    </div>
  );
}

/**
 * One node of the component tree.
 *
 * `path` holds the **ancestors** of this node, and it is what stops a
 * component tree that references itself: a malformed payload would
 * otherwise recurse until the stack overflows and take the whole page down.
 *
 * ⚠️ **Why ancestors and not "everything seen so far"**: a "seen" set would
 * also swallow a component that is referenced **twice** in the tree (the
 * second reference would render as nothing). The guard has to answer
 * "is this an *ancestor* of me?" — i.e. a cycle — and nothing more.
 */
function A2uiNode({
  id,
  byId,
  path,
}: {
  id: string;
  byId: Map<string, A2uiComponent>;
  path: ReadonlySet<string>;
}) {
  const { t } = useTranslation();

  if (path.has(id)) return null; // cycle — stop here
  const childPath = new Set(path);
  childPath.add(id);

  const component = byId.get(id);
  if (!component) {
    return (
      <div
        className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground"
        data-testid="a2ui-missing-component"
      >
        {`${t('a2ui.missingComponent')} ${id}`}
      </div>
    );
  }

  const entries = Object.entries(component.component);
  const [type, props] = entries[0] ?? ['', {} as A2uiProps];

  switch (type) {
    case 'Column': {
      const column = props as ColumnProps;
      const children = Array.isArray(column.children) ? column.children : [];
      return (
        <div
          className={column.alignment === 'center' ? 'flex flex-col items-center gap-3' : 'flex flex-col gap-3'}
          data-testid="a2ui-column"
        >
          {children.map((childId) => (
            <A2uiNode key={childId} id={childId} byId={byId} path={childPath} />
          ))}
        </div>
      );
    }

    case 'Text': {
      const text = props as TextProps;
      const literal = textLiteral(text.text);
      const usageHint = str(text.usageHint);
      if (usageHint === 'h3' || usageHint === 'h2' || usageHint === 'h1') {
        const Tag = usageHint as 'h1' | 'h2' | 'h3';
        return (
          <Tag className="text-base font-semibold text-foreground" data-testid="a2ui-text">
            {literal}
          </Tag>
        );
      }
      return (
        <p className="text-sm text-foreground" data-testid="a2ui-text">
          {literal}
        </p>
      );
    }

    case 'TaskCard': {
      const card = props as TaskCardProps;
      const status = card.status ?? 'pending';
      const priority = card.priority ?? 'medium';
      return (
        <div
          className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
          data-testid="a2ui-task-card"
          data-status={status}
          data-priority={priority}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{card.title ?? ''}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                TASK_STATUS_STYLE[status] ?? TASK_STATUS_STYLE.pending
              }`}
              data-testid="a2ui-task-status"
            >
              {status}
            </span>
          </div>
          {card.description ? (
            <span className="text-xs text-muted-foreground" data-testid="a2ui-task-description">
              {card.description}
            </span>
          ) : null}
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground" data-testid="a2ui-task-priority">
            {priority}
          </span>
        </div>
      );
    }

    case 'AgentStatusIndicator': {
      const indicator = props as AgentStatusIndicatorProps;
      const status = indicator.status ?? 'idle';
      return (
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
          data-testid="a2ui-agent-status"
          data-status={status}
        >
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              AGENT_STATUS_STYLE[status] ?? AGENT_STATUS_STYLE.idle
            }`}
          >
            {status}
          </span>
          <span className="text-sm text-foreground">{indicator.agentName ?? ''}</span>
          {indicator.message ? (
            <span className="text-xs text-muted-foreground">{indicator.message}</span>
          ) : null}
        </div>
      );
    }

    default:
      // ⚠️ Unknown component type — render a placeholder instead of throwing.
      // A newer brain must not white-screen an older desktop.
      return (
        <div
          className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground"
          data-testid="a2ui-unknown-component"
          data-component-type={type}
        >
          {type || t('a2ui.unknownComponent')}
        </div>
      );
  }
}

/** Exported for the panel: does this snapshot have anything to draw? */
export function hasRenderableContent(surface: A2uiSurfaceSnapshot | undefined): boolean {
  if (!surface) return false;
  return surface.rendered && Boolean(surface.rootId) && surface.components.length > 0;
}
