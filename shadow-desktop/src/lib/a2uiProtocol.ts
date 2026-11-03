/**
 * A2UI 协议栈 —— 桌面端的**纯 TypeScript** 实现。
 *
 * ## 为什么桌面端要自己写一份
 *
 * A2UI 的官方客户端 `genui_a2ui` 是 **Flutter 包**（Dart），而桌面端是
 * React/TS + Tauri —— **进程里没有 Dart 运行时** ⇒ 那套协议栈在桌面端
 * 一行都跑不了（`shadow-desktop/package.json` 里也没有 `genui` 依赖）。
 *
 * ⇒ 桌面端只能自己实现 A2A v0.3 + A2UI 的**线缆协议**。
 * 好消息是面很窄：端脑的 A2UI 产出面一共只吐 **4 种组件**
 * （`telencephalon/src/a2a/a2ui.rs`：`Column` / `Text` / `TaskCard` /
 * `AgentStatusIndicator`）⇒ 协议侧只有「SSE → 组件树」这一条路。
 *
 * ## 这一份文件负责什么
 *
 * **纯协议**：不碰网络、不碰 React、不碰 DOM。
 *   1. `SseDecoder` —— 把字节流切成 SSE 事件；
 *   2. `extractA2uiPayloads` / `extractTextParts` —— 从 A2A 事件里挖载荷；
 *   3. `A2uiSurfaceModel` —— 按 A2UI 语义维护 surface（组件树 + root）。
 *
 * 之所以把它与网络、与 React 拆开：**协议是能被单独测的东西**。
 * 桌面端的测试直接喂真实端脑字节（`shadow/fixtures/a2ui/tasks_sse.txt`）
 * 给这一层，断言的是「协议解析对不对」，而不是「界面碰巧画出来了」。
 *
 * ## ⚠️ 语义要点：`surfaceUpdate` 不等于「可以渲染了」
 *
 * A2UI 的消息顺序是**有语义**的：`surfaceUpdate` 只是**缓存**组件，
 * 必须等 `beginRendering` 到了才真的开始渲染
 * （`genui-0.7.0/lib/src/core/a2ui_message_processor.dart:160-197`）。
 *
 * ⇒ 桌面端照抄这个语义。否则服务端先发 `surfaceUpdate`（组件树）、
 * 后发 `beginRendering`（开场）时，界面会先闪一个「组件还没到齐」的半成品。
 */

/** A2UI 扩展 URI —— 客户端在 `X-A2A-Extensions` 头里声明它。 */
export const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.8';

/** 端脑当前能渲染的视图（与 `telencephalon/src/a2a/a2ui.rs` 的 `KNOWN_VIEWS` 对齐）。 */
export type A2uiView = 'tasks' | 'agents';

/** 组件属性 —— 目录里每个组件的 props 是一个自由形状的 JSON 对象。 */
export type A2uiProps = Readonly<Record<string, unknown>>;

/** 一个 A2UI 组件：`{"id": "root", "component": {"Column": {…}}}`。 */
export interface A2uiComponent {
  readonly id: string;
  /** 恰好一个键 = 组件类型名（`Column` / `Text` / …），值 = 该组件的 props。 */
  readonly component: Readonly<Record<string, A2uiProps>>;
}

/** `surfaceUpdate` —— 把一批组件塞进某个 surface（**只缓存，不渲染**）。 */
export interface A2uiSurfaceUpdatePayload {
  surfaceUpdate: {
    surfaceId: string;
    components: A2uiComponent[];
  };
}

/** `beginRendering` —— 这个 surface 的 root 是谁，**从这一刻起才渲染**。 */
export interface A2uiBeginRenderingPayload {
  beginRendering: {
    surfaceId: string;
    root: string;
  };
}

/** `deleteSurface` —— 这个 surface 没了。 */
export interface A2uiDeleteSurfacePayload {
  deleteSurface: {
    surfaceId: string;
  };
}

/**
 * `dataModelUpdate` —— 数据模型更新。
 *
 * ⚠️ 端脑目前**不发**它（`a2a.rs` 只产 `surfaceUpdate` + `beginRendering`）。
 * 这里仍然认它，是为了客户端别在协议演进时**整个崩掉**。
 */
