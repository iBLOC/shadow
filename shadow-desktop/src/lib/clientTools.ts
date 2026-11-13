import { useThemeStore } from '../stores/themeStore';
// ⚠️ **为什么 lib 层要 i18n** ——
// ① `show_a2ui_surface` 的 `report` 那一句**用户看得见**（结果卡片会渲染它）
//    ⇒ ⇒ 它必须走**真的** i18n（`src/i18n/*.json`）
//    ⇒ ⇒ 不能在 lib 里另抄一份字典（两份迟早漂 ⇒ 漂了就是「英文用户看到中文」）；
// ② 这个文件本来就直接用**全局 store**（`useThemeStore`）
//    ⇒ ⇒ 拿全局 i18n 实例是同一层级的依赖，不是破例。
//
// ⚠️ **为什么 import 的是 `../i18n/core` 而不是 `../i18n`** ——
// `../i18n` 那一侧带 **React 绑定**（`initReactI18next`）⇒ ⇒ lib 被拖上 React
// ⇒ ⇒ 而测试里 **35 个文件各自 mock 了一份 react-i18next**（多数**没有**
// `initReactI18next`）⇒ ⇒ 谁 import 谁炸（模块加载即失败）。
// `core` 是**同一个实例**、只是不带 React（见 `src/i18n/core.ts` 的文件头）。
import { ensureI18n } from '../i18n/core';
import { telencephalonClient } from './telencephalonClient';
import { safeInvokeOrThrow } from './tauriSafe';
import {
  describeDisposition,
  formatCuError,
  isCuErrorPayload,
  type CuDisposition,
  type CuOutcome,
} from './cuErrors';
import { requestA2uiSurface } from './a2uiClient';
import { buildSurfaceFromEvents } from './a2uiProtocol';
import type { ToolField } from '../components/chat/ClientToolForm';
import type { OpenAiTool, ToolParameters } from './telencephalonClient';

/**
 * **客户端工具** —— 在**用户这台设备上**执行的那一半。
 *
 * 端脑的 `tool_call` SSE 事件带着工具名和参数。工具分两种：
 * - **端脑本地工具**（`telencephalon::tools`）：改端脑自己的状态；
 * - **客户端工具**（本文件）：改**用户眼前这台设备**的状态 —— 主题色、
 *   明暗、窗口、剪贴板、通知。
 *
 * 客户端执行完把结果回传端脑（`telencephalonClient.reportToolResult`），
 * 端脑再把结果喂回模型 —— 这一整条闭环就是「模型自己让客户端换主题」。
 *
 * 与移动端的关系：两端各有一份注册表，因为**能做什么由设备决定**
 * —— 手机没有窗口可最小化，桌面端没有麦克风权限可申请。
 */
export interface ClientTool {
  /** 工具名 —— 端脑点名用的那一个。 */
  name: string;

  /** 一句话说明这个工具干什么（显示在卡片上）。 */
  description: string;

  /** 要用户点头才执行吗？ */
  requiresApproval?: boolean;

  /**
   * 要用户先补输入才执行吗？
   *
   * 为 true 时客户端先渲染一个表单（`ClientToolForm`），拿到用户填的
   * 内容再执行 —— 字段声明在 [fields] 里；留空则退回单个文本框。
   */
  collectsInput?: boolean;

  /** 表单字段声明（`collectsInput` 为 true 时用）。 */
  fields?: ToolField[];

  /**
   * 参数的 **JSON Schema** —— **告诉模型这个工具吃什么**。
   *
   * 没有它，模型只知道有 `set_theme` 这个工具，不知道它要一个 `color`
   * 还是 `dark` ⇒ 只能瞎猜，或者干脆不调。
   *
   * ⚠️ **和 [fields] 不是一回事**：`fields` 描述的是**输入框**（UI 变体），
   * 这里描述的是**参数**（JSON Schema）。两个都要有，各管各的。
   */
  parameters?: ToolParameters;

  /**
   * 真正干活的地方。**抛异常 = 执行失败**（错误会回传给端脑，
   * 这样模型知道自己这条路走不通，而不是卡在等结果上）。
   */
  execute(
    args: Record<string, unknown>,
    ctx: ClientToolContext,
  ): Promise<unknown>;
}

/** 执行客户端工具时需要的东西。 */
export interface ClientToolContext {
  /** 用户在表单里填的内容（没有表单就是 undefined）。 */
  input?: Record<string, unknown>;
}

