#!/usr/bin/env node
/**
 * **「失败不许长得像成功」闸** —— 前端**吞异常**形状的守卫。
 *
 * ## 为什么要有这个闸
 *
 * 这一族缺陷在桌面端**反复出现**：把失败**变成**一个看起来正常的东西。
 *
 * - .catch(() => {}) —— 失败被吞 ⇒ ⇒ **界面说「成功了」，其实什么都没发生**。
 * - .catch(() => null) —— 失败被吞成一个「看起来没有」的值。
 * - .catch(() => setEvents([])) —— 读失败被渲染成「**一个都没有**」
 *   ⇒ ⇒ **「读不到」被说成「没有」**（用户以为那台机器真的什么都没录）。
 *
 * ⚠️ 为什么它**特别**容易漏：这些代码**编译得过、跑得起来、界面上也不报错**
 * ⇒ ⇒ 没有任何测试会红 ⇒ ⇒ **只能靠闸**。
 *
 * ⚠️ 为什么它**不能**只靠人记：本会话同一族里，桌面端至少 **9 个落点**
 * ⇒ ⇒ 修掉两处之后还有 ⇒ ⇒ 「修好了」不等于「这一族干净了」。
 *
 * ## 闸门抓什么（判据＝**形状**，不是语义）
 *
 * ① **R1 swallow-empty** —— .catch(() => {})：吞掉错误，什么都不说。
 * ② **R2 swallow-scalar** —— .catch(() => null) 之类：吞掉错误并返回一个
 *    「看起来正常」的值。
 * ③ **R3 swallow-empty-collection** —— .catch(() => []) 之类：吞掉错误并
 *    伪装成「空」。
 * ④ **R4 read-failure-as-empty** —— .catch(() => setX([]))：读失败 ⇒ 渲染成空。
 * ⑤ **R5 catch-block-empty** —— catch { }：整块 catch 是空的。
 *
 * ⚠️ **注释不算代码** —— 源码里到处是注释，其中**恰好**写着这些字样
 * ⇒ ⇒ 判据跑在**剥掉注释**的文本上（行号不变）⇒ ⇒ 不剥就是一堆误报。
 *
 * ## 债务清单
 *
 * 今天扫出来的落点分两类：**真缺陷**（⇒ ⇒ 修掉）与**合法回落**
 * （例如「读错误响应体失败 ⇒ ⇒ 当空字符串」）⇒ ⇒ 合法回落**登记进债务清单**
 * 并写清 **why / when** ⇒ ⇒ **别让它隐形**。
 *
 * ⚠️ **债务清单会自己变短**：清单里的某一处被修好之后 ⇒ ⇒ 那个落点不再有
 * 命中 ⇒ ⇒ **闸红**（提示把清单条目删掉）⇒ ⇒ 清单**只会变少**。
 *
 * ## 覆盖边界（**如实标注，别装作全覆盖**）
 *
 * - 查得出：**源码里写成这些形状的**失败吞噬点（TS/TSX，剥注释后）。
 * - 查不出：① try/catch 里**有**处理但**处理错了**的；
 *   ② Dart 侧（shadow-mobile）的同族形状（**另一套语法** ⇒ 另做）；
 *   ③ 跨进程的失败（Rust/Tauri 侧返回假成功）。
 * - 判据是**形状** ⇒ ⇒ 会有**假阳性**（合法的空回落）⇒ ⇒ 那正是债务清单的用处。
 *
 * ## 退出码
 *
 * - 0：绿（没有新的落点，债务清单也准）；
 * - 1：**红**（有新的落点，或债务清单过期）；
 * - 2：**读不到源**（一个文件都没扫到）⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 *     node scripts/check-failure-masking.mjs
 *     node scripts/check-failure-masking.mjs --self-test
 *     node scripts/check-failure-masking.mjs --json
 *     node scripts/check-failure-masking.mjs --root C:/Projects/iBLOC
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const HERE = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
const REPO = resolve(HERE, '..');

/**
 * **债务清单** —— 今天的实测盘点（2026-11-08）。
 *
 * ⚠️ 每一条都写清 **why**（为什么现在合法/为什么还没修）与 **when**（什么时候还）。
 * ⇒ ⇒ 不许把它变成一张永远没人还的清单。
 */
