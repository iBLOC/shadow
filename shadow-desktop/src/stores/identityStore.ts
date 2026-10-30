import { create } from 'zustand';
import { telencephalonClient } from '../lib/telencephalonClient';
import { FALLBACK_TENANT_ID } from '../lib/tenant';
import { useMemoryStore } from './memoryStore';

/**
 * 「当前是谁」—— 以及**读写哪一份记忆**。
 *
 * ## 为什么要有这个 store
 *
 * 以前客户端把海马体租户写死成 `'default'`（`taskBoardDataStore` 的
 * `DEFAULT_TENANT`、`memoryStore` 的 `personaId = null`）。但端脑这边
 * 早就不是这么回事了：
 *
 * - 端脑写记忆走 `hippo_store::hippo_auth()` —— **凭证优先，没有凭证
 *   就回退本机账号**，租户 = 账号的默认人格 `persona-<hex16>`
 *   （`security/identity.rs` 的 `derive_default_persona`，域分隔
 *   `shadow/persona/v1`）；
 * - 没有账号、也没有凭证时，端脑才回退到 `"default"`。
 *
 * ⇒ 客户端写 `'default'`、端脑写 `persona-xxx` ⇒ **两边根本不在同一个
 * 桶里**。桌面端存的主题色，端脑读不到；端脑记的事，桌面端看不见。
 *
 * ## 这一档的形状
 *
 * 租户**只由端脑说了算**：客户端问端脑「你是谁」（`GET /shadow/v1/identity`），
 * 端脑答的人格就是租户。这样：
 *
 * - 桌面与手机用**同一个账号**时，两端算出**同一个人格** ⇒ 同一份记忆；
 * - 两台设备各自本地持有账号密钥（跨设备靠导入/导出搬运），不需要任何
 *   注入通道；
 * - 端脑没起来 / 没有账号 ⇒ 回退 `"default"`，**老部署逐字节不变**。
 *
 * ## 身份 ≠ 授权
 *
 * 这里的「谁」只是**请求属性**：凭证带着主体，请求到达即确定。端脑不验签，
 * 它读到的 `sub` 只是提示（真校验在海马体那边）。所以这里**不做**「每回合
 * 问一次身份」那种设计 —— 授权判定必须是确定性、可复现的。
 */
export interface IdentityState {
  /** 人（principal），例如 `principal:alice`。 */
  principal: string | null;
  /** 人格 —— 记忆的隔离单元，也是海马体的租户。 */
  persona: string | null;
  /** 哪台设备。 */
  device: string | null;
  /** 背后有没有人。没有 ⇒ 退到默认租户。 */
  identified: boolean;
  /**
   * **有效租户** —— 永远是一个具体的桶名。
   *
   * 有账号 ⇒ 人格（`persona-xxx`）；没有 ⇒ `"default"`。
   */
  tenantId: string;
  /** 解析成功过没有。失败时保持 false ⇒ 下次还会再试。 */
  resolved: boolean;
  /** 最近一次解析失败的原因（不弹窗，只记录）。 */
  error: string | null;
  /**
   * 问端脑「你是谁」，并把结果落到海马体租户上。
   *
   * - 并发的调用方**共享同一次**请求，不重复打端脑；
   * - 已经解析成功过就直接返回（除非 `force`）—— 看板每次拉取都调它，
   *   不能每次都去问一遍；
   * - 端脑连不上 ⇒ 保持兜底租户，**不**标记 resolved（下次还会再试）；
   * - 端脑**挂着不回** ⇒ 超时后按失败处理（见 `timeoutMs`）—— 主题色
   *   恢复排在身份解析**后面**，不能让一个不回话的端脑把首屏卡住。
   */
  resolve: (opts?: { force?: boolean; timeoutMs?: number }) => Promise<string>;
}

/**
 * 身份解析的默认超时。
 *
 * ⚠️ **必须有上界**：`telencephalonClient` 的 fetch **没有超时**（没有
 * AbortController）⇒ 端脑的地址如果指到一个不回话的地方（端口被占、代理
 * 黑洞），请求会一直挂着 ⇒ 排在它后面的主题色恢复就永远不执行。
 */
export const IDENTITY_TIMEOUT_MS = 8000;

/** 正在飞的那一次解析 —— 并发调用共享它。 */
let inflight: Promise<string> | null = null;

export const useIdentityStore = create<IdentityState>()((set, get) => ({
  principal: null,
  persona: null,
  device: null,
  identified: false,
  tenantId: FALLBACK_TENANT_ID,
  resolved: false,
  error: null,

  resolve: (opts) => {
    if (!opts?.force && get().resolved) {
      return Promise.resolve(get().tenantId);
    }
    if (!inflight) {
      const timeoutMs = opts?.timeoutMs ?? IDENTITY_TIMEOUT_MS;
      inflight = resolveOnce(set, get, timeoutMs).finally(() => {
        inflight = null;
      });
    }
    return inflight;
  },
}));

async function resolveOnce(
  set: (partial: Partial<IdentityState>) => void,
  get: () => IdentityState,
  timeoutMs: number
): Promise<string> {
  try {
    const identity = await withTimeout(
      telencephalonClient.getIdentity(),
      timeoutMs
    );
    // 「背后有人」+「有人格」⇒ 用人格当租户；否则默认桶。
    const tenant =
      identity.identified && identity.persona
        ? identity.persona
        : FALLBACK_TENANT_ID;

    set({
      principal: identity.principal ?? null,
      persona: identity.persona ?? null,
      device: identity.device ?? null,
      identified: identity.identified,
      tenantId: tenant,
      resolved: true,
      error: null,
    });

    // 落到海马体租户上 —— `memoryStore.setPersona` 是**唯一**的写入路径
    // （它同时改 client 的租户并持久化），避免两个真相源各自漂移。
    useMemoryStore.getState().setPersona(tenant);

    return tenant;
  } catch (e) {
    // 端脑没起来 ⇒ 保持当前租户（多半是兜底桶），并且**不**标记 resolved
    // —— 下次调用还会再试，端脑起来后自动切过去。
    set({
      error: e instanceof Error ? e.message : String(e),
      resolved: false,
    });
    return get().tenantId;
  }
}

/**
 * 给一个 promise 加超时。
 *
 * 端脑的 fetch **没有**超时（`telencephalonClient` 没用 AbortController）⇒
 * 这里自己兜一层：超了就当失败，让调用方退回兜底租户。
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`identity timeout after ${timeoutMs}ms`)),
        timeoutMs
      );
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
