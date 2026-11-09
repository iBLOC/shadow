#!/usr/bin/env node
/**
 * 闸：桌面端 i18n 键完备性 —— 「界面不许显示 key 本身」
 * ============================================================================
 *
 * ## 它守的是什么
 *
 *   「界面上出现 `identity.currentTitle` 这样一串东西」**不报错**、
 *   页面照常渲染、测试照常绿 ⇒ ⇒ 没有人会发现 ⇒ ⇒ 必须有闸盯着。
 *
 *   ⚠️ **两种破相长得完全不一样**（2026-11-11 真机取证）：
 *     ① `t('x.y')` **不带默认值** ⇒ ⇒ 词表缺这个键 ⇒ ⇒ i18next
 *        原样返回键名 ⇒ ⇒ **界面显示裸 key**；
 *     ② `t('x.y', '中文兜底')` **带默认值** ⇒ ⇒ 中文界面看着正常
 *        ⇒ ⇒ 但**英文界面显示中文**（兜底是中文）⇒ ⇒ 一样是破相，
 *        只是更隐蔽。
 *   ⇒ ⇒ 本闸不按「有没有默认值」分档 ⇒ ⇒ **一律要求两份词表齐全**。
 *
 * ## 它怎么判
 *
 *   ① **被引用 ⇒ 两份词表都得有**：扫 shadow-desktop/src/** 的
 *      `t('...')` 字面量引用 ⇒ ⇒ 每个键在 zh-CN 与 en-US 里都得有值。
 *   ② **两份词表必须逐键对齐**：zh 有而 en 没有的键（哪怕没人引用）
 *      ⇒ ⇒ 英文界面迟早要用它 ⇒ ⇒ 那一格同样判红。
 *   ③ **值不许是空串**：键在但值是 "" ⇒ ⇒ 界面显示空白 ⇒ ⇒ 判红。
 *
 * ## 覆盖面（写清楚，免得后来人以为它管了全仓）
 *
 *   · **只管桌面端**（shadow-desktop/src 下面的 .ts 与 .tsx 里的 t() 字面量）
 *     ⇒ ⇒ 移动端是 arb ＋ 生成物，形状不同，**不在本闸范围**。
 *   · **只认字面量**：`t(dynamicKey)` 这类动态键**判不了**
 *     ⇒ ⇒ 不假装能判 ⇒ ⇒ 若哪天引入动态键，要另开一刀。
 *   · **排除测试目录**：src 下的 __tests__ 目录与 `*.test.ts` 文件不参与
 *     （测试里的 t() 常是 mock ⇒ ⇒ 算进去就是假红）。
 *
 * ## 退出码
 *
 *   0 绿 / 1 红 / **2 判不了**（词表读不到 / 源码目录不在 / 一个引用都
 *   扫不到 ⇒ ⇒ 那是「尺子空转」而不是「没问题」）。
 *
 * 用法：
 *   node scripts/check-i18n-key-completeness.mjs
 *   node scripts/check-i18n-key-completeness.mjs --self-test
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = join(REPO_ROOT, 'shadow-desktop', 'src');
const ZH_PATH = join(SRC_DIR, 'i18n', 'zh-CN.json');
const EN_PATH = join(SRC_DIR, 'i18n', 'en-US.json');

/** 递归列出要扫的源码文件（排除测试与声明文件）。 */
export function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * 收集源码里的 t('...') 字面量引用。
 * ⚠️ **注释行不算**：注释里写 `t('x.y')` 是给人看的 ⇒ ⇒ 不该被当成引用。
 */
export function collectReferences(files) {
  const refs = new Map();
  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      const patterns = [
        /(?:\bi18n\.)?\bt\(\s*'([^']+)'/g,
        /(?:\bi18n\.)?\bt\(\s*"([^"]+)"/g,
      ];
      for (const re of patterns) {
        for (const m of line.matchAll(re)) {
          const key = m[1];
          if (!refs.has(key)) refs.set(key, new Set());
          refs.get(key).add(relative(REPO_ROOT, file) + ':' + (i + 1));
        }
      }
    });
  }
  return refs;
}

/** 按点号路径取值（i18next 的 keySeparator 是 '.'）。 */
export function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}

/** 把词表摊平成点号路径集合。 */
export function flattenKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenKeys(v, p));
    else out.push(p);
  }
  return out;
}

/**
 * 判定（纯函数 ⇒ ⇒ 自检与真跑走**同一份**逻辑）。
 * @returns {{missingZh: object[], missingEn: object[], emptyZh: object[], emptyEn: object[], onlyZh: string[], onlyEn: string[], referenced: number}}
 */