export const KNOWN_DEBT = [
  {
    repo: 'shadow-desktop',
    file: 'src/lib/a2uiClient.ts',
    kind: 'R2',
    why: '读**错误响应体**失败 ⇒ 当空字符串（错误信息会少一段，但**错误照样抛出**）⇒ ⇒ 不是伪装成成功。',
    when: '端脑的错误响应体约定稳定后（能保证非空）可以改成原文透出。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/openaiClient.ts',
    kind: 'R2',
    why: '同款：读错误响应体失败 ⇒ 当空字符串 ⇒ ⇒ 错误照样抛出。',
    when: '同上。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/lib/telencephalonClient.ts',
    kind: 'R2',
    why: '同款：读错误响应体失败 ⇒ 当空字符串 ⇒ ⇒ 错误照样抛出。',
    when: '同上。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/components/recording/RecordingPanel.tsx',
    kind: 'R2',
    why: '⚠️ **真缺陷**（报告读失败 ⇒ 报告卡片不出现 ⇒ 「读不到」被说成「没有报告」）⇒ ⇒ 正在改。',
    when: '下一刀：记住失败原因 ⇒ 渲染时说「读不到」＋原因。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/pages/ResonancePage.tsx',
    kind: 'R1',
    why: '⚠️ **真缺陷**（复制失败被吞 ⇒ 用户以为配对码已复制）⇒ ⇒ 正在改。',
    when: '下一刀：复制失败要说出来（配对码仍显示在界面上，可手动复制）。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/components/business/HfTokenSettings.tsx',
    kind: 'R5',
    why: '⚠️ **真缺陷**（读 token 失败 ⇒ 静默 ⇒ 界面显示成「没有 token」）⇒ ⇒ 「读不到」被说成「没有」。',
    when: '下一刀：记住失败原因 ⇒ 渲染时说「读不到」＋原因。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/components/business/LocalEnginePanel/LocalEnginePanel.tsx',
    kind: 'R5',
    why: '本地作业列表是**缓存**（存储读失败不致命）⇒ ⇒ 界面退回空列表 ⇒ ⇒ 属「尽力而为」的回落，不是伪装成功。',
    when: '该面板引入「缓存读失败」的显式提示时一并复核。',
  },
  {
    repo: 'shadow-desktop',
    file: 'src/stores/themeStore.ts',
    kind: 'R2',
    why: '⚠️ **并行会话在飞**（accent 种子召回的回落）⇒ ⇒ **本刀不碰**。',
    when: '那一侧改完后销账（或改成诚实失败）。',
  },
];

/** 判据表 —— 每条规则＝**形状** ＋ 说明。 */
export const RULES = [
  { id: 'R1', title: 'swallow-empty', re: /\.catch\(\s*\(\s*\)\s*=>\s*\{[ \t]*\}[ \t]*\)/g,
    note: '.catch(() => {}) —— 失败被吞，什么都不说' },
  { id: 'R2', title: 'swallow-scalar', re: /\.catch\(\s*\(\s*\)\s*=>\s*(?:null|undefined|false|true|0|''|"")[ \t]*\)/g,
    note: '.catch(() => null) 之类 —— 失败被吞成「看起来正常」的值' },
  { id: 'R3', title: 'swallow-empty-array', re: /\.catch\(\s*\(\s*\)\s*=>\s*\[[ \t]*\][ \t]*\)/g,
    note: '.catch(() => []) 之类 —— 失败被伪装成「空」' },
  { id: 'R4', title: 'read-failure-as-empty', re: /\.catch\(\s*\(\s*\)\s*=>\s*set[A-Za-z0-9_]*\([ \t]*\[[ \t]*\][ \t]*\)[ \t]*\)/g,
    note: '.catch(() => setX([])) —— 读失败被渲染成「一个都没有」' },
  { id: 'R5', title: 'catch-block-empty', re: /\bcatch\s*(?:\([^)]*\))?[ \t]*\{[ \t]*\}/g,
    note: 'catch { } —— 整块 catch 是空的' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'target') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 测试目录**不参与判定（测试里吞异常是常事）⇒ ⇒ 但它们**照常被扫**，只是不计。 */
