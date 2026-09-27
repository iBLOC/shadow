import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config';
import { isCortexReachable } from './global-setup';

/**
 * Smoke-level coverage of the telencephalon HTTP surface itself. These
 * tests are intentionally narrow: they only need a running telencephalon
 * binary on :60080, no embedded lobes / agents / neuron. They run fast
 * (a few seconds), gate on `isCortexReachable()` so they auto-skip when
 * the binary is absent, and act as the first sanity check the
 * `desktop-e2e` CI job runs after booting telencephalon.
 *
 * Related: `e2e-conversation-flow.spec.ts`, `e2e-task-scheduling.spec.ts`,
 * and `business-flow-ui.spec.ts` exercise higher-level flows that depend
 * on lobes + cortex agents + neuron. Those should remain soft-skipped
 * until telencephalon's neuron_handle.shutdown hang bug is fixed.
 */

const BASE = TEST_CONFIG.CORTEX_URL;

test.describe('Telencephalon endpoint smoke', () => {
  test('GET /health returns 200 with a non-empty body', async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const res = await request.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test('GET /.well-known/agent.json returns 200', async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const res = await request.get(`${BASE}/.well-known/agent.json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /shadow/v1/agents returns the telencephalon envelope key', async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
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
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const res = await request.get(`${BASE}/shadow/v1/conversations`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/telencephalon/agents/discover returns 200 with a non-empty agents list',
      async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const res = await request.get(`${BASE}/api/telencephalon/agents/discover`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/telencephalon/lobes/list returns a non-empty list', async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const res = await request.get(`${BASE}/api/telencephalon/lobes/list`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('unknown route under /api/telencephalon returns 404', async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    const res = await request.get(`${BASE}/api/telencephalon/this-route-does-not-exist`);
    expect(res.status()).toBe(404);
  });

  test('legacy /api/cortex/* path is gone (enforces rename)', async ({ request }) => {
    test.skip(!await isCortexReachable(), 'telencephalon not reachable on :60080');
    // Telencephalon does NOT keep a /api/cortex/* alias. If this test
    // ever flips to 200 it means someone silently re-added an alias
    // router — that regression needs to land here before merge.
    const res = await request.get(`${BASE}/api/cortex/agents`);
    expect([404, 405]).toContain(res.status());
  });
});