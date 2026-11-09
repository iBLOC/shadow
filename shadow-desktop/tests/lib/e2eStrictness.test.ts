import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ⚠️⚠️ **E2E 的「宽容形状」不许回流** —— 形状级尺子（会进 CI 的 `desktop-test` job）。
 *
 * ## 为什么要有这一把
 *
 * 2026-11-09 真机实测：desktop-e2e 的「Run Playwright E2E against the 端脑 server」
 * 那一格**第一次跑绿**（run 42591908404，日志逐字 `31 passed`）⇒ ⇒ 但逐行读那
 * 几份 CI 跑的 spec 时发现：**绿里面藏着好几个「失败被原谅」的洞** ——
 *
 *   ❶ `if (sendRes.ok()) { …断言… } else { 只断言「错误体非空」 }`
 *      ⇒ ⇒ 端脑 502 时这条测试**照样绿**；
 *   ❷ `if (sendRes.ok()) { … }`（**没有 else**）
 *      ⇒ ⇒ 502 时**整条测试零断言通过** —— 连「失败」都没有，只有一个空壳；
 *   ❸ `expect([200, 502]).toContain(sendStatus)`
 *      ⇒ ⇒ **失败被明写进白名单**；
 *   ❹ `if (await X.isVisible()) { …断言… }`
 *      ⇒ ⇒ 元素不在 ⇒ 整条零断言通过（"什么都没发生"被记成"通过"）；
 *   ❺ `test.skip(!await isTelencephalonReachable(), …)`
 *      ⇒ ⇒ 端脑没起来 ⇒ 整条被**跳过** ⇒ ⇒ Playwright 的退出码仍是 0
 *      ⇒ ⇒ **跳过也算绿**（在 Playwright 这一侧）。
 *
 * ⇒ ⇒ 那一格的绿**当时**是真的（端脑确实答对了）⇒ ⇒ 但它**不能保证下次还是**
 * ⇒ ⇒ ⇒ 所以要把「不许宽容」钉成**形状**，而不是钉在「今天恰好绿了」。
 *
 * ## 这把尺子守什么
 *
 * · R1 —— **每个 test 块至少一条 `expect(`**（不许「零断言测试」）；
 * · R2 —— 不许 `if (X.ok())` / `if (!X.ok()) break`（不许「失败被原谅」）；
 * · R3 —— 不许把 **502** 写进白名单（不许「失败是预期」）；
 * · R4 —— 不许 `test.skip(!await isTelencephalonReachable(`（端脑不可达在 CI 上必须红）。
 *
 * ⚠️ **尺子自己也要能被验** —— 每条规则都配了**孪生负控**（坏样本必须被抓）
 * 与**正控**（好样本必须不被抓）⇒ ⇒ 尺子不是恒绿。
 */

/** CI 上真跑的那几份 spec（desktop-e2e.yml 的 `pnpm exec playwright test …` 清单）。 */
const CI_RUN_SPECS = [
  'tests/e2e-ui/e2e-conversation-flow.spec.ts',
  'tests/e2e-ui/e2e-task-scheduling.spec.ts',
  'tests/e2e-ui/business-flow-ui.spec.ts',
  'tests/e2e-ui/telencephalon-endpoints.spec.ts',
];

type Rule = { id: string; label: string; re: RegExp };

