import { describe, expect, it } from 'vitest';

import { buildAguiUserParts, parseDataUrl, toAguiTools, toToolOutcome } from '../bridge';
import { ClientToolRegistry, desktopClientTools } from '../../clientTools';

/**
 * 形状转换层的判据 —— 钉的是**协议形状**：
 * · 工具是**扁平**的（不套 `function`）—— 端脑自己再包一次；
 * · data URL 形状不对 ⇒ ⇒ **响亮地拒**（不静默丢图）；
 * · 失败 ⇒ ⇒ **必须带 error**。
 */
describe('toAguiTools', () => {
  it('扁平形状 —— 不套 function(端脑自己包一次 ⇒ 两端不许各包一次)', () => {
    const tools = toAguiTools(desktopClientTools);
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(typeof t.name).toBe('string');
      expect((t as unknown as Record<string, unknown>).type).toBeUndefined();
      expect((t as unknown as Record<string, unknown>).function).toBeUndefined();
      expect(t.parameters).toBeTruthy();
    }
  });

  it('没有 parameters 的工具 ⇒ ⇒ 参数表是空的(不许缺字段)', () => {
    const registry = new ClientToolRegistry().register({
      name: 'noop',
      description: '什么都不干',
      execute: async () => ({ ok: true }),
    });
    const tools = toAguiTools(registry);
    expect(tools).toEqual([
      { name: 'noop', description: '什么都不干', parameters: { type: 'object', properties: {} } },
    ]);
  });
});

describe('parseDataUrl', () => {
  it('data URL ⇒ ⇒ MIME ＋ base64', () => {
    const f = parseDataUrl('data:image/png;base64,aGVsbG8=');
    expect(f.mediaType).toBe('image/png');
    expect(f.base64).toBe('aGVsbG8=');
  });

  it('形状不对 ⇒ ⇒ **抛**(不许静默丢图)', () => {
    expect(() => parseDataUrl('https://example.com/a.png')).toThrow(/base64 data URL/);
    expect(() => parseDataUrl('data:image/png,notbase64')).toThrow(/base64 data URL/);
  });
});

describe('buildAguiUserParts', () => {
  it('文本 ＋ 图片 ⇒ ⇒ 内联 data source(端脑不去拉)', () => {
    const parts = buildAguiUserParts('这是什么', [
      { id: 'i1', dataUrl: 'data:image/png;base64,aGVsbG8=' },
    ]);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({
      type: 'image',
      source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
    });
  });

  it('图片形状不对 ⇒ ⇒ 抛(整轮都不发 ⇒ 不发半张图)', () => {
    expect(() =>
      buildAguiUserParts('hi', [{ id: 'i1', dataUrl: 'not-a-data-url' }]),
    ).toThrow(/base64 data URL/);
  });
});

describe('toToolOutcome', () => {
  it('成功 ⇒ ⇒ 只交 `report` 那一句(组件树是给界面的)', () => {
    const o = toToolOutcome(true, { report: '主题已换', tree: { big: true } });
    expect(o.ok).toBe(true);
    // ⚠️ `pickReportPayload` 给的是 **`{report}` 那个对象**（legacy 路送的
    // 就是它）⇒ ⇒ AG-UI 的 content 是**字符串** ⇒ ⇒ 序列化成 JSON ⇒ ⇒ 模型
    // 看到的内容与 legacy 路**逐字同形**。
    expect(o.content).toBe('{"report":"主题已换"}');
    expect(o.content).not.toContain('big');
  });

  it('失败 ⇒ ⇒ **必须带 error**(不许只塞 content)', () => {
    const o = toToolOutcome(false, undefined, '主题服务拒绝');
    expect(o.ok).toBe(false);
    expect(o.error).toBe('主题服务拒绝');
    expect(o.content).toBe('');
  });
});
