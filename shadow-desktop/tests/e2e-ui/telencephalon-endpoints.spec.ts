import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';
import { requireTelencephalon } from './e2e-strict';

/**
 * Smoke-level coverage of the telencephalon HTTP surface itself. These
 * tests are intentionally narrow: they only need a running telencephalon
 * binary on :60080, no embedded lobes / agents / neuron. They run fast
 * (a few seconds) and act as the first sanity check the `desktop-e2e` CI job
 * runs after booting telencephalon.
 *
 * ⚠️⚠️ **可达性门槛的语义在 2026-11-09 改过** —— 原来这里是
 * `test.skip(!await isTelencephalonReachable(), …)` ⇒ ⇒ 端脑没起来 ⇒
 * ⇒ 整份 spec 被**跳过** ⇒ ⇒ Playwright 的退出码仍是 0 ⇒ ⇒ 「跳过也算绿」。
 * ⇒ ⇒ 现在走 `requireTelencephalon()`：**CI 上端脑不可达 = 红**，本地仍 skip。
 *
 * Related: `e2e-conversation-flow.spec.ts`, `e2e-task-scheduling.spec.ts`,
 * and `business-flow-ui.spec.ts` exercise higher-level flows that depend
 * on lobes + 端脑 agents + neuron. Those should remain soft-skipped
 * until telencephalon's neuron_handle.shutdown hang bug is fixed.
 */

const BASE = TEST_CONFIG.TELENCEPHALON_URL;

test.describe('Telencephalon endpoint smoke', () => {
  // ⚠️⚠️ 2026-11-05 真机实测：这一条原来打 `/health` ⇒ ⇒ 真 CI 上**红了**
  //    —— 而**端脑是起来了的**（同一份 spec 里 `/.well-known/agent.json`
  //    那条是绿的，`global-setup` 的健康探针也过了）⇒ ⇒ ⇒ **是路由名不对**：
  //    独立端脑 server 的启动横幅逐字写着
  //      `GET  {addr}/healthz  — liveness`
  //    （`/health` 是**内嵌 neuron 面**上的路由 ⇒ 独立 server 不挂它）
  //    ⇒ ⇒ 探针改成「先 /healthz，再回落 /health」⇒ ⇒ 两张面都判得到。
  test('GET /healthz returns 200 with a non-empty body', async ({ request }) => {
    await requireTelencephalon();
    let res = await request.get(`${BASE}/healthz`);
    if (res.status() === 404) {
      res = await request.get(`${BASE}/health`);
    }
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test('GET /.well-known/agent.json returns 200', async ({ request }) => {
    await requireTelencephalon();
    const res = await request.get(`${BASE}/.well-known/agent.json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /shadow/v1/agents returns the telencephalon envelope key', async ({ request }) => {
    await requireTelencephalon();
    const res = await request.get(`${BASE}/shadow/v1/agents`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Telencephalon's envelope uses the `telencephalon` key (was `cortex`
    // in the pre-rename chain). Spec fails loudly if a regression flips
    // back to `cortex` without updating both server and client.
    expect(body).toHaveProperty('telencephalon');
    expect(body.telencephalon.id).toBeTruthy();
    expect(body).toHaveProperty('agents');
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('GET /shadow/v1/conversations returns a list', async ({ request }) => {
    await requireTelencephalon();
    const res = await request.get(`${BASE}/shadow/v1/conversations`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/telencephalon/agents/discover returns 200 with a non-empty agents list',
      async ({ request }) => {
    await requireTelencephalon();
    const res = await request.get(`${BASE}/api/telencephalon/agents/discover`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/telencephalon/lobes/list returns a non-empty list', async ({ request }) => {
    await requireTelencephalon();
    const res = await request.get(`${BASE}/api/telencephalon/lobes/list`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('unknown route under /api/telencephalon returns 404', async ({ request }) => {
    await requireTelencephalon();
    const res = await request.get(`${BASE}/api/telencephalon/this-route-does-not-exist`);
    expect(res.status()).toBe(404);
  });

  test('legacy /api/cortex/* path is gone (enforces rename)', async ({ request }) => {
    await requireTelencephalon();
    // Telencephalon does NOT keep a /api/cortex/* alias. If this test
    // ever flips to 200 it means someone silently re-added an alias
    // router — that regression needs to land here before merge.
    const res = await request.get(`${BASE}/api/cortex/agents`);
    expect([404, 405]).toContain(res.status());
  });
});