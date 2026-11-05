import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Same P0-A fix as e2e-ui/global-setup.ts: cross-platform default. The Tauri shell
// itself spawns the embedded brain (the old sidecar manager was removed in be50b7f)
// the embedded encephalon), but we still need a per-platform test data dir here.
const TEST_DIR = process.env.SHADOW_TAURI_TEST_DIR ?? join(tmpdir(), 'shadow-tauri-test');
const VITE_PORT = 1420;
const TELENCEPHALON_PORT = 60080;
const WEBDRIVER_PORT = 4445;
const READY_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

declare global {
  // eslint-disable-next-line no-var
  var __TAURI_CHILD__: ChildProcess | undefined;
  // eslint-disable-next-line no-var
  var __TAURI_TEST_DIR__: string | undefined;
}

export async function setup(): Promise<void> {
  if (process.env.SHADOW_TAURI_REUSE === '1') {
    console.log('[tauri-setup] SHADOW_TAURI_REUSE=1; assuming Tauri already running');
    return;
  }

  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'lance'), { recursive: true });

  const telencephalonYaml = [
    'LANCE_URI: "file://' + TEST_DIR + '/lance"',
    '',
  ].join('\n');
  writeFileSync(join(TEST_DIR, 'telencephalon.yaml'), telencephalonYaml, 'utf8');

  console.log('[tauri-setup] spawning pnpm tauri dev');
  const child = spawn('pnpm', ['tauri', 'dev'], {
    cwd: process.cwd(),
    // ⚠️ 2026-11-05：这里**曾经**设过 TELENCEPHALON_PORT ⇒ ⇒ 但**全栈没有任何读者**：
    //    桌面端的端脑端口是写死的 127.0.0.1:60080（telencephalon_http.rs:72），
    //    而 TELE_PORT / CORTEX_PORT 只在 logger.rs 里被**打印**、不控制绑定
    //    ⇒ ⇒ 那个 override **从未生效过** ⇒ ⇒ 失败被默认值掩盖 ⇒ ⇒ 已删。
    env: {
      ...process.env,
      TELENCEPHALON_CONFIG: join(TEST_DIR, 'telencephalon.yaml'),
      LANCE_URI: 'file://' + TEST_DIR + '/lance',
      TAURI_WEBDRIVER_PORT: String(WEBDRIVER_PORT),
      TAURI_TEST_NO_SINGLE_INSTANCE: '1',
      RUST_LOG: 'warn',
    },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  globalThis.__TAURI_CHILD__ = child;
  globalThis.__TAURI_TEST_DIR__ = TEST_DIR;

  await waitAllReady();
  console.log('[tauri-setup] all three endpoints ready');
}

async function waitAllReady(): Promise<void> {
  await Promise.all([
    waitForUrl(`http://localhost:${VITE_PORT}`, 'vite'),
    waitForUrl(`http://localhost:${TELENCEPHALON_PORT}/health`, 'telencephalon'),
    waitForUrl(`http://localhost:${WEBDRIVER_PORT}/status`, 'webdriver'),
  ]);
}

async function waitForUrl(url: string, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch { /* not yet */ }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`[tauri-setup] ${label} did not become ready at ${url} within ${READY_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}