import { CheckCircle, XCircle, AlertTriangle, Wrench, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type ToolOutputState = 'output-available' | 'output-error' | 'output-denied' | 'running';

export interface ToolOutputCardProps {
  toolName: string;
  toolCallId: string;
  state: ToolOutputState;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  title?: string;
  /**
   * If true, render compact (used when stacked in a busy thread).
   */
  compact?: boolean;
}

/**
 * Result card for a tool call that has finished streaming. Shows the
 * tool name, the input it was called with, and a renderable result.
 *
 * This pairs with `ToolApprovalCard` (shown while waiting for the
 * user) and `ClientToolForm` (shown while waiting for user-supplied
 * input) — all three implement the same "tool part in chat" surface
 * with the same data-testid prefix so consumers can style them
 * consistently.
 */
export function ToolOutputCard({
  toolName,
  toolCallId,
  state,
  input,
  output,
  errorText,
  title,
  compact = false,
}: ToolOutputCardProps) {
  return (
    <Card
      className={cn(
        'my-2',
        compact && 'py-2',
        state === 'output-error' && 'border-destructive/40 bg-destructive/5',
        state === 'output-denied' && 'border-muted bg-muted/30',
        state === 'running' && 'border-primary/40 bg-primary/5',
        state === 'output-available' && 'border-success/40 bg-success/5',
      )}
      data-tool-call-id={toolCallId}
      data-tool-state={state}
      data-testid={`tool-output-${toolName}`}
    >
      <CardContent className={cn('flex flex-col gap-2', compact && 'p-3')}>
        <div className="flex items-center gap-2">
          <StateIcon state={state} />
          <span className="text-sm font-semibold text-foreground">
            {title ?? toolName}
          </span>
          <StateBadge state={state} />
        </div>

        {!compact && input && (
          <details className="rounded-md border border-border bg-muted/30 p-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-foreground">
              Input
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
              {JSON.stringify(input, null, 2)}
            </pre>
          </details>
        )}

        {state === 'output-error' && errorText && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {errorText}
          </div>
        )}

        {state === 'output-available' && output !== undefined && (
          <OutputBody output={output} />
        )}
      </CardContent>
    </Card>
  );
}

function StateIcon({ state }: { state: ToolOutputState }) {
  switch (state) {
    case 'output-available':
      return <CheckCircle className="h-4 w-4 flex-shrink-0 text-success" />;
    case 'output-error':
      return <XCircle className="h-4 w-4 flex-shrink-0 text-destructive" />;
    case 'output-denied':
      return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
    case 'running':
      return (
        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
      );
    default:
      return <Wrench className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
  }
}

function StateBadge({ state }: { state: ToolOutputState }) {
  switch (state) {
    case 'output-available':
      return (
        <Badge variant="success" size="sm">
          completed
        </Badge>
      );
    case 'output-error':
      return (
        <Badge variant="destructive" size="sm">
          failed
        </Badge>
      );
    case 'output-denied':
      return (
        <Badge variant="secondary" size="sm">
          denied
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="default" size="sm">
          running
        </Badge>
      );
    default:
      return null;
  }
}

function OutputBody({ output }: { output: unknown }) {
  if (output === null || output === undefined) {
    return null;
  }

  if (typeof output === 'string') {
    return (
      <p className="text-xs whitespace-pre-wrap break-words text-foreground">
        {output}
      </p>
    );
  }

  if (typeof output === 'object') {
    return (
      <details
        open
        className="rounded-md border border-border bg-muted/30 p-2 text-xs"
      >
        <summary className="cursor-pointer select-none font-medium text-foreground">
          Output
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
          {JSON.stringify(output, null, 2)}
        </pre>
      </details>
    );
  }

  return (
    <p className="text-xs text-foreground">{String(output)}</p>
  );
}