/** 客户端工具注册表 —— 工具名 → 工具。 */
export class ClientToolRegistry {
  private readonly tools = new Map<string, ClientTool>();

  register(tool: ClientTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  lookup(name: string): ClientTool | undefined {
    return this.tools.get(name);
  }

  supports(name: string): boolean {
    return this.tools.has(name);
  }

  get names(): string[] {
    return [...this.tools.keys()];
  }
}

/**
 * 一份工具结果有**两个读者**：**界面**（要整棵组件树）与**模型**（要一句话）。
 *
 * ⚠️ 把组件树原样喂回模型 ⇒ 模型上下文被一堆 JSON 淹了 ⇒ ⇒
 * 这里只把 `report` 那一句交出去 ⇒ ⇒ 界面那份仍然完整。
 *
 * ⚠️ 没有 `report` 的工具**原样回传**（别把别人的结果改形状）。
 */
export function pickReportPayload(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const report = (result as { report?: unknown }).report;
    if (typeof report === 'string' && report.trim() !== '') {
      return { report };
    }
  }
  return result;
}

/** 图片生成工具（`generate_image`）执行结果里的**一张图片附件**。 */
export interface GeneratedImageAttachment {
  /** data URL（`data:image/png;base64,…`）—— 直接给 `<img src>` 用。 */
  url: string;
  /** `"WxH"`（端脑回的实际尺寸；拿不到就空串）。 */
  size: string;
}

/**
 * 从工具执行结果里抽**图片附件**（`{ images: [{ b64, size, mime? }] }`）。
 *
 * ⚠️ **shape 是两端共用的契约**（桌面 `ToolCallMessageCard` 与移动
 * `tool_call_card` 都吃它）⇒ ⇒ 改这里必须连移动端一起改
 * （`check-client-tools.mjs` 盯的是参数表，渲染形状靠这条注释守）。
 *
 * ⚠️ 认不出的条目**跳过**（不抛）—— 一张坏图不该把整块结果画崩。
 */
export function imageAttachmentsOf(result: unknown): GeneratedImageAttachment[] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const images = (result as { images?: unknown }).images;
  if (!Array.isArray(images)) return [];
  const out: GeneratedImageAttachment[] = [];
  for (const item of images) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const b64 = (item as { b64?: unknown }).b64;
    if (typeof b64 !== 'string' || b64 === '') continue;
    const mimeRaw = (item as { mime?: unknown }).mime;
    const mime = typeof mimeRaw === 'string' && mimeRaw !== '' ? mimeRaw : 'image/png';
    const sizeRaw = (item as { size?: unknown }).size;
    const size = typeof sizeRaw === 'string' ? sizeRaw : '';
    out.push({ url: `data:${mime};base64,${b64}`, size });
  }
  return out;
}

/**
 * 端脑 `tool_call.args` 的线上形态有**两种**，必须都认：
 * - **字符串**（JSON 文本）—— 端脑的 `TelencephalonStreamEvent::ToolCall`
 *   里 `args: String`，serde 序列化出来就是一段 JSON 文本；
 * - **对象** —— 有些路径传的是已经拆好的 map。
 *
 * 认错的后果很具体：拿到字符串还当对象用 ⇒ 参数全是空的，
 * 「把主题换成靛蓝」会退化成「换成默认色」，而且**看不出哪里错了**。
 */
export function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return {};
    try {
      const decoded = JSON.parse(text);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        return decoded as Record<string, unknown>;
      }
      return { value: decoded };
    } catch {
      // 不是 JSON —— 当成纯文本参数，别把整个调用丢掉。
      return { value: text };
    }
  }
  return { value: raw };
}

/**
 * 把 `#RRGGBB` / `RRGGBB` / `#AARRGGBB` 归一成 `#RRGGBB`。
 *
 * 认不出的颜色名**不猜** —— 猜错一次，用户看到的主题色就和模型说的
 * 完全不是一回事，而模型以为自己成功了。
 */
export function parseHexColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  if (text.startsWith('#')) text = text.slice(1);
  if (text.length === 8) text = text.slice(2); // #AARRGGBB → #RRGGBB（**丢的是 alpha**）
  if (text.length !== 6) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
  return `#${text.toUpperCase()}`;
}