export interface A2uiDataModelUpdatePayload {
  dataModelUpdate: {
    surfaceId?: string;
    [key: string]: unknown;
  };
}

export type A2uiPayload =
  | A2uiSurfaceUpdatePayload
  | A2uiBeginRenderingPayload
  | A2uiDeleteSurfacePayload
  | A2uiDataModelUpdatePayload;

/** 一个 surface 的快照（给 React 渲染用 —— 不可变）。 */
export interface A2uiSurfaceSnapshot {
  surfaceId: string;
  /** `beginRendering` 指明的根组件 id。没收到 `beginRendering` 时是 undefined。 */
  rootId?: string;
  components: A2uiComponent[];
  /** 是否已经收到 `beginRendering`（= 可以渲染了）。 */
  rendered: boolean;
}

/**
 * 这个 surface **结构上**是空的吗？
 *
 * ## 判据：除 `Column` / `Text` 之外没有别的组件
 *
 * 端脑把「没有内容」画成一个**只有文字的 surface**
 * （`telencephalon/src/a2a/a2ui.rs`：`render_tasks` / `render_agents`
 * 在列表为空时产出 `root`(Column) + `title`(Text) + `empty`(Text)）
 * ⇒ 「有没有内容」这件事**在结构上就是可判的**。
 *
 * ⚠️ **为什么用结构规则，而不是「认识哪些组件名」的白名单**：
 * 白名单版本在端脑**加一种新组件**时（`Timeline` / `Chart` / …）
 * 会把新组件当成「不认识 ⇒ 当作空」⇒ **把有内容的界面说成空的**。
 * ⇒ 规则反过来写：**除布局与文字之外的东西，都是内容**。
 *
 * ⚠️ 这**不是**端脑显式声明的状态（端脑还没那个字段）⇒
 * 这是客户端的**结构推断**；端脑哪天自己声明了，以端脑为准。
 */
export function isStructurallyEmptySurface(
  surface: A2uiSurfaceSnapshot | undefined,
): boolean {
  if (!surface) return true;
  const components = surface.components ?? [];
  return !components.some((component) => {
    const type = Object.keys(component?.component ?? {})[0];
    return type !== 'Column' && type !== 'Text';
  });
}

// ────────────────────────────────────────────────────────────────────
// SSE 解码
// ────────────────────────────────────────────────────────────────────

/**
 * SSE 解码器 —— 把一段一段的文本喂进来，吐出**完整事件**的数据串。
 *
 * ⚠️ 语义照抄 `genui_a2ui-0.7.0/lib/src/a2a/client/sse_parser.dart:29-67`：
 *   - `data:` 开头的行 ⇒ 累积（一个事件可以有多行 data）；
 *   - `:` 开头的行 ⇒ 注释 / keepalive，**忽略**；
 *   - **空行** ⇒ 事件边界 ⇒ 吐出累积的数据；
 *   - 其他行 ⇒ 忽略。
 *
 * ⚠️ 一处**刻意的偏差**：Dart 那版只把「完全空」的行当边界；这里把
 * 「只有空白字符」的行也当边界（`line.trim() === ''`）。
 * 理由：端脑发的是 `\n\n`，而 CRLF 环境下空白行很常见 ⇒ 按 trim 判更耐脏。
 * 这不会把合法事件拆坏（合法行的 `data:` 前缀后面一定有内容）。
 */
export class SseDecoder {
  private buffer = '';
  private dataLines: string[] = [];

  /**
   * 喂一段文本，返回**本次凑齐**的完整事件（每个元素是事件的数据串，
   * 不含 `data:` 前缀）。
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const events: string[] = [];
    for (;;) {
      const idx = this.buffer.indexOf('\n');
      if (idx < 0) break;
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      const event = this.handleLine(line);
      if (event !== null) events.push(event);
    }
    return events;
  }

  /**
   * 流结束时把残留的缓冲吐出来。
   *
   * ⚠️ 需要它，是因为有些服务端**最后一个事件后面不发空行**就断开连接
   * ⇒ 数据还卡在 `buffer` 里。不 flush 就会**静默丢掉最后一个事件**。
   */
  flush(): string[] {
    const events: string[] = [];
    if (this.buffer.length > 0) {
      const line = this.buffer.replace(/\r$/, '');
      this.buffer = '';
      const event = this.handleLine(line);
      if (event !== null) events.push(event);
    }
    const tail = this.takeEvent();
    if (tail !== null) events.push(tail);
    return events;
  }

