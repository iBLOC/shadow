import { useState } from 'react';
import { Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ToolApprovalCardProps {
  approvalId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  /**
   * Called when the user approves. The parent is responsible for calling
   * `addToolApprovalResponse({ id: approvalId, approved: true })`.
   */
  onApprove: () => void;
  /**
   * Called when the user denies. The parent is responsible for calling
   * `addToolApprovalResponse({ id: approvalId, approved: false })`.
   */
  onDeny: () => void;
  /**
   * If true, render compact (used when stacked in a busy thread).
   */
  compact?: boolean;
}

/**
 * Inline approval prompt rendered for a tool call that needs user consent
 * (`needsApproval: true` in the AI SDK helper).
 *
 * The component is intentionally stateless: it surfaces the tool name
 * and input, then delegates the actual `addToolApprovalResponse` call
 * to the parent so callers can apply their own async / toast UX.
 */
export function ToolApprovalCard({
  approvalId,
  toolName,
  input,
  title,
  onApprove,
  onDeny,
  compact = false,
}: ToolApprovalCardProps) {
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setSubmitting('approve');
    setError(null);
    try {
      await onApprove();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDeny() {
    setSubmitting('deny');
    setError(null);
    try {
      await onDeny();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card
      className={cn(
        'my-2 border-warning/40 bg-warning/5',
        compact && 'py-2',
      )}
      data-approval-id={approvalId}
      data-testid={`tool-approval-${toolName}`}
    >
      <CardContent className={cn('flex flex-col gap-3', compact && 'p-3')}>
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">
              {title ?? `Tool "${toolName}" requires approval`}
            </span>
            <span className="text-xs text-muted-foreground">
              The assistant is asking to run this tool. Review and confirm.
            </span>
          </div>
        </div>

        {!compact && (
          <details className="rounded-md border border-border bg-muted/30 p-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-foreground">
              Input
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-foreground">
              {JSON.stringify(input, null, 2)}
            </pre>
          </details>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeny}
            disabled={submitting !== null}
            icon={
              submitting === 'deny' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )
            }
            data-testid={`tool-approval-deny-${toolName}`}
          >
            Deny
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleApprove}
            disabled={submitting !== null}
            icon={
              submitting === 'approve' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )
            }
            data-testid={`tool-approval-approve-${toolName}`}
          >
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
