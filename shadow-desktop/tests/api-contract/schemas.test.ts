/**
 * Hand-written shape tests for the highest-traffic endpoints. These
 * complement the auto-generated contract test by asserting that
 * response payloads match the TypeScript interfaces in `telencephalonClient.ts`
 * — i.e. a server field rename is caught here even if the status code
 * is still 200.
 *
 * Each test is skipped with a console warning when telencephalon is
 * unreachable (e.g. CI web builds with no server). Set
 * `RUN_API_TESTS=force-fail` to escalate.
 */

import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import {
  API_BASE_URL,
  authHeaders,
  checkServerReachable,
  hasAdminToken,
  IS_STRICT,
} from './server-check';

/**
 * 探一个端点并拿它的**形状**。
 *
 * ⚠️⚠️ **默认递读门钥匙**（2026-11-09 真端脑实测）：这个探针原先**默认不带**
 * 任何凭据（只有显式传 `init.headers` 才带）⇒ ⇒ 在端脑读门 fail-closed 的
 * 形态上 ⇒ ⇒ 那 5 条形状用例全部 **401** ⇒ ⇒ 「形状没测到」被写成
 * 「形状不对」⇒ ⇒ **判据在测错东西**。⇒ ⇒ 现在默认递**影子锁 ∪ admin token**
 * （门形真源＝端脑 `src/api/door_policy.txt`；与产品实现 `src/lib/readDoorHeaders.ts`
 * 同一规则）⇒ ⇒ `authHeaders(false)` 就是那一套。
 *
 * ⚠️ **三种状态码不是「端点的问题」** ⇒ ⇒ **跳过并说清原因**，而不是 throw：
 *   · **401/403** —— 门要**它自己的**钥匙（下游服务/写门）⇒ ⇒ 形状**测不了**；
 *   · **503** —— 路由在，但它依赖的下游**没就绪**（diencephalon 等）⇒ ⇒ 同样测不了。
 * ⇒ ⇒ 「跳过」在这里是**诚实声明**（不是假绿）⇒ ⇒ 而真跑级读数里会**点名**它们。
 */
