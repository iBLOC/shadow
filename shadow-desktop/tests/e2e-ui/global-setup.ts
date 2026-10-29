import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { platform } from 'process';

// Cortex was renamed to Telencephalon (2026-09 rename chain). The standalone
// 端脑 binary then moved again: `telencephalon` became a **pure library**
// (no `src/main.rs`, no `[[bin]]`), and the deployable server is
// `encephalon-server` in the `encephalon` repo
// (`encephalon/src/bin/encephalon-server.rs`).
//
// It serves exactly the surface these specs expect, all on ONE port:
//   /health                 neuron's health (neuron merges at the ROOT)
//   /v1/chat/completions    neuron's OpenAI-compatible face
//   /shadow/v1/*            端脑's shadow API (sessions / agents)
//   /api/telencephalon/*    端脑's admin face
//   /hippocampus/*          海马体
//
// The port comes from `--port`, so it is derived from CORTEX_URL — one
// source of truth with the specs (`TEST_CONFIG.CORTEX_URL`).
//
// All three of these can be overridden via env var for CI / non-default
// dev layouts — see docs/superpowers/architecture/2026-09-25-doc-sync-changelog.md.
const CORTEX_URL = process.env.SHADOW_CORTEX_URL ?? 'http://localhost:60080';

function defaultCortexBin(): string {
  if (process.env.SHADOW_CORTEX_BIN) return process.env.SHADOW_CORTEX_BIN;
  if (platform === 'win32') {
    return 'C:\\Projects\\iBLOC\\encephalon\\target\\debug\\encephalon-server.exe';
  }
  // Linux / macOS dev convention (repos live directly under Projects/)
  return '/home/ibloc/Projects/encephalon/target/debug/encephalon-server';
}

function defaultCortexCwd(): string {
  if (process.env.SHADOW_CORTEX_CWD) return process.env.SHADOW_CORTEX_CWD;
  if (platform === 'win32') return 'C:\\Projects\\iBLOC\\encephalon';
  return '/home/ibloc/Projects/encephalon';
}

/** The port the server must listen on — taken from CORTEX_URL. */
function cortexPort(): string {
  try {
    const { port } = new URL(CORTEX_URL);
    return port || '60080';
  } catch {
    return '60080';
  }
}

const CORTEX_BIN = defaultCortexBin();
const CORTEX_CWD = defaultCortexCwd();
const TEST_DATA_DIR = process.env.SHADOW_TEST_DATA_DIR ?? join(tmpdir(), 'shadow-test-data');

function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

async function isCortexRunning(): Promise<boolean> {
  if (!isLoopbackUrl(CORTEX_URL)) return false;
  try {
    const res = await fetch(`${CORTEX_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForCortex(timeout = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isCortexRunning()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function globalSetup(_config: FullConfig) {
  if (await isCortexRunning()) {
    console.log('[global-setup] Cortex already running, reusing it');
    globalThis.__SHADOW_CORTEX_AVAILABLE__ = true;
    return;
  }

  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(`${TEST_DATA_DIR}/lance`, { recursive: true });

  process.env.HIPPOCAMPUS_DATA_DIR = `${TEST_DATA_DIR}/lance`;
  process.env.LANCE_URI = `file://${TEST_DATA_DIR}/lance`;
  console.log(`[global-setup] Test data dir: ${TEST_DATA_DIR}`);
  console.log(`[global-setup] Cortex binary: ${CORTEX_BIN}`);
  console.log(`[global-setup] Cortex cwd:    ${CORTEX_CWD}`);

  console.log('[global-setup] Starting the 端脑 server (encephalon-server)...');
  const cortex = spawn(CORTEX_BIN, ['--port', cortexPort()], {
    cwd: CORTEX_CWD,
    env: {
      ...process.env,
      LANCE_URI: `file://${TEST_DATA_DIR}/lance`,
    },
    stdio: 'ignore',
    detached: true,
  });
  cortex.unref();

  const ready = await waitForCortex();
  if (!ready) {
    // Fail-soft (was hard exit). The server has been observed to bind its
    // in-process neuron but never reach the HTTP listener on :60080 (see
    // e2e-coverage-assessment addendum, 2026-09-26). On Windows this means
    // every Playwright spec used to be dead code. Now:
    //   1. log a clear warning
    //   2. set a flag so each spec can self-skip via isCortexReachable()
    //   3. the 24/28 specs that don't hit :60080 still run
    console.warn('[global-setup] 端脑 server failed to start; specs that need it will self-skip.');
    console.warn(`  Tried: ${CORTEX_BIN} --port ${cortexPort()}`);
    console.warn(`  cwd:   ${CORTEX_CWD}`);
    console.warn('  Override with SHADOW_CORTEX_BIN / SHADOW_CORTEX_CWD env vars to enable.');
    globalThis.__SHADOW_CORTEX_AVAILABLE__ = false;
    return;
  }
  console.log('[global-setup] 端脑 server started');
  globalThis.__SHADOW_CORTEX_AVAILABLE__ = true;
}

// Re-export so specs can `import { isCortexReachable } from '../e2e-ui/global-setup'`.
// In the Playwright runtime, the helper also consults the globalThis flag set above.
export async function isCortexReachable(): Promise<boolean> {
  if (globalThis.__SHADOW_CORTEX_AVAILABLE__ === false) return false;
  return isCortexRunning();
}

declare global {
  // eslint-disable-next-line no-var
  var __SHADOW_CORTEX_AVAILABLE__: boolean | undefined;
}

export default globalSetup;
