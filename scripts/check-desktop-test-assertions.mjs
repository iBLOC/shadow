#!/usr/bin/env node
/**
 * **桌面端用例的「断言承重闸」** —— 「跑过了」这个事实本身也要被证一次。
 * ============================================================================
 *
 * ## 它守什么
 *
 * 一条用例「跑过了」这句话，本身**也要被证一次**。
 *
 * ⚠️ **为什么桌面端有这一族**（2026-11-09 真机实测，本仓 iBLOC/shadow）：
 *   · `expect(url).toBeTruthy()` ⇒ ⇒ URL 永远是**非空字符串** ⇒ ⇒ 恒真；
 *   · `expect(text).toBeTruthy()`（`text` = 整页 body 文本）⇒ ⇒ 任何**渲染出来的**
 *     页面都有文字 —— 包括「404 Not Found」「Unauthorized」那种
 *     ⇒ ⇒ **端脑整个坏了它照样绿**；
 *   · `if (await input.isExisting()) { …断言… }` ⇒ ⇒ 元素不存在 ⇒ ⇒ **零断言通过**；
 *   · 「调一下不炸」那种用例（`await companion.stop()`）⇒ ⇒ **一条断言都没有**。
 * ⇒ ⇒ 这几种在真跑时都表现为「**PASS**」⇒ ⇒ 而**什么都没被证明**。
 *
 * ⚠️ **与移动端那份的关系** —— `scripts/check-mobile-test-assertions.mjs` 是
 *   **Dart 版**，本文件是 **TypeScript 版** ⇒ ⇒ 同一条规则的两种语言实现
 *   ⇒ ⇒ 红线定义写在各自的 lib 头注释里（语义要对齐，实现各归各的语言）。
 *
 * ## 四条红线（**判红**）
 *
 *   **R1 · 恒真断言** —— 断言的**主体是字面量常量**（`expect(true).toBe(true)`）
 *     ⇒ ⇒ 断言结果与被测物无关 ⇒ ⇒ 零信息量。
 *     ⚠️ **只抓「字面量」不抓「标识符」** —— `expect(count).toBe(3)` 的结论
 *     由被测物决定 ⇒ ⇒ 有承重 ⇒ ⇒ 不判红。
 *
 *   **R2 · 空断言用例** —— 用例体里**一条承重断言都没有**。
 *     ⚠️ **「找不到就抛异常」的查询也算承重** —— `await screen.findByText('x')`
 *     找不到会抛 ⇒ ⇒ 用例会红 ⇒ ⇒ 它**就是**一条断言 ⇒ ⇒ 不许把它算成零断言。
 *
 *   **R3 · 弱断言独占** —— 用例的**全部**断言都是 `toBeTruthy()` 挂在裸标识符上
 *     ⇒ ⇒ 它只能证明「某个值不是空的」⇒ ⇒ **证明不了用例名宣称的那件事**。
 *     ⚠️ `toBeFalsy()` / `toBeNull()` / `toThrow()` **不算弱** —— 它们要求
 *     被测物**恰好**是那个形状 ⇒ ⇒ 有承重。
 *
 *   **R4 · 假绿风险** —— 用例的**全部**断言都落在「没有 else 的 if」分支里
 *     ⇒ ⇒ 分支不进 ⇒ ⇒ 整条用例**零断言通过**（绿得毫无意义）。
 *     ⚠️ **分支恒进不算** —— 条件若是「找不到就抛异常」的查询（`getBy*` /
 *     `findBy*`，或由它赋值来的标识符）⇒ ⇒ 分支要么进、要么用例红
 *     ⇒ ⇒ 里面的断言**总会跑** ⇒ ⇒ 不判红。
 *
 * ## 读数（**不判红**，但要看得见）
 *
 *   · **条件化断言** —— 断言落在「没有 else 的 if」分支里（分支不进 ⇒ 零断言）；
 *     其中「分支恒进」的单独计数 ⇒ ⇒ **那个总数不是风险数**（2026-11-09 实测：
 *     25 条里真·假绿 **0** 条 ⇒ ⇒ 真实的风险规模要分层数，不能拿总数吓人）。
 *
 * ## 防假绿
 *
 * · 判据自检（**孪生成对**）⇒ ⇒ 证明尺子**有牙**且**不恒红**；
 * · 一个文件都没读到 ⇒ ⇒ 退出码 2（不是 0）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-desktop-test-assertions.mjs
 * node scripts/check-desktop-test-assertions.mjs --self-test
 * node scripts/check-desktop-test-assertions.mjs --json
 * ```
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  censusDesktopAssertions,
  scanTypeScriptSource,
  scanPlaywrightSource,
} from './lib/desktop-test-assertions.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
/** 要扫的两棵子树（桌面端的用例都在这儿）。 */
const SCAN_ROOTS = ['tests', 'src'];

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

