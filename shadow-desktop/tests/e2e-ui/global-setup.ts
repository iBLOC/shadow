import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';

const CORTEX_PATH = '/home/ibloc/Projects/cortex';
const CORTEX_URL = 'http://localhost:60080';
const TEST_DATA_DIR = '/tmp/shadow-test-data';

async function waitForCortex(timeout = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${CORTEX_URL}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function globalSetup(_config: FullConfig) {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(path.join(TEST_DATA_DIR, 'lance'), { recursive: true });
  
  process.env.TEST_DATA_DIR = TEST_DATA_DIR;
  process.env.HIPPOCAMPUS_DATA_DIR = path.join(TEST_DATA_DIR, 'lance');
  process.env.LANCE_URI = `file://${path.join(TEST_DATA_DIR, 'lance')}`;
  console.log(`[global-setup] Created test data dir: ${TEST_DATA_DIR}`);

  try {
    const res = await fetch(`${CORTEX_URL}/health`);
    if (res.ok) {
      console.log('[global-setup] Cortex already running, stopping it...');
      try {
        await fetch(`${CORTEX_URL}/shutdown`, { method: 'POST' });
        await new Promise(r => setTimeout(r, 2000));
      } catch {}
    }
  } catch {}

  console.log('[global-setup] Starting cortex with isolated data dir...');
  const cortex = spawn(
    `${CORTEX_PATH}/target/debug/cortex`,
    [],
    {
      cwd: CORTEX_PATH,
      env: { 
        ...process.env, 
        DATABASE_URL: '',
        HIPPOCAMPUS_DATA_DIR: path.join(TEST_DATA_DIR, 'lance'),
        LANCE_URI: `file://${path.join(TEST_DATA_DIR, 'lance')}`,
      },
      stdio: 'ignore',
      detached: true,
    }
  );
  cortex.unref();

  const ready = await waitForCortex();
  if (!ready) {
    console.error('[global-setup] Cortex failed to start');
    process.exit(1);
  }
  console.log('[global-setup] Cortex started with isolated data');
}

export default globalSetup;
