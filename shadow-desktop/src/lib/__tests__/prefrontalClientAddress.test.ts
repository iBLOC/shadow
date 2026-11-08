/**
 * 桌面端**端脑地址的真相源** —— 「地址被抹掉」这一族。
 *
 * ## 为什么要有这个文件
 *
 * `lib/prefrontalClient.ts` 在**模块加载时**就 `new PrefrontalClient(prefrontalUrl())`
 * ⇒ ⇒ 而 `PrefrontalClient` 的构造函数当时会调 `store.setBaseUrl(url)`
 * ⇒ ⇒ `prefrontalUrl()` 是**默认值**（http://localhost:60080）
 * ⇒ ⇒ **每次应用启动**（模块加载那一刻）⇒ 用户在设置里配的端脑地址
 * `http://192.168.x.x:60080` 就被**抹回默认**，**并且写回 localStorage**
 * ⇒ ⇒ ① 用户配的地址**永久丢失**（持久化层被默认值覆盖）；
 * ⇒ ⇒ ② 同一刻 `store.setBaseUrl` 也把 `telencephalonClient` 的地址改成默认值
 * ⇒ ⇒ **两个客户端都被打回本地**（用户配的是远程大脑时 ⇒ 应用连不上自己的脑）。
 *
 * ⚠️ 失败长得像成功：设置页里显示的地址来自 store ⇒ 而 store 已经被改了
 * ⇒ ⇒ 用户看不出「我配的地址被程序改掉了」。
 *
 * ## 判据
 *
 * - **真相源只有一处** = `useTelencephalonStore` 的 `connection.baseUrl`
 *   （用户可配、持久化、重启后复原）；
 * - 客户端模块加载**不得**改写它（读可以，写要���用户显式改设置）；
 * - 客户端的请求**必须**打在用户配的那个脑上。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_BRAIN = 'http://192.168.1.50:60080';
const STORE_KEY = 'shadow-telencephalon-store';

/** 端脑的一条**裸体**响应（端脑一律返裸体，不带 {success,data} 信封）。 */
function okBody(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** 读回持久化层里那个地址（用户配的东西到底还在不在）。 */
function persistedBaseUrl(): string | undefined {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw)?.state?.connection?.baseUrl;
  } catch {
    return undefined;
  }
}

describe('端脑地址的真相源', () => {
  beforeEach(() => {
    localStorage.clear();
    // 模拟「用户上次配过一个远程大脑」—— 它躺在持久化层里。
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { connection: { baseUrl: USER_BRAIN, apiKey: '' } },
        version: 0,
      }),
    );
    // 让下一次 import 重新求值模块（= 应用启动那一刻）。
    vi.resetModules();
  });

  it('客户端模块加载时不该抹掉用户配的端脑地址', async () => {
    const { useTelencephalonStore } = await import('../../stores/telencephalonStore');
    await import('../prefrontalClient');
    await new Promise((r) => setTimeout(r, 0));

    expect(useTelencephalonStore.getState().connection.baseUrl).toBe(USER_BRAIN);
  });

  it('用户配的端脑地址不该被默认值写回持久化层', async () => {
    await import('../prefrontalClient');
    await new Promise((r) => setTimeout(r, 0));

    expect(persistedBaseUrl()).toBe(USER_BRAIN);
  });

  it('客户端的请求该打在用户配的那个脑上', async () => {
    const fetchMock = vi.fn(async () => okBody([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { prefrontalClient } = await import('../prefrontalClient');
    await new Promise((r) => setTimeout(r, 0));

    await prefrontalClient.listTasks('default', { silent: true });

    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith(USER_BRAIN)).toBe(true);
  });
});
