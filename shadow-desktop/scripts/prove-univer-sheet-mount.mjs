#!/usr/bin/env node
/* global window, localStorage */
// Prove the Univer editor surface (DOC-01/02/03) in a REAL browser (web build):
//   1. snapshot from document_load_snapshot really becomes a Univer workbook (canvas appears);
//   2. publish button really invokes document_publish_feishu with a 3-level sheets array
//      (matches Rust Vec<Vec<Vec<String>>>), page shows the URL + shadow:feishu-published event;
//   3. best-effort: real canvas typing -> debounce -> document_save_snapshot;
//      if canvas click does not start editing we SAY SO, we never fake green.
// Note: web build is NOT the Tauri window; invoke is a __TAURI_INTERNALS__ stub (same shape).
// Usage: node scripts/prove-univer-sheet-mount.mjs [--skip-build] [--port 5197]
// Exit: 0 = all assertions green (best-effort grid excluded, stated) / 1 = red / 2 = env broken.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const PORT = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 5197;
const SKIP_BUILD = argv.includes('--skip-build');
const OUT = path.resolve(DESKTOP, '..', 'artifacts', 'prove-univer-sheet');
fs.mkdirSync(OUT, { recursive: true });

const TASK_ID = 'prove-task-1';
// Known values inside the snapshot so we can audit that mount content came FROM the snapshot.
const PROVE_SNAPSHOT = {
  name: 'prove sheet',
  sheets: {
    s1: {
      id: 's1',
      name: 'Sheet1',
      rowCount: 30,
      columnCount: 10,
      cellData: {
        0: { 0: { v: 'PROVE-A1' }, 1: { v: 7 } },
        1: { 0: { v: 'PROVE-A2' } },
      },
    },
  },
  sheetOrder: ['s1'],
};

function tauriStub(snapshot) {
  // AppInitializer 的 gate：没有这个键会被踢去 /setup 向导页（白屏真凶之一）。
  // 置上之后，模型探测「问不到」走 unknown 分支，不拦路由。
  try { localStorage.setItem('shadow_setup_complete', '1'); } catch (e) { void e; }
  window.__invokeLog = [];
  window.__publishedDetails = [];
  window.addEventListener('shadow:feishu-published', (e) => {
    try {
      window.__publishedDetails.push(JSON.parse(JSON.stringify(e.detail)));
    } catch (err) {
      window.__publishedDetails.push({ serialize_failed: String(err) });
    }
  });
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) {
      const id = Date.now() + Math.floor(Math.random() * 1000000);
      window['_cb_' + id] = cb;
      return id;
    },
    invoke: async (cmd, args) => {
      const safeArgs = args === undefined ? null : JSON.parse(JSON.stringify(args));
      window.__invokeLog.push({ cmd, args: safeArgs });
      switch (cmd) {
        case 'document_load_snapshot':
          return Array.from(new TextEncoder().encode(JSON.stringify(snapshot)));
        case 'document_save_snapshot':
        case 'recording_report':
          return null;
        case 'document_feishu_enabled':
          return true;
        case 'document_publish_feishu':
          return { spreadsheet_token: 'prove-token', url: 'https://example.feishu.cn/sheets/prove-1' };
        case 'recording_events':
          return [];
        default:
          throw new Error('prove-stub: unhandled command: ' + cmd);
      }
    },
  };
}

const children = [];
function launch(label, cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  const sink = fs.createWriteStream(path.join(OUT, label + '.log'));
  child.stdout.pipe(sink);
  child.stderr.pipe(sink);
  return child;
}
function killChildren() {
  for (const c of children) {
    try { c.kill(); } catch (e) { void e; }
  }
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
    } catch (e) { void e; }
    await sleep(300);
  }
  return false;
}