async function probe<T>(
  ctx: TestContext,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = { ...authHeaders(false), ...(init?.headers || {}) };
  const resp = await fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers,
  });
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403 || resp.status === 503) {
      console.warn(
        `[schemas] ${path} 回 ${resp.status} —— 门要它自己的钥匙／下游没就绪 ⇒ ⇒ ` +
          `这条**形状**测不了 ⇒ ⇒ 跳过（不是「形状不对」）`,
      );
      ctx.skip();
    }
    throw new Error(`${path} returned HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

/** Skip every test in this file unless telencephalon is up. Hard-fails
 *  in strict mode. */
let serverUp = false;
const setup = (async () => {
  const r = await checkServerReachable();
  serverUp = r.reachable;
  if (IS_STRICT && !r.reachable) {
    throw new Error(`RUN_API_TESTS=force-fail but telencephalon unreachable: ${r.reason}`);
  }
  if (!r.reachable) {
    console.warn(
      `\n[schemas] telencephalon not reachable on ${API_BASE_URL}; skipping shape tests. ` +
        `reason: ${r.reason}\n  set SHADOW_TELENCEPHALON_URL or start the server.\n`,
    );
  }
})();

interface InstalledWasmEntry {
  name: string;
  version: string;
  sha256: string;
  source: string;
  source_url: string | null;
  size_bytes: number;
  uploaded_at: string;
}

interface InstalledWasmList {
  count: number;
  entries: InstalledWasmEntry[];
}

describe('GET /api/telencephalon/admin/agents/installed', () => {
  it('matches the InstalledWasmList contract', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    if (!hasAdminToken) {
      ctx.skip(); // 没配 admin token ⇒ 这条探测做不了（不是端点不存在）
      return;
    }
    const body = await probe<InstalledWasmList>(
      ctx,
      '/api/telencephalon/admin/agents/installed',
      { headers: authHeaders(true) },
    );
    expect(typeof body.count).toBe('number');
    expect(Array.isArray(body.entries)).toBe(true);
    if (body.entries.length > 0) {
      const e = body.entries[0];
      expect(typeof e.name).toBe('string');
      expect(typeof e.version).toBe('string');
      expect(typeof e.sha256).toBe('string');
      expect(typeof e.source).toBe('string');
      expect(typeof e.size_bytes).toBe('number');
    }
  }, 15_000);
});

interface ThalamusSensorList {
  sensors: string[];
}

describe('GET /api/telencephalon/thalamus/preview/sensors', () => {
  it('returns { sensors: string[] }', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    const body = await probe<ThalamusSensorList>(
      ctx,
      '/api/telencephalon/thalamus/preview/sensors',
    );
    expect(Array.isArray(body.sensors)).toBe(true);
    for (const name of body.sensors) {
      expect(typeof name).toBe('string');
    }
  }, 15_000);
});

interface HippocampusStats {
  memory_count: number;
  graph_node_count: number;
  pending_consolidations: number;
}

describe('GET /api/telencephalon/hippocampus/preview/stats', () => {
  it('matches the HippocampusStats contract', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    const body = await probe<HippocampusStats>(
      ctx,
      '/api/telencephalon/hippocampus/preview/stats',
    );
    expect(typeof body.memory_count).toBe('number');
    expect(typeof body.graph_node_count).toBe('number');
    expect(typeof body.pending_consolidations).toBe('number');
  }, 15_000);
});

interface NeuronModelSummary {
  capability: string;
  model_id: string;
  quantization: string | null;
}

interface NeuronModelsResponse {
  models: NeuronModelSummary[];
}

describe('GET /api/telencephalon/neuron/preview/models', () => {
  it('matches the NeuronModelsResponse contract', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    const body = await probe<NeuronModelsResponse>(
      ctx,
      '/api/telencephalon/neuron/preview/models',
    );
    expect(Array.isArray(body.models)).toBe(true);
    for (const m of body.models) {
      expect(typeof m.capability).toBe('string');
      expect(typeof m.model_id).toBe('string');
    }
  }, 15_000);
});

interface SubsystemToken {
  token: string;
  scopes: string[];
  expires_at_unix: number;
}

describe('POST /api/telencephalon/admin/token', () => {
  it('returns a SubsystemToken with admin auth', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    if (!hasAdminToken) {
      ctx.skip(); // 没配 admin token ⇒ 这条探测做不了（不是端点不存在）
      return;
    }
    const body = await probe<SubsystemToken>(
      ctx,
      '/api/telencephalon/admin/token',
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ scopes: ['agent.run'] }),
      },
    );
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(Array.isArray(body.scopes)).toBe(true);
    expect(typeof body.expires_at_unix).toBe('number');
  }, 15_000);
});

interface HealthPayload {
  status?: string;
  addr?: string;
  [k: string]: unknown;
}

describe('GET /healthz (公开健康面 —— `/health` 在**读门后** ⇒ ⇒ 403)', () => {
  it('returns a JSON status payload', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    const body = await probe<HealthPayload>(ctx, '/healthz');
    expect(typeof body).toBe('object');
  }, 15_000);
});

interface TelencephalonStatusResponse {
  // Fields emitted by telencephalon's health endpoint; we only assert
  // shape, not specific keys, so server-side additions don't break us.
  [k: string]: unknown;
}

describe('TelencephalonStatusPage lives /api/telencephalon/status|logs', () => {
  it('GET /api/telencephalon/status returns a JSON object', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    const body = await probe<TelencephalonStatusResponse>(ctx, '/api/telencephalon/status');
    expect(typeof body).toBe('object');
  }, 15_000);

  it('GET /api/telencephalon/logs returns a JSON object', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip(); // server absent — report as skipped, not passed
      return;
    }
    const body = await probe<TelencephalonStatusResponse>(ctx, '/api/telencephalon/logs');
    expect(typeof body).toBe('object');
  }, 15_000);
});

void authHeaders; // keep import used when test cases are gated
