#!/usr/bin/env node
/**
 * 真浏览器里跑桌面端（**web 形态**）⇒ 把「会话失效 ⇒ 静默重建 ⇒ 模型上下文被静默重置」
 * 从「读源码得出的结论」变成**跑出来的读数**。
 *
 * ## 它验的是什么
 *
 * 桌面端发送重试（`src/pages/ConversationPage.tsx`）用**五个松散子串**判「这是不是会话错误」：
 *   `session` / `not found` / `invalid` / `expired` / `conversation`
 * 命中且是第一次尝试 ⇒ `setSessionId(id, '')` ⇒ **静默重建** ⇒ `continue`
 * ⇒ ⇒ **第一次失败被吞掉** ⇒ ⇒ 界面一点异常都没有。
 *
 * ⇒ 端脑换了实例（旧的 sessionId 失效）⇒ 用户的话被发到一个**全新**会话
 * ⇒ ⇒ **模型上下文被静默清零** ⇒ ⇒ 而**界面看不出任何异常**。
 *
 * ## 为什么用 web 形态
 *
 * web 形态与 Tauri 形态**是同一份 `src/`**（`platform.ts` 只切 Tauri 专属能力）
 * ⇒ ⇒ 这里跑的就是真 React 代码、真 `telencephalonClient`、真 HTTP、真 SSE、真 localStorage。
 * ⚠️ 但**浏览器形态 ≠ Tauri 真机窗口** ⇒ 读数只覆盖「客户端这一侧」。
 *
 * ## 四种模式（同一段客户端代码，四种输入）
 *
 *   live       正控：会话 id 认识 ⇒ 正常回 ⇒ **不重建** ⇒ 模型「记得」
 *   notfound   主案：404 + 真端脑形状（`conversation not found: <id>`）⇒ 静默重建
 *   substring  反向验证：404，但 message **不含**那五个子串 ⇒ **不**重建 ⇒ 界面报错
 *   other      同族更坏：500 + `conversation service unavailable`（**与会话无关**）
 *              ⇒ 松散子串照样命中 ⇒ 照样静默重建 ⇒ 上下文照样被清
 *
 * ⇒ 「把响应体改一个词，读数就翻转」⇒ ⇒ 判据有分辨力，不是恒绿。
 *
 * ## 怎么证明「上下文真的被清零」
 *
 * 替身端脑给每个会话数轮次，并在 SSE 里回报「服务端这一轮看到的历史轮数」
 * ⇒ ⇒ **界面上的回复文字本身**带着服务端视角 ⇒ ⇒ 不是靠推断。
 *
 * ## 用法
 *
 *   node scripts/prove-session-loss-silent-reset.mjs --all        # 四模式一起跑（推荐）
 *   node scripts/prove-session-loss-silent-reset.mjs --mode live  # 单跑一个模式
 *
 * 退出码：0 = 全部断言成立 / 1 = 有断言红 / 2 = 跑挂了（环境问题）。
 *
 * ## 依赖
 *
 * - `@playwright/test`（devDependency，已在仓库里）＋ 已下载的 Chromium
 *   ⇒ 本机跑得通；换机器要先 `npx playwright install chromium`。
 * - 端口：web preview 用 5199，替身端脑用 45995（**避开 60080** ——
 *   60080 常被真端脑 / 在飞的 Tauri 桌面端占着 ⇒ **不许抢**）。
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

const ALL = argv.includes('--all');
const MODES = ALL ? ['live', 'notfound', 'substring', 'other'] : [arg('mode', 'notfound')];
const WEB_PORT = Number(arg('web-port', '5199'));
// ⚠️ **替身端脑监听 45995**（高位口）—— 不是 60080：
// 60080 被**别人在飞的** Tauri 桌面端（`shadow-desktop.exe`）占着
// ⇒ ⇒ 那是别人的进程 ⇒ ⇒ **不许抢、也不许杀**。
// ⇒ 地址靠 `VITE_PREFRONTAL_URL` 指过来 —— 因为 `prefrontalUrl()` 才是
// **客户端真正在用**的那个地址（`lib/prefrontalClient.ts` 在模块加载时
// 就会 `setBaseUrl(prefrontalUrl())` ⇒ ⇒ 覆盖掉任何 localStorage 里的旧值）。
const STUB_PORT = Number(arg('stub-port', '45995'));
const OUT_ROOT = path.resolve(DESKTOP, '..', 'artifacts', 'desktop-session-loss');
const KEEP = argv.includes('--keep-open');

/** 每个模式一个目录（产物各归各的，便于逐模式对账）。 */
function outDir(mode) {
  const dir = path.join(OUT_ROOT, mode);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 预置到 localStorage 的会话：一条**带着旧 sessionId** 的对话（= 端脑换过实例）。 */
const SEED_CONVERSATION = {
  id: 'local-conv-1',
  title: '旧会话',
  sessionId: 'live-1',
  kind: 'text',
  messages: [
    {
      id: 'seed-u1',
      role: 'user',
      content: '记住我的名字叫小明',
      timestamp: '2026-11-02T09:00:00.000Z',
    },
    {
      id: 'seed-a1',
      role: 'assistant',
      content: '好的，小明。',
      timestamp: '2026-11-02T09:00:01.000Z',
    },
  ],
  createdAt: '2026-11-02T09:00:00.000Z',
  updatedAt: '2026-11-02T09:00:01.000Z',
};

/** 正控用「认识」的会话 id；其余模式用「失效」的旧 id（端脑不认 ⇒ 404）。 */
function seedFor(mode) {
  return { ...SEED_CONVERSATION, sessionId: mode === 'live' ? 'live-1' : 'stale-session-xyz' };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  return false;
}

const children = [];
function launch(label, cmd, args, opts, out) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  const sink = fs.createWriteStream(path.join(out, label + '.log'));
  child.stdout.pipe(sink);
  child.stderr.pipe(sink);
  return child;
}

