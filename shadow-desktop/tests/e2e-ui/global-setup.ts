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

async function isCortexRunning(): Promise<boolean> {
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
    console.error('[global-setup] Cortex failed to start');
    console.error(`  Tried: ${CORTEX_BIN}`);
    console.error(`  cwd:   ${CORTEX_CWD}`);
    console.error(`  Override with SHADOW_CORTEX_BIN / SHADOW_CORTEX_CWD env vars.`);
    process.exit(1);
  }
  console.log('[global-setup] Cortex started');
}

export default globalSetup;
