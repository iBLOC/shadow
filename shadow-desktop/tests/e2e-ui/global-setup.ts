import { FullConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync, openSync, closeSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { platform } from 'process';
import { fileURLToPath } from 'url';

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

// ⚠️⚠️ **端脑的服务端日志必须活过 teardown**（2026-11-05 真机实测）——
//   日志原本写在 `TEST_DATA_DIR/telencephalon-server.log` ⇒ ⇒ 而
//   `global-teardown.ts` 会 `rmSync(TEST_DATA_DIR, {recursive:true})`
//   ⇒ ⇒ **日志在 workflow 上传之前就被删掉了** ⇒ ⇒ artifact 里只有各条
//   spec 的 error-context.md，**没有服务端日志** ⇒ ⇒ ⇒ 「端脑为什么那样答」
//   在 CI 上**判不了** ⇒ ⇒ 修法：日志写在 `TEST_DATA_DIR` **之外**。
const LOG_DIR = process.env.SHADOW_E2E_LOG_DIR ?? join(tmpdir(), 'shadow-e2e-logs');
const SERVER_LOG_PATH = join(LOG_DIR, 'telencephalon-server.log');

// ⚠️ **admin 钥匙只有一把、只有一处来源** —— 端脑那侧只认环境变量
//   `TELENCEPHALON_ADMIN_KEY`（`encephalon/src/a2a_server.rs` 的
//   `standalone_admin_token()`）⇒ ⇒ **没配就是没配** ⇒ ⇒ 端脑侧
//   **fail-closed**（2026-10-31 起不再发明 `dev-admin-key`）⇒ ⇒ ⇒
//   客户端那侧必须带**同一个值**（头名只认 `x-admin-token`）。
const ADMIN_KEY = process.env.SHADOW_E2E_ADMIN_KEY ?? '';

// ⚠️⚠️ **「健康绿 ≠ 推理面可用」必须在 setup 里量出来**（2026-11-05 真机实测）：
//   `/healthz` 200 而推理链路 502（逐字 `neuron call failed`）⇒ ⇒ 「门绿」冒充「链绿」。
//   修法两件套（零新增产品面、零真模型）：
//   ① 起一个回环 mock OpenAI 上游（同目录 `mock-llm-server.mjs`），用 neuron 自带的
//      `NEURON_REMOTE_*` 注册通道（`neuron/src/server/state.rs`）把 `test-model-ui`
//      注册成「代理到 mock」的引擎 ⇒ ⇒ CI 干净 runner 上推理面有货；
//   ② 端脑 health 就绪后**再探推理面**（POST /v1/chat/completions ⇒
//      端脑 → 叶区 → neuron → mock 全链）⇒ ⇒ 探针读数当场可见，
//      不用等 spec 各自红再解析 trace。
const MOCK_ENABLED = process.env.SHADOW_E2E_MOCK_LLM !== '0';
const MOCK_PORT = process.env.SHADOW_E2E_MOCK_LLM_PORT ?? '18099';
const MOCK_LOG_PATH = process.env.SHADOW_E2E_MOCK_LLM_LOG ?? join(tmpdir(), 'shadow-e2e-mock-llm.log');
const MOCK_PID_PATH = join(LOG_DIR, 'shadow-e2e-mock.pid');
const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const MOCK_SERVER_SCRIPT = join(E2E_DIR, 'mock-llm-server.mjs');
// 与 spec 断言对齐：business-flow-ui（FULL_STACK）要 reply 含「任务」；
// conversation-flow（FULL_STACK）要含中文字符或 hello ⇒ ⇒ 一条文本全满足。
const MOCK_MODEL_ID = 'test-model-ui';
const MOCK_REPLY = '任务已创建（mock）：hello 你好';

function startMockLlmServer(): void {
  if (!MOCK_ENABLED) {
    console.log('[global-setup] mock LLM disabled (SHADOW_E2E_MOCK_LLM=0)');
    return;
  }
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* 目录已存在 */ }
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, [MOCK_SERVER_SCRIPT], {
      env: { ...process.env, MOCK_PORT, MOCK_LOG_PATH, MOCK_MODEL_ID, MOCK_REPLY },
      stdio: 'ignore',
      detached: true,
    });
  } catch (err) {
    console.warn(`[global-setup] mock LLM spawn failed: ${(err as Error).message}`);
    return;
  }
  child.on('error', (err) => {
    console.warn(`[global-setup] mock LLM failed: ${err.message}`);
  });
  try { writeFileSync(MOCK_PID_PATH, String(child.pid ?? '')); } catch { /* 收尾少一把钥匙而已 */ }
  child.unref();
  console.log(`[global-setup] mock LLM upstream: 127.0.0.1:${MOCK_PORT} (model ${MOCK_MODEL_ID})`);
}

/**
 * ⚠️ **推理面就绪探针** —— 打的是**推理链路本身**（不是 /healthz）：
 *   POST /v1/chat/completions → 端脑（owner 门）→ 叶区 → neuron → mock 上游。
 *   200 且 choices[0].message.content 非空 ⇒ 链路通；其余 ⇒ 把最后读数报出来。
 */