async function buildWeb(out) {
  console.log('[build] 构建 web 产物…');
  const build = spawn(
    process.execPath,
    [
      path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--config',
      'vite.config.web.ts',
      '--mode',
      'web',
    ],
    {
      cwd: DESKTOP,
      // ⚠️ `prefrontalUrl()` 读的是 `import.meta.env.VITE_PREFRONTAL_URL`
      // ⇒ ⇒ 把它指到替身端脑 ⇒ 地址来源只有一处。
      env: { ...process.env, VITE_PREFRONTAL_URL: 'http://127.0.0.1:' + STUB_PORT },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.push(build);
  let outText = '';
  build.stdout.on('data', (c) => { outText += c; });
  build.stderr.on('data', (c) => { outText += c; });
  const code = await new Promise((resolve) => build.on('close', resolve));
  fs.writeFileSync(path.join(out, 'build.log'), outText, 'utf8');
  if (code !== 0) {
    throw new Error('web 构建失败（看 build.log）：' + outText.slice(-1500));
  }
  console.log('[build] 完成');
}

/**
 * 跑一个模式 ⇒ 返回该模式的断言结果。
 */
async function runMode(mode, browser, baseOut) {
  const OUT = outDir(mode);
  const STUB_LOG = path.join(OUT, 'stub-requests.jsonl');
  // ⚠️ **每轮先清空记账** —— 否则读数是**历次累加**（跑第二轮时第一轮的还在）
  // ⇒ ⇒ 「creates/streams 递增」看着像产品行为，其实是脚本自己脏了。
  if (fs.existsSync(STUB_LOG)) fs.rmSync(STUB_LOG);

  const findings = [];
  function check(name, ok, detail) {
    findings.push({ name, ok: !!ok, detail: detail ?? '' });
    console.log((ok ? '[PASS] ' : '[FAIL] ') + '[' + mode + '] ' + name + (detail ? '  —— ' + detail : ''));
  }

  // ---------- 起宿主替身端脑（模式不同 ⇒ 独立进程） ----------
  const stub = launch(
    'stub',
    process.execPath,
    [
      path.join(__dirname, 'session-loss-stub.mjs'),
      '--port',
      String(STUB_PORT),
      '--mode',
      mode,
      '--log',
      STUB_LOG,
    ],
    { cwd: __dirname },
    OUT,
  );
  if (!(await waitForHttp('http://127.0.0.1:' + STUB_PORT + '/shadow/v1/identity', 20000))) {
    throw new Error('替身端脑没起来');
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    // ⭐ 预置 localStorage：**必须在页面脚本跑之前** ⇒ 用 addInitScript。
    await ctx.addInitScript(
      ({ seed }) => {
        localStorage.setItem('shadow_setup_complete', '1');
        localStorage.setItem(
          'prefrontal-conversation-storage',
          JSON.stringify({
            state: { conversations: [seed], activeConversationId: seed.id },
            version: 0,
          }),
        );
      },
      { seed: seedFor(mode) },
    );

    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    // ⭐ 记下**失败的请求** —— 「页面为什么停住」往往就写在这里。
    const failedRequests = [];
    page.on('requestfailed', (req) => {
      failedRequests.push({
        url: req.url(),
        method: req.method(),
        error: req.failure()?.errorText ?? '',
      });
    });
    // 发送期间若再导航 ⇒ 「发了多次」就得换个解释。
    let navigations = 0;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navigations += 1;
    });

    // ⚠️ **`domcontentloaded` 等不到** —— vite dev server **冷启动**要按需转译
    // 整棵依赖树（3416 个模块）⇒ ⇒ 模块脚本迟迟不执行完 ⇒ ⇒ 看着像「页面打不开」。
    // ⇒ ⇒ 这里用的是**构建产物**（秒开），改等 `commit` ＋ 单独等输入框。
    const navStart = Date.now();
    await page.goto('http://127.0.0.1:' + WEB_PORT + '/conversation', {
      waitUntil: 'commit',
      timeout: 180000,
    });

    const composer = page.locator('textarea');
    try {
      await composer.waitFor({ state: 'visible', timeout: 180000 });
    } catch (e) {
      // ⚠️ **卡住也要留下证据** —— 不然只剩一句「超时」。
      await page.screenshot({ path: path.join(OUT, 'stuck.png'), fullPage: true }).catch(() => {});
      const txt = await page.locator('body').innerText().catch(() => '(取不到)');
      fs.writeFileSync(path.join(OUT, 'stuck.txt'), txt, 'utf8');
      fs.writeFileSync(
        path.join(OUT, 'stuck-requests.json'),
        JSON.stringify({ failed: failedRequests, consoleErrors }, null, 2),
        'utf8',
      );
      console.log('---- 卡住了：页面文字 ----');
      console.log(txt.slice(0, 1500));
      console.log('---- 失败请求 ----');
      console.log(JSON.stringify(failedRequests, null, 2));
      throw e;
    }
    console.log('[timing][' + mode + '] 输入框可见用时 ' + (Date.now() - navStart) + 'ms');

    // 界面上**旧消息还在**（本地记录）——这是「用户以为上下文还在」的证据。
    const beforeText = await page.locator('body').innerText();
    check('旧消息在发送前仍显示在界面上', beforeText.includes('记住我的名字叫小明'));

    // ---------- 发一条消息 ----------
    await composer.fill('我刚才说我叫什么？');
    await composer.press('Enter');

    // ---------- 等回复（或错误）出现 ----------
    const deadline = Date.now() + 60000;
    let afterText = '';
    while (Date.now() < deadline) {
      afterText = await page.locator('body').innerText();
      const replied =
        afterText.includes('历史轮数') ||
        afterText.includes('看不到你前面') ||
        afterText.includes('我记得你前面');
      const errored = afterText.includes('错误:') || afterText.includes('错误：');
      if (replied || errored) break;
      await sleep(300);
    }
    await sleep(800);
    afterText = await page.locator('body').innerText();

    // ---------- 读替身端脑的记账 ----------
    const stubLog = fs.existsSync(STUB_LOG)
      ? fs
          .readFileSync(STUB_LOG, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];
    const creates = stubLog.filter((e) => e.method === 'POST' && e.path === '/shadow/v1/conversations');
    const streams = stubLog.filter((e) => String(e.path).endsWith(':stream'));
    const firstStreamId = streams.length ? streams[0].conversationId : null;
    const lastStreamId = streams.length ? streams[streams.length - 1].conversationId : null;
    const streamIds = streams.map((s) => s.conversationId);

    // ---------- 本地 store 现在的 sessionId ----------
    const localState = await page.evaluate(() => {
      const raw = localStorage.getItem('prefrontal-conversation-storage');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const conv = (parsed.state?.conversations ?? []).find((c) => c.id === 'local-conv-1');
      return { sessionId: conv?.sessionId ?? null };
    });

    const errorShown = afterText.includes('错误:') || afterText.includes('错误：');
    const serverSaysBlind = afterText.includes('看不到你前面');
    const serverSaysRemembers = afterText.includes('我记得你前面');
    const turnCountMatch = afterText.match(/历史轮数：(\d+)/);

    fs.writeFileSync(path.join(OUT, 'ui-before.txt'), beforeText, 'utf8');
    fs.writeFileSync(path.join(OUT, 'ui-after.txt'), afterText, 'utf8');
    await page.screenshot({ path: path.join(OUT, 'after-send.png'), fullPage: true });

    console.log('---- 读数[' + mode + '] ----');
    console.log('替身端脑记账    = creates:' + creates.length + '  streams:' + streams.length);
    console.log('流打到的会话    = ' + streamIds.join(', '));
    console.log('本地 sessionId  = ' + String(localState?.sessionId));
    console.log('界面报错        = ' + errorShown);
    console.log('服务端历史轮数  = ' + (turnCountMatch ? turnCountMatch[1] : '(界面里没有)'));
    console.log('发送期间再导航  = ' + navigations + ' 次');

    // ---------- 按模式断言 ----------
    if (mode === 'live') {
      check('正控：认识会话 ⇒ 不重建（0 次建会话）', creates.length === 0, 'creates=' + creates.length);
      check(
        '正控：认识会话 ⇒ 每一发都打在**同一个**会话上（没有换 id）',
        streams.length >= 1 && streamIds.every((id) => id === 'live-1'),
        'streams=' + streamIds.join(','),
      );
      check('正控：服务端看到了历史（轮数 > 0）', !!turnCountMatch && Number(turnCountMatch[1]) > 0);
      check('正控：模型说「记得」', serverSaysRemembers);
      check('正控：界面没有报错', !errorShown);
    } else if (mode === 'notfound') {
      check(
        '主案：端脑 404 ⇒ 客户端**另起了一个会话**（换 id）',
        creates.length >= 1 && lastStreamId !== 'stale-session-xyz',
        'creates=' + creates.length + ' last=' + lastStreamId,
      );
      check('主案：第一次流用的是旧 sessionId', firstStreamId === 'stale-session-xyz', 'first=' + firstStreamId);
      check('主案：第二次流用的是**新**会话 id', !!lastStreamId && lastStreamId !== 'stale-session-xyz', 'last=' + lastStreamId);
      check(
        '主案：模型上下文被清零（服务端历史轮数 = 0）',
        !!turnCountMatch && Number(turnCountMatch[1]) === 0,
        'turns=' + (turnCountMatch ? turnCountMatch[1] : 'none'),
      );
      check('主案：模型明说「看不到你前面说过的话」', serverSaysBlind);
      check('主案：**界面没有报错**（失败长得像成功）', !errorShown);
      check('主案：旧消息仍在界面上（用户以为上下文还在）', afterText.includes('记住我的名字叫小明'));
    } else if (mode === 'substring') {
      check('反向验证：message 不含那五个子串 ⇒ **不重建**', creates.length === 0, 'creates=' + creates.length);
      check(
        '反向验证：每一发都打在**同一个**（失效的）会话上',
        streams.length >= 1 && streamIds.every((id) => id === 'stale-session-xyz'),
        'streams=' + streamIds.join(','),
      );
      check('反向验证：界面**说出了**失败', errorShown);
      check('反向验证：界面没有「历史轮数」回报（没走到重建后的流）', !turnCountMatch);
    } else if (mode === 'other') {
      check(
        '同族更坏：500（与会话无关）也命中松散子串 ⇒ 照样**换了一个会话**',
        creates.length >= 1 && lastStreamId !== 'stale-session-xyz',
        'creates=' + creates.length + ' last=' + lastStreamId,
      );
      check(
        '同族更坏：本地 sessionId 被换掉（旧上下文彻底失联）',
        !!localState && localState.sessionId !== 'stale-session-xyz',
        'local=' + String(localState?.sessionId),
      );
      check('同族更坏：**界面没有报错**（与会话无关的 500 被静默吞掉）', !errorShown);
    }

    fs.writeFileSync(
      path.join(OUT, 'findings.json'),
      JSON.stringify({ mode, findings, stubLog, localState }, null, 2),
      'utf8',
    );
    if (consoleErrors.length) {
      fs.writeFileSync(path.join(OUT, 'console.log'), consoleErrors.join('\n'), 'utf8');
    }
    const failed = findings.filter((f) => !f.ok);
    console.log('---- [' + mode + '] 合计：' + (findings.length - failed.length) + ' 过 / ' + failed.length + ' 红 ----');
    return findings;
  } finally {
    await ctx.close().catch(() => {});
    if (!KEEP) stub.kill();
  }
}