/**
 * 夹具 —— **每段代码都只用单引号**（免得夹具自己把脚本写炸）。
 *
 * ⚠️ 实测踩到过：写闸的脚本里**嵌套双引号**会把脚本本身写成语法错
 * ⇒ ⇒ 闸还没跑就自己炸了 ⇒ ⇒ 那一刀白挨。
 */
const FIX = {
  r1True: [
    "  it('x', () => { expect(true).toBe(true); });",
  ],
  r1String: [
    "  it('x', () => { expect('abc').toBe('abc'); });",
  ],
  r1Var: [
    "  it('x', () => { expect(count).toBe(3); });",
  ],
  r1InString: [
    "  it('x', () => { const s = 'expect(true).toBe(true)'; expect(n).toBe(1); });",
  ],
  afterTemplate: [
    "  it('x', () => {",
    '    const s = `tpl`;',
    '    expect(true).toBe(true);',
    '  });',
  ],
  zeroAssert: [
    "  it('x', async () => { await page.goto('/'); });",
  ],
  findByOnly: [
    "  it('x', async () => { await screen.findByText('tasks.title'); });",
  ],
  hasExpect: [
    "  it('x', () => { expect(n).toBe(1); });",
  ],
  weakOnly: [
    "  it('x', async () => {",
    '    const url = await browser.getUrl();',
    '    expect(url).toBeTruthy();',
    '  });',
  ],
  strongOnly: [
    "  it('x', async () => {",
    '    const status = await res.status();',
    '    expect(status).toBe(200);',
    '  });',
  ],
  weakPlusFindBy: [
    "  it('x', async () => {",
    "    await screen.findByText('x');",
    "    const el = await browser.$('#root');",
    '    expect(el).toBeTruthy();',
    '  });',
  ],
  r4FalseGreen: [
    "  it('x', () => {",
    '    const maybe = Math.random() > 2;',
    '    if (maybe) {',
    '      expect(maybe).toBe(true);',
    '    }',
    '  });',
  ],
  r4WithUnconditional: [
    "  it('x', () => {",
    '    const maybe = Math.random() > 2;',
    '    if (maybe) {',
    '      expect(maybe).toBe(true);',
    '    }',
    '    expect(count).toBe(1);',
    '  });',
  ],
  r4AlwaysRuns: [
    "  it('x', () => {",
    "    const el = screen.getByText('x');",
    '    if (el) {',
    "      expect(el.textContent).toBe('x');",
    '    }',
    '  });',
  ],  falsyOnly: [
    "  it('x', async () => {",
    '    const err = await read();',
    '    expect(err).toBeFalsy();',
    '  });',
  ],
};

/** 把一段夹具包成一个测试文件。 */
function fixture(lines) {
  return [
    "import { describe, it, expect } from 'vitest';",
    "describe('fixture', () => {",
    ...lines,
    '});',
  ].join('\n');
}

