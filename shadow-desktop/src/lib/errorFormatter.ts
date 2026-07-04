import type { AppError } from '../stores/errorDialogStore';

/**
 * Format an AppError as plain text for clipboard.
 *
 * The output is designed to be:
 *   - Human-readable (sections, labels)
 *   - Easy to paste into an AI coding tool (Claude, Cursor, etc.)
 *   - Structured enough to grep / parse
 *
 * Output shape:
 *   [Shadow Error] 2026-06-25T10:30:45.123Z
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   Source:     http
 *   Endpoint:   POST http://localhost:8082/v1/chat/completions
 *   Status:     503 Service Unavailable
 *   Message:    HTTP 503: Service Unavailable
 *   UserAgent:  Mozilla/5.0 ...
 *   Stack:
 *     at fetch (prefrontalClient.ts:75)
 *     at processMessage (conversationStore.ts:142)
 */
export function formatErrorForClipboard(error: AppError): string {
  const lines: string[] = [];
  const bar = '━'.repeat(60);

  lines.push(`[Shadow Error] ${error.timestamp}`);
  lines.push(bar);

  lines.push(`Source:     ${error.source}`);

  if (error.endpoint) {
    lines.push(
      `Endpoint:   ${error.method ?? 'GET'} ${error.endpoint}`
    );
  }
  if (error.status !== undefined) {
    const statusLine = `Status:     ${error.status}${
      error.statusText ? ` ${error.statusText}` : ''
    }`;
    lines.push(statusLine);
  }

  lines.push(`Message:    ${error.message}`);

  if (error.userAgent) {
    lines.push(`UserAgent:  ${error.userAgent}`);
  }

  if (error.componentStack) {
    lines.push('');
    lines.push('Component Stack:');
    lines.push(error.componentStack);
  }

  if (error.stack) {
    lines.push('');
    lines.push('Stack:');
    lines.push(error.stack);
  }

  return lines.join('\n');
}