  private handleLine(line: string): string | null {
    if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).trim());
      return null;
    }
    if (line.startsWith(':')) return null; // 注释 / keepalive
    if (line.trim() === '') return this.takeEvent(); // 事件边界
    return null; // 其他行忽略
  }

  private takeEvent(): string | null {
    if (this.dataLines.length === 0) return null;
    const payload = this.dataLines.join('\n');
    this.dataLines = [];
    return payload.length > 0 ? payload : null;
  }
}

// ────────────────────────────────────────────────────────────────────
// A2A 事件 → A2UI 载荷
// ────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 这个对象像不像一个 A2UI 载荷？ */
export function isA2uiPayload(value: unknown): value is A2uiPayload {
  if (!isRecord(value)) return false;
  return (
    'surfaceUpdate' in value ||
    'beginRendering' in value ||
    'deleteSurface' in value ||
    'dataModelUpdate' in value
  );
}

/**
 * 从一个 A2A 事件里挖出 A2UI 载荷。
 *
 * ## 载荷在哪儿
 *
 * A2A v0.3 的事件长这样：
 * ```
 * { "result": { "kind": "task-status-update",
 *               "status": { "message": { "parts": [ { "kind": "data",
 *                                                    "data": { …载荷… } } ] } } } }
 * ```
 * ⇒ 路径是 `result.status.message.parts[]` 里 `kind === "data"` 的那些 part。
 *
 * ⚠️ **外面那层 `result` 不能省** —— 少了它整个事件会被**静默丢弃**
 * （Dart 那边的解析器只认带 `result` 的 JSON：
 * `sse_parser.dart:45-49`）。这一层跟客户端实现保持一致。
 */
export function extractA2uiPayloads(json: unknown): A2uiPayload[] {
  const out: A2uiPayload[] = [];
  for (const part of messageParts(json)) {
    if (part.kind !== 'data') continue;
    const data = part.data;
    if (isA2uiPayload(data)) out.push(data);
  }
  return out;
}

/**
 * 从一个 A2A 事件里挖出**纯文本**回复。
 *
 * ⚠️ 端脑在「这次请求没有可渲染的视图」时会回一段纯文本
 * （`a2ui_gateway.rs` 的 `text_reply` ⇒ `parts[].kind === "text"`），
 * 告诉客户端「我能给你看什么」。桌面端得把它显示出来 ——
 * 否则用户看到的是一个**空面板**，分不清是「没数据」还是「出错了」。
 */
export function extractTextParts(json: unknown): string[] {
  const out: string[] = [];
  for (const part of messageParts(json)) {
    if (part.kind !== 'text') continue;
    if (typeof part.text === 'string' && part.text.trim() !== '') {
      out.push(part.text);
    }
  }
  return out;
}

/** JSON-RPC 层的错误（`{"error": {...}}`）。 */
export function extractJsonRpcError(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const error = json.error;
  if (!isRecord(error)) return null;
  const code = error.code;
  const message = typeof error.message === 'string' ? error.message : '未知错误';
  return code === undefined ? message : `[${String(code)}] ${message}`;
}

interface MessagePart {
  kind: string;
  text?: unknown;
  data?: unknown;
}