const scan = (lines) => scanTypeScriptSource(fixture(lines), 'fixture.test.ts');

/** Playwright 族的夹具 —— 语义与 vitest **不同**（刀 O，2026-11-11 真机实测）。 */
const PW_FIX = {
  softGuard: [
    "import { test, expect } from '@playwright/test';",
    "test('soft guard', async ({ page }) => {",
    '  const box = page.locator(\'[data-testid="x"]\');',
    '  if (await box.isVisible()) {',
    '    await expect(box).toBeVisible();',
    '  }',
    '});',
  ],
  softAssigned: [
    "import { test, expect } from '@playwright/test';",
    "test('soft assigned', async ({ page }) => {",
    '  const items = page.locator(\'[data-testid="y"]\');',
    '  const n = await items.count();',
    '  if (n > 0) {',
    '    await expect(items.first()).toBeVisible();',
    '  }',
    '});',
  ],
  noGuard: [
    "import { test, expect } from '@playwright/test';",
    "test('no guard', async ({ page }) => {",
    '  const box = page.locator(\'[data-testid="z"]\');',
    '  await expect(box).toBeVisible();',
    '});',
  ],
  hardGuard: [
    "import { test, expect } from '@playwright/test';",
    "test('hard guard', async ({ page }) => {",
    '  const box = page.locator(\'[data-testid="w"]\');',
    '  if (await box.getAttribute(\'id\') !== null) {',
    '    await expect(box).toBeVisible();',
    '  }',
    '});',
  ],
  zeroAssert: [
    "import { test, expect } from '@playwright/test';",
    "test('zero assert', async ({ page }) => {",
    "  await page.goto('/');",
    '});',
  ],
  describeNotCase: [
    "import { test, expect } from '@playwright/test';",
    "test.describe('a describe', () => {",
    "  test('inner', async ({ page }) => {",
    "    await expect(page.locator('h1')).toContainText('x');",
    '  });',
    '});',
  ],
};

/** 扫一段 Playwright 夹具。 */
const pwScan = (lines) => scanPlaywrightSource(lines.join('\n'), 'fixture.spec.ts');

