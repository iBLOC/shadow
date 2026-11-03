// @vitest-environment jsdom
/**
 * 「端脑状态页」那两发读请求 —— **真的递了两把钥匙吗**。
 *
 * ⚠️ 为什么要**渲染**这一页才测得到：单测只能钉住「判定函数」，
 * 钉不住「这一页**实际发出去**的请求头」⇒ ⇒ 而这个病（读面少递一把）
 * 恰恰是「看起来对不对」的病 ⇒ ⇒ 必须有一双眼睛看**真实渲染结果**。
 *
 * ⚠️ 这一页打的地址取自 **store** ⇒ 而 store 的 `setBaseUrl`/`setApiKey`
 * **同步给 client** ⇒ ⇒ 所以它就是 client 那张面 ⇒ 递 client 的影子锁没跑偏。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const adminState = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../lib/adminToken', () => ({
  getAdminToken: async () => adminState.token,
  adminHeaders: async () =>
    adminState.token ? { 'X-Admin-Token': adminState.token } : {},
}));

// ⚠️ client —— 这一页从它那里取影子锁（**唯一真相来源**）。
vi.mock('../../lib/telencephalonClient', () => ({
  telencephalonClient: {
    getApiKey: () => 'sk-store',
  },
}));

// ⚠️ store —— 这一页的地址取自它。
vi.mock('../../stores/telencephalonStore', () => ({
  useTelencephalonStore: (sel: (s: unknown) => unknown) =>
    sel({ connection: { baseUrl: 'http://telencephalon.test', apiKey: 'sk-store' } }),
}));

import { TelencephalonStatusPage } from '../TelencephalonStatusPage';

/** 请求头里那两把钥匙（只数那两把）。 */
function credsOf(headers: Record<string, string>): string[] {
  return Object.keys(headers)
    .filter((k) => k === 'X-Shadow-Key' || k === 'X-Admin-Token')
    .sort();
}

beforeEach(() => {
  adminState.token = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('端脑状态页：读请求递两把钥匙', () => {
  it('status 这一发递影子锁 + admin token，**而且页面真的把数据画出来了**', async () => {
    adminState.token = 'admin-1';
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        neuron_reachable: true,
        actual_models_count: 1,
        available_models: [
          { id: 'MOCK-MODEL-UNIQUE', engine: 'mock-engine', available: true },
        ],
        info: null,
        hint: 'MOCK-HINT-UNIQUE',
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<TelencephalonStatusPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0];
    const url = String(call?.[0]);
    const headers = ((call?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;

    expect(url).toContain('/api/telencephalon/status');
    expect(credsOf(headers)).toEqual(['X-Admin-Token', 'X-Shadow-Key']);
    expect(headers['X-Shadow-Key']).toBe('sk-store');

    // ⚠️⚠️ **这一条不许省**：只钉「发出去的头」⇒ ⇒ **页面走失败分支也照样绿**
    // ⇒ ⇒ 「因为失败而绿」的测试 = 恒绿 ⇒ ⇒ 必须**证明响应被解析并画出来了**
    // ⇒ ⇒ 否则这一页哪天开始 401，这条测试**照样全绿**。
    // ⚠️ 钉**模型 id**（列表里逐条渲染的字段）⇒ ⇒ 它出现 ⇒ ⇒ 响应被解析并画出来了。
    expect(await screen.findByText('MOCK-MODEL-UNIQUE')).toBeTruthy();
  });

  it('读失败时页面**说真话**（显示错误），不是「看起来一切正常」', async () => {
    // ⚠️ 兄弟会话 2026-11-01 的教训：「读不到」不许长得像「没有」
    // ⇒ ⇒ 失败路径要**显式造出来**再断言 ⇒ ⇒ 否则它会因为「失败被当成功」而绿。
    adminState.token = 'admin-1';
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'shadow key required' }),
      text: async () => 'shadow key required',
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<TelencephalonStatusPage />);

    // ⇒ 页面必须把失败**说出来**（HTTP 401）。
    expect(await screen.findByText(/HTTP 401/)).toBeTruthy();
    // ⇒ 且**不许**把失败画成「有数据」。
    expect(screen.queryByText('MOCK-MODEL-UNIQUE')).toBeNull();
  });
});
