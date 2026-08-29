import { ToolApprovalCard } from './ToolApprovalCard';
import { ClientToolForm } from './ClientToolForm';
import { ToolOutputCard, type ToolOutputState } from './ToolOutputCard';
import type { ToolUIPart } from './toolPartTypes';

export interface ToolPartRouterProps {
  /**
   * The AI SDK tool UI part. Shape is loose (depends on the AI SDK
   * version) so callers pass it via `as unknown as ToolUIPart`.
   */
  part: ToolUIPart;
  toolName: string;
  input?: Record<string, unknown>;
  /**
   * Field descriptors when the tool expects structured user input.
   * When omitted the form falls back to a single textarea.
   */
  fields?: Parameters<typeof ClientToolForm>[0]['fields'];
  title?: string;
  onApprove?: (approvalId: string) => Promise<void> | void;
  onDeny?: (approvalId: string) => Promise<void> | void;
  onSubmitInput?: (
    toolCallId: string,
    output: Record<string, unknown>,
  ) => Promise<void> | void;
  compact?: boolean;
}

/**
 * Selects which tool-part UI to render based on the AI SDK tool part's
 * current state. Combines ToolApprovalCard, ClientToolForm, and
 * ToolOutputCard into a single switch — consumers just pass the
 * `part` straight through and the router decides which one to show.
 */
export function ToolPartRouter({
  part,
  toolName,
  input,
  fields,
  title,
  onApprove,
  onDeny,
  onSubmitInput,
  compact = false,
}: ToolPartRouterProps) {
  const state = part.state;
  const toolCallId = part.toolCallId;

  // AI SDK puts `approval` info on the part itself when the call is
  // gated. See https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#tool-execution
  const approval = (part as { approval?: { id?: string } }).approval;

  // Awaiting the user's input (client-executed tool).
  if (state === 'input-available' || state === 'input-streaming') {
    return (
      <ClientToolForm
        toolCallId={toolCallId}
        toolName={toolName}
        fields={fields}
        rawInput={input ?? {}}
        title={title}
        compact={compact}
        onSubmit={async (output) => {
          if (onSubmitInput) {
            await onSubmitInput(toolCallId, output);
          }
        }}
      />
    );
  }

  // Awaiting the user's approval (gated execution).
  if (state === 'approval-requested') {
    if (!approval?.id) return null;
    return (
      <ToolApprovalCard
        approvalId={approval.id}
        toolName={toolName}
        input={input ?? {}}
        title={title}
        compact={compact}
        onApprove={() => (onApprove ? onApprove(approval.id!) : undefined)}
        onDeny={() => (onDeny ? onDeny(approval.id!) : undefined)}
      />
    );
  }

  // Tool result is available (success / error / denied / running).
  const outputState = mapToOutputState(state);
  const errorText = (part as { errorText?: string }).errorText;
  const output = (part as { output?: unknown }).output;

  if (outputState === 'running') {
    return (
      <ToolOutputCard
        toolName={toolName}
        toolCallId={toolCallId}
        state="running"
        input={input}
        title={title}
        compact={compact}
      />
    );
  }

  return (
    <ToolOutputCard
      toolName={toolName}
      toolCallId={toolCallId}
      state={outputState}
      input={input}
      output={output}
      errorText={errorText}
      title={title}
      compact={compact}
    />
  );
}

function mapToOutputState(state: unknown): ToolOutputState {
  switch (state) {
    case 'output-available':
      return 'output-available';
    case 'output-error':
      return 'output-error';
    case 'output-denied':
      return 'output-denied';
    case 'running':
      return 'running';
    default:
      return 'output-available';
  }
}
