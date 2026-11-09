#!/usr/bin/env node
/**
 * **测试里的「全局替换泄漏」** —— 闸
 * ============================================================================
 *
 * ## 它守什么
 *
 * 2026-11-09 真机实测（iBLOC/shadow 桌面端，vitest 3.2.4）：单 worker 下**整仓飘红**
 * （失败文件逐轮漂：6 → 4 → 5 → 1 → 8 → 4）⇒ ⇒ 根因是**四处**全局替换**泄漏**：
 *
 *   · **族 A** · `vi.stubGlobal('window', …)` 整体替换 ⇒ ⇒ vitest 默认
 *     `unstubGlobals: false` ⇒ ⇒ **跨文件泄漏**给同 worker 的后续文件；
 *   · **族 B** · 原生 `Object.defineProperty(globalThis, 'localStorage', …)`
 *     ⇒ ⇒ **不受** `vi.unstubAllGlobals()` 保护 ⇒ ⇒ 同样泄漏。
 *
 * ⚠️ **两族的症状长得一样** ⇒ ⇒ 不能靠症状区分 ⇒ ⇒ 必须靠「谁替换了什么全局」。
 *
 * ## 判据
 *
 *   · **族 A**：整体替换 `window`/`globalThis`/`document`/`self`
 *     ⇒ ⇒ 该文件（或该工程的 setup）必须有 `vi.unstubAllGlobals()` 还原。
 *   · **族 B**：原生 `defineProperty` 覆盖状态载体
 *     ⇒ ⇒ 该文件必须有**原值备份**（`getOwnPropertyDescriptor`）**且有还原**。
 *   · **setup 文件**：**有守卫的兜底**（只在值本来就缺时才补）⇒ ⇒ 不判红；
 *     **无条件接管** ⇒ ⇒ 判红。
 *
 * ## 覆盖面：**靠发现**（扫 `vitest.config.*`）⇒ ⇒ 新工程自动进面
 *
 * ## 退出码
 *
 *   **0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ⇒ 不许伪装成「没问题」）。
 *
 * 用法：
 *   node scripts/check-test-global-leaks.mjs                # 判定
 *   node scripts/check-test-global-leaks.mjs --self-test    # 判据自检（会红）
 *   node scripts/check-test-global-leaks.mjs --root=<目录>   # 扫别处
 *   node scripts/check-test-global-leaks.mjs --json         # 机器可读
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  censusGlobalLeaks,
  scanSource,
  STATE_GLOBALS,
  WHOLE_GLOBALS,
} from './lib/test-global-leaks.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const opts = { selfTest: false, json: false, root: REPO_ROOT };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--root=')) opts.root = resolve(arg.slice('--root='.length));
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * 判据自检 —— **真的会红**：每一例都同时钉「该抓的抓得到」与「不该抓的不抓」。
 * ⚠️ **孪生必须成对**（2026-11-09 实测教训）：只钉「抓得到」⇒ ⇒ 尺子可能
 *    因为「什么都抓」而恒红 ⇒ ⇒ 判据就没有分辨力。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  // ── 族 A ────────────────────────────────────────────────────────────
  add('族 A：整体替换 window 且无还原 ⇒ ⇒ 必须抓到', () => {
    const r = scanSource("vi.stubGlobal('window', { location: {} });\n", 'a.test.ts');
    return r.candidates.length === 1 && r.candidates[0].family === 'A'
      && r.candidates[0].var === 'window';
  });
  add('族 A 孪生：加了 vi.unstubAllGlobals ⇒ ⇒ 不许再抓', () => {
    const r = scanSource(
      "afterEach(() => { vi.unstubAllGlobals(); });\nvi.stubGlobal('window', {});\n",
      'a.test.ts',
    );
    return r.candidates.length === 0;
  });
  add('族 A：注释里写的替换 ⇒ ⇒ 不许抓（那是说明文字）', () => {
    const r = scanSource("// vi.stubGlobal('window', { location: {} });\n", 'a.test.ts');
    return r.candidates.length === 0;
  });
  add('族 A：字符串里写的替换 ⇒ ⇒ 不许抓', () => {
    const r = scanSource('const s = "vi.stubGlobal(\'window\', { })";\n', 'a.test.ts');
    return r.candidates.length === 0;
  });
  add('族 A：弱泄漏（fetch）⇒ ⇒ 必须抓到（实测：它同样跨文件泄漏）', () => {
    const r = scanSource("vi.stubGlobal('fetch', mockFetch);\n", 'a.test.ts');
    return r.candidates.length === 1 && r.candidates[0].family === 'A';
  });
  add('族 A 孪生：工程级兜底（配置 unstubGlobals）⇒ ⇒ 不许再抓', () => {
    const r = scanSource("vi.stubGlobal('fetch', mockFetch);\n", 'a.test.ts', {
      projectHasUnstub: true,
    });
    return r.candidates.length === 0;
  });

  // ── 族 B ────────────────────────────────────────────────────────────
  add('族 B：原生 defineProperty 无备份无还原 ⇒ ⇒ 必须抓到', () => {
    const r = scanSource(
      "Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });\n",
      'b.test.ts',
    );
    return r.candidates.length === 1 && r.candidates[0].family === 'B';
  });
  add('族 B 孪生：备份 ＋ 还原成对 ⇒ ⇒ 不许再抓', () => {
    const src = [
      "const __orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');",
      "function install() { Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true }); }",
      "function restore() { if (__orig) Object.defineProperty(globalThis, 'localStorage', __orig); else Reflect.deleteProperty(globalThis, 'localStorage'); }",
    ].join('\n');
    return scanSource(src, 'b.test.ts').candidates.length === 0;
  });
  add('族 B：只备份不还原 ⇒ ⇒ 必须抓到（备份了也救不了）', () => {
    const src = [
      "const __orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');",
      "Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });",
    ].join('\n');
    return scanSource(src, 'b.test.ts').candidates.length === 1;
  });
  add('族 B：setup 的守卫兜底 ⇒ ⇒ 不许抓（它填的是本来就缺的那个）', () => {
    const src = [
      "if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.clear !== 'function') {",
      "  Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });",
      '}',
    ].join('\n');
    return scanSource(src, 'tests/setup.ts').candidates.length === 0;
  });
  add('族 B 孪生：守卫兜底 + 中间隔一大段注释 ⇒ ⇒ 仍不许抓（2026-11-09 实测踩到）', () => {
    const src = [
      "if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.clear !== 'function') {",
      '  // 这段注释故意写得很长很长很长很长很长很长很长很长很长很长很长很长很长',
      '  // 用来证明闸的判定不看注释长度而看结构（上一版会在这里改判 ⇒ ⇒ CI 红）',
      '  // 再补几行把守卫 if 往远处推：',
      '  //   0123456789012345678901234567890123456789012345678901234567890123456789',
      '  //   0123456789012345678901234567890123456789012345678901234567890123456789',
      "  Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });",
      '}',
    ].join('\n');
    return scanSource(src, 'tests/setup.ts').candidates.length === 0;
  });
  add('族 B 孪生：守卫 if 包着 else 分支 ⇒ ⇒ else 里那条也算有守卫 ⇒ ⇒ 不许抓', () => {
    const src = [
      "if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.clear !== 'function') {",
      "  if (typeof window !== 'undefined' && typeof window.localStorage?.clear === 'function') {",
      "    Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, writable: true, configurable: true });",
      '  } else {',
      "    Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });",
      '  }',
      '}',
    ].join('\n');
    return scanSource(src, 'tests/setup.ts').candidates.length === 0;
  });
  add('族 B 孪生：有 if 但条件与状态载体无关 ⇒ ⇒ 必须抓到（不许被结构化放过）', () => {
    const src = [
      'if (someOtherCondition) {',
      "  Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });",
      '}',
    ].join('\n');
    return scanSource(src, 'tests/setup.ts').candidates.length === 1;
  });
  add('族 B：setup 无条件接管 ⇒ ⇒ 必须抓到（它会覆盖真值）', () => {
    const src = "Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });";
    return scanSource(src, 'tests/setup.ts').candidates.length === 1;
  });

  // ── 覆盖面（靠发现）────────────────────────────────────────────────
  add('覆盖面：被发现的 vitest 工程都不是 worktree（.git 是文件）', () => {
    const c = censusGlobalLeaks(REPO_ROOT);
    for (const p of c.projects) {
      const g = join(p, '.git');
      if (existsSync(g) && statSync(g).isFile()) return false;
    }
    return true;
  });
  add('覆盖面：整仓普查的结构自洽（工程与文件都扫到了）', () => {
    const c = censusGlobalLeaks(REPO_ROOT);
    return c.summary.projectsFound >= 1 && c.summary.filesScanned >= 1
      && Array.isArray(c.candidates);
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try { ok = c.run() === true; } catch { ok = false; }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) selfTest();

  if (!existsSync(opts.root)) {
    console.error('❌ 读不到根目录：' + opts.root + ' ⇒ ⇒ 判不了 ≠ 没问题');
    return 2;
  }

  const census = censusGlobalLeaks(opts.root);
  const s = census.summary;

  if (opts.json) {
    console.log(JSON.stringify({ root: opts.root, summary: s, candidates: census.candidates, unjudged: census.unjudged }, null, 2));
  } else {
    console.log(
      '全局替换泄漏普查：工程 ' + s.projectsFound + ' 个 ｜ 测试文件 ' + s.filesScanned +
        ' 个（含 setup ' + s.setupScanned + ' 个）｜ 候选 ' + s.candidates + ' 个',
    );
    for (const c of census.candidates) {
      console.log('❌ [' + c.family + '] ' + c.file + ':' + c.line + ' —— ' + c.reason);
    }
    for (const u of census.unjudged) {
      console.log('⚠ [判不了] 工程「' + u.project + '」—— ' + u.reason);
    }
  }

  // ⚠️ **判不了 ≠ 没问题** ⇒ ⇒ 扫不到任何工程 / 有工程读不出测试文件 ⇒ ⇒ 退出码 2
  if (s.projectsFound === 0) {
    console.error('❌ 一个 vitest 工程都没发现 ⇒ ⇒ 判不了 ≠ 没问题');
    return 2;
  }
  if (s.unjudged > 0) {
    console.error('❌ 有 ' + s.unjudged + ' 个工程判不了 ⇒ ⇒ 判不了 ≠ 没问题');
    return 2;
  }
  if (s.candidates > 0) {
    console.error('❌ 发现 ' + s.candidates + ' 处「全局替换没有还原」⇒ ⇒ 会跨文件泄漏');
    return 1;
  }
  console.log('✅ 零候选（没有「全局替换了却没还原」的地方）');
  return 0;
}

process.exit(main());
