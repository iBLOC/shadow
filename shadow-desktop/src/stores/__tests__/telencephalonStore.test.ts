import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
beforeEach(() => {
  // 每个测试前重装（afterEach 清过 ⇒ ⇒ 这里补回来）
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});


/**
 * 端脑连接配置的行为测试 —— 钉的是**「改了要生效」**这条语义。
 *
 * ## 为什么要有这个
 *
 * 2026-10-31 的对齐审计撞出两个**静默**失效（A11）：
 *
 * 1. `setApiKey` 只改了 store、**没同步给 client** ⇒ client 永远拿不到 key
 *    ⇒ 所有走 `telencephalonClient.request()` 的请求都不带 `X-Shadow-Key`
 *    ⇒ 端脑一旦开了 `shadow.api_key`（非开发模式），客户端**全量 401**；
 * 2. `persist` 只把 `connection` 灌回 store、**不会**推给 client
 *    ⇒ 用户改完端脑地址，**重启 App 后又打回默认地址** ——
 *    而 store 里看着是对的（最迷惑的那种坏法）。
 *
 * 两条都不会让任何现有测试变红 —— 因为**没有测试断言过「client 拿到了配置」**。
 * 这个文件就是来钉它的。
 */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// 只 mock 我们要断言的那几个方法；其余走真实实现。
const setBaseUrlSpy = vi.fn();
const setApiKeySpy = vi.fn();

vi.mock('../../lib/telencephalonClient', () => ({
  telencephalonClient: {
    setBaseUrl: setBaseUrlSpy,
    setApiKey: setApiKeySpy,
    getBaseUrl: () => 'http://127.0.0.1:60080',
    getApiKey: () => undefined,
  },
}));

vi.mock('../../lib/platform', () => ({
  prefrontalUrl: () => 'http://127.0.0.1:60080',
}));

// ⚠️ store 模块在 import 时就会读 localStorage —— 必须在 mock 之后 import。
const { useTelencephalonStore } = await import('../telencephalonStore');

describe('telencephalonStore —— 端脑连接配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTelencephalonStore.setState({
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
    });
  });

  it('改了端脑地址 ⇒ 立刻同步给 client（不然请求还打老地址）', () => {
    useTelencephalonStore.getState().setBaseUrl('http://192.168.1.50:7777');

    expect(setBaseUrlSpy).toHaveBeenCalledWith('http://192.168.1.50:7777');
    expect(useTelencephalonStore.getState().connection.baseUrl).toBe(
      'http://192.168.1.50:7777',
    );
  });

  it('设了 shadow key ⇒ 同步给 client（不然端脑一开鉴权就全量 401）', () => {
    useTelencephalonStore.getState().setApiKey('secret-key');

    expect(setApiKeySpy).toHaveBeenCalledWith('secret-key');
    expect(useTelencephalonStore.getState().connection.apiKey).toBe('secret-key');
  });

  it('清空 shadow key ⇒ 也同步（空串要落成「不带 header」，而不是留着旧 key）', () => {
    useTelencephalonStore.getState().setApiKey('secret-key');
    setApiKeySpy.mockClear();

    useTelencephalonStore.getState().setApiKey('');

    expect(setApiKeySpy).toHaveBeenCalledWith('');
  });

  it('恢复持久化状态时 ⇒ 把 baseUrl 与 apiKey 都推给 client（重启后仍生效）', async () => {
    // 直接调用 persist 的恢复钩子，模拟「重启 App 后 hydrate」那一刻。
    const options = (
      useTelencephalonStore as unknown as {
        persist: {
          getOptions: () => {
            onRehydrateStorage?: () => (state?: unknown) => void;
          };
        };
      }
    ).persist.getOptions();

    expect(typeof options.onRehydrateStorage).toBe('function');

    setBaseUrlSpy.mockClear();
    setApiKeySpy.mockClear();

    options.onRehydrateStorage!()({
      connection: { baseUrl: 'http://10.0.0.9:9000', apiKey: 'restored-key' },
    });

    expect(setBaseUrlSpy).toHaveBeenCalledWith('http://10.0.0.9:9000');
    expect(setApiKeySpy).toHaveBeenCalledWith('restored-key');
  });

  it('恢复时状态为空（首次启动）⇒ 不炸，也不乱推', () => {
    const options = (
      useTelencephalonStore as unknown as {
        persist: {
          getOptions: () => {
            onRehydrateStorage?: () => (state?: unknown) => void;
          };
        };
      }
    ).persist.getOptions();

    setBaseUrlSpy.mockClear();
    setApiKeySpy.mockClear();

    expect(() => options.onRehydrateStorage!()(undefined)).not.toThrow();
    expect(setBaseUrlSpy).not.toHaveBeenCalled();
    expect(setApiKeySpy).not.toHaveBeenCalled();
  });
});
