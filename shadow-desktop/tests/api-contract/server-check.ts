/**
 * Single source of truth for "is the API server reachable?" that the
 * contract and schema suites use. Two policies:
 *
 *   - default: skip the suite with a clear console message when the
 *     telencephalon binary is not running on the expected port. This
 *     keeps `pnpm build` green on machines without the server (e.g.
 *     the GitHub Actions web build that just packages the SPA).
 *   - `RUN_API_TESTS=force-fail`: any unreachable condition escalates
 *     to a real test failure. Use this in CI release pipelines and on
 *     `pnpm tauri build` so the packaging step proves the contract is
 *     live.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const API_BASE_URL =
  process.env.SHADOW_TELENCEPHALON_URL ?? 'http://127.0.0.1:60080';
/**
 * 这台端脑的 admin token —— **只从环境变量来**。
 *
 * ⚠️ 2026-10-31：这里原先是 `?? 'dev-admin-key'` ⇒ 一个**源码里的字面量**
 * ⇒ 它不是秘密（谁都知道）⇒ 而且端脑那边曾经有一条
 * 「`expected == "dev-admin-key"` ⇒ 认任何人」的后门 ⇒ ⇒ 默认安装下这个
 * 契约套件**不带凭据也能过**，测出来的东西等于没测。
 *
 * ⇒ 现在**没有默认值**：没配 `SHADOW_TEST_ADMIN_TOKEN` ⇒ **没有** admin
 * token ⇒ ⇒ admin 类的探测**做不了**（跳过，并说清楚原因 —— 不是「端点
 * 不存在」）。
 */
export const ADMIN_TOKEN = process.env.SHADOW_TEST_ADMIN_TOKEN?.trim() || undefined;

/**
 * 端脑面的**影子锁**（读门钥匙）—— 同样只从环境变量来，没有就没有。
 *
 * ⚠️ **为什么需要它（2026-11-09 真机实测）**：这个套件原先**只递 admin token**
 * ⇒ ⇒ 而端脑的**读门 = 影子锁 ∪ admin token**（门形真源：端脑
 * `src/api/door_policy.txt`；判据实现 `security/api_key.rs::verify_read_credential`）
 * ⇒ ⇒ 在「端脑配了影子锁、admin token 对不上」的形态上 ⇒ ⇒ 读面 **403**
 * ⇒ ⇒ 而 `checkServerReachable` 把 403 判成「不可达」⇒ ⇒ **整份套件被 skip**
 * ⇒ ⇒ ⇒ 「它有 50 个用例」是**假象** ⇒ ⇒ 它**从来没有过真跑读数**。
 *
 * ⚠️ 桌面端**产品代码**里的同一套规则在 `src/lib/readDoorHeaders.ts`
 * ⇒ ⇒ 判据必须与它**对齐**（一条规则、两处实现是债；两处**说法**不同是更大的债）。
 */
export const SHADOW_KEY = process.env.SHADOW_TEST_SHADOW_KEY?.trim() || undefined;

/** 有没有 admin token —— 没有 ⇒ admin 类的探测做不了。 */
export const hasAdminToken = ADMIN_TOKEN !== undefined;

export type Reachability = {
  reachable: boolean;
  status: number | null;
  reason: string | null;
};

const cache = new Map<string, Reachability>();

/** Probe telencephalon's `/health` endpoint (3-second timeout) and
 *  cache the result for the lifetime of the worker. */
export async function checkServerReachable(
  baseUrl: string = API_BASE_URL,
): Promise<Reachability> {
  const cached = cache.get(baseUrl);
  if (cached) return cached;

  // ⚠️⚠️ **探针打的是 `/healthz`，不是 `/health`**（2026-11-09 真机实测）：
  //   · `/health` 在**读门之后** ⇒ ⇒ 端脑的门 fail-closed ⇒ ⇒ **403**
  //     ⇒ ⇒ 而 403 **不在**「算可达」的集合里（2xx / 401 / 404）⇒ ⇒ 判成「不可达」
  //     ⇒ ⇒ ⇒ **整份套件被 skip** ⇒ ⇒ 「没有真跑读数」被伪装成「服务器没开」。
  //   · `/healthz` 是**公开健康面**（实测 200）⇒ ⇒ 它回答的是「这台大脑活着吗」
  //     ⇒ ⇒ 这正是可达性探针该问的问题。
  const probe = `${baseUrl.replace(/\/$/, '')}/healthz`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const resp = await fetch(probe, {
      signal: controller.signal,
      // ⚠️ 探针本身也要带读门钥匙 —— 否则门回 403 ⇒ ⇒ 被判成「不可达」
      // ⇒ ⇒ 整份套件 skip ⇒ ⇒ 「没有真跑读数」这件事被伪装成「服务器没开」。
      headers: authHeaders(false),
    });
    const result: Reachability = {
      reachable: resp.ok || resp.status === 401 || resp.status === 404,
      status: resp.status,
      reason: resp.ok ? null : `HTTP ${resp.status}`,
    };
    cache.set(baseUrl, result);
    return result;
  } catch (e) {
    const result: Reachability = {
      reachable: false,
      status: null,
      reason: e instanceof Error ? e.message : String(e),
    };
    cache.set(baseUrl, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** Should missing telencephalon be reported as a hard failure?
 *  Honoured in both `it()` and `describe()` so individual blocks can
 *  opt-in or opt-out independently. */
export const IS_STRICT =
  process.env.RUN_API_TESTS === 'force-fail' ||
  process.env.SHADOW_API_TESTS_STRICT === '1';

/** Resolve `SHADOW_TEST_ADMIN_TOKEN` with a fallback that mirrors the
 *  telencephalon dev-mode `dev-admin-key` default. The token source is
 *  recorded alongside failures so an admin-misconfigured environment
 *  doesn't masquerade as a missing endpoint. */
export function authHeaders(needsAdmin: boolean): Record<string, string> {
  // ⚠️⚠️ **读面也要递影子锁**（2026-11-09）—— 门形是「读门 = 影子锁 ∪ admin token」
  // ⇒ ⇒ 只递 admin token ⇒ ⇒ 在「只配了影子锁」的端脑上读面 403 ⇒ ⇒ 整份跳过。
  // ⇒ ⇒ 与产品实现 `src/lib/readDoorHeaders.ts` 同一规则（各有就带、空的绝不带）。
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SHADOW_KEY) headers['X-Shadow-Key'] = SHADOW_KEY;
  if (ADMIN_TOKEN) headers['X-Admin-Token'] = ADMIN_TOKEN;
  void needsAdmin;
  return headers;
}

/** Log + return a Vitest skip/fail guard. */
export function reportAndGuard(
  reach: Reachability,
  ctx: { describeName: string },
): { mode: 'run' | 'skip' | 'fail' } {
  if (reach.reachable) return { mode: 'run' };
  const summary =
    `telencephalon not reachable on ${API_BASE_URL} (${reach.reason ?? 'no status'}); ` +
    `skipping ${ctx.describeName}. ` +
    `Start telencephalon or set SHADOW_TELENCEPHALON_URL before re-running; ` +
    `use RUN_API_TESTS=force-fail to escalate to a hard failure.`;
  if (IS_STRICT) {
    console.error(`\n[api-contract] STRICT mode: ${summary}\n`);
    return { mode: 'fail' };
  }
  console.warn(`\n[api-contract] ${summary}\n`);
  return { mode: 'skip' };
}

/** Path to the frozen endpoints manifest. */
export function endpointsManifest(): string {
  return resolve(__dirname, 'endpoints.json');
}
