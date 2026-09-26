import { rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Must match tests/e2e-ui/global-setup.ts: same env override, same
// platform-default temp dir. The original hardcoded '/tmp/shadow-test-data',
// which never matched the Windows temp dir the setup creates.
const TEST_DATA_DIR = process.env.SHADOW_TEST_DATA_DIR ?? join(tmpdir(), 'shadow-test-data');

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
