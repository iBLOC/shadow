import { rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Must match tests/e2e-ui/global-setup.ts: same env override, same
// platform-default temp dir. The original hardcoded '/tmp/shadow-test-data',
// which never matched the Windows temp dir the setup creates.
const TEST_DATA_DIR = process.env.SHADOW_TEST_DATA_DIR ?? join(tmpdir(), 'shadow-test-data');

async function globalTeardown() {
  // ⚠️ mock LLM 上游是 global-setup 起的（detached ⇒ 不随 Playwright 退出）
  //    ⇒ 这里按 pid 文件收掉（best effort；pid 文件读不到就交给进程收尾）。
  const LOG_DIR = process.env.SHADOW_E2E_LOG_DIR ?? join(tmpdir(), 'shadow-e2e-logs');
  try {
    const pidFile = join(LOG_DIR, 'shadow-e2e-mock.pid');
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, 'utf8').trim());
      if (Number.isFinite(pid) && pid > 0) {
        try {
          process.kill(pid);
          console.log(`[global-teardown] mock LLM (pid ${pid}) stopped`);
        } catch { /* 已退出 ⇒ 无害 */ }
      }
    }
  } catch { /* 收不掉不挡路 */ }

  if (process.env.TELENCEPHALON_REUSE === 'true') {
    console.log('[global-teardown] 端脑 was reused, keeping it running');
    return;
  }

  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    console.log(`[global-teardown] Cleaned up test data dir: ${TEST_DATA_DIR}`);
  }
}

export default globalTeardown;
