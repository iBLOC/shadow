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
  process.env.SHADOW_CORTEX_URL ?? 'http://127.0.0.1:60080';
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

  const probe = `${baseUrl.replace(/\/$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const resp = await fetch(probe, { signal: controller.signal });
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
  if (!needsAdmin) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    ...(ADMIN_TOKEN ? { 'X-Admin-Token': ADMIN_TOKEN } : {}),
  };
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
    `Start telencephalon or set SHADOW_CORTEX_URL before re-running; ` +
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
