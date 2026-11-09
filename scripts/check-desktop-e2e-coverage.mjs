#!/usr/bin/env node
/**
 * **桌面端 E2E「真跑承重」闸** —— 「仓里有这个文件」**不等于**「它被跑过」。
 * ============================================================================
 *
 * ## 它守什么
 *
 * ⚠️ **2026-11-11 真跑级实测（本仓 iBLOC/shadow）**：
 *   · Playwright 族 **26 个规格**，CI 的 `playwright test` 命令**只点名 4 个**
 *     ⇒ ⇒ **22 个规格的断言从未在 CI 里被执行过**；
 *   · wdio 族 **4 个** ＋ tauri-e2e 族 **6 个** ＋ 旧 e2e-tests 族 **3 个**
 *     ⇒ ⇒ CI 里**一次都没跑过**（只有 E2E Typecheck 给它们做**类型**检查
 *     ⇒ ⇒ 「类型对了」≠「跑过了」）。
 *
 * ⇒ ⇒ 「仓里有这个测试文件」是**空头** ⇒ ⇒ 本闸把「谁真被跑过」变成显式清单：
 *   · **跑过的** ⇒ 由 CI 的命令**推导**（Playwright 的 `--list` 是**被测物**）；
 *   · **没跑过的** ⇒ 必须**登记**进 `scripts/lib/desktop-e2e-coverage-debt.mjs`。
 *
 * ## 五条红线（**判红**）
 *
 *   **C1 · 未登记的漏跑** —— 在盘上的 E2E 文件既没被 CI 跑到、也没登记
 *     ⇒ ⇒ 隐形债悄悄长出来了 ⇒ ⇒ 判红。
 *   **C2 · 过期登记** —— 登记的文件**在盘上已经不存在** ⇒ ⇒ 清单不许过期 ⇒ ⇒ 判红。
 *   **C3 · 已销账却没销** —— 登记的文件**现在被 CI 跑到了** ⇒ ⇒ 债已还 ⇒ ⇒ 判红。
 *   **C4 · 判不了** —— CI 点名的规格**对不上盘上任何文件**，或某家族被
 *     `--spec` 收窄过（覆盖不到整族）⇒ ⇒ 「跑过了」这句话**判不了**
 *     ⇒ ⇒ 退出码 **2**（不许伪装成绿）。
 *   **C5 · 尺子漂了** —— 静态推导出的覆盖集与 **Playwright 自己的 `--list`**
 *     对不上 ⇒ ⇒ 两把尺子不一致 ⇒ ⇒ 判红（**尺子要对着被测物**）。
 *
 * ## 分层读数（**不判红**，但要看得见）
 *
 *   每个家族：文件数 ｜ CI 覆盖 ｜ 未覆盖（其中 已登记 ｜ 未登记）
 *   ⇒ ⇒ 只给一个总数 ⇒ ⇒ 要分层（承「25 条条件化断言」那一条的教训）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-desktop-e2e-coverage.mjs
 * node scripts/check-desktop-e2e-coverage.mjs --self-test
 * node scripts/check-desktop-e2e-coverage.mjs --json
 * ```
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  FAMILIES,
  compareScale,
  detectRunnerFamilies,
  evaluateLedger,
  logicalCommands,
  parsePlaywrightArgs,
  resolvePlaywrightCoverage,
} from './lib/desktop-e2e-coverage.mjs';
import { COVERAGE_DEBT } from './lib/desktop-e2e-coverage-debt.mjs';
import { scanYamlText } from './lib/yaml-valid.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DESKTOP = path.join(REPO_ROOT, 'shadow-desktop');
const WORKFLOWS = path.join(REPO_ROOT, '.github', 'workflows');

function parseArgs(argv) {
  const opts = { selfTest: false, json: false };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--json') opts.json = true;
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

/** 递归列出某个目录下的文件（相对 `shadow-desktop/`）。 */
function listFiles(dir, base, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** 在盘上的 E2E 文件清单（按家族）。 */
function censusInventory() {
  const inventory = new Map();
  let found = 0;
  for (const family of FAMILIES) {
    const dir = path.join(DESKTOP, family.dir);
    let all = [];
    if (fs.existsSync(dir)) all = listFiles(dir, DESKTOP, []);
    const files = all.filter((f) => f.endsWith(family.ext)).sort();
    inventory.set(family.id, files);
    found += files.length;
  }
  return { inventory, found };
}

/** 全部 workflow 的 `run:` 正文（**用自家 YAML 扫描器** ⇒ 狗粮）。 */
function readRunTexts() {
  const texts = [];
  if (!fs.existsSync(WORKFLOWS)) return texts;
  for (const file of fs.readdirSync(WORKFLOWS).sort()) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const raw = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
    const doc = scanYamlText(raw, { workflow: true }).doc;
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'map') {
        for (const entry of node.entries) {
          if (entry.key === 'run' && entry.value) {
            const v = entry.value;
            if (v.type === 'scalar' || v.type === 'block-scalar') texts.push(String(v.value || ''));
          }
          walk(entry.value);
        }
        return;
      }
      if (node.type === 'seq') for (const item of node.items) walk(item.node);
    };
    walk(doc);
  }
  return texts;
}

