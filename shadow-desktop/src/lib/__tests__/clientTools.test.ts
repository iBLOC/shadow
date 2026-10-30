import { describe, expect, it } from 'vitest';

import { ClientToolRegistry, parseHexColor, parseToolArgs } from '../clientTools';

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