function isTestPath(p) {
  return /[\\/]__tests__[\\/]/.test(p) || /\.(test|spec)\.[jt]sx?$/.test(p);
}

/**
 * 扫一个仓 ⇒ ⇒ 落点清单。
 * @returns {{findings: object[], filesRead: number}}
 */
export function scanRepo(root) {
  const findings = [];
  let filesRead = 0;
  const srcRoot = join(root, 'src');
  if (!existsSync(srcRoot)) return { findings, filesRead };
  for (const file of walk(srcRoot)) {
    filesRead += 1;
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw, {});
    const lines = raw.split(/\r?\n/);
    for (const rule of RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m;
      while ((m = re.exec(code)) !== null) {
        const line = code.slice(0, m.index).split('\n').length;
        findings.push({
          repo: 'shadow-desktop',
          file: relative(root, file).replace(/[\\/]/g, '/'),
          kind: rule.id,
          title: rule.title,
          line,
          snippet: (lines[line - 1] ?? '').trim().slice(0, 160),
          isTest: isTestPath(file),
        });
      }
    }
  }
  return { findings, filesRead };
}

/**
 * 判定 —— **新增落点**与**过期债务**都判红。
 */
export function evaluate(findings, debt) {
  const real = findings.filter((f) => !f.isTest);
  const debtKeys = new Set(debt.map((d) => d.repo + '|' + d.file + '|' + d.kind));
  const hitKeys = new Set(real.map((f) => f.repo + '|' + f.file + '|' + f.kind));
  const fresh = real.filter((f) => !debtKeys.has(f.repo + '|' + f.file + '|' + f.kind));
  const stale = debt.filter((d) => !hitKeys.has(d.repo + '|' + d.file + '|' + d.kind));
  return { ok: fresh.length === 0 && stale.length === 0, fresh, stale, real };
}

function report(result, debt, filesRead) {
  const lines = [];
  lines.push('扫了 ' + filesRead + ' 个源文件；落点 ' + result.real.length + ' 处（债务清单 ' + debt.length + ' 条）');
  for (const d of debt) {
    lines.push('   · ' + d.repo + '|' + d.file + '|' + d.kind + ' —— ' + d.why);
  }
  if (result.fresh.length > 0) {
    lines.push('');
    lines.push('❌ 新增落点（**失败被伪装成成功/空**）：');
    for (const f of result.fresh) {
      lines.push('   · ' + f.repo + '|' + f.file + ':' + f.line + ' [' + f.kind + '] ' + f.snippet);
    }
    lines.push('');
    lines.push('   （⇒ ⇒ 修掉它；⇒ ⇒ 确实是合法回落 ⇒ ⇒ 登记进 KNOWN_DEBT（写清 why / when）⇒ ⇒ **别让它隐形**。）');
  }
  if (result.stale.length > 0) {
    lines.push('');
    lines.push('❌ 债务清单过期（这些落点已经不存在了 ⇒ ⇒ 销账）：');
    for (const d of result.stale) {
      lines.push('   · ' + d.repo + '|' + d.file + '|' + d.kind);
    }
  }
  if (result.ok) {
    lines.push('');
    lines.push('✅ 绿：没有新的「失败长得像成功」落点，债务清单也对得上。');
  }
  return lines.join('\n');
}