let browser;
try {
  // ---------- 构建 web 产物（一次）＋ 起 preview（一次） ----------
  const buildOut = outDir('_build');
  await buildWeb(buildOut);
  launch(
    'preview',
    process.execPath,
    [
      path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--config',
      'vite.config.web.ts',
      '--port',
      String(WEB_PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { cwd: DESKTOP },
    buildOut,
  );
  if (!(await waitForHttp('http://127.0.0.1:' + WEB_PORT + '/', 120000))) {
    throw new Error('web preview 没起来');
  }

  browser = await chromium.launch({
    // ⚠️ **绕代理** —— 本机 `ProxyEnable=1`（127.0.0.1:7900）⇒ 不绕的话
    // Chromium 会把 **localhost** 也发给那个死代理 ⇒ 页面永远加载不出来。
    args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
  });

  const all = [];
  for (const mode of MODES) {
    all.push(...(await runMode(mode, browser, buildOut)));
  }
  const failed = all.filter((f) => !f.ok);
  console.log('==== 合计：' + (all.length - failed.length) + ' 过 / ' + failed.length + ' 红 ====');
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  console.error('跑挂了：' + (err && err.stack ? err.stack : String(err)));
  process.exitCode = 2;
} finally {
  if (!KEEP) {
    if (browser) await browser.close().catch(() => {});
    for (const c of children) {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
  }
}
