/**
 * End-to-end tests for prefrontalClient against a real running Prefrontal
 * instance. Spawns `prefrontal serve` and exercises the HTTP client methods
 * that the desktop UI depends on.
 *
 * The Prefrontal binary listens on 127.0.0.1:8082 by default (per
 * AGENTS.md convention). Override with the PREFRONTAL_TEST_PORT env var
 * if the binary is configured for a different port.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:process';
import { PrefrontalClient } from '../prefrontalClient';
import { existsSync } from 'node:fs';

// Mirror the P0-A fix in `tests/e2e-ui/global-setup.ts`: cortex/telencephalon
// hardcoded a Linux path that broke on Windows. Same pattern here for
// prefrontal — env override > platform default. When the binary is not built,
// the suite `describe.skip`s itself instead of throwing beforeAll.
function defaultPrefrontalBin(): string {
  if (process.env.SHADOW_PREFRONTAL_BIN) return process.env.SHADOW_PREFRONTAL_BIN;
  if (platform === 'win32') {
    return 'C:\\Projects\\iBLOC\\prefrontal\\target\\debug\\prefrontal.exe';
  }
  return '/home/ibloc/Projects/prefrontal/target/debug/prefrontal';
}

const PREFRONTAL_BIN = defaultPrefrontalBin();
const PREFRONTAL_PORT = Number(process.env.PREFRONTAL_TEST_PORT ?? 8082);
const PREFRONTAL_BASE = `http://127.0.0.1:${PREFRONTAL_PORT}`;
const BIN_PRESENT = existsSync(PREFRONTAL_BIN);

let serverProcess: ChildProcess | null = null;

function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

async function waitForHealthy(url: string, maxMs = 15000): Promise<void> {
  if (!isLoopbackUrl(url)) {
    throw new Error(`waitForHealthy refuses to poll a non-loopback url: ${url}`);
  }
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not become healthy within ${maxMs}ms: ${lastErr}`);
}

beforeAll(async () => {
  if (!BIN_PRESENT) {
    // Skip silently — `describe.skip` is wired below on this flag.
    return;
  }
  serverProcess = spawn(PREFRONTAL_BIN, ['serve'], {
    env: { ...process.env, RUST_LOG: 'warn' },
    stdio: 'pipe',
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[prefrontal] ${chunk}`);
  });
  await waitForHealthy(`${PREFRONTAL_BASE}/health`);
}, 30000);

afterAll(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
  }
});

describe.skipIf(!BIN_PRESENT)('prefrontalClient e2e', () => {
  it('hits /health on the running server', async () => {
    const res = await fetch(`${PREFRONTAL_BASE}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
  });

  it('PrefrontalClient.healthCheck() returns true for a real server', async () => {
    const client = new PrefrontalClient(PREFRONTAL_BASE);
    const ok = await client.healthCheck();
    expect(ok).toBe(true);
  });

  it('PrefrontalClient.listAgents() reaches a live server', async () => {
    const client = new PrefrontalClient(PREFRONTAL_BASE);
    const agents = await client.listAgents();
    expect(agents).toBeDefined();
  });

  it('PrefrontalClient.createSession() returns a defined payload', async () => {
    const client = new PrefrontalClient(PREFRONTAL_BASE);
    const created = await client.createSession('e2e-test-session');
    expect(created).toBeDefined();
  });

  it('PrefrontalClient.listSessions() reaches a live server', async () => {
    const client = new PrefrontalClient(PREFRONTAL_BASE);
    const sessions = await client.listSessions();
    expect(sessions).toBeDefined();
  });

  it('PrefrontalClient rejects requests to a dead server with a clear error', async () => {
    const deadClient = new PrefrontalClient('http://127.0.0.1:1');
    const ok = await deadClient.healthCheck();
    expect(ok).toBe(false);
  });
});
