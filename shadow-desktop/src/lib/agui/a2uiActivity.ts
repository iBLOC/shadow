import type { A2uiMessage } from '../a2uiProtocol';
import type { AguiEvent } from './types';

/**
 * 官方 AG-UI 承载 A2UI 面的 **activity 类型名**。
 *
 * ⚠️ **真相源**：官方 npm `@ag-ui/a2ui-middleware`（v0.0.16）的
 * `buildLifecycleActivity` —— 它 paint 出来的那条 activity 就是：
 * `{type:"ACTIVITY_SNAPSHOT", messageId:"a2ui-surface-<surfaceId>",
 *   activityType:"a2ui-surface", content:<ops 数组>, replace:true}`
 * ⇒ ⇒ **字面量照抄官方那一处**，不手打、不自造。
 */
export const A2UI_ACTIVITY_TYPE = 'a2ui-surface';

/** 官方 messageId 的前缀（`a2ui-surface-${surfaceId}`）。 */
export const A2UI_ACTIVITY_ID_PREFIX = 'a2ui-surface-';

/** v1.0 的四种消息键（当前规范）。 */
const V1_MESSAGE_KEYS = [
  'createSurface',
  'updateComponents',
  'updateDataModel',
  'deleteSurface',
] as const;

/**
 * 这一条是不是 **v1.0 的 A2UI 消息**（信封：`version:"1.0"` ＋ 四种键之一）。
 *
 * ⚠️ **版本也要对** —— 只看键不看版本 ⇒ ⇒ v0.8 的旧信封会被当成 v1.0
 * ⇒ ⇒ 官方 SDK 拒 ⇒ ⇒ 界面上「什么都没有」。
 */
export function isA2uiV1Operation(value: unknown): value is A2uiMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const op = value as Record<string, unknown>;
  if (op.version !== '1.0') return false;
  return V1_MESSAGE_KEYS.some((key) => key in op);
}

/**
 * 从一条 AG-UI 事件里取出 A2UI 的 ops。
 *
 * ⚠️ **三档各有一档的读数**：
 * · 不是 activity ⇒ `null`（不是我们的活）；
 * · 是 activity 但**不是** `a2ui-surface` ⇒ `null`（别的 activity 不归我们管）；
 * · 是 `a2ui-surface` 但**形状不对** ⇒ ⇒ **抛** ⇒ ⇒ 响亮地拒。
 *
 * ⚠️ 为什么坏形状要抛：静默吞掉 ⇒ ⇒ 界面上「什么都没有」且不报错
 * ⇒ ⇒ **失败长得像成功**（上一刀自曝过三处这种坑）。
 */
export function a2uiOpsFromEvent(event: AguiEvent): A2uiMessage[] | null {
  if (event.type !== 'ACTIVITY_SNAPSHOT') return null;
  const activityType = (event as { activityType?: unknown }).activityType;
  if (activityType !== A2UI_ACTIVITY_TYPE) return null;

  const content = (event as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error(
      'ag-ui a2ui activity carries no operations array (official content is an array of A2UI operations)',
    );
  }
  const ops: A2uiMessage[] = [];
  for (const op of content) {
    if (!isA2uiV1Operation(op)) {
      throw new Error(
        'ag-ui a2ui activity carries an operation that is not an A2UI v1.0 message',
      );
    }
    ops.push(op);
  }
  return ops;
}

/**
 * 一批 ops 里的 surfaceId —— **口径照官方**（`buildLifecycleActivity`
 * 的取法：createSurface ▸ updateComponents ▸ updateDataModel ▸ deleteSurface）。
 */
export function a2uiSurfaceIdOf(ops: readonly A2uiMessage[]): string | null {
  for (const op of ops) {
    for (const key of V1_MESSAGE_KEYS) {
      const body = (op as Record<string, unknown>)[key];
      if (!body || typeof body !== 'object' || Array.isArray(body)) continue;
      const surfaceId = (body as Record<string, unknown>).surfaceId;
      if (typeof surfaceId === 'string' && surfaceId !== '') return surfaceId;
    }
  }
  return null;
}
