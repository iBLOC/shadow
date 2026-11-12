import { ToolPartRouter } from './ToolPartRouter';
import { A2uiToolSurface, a2uiEvents, a2uiReport } from './A2uiToolSurface';
import { imageAttachmentsOf } from '../../lib/clientTools';
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
export function toToolUIPart(
  call: ToolCallMessage,
  /**
   * 覆盖「结果」那一份。
   *
   * ⚠️ **为什么要能覆盖**：原始执行结果里可能有**不该给人看的原始字节**
   * （A2UI 事件 JSON）⇒ ⇒ 「界面要显示的那份」与「执行结果」**不是同一件事**。
   * 用 `{ value }` 包一层 ⇒ ⇒ 「没传」与「传了 undefined」能分开。
   */
  output?: { value: unknown },
): ToolUIPart {
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
      return {
        ...base,
        state: 'output-available',
        output: output ? output.value : call.result,
      };
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
  // ⚠️ **A2UI 内联** —— 工具结果里带了 A2UI 事件 ⇒ ⇒ 界面就画在**这条消息里**
  // （不是顶部面板、不是另一个页面）⇒ ⇒ 用户往回翻还能看见它。
  const inlineEvents = a2uiEvents(call.result);

  // ⚠️ **图片内联** —— generate_image 的结果里带了 base64 图片 ⇒ ⇒ 同样画在
  // **这条消息里**（用户往回翻还能看见）；base64 本身**不许**再进输出卡片
  // （几百 KB 的字节甩在用户脸上 = 一坨协议字节）。
  const images = imageAttachmentsOf(call.result);

  // ⚠️ **结果卡片只显示 `report` 那一句** —— 事件／图片那几半**已经画出来**了；
  // 再把原始 JSON 一并甩出来 ⇒ 用户看到的是一坨协议字节（而不是人话）。
  const report = a2uiReport(call.result);
  const displayOutput =
    (inlineEvents || images.length > 0) && report ? { value: report } : undefined;

  return (
    <div className="flex flex-col gap-1">
      {inlineEvents ? <A2uiToolSurface events={inlineEvents} /> : null}
      {images.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="tool-call-images">
          {images.map((img, i) => (
            <img
              key={i}
              src={img.url}
              alt={img.size ? `generated image (${img.size})` : 'generated image'}
              className="max-h-96 w-auto max-w-full rounded-md border border-border"
            />
          ))}
        </div>
      ) : null}
      <ToolPartRouter
        part={toToolUIPart(call, displayOutput)}
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
