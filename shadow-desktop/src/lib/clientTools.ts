import { useThemeStore } from '../stores/themeStore';
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
  });
