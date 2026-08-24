import { rmSync } from 'fs';

export async function teardown(): Promise<void> {
  const dir = globalThis.__TAURI_TEST_DIR__ ?? '/tmp/shadow-tauri-test';
  const child = globalThis.__TAURI_CHILD__;
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch { /* already dead */ }
  }
  if (process.env.SHADOW_KEEP_TEST_DIR !== '1') {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* nothing to clean */ }
  }
}