#!/usr/bin/env node
/**
 * **移动端用例的「断言承重闸」** —— 「跑过了」这个事实本身也要被证一次。
 * ============================================================================
 *
 * ## 它守什么
 *
 * 一条用例「跑过了」这句话，本身**也要被证一次**。
 *
 * ⚠️ **为什么这件事在移动端格外危险**（2026-11-09 实测，本仓 iBLOC/shadow）：
 *   · Flutter 的 `testWidgets` 里，只要**没有抛异常**，用例就是绿的
 *     ⇒ ⇒ 「用例体里一条断言都没有」照样绿；
 *   · `find.byType(X)` 找不到时，`if (finder.evaluate().isNotEmpty) { … }`
 *     ⇒ ⇒ **整条承重挂在分支上** ⇒ ⇒ 分支不进 ⇒ ⇒ 零断言通过；
 *   · `expect(true, isTrue)` ⇒ ⇒ 断言结果在**编译期**就定了
 *     ⇒ ⇒ 与被测物无关 ⇒ ⇒ 零信息量。
 *
 * ⇒ ⇒ 这三种在真机上都表现为「**PASS**」⇒ ⇒ 而**什么都没被证明**。
 *
 * ## 两条红线（**判红**）
 *
 *   **R1 · 恒真断言** —— 断言的**主体是字面量常量**
 *     ⇒ ⇒ 断言结果与被测物无关 ⇒ ⇒ 零信息量。
 *     ⚠️ **只抓「字面量」不抓「标识符」** —— `expect(kMaxDepth, 20)`
 *     是**常量钉桩** ⇒ ⇒ 那是有承重的 ⇒ ⇒ 不判红。
 *
 *   **R2 · 空断言用例** —— 用例体里**一条断言都没有**
 *     ⇒ ⇒ 用例名宣称的那个主张，**没有任何东西在核**。
 *     ⚠️ **不给豁免** —— 「不抛异常」也有显式写法
 *     （`returnsNormally` / `tester.takeException()`）。
 *
 * ## 读数（**不判红**，但要看得见）
 *
 *   · **条件化断言** —— 断言落在「没有 else 的 if」分支里；
 *   · **弱匹配器** —— `isNotNull` / `isNotEmpty` / `anything` 的分布。
 *
 * ## 防假绿
 *
 * · 判据自检（**孪生成对**）⇒ ⇒ 证明尺子**有牙**且**不恒红**；
 * · 一个文件都没读到 ⇒ ⇒ 退出码 2（不是 0）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-mobile-test-assertions.mjs
 * node scripts/check-mobile-test-assertions.mjs --self-test
 * node scripts/check-mobile-test-assertions.mjs --json
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  censusMobileAssertions,
  scanDartSource,
} from './lib/mobile-test-assertions.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const opts = { selfTest: false, json: false, root: REPO_ROOT };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--root=')) opts.root = path.resolve(arg.slice('--root='.length));
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * 判据自检 —— **真的会红**：每一例都同时钉「该抓的抓得到」与「不该抓的不抓」。
 *
 * ⚠️ **孪生必须成对**（2026-11-09 实测教训，桌面端泄漏闸那条）：
 *   只钉「抓得到」⇒ ⇒ 尺子可能因为「什么都抓」而恒红 ⇒ ⇒ 判据就没有分辨力。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const src = (body) => [
    "import 'package:flutter_test/flutter_test.dart';",
    'void main() {',
    body,
    '}',
  ].join('\n');

  const scan = (body) => scanDartSource(src(body), 'fixture_test.dart');

  // ── R1 · 恒真断言 ─────────────────────────────────────────────────────
  add('R1：主体是 true ⇒ ⇒ 必须抓到', () => {
    const r = scan("  test('x', () { expect(true, isTrue); });");
    return r.tautologies.length === 1 && r.tautologies[0].subject === 'true';
  });
  add('R1：主体是字符串字面量 ⇒ ⇒ 必须抓到', () => {
    const r = scan("  test('x', () { expect('abc', 'abc'); });");
    return r.tautologies.length === 1;
  });
  add('R1：主体是数字字面量 ⇒ ⇒ 必须抓到', () => {
    const r = scan("  test('x', () { expect(3, 3); });");
    return r.tautologies.length === 1;
  });
  add('R1 孪生：主体是变量 ⇒ ⇒ 不许抓', () => {
    const r = scan('  test(\'x\', () { expect(n, greaterThan(0)); });');
    return r.tautologies.length === 0;
  });
  add('R1 孪生：常量钉桩（主体是标识符）⇒ ⇒ 不许抓', () => {
    const r = scan('  test(\'x\', () { expect(kMaxDepth, 20); });');
    return r.tautologies.length === 0;
  });
  add('R1 孪生：主体是常量集合，但匹配器引用了变量 ⇒ ⇒ 不许抓（结论由被测物决定）', () => {
    const r = scan("  test('x', () { expect(['Reminder', 'Overdue'], contains(n.type)); });");
    return r.tautologies.length === 0;
  });
  add('R1 孪生：主体是**带括号的表达式** ⇒ ⇒ 不许抓（2026-11-09 第一版失真的那 21 条）', () => {
    const r = scan('  test(\'x\', () { expect((landing - target).distance, lessThan(25.0)); });');
    return r.tautologies.length === 0;
  });
  add('R1 孪生：注释里写的 ⇒ ⇒ 不许抓（那是说明文字）', () => {
    const r = scan('  test(\'x\', () {\n    // expect(true, isTrue);\n  });');
    return r.tautologies.length === 0;
  });
  add('R1 孪生：字符串里写的 ⇒ ⇒ 不许抓', () => {
    const r = scan('  test(\'x\', () { const s = "expect(true, isTrue)"; });');
    return r.tautologies.length === 0;
  });

  // ── R2 · 空断言用例 ───────────────────────────────────────────────────
  add('R2：用例体零断言 ⇒ ⇒ 必须抓到', () => {
    const r = scan('  test(\'x\', () { final a = 1; });');
    return r.zeroAssert.length === 1 && r.cases.length === 1;
  });
  add('R2 孪生：体里有断言 ⇒ ⇒ 不许抓', () => {
    const r = scan('  test(\'x\', () { expect(n, 1); });');
    return r.zeroAssert.length === 0 && r.cases.length === 1;
  });
  add('R2 孪生：returnsNormally 也是承重 ⇒ ⇒ 不许抓', () => {
    const r = scan('  test(\'x\', () { expect(() => f(), returnsNormally); });');
    return r.zeroAssert.length === 0;
  });
  add('R2 孪生：断言在嵌套闭包里（探针族的 check 形状）⇒ ⇒ 不许抓', () => {
    const r = scan([
      '  test(\'x\', () async {',
      '    await check(\'inner\', () async {',
      '      expect(n, 1);',
      '    });',
      '  });',
    ].join('\n'));
    return r.zeroAssert.length === 0 && r.cases.length === 1;
  });

  // ── 形状：用例体定位（2026-11-09 实测踩到的那个坑）──────────────────
  add('形状：体的花括号在 test( 的收尾括号**之前** ⇒ ⇒ 必须找得到', () => {
    const r = scan('  test(\'x\', () { expect(n, 1); });');
    return r.cases.length === 1 && r.cases[0].asserts === 1;
  });
  add('形状：一条只有断言的用例 ⇒ ⇒ 不能被算成零断言（回归钉）', () => {
    const r = scan('  test(\'x\', () { expect(n, 1); });');
    return r.zeroAssert.length === 0;
  });

  // ── 形状：字符串里套字符串（插值）不能让后面的配对乱掉 ───────────────
  add('形状：字符串里套引号 ⇒ ⇒ 后面的代码不许被当成字符串', () => {
    const r = scan([
      "  test('x', () {",
      "    final s = 'a[\'b\']c';",
      '    expect(n, 1);',
      '  });',
    ].join('\n'));
    return r.cases.length === 1 && r.cases[0].asserts === 1;
  });

  // ── 覆盖面：靠发现 ───────────────────────────────────────────────────
  add('覆盖面：仓里扫得到移动端用例（不是 0 个文件）', () => {
    const c = censusMobileAssertions(path.join(REPO_ROOT, 'shadow-mobile'), fs, path);
    return c.summary.files > 0 && c.summary.cases > 0;
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

  const mobileRoot = path.join(opts.root, 'shadow-mobile');
  if (!fs.existsSync(mobileRoot)) {
    console.error('❌ 读不到移动端目录：' + mobileRoot + ' ⇒ ⇒ 判不了 ≠ 没问题');
    return 2;
  }

  const census = censusMobileAssertions(mobileRoot, fs, path);
  const s = census.summary;

  if (opts.json) {
    console.log(JSON.stringify({
      root: mobileRoot,
      summary: s,
      tautologies: census.tautologies,
      zeroAssert: census.zeroAssert,
      conditional: census.conditional,
      weakTally: census.weakTally,
      unjudged: census.unjudged,
    }, null, 2));
  } else {
    console.log(
      '移动端用例断言普查：文件 ' + s.files + ' 个 ｜ 用例 ' + s.cases +
        ' 条 ｜ 断言 ' + s.assertCount + ' 条',
    );
    for (const t of census.tautologies) {
      console.log('❌ [R1 恒真] ' + t.file + ':' + t.line + ' —— 主体是字面量 ' +
        t.subject + ' ⇒ ⇒ 断言结果与被测物无关');
    }
    for (const z of census.zeroAssert) {
      console.log('❌ [R2 空断言] ' + z.file + ':' + z.line + ' —— 用例「' + z.name +
        '」体里一条断言都没有 ⇒ ⇒ 用例名宣称的主张没有任何东西在核');
    }
    for (const c of census.conditional) {
      console.log('⚠ [条件化] ' + c.file + ':' + c.line + ' —— ' + c.kind +
        '（' + c.conditionalAsserts + '/' + c.asserts + ' 条断言在条件分支里）' +
        '：' + c.name);
    }
    console.log('· 弱匹配器读数：isNotNull ' + (census.weakTally.isNotNull || 0) +
      ' ｜ isNotEmpty ' + (census.weakTally.isNotEmpty || 0) +
      ' ｜ anything ' + (census.weakTally.anything || 0));
  }

  // ⚠️ **判不了 ≠ 没问题**
  if (s.files === 0 || s.cases === 0) {
    console.error('❌ 一个用例都没扫到 ⇒ ⇒ 判不了 ≠ 没问题');
    return 2;
  }
  if (s.unjudged > 0) {
    console.error('❌ 有 ' + s.unjudged + ' 个文件判不了 ⇒ ⇒ 判不了 ≠ 没问题');
    return 2;
  }

  const reds = s.tautologies + s.zeroAssert;
  if (reds > 0) {
    console.error('');
    console.error('✖ 移动端用例的断言承重有问题（' + reds + ' 条）' +
      '（R1 恒真 ' + s.tautologies + ' ／ R2 空断言 ' + s.zeroAssert + '）');
    return 1;
  }
  console.log('');
  console.log('✔ 移动端每一条用例都有承重断言，且没有恒真断言');
  return 0;
}

process.exit(main());