/**
 * 把注册表导成 OpenAI 的 `tools` 数组 —— **发给模型的那一份**。
 *
 * 端脑把它透传给 LLM；模型决定调某个工具时，端脑再把 `tool_call` 事件
 * 发回这台设备 ⇒ 这就是「模型自己让客户端换主题」的**起点**。
 *
 * ⚠️ **两端（桌面端 / 移动端）的同名工具必须导出同样的内容** ⇒ 不然同一个
 * 模型在手机上和桌面上行为不一样（「模型让手机换主题」换出来的颜色和桌面端
 * 对不上）。
 *
 * 没有 `parameters` 的工具 ⇒ 参数表是空的 ⇒ 模型只能不带参数调它 ⇒ 工具
 * 自己会明确失败（不默默什么也不做）。
 */
export function toOpenAiTools(registry: ClientToolRegistry): OpenAiTool[] {
  return registry.names.map((name) => {
    const tool = registry.lookup(name)!;
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? { type: 'object', properties: {} },
      },
    };
  });
}


/**
 * computer-use 的**客户端工具** —— 让模型能在这台设备上「看」和「动」。
 *
 * ## 为什么走「客户端工具」这条路，而不是另开一个 MCP 面
 *
 * 端脑早就有一条**闭环**：桌面端把 `toOpenAiTools(desktopClientTools)`
 * 交给模型 ⇒ 模型点名 ⇒ 端脑发 `tool_call` SSE ⇒ **这台设备执行**
 * ⇒ 结果回传端脑喂回模型（见 `aiSdkTelencephalonTransport.ts` 与
 * `ConversationPage` 的 `runClientToolCall`）⇒ ⇒
 * ⇒ ⇒ 所以 computer-use 只要**注册进这张表**，agent 立刻就调得到
 * ⇒ ⇒ **不必**新造一个 MCP server ＋ 一套注册流程。
 *
 * ## 为什么只暴露「语义」那四个，不暴露坐标点击
 *
 * ❶ `cu_mouse_click(x, y)` 是**盲点击** —— 模型看不到屏幕 ⇒ ⇒ 点下去
 *    命中什么全凭猜 ⇒ ⇒ 与 agent-desktop 的做法相反（它用无障碍树
 *    给出**可寻址的元素**，而不是给坐标）。
 * ❷ 本仓的 UIA 侧虽然浅（只列根的直接子元素 ＋ 按 Name 子串找），
 *    但**返回的是文本** ⇒ ⇒ 模型看得懂 ⇒ ⇒ 于是「先看元素、再按名字点」
 *    这条路**今天就能用** ⇒ ⇒ 坐标那套**先不暴露**（等有像素/无障碍
 *    观察面再说）⇒ ⇒ 这是**故意不暴露**，不是漏了。
 *
 * ## 失败必须带「投递判定」
 *
 * 失败可能意味着「什么都没发生」（可重试）或「可能已经落地」（重试会
 * 重复生效）⇒ ⇒ 只回一句错误文本 ⇒ ⇒ 模型会盲重试 ⇒ ⇒
 * ⇒ 所以这里把 `disposition` 一起带回去（见 `cuErrors.ts`）。
 */

/** 投递判定缺失时的**保守**取值：不知道 ⇒ ⇒ 不许说「没落地」。 */
const UNKNOWN_DISPOSITION: CuDisposition = {
  delivery: 'delivery_uncertain',
  retry: 'unsafe',
}

/** 一个 UI 元素（与 Rust 侧 `UiElement` 一一对应）。 */
interface CuUiElement {
  name: string
  automation_id: string
  control_type: string
  class_name: string
  x: number
  y: number
  width: number
  height: number
}

/** 必填参数缺失 ⇒ ⇒ **明确失败**（不许默默什么都不做）。 */
function requireString(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`computer-use: "${field}" is required (a non-empty string)`)
  }
  return raw
}

