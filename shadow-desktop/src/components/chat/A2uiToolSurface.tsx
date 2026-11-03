import { useMemo } from 'react';

import { buildSurfaceFromEvents } from '../../lib/a2uiProtocol';
import { A2uiSurface } from './A2uiSurface';

/**
 * 从工具结果里取出 **A2UI 事件**（没有就 `null`）。
 *
 * ## 契约在哪定
 *
 * 客户端工具 `show_a2ui_surface` 执行完返回：
 * `{ report: "<给模型看的一句话>", a2ui_events: [<A2A 事件…>] }`
 * ⇒ ⇒ **事件那一半给界面**，`report` 那一半**给模型**。
 *
 * ⚠️ 移动端同一份契约（`shadow-mobile/lib/services/client_tools/client_tool_registry.dart`）
 * ⇒ ⇒ 两端**逐字一致** ⇒ ⇒ 改一处就要改另一处。
 */
/**
 * 从工具结果里取出 **给模型看的那一句话**（`report`）。
 *
 * ⚠️ **为什么界面要读它**：结果卡片（`ToolOutputCard`）会把 `output`
 * 原样渲染 ⇒ ⇒ 如果把整个结果（`report` + `a2ui_events`）丢进去 ⇒
 * 用户看到的是**一坨协议 JSON** ⇒ ⇒ 而界面那一半**已经画成图了**。
 * ⇒ ⇒ 卡片只显示这句话（人话），事件交给上面的内联界面。
 *
 * ⚠️ **取不到就返回 null**（不编一句）⇒ ⇒ 调用方自己决定「不显示」。
 */
export function a2uiReport(result: unknown): string | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const report = (result as { report?: unknown }).report;
  if (typeof report !== 'string' || report.trim() === '') return null;
  return report;
}

export function a2uiEvents(result: unknown): readonly unknown[] | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const events = (result as { a2ui_events?: unknown }).a2ui_events;
  if (!Array.isArray(events) || events.length === 0) return null;
  return events as readonly unknown[];
}

/**
 * **消息里内联的 A2UI 界面**。
 *
 * ⚠️ 与顶部那块 `A2uiPanel` 是**两件事**：
 *
 * - 面板 = 「用户主动打开的看板」（上面那块，随时能开）；
 * - 这里 = 「**模型在这一轮里点名要画的界面**」⇒ ⇒ 位置在**消息流里**
 *   ⇒ ⇒ 用户往回翻还能看见它 ⇒ ⇒ 而不是切走就没了。
 */
export function A2uiToolSurface({ events }: { events: readonly unknown[] }) {
  const surface = useMemo(() => buildSurfaceFromEvents(events), [events]);

  // ⚠️ 没收到 `beginRendering` ⇒ 半成品 ⇒ **不画**（与面板那条路同一套语义）。
  if (!surface) return null;

  return (
    <div
      className="rounded-lg border border-border bg-card/40 p-3"
      data-testid="a2ui-inline-surface"
    >
      <A2uiSurface surface={surface} />
    </div>
  );
}
