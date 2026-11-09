import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 「主题色也是记忆的一部分」—— 外观偏好写进海马体
 * （`dimension=Agent`），启动时再读回来。
 */

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const okJson = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

/** 线上形状：snake_case 字段 + PascalCase dimension + 全名 layer。 */
const wireMemory = (overrides: Record<string, unknown> = {}) => ({
  id: 'mem-1',
  uri: 'preference://theme/accent',
  content: '#7c5cff',
  dimension: 'Agent',
  layer: 'L2Detail',
  session_id: null,
  tenant_id: 'default',
  created_at: '2026-10-29T01:02:03Z',
  updated_at: '2026-10-29T01:02:04Z',
  ...overrides,
});

describe('appearanceMemory', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  it('rememberAccent 写一条稳定 uri 的 Agent 维度记忆', async () => {
    const { rememberAccent, ACCENT_MEMORY_URI } = await import(
      '../../src/lib/appearanceMemory'
    );
    // 第一次 list（按 uri 找，没命中），第二次 POST（新建）
    mockFetch.mockResolvedValueOnce(okJson([]));
    mockFetch.mockResolvedValueOnce(okJson(wireMemory()));

    await rememberAccent('#7c5cff');

    const [listUrl] = mockFetch.mock.calls[0];
    expect(listUrl).toContain('/hippocampus/api/memory');
    expect(listUrl).toContain('dimension=agent');

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.uri).toBe(ACCENT_MEMORY_URI);
    expect(body.dimension).toBe('agent');
    expect(body.content).toBe('#7c5cff');
  });

  it('同 uri 已存在时改成 PUT，不新增一条', async () => {
    const { rememberAccent, ACCENT_MEMORY_URI } = await import(
      '../../src/lib/appearanceMemory'
    );
    mockFetch.mockResolvedValueOnce(okJson([wireMemory()]));
    mockFetch.mockResolvedValueOnce(okJson(wireMemory({ content: '#ff0000' })));

    await rememberAccent('#ff0000');

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('PUT');
    expect(init.url ?? mockFetch.mock.calls[1][0]).toContain('mem-1');
    expect(JSON.parse(init.body)).toEqual({ content: '#ff0000' });
    expect(ACCENT_MEMORY_URI).toBe('preference://theme/accent');
  });

  it('recallAccent 读回记住的 hex', async () => {
    const { recallAccent } = await import('../../src/lib/appearanceMemory');
    mockFetch.mockResolvedValueOnce(okJson([wireMemory()]));

    await expect(recallAccent()).resolves.toBe('#7c5cff');
  });

  it('坏值（不是 hex）当作没记过', async () => {
    const { recallAccent } = await import('../../src/lib/appearanceMemory');
    mockFetch.mockResolvedValueOnce(okJson([wireMemory({ content: 'purple' })]));

    await expect(recallAccent()).resolves.toBeNull();
  });

  it('没记过时返回 null', async () => {
    const { recallAccent } = await import('../../src/lib/appearanceMemory');
    mockFetch.mockResolvedValueOnce(okJson([]));

    await expect(recallAccent()).resolves.toBeNull();
  });
});

describe('themeStore ↔ 记忆', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('改主题色会顺带写一条记忆', async () => {
    const { useThemeStore } = await import('../../src/stores/themeStore');
    mockFetch.mockResolvedValueOnce(okJson([]));
    mockFetch.mockResolvedValueOnce(okJson(wireMemory()));

    useThemeStore.getState().setAppearance({ accentSeed: '#7c5cff' });

    expect(useThemeStore.getState().appearance.accentSeed).toBe('#7c5cff');
    // 写记忆是 fire-and-forget —— 等微任务让它把请求发出去。
    await new Promise((r) => setTimeout(r, 0));

    const [, init] = mockFetch.mock.calls[1];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.uri).toBe('preference://theme/accent');
    expect(body.dimension).toBe('agent');
    expect(body.content).toBe('#7c5cff');
  });

  it('hydrateFromMemory 把记住的颜色应用回来', async () => {
    const { useThemeStore } = await import('../../src/stores/themeStore');
    useThemeStore.setState({
      appearance: { accentSeed: '#71717A', glassIntensity: 1, surfaceOverride: null, chatBackground: null },
    });
    mockFetch.mockResolvedValueOnce(okJson([wireMemory()]));

    await useThemeStore.getState().hydrateFromMemory();

    expect(useThemeStore.getState().appearance.accentSeed).toBe('#7c5cff');
  });

  it('海马体够不到时不抛错，保留本地值', async () => {
    const { useThemeStore } = await import('../../src/stores/themeStore');
    useThemeStore.setState({
      appearance: { accentSeed: '#71717A', glassIntensity: 1, surfaceOverride: null, chatBackground: null },
    });
    mockFetch.mockRejectedValueOnce(new Error('Network down'));

    await expect(useThemeStore.getState().hydrateFromMemory()).resolves.toBeUndefined();
    expect(useThemeStore.getState().appearance.accentSeed).toBe('#71717A');
  });
});
