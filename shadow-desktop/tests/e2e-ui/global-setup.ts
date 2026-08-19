import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';

const CORTEX_URL = 'http://localhost:60080';
const CORTEX_BIN = '/home/ibloc/Projects/cortex/target/debug/cortex';
const TEST_DATA_DIR = '/tmp/shadow-test-data';

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

  console.log('[global-setup] Starting cortex...');
  const cortex = spawn(CORTEX_BIN, [], {
    cwd: '/home/ibloc/Projects/cortex',
    env: { 
      ...process.env, 
      DATABASE_URL: '',
      HIPPOCAMPUS_DATA_DIR: `${TEST_DATA_DIR}/lance`,
      LANCE_URI: `file://${TEST_DATA_DIR}/lance`,
    },
    stdio: 'ignore',
    detached: true,
  });
  cortex.unref();

  const ready = await waitForCortex();
  if (!ready) {
    console.error('[global-setup] Cortex failed to start');
    process.exit(1);
  }
  console.log('[global-setup] Cortex started');
}

export default globalSetup;