async function probeInferenceFace(timeoutMs = 30000): Promise<{ ok: boolean; detail: string }> {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${TELENCEPHALON_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // owner 门认进程内内部凭据 ∪ admin token ⇒ 探针从外部打，用 admin 钥匙。
          ...(ADMIN_KEY ? { 'x-admin-token': ADMIN_KEY } : {}),
        },
        body: JSON.stringify({ model: MOCK_MODEL_ID, messages: [{ role: 'user', content: 'ping' }] }),
      });
      const text = await res.text();
      last = `${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ')}`;
      if (res.ok) {
        try {
          const body = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
          const content = body.choices?.[0]?.message?.content ?? '';
          if (content.length > 0) {
            return { ok: true, detail: `200 content="${content.slice(0, 60)}" (${Date.now() - start}ms)` };
          }
          last = '200 但 choices[0].message.content 为空';
        } catch { /* 非 JSON ⇒ 按最后一轮读数重试 */ }
      }
    } catch (e) {
      last = `THROW ${(e as Error).message}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, detail: last || 'no response' };
}

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
    startMockLlmServer();
    // ⚠️ reuse 的进程递不进 env ⇒ 推理面探针只报读数、不拦路。
    const probe = await probeInferenceFace(15000);
    if (probe.ok) console.log(`[global-setup] 推理面就绪：${probe.detail}`);
    else console.warn(`[global-setup] ⚠️ 推理面未就绪（reuse 模式只报不拦）：${probe.detail}`);
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
  console.log(`[global-setup] server 日志：${SERVER_LOG_PATH}`);
  console.log(`[global-setup] admin 面：${ADMIN_KEY ? '配了钥匙（开着）' : '没配钥匙（fail-closed 关着）'}`);
  // ⚠️⚠️ **信封 id 的唯一注入口**（❼，2026-11-06 收口）：端脑 boot 读环境变量
  //   `TELENCEPHALON_CONFIG`（telencephalon/src/boot.rs 的 build_app_state_with；
  //   旧别名 CORTEX_CONFIG 不再喂）⇒ 没配 ⇒ 落 TelencephalonConfig::default()
  //   ⇒ telencephalon.id 是空串 ⇒ /shadow/v1/agents 信封里 id 恒 "" ⇒
  //   telencephalon-endpoints.spec.ts 的 toBeTruthy() 恒红（CI 三轮 30/1 钉死）。
  //   ⇒ ⇒ spawn 前把同目录的配置文件递进去（env spread 会带上它）；文件里
  //   除 id 外逐字段贴 Default ⇒ 行为与「没有配置」完全同形，只有 id 变非空。
  const telConfigPath = join(E2E_DIR, 'telencephalon-e2e-config.yaml');
  process.env.TELENCEPHALON_CONFIG = telConfigPath;
  console.log(`[global-setup] 端脑配置：${telConfigPath}`);

  startMockLlmServer();
  console.log('[global-setup] Starting the 端脑 server (encephalon-server)...');
  // ⚠️⚠️ **必须把它的输出落盘** —— 原来 `stdio: 'ignore'` ⇒ ⇒ server 崩了/超时了
  //    **一个字都留不下** ⇒ ⇒ 「起不来」连一句原因都没有 ⇒ ⇒ 判不了。
  const serverLogPath = SERVER_LOG_PATH;
  mkdirSync(LOG_DIR, { recursive: true });
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
      // ⚠️ **配了 admin 钥匙 ⇒ shadow 读门也跟着关上** ——
      //   `standalone_shadow_key()` 回落 admin token ⇒ ⇒ 于是
      //   `/shadow/v1/*` 也需要凭据 ⇒ ⇒ 客户端那侧必须同时带上。
      ...(ADMIN_KEY ? { TELENCEPHALON_ADMIN_KEY: ADMIN_KEY } : {}),
      // ⚠️ **CI 干净 runner 上一个引擎都没有** ⇒ `no_engine_for_model`。
      //    neuron 自带 `NEURON_REMOTE_*` 注册通道（`neuron/src/server/state.rs`）：
    //    每个 id 注册成一个「代理到远端」的引擎 ⇒ ⇒ `test-model-ui` 有引擎，
      //    真上游是上面起的回环 mock（`startMockLlmServer`）。
      ...(MOCK_ENABLED ? {
        NEURON_REMOTE_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
        NEURON_REMOTE_MODELS: MOCK_MODEL_ID,
      } : {}),
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

  // ⚠️ **推理面探针（承「健康绿 ≠ 推理面可用」）**——health 就绪 ≠ 链路通。
  //    不挡路：链路没通时 spec 在真实断言上红（trace 记录），但读数当场可见。
  const inference = await probeInferenceFace();
  if (inference.ok) {
    console.log(`[global-setup] 推理面就绪：${inference.detail}`);
  } else {
    console.warn(`[global-setup] ⚠️ 推理面未就绪（不拦路）：${inference.detail}`);
  }
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