/**
 * 用 **Playwright 自己**的 `--list` 取「哪些文件真被跑」⇒ ⇒ **尺子对着被测物**。
 *
 * ⚠️ 这是本闸最承重的一格：静态推导（主干 ⇒ 文件）可能与真实匹配规则漂移
 *   ⇒ ⇒ 而 `--list` 是**被测物自己的读数** ⇒ ⇒ 对不上就说明尺子漂了（C5）。
 *
 * @returns {{covered: string[] | null, unavailable: boolean, reason: string}}
 */
function probePlaywrightList(stems) {
  // ⚠️ **直调 `@playwright/test/cli.js`**（**不经 shell**）⇒ ⇒ 跨平台、
  //   参数不被 shell 吃掉（`shell: true` 会把带引号的参数处理掉 ⇒ ⇒ 真 CI 上
  //   探针会读错）。⚠️ `playwright` 顶层包在 pnpm 下**不一定**装在
  //   `node_modules/` 根（只在 `.pnpm/` 里）⇒ ⇒ 认准 `@playwright/test`。
  const cli = path.join(DESKTOP, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!fs.existsSync(cli)) {
    return { covered: null, unavailable: true, reason: '桌面端没装 @playwright/test ⇒ ⇒ 判不了' };
  }
  const args = [cli, 'test', '--list', '--reporter=list'].concat(stems);
  const res = spawnSync(process.execPath, args, {
    cwd: DESKTOP,
    encoding: 'utf8',
    timeout: 120000,
  });
  const output = String(res.stdout || '') + String(res.stderr || '');
  const covered = new Set();
  const re = /^\s*\[chromium\]\s*›\s*([^:]+?)\s*:/gm;
  let m;
  while ((m = re.exec(output)) !== null) covered.add(m[1].trim());
  if (res.status !== 0 && covered.size === 0) {
    const total = /Total:\s*(\d+)\s+tests?\s+in\s+(\d+)\s+files?/.exec(output);
    if (total && Number(total[2]) === 0) {
      return { covered: [], unavailable: false, reason: 'Playwright 报「No tests found」⇒ ⇒ 零覆盖' };
    }
    return { covered: null, unavailable: true, reason: 'playwright --list 退出码 ' + res.status };
  }
  return { covered: Array.from(covered).sort(), unavailable: false, reason: '' };
}