const RULES: Rule[] = [
  {
    id: 'R2a',
    label: '失败被原谅：if (X.ok()) 把断言包住了',
    re: /if\s*\(\s*[A-Za-z_$][\w$]*\.ok\(\)\s*\)/,
  },
  {
    id: 'R2b',
    label: '失败被原谅：if (!X.ok()) break（悄悄少做一步）',
    re: /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\.ok\(\)\s*\)\s*break/,
  },
  {
    id: 'R3',
    label: '失败被写进白名单：502 与 200 并列',
    re: /\[\s*200\s*,\s*502\s*\]|toContain\(\s*sendStatus\s*\)/,
  },
  {
    id: 'R4',
    label: '端脑不可达自己 skip（CI 上跳过也算绿）',
    re: /test\.skip\(\s*!await\s+isTelencephalonReachable\(/,
  },
];

/**
 * ⚠️ **扫形状之前必须剥注释** —— 注释里写被禁形状是**文档**，不是行为。
 *
 * 2026-11-09 真机实测：这一刀第一版没剥注释 ⇒ ⇒ 尺子把它**自己写的注释**
 * 当成违规 ⇒ ⇒ 「原来这里是 `if (sendRes.ok()) { … }`」这句说明文字
 * 反而把尺子判红了 ⇒ ⇒ ⇒ **尺子把自己的说明当成了被测对象的缺陷**。
 *
 * ⚠️ 剥注释的实现要**认引号**（不许无脑按 `//` 切到行尾）—— 字符串里
 * 出现 `http://` 时无脑切会把整行后半截连同真违规一起切掉 ⇒ ⇒ 那就变成了
 * 「尺子能被一行注释骗过」。
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let quote = '';
  while (i < src.length) {
    const c = src[i];
    const c2 = src.slice(i, i + 2);
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      i++;
      continue;
    }
    if (inBlock) {
      if (c2 === '*/') { inBlock = false; i += 2; continue; }
      if (c === '\n') out += '\n';
      i++;
      continue;
    }
    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (c === quote) quote = '';
      i++;
      continue;
    }
    if (c2 === '//') { inLine = true; i += 2; continue; }
    if (c2 === '/*') { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

/** R1：把源码切成 test 块，数每块的 expect( 个数。 */
export function countAssertsPerTest(source: string): { title: string; asserts: number }[] {
  const out: { title: string; asserts: number }[] = [];
  source = stripComments(source);
  const re = /\btest\(\s*(['"`])([^'"`]+)\1/g;
  const marks: { title: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    marks.push({ title: m[2], start: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : source.length;
    const block = source.slice(marks[i].start, end);
    const asserts = (block.match(/\bexpect\s*\(/g) ?? []).length;
    out.push({ title: marks[i].title, asserts });
  }
  return out;
}

/** R2/R3/R4：形状扫描（**先剥注释** —— 注释里的形状是文档，不是行为）。 */
export function findToleranceIssues(source: string): { id: string; label: string }[] {
  const issues: { id: string; label: string }[] = [];
  const code = stripComments(source);
  for (const rule of RULES) {
    if (rule.re.test(code)) issues.push({ id: rule.id, label: rule.label });
  }
  return issues;
}

function readSpec(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('E2E 宽容形状闸（CI 跑的那几份 spec）', () => {
  it('真文件：四份 spec 零宽容形状、零零断言 test', () => {
    const problems: string[] = [];
    for (const rel of CI_RUN_SPECS) {
      const src = readSpec(rel);
      for (const issue of findToleranceIssues(src)) {
        problems.push(rel + ' ⇒ ' + issue.id + ' ' + issue.label);
      }
      for (const t of countAssertsPerTest(src)) {
        if (t.asserts === 0) {
          problems.push(rel + ' ⇒ R1 零断言 test：「' + t.title + '」');
        }
      }
      // R4 的正面要求：必须走 requireTelencephalon()（不许自己 skip）。
      if (!src.includes('requireTelencephalon()')) {
        problems.push(rel + ' ⇒ R4 正面要求：必须调用 requireTelencephalon()');
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('孪生负控：每条规则的坏样本都必须被抓（尺子不是恒绿）', () => {
    const bad: Record<string, string> = {
      R2a: "const res = await req.get(u);\nif (res.ok()) {\n  expect(res.status()).toBe(200);\n}",
      R2b: "const res = await req.get(u);\nif (!res.ok()) break;\n",
      R3: "expect([200, 502]).toContain(sendStatus);",
      R4: "test.skip(!await isTelencephalonReachable(), 'not reachable');",
    };
    for (const rule of RULES) {
      const issues = findToleranceIssues(bad[rule.id]);
      expect(issues.map((i) => i.id), '坏样本没被抓住：' + rule.id).toContain(rule.id);
    }
    // R1 的孪生负控：零断言的 test 块必须被数成 0。
    const zero = countAssertsPerTest("test('什么都不验', async () => {\n  await page.goto('/');\n});");
    expect(zero).toHaveLength(1);
    expect(zero[0].asserts).toBe(0);
  });

  it('正控：好样本必须不被抓（尺子不许见谁红谁）', () => {
    const good = [
      "const res = await req.get(u);\nexpect(res.status()).toBe(200);",
      "const res = await req.get(u);\nconst body = await res.text();\nexpect(res.status(), body).toBe(200);",
      "await requireTelencephalon();\nexpect(res.ok()).toBeTruthy();",
    ];
    for (const src of good) {
      expect(findToleranceIssues(src), src).toEqual([]);
    }
    const one = countAssertsPerTest("test('有断言', async () => {\n  expect(1).toBe(1);\n});");
    expect(one).toHaveLength(1);
    expect(one[0].asserts).toBe(1);
  });

  it('正控：真实 spec 里每个 test 块的断言数都被数出来（不是零块）', () => {
    for (const rel of CI_RUN_SPECS) {
      const blocks = countAssertsPerTest(readSpec(rel));
      expect(blocks.length, rel + ' 一个 test 块都没数到（解析器坏了？）').toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b.asserts, rel + ' ⇒ 「' + b.title + '」零断言').toBeGreaterThan(0);
      }
    }
  });
});
