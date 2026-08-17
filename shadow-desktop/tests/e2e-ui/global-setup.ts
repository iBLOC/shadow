import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORTEX_PATH = '/home/ibloc/Projects/cortex';
const CORTEX_URL = 'http://localhost:60080';

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
  try {
    const res = await fetch(`${CORTEX_URL}/health`);
    if (res.ok) {
      console.log('[global-setup] Cortex already running');
      return;
    }
  } catch {}

  console.log('[global-setup] Starting cortex...');
  const cortex = spawn(
    `${CORTEX_PATH}/target/debug/cortex`,
    [],
    {
      cwd: CORTEX_PATH,
      env: { ...process.env, DATABASE_URL: '' },
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
  console.log('[global-setup] Cortex started');
}

export default globalSetup;