export function evaluate(refs, zh, en) {
  const missingZh = [], missingEn = [], emptyZh = [], emptyEn = [];
  for (const [key, where] of refs) {
    const sites = [...where];
    const z = getPath(zh, key);
    const e = getPath(en, key);
    if (z === undefined) missingZh.push({ key, sites });
    else if (typeof z === 'string' && z.trim() === '') emptyZh.push({ key, sites });
    if (e === undefined) missingEn.push({ key, sites });
    else if (typeof e === 'string' && e.trim() === '') emptyEn.push({ key, sites });
  }
  const zk = new Set(flattenKeys(zh));
  const ek = new Set(flattenKeys(en));
  const onlyZh = [...zk].filter((k) => !ek.has(k));
  const onlyEn = [...ek].filter((k) => !zk.has(k));
  return { missingZh, missingEn, emptyZh, emptyEn, onlyZh, onlyEn, referenced: refs.size };
}

function printFindings(result) {
  const line = (arr, title, lang) => {
    if (!arr.length) return 0;
    console.log('\n✗ ' + title + '（' + lang + '，' + arr.length + ' 条）：');
    for (const item of arr) {
      if (typeof item === 'string') console.log('    · ' + item);
      else console.log('    · ' + item.key + '   ← ' + item.sites.slice(0, 3).join(', ') + (item.sites.length > 3 ? ' …' : ''));
    }
    return arr.length;
  };
  let bad = 0;
  bad += line(result.missingZh, '源码引用的键在词表里不存在 ⇒ 界面会显示裸 key', 'zh-CN');
  bad += line(result.missingEn, '源码引用的键在词表里不存在 ⇒ 英文界面会显示裸 key', 'en-US');
  bad += line(result.emptyZh, '键在但值是空串 ⇒ 界面显示空白', 'zh-CN');
  bad += line(result.emptyEn, '键在但值是空串 ⇒ 界面显示空白', 'en-US');
  bad += line(result.onlyZh, '只在 zh-CN 里有 ⇒ 两份词表没对齐（英文界面迟早要用）', 'zh-CN');
  bad += line(result.onlyEn, '只在 en-US 里有 ⇒ 两份词表没对齐（中文界面迟早要用）', 'en-US');
  return bad;
}

/** 判据自检：正控 ＋ 孪生 ＋ 不该抓的不抓。 */
function selfTest() {
  const checks = [];
  const expect = (name, ok, detail) => checks.push({ name, ok, detail });

  // ① 正控：被引用的键在两份词表都缺 ⇒ 两个方向都要点名
  {
    const refs = new Map([['a.b', new Set(['x.ts:1'])]]);
    const r = evaluate(refs, {}, {});
    expect('正控：缺键 ⇒ zh/en 各点 1 条', r.missingZh.length === 1 && r.missingEn.length === 1);
  }
  // ② 孪生：同一个键被两处引用 ⇒ 只算**一条**缺失（不重复点名）
  {
    const refs = new Map([['a.b', new Set(['x.ts:1', 'y.ts:9'])]]);
    const r = evaluate(refs, {}, {});
    expect('孪生：两处引用同一个缺键 ⇒ 只点 1 条', r.missingZh.length === 1 && r.missingZh[0].sites.length === 2);
  }
  // ③ 对齐：没人引用的键，zh 有 en 没有 ⇒ 也要红（英文界面迟早要用）
  {
    const r = evaluate(new Map(), { z: { y: 'v' } }, {});
    expect('对齐：只在中文的键 ⇒ 点名', r.onlyZh.length === 1 && r.onlyZh[0] === 'z.y');
  }
  // ④ 空串：键在但值是空 ⇒ 也要红
  {
    const refs = new Map([['a.b', new Set(['x.ts:1'])]]);
    const r = evaluate(refs, { a: { b: '   ' } }, { a: { b: 'v' } });
    expect('空值：值是空串 ⇒ 点名', r.emptyZh.length === 1 && r.emptyEn.length === 0);
  }
  // ⑤ 不该抓的：动态键 ＋ 注释里的示例键 ⇒ 都不算引用
  {
    const files = [];
    const refs = collectReferencesFromText([
      "const label = t(dynamicKey);",
      "// t('comment.only.key')",
      " * t('block.comment.key')",
      "const real = t('real.key');",
    ]);
    expect('不该抓的：动态键与注释里的键都不算引用', refs.size === 1 && refs.has('real.key'));
  }
  // ⑥ 齐全 ⇒ 零问题
  {
    const refs = new Map([['a.b', new Set(['x.ts:1'])]]);
    const r = evaluate(refs, { a: { b: '中' } }, { a: { b: 'en' } });
    const bad = r.missingZh.length + r.missingEn.length + r.emptyZh.length + r.emptyEn.length + r.onlyZh.length + r.onlyEn.length;
    expect('齐全：零问题', bad === 0);
  }
  // ⑦ 收集器：只认字面量，不认变量
  {
    const refs = collectReferencesFromText(['t("dq.key")', 't(variableKey)', 'i18n.t("i18n.key")']);
    expect('收集器：单双引号与 i18n.t 都认，变量键不认', refs.size === 2 && refs.has('dq.key') && refs.has('i18n.key'));
  }

  // ⑧ 端到端：**真实**扫描链（列文件 → 收集 → 判定）跑一遍夹具目录
  //    ⇒ ⇒ 只测 evaluate 等于「尺子的尺子没测尺子」
  {
    const wf = writeFileSync;
    const dir = mkdtempSync(join(tmpdir(), 'i18n-gate-'));
    mkdirSync(join(dir, '__tests__'), { recursive: true });
    wf(join(dir, 'A.tsx'), "const a = t('e2e.present');\n");
    wf(join(dir, 'B.tsx'), "// t('e2e.comment.only')\nconst b = t(dynamic);\n");
    wf(join(dir, '__tests__', 'C.test.tsx'), "const c = t('e2e.in.test');\n");
    const files = listSourceFiles(dir);
    const refs = collectReferences(files);
    const r = evaluate(refs, {}, {});
    expect(
      '端到端：真实扫描链只认产品源码里的字面量键（测试目录/注释/动态键都不算）',
      files.length === 2 && refs.size === 1 && refs.has('e2e.present') && r.missingZh.length === 1,
      'files=' + files.length + ' refs=' + [...refs.keys()].join(','),
    );
  }
  // ⑨ 判不了档：一个引用都扫不到 ⇒ 那是「尺子空转」⇒ 必须能说「判不了」
  {
    const refs = collectReferences([]);
    expect('判不了：零引用 ⇒ 判不了条件成立（不得当成「没问题」）', refs.size === 0);
  }

  const passed = checks.filter((c) => c.ok).length;
  for (const c of checks) console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name + (c.ok ? '' : '   ← ' + (c.detail || '')));
  console.log('\n判据自检：' + passed + '/' + checks.length + ' 条全绿');
  return passed === checks.length ? 0 : 1;
}

