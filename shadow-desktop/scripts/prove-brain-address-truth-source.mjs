#!/usr/bin/env node
/**
 * 真浏览器里量「桌面端端脑地址的真相源」—— 收口**前后**的行为差。
 *
 * ## 它验的是什么
 *
 * 旧行为：`lib/prefrontalClient.ts` 在**模块加载时** `new PrefrontalClient(prefrontalUrl())`
 * ⇒ ⇒ 构造函数调 `store.setBaseUrl(url)` ⇒ ⇒ 而那是**默认值**
 * ⇒ ⇒ ⇒ 每次启动都把用户在设置里配的端脑地址**抹回默认**（并写回 localStorage）
 * ⇒ ⇒ ⇒ 「地址的真相源有两处，模块加载顺序决定谁赢」。
 *
 * 新行为（本次收口）：**真相源只有一处** = store 的 `connection.baseUrl`
 * ⇒ ⇒ 构建期地址（VITE_PREFRONTAL_URL）只是**默认值** ⇒ ⇒ 用户配的地址赢。
 *
 * ## 三个断言（两台替身端脑，一台挂「构建期地址」，一台挂「用户配的地址」）
 *
 *   ❶ 用户配了地址 ⇒ ⇒ 流量**全部**打在用户那台上 ⇒ ⇒ 构建期那台**零请求**
 *   ❷ 用户配的地址**还在** localStorage 里（没被默认值写回）
 *   ❸ 用户**没**配 ⇒ ⇒ 流量打在构建期那台上（web 形态照样指得到真脑，没被这次收口打断）
 *
 * ## 为什么用 web 形态
 *
 * web 形态与 Tauri 形态是**同一份 src/** ⇒ ⇒ 这里跑的就是真 React、真 store、
 * 真 persist、真 fetch、真 localStorage。
 * ⚠️ 但**浏览器形态 ≠ Tauri 真机窗口** ⇒ ⇒ 读数只覆盖「客户端这一侧」。
 *
 * ## 用法
 *
 *   node scripts/prove-brain-address-truth-source.mjs
 *
 * 退出码：0 = 三个断言全成立 / 1 = 有断言红 / 2 = 跑挂了（环境问题）。
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, '..');
const OUT_ROOT = path.resolve(DESKTOP, '..', 'artifacts', 'desktop-brain-address');

// ⚠️ 端口：全部用高位口 —— **60080 常被真端脑 / 在飞的 Tauri 桌面端占着**
// ⇒ ⇒ 那是别人的进程 ⇒ ⇒ **不许抢、也不许杀**。
const WEB_PORT = 5198;
const BUILD_PORT = 46001; // 构建期地址（VITE_PREFRONTAL_URL 指的那台）
const USER_PORT = 46002;  // 用户在设置里配的那台

const STORE_KEY = 'shadow-telencephalon-store';
const USER_BRAIN = 'http://127.0.0.1:' + USER_PORT;
const BUILD_BRAIN = 'http://127.0.0.1:' + BUILD_PORT;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 一台替身端脑：记下**谁**跟它说过话。 */
function startStub(port, label) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method, url: req.url });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url && req.url.includes('/health')) res.end(JSON.stringify({ status: 'healthy' }));
    else res.end('{}');
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ port, label, hits, server }));
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* not up yet */ }
    await sleep(300);
  }
  return false;
}

const children = [];
function launch(label, cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function buildWeb() {
  console.log('[build] 构建 web 产物（构建期地址指到 ' + BUILD_BRAIN + '）…');
  const build = spawn(
    process.execPath,
    [path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.config.web.ts', '--mode', 'web'],
    {
      cwd: DESKTOP,
      env: { ...process.env, VITE_PREFRONTAL_URL: BUILD_BRAIN },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.push(build);
  let out = '';
  build.stdout.on('data', (c) => { out += c; });
  build.stderr.on('data', (c) => { out += c; });
  const code = await new Promise((resolve) => build.on('close', resolve));
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'build.log'), out, 'utf8');
  if (code !== 0) throw new Error('web 构建失败（看 build.log）：' + out.slice(-1500));
  console.log('[build] 完成');
}

/** 开一个页面 ⇒ 等到**某台**替身端脑收到请求为止。 */
async function loadApp(browser, seedStoreUrl) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  if (seedStoreUrl) {
    await ctx.addInitScript(
      ({ key, url }) => {
        localStorage.setItem('shadow_setup_complete', '1');
        localStorage.setItem(
          key,
          JSON.stringify({ state: { connection: { baseUrl: url, apiKey: '' } }, version: 0 }),
        );
      },
      { key: STORE_KEY, url: seedStoreUrl },
    );
  } else {
    await ctx.addInitScript(() => { localStorage.setItem('shadow_setup_complete', '1'); });
  }
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:' + WEB_PORT + '/conversation', { waitUntil: 'commit', timeout: 180000 });
  await sleep(8000);
  const persisted = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw)?.state?.connection?.baseUrl ?? null; } catch { return null; }
  }, STORE_KEY);
  const shot = path.join(OUT_ROOT, seedStoreUrl ? 'user-seeded.png' : 'no-seed.png');
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  await ctx.close();
  return { persisted, errors, shot };
}

const findings = [];
function check(name, ok, detail) {
  findings.push({ name, ok: !!ok, detail: detail ?? '' });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? '  —— ' + detail : ''));
}

let browser;
const stubs = [];
try {
  const buildStub = await startStub(BUILD_PORT, 'build-time');
  const userStub = await startStub(USER_PORT, 'user-configured');
  stubs.push(buildStub, userStub);

  await buildWeb();
  launch('preview', process.execPath,
    [path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--config', 'vite.config.web.ts',
     '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: DESKTOP });
  if (!(await waitForHttp('http://127.0.0.1:' + WEB_PORT + '/', 120000))) throw new Error('web preview 没起来');

  browser = await chromium.launch({
    // ⚠️ **绕代理** —— 本机 ProxyEnable=1 ⇒ 不绕的话 Chromium 会把 localhost 也发给那个死代理。
    args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
  });

  // ---------- 场景①：用户配了地址 ----------
  const seeded = await loadApp(browser, USER_BRAIN);
  const userHits = userStub.hits.length;
  const buildHitsInCase1 = buildStub.hits.length;
  check('❶ 用户配的地址 ⇒ 流量打在用户那台上', userHits > 0, 'user=' + userHits);
  check('❶ 用户配的地址 ⇒ 构建期那台**零请求**', buildHitsInCase1 === 0, 'build=' + buildHitsInCase1);
  check('❷ 用户配的地址**还在** localStorage 里（没被默认值写回）', seeded.persisted === USER_BRAIN, String(seeded.persisted));

  // ---------- 场景②：用户没配 ⇒ 构建期地址仍然生效 ----------
  const before = buildStub.hits.length;
  const plain = await loadApp(browser, null);
  const buildHitsAfter = buildStub.hits.length - before;
  check('❸ 用户没配 ⇒ 流量打在构建期那台上（web 形态没被收口打断）', buildHitsAfter > 0, 'build=' + buildHitsAfter);

  fs.writeFileSync(path.join(OUT_ROOT, 'findings.json'), JSON.stringify({ findings, buildHits: buildStub.hits, userHits: userStub.hits }, null, 2), 'utf8');
  const failed = findings.filter((f) => !f.ok);
  console.log('==== 合计：' + (findings.length - failed.length) + ' 过 / ' + failed.length + ' 红 ====');
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  console.error('跑挂了：' + (err && err.stack ? err.stack : String(err)));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const s of stubs) { try { s.server.close(); } catch { /* already closed */ } }
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
}
