import { rmSync, existsSync } from 'fs';

const TEST_DATA_DIR = '/tmp/shadow-test-data';

async function globalTeardown() {
  if (process.env.CORTEX_REUSE === 'true') {
    console.log('[global-teardown] Cortex was reused, keeping it running');
    return;
  }
  
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    console.log(`[global-teardown] Cleaned up test data dir: ${TEST_DATA_DIR}`);
  }
}

export default globalTeardown;
