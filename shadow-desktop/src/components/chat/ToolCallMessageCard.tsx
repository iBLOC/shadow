import { ToolPartRouter } from './ToolPartRouter';
import type { ToolField } from './ClientToolForm';
import type { ToolUIPart } from './toolPartTypes';
import type { ToolCallMessage } from '../../types';

/**
 * Map a client-side tool call onto the AI SDK tool-part shape the
 * existing chat components already speak.
 *
 * Why an adapter instead of a second renderer: `ToolPartRouter` /
 * `ClientToolForm` / `ToolApprovalCard` / `ToolOutputCard` were built
 * for the AI SDK's `UIMessage` parts, but the desktop chat page does
 * **not** run on `useChat` — it consumes the telencephalon SSE stream
 * directly and keeps its own message list. Rather than write a second
 * set of tool cards, we translate the brain's `tool_call` event into
 * the shape those components expect.
 */
export function toToolUIPart(call: ToolCallMessage): ToolUIPart {
  const base = {
    type: 'tool-toolCall',
    toolCallId: call.id,
    input: call.args,
  };

  switch (call.status) {
    case 'pending':
    case 'running':
      return { ...base, state: 'running' };
    case 'awaiting-approval':
      return {
        ...base,
        state: 'approval-requested',
        approval: { id: call.id },
      };
    case 'awaiting-input':
      return { ...base, state: 'input-available' };
    case 'succeeded':
      return { ...base, state: 'output-available', output: call.result };
    case 'failed':
      return { ...base, state: 'output-error', errorText: call.errorText };
  }
}

export interface ToolCallMessageCardProps {
  call: ToolCallMessage;
  /** Field descriptors for tools that collect user input. */
  fields?: ToolField[];
  onApprove?: () => void | Promise<void>;
  onDeny?: () => void | Promise<void>;
  onSubmitInput?: (input: Record<string, unknown>) => void | Promise<void>;
}

/**
 * A client-side tool call rendered in the chat stream.
 *
 * The router picks the surface by state: an approval prompt, an input
 * form, a running card, or the finished result card.
 */
export function ToolCallMessageCard({
  call,
  fields,
  onApprove,
  onDeny,
  onSubmitInput,
}: ToolCallMessageCardProps) {
  return (
    <div className="flex flex-col gap-1">
      <ToolPartRouter
        part={toToolUIPart(call)}
        toolName={call.name}
        input={call.args}
        fields={fields}
        title={call.description ?? call.name}
        onApprove={onApprove ? () => onApprove() : undefined}
        onDeny={onDeny ? () => onDeny() : undefined}
        onSubmitInput={
          onSubmitInput ? (_toolCallId, output) => onSubmitInput(output) : undefined
        }
      />
      {footerText(call) && (
        <div
          className="px-2 text-xs text-muted-foreground"
          data-testid="tool-call-report-status"
        >
          {footerText(call)}
        </div>
      )}
    </div>
  );
}

/**
 * The one-line footer: how long it took, and — more importantly —
 * whether the result actually made it back to the brain.
 */
function footerText(call: ToolCallMessage): string | null {
  switch (call.status) {
    case 'succeeded': {
      const took = call.latencyMs != null ? ` in ${call.latencyMs}ms` : '';
      return call.reported
        ? `done${took} · reported to telencephalon`
        : `done${took} · NOT reported to telencephalon`;
    }
    case 'failed':
      return call.reported
        ? 'failed · reported to telencephalon'
        : 'failed · NOT reported to telencephalon';
    case 'awaiting-approval':
      return 'waiting for your approval';
    case 'awaiting-input':
      return 'waiting for your input';
    default:
      return null;
  }
}
