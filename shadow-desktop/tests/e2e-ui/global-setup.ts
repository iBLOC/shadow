import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { platform } from 'process';

// Cortex was renamed to Telencephalon (2026-09 rename chain). The binary is now
// `telencephalon`; the `cortex/` directory at C:\Projects\iBLOC\cortex\ is empty
// (placeholder). All three of these can be overridden via env var for CI /
// non-default dev layouts — see docs/superpowers/architecture/2026-09-25-doc-sync-changelog.md.
const CORTEX_URL = process.env.SHADOW_CORTEX_URL ?? 'http://localhost:60080';

function defaultCortexBin(): string {
  if (process.env.SHADOW_CORTEX_BIN) return process.env.SHADOW_CORTEX_BIN;
  if (platform === 'win32') {
    return 'C:\\Projects\\iBLOC\\telencephalon\\target\\debug\\telencephalon.exe';
  }
  // Linux / macOS dev convention (was: /home/ibloc/Projects/cortex/...)
  return '/home/ibloc/Projects/telencephalon/target/debug/telencephalon';
}

function defaultCortexCwd(): string {
  if (process.env.SHADOW_CORTEX_CWD) return process.env.SHADOW_CORTEX_CWD;
  if (platform === 'win32') return 'C:\\Projects\\iBLOC\\telencephalon';
  return '/home/ibloc/Projects/telencephalon';
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

  console.log('[global-setup] Starting cortex (telencephalon)...');
  const cortex = spawn(CORTEX_BIN, [], {
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
    // Fail-soft (was hard exit). The telencephalon binary has been
    // observed to bind neuron on :8086 but never reach the cortex
    // HTTP listener on :60080 (see e2e-coverage-assessment addendum,
    // 2026-09-26). On Windows + telencephalon 0.3.0 this means
    // every Playwright spec used to be dead code. Now:
    //   1. log a clear warning
    //   2. set a flag so each spec can self-skip via isCortexReachable()
    //   3. the 24/28 specs that don't hit :60080 still run
    console.warn('[global-setup] Cortex failed to start; specs that need it will self-skip.');
    console.warn(`  Tried: ${CORTEX_BIN}`);
    console.warn(`  cwd:   ${CORTEX_CWD}`);
    console.warn('  Override with SHADOW_CORTEX_BIN / SHADOW_CORTEX_CWD env vars to enable.');
    globalThis.__SHADOW_CORTEX_AVAILABLE__ = false;
    return;
  }
  console.log('[global-setup] Cortex started');
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
