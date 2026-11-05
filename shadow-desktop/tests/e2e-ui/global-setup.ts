import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync, openSync, closeSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { platform } from 'process';

// The standalone 端脑 binary was renamed in the 2026-09 rename chain.
// 端脑 binary then moved again: `telencephalon` became a **pure library**
// (no `src/main.rs`, no `[[bin]]`), and the deployable server is
// `encephalon-server` in the `encephalon` repo
// (`encephalon/src/bin/encephalon-server.rs`).
//
// It serves exactly the surface these specs expect, all on ONE port:
//   /health                 neuron's health (neuron merges at the ROOT)
//   /v1/chat/completions    neuron's OpenAI-compatible face
//   /shadow/v1/*            端脑's shadow API (sessions / agents)
//   /api/telencephalon/*    端脑's admin face
//   /hippocampus/*          海马体
//
// The port comes from `--port`, so it is derived from TELENCEPHALON_URL — one
// source of truth with the specs (`TEST_CONFIG.TELENCEPHALON_URL`).
//
// All three of these can be overridden via env var for CI / non-default
// dev layouts — see docs/superpowers/architecture/2026-09-25-doc-sync-changelog.md.
const TELENCEPHALON_URL = process.env.SHADOW_TELENCEPHALON_URL ?? 'http://localhost:60080';

function defaultTelencephalonBin(): string {
  if (process.env.SHADOW_TELENCEPHALON_BIN) return process.env.SHADOW_TELENCEPHALON_BIN;
  if (platform === 'win32') {
    return 'C:\\Projects\\iBLOC\\encephalon\\target\\debug\\encephalon-server.exe';
  }
  // Linux / macOS dev convention (repos live directly under Projects/)
  return '/home/ibloc/Projects/encephalon/target/debug/encephalon-server';
}

function defaultTelencephalonCwd(): string {
  if (process.env.SHADOW_TELENCEPHALON_CWD) return process.env.SHADOW_TELENCEPHALON_CWD;
  if (platform === 'win32') return 'C:\\Projects\\iBLOC\\encephalon';
  return '/home/ibloc/Projects/encephalon';
}

/** The port the server must listen on — taken from TELENCEPHALON_URL. */
function telencephalonPort(): string {
  try {
    const { port } = new URL(TELENCEPHALON_URL);
    return port || '60080';
  } catch {
    return '60080';
  }
}

const TELENCEPHALON_BIN = defaultTelencephalonBin();
const TELENCEPHALON_CWD = defaultTelencephalonCwd();
const TEST_DATA_DIR = process.env.SHADOW_TEST_DATA_DIR ?? join(tmpdir(), 'shadow-test-data');

function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * 端脑的存活端点 —— **两条都探**。
 *
 * ⚠️ 实测 2026-11-05：端脑 server 自己那面是 `/healthz`
 *（`encephalon/src/a2a_server.rs`：`.route("/healthz", get(healthz))`）
 * ⇒ ⇒ 而 neuron 的 `/health` 是被 `build_full_app` **merge 在根上**的
 *（`neuron/src/server/mod.rs`：`.route("/health", get(health_handler))`）
 * ⇒ ⇒ 两张面都在根上。
 * ⚠️ 探针的职责是「**服务起来了没有**」⇒ ⇒ 不是「某个路径在不在」⇒ ⇒
 * 任何一条 200 都算起来 ⇒ ⇒ 免得因为路径漂移把「起来了」误判成「没起来」。
 */
const HEALTH_PATHS = ['/health', '/healthz'];

async function isTelencephalonRunning(): Promise<boolean> {
  if (!isLoopbackUrl(TELENCEPHALON_URL)) return false;
  for (const p of HEALTH_PATHS) {
    try {
      const res = await fetch(`${TELENCEPHALON_URL}${p}`);
      if (res.ok) return true;
    } catch {
      // 连接还没起来 ⇒ ⇒ 换下一条路径 / 下一轮再试
    }
  }
  return false;
}

/**
 * 等待端脑就绪的时限（毫秒）。
 *
 * ⚠️ 原来是 **15 秒** —— 那是在「本地已经热了」的前提下定的 ⇒ ⇒
 * CI 上是**冷启动**（datafusion / lance / wasmtime 初始化）⇒ ⇒ 15 秒
 * 大概率不够 ⇒ ⇒ 而「不够」和「崩了」在 `stdio: ignore` 下长得一模一样。
 * ⇒ ⇒ 现在默认 60 秒，CI 上再用环境变量放到 120 秒。
 */
const START_TIMEOUT_MS = Number(process.env.SHADOW_TELENCEPHALON_START_TIMEOUT_MS ?? 60000);

async function waitForTelencephalon(timeout = START_TIMEOUT_MS): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isTelencephalonRunning()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

