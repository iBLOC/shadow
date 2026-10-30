import { describe, expect, it } from 'vitest';

import {
  ClientToolRegistry,
  desktopClientTools,
  parseHexColor,
  parseToolArgs,
  toOpenAiTools,
} from '../clientTools';

/**
 * 客户端工具注册表 —— **纯逻辑**那几块。
 *
 * 与移动端 `test/unit/client_tool_registry_test.dart` 是**同一套语义**
 * （两端各有一份实现，但认错的代价一样具体）。
 *
 * ⚠️ 测这几块的理由不是「覆盖率」，是**认错的后果太具体**：
 * - 参数形态认错 ⇒「把主题换成靛蓝」退化成「换成默认色」，**看不出哪里错了**；
 * - 颜色名乱猜 ⇒ 用户看到的主题色和模型说的完全不是一回事，而模型以为自己成功了。
 */
describe('parseToolArgs', () => {
  it('字符串（JSON 文本）—— 端脑 `ToolCall.args` 的线上形态', () => {
    expect(parseToolArgs('{"color":"#71717A"}')).toEqual({ color: '#71717A' });
  });

  it('对象 —— 有些路径传的是已经拆好的 map', () => {
    expect(parseToolArgs({ color: '#71717A' })).toEqual({ color: '#71717A' });
  });

  it('空 / null ⇒ 空参数表（不是异常）', () => {
    expect(parseToolArgs(null)).toEqual({});
    expect(parseToolArgs(undefined)).toEqual({});
    expect(parseToolArgs('')).toEqual({});
    expect(parseToolArgs('   ')).toEqual({});
  });

  it('不是 JSON 的字符串 ⇒ 当成纯文本参数，**不丢掉整个调用**', () => {
    expect(parseToolArgs('靛蓝')).toEqual({ value: '靛蓝' });
  });

  it('JSON 但不是对象 ⇒ 同样包成 value', () => {
    expect(parseToolArgs('123')).toEqual({ value: 123 });
  });

  it('数组 ⇒ 不当成参数表（否则下标会变成参数名）', () => {
    expect(parseToolArgs('[1,2]')).toEqual({ value: [1, 2] });
  });
});

describe('parseHexColor', () => {
  it('归一成大写的 #RRGGBB', () => {
    expect(parseHexColor('#71717a')).toBe('#71717A');
    expect(parseHexColor('71717A')).toBe('#71717A');
  });

  it('#AARRGGBB ⇒ 取后 6 位', () => {
    expect(parseHexColor('#FF71717A')).toBe('#71717A');
  });

  it('认不出的颜色名**不猜** ⇒ null', () => {
    expect(parseHexColor('indigo')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('#GGGGGG')).toBeNull();
    expect(parseHexColor(123)).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });
});

describe('ClientToolRegistry', () => {
  it('按名字查工具；查不到就是查不到', () => {
    const registry = new ClientToolRegistry().register({
      name: 'set_theme',
      description: 'x',
      execute: async () => null,
    });
    expect(registry.lookup('set_theme')).toBeDefined();
    expect(registry.supports('set_theme')).toBe(true);
    expect(registry.lookup('set_wallpaper')).toBeUndefined();
    expect(registry.supports('set_wallpaper')).toBe(false);
    expect(registry.names).toContain('set_theme');
  });

  it('空注册表 ⇒ 什么都不会', () => {
    const registry = new ClientToolRegistry();
    expect(registry.names).toEqual([]);
    expect(registry.supports('set_theme')).toBe(false);
  });
});

/**
 * 客户端工具的 **JSON Schema** —— 发给模型的那一份。
 *
 * 没有它，模型只知道有 `set_theme` 这个工具，不知道它要一个 `color` 还是
 * `dark` ⇒ 只能瞎猜，或者干脆不调。
 */
describe('toOpenAiTools', () => {
  it('导出成 OpenAI 的 function 形状', () => {
    const tools = toOpenAiTools(desktopClientTools);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.parameters.type).toBe('object');
    }
  });

  /**
   * ⚠️ **这段字面量是跨端的契约** —— 移动端
   * `test/unit/client_tool_registry_test.dart` 里有**一模一样**的一份。
   * 两端发给模型的东西不一样 ⇒ 同一个模型在手机上和桌面上行为不一样
   * ⇒ 哪一端漂移了，哪一端的这条测试就红。
   */
  it('set_theme 的参数声明 —— color 是字符串、dark 是布尔', () => {
    const tool = toOpenAiTools(desktopClientTools).find(
      (t) => t.function.name === 'set_theme',
    );
    expect(tool).toBeDefined();
    expect(tool!.function.parameters).toEqual({
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
    });
  });

  it('color 和 dark **都不是必填** —— 给哪个都算一次合法调用', () => {
    const tool = toOpenAiTools(desktopClientTools).find(
      (t) => t.function.name === 'set_theme',
    );
    expect(tool!.function.parameters.required).toBeUndefined();
  });

  it('没有 parameters 的工具 ⇒ 参数表是空的（不是 undefined）', () => {
    const registry = new ClientToolRegistry().register({
      name: 'ping',
      description: 'x',
      execute: async () => null,
    });
    const tools = toOpenAiTools(registry);
    expect(tools[0].function.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('注册表是空的 ⇒ 没有工具可导出', () => {
    expect(toOpenAiTools(new ClientToolRegistry())).toEqual([]);
  });
});