/**
 * 判据自检 —— **真的会红**：每一例都同时钉「该抓的抓得到」与「不该抓的不抓」。
 *
 * ⚠️ **孪生必须成对** —— 只钉「抓得到」⇒ ⇒ 尺子可能因为「什么都抓」而恒红
 * ⇒ ⇒ 判据就没有分辨力。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  // ── R1 · 恒真断言 ─────────────────────────────────────────────────
  add('R1：主体是 true ⇒ ⇒ 必须抓到', () => {
    return scan(FIX.r1True).tautologies.length === 1;
  });
  add('R1：主体是字符串字面量 ⇒ ⇒ 必须抓到', () => {
    return scan(FIX.r1String).tautologies.length === 1;
  });
  add('R1 孪生：主体是标识符（常量钉桩）⇒ ⇒ 不许抓', () => {
    return scan(FIX.r1Var).tautologies.length === 0;
  });
  add('R1 孪生：字符串里面写的 ⇒ ⇒ 不许抓（那是数据，不是代码）', () => {
    return scan(FIX.r1InString).tautologies.length === 0;
  });

  // ── 掩码：模板串不许让偏移错位（2026-11-09 实测踩到的坑）──────────
  add('掩码：模板串之后偏移不许错位 ⇒ ⇒ 后面那条恒真断言仍被抓', () => {
    return scan(FIX.afterTemplate).tautologies.length === 1;
  });

  // ── R2 · 空断言用例 ───────────────────────────────────────────────
  add('R2：用例体零承重 ⇒ ⇒ 必须抓到', () => {
    return scan(FIX.zeroAssert).zeroAssert.length === 1;
  });
  add('R2 孪生：findBy（找不到就抛）也算承重 ⇒ ⇒ 不许抓', () => {
    return scan(FIX.findByOnly).zeroAssert.length === 0;
  });
  add('R2 孪生：体里有 expect ⇒ ⇒ 不许抓', () => {
    return scan(FIX.hasExpect).zeroAssert.length === 0;
  });

  // ── R3 · 弱断言独占 ───────────────────────────────────────────────
  add('R3：唯一断言是裸标识符上的 toBeTruthy ⇒ ⇒ 必须抓到', () => {
    return scan(FIX.weakOnly).weakOnly.length === 1;
  });
  add('R3 孪生：断言是具体值 ⇒ ⇒ 不许抓', () => {
    return scan(FIX.strongOnly).weakOnly.length === 0;
  });
  add('R3 孪生：toBeTruthy 加 findBy ⇒ ⇒ 不许抓（findBy 承重）', () => {
    return scan(FIX.weakPlusFindBy).weakOnly.length === 0;
  });
  add('R3 孪生：toBeFalsy 要求恰好是那个形状 ⇒ ⇒ 有承重 ⇒ ⇒ 不许抓', () => {
    return scan(FIX.falsyOnly).weakOnly.length === 0;
  });

  // ── R4 · 假绿风险（承重全挂在可能不进的分支上）───────────────────
  add('R4：全部断言都在「没有 else 的 if」分支里 ⇒ ⇒ 必须抓到', () => {
    return scan(FIX.r4FalseGreen).falseGreen.length === 1;
  });
  add('R4 孪生：分支外另有断言 ⇒ ⇒ 不许抓', () => {
    return scan(FIX.r4WithUnconditional).falseGreen.length === 0;
  });
  add('R4 孪生：分支条件是「找不到就抛」的查询（分支恒进）⇒ ⇒ 不许抓', () => {
    return scan(FIX.r4AlwaysRuns).falseGreen.length === 0;
  });

  // ── Playwright 族：另一套语义（刀 O，2026-11-11 真机实测）────────
  // ⚠️ **为什么要单独一族**：Playwright 的 `test.describe` 是**容器**不是用例；
  //   `locator.isVisible()` / `count()` 是**软查询**（返回布尔/数字、不抛）
  //   ⇒ ⇒ 用 vitest 的尺子量它 ⇒ ⇒ 102 条真用例一条都没被单独审计。
  add('PW：软守卫 isVisible() ⇒ ⇒ 必须判假绿', () => {
    return pwScan(PW_FIX.softGuard).falseGreen.length === 1;
  });
  add('PW：软查询在分支外（count 赋值）⇒ ⇒ 必须判假绿', () => {
    return pwScan(PW_FIX.softAssigned).falseGreen.length === 1;
  });
  add('PW 孪生：无守卫 ⇒ ⇒ 不许判假绿', () => {
    return pwScan(PW_FIX.noGuard).falseGreen.length === 0;
  });
  add('PW 孪生：硬守卫（会抛的查询）⇒ ⇒ 不许判假绿', () => {
    return pwScan(PW_FIX.hardGuard).falseGreen.length === 0;
  });
  add('PW：零 expect ⇒ ⇒ 必须判零断言', () => {
    return pwScan(PW_FIX.zeroAssert).zeroAssert.length === 1;
  });
  add('PW：describe 是容器不是用例 ⇒ ⇒ 只认内层那条', () => {
    const r = pwScan(PW_FIX.describeNotCase);
    return r.cases.length === 1 && r.cases[0].name === 'inner';
  });

  // ── 覆盖面：靠发现 ───────────────────────────────────────────────
  add('覆盖面：仓里扫得到桌面端用例（不是 0 个文件）', () => {
    let files = 0;
    let cases = 0;
    for (const root of SCAN_ROOTS) {
      const c = censusDesktopAssertions(path.join(REPO_ROOT, 'shadow-desktop', root), fs, path);
      files += c.summary.files;
      cases += c.summary.cases;
    }
    return files > 0 && cases > 0;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = !!c.run();
    } catch (e) {
      ok = false;
      console.error('  ✗ ' + c.name + ' ⇒ 抛异常：' + (e && e.message));
    }
    if (!ok) {
      bad += 1;
      console.error('  ✗ ' + c.name);
    }
  }
  const total = cases.length;
  console.log('判据自检：' + (total - bad) + '/' + total + ' 通过');
  return { ok: bad === 0, total, bad };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.selfTest) {
    const r = selfTest();
    process.exit(r.ok ? 0 : 1);
  }

  const results = [];
  for (const root of SCAN_ROOTS) {
    const c = censusDesktopAssertions(path.join(REPO_ROOT, 'shadow-desktop', root), fs, path);
    results.push(...c.results);
  }

  const summary = {
    files: results.length,
    cases: 0,
    assertions: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    conditional: 0,
    conditionalAlways: 0,
    conditionalOther: 0,
  };
  const violations = [];
  for (const r of results) {
    summary.cases += r.cases.length;
    summary.assertions += r.cases.reduce((n, c) => n + c.asserts, 0);
    summary.conditional += r.conditional.length;
    summary.conditionalAlways += r.conditional.filter((c) => c.conditionalAlwaysRuns).length;
    summary.conditionalOther += r.conditional.filter((c) => !c.conditionalAlwaysRuns && !c.falseGreen).length;
    for (const g of r.falseGreen || []) {
      summary.r4 += 1;
      violations.push({
        kind: 'R4 假绿风险（承重全挂在可能不进的分支上）',
        file: g.file,
        line: g.line,
        name: g.name,
        detail: '全部 ' + g.asserts + ' 条断言都在「没有 else 的 if」分支里 ⇒ ⇒ 分支不进 ⇒ ⇒ 零断言通过',
      });
    }
    for (const t of r.tautologies) {
      summary.r1 += 1;
      violations.push({ kind: 'R1 恒真断言', file: t.file, line: t.line, name: t.name, detail: t.matcher + '(' + t.subject + ')' });
    }
    for (const z of r.zeroAssert) {
      summary.r2 += 1;
      violations.push({ kind: 'R2 零断言用例', file: z.file, line: z.line, name: z.name, detail: '用例体里没有承重断言' });
    }
    for (const w of r.weakOnly) {
      summary.r3 += 1;
      violations.push({ kind: 'R3 弱断言独占', file: w.file, line: w.line, name: w.name, detail: '唯一的断言只是「某个值非空」' });
    }
  }

  const rel = (f) => String(f).replace(REPO_ROOT + path.sep, '');

  if (opts.json) {
    console.log(JSON.stringify({ summary, violations }, null, 2));
  } else {
    console.log(
      '读数：文件 ' + summary.files +
      ' ｜ 用例 ' + summary.cases +
      ' ｜ 断言 ' + summary.assertions +
      ' ｜ R1 恒真 ' + summary.r1 +
      ' ｜ R2 零断言 ' + summary.r2 +
      ' ｜ R3 弱断言独占 ' + summary.r3 +
      ' ｜ R4 假绿风险 ' + summary.r4 +
      ' ｜ 条件化断言（只读数）' + summary.conditional +
      '（分支恒进 ' + summary.conditionalAlways +
      ' ＋ 另有无条件承重 ' + summary.conditionalOther +
      ' ＋ 真·假绿 ' + summary.r4 + '）',
    );
    for (const v of violations) {
      console.error('::error::' + v.kind + ' ⇒ ' + rel(v.file) + ':' + v.line + ' ⇒ ' + v.name + ' ⇒ ' + v.detail);
    }
    if (violations.length === 0) {
      console.log('✅ 四条红线全过（每条用例的断言都指向它宣称的那件事）');
    }
  }

  if (summary.files === 0) {
    console.error('::error::一个用例文件都没读到 —— **判不了**（不是绿）');
    process.exit(2);
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

main();