/** 调一条 `cu_*` 命令 ⇒ ⇒ **成功与失败都带形状**。 */
async function runCu(
  action: string,
  command: string,
  args: Record<string, unknown>,
): Promise<{ action: string; disposition: CuDisposition }> {
  try {
    const outcome = await safeInvokeOrThrow<CuOutcome>(command, args)
    return {
      action,
      disposition: outcome?.disposition ?? UNKNOWN_DISPOSITION,
    }
  } catch (e) {
    if (isCuErrorPayload(e)) {
      // 结构化失败 ⇒ ⇒ 判定就在里头 ⇒ ⇒ 原样带出去。
      throw new Error(
        `computer-use ${action} failed [${e.code}]: ${e.message} — ${describeDisposition(e.disposition)}`,
      )
    }
    // 环境级失败（web build 没有 Tauri／命令不存在）⇒ ⇒ **不知道有没有落地**
    // ⇒ ⇒ 保守地说「不确定」，**不许**说「没落地」。
    throw new Error(
      `computer-use ${action} failed: ${formatCuError(e)} — delivery unknown (retry unsafe)`,
    )
  }
}

/** 把元素清单压成给模型看的一行行文本（有上限，别把上下文淹了）。 */
function describeElements(elements: CuUiElement[]): string {
  const lines = elements.map((el, i) => {
    const name = el.name?.trim() || '(no name)'
    const id = el.automation_id ? ` #${el.automation_id}` : ''
    const rect = `@${el.x},${el.y} ${el.width}x${el.height}`
    return `${i}: [${el.control_type}] ${name}${id} ${rect}`
  })
  const text = lines.join('\n')
  return text.length > 3000 ? `${text.slice(0, 3000)}\n…(truncated)` : text
}

/** 快照里的一个节点（与 Rust 侧 `UiNode` 一一对应）。 */
interface CuUiNode {
  ref_id: string
  role: string
  name: string
  automation_id: string
  x: number
  y: number
  width: number
  height: number
  depth: number
  actions: string[]
  /**
   * 这个节点**能不能被寻址**（有身份 ＋ 树上唯一）。
   *
   * ⚠️ **故意是可选的，而且「缺」＝ 不可寻址**（fail-closed）⇒ ⇒
   * 后端少给一个字段 ⇒ ⇒ 前端当它不可用 ⇒ ⇒ 不许拿「不知道」当「可以」。
   */
  addressable?: boolean
}

/** 一次 UIA 树快照。 */
interface CuUiSnapshot {
  snapshot_id: string
  nodes: CuUiNode[]
  complete: boolean
  truncated_by: string | null
  /** 这次快照的**作用域**：「focused-window」｜「desktop」。 */
  scope?: string
}