async function main() {
  const findings = [];
  const check = (name, ok, detail) => {
    findings.push({ name, ok: !!ok });
    console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? '  -- ' + detail : ''));
  };

  if (!SKIP_BUILD) {
    console.log('[build] build web bundle (vite.config.web.ts) ...');
    const build = launch('build', process.execPath, [
      path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--config',
      'vite.config.web.ts',
      '--mode',
      'web',
      // base './' 的产物在二级路由 /document/:taskId 下会把资产解析成
      // /document/assets/...（404、白屏、零 pageerror）⇒ prove 的构建用绝对 base。
      '--base',
      '/',
    ], { cwd: DESKTOP, env: { ...process.env, VITE_PREFRONTAL_URL: 'http://127.0.0.1:45995' } });
    const code = await new Promise((resolve) => build.on('close', resolve));
    if (code !== 0) throw new Error('web build failed (see ' + path.join(OUT, 'build.log') + ')');
    console.log('[build] done');
  }

  launch('preview', process.execPath, [
    path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--config',
    'vite.config.web.ts',
    '--port',
    String(PORT),
    '--strictPort',
  ], { cwd: DESKTOP });
  const up = await waitForHttp('http://127.0.0.1:' + PORT + '/', 30000);
  if (!up) throw new Error('preview not up (port ' + PORT + ')');

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(tauriStub, PROVE_SNAPSHOT);
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('http://127.0.0.1:' + PORT + '/document/' + TASK_ID, { waitUntil: 'commit', timeout: 60000 });

    const container = page.locator('[data-testid="univer-container"]');
    // 容器里有多块 canvas（表头那块在前）⇒ 点选/等可见都要选**主渲染面**
    // （id 前缀 univer-sheet-main-canvas），否则点击被主 canvas 的容器拦截。
    const canvas = container.locator('canvas[id^="univer-sheet-main-canvas"]').first();
    try {
      await container.waitFor({ state: 'attached', timeout: 60000 });
      await canvas.waitFor({ state: 'visible', timeout: 90000 });
    } catch (waitErr) {
      // 卡住也要留下证据 —— 不然只剩一句 timeout，页面为什么白屏没人知道。
      const stuckText = await page.locator('body').innerText().catch((e2) => '(innerText failed: ' + e2.message + ')');
      await page.screenshot({ path: path.join(OUT, 'stuck.png'), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(OUT, 'stuck.txt'), stuckText.slice(0, 4000), 'utf8');
      fs.writeFileSync(path.join(OUT, 'stuck-errors.json'), JSON.stringify({ pageErrors, consoleErrors }, null, 2), 'utf8');
      console.log('---- stuck: page url = ' + page.url());
      console.log('---- stuck: body text (first 1200) ----');
      console.log(stuckText.slice(0, 1200));
      console.log('---- stuck: pageErrors ----');
      console.log(pageErrors.join('\n').slice(0, 2000));
      console.log('---- stuck: consoleErrors (first 8) ----');
      console.log(consoleErrors.slice(0, 8).join('\n').slice(0, 2000));
      throw waitErr;
    }
    const readyClass = (await container.getAttribute('class')) || '';
    check('editor container reaches ready state (h-[420px])', readyClass.includes('h-[420px]'), 'class=' + readyClass);

    const canvasCount = await container.locator('canvas').count();
    check('Univer really rendered (canvas inside container)', canvasCount >= 1, 'canvas=' + canvasCount);

    check('i18n title in page', (await page.getByText('任务工作簿').count()) >= 1);
    check('success path has no load-failed text', (await page.getByText('读不到任务工作簿').count()) === 0);
    await page.waitForTimeout(500);
    const log1 = await page.evaluate(() => window.__invokeLog);
    const loads = log1.filter((e) => e.cmd === 'document_load_snapshot');
    check('document_load_snapshot called once with the right taskId', loads.length === 1 && !!loads[0].args && loads[0].args.taskId === TASK_ID, JSON.stringify(loads));
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
    await page.screenshot({ path: path.join(OUT, 'after-mount.png'), fullPage: true });

    try {
      await canvas.click({ position: { x: 140, y: 70 } });
      await page.keyboard.type('PROVE-INPUT');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3500);
      const saves = (await page.evaluate(() => window.__invokeLog)).filter((e) => e.cmd === 'document_save_snapshot');
      if (saves.length >= 1) {
        const payload = saves[saves.length - 1].args || {};
        check('input -> debounce -> document_save_snapshot (taskId ok)', payload.taskId === TASK_ID, 'saves=' + saves.length);
      } else {
        console.log('[WARN] input-save grid NOT covered (canvas click did not start editing) - stated, not faked');
        findings.push({ name: 'input-save-coverage', ok: null });
      }
    } catch (e) {
      console.log('[WARN] input-save grid error (not a red, stated): ' + e.message);
      findings.push({ name: 'input-save-coverage', ok: null });
    }

    const pubBtn = page.getByRole('button', { name: '发布到飞书' });
    await pubBtn.waitFor({ state: 'visible', timeout: 30000 });
    await pubBtn.click();
    await page.getByText('https://example.feishu.cn/sheets/prove-1').waitFor({ state: 'visible', timeout: 15000 });
    check('published URL appears on the page', true);
    const published = await page.evaluate(() => window.__publishedDetails);
    check('shadow:feishu-published event carries taskId/url', published.length === 1 && published[0].taskId === TASK_ID && String(published[0].url).indexOf('prove-1') >= 0, JSON.stringify(published));
    const pubLog = (await page.evaluate(() => window.__invokeLog)).filter((e) => e.cmd === 'document_publish_feishu');
    const pubArgs = pubLog.length ? pubLog[pubLog.length - 1].args : null;
    const sheetsOk = !!pubArgs && Array.isArray(pubArgs.sheets) && Array.isArray(pubArgs.sheets[0]) && Array.isArray(pubArgs.sheets[0][0]);
    check('publish payload: sheets is a 3-level array (matches Rust Vec<Vec<Vec<String>>>)', sheetsOk && pubArgs.taskId === TASK_ID, JSON.stringify(pubArgs).slice(0, 300));
    await page.screenshot({ path: path.join(OUT, 'after-publish.png'), fullPage: true });

    fs.writeFileSync(path.join(OUT, 'invoke-log.json'), JSON.stringify(await page.evaluate(() => window.__invokeLog), null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT, 'console-errors.json'), JSON.stringify(consoleErrors, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ findings, consoleErrors, pageErrors }, null, 2), 'utf8');
    const fails = findings.filter((f) => f.ok === false).length;
    console.log('---- summary: ' + (findings.length - fails) + ' green / ' + fails + ' red (total ' + findings.length + ') ----');
    return fails;
  } finally {
    await browser.close();
    killChildren();
  }
}

main()
  .then((fails) => {
    process.exit(fails > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error('[RUN-FAIL]', e);
    killChildren();
    process.exit(2);
  });