/** 从若干行文本里收集引用（自检用；与 collectReferences 同一套正则）。 */
function collectReferencesFromText(lines) {
  const refs = new Map();
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const re of [/(?:\bi18n\.)?\bt\(\s*'([^']+)'/g, /(?:\bi18n\.)?\bt\(\s*"([^"]+)"/g]) {
      for (const m of line.matchAll(re)) {
        if (!refs.has(m[1])) refs.set(m[1], new Set());
        refs.get(m[1]).add('fixture:' + (i + 1));
      }
    }
  });
  return refs;
}

function main() {
  const selfTestMode = process.argv.includes('--self-test');
  if (selfTestMode) {
    process.exit(selfTest());
  }

  if (!existsSync(SRC_DIR) || !existsSync(ZH_PATH) || !existsSync(EN_PATH)) {
    console.error('判不了：找不到 ' + relative(REPO_ROOT, SRC_DIR) + ' 或两份词表 ⇒ ⇒ 源没读全 ⇒ 不是「没问题」');
    process.exit(2);
  }
  let zh, en;
  try {
    zh = JSON.parse(readFileSync(ZH_PATH, 'utf8'));
    en = JSON.parse(readFileSync(EN_PATH, 'utf8'));
  } catch (err) {
    console.error('判不了：词表读不出来 ⇒ ' + err.message);
    process.exit(2);
  }
  const files = listSourceFiles(SRC_DIR);
  if (!files.length) {
    console.error('判不了：一个源码文件都扫不到 ⇒ ⇒ 尺子空转 ⇒ 不是「没问题」');
    process.exit(2);
  }
  const refs = collectReferences(files);
  if (!refs.size) {
    console.error('判不了：一个 t() 字面量都没扫到 ⇒ ⇒ 扫描形状失效 ⇒ 不是「没问题」');
    process.exit(2);
  }
  const result = evaluate(refs, zh, en);
  const bad = printFindings(result);
  const total = result.missingZh.length + result.missingEn.length + result.emptyZh.length + result.emptyEn.length + result.onlyZh.length + result.onlyEn.length;
  console.log('\n被引用键 ' + result.referenced + ' 个 ｜ 词表键 zh ' + flattenKeys(zh).length + ' / en ' + flattenKeys(en).length + ' ｜ 问题 ' + total + ' 条');
  if (bad === 0) {
    console.log('✅ 两份词表齐全：' + result.referenced + '/' + result.referenced + ' 个被引用键都在 zh-CN 与 en-US 里有值');
    process.exit(0);
  }
  console.log('❌ i18n 键不完备：' + total + ' 条问题（界面会显示 key 本身或空白）');
  process.exit(1);
}

main();