/** 取 `result.status.message.parts[]`。取不到就返回空数组（不抛）。 */
function messageParts(json: unknown): MessagePart[] {
  if (!isRecord(json)) return [];
  const result = json.result;
  if (!isRecord(result)) return [];
  const status = result.status;
  if (!isRecord(status)) return [];
  const message = status.message;
  if (!isRecord(message)) return [];
  const parts = message.parts;
  if (!Array.isArray(parts)) return [];

  const out: MessagePart[] = [];
  for (const part of parts) {
    if (!isRecord(part)) continue;
    out.push({
      kind: typeof part.kind === 'string' ? part.kind : '',
      text: part.text,
      data: part.data,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Surface 模型
// ────────────────────────────────────────────────────────────────────

interface SurfaceState {
  components: Map<string, A2uiComponent>;
  rootId?: string;
  rendered: boolean;
}

/**
 * A2UI 的 surface 集合。
 *
 * ## 为什么要有「模型」这一层
 *
 * 因为 A2UI 的一个界面是**分多条消息**到的：`surfaceUpdate`（组件）先到，
 * `beginRendering`（开场）后到。React 组件直接拿原始消息列表渲染 ⇒ 每次
 * 都要自己判断「齐了吗」⇒ 同一个判断会在三个地方各写一遍、各错一遍。
 *
 * ⇒ 模型层负责「齐了没有」，组件层只管画。
 */
export class A2uiSurfaceModel {
  private readonly surfaces = new Map<string, SurfaceState>();

  /** 把一个 A2UI 载荷吃进来。 */
  applyPayload(payload: A2uiPayload): void {
    if ('surfaceUpdate' in payload) {
      const { surfaceId, components } = payload.surfaceUpdate;
      const state = this.ensure(surfaceId);
      for (const component of components) {
        if (!component?.id) continue;
        state.components.set(component.id, component);
      }
      return;
    }
    if ('beginRendering' in payload) {
      const { surfaceId, root } = payload.beginRendering;
      const state = this.ensure(surfaceId);
      state.rootId = root;
      state.rendered = true;
      return;
    }
    if ('deleteSurface' in payload) {
      this.surfaces.delete(payload.deleteSurface.surfaceId);
      return;
    }
    // `dataModelUpdate` —— 端脑目前不发；留着是为了协议演进时别整个崩掉。
  }

  /** 吃一个 A2A 事件（JSON）。返回这次吃到的 A2UI 载荷。 */
  applyEvent(json: unknown): A2uiPayload[] {
    const payloads = extractA2uiPayloads(json);
    for (const payload of payloads) this.applyPayload(payload);
    return payloads;
  }

  private ensure(surfaceId: string): SurfaceState {
    let state = this.surfaces.get(surfaceId);
    if (!state) {
      state = { components: new Map(), rendered: false };
      this.surfaces.set(surfaceId, state);
    }
    return state;
  }

  /** 取一个 surface 的快照（不可变）。 */
  get(surfaceId: string): A2uiSurfaceSnapshot | undefined {
    const state = this.surfaces.get(surfaceId);
    if (!state) return undefined;
    return {
      surfaceId,
      rootId: state.rootId,
      components: [...state.components.values()],
      rendered: state.rendered,
    };
  }

  /** 所有 surface 的 id。 */
  get surfaceIds(): string[] {
    return [...this.surfaces.keys()];
  }

  /**
   * **可以渲染**的 surface（`beginRendering` 到了的）。
   *
   * ⚠️ 这是 `surfaceUpdate` / `beginRendering` 两段式语义的关键落点：
   * 没收到 `beginRendering` 的 surface **不在这张表里** ⇒ 界面不会画出半成品。
   */
  get renderableSurfaces(): A2uiSurfaceSnapshot[] {
    const out: A2uiSurfaceSnapshot[] = [];
    for (const surfaceId of this.surfaces.keys()) {
      const snapshot = this.get(surfaceId);
      if (snapshot?.rendered) out.push(snapshot);
    }
    return out;
  }
}

/**
 * 从一组 A2A 事件建出**第一块可渲染的 surface**（没有就 `null`）。
 *
 * ## 为什么要有这个函数
 *
 * A2UI 的事件现在有**两条消费路径**：
 *
 * ① 「面板」那条 —— `A2uiPanel` 自己解析 `/a2a` 的事件；
 * ② 「**对话里内联**」那条 —— 客户端工具 `show_a2ui_surface`
 *    （模型在对话中点名要界面 ⇒ 设备取回 surface ⇒ 画在**消息里**）。
 *
 * ⇒ 两边吃的是**同一批事件** ⇒ ⇒ 「事件 → snapshot」这件事
 * **只该有一处实现** ⇒ ⇒ 两边都调它 ⇒ ⇒ 免得「面板对、内联不对」。
 */
export function buildSurfaceFromEvents(
  events: readonly unknown[],
): A2uiSurfaceSnapshot | null {
  const model = new A2uiSurfaceModel();
  for (const event of events) model.applyEvent(event);
  return model.renderableSurfaces[0] ?? null;
}