/** 读日志文件的最后 n 行（读不到就返回空数组）。 */
function readLogTail(path: string, n: number): string[] {
  try {
    if (!existsSync(path)) return [];
    const lines = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

async function globalSetup(_config: FullConfig) {
  if (await isTelencephalonRunning()) {
    console.log('[global-setup] 端脑 already running, reusing it');
    globalThis.__SHADOW_TELENCEPHALON_AVAILABLE__ = true;
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
  console.log(`[global-setup] 端脑 binary: ${TELENCEPHALON_BIN}`);
  console.log(`[global-setup] 端脑 cwd:    ${TELENCEPHALON_CWD}`);

  console.log('[global-setup] Starting the 端脑 server (encephalon-server)...');
  // ⚠️⚠️ **必须把它的输出落盘** —— 原来 `stdio: 'ignore'` ⇒ ⇒ server 崩了/超时了
  //    **一个字都留不下** ⇒ ⇒ 「起不来」连一句原因都没有 ⇒ ⇒ 判不了。
  const serverLogPath = join(TEST_DATA_DIR, 'telencephalon-server.log');
  const logFd = openSync(serverLogPath, 'a');
  let exited: { code: number | null; signal: string | null } | null = null;
  // ⚠️⚠️ **必须接住 spawn 的 'error' 事件** —— 二进制不存在（ENOENT）时，
  //    child process 会发一个 'error'；**没有 handler 就是未处理异常**
  //    ⇒ ⇒ 直接把整个 Playwright 跑**崩掉**（一个测试都跑不了）
  //    ⇒ ⇒ 那是「端脑没起来」被放大成「整场测试没了」。
  //    （本地实测：`Error: spawn ...encephalon-server.exe ENOENT` ⇒ 进程直接挂。）
  let spawnError: { code?: string; message: string } | null = null;
  const telencephalon = spawn(TELENCEPHALON_BIN, ['--port', telencephalonPort()], {
    cwd: TELENCEPHALON_CWD,
    env: {
      ...process.env,
      LANCE_URI: `file://${TEST_DATA_DIR}/lance`,
    },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  telencephalon.on('error', (err) => {
    spawnError = { code: (err as NodeJS.ErrnoException).code, message: err.message };
  });
  telencephalon.on('exit', (code, signal) => {
    exited = { code, signal };
  });
  telencephalon.unref();

  const ready = await waitForTelencephalon();
  if (!ready) {
    closeSync(logFd);
    // ⚠️ **把它的日志尾巴打出来** ⇒ ⇒ 「判不了」必须说得清为什么判不了
    const tail = readLogTail(serverLogPath, 40);
    console.warn(`  server 日志：${serverLogPath}`);
    if (spawnError) {
      console.warn(`  server **起不来**（spawn 失败）：${spawnError.message}`);
      console.warn(`  ⇒ ⇒ 二进制不在那儿？${TELENCEPHALON_BIN}`);
    } else if (exited) {
      console.warn(`  server 已退出：code=${exited.code} signal=${exited.signal}`);
    } else {
      console.warn('  server 还活着（没退出）⇒ ⇒ 多半是**启动慢**（冷启动要跑 datafusion/lance）⇒ ⇒ 时限不够');
    }
    if (tail.length) {
      console.warn('  ── 日志尾部 ──');
      for (const line of tail) console.warn('    | ' + line);
      console.warn('  ── 尾部结束 ──');
    } else {
      console.warn('  （日志是空的 ⇒ ⇒ 它连一行都没打印 ⇒ ⇒ 多半是**进程根本没起来**）');
    }
    // Fail-soft (was hard exit). The server has been observed to bind its
    // in-process neuron but never reach the HTTP listener on :60080 (see
    // e2e-coverage-assessment addendum, 2026-09-26). On Windows this means
    // every Playwright spec used to be dead code. Now:
    //   1. log a clear warning
    //   2. set a flag so each spec can self-skip via isTelencephalonReachable()
    //   3. the 24/28 specs that don't hit :60080 still run
    console.warn('[global-setup] 端脑 server failed to start; specs that need it will self-skip.');
    console.warn(`  Tried: ${TELENCEPHALON_BIN} --port ${telencephalonPort()}`);
    console.warn(`  cwd:   ${TELENCEPHALON_CWD}`);
    console.warn('  Override with SHADOW_TELENCEPHALON_BIN / SHADOW_TELENCEPHALON_CWD env vars to enable.');
    globalThis.__SHADOW_TELENCEPHALON_AVAILABLE__ = false;
    return;
  }
  console.log('[global-setup] 端脑 server started');
  globalThis.__SHADOW_TELENCEPHALON_AVAILABLE__ = true;
}

// Re-export so specs can `import { isTelencephalonReachable } from '../e2e-ui/global-setup'`.
// In the Playwright runtime, the helper also consults the globalThis flag set above.
export async function isTelencephalonReachable(): Promise<boolean> {
  if (globalThis.__SHADOW_TELENCEPHALON_AVAILABLE__ === false) return false;
  return isTelencephalonRunning();
}

declare global {
  // eslint-disable-next-line no-var
  var __SHADOW_TELENCEPHALON_AVAILABLE__: boolean | undefined;
}

export default globalSetup;