/** 自检 —— 每条判据都要有**正控**与**孪生**（不许有空绿）。 */
function selfTest() {
  const cases = [];
  const check = (name, cond) => cases.push({ name, ok: !!cond });

  // ❶ 正控：五种形状都要被抓到
  const positive = [
    ['R1', 'x.catch(() => {});'],
    ['R2', 'x.catch(() => null);'],
    ['R3', 'x.catch(() => []);'],
    ['R4', 'x.catch(() => setEvents([]));'],
    ['R5', 'try { a(); } catch { }'],
  ];
  for (const pair of positive) {
    const rule = RULES.find((r) => r.id === pair[0]);
    check('正控 ' + pair[0] + '：' + pair[1], new RegExp(rule.re.source, rule.re.flags).test(pair[1]));
  }

  // ❷ 孪生：**诚实的**处理不许被抓
  const twins = [
    'x.catch((e) => setError(e.message));',
    'x.catch((e) => { setError(e.message); });',
    'x.then((v) => v).catch((e) => { throw e; });',
    'const r = await resp.text();',
  ];
  for (const src of twins) {
    const hit = RULES.some((rule) => new RegExp(rule.re.source, rule.re.flags).test(src));
    check('孪生（不许报）：' + src, !hit);
  }

  // ❸ 孪生：注释里的字样**不许**算命中
  const commented = '// 以前这里 .catch(() => {}) 把 404 吞了\n/* .catch(() => null) */\nconst a = 1;';
  const stripped = stripComments(commented, {});
  const commentHit = RULES.some((rule) => new RegExp(rule.re.source, rule.re.flags).test(stripped));
  check('孪生：注释里的字样不算命中', !commentHit);

  // ❹ 判定逻辑：新增落点 ⇒ 红；过期债务 ⇒ 红
  const f = (file, kind) => ({ repo: 'shadow-desktop', file, kind, isTest: false });
  const r1 = evaluate([f('a.ts', 'R1')], []);
  check('判定：新增落点 ⇒ 红', !r1.ok && r1.fresh.length === 1);
  const r2 = evaluate([f('a.ts', 'R1')], [{ repo: 'shadow-desktop', file: 'a.ts', kind: 'R1' }]);
  check('判定：登记过的落点 ⇒ 绿', r2.ok);
  const r3 = evaluate([], [{ repo: 'shadow-desktop', file: 'a.ts', kind: 'R1' }]);
  check('判定：过期债务 ⇒ 红', !r3.ok && r3.stale.length === 1);
  const r4 = evaluate([f('a.ts', 'R1')], [{ repo: 'shadow-desktop', file: 'a.ts', kind: 'R1' }]);
  check('判定：测试目录里的落点不计', r4.ok);

  for (const c of cases) {
    console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name);
  }
  const bad = cases.filter((c) => !c.ok).length;
  console.log('');
  console.log('自检：' + (cases.length - bad) + '/' + cases.length + ' 通过');
  return bad === 0;
}

function main(argv) {
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const rootArg = argv.includes('--root')
    ? resolve(argv[argv.indexOf('--root') + 1])
    : REPO;
  const root = rootArg.endsWith('shadow-desktop') ? rootArg : join(rootArg, 'shadow-desktop');
  if (!existsSync(root)) {
    console.error('❌ 读不到源：' + root);
    process.exit(2);
  }
  const scanned = scanRepo(root);
  if (scanned.filesRead === 0) {
    console.error('❌ 一个源文件都没扫到 ⇒ ⇒ 「没红」不等于「没问题」。');
    process.exit(2);
  }
  const verdict = evaluate(scanned.findings, KNOWN_DEBT);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: verdict.ok, filesRead: scanned.filesRead, findings: verdict.real, fresh: verdict.fresh, stale: verdict.stale }, null, 2));
    process.exit(verdict.ok ? 0 : 1);
  }
  console.log(report(verdict, KNOWN_DEBT, scanned.filesRead));
  process.exit(verdict.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
