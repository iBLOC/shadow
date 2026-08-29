/**
 * Type alias for an AI SDK tool UI part. We deliberately use a structural
 * type rather than importing from `@ai-sdk/ui-utils` because the AI SDK
 * UI helpers are an optional peer dependency and the part shape varies
 * slightly across versions.
 *
 * Consumers are expected to pass `part` from a `useChat` message via
 * `as unknown as ToolUIPart` so the exact runtime shape is preserved
 * while our router can still introspect it.
 */
export interface ToolUIPart {
  type: string;
  toolCallId: string;
  state:
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied'
    | 'running'
    | string;
  /** Optional approval metadata when the call is gated. */
  approval?: { id?: string; approved?: boolean; reason?: string };
  /** Tool input — populated after `input-streaming` finishes. */
  input?: unknown;
  /** Tool output — present on `output-available`. */
  output?: unknown;
  /** Optional human-readable error message on `output-error`. */
  errorText?: string;
}
