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
 * 身份 store 的行为测试。
 *
 * 这一档钉的是**语义**，不是形状：
 *
 * - 端脑说「背后有人」⇒ 租户就是那个人格（记忆读写都落在那个桶）；
 * - 端脑说「背后没人」⇒ 退回 `"default"`（老部署逐字节不变）；
 * - 端脑连不上 ⇒ **不**标记 resolved —— 端脑起来之后会自动切过去；
 * - 并发的调用方共享同一次请求，不重复打端脑。
 */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const IDENTITY = {
  principal: 'principal:alice',
  persona: 'persona-ada',
  device: 'device-1',
  identified: true,
  personas: [{ persona: 'persona-ada', role: 'owner' }],
};

vi.mock('../../lib/telencephalonClient', () => ({
  telencephalonClient: {
    getIdentity: vi.fn(),
    setBaseUrl: vi.fn(),
  },
}));

describe('identityStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(jsonResponse([]));
  });

  it('端脑说背后有人 ⇒ 租户就是那个人格', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockResolvedValue(IDENTITY);
    const { useIdentityStore } = await import('../identityStore');

    const tenant = await useIdentityStore.getState().resolve();

    expect(tenant).toBe('persona-ada');
    expect(useIdentityStore.getState().tenantId).toBe('persona-ada');
    expect(useIdentityStore.getState().identified).toBe(true);
    expect(useIdentityStore.getState().principal).toBe('principal:alice');
    expect(useIdentityStore.getState().device).toBe('device-1');
    expect(useIdentityStore.getState().resolved).toBe(true);
  });

  it('租户真的落到海马体请求上（记忆读写都在那个桶）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockResolvedValue(IDENTITY);
    const { useIdentityStore } = await import('../identityStore');
    const { hippocampusClient } = await import('../../lib/hippocampusClient');

    await useIdentityStore.getState().resolve();
    await hippocampusClient.listMemories();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('tenantId=persona-ada');
  });

  it('端脑说背后没人 ⇒ 退回 default 桶（老部署不变）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockResolvedValue({
      principal: null,
      persona: null,
      device: null,
      identified: false,
      personas: [],
    });
    const { useIdentityStore } = await import('../identityStore');

    const tenant = await useIdentityStore.getState().resolve();

    expect(tenant).toBe('default');
    expect(useIdentityStore.getState().identified).toBe(false);
    expect(useIdentityStore.getState().resolved).toBe(true);
  });

  it('端脑连不上 ⇒ 保持兜底租户、记下错误、且不标记 resolved（下次还会再试）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockRejectedValue(
      new Error('connection refused')
    );
    const { useIdentityStore } = await import('../identityStore');

    const tenant = await useIdentityStore.getState().resolve();

    expect(tenant).toBe('default');
    expect(useIdentityStore.getState().resolved).toBe(false);
    expect(useIdentityStore.getState().error).toContain('connection refused');
  });

  it('解析失败之后再来一次会重试（端脑起来就自动切过去）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity)
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(IDENTITY);
    const { useIdentityStore } = await import('../identityStore');

    await useIdentityStore.getState().resolve();
    const tenant = await useIdentityStore.getState().resolve();

    expect(tenant).toBe('persona-ada');
    expect(telencephalonClient.getIdentity).toHaveBeenCalledTimes(2);
  });

  it('端脑挂着不回 ⇒ 超时后回退兜底租户（不能永远挂着）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockReturnValue(
      new Promise(() => {}) // 永远不回
    );
    const { useIdentityStore } = await import('../identityStore');

    const tenant = await useIdentityStore.getState().resolve({
      timeoutMs: 50,
    });

    expect(tenant).toBe('default');
    expect(useIdentityStore.getState().resolved).toBe(false);
    expect(useIdentityStore.getState().error).toContain('timeout');
  });

  it('并发的两次 resolve 只打一次端脑', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    let release: (v: typeof IDENTITY) => void = () => {};
    vi.mocked(telencephalonClient.getIdentity).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { useIdentityStore } = await import('../identityStore');

    const first = useIdentityStore.getState().resolve();
    const second = useIdentityStore.getState().resolve();
    release(IDENTITY);
    await Promise.all([first, second]);

    expect(telencephalonClient.getIdentity).toHaveBeenCalledTimes(1);
  });

  it('已经解析过就不再问端脑（看板每次拉取都调它）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockResolvedValue(IDENTITY);
    const { useIdentityStore } = await import('../identityStore');

    await useIdentityStore.getState().resolve();
    await useIdentityStore.getState().resolve();

    expect(telencephalonClient.getIdentity).toHaveBeenCalledTimes(1);
  });

  it('force 会重新问一次端脑（导入账号之后用）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity)
      .mockResolvedValueOnce(IDENTITY)
      .mockResolvedValueOnce({ ...IDENTITY, persona: 'persona-bob' });
    const { useIdentityStore } = await import('../identityStore');

    await useIdentityStore.getState().resolve();
    const tenant = await useIdentityStore.getState().resolve({ force: true });

    expect(tenant).toBe('persona-bob');
    expect(telencephalonClient.getIdentity).toHaveBeenCalledTimes(2);
  });

  it('端脑答非 2xx 时当失败处理（不把错误当身份）', async () => {
    const { telencephalonClient } = await import('../../lib/telencephalonClient');
    vi.mocked(telencephalonClient.getIdentity).mockRejectedValue(
      new Error('telencephalon 503: Service Unavailable')
    );
    const { useIdentityStore } = await import('../identityStore');

    await useIdentityStore.getState().resolve();

    expect(useIdentityStore.getState().tenantId).toBe('default');
    expect(useIdentityStore.getState().error).toContain('503');
    // 顺带确认：不是「静默当成已解析」—— 端脑起来后还要再试。
    expect(useIdentityStore.getState().resolved).toBe(false);
  });
});