/**
 * 判据自检 —— **真的会红**：每一例都同时钉「该抓的抓得到」与「不该抓的不抓」。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('逻辑命令：行尾续行 ⇒ ⇒ 接成一条（CI 那条命令是跨三行的）', () => {
    const cmds = logicalCommands('pnpm exec playwright test --reporter=github \\\n  a b \\\n  c > "$OUT"');
    return cmds.length === 1 && cmds[0].includes('a b c');
  });
  add('位置参数：只取不带 - 的（--reporter 不算文件名）', () => {
    const args = parsePlaywrightArgs('pnpm exec playwright test --reporter=github e2e-a e2e-b');
    return args.length === 2 && args[0] === 'e2e-a' && args[1] === 'e2e-b';
  });
  add('位置参数：遇到重定向就停（> "$OUT" 不是文件名）', () => {
    const args = parsePlaywrightArgs('playwright test a > "$OUT" 2>&1');
    return args.length === 1 && args[0] === 'a';
  });
  add('位置参数：带值的开关要吃掉它的值（--grep x 不是文件名）', () => {
    const args = parsePlaywrightArgs('playwright test --grep foo e2e-a');
    return args.length === 1 && args[0] === 'e2e-a';
  });
  add('覆盖推导：主干 ⇒ 文件（只认唯一命中）', () => {
    const inv = ['tests/e2e-ui/a.spec.ts', 'tests/e2e-ui/b.spec.ts'];
    const r = resolvePlaywrightCoverage(['a'], inv);
    return r.covered.length === 1 && r.covered[0] === 'tests/e2e-ui/a.spec.ts' && r.unresolved.length === 0;
  });
  add('覆盖推导：对不上任何文件 ⇒ ⇒ 判不了（不许猜）', () => {
    const inv = ['tests/e2e-ui/a.spec.ts'];
    const r = resolvePlaywrightCoverage(['zzz'], inv);
    return r.covered.length === 0 && r.unresolved.length === 1;
  });
  add('runner 家族识别：CI 里有 wdio run ⇒ ⇒ wdio 族算跑过', () => {
    const r = detectRunnerFamilies(['pnpm test:wdio']);
    return r.families.has('wdio') && !r.families.has('tauri-e2e');
  });
  add('runner 家族识别：--spec 收窄 ⇒ ⇒ 只能覆盖一部分 ⇒ ⇒ 判不了', () => {
    const r = detectRunnerFamilies(['wdio run tests/wdio/wdio.conf.ts --spec tests/wdio/api.test.ts']);
    return r.families.has('wdio') && r.narrowed.has('wdio');
  });
  add('C1：未登记的漏跑 ⇒ ⇒ 必须抓到', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    inventory.set('playwright', ['tests/e2e-ui/a.spec.ts']);
    const res = evaluateLedger({ inventory, covered: new Map(), ledger: [] });
    return res.violations.some((v) => v.kind === 'unregistered-uncovered' && v.file === 'tests/e2e-ui/a.spec.ts');
  });
  add('C1 孪生：登记过了 ⇒ ⇒ 不许抓', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    inventory.set('playwright', ['tests/e2e-ui/a.spec.ts']);
    const res = evaluateLedger({
      inventory,
      covered: new Map(),
      ledger: [{ family: 'playwright', file: 'tests/e2e-ui/a.spec.ts', reason: 'x' }],
    });
    return !res.violations.some((v) => v.kind === 'unregistered-uncovered');
  });
  add('C2：登记的文件在盘上没了 ⇒ ⇒ 必须抓到（要销账）', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    const res = evaluateLedger({
      inventory,
      covered: new Map(),
      ledger: [{ family: 'playwright', file: 'tests/e2e-ui/gone.spec.ts', reason: 'x' }],
    });
    return res.violations.some((v) => v.kind === 'stale-ledger');
  });
  add('C3：登记的文件现在被 CI 跑到了 ⇒ ⇒ 必须抓到（债已还）', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    inventory.set('playwright', ['tests/e2e-ui/a.spec.ts']);
    const res = evaluateLedger({
      inventory,
      covered: new Map([['playwright', ['tests/e2e-ui/a.spec.ts']]]),
      ledger: [{ family: 'playwright', file: 'tests/e2e-ui/a.spec.ts', reason: 'x' }],
    });
    return res.violations.some((v) => v.kind === 'covered-but-registered');
  });
  add('C4：CI 点名的规格对不上盘上文件 ⇒ ⇒ 必须判不了', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    const res = evaluateLedger({
      inventory,
      covered: new Map(),
      ledger: [],
      unresolvedStems: ['zzz'],
    });
    return res.violations.some((v) => v.kind === 'unresolved-filter');
  });
  add('C6：同一个文件登记了两遍 ⇒ ⇒ 必须抓到（清单不可信）', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    inventory.set('e2e-tests', ['e2e-tests/specs/app.e2e.js']);
    const res = evaluateLedger({
      inventory,
      covered: new Map(),
      ledger: [
        { family: 'e2e-tests', file: 'e2e-tests/specs/app.e2e.js', reason: 'x' },
        { family: 'e2e-tests', file: 'e2e-tests/specs/app.e2e.js', reason: 'x' },
      ],
    });
    return res.violations.some((v) => v.kind === 'duplicate-ledger');
  });
  add('C6 孪生：各登记一次 ⇒ ⇒ 不许抓', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    inventory.set('e2e-tests', ['e2e-tests/specs/app.e2e.js', 'e2e-tests/specs/providers.e2e.js']);
    const res = evaluateLedger({
      inventory,
      covered: new Map(),
      ledger: [
        { family: 'e2e-tests', file: 'e2e-tests/specs/app.e2e.js', reason: 'x' },
        { family: 'e2e-tests', file: 'e2e-tests/specs/providers.e2e.js', reason: 'x' },
      ],
    });
    return !res.violations.some((v) => v.kind === 'duplicate-ledger');
  });
  add('C5：静态推导与被测物读数不一致 ⇒ ⇒ 必须抓到（尺子漂了）', () => {
    const drift = compareScale(
      ['tests/e2e-ui/conversation.spec.ts'],
      ['conversation-chat.spec.ts', 'conversation.spec.ts'],
    );
    return drift.length === 1 && drift[0] === 'conversation-chat.spec.ts';
  });
  add('C5 孪生：两把尺子一致 ⇒ ⇒ 不许报漂移', () => {
    const drift = compareScale(
      ['tests/e2e-ui/a.spec.ts', 'tests/e2e-ui/b.spec.ts'],
      ['a.spec.ts', 'b.spec.ts'],
    );
    return drift.length === 0;
  });
  add('读数分层：总数与分层能对上（对不上 ⇒ ⇒ 分层实现有洞）', () => {
    const inventory = new Map(FAMILIES.map((f) => [f.id, []]));
    inventory.set('playwright', ['tests/e2e-ui/a.spec.ts', 'tests/e2e-ui/b.spec.ts']);
    const res = evaluateLedger({
      inventory,
      covered: new Map([['playwright', ['tests/e2e-ui/a.spec.ts']]]),
      ledger: [{ family: 'playwright', file: 'tests/e2e-ui/b.spec.ts', reason: 'x' }],
    });
    const row = res.readings.find((r) => r.family === 'playwright');
    return row.files === 2 && row.covered === 1 && row.uncovered === 1 && row.registered === 1 && row.unregistered === 0;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) return selfTest();

  const { inventory, found } = censusInventory();
  if (found === 0) {
    console.error('❌ 一个 E2E 文件都没读到 ⇒ ⇒ 判不了（不是「没问题」）');
    process.exit(2);
  }

  const runTexts = readRunTexts();
  const stems = [];
  for (const text of runTexts) stems.push(...parsePlaywrightArgs(text));
  const uniqueStems = Array.from(new Set(stems)).sort();

  const runner = detectRunnerFamilies(runTexts);

  // ── 静态推导的覆盖集 ──────────────────────────────────────────────
  const covered = new Map();
  const unresolvedStems = [];
  const pwInv = inventory.get('playwright') || [];
  const pw = resolvePlaywrightCoverage(uniqueStems, pwInv);
  covered.set('playwright', pw.covered);
  unresolvedStems.push(...pw.unresolved);
  for (const family of FAMILIES) {
    if (family.id === 'playwright') continue;
    covered.set(family.id, runner.families.has(family.id) ? (inventory.get(family.id) || []).slice() : []);
  }

  // ── C5：用被测物自己（playwright --list）校一遍尺子 ───────────────
  const probe = probePlaywrightList(uniqueStems);
  const scaleDrift = [];
  if (!probe.unavailable) {
    scaleDrift.push(...compareScale(pw.covered, probe.covered));
  }

  const { violations, readings, coveredTotal, uncoveredTotal } = evaluateLedger({
    inventory,
    covered,
    ledger: COVERAGE_DEBT,
    unresolvedStems,
  });

  // 收窄过的家族 ⇒ ⇒ 覆盖不到整族 ⇒ ⇒ 判不了。
  const narrowedFamilies = Array.from(runner.narrowed).filter((f) => f !== 'playwright');

  const hard = violations.filter((v) => v.kind !== 'unresolved-filter');
  const cannotJudge = violations.filter((v) => v.kind === 'unresolved-filter');

  if (opts.json) {
    console.log(JSON.stringify({
      families: readings,
      coveredTotal,
      uncoveredTotal,
      debtEntries: COVERAGE_DEBT.length,
      violations,
      scaleDrift,
      cannotJudge: narrowedFamilies,
      probeUnavailable: probe.unavailable ? probe.reason : null,
    }, null, 2));
  } else {
    console.log('桌面端 E2E 真跑承重：文件 ' + found + ' ｜ CI 覆盖 ' + coveredTotal + ' ｜ 未覆盖 ' + uncoveredTotal +
      '（登记 ' + COVERAGE_DEBT.length + ' 条）');
    console.log('');
    for (const row of readings) {
      console.log(
        '  ' + row.label.padEnd(18) + ' 文件 ' + String(row.files).padStart(2) +
        ' ｜ CI 覆盖 ' + String(row.covered).padStart(2) +
        ' ｜ 未覆盖 ' + String(row.uncovered).padStart(2) +
        '（已登记 ' + String(row.registered).padStart(2) + ' ｜ 未登记 ' + String(row.unregistered).padStart(2) + '）',
      );
    }
    if (probe.unavailable) {
      console.log('');
      console.log('⚠ Playwright --list 探针：' + probe.reason + ' ⇒ ⇒ C5 这一格本轮**判不了**');
    }
    for (const f of scaleDrift) {
      console.log('');
      console.log('❌ [C5] 尺子与被测物不一致：静态推导与 playwright --list 的读数对不上 ⇒ ⇒ ' + f);
    }
    for (const v of hard) {
      console.log('');
      console.log('❌ [' + v.kind + '] ' + v.message);
    }
    for (const v of cannotJudge) {
      console.log('');
      console.log('⚠ [C4] ' + v.message);
    }
    for (const f of narrowedFamilies) {
      console.log('');
      console.log('⚠ [C4] 家族「' + f + '」在 CI 里被 --spec 收窄过 ⇒ ⇒ 覆盖不到整族 ⇒ ⇒ 「整族都跑过了」这句话判不了');
    }
    if (hard.length === 0 && scaleDrift.length === 0 && cannotJudge.length === 0 && narrowedFamilies.length === 0) {
      console.log('');
      console.log('✅ 零违规（' + found + ' 个 E2E 文件：CI 覆盖 ' + coveredTotal + ' ｜ 未覆盖 ' + uncoveredTotal + ' 全部登记在册）');
    }
  }

  if (cannotJudge.length > 0 || narrowedFamilies.length > 0) process.exit(2);
  if (hard.length > 0 || scaleDrift.length > 0) process.exit(1);
  process.exit(0);
}

main();