/** 把快照压成给模型看的一行行文本（**ref 必须在里面** —— 那是动作的地址）。 */
function describeNodes(nodes: CuUiNode[]): string {
  const lines = nodes.map((n) => {
    const name = n.name?.trim() || '(no name)'
    const acts = n.actions?.length ? ` (${n.actions.join(',')})` : ''
    // ⚠️ **automation_id 要列出来** —— 「可寻址」的判据之一就是
    // 「同名同角色但开发者 id 不同」⇒ ⇒ 模型得**看得见**这个 id
    // 才分得清哪个才是它要点的那一个。
    const aid = n.automation_id ? ` #${n.automation_id}` : ''
    // ⚠️ **不可寻址的 ref 必须标出来** —— 「捕获时唯一性证明」那一刀
    // （匿名元素／树上不唯一 ⇒ ⇒ 那个 ref 一律不许动作）⇒ ⇒
    // 模型看不见这个标记就会去用一个根本不该动的 ref ⇒ ⇒ 命令拒它
    // ⇒ ⇒ 模型白跑一趟 ⇒ ⇒ 所以标记要**紧挨着 ref**。
    // ⚠️ **缺 addressable 字段 ⇒ ⇒ 当成不可寻址**（fail-closed）。
    const flag = n.addressable === true ? '' : ' ⚠不可寻址'
    return `${n.ref_id}${flag} [${n.role}] ${name}${aid} @${n.x},${n.y} ${n.width}x${n.height}${acts}`
  })
  const text = lines.join('\n')
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…(truncated)` : text
}

/** 调一条**只读**的 `cu_*` 命令（不发任何输入 ⇒ 失败一律 not_delivered）。 */
async function runCuRead<T>(
  action: string,
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  try {
    return await safeInvokeOrThrow<T>(command, args)
  } catch (e) {
    if (isCuErrorPayload(e)) {
      throw new Error(
        `computer-use ${action} failed [${e.code}]: ${e.message} — ${describeDisposition(e.disposition)}`,
      )
    }
    throw new Error(`computer-use ${action} failed: ${formatCuError(e)}`)
  }
}

/**
 * **出图是枕叶的活**（端脑的叶区占位记录里，枕叶管「视觉处理」）。
 *
 * ⚠️ 端脑**没有**「会话 → 叶区」那张映射 ⇒ ⇒ 叶区只能由调用方直说；
 * 不说 ⇒ 用户配的枕叶 `image_gen` 覆盖永远不生效（「存得进去、用不了」）。
 */
const IMAGE_LOBE = 'occipital';

/**
 * 桌面端内置的客户端工具。
 *
 * 主题色的两端色调由 `styles/accent.g.ts` 的 `deriveAccentTones` 派生
 * （与移动端 `app_colors.dart` 同一套算法）：两端算出来的明暗两端色调
 * 必须一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。
 */
export const desktopClientTools = new ClientToolRegistry()
  .register({
    name: 'set_theme',
    description: 'Change the app theme colour',
    // **参数声明（给模型看的那一份）** —— 没有它，模型不知道这个工具
    // 要一个 `color` 还是 `dark` ⇒ 只能瞎猜。
    //
    // 两个参数都**不是必填**：`color` 和 `dark` 给哪个都算一次合法调用，
    // 两个都不给时工具**明确失败**（不默默什么也不做）。
    parameters: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description:
            'Hex colour in #RRGGBB form, e.g. #4F46E5. Use this to change the accent colour.',
        },
        dark: {
          type: 'boolean',
          description:
            'true = switch to dark mode, false = switch to light mode. Use this when the user only asks for light/dark.',
        },
      },
    },
    execute: async (args) => {
      const color = parseHexColor(args.color);
      if (color) {
        useThemeStore.getState().setAppearance({ accentSeed: color });
        return { applied: 'accent', color };
      }

      const dark = args.dark;
      if (typeof dark === 'boolean') {
        useThemeStore.getState().setTheme(dark ? 'dark' : 'light');
        return { applied: 'mode', dark };
      }

      // 参数认不出来 ⇒ 明确失败，别默默什么也不做。
      throw new Error('set_theme expects "color" (#RRGGBB) or "dark" (boolean)');
    },
  })
  .register({
    name: 'ask_user',
    description: 'Ask the user a question and wait for their answer',
    // 模型反问用户 —— 用户填完，答案回传端脑，模型接着说。
    collectsInput: true,
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user.',
        },
      },
      required: ['question'],
    },
    execute: async (args, ctx) => {
      const question = typeof args.question === 'string' ? args.question : '';
      const raw = ctx.input?.value ?? ctx.input?.answer;
      const answer = typeof raw === 'string' ? raw : '';
      return { question, answer };
    },
  })
  .register({
    name: 'show_a2ui_surface',
    description:
      'Show the user a generated interface inside the conversation (task board or agent list). Use it when the user asks to SEE their tasks or agents instead of listing them as text.',
    // ⚠️ **参数声明要给模型看** —— 没有它，模型不知道要一个 `view`
    // ⇒ 只能瞎猜，或者干脆不调。
    parameters: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['tasks', 'agents'],
          description:
            "Which interface to draw: 'tasks' = the task board, 'agents' = the registered agent list.",
        },
      },
      required: ['view'],
    },
    execute: async (args) => {
      // ⚠️ **确保 i18n 已初始化** —— 否则 `t()` 会退化成**返回 key**
      // （界面看着有字，其实全是 `a2ui.surfaceDrawn` 这种占位串）。
      const i18n = ensureI18n();
      // ⚠️ **认不出的 view 当 tasks** —— 模型偶尔会瞎填；
      // 宁可画错一块看板，也不要让这一轮失败。
      const view = args.view === 'agents' ? 'agents' : 'tasks';
      const result = await requestA2uiSurface({
        baseUrl: telencephalonClient.getBaseUrl(),
        apiKey: telencephalonClient.getApiKey(),
        view,
        // ⚠️ **界面文案随用户的语言走** —— 端脑据此挑中文/英文界面
        // （真相源在服务端：`telencephalon/src/a2a/a2ui_i18n.rs`）。
        locale: i18n.language,
      });

      // ⚠️ **判据是「画出来没有」，不是「有没有事件」** ——
      // 端脑只回纯文本时**也有事件**（那条 text 事件）⇒
      // 拿「事件数 > 0」当判据 ⇒ 「没画界面」会被说成「已展开」
      // ⇒ ⇒ **失败长得像成功**。
      //
      // 「画出来没有」由**协议层**判（`buildSurfaceFromEvents` ⇒ 有没有收到
      // `beginRendering`）⇒ ⇒ 与面板那条路**同一套判据**（一处实现）。
      const surface = buildSurfaceFromEvents(result.events);
      const words = result.texts.join(' ').trim();

      if (!surface) {
        // ⚠️ **没画出来 ⇒ 如实说** —— 端脑这次回的是纯文本
        // （「这里能看什么」）⇒ ⇒ 那就把**它自己的话**带给模型，
        // 别假装画出来了（界面不许说谎，工具结果也不许）。
        return {
          report: words
            ? i18n.t('a2ui.surfaceNotDrawn', { words })
            : i18n.t('a2ui.surfaceNotDrawnSilent'),
          // ⚠️ **没画出来 ⇒ 事件那一半是空的**（不是「半张界面」）。
          a2ui_events: [],
        };
      }

      const label = i18n.t(view === 'agents' ? 'a2ui.labelAgents' : 'a2ui.labelTasks');
      return {
        report: i18n.t('a2ui.surfaceDrawn', { label }),
        // ⚠️ **事件那一半给界面，`report` 那一半给模型**（见 pickReportPayload）。
        a2ui_events: result.events,
      };
    },
  })
  .register({
    name: 'cu_list_ui_elements',
    description:
      'List the UI elements Windows UI Automation can see on this desktop (top-level windows and their direct controls). Each line has an index, control type, visible name and screen rectangle. Use it BEFORE clicking so you address an element by name instead of guessing coordinates.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const raw = await runCuRead<CuUiElement[]>('list_ui_elements', 'cu_list_ui_elements', {})
      const elements = Array.isArray(raw) ? raw : []
      return {
        report: `computer-use list_ui_elements: ${elements.length} element(s)\n${describeElements(elements)}`,
        elements,
      }
    },
  })
  .register({
    name: 'cu_read_ui_text',
    description:
      'Read the text of a desktop UI element by its visible name (Windows UI Automation). Use it to confirm what an element says before acting on it.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Visible name of the element (substring match, case-insensitive).',
        },
      },
      required: ['name'],
    },
    execute: async (args) => {
      const name = requireString(args.name, 'name')
      const text = await runCuRead<string>('read_ui_text', 'cu_read_ui_text', { name })
      return { report: `computer-use read_ui_text("${name}"): ${text}`, text }
    },
  })
  .register({
    name: 'cu_click_ui_by_name',
    description:
      'Click a desktop UI element by its visible name (Windows UI Automation). The user is asked to approve before it runs. The result says whether the click was delivered — only "not_delivered" may be retried safely.',
    // ⚠️ **要用户点头** —— 这是「人在回路」的那一格。
    requiresApproval: true,
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Visible name of the element to click (substring match, case-insensitive).',
        },
      },
      required: ['name'],
    },
    execute: async (args) => {
      const name = requireString(args.name, 'name')
      const { disposition } = await runCu('click_ui_by_name', 'cu_click_ui_by_name', { name })
      return {
        report: `computer-use click_ui_by_name("${name}"): ${describeDisposition(disposition)}`,
        disposition,
      }
    },
  })
  .register({
    name: 'cu_set_ui_value',
    description:
      'Set the value of a desktop UI element (text field, combo box) by its visible name (Windows UI Automation). The user is asked to approve before it runs. The result says whether the write was delivered — only "not_delivered" may be retried safely.',
    requiresApproval: true,
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Visible name of the element to write into (substring match, case-insensitive).',
        },
        value: {
          type: 'string',
          description: 'The text to put into the element.',
        },
      },
      required: ['name', 'value'],
    },
    execute: async (args) => {
      const name = requireString(args.name, 'name')
      // ⚠️ **value 允许是空串**（清空一个输入框是合法动作）⇒ ⇒ 只查类型。
      if (typeof args.value !== 'string') {
        throw new Error('computer-use: "value" is required (a string; empty string clears the field)')
      }
      const value = args.value
      const { disposition } = await runCu('set_ui_value', 'cu_set_ui_value', { name, value })
      return {
        report: `computer-use set_ui_value("${name}"): ${describeDisposition(disposition)}`,
        disposition,
      }
    },
  })
  .register({
    name: 'cu_snapshot_ui_tree',
    description:
      'Take a snapshot of the UI element tree of the focused window (Windows UI Automation). Each line has a ref (like @s0000002f:e7), the control type, the visible name, the developer id, the screen rectangle and what that element can do (Click / SetValue / Toggle). A ref marked "not addressable" is refused — that element is anonymous or not unique in the tree, so using it would be a guess. If the snapshot is reported as incomplete, every ref from it is refused too, because the tree was cut off and uniqueness cannot be proven; take a fresh snapshot. A ref is only valid for the snapshot it came from, so take a fresh snapshot after the UI changes.',
    parameters: {
      type: 'object',
      properties: {
        depth: {
          // ⚠️ 本仓的 `ToolParameterProperty.type` 只允许
          // string / number / boolean ⇒ ⇒ 这里用 number（不是 integer）。
          type: 'number',
          description: 'How deep to walk the tree (default and maximum 8).',
        },
      },
    },
    execute: async (args) => {
      const depth = typeof args.depth === 'number' ? Math.trunc(args.depth) : undefined
      const snapshot = await runCuRead<CuUiSnapshot>(
        'snapshot_ui_tree',
        'cu_snapshot_ui_tree',
        depth === undefined ? {} : { depth },
      )
      const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : []
      // ⚠️ **作用域要说出来** —— 模型得知道它看的是哪棵树（焦点窗口？
      // 整桌面？）⇒ ⇒ 才知道该往哪个方向找。
      const scope = snapshot?.scope ?? 'unknown'
      // ⚠️ **不完整要说清后果** —— 不是「树被截了」这一句，是「那批 ref
      // 都不能用了」⇒ ⇒ 模型才知道该重新拍一张，而不是换个 ref 再试。
      const truncated = snapshot?.complete
        ? ''
        : ` (truncated: ${snapshot?.truncated_by ?? 'unknown'} — refs from this snapshot cannot be used)`
      return {
        report: `computer-use snapshot_ui_tree: ${snapshot?.snapshot_id ?? '(no id)'} — scope=${scope} — ${nodes.length} node(s)${truncated}\n${describeNodes(nodes)}`,
        snapshot_id: snapshot?.snapshot_id,
        nodes,
      }
    },
  })
  .register({
    name: 'cu_click_ui_by_ref',
    description:
      'Click the UI element with the given ref (from cu_snapshot_ui_tree). The user is asked to approve before it runs. The result says whether the click was delivered — only "not_delivered" may be retried safely; a stale ref means take a fresh snapshot. A ref marked "not addressable", or a ref from an incomplete snapshot, is refused — pick an addressable ref from a complete snapshot.',
    requiresApproval: true,
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: "The element ref, e.g. '@s0000002f:e7'.",
        },
      },
      required: ['target'],
    },
    execute: async (args) => {
      const target = requireString(args.target, 'target')
      const { disposition } = await runCu('click_ui_by_ref', 'cu_click_ui_by_ref', { target })
      return {
        report: `computer-use click_ui_by_ref(${target}): ${describeDisposition(disposition)}`,
        disposition,
      }
    },
  })
  .register({
    name: 'cu_set_ui_value_by_ref',
    description:
      'Set the value of the UI element with the given ref (from cu_snapshot_ui_tree). The user is asked to approve before it runs. The result says whether the write was delivered. A ref marked "not addressable", or a ref from an incomplete snapshot, is refused — pick an addressable ref from a complete snapshot.',
    requiresApproval: true,
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: "The element ref, e.g. '@s0000002f:e7'.",
        },
        value: {
          type: 'string',
          description: 'The text to put into the element.',
        },
      },
      required: ['target', 'value'],
    },
    execute: async (args) => {
      const target = requireString(args.target, 'target')
      // ⚠️ **value 允许是空串**（清空一个输入框是合法动作）⇒ ⇒ 只查类型。
      if (typeof args.value !== 'string') {
        throw new Error('computer-use: "value" is required (a string; empty string clears the field)')
      }
      const { disposition } = await runCu('set_ui_value_by_ref', 'cu_set_ui_value_by_ref', {
        target,
        value: args.value,
      })
      return {
        report: `computer-use set_ui_value_by_ref(${target}): ${describeDisposition(disposition)}`,
        disposition,
      }
    },
  })
  .register({
    name: 'notification_read_events',
    description:
      'Read recent notifications on this device (app, title, text, time). Use when the user asks what notifications arrived, whether a message came in, or what is currently in the notification center.',
    requiresApproval: false,
    parameters: {
      type: 'object',
      properties: {
        required_permissions: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['notifications_read'],
          },
          description:
            'Declare which device permission this call needs on this phone. It must be exactly ["notifications_read"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of notifications to return. Defaults to 30.',
        },
        include_ongoing: {
          type: 'boolean',
          description: 'Include ongoing notifications (music playback, downloads). Defaults to false.',
        },
      },
    },
    execute: async (args) => {
      // ⚠️ 解析与移动端 _parseLimit 同一纪律：认不出来 ⇒ 用默认值；上限 200。
      let limit = 30
      const rawLimit = args.limit
      if (typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit >= 1) {
        limit = Math.min(Math.floor(rawLimit), 200)
      } else if (typeof rawLimit === 'string') {
        const parsed = Number.parseInt(rawLimit.trim(), 10)
        if (Number.isFinite(parsed) && parsed >= 1) limit = Math.min(parsed, 200)
      }
      const includeOngoing = args.include_ongoing === true
      const result = await safeInvokeOrThrow<{ notifications: unknown[]; count: number }>(
        'notification_read_events',
        { limit, includeOngoing },
      )
      // ⚠️ 不设 report ⇒ 整份结果回给模型（与移动端同一语义：读就是让它看）。
      return result
    },
  })
  .register({
    // ⚠️ **工具名、参数表（JSON Schema）与移动端必须逐字一致**
    // （shadow/scripts/check-client-tools.mjs 逐字段比对 ⇒ 一边改了两边不改
    // 就红）。形状是：结果 = `{ report, images }` —— **整图留在本地给界面
    // 渲染**（`imageAttachmentsOf`），模型只拿到 `report` 那一句
    // （`pickReportPayload`），不把几百 KB 的 base64 塞回模型上下文。
    name: 'generate_image',
    description:
      'Generate an image from a text prompt. Use this when the user asks to draw, create, or generate a picture/illustration/photo. The generated image is shown to the user in the chat.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'What to draw. Describe the subject, style and composition concretely; the model on the other side cannot ask you questions.',
        },
        size: {
          type: 'string',
          description:
            'Image size as "WxH", e.g. "1024x1024". Width and height must be multiples of 16 and at most 2048. Omit for the default (1024x1024).',
        },
        model: {
          type: 'string',
          description:
            'Image model id to use. Omit to use the configured image_gen default (a cloud provider model or the local model, whichever is configured).',
        },
      },
      required: ['prompt'],
    },
    execute: async (args) => {
      // ⚠️ **确保 i18n 已初始化** —— 否则 `t()` 退化成返回 key（同 a2ui 那条）。
      const i18n = ensureI18n();
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
      if (!prompt) {
        throw new Error('generate_image expects a non-empty "prompt"');
      }
      const size = typeof args.size === 'string' && args.size.trim() ? args.size.trim() : undefined;
      const model =
        typeof args.model === 'string' && args.model.trim() ? args.model.trim() : undefined;

      const resp = await telencephalonClient.generateImage({
        prompt,
        ...(size ? { size } : {}),
        ...(model ? { model } : {}),
        // ⚠️ **出图是枕叶的活**（视觉处理那一叶）⇒ 带上叶区 ⇒ 端脑先查枕叶
        // 的 `image_gen` 覆盖，再回落全局分档默认。不带 ⇒ 用户配的叶区
        // 覆盖永远不生效（「存得进去、用不了」那一族）。
        lobe: IMAGE_LOBE,
      });

      const images = resp.data.map((d) => ({
        b64: d.b64_json,
        size: d.size,
        mime: 'image/png',
      }));

      // ⚠️ **report ≠ 全量**：模型只需要「成了、多大了、给用户看了」这一句；
      // base64 的部分走 `images` 给界面。
      // ⚠️ **report 走真 i18n**（用户看得见 ⇒ 随用户语言走），且**键与文案
      // 两端同文**（移动端 arb 同键，测试互读比对 —— 同 a2ui 那一族）。
      return {
        report: i18n.t('clientTools.imageGenerated', {
          count: images.length,
          size: images[0]?.size ?? '',
        }),
        images,
      };
    },
  })
;
