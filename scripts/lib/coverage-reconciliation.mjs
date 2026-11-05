#!/usr/bin/env node
/**
 * 覆盖面对账判据库（纯函数 · 零依赖）
 * ============================================================================
 *
 * ## 这道判据在管什么
 *
 * 「闸扫过 N 个文件 ⇒ ⇒ 残留 0 处」—— 这句话**只对被扫的那 N 个文件成立**。
 *
 * ⚠️ 实测（本项目，2026-11-05）：shadow 仓根的残留闸扫 161 个文件 ⇒ ⇒ 报「0 处」
 *    ⇒ ⇒ 而同一个仓里的 .github/（**CI 配置**）、brand/、fixtures/、state/、
 *    shadow-esp32/ 的 43 个文件**根本不在扫描范围**
 *    ⇒ ⇒ 「0 处」在那 43 个文件上是**空话**。
 *    ⇒ ⇒ 而且那 43 个里**真的藏着一条真缺陷**：CI 里设了一个**改名链漏改**的
 *    环境变量（设了没人读 ⇒ ⇒ 端脑二进制路径 override 失效）。
 *    ⇒ ⇒ 所以「残留 0 处」必须配一句「**而且我知道我没漏什么**」才有意义。
 *
 * ## 判据（顶层对账）
 *
 * 仓（或子目录）的**每一个顶层条目**（目录 + 文件）必须被交代，三选一：
 *   ① 被扫描 —— 它落在某个 scanDir / scanFile 之下；
 *   ② 被排除 —— 它落在某个 excludeDir / excludeFile 之下；
 *   ③ 被登记 —— 它在 allowedTopDirs 里，且**写清理由**。
 *   ④ 都没交代 ⇒ ⇒ **缺口** ⇒ ⇒ 阻断（不是「提示」）。
 *
 * ⚠️ 「点目录一律跳过」是**旧做法**：.git/.idea 那些该跳，
 *    但 .github/（CI 配置）**恰恰是最该判的活配置**
 *    ⇒ ⇒ 现在改成：点目录若被交代就算交代；没被交代且不在
 *    DEFAULT_SKIP_DOT_DIRS 里 ⇒ ⇒ **也是缺口**。
 *
 * ## 防腐烂
 *
 * allowedTopDirs 里登记的条目**如果已经不存在了** ⇒ ⇒ 报「登记已过期」
 * ⇒ ⇒ 阻断（要销账）—— 跟 token 防腐烂同族：登记不是垃圾桶。
 *
 * ## 为什么是一份实现、两处用
 *
 * 跨仓入口（check-cortex-residue-all.mjs）原本自己内联了一份「顶层必须交代」
 * ⇒ ⇒ 仓根（check-cortex-residue.mjs）**没有** ⇒ ⇒ 两边结论会不一致。
 * ⇒ ⇒ 现在共用本库 ⇒ ⇒ 一处改，两处生效。
 *
 * ⚠️ 本文件**不含任何业务判断** —— 它只管覆盖面。
 *    闸自己调用它，所以闸的扫描范围里要排除本文件（它讲的是「谁被扫」）。
 */

import { readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

/**
 * 默认跳过的点目录（工具 / 本地状态 / 构建缓存）。
 * ⚠️ **刻意不含** .github ⇒ ⇒ CI 配置必须被交代（它是最该判的活配置）。
 */
export const DEFAULT_SKIP_DOT_DIRS = [
  '.git', '.idea', '.vscode', '.cargo', '.mimosa', '.zcode', '.ziti',
  '.local', '.verify-wt', '.ci-probe', '.claude', '.cursor', '.devcontainer',
  '.dart_tool', '.gradle', '.venv', '.next', '.turbo', '.svelte-kit',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.ipynb_checkpoints',
  '.vs', '.history',
];

/**
 * 列一个目录的顶层条目。
 * @param {string} root
 * @returns {{dirs: string[], files: string[]}} 名字（不含路径）
 */
export function listTopLevel(root) {
  const dirs = [];
  const files = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return { dirs, files };
  }
  for (const e of entries) {
    if (e.name === '.git') continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = statSync(join(root, e.name)).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (isDir) dirs.push(e.name);
    else files.push(e.name);
  }
  dirs.sort();
  files.sort();
  return { dirs, files };
}

/** 路径前缀匹配（a 是 b 的祖先或本身）。 */
function covers(prefix, name) {
  const p = prefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const n = name.replace(/\\/g, '/');
  return n === p || n.startsWith(p + '/');
}

/**
 * 这个顶层目录**被扫描**了吗？
 * ⚠️ 判据：某个 scanDir 以它为前缀（祖先或本身）⇒ ⇒ 它整个被扫。
 */
function scannedAsDir(name, scanDirs) {
  return scanDirs.some((s) => covers(s, name) || covers(name, s));
}

/** 这个顶层文件**被扫描**了吗？（scanFiles 精确匹配） */
function scannedAsFile(name, scanFiles) {
  return scanFiles.some((f) => f.replace(/\\/g, '/') === name);
}

/**
 * 这个顶层目录**被排除**了吗？
 * ⚠️ excludeDirs 里带 '/' 的是**路径前缀**（相对 root），不带 '/' 的是**目录名**
 *    （任意层级）⇒ ⇒ 顶层目录只按「不带 '/' 的目录名」与「相对路径前缀」两种方式排除。
 */
function excludedAsDir(name, excludeDirs) {
  return excludeDirs.some((e) => {
    if (!e.includes('/')) return e === name;
    return covers(e, name);
  });
}

/**
 * 这个顶层文件**被排除**了吗？
 * ⚠️ excludeFiles 里不带 '/' 的是**文件名**（任意层级）⇒ ⇒ 顶层文件按文件名排除。
 */
function excludedAsFile(name, excludeFiles) {
  return excludeFiles.some((f) => {
    if (!f.includes('/')) return f === name;
    return f.replace(/\\/g, '/') === name;
  });
}

/**
 * 顶层对账。
 *
 * @param {object} o
 * @param {string} o.root
 * @param {string} o.label
 * @param {string[]} [o.scanDirs]
 * @param {string[]} [o.scanFiles]
 * @param {string[]} [o.excludeDirs]
 * @param {string[]} [o.excludeFiles]
 * @param {{dir: string, reason: string}[]} [o.allowedTopDirs] 登记为「刻意不扫」的顶层条目
 * @param {string[]} [o.skipDotDirs] 默认跳过的点目录
 * @returns {{gaps: {kind: string, name: string}[], stale: {name: string, reason: string}[], covered: number, total: number}}
 */
export function checkTopLevelCoverage(o) {
  const {
    root,
    label,
    scanDirs = [],
    scanFiles = [],
    excludeDirs = [],
    excludeFiles = [],
    allowedTopDirs = [],
    skipDotDirs = DEFAULT_SKIP_DOT_DIRS,
  } = o;

  const { dirs, files } = listTopLevel(root);
  const allowedByName = new Map();
  for (const a of allowedTopDirs) {
    allowedByName.set(a.dir.replace(/\\/g, '/'), {
      reason: a.reason,
      // ⚠️ 两档：**debt** = 没人判的存量缺口（放行但**必须打印**）
      //    **skip** = 刻意不扫（有成因：别人家的闸管 / 工具目录）
      kind: a.kind === 'skip' ? 'skip' : 'debt',
    });
  }

  const gaps = [];
  let covered = 0;
  let total = 0;

  const judge = (kind, name) => {
    total++;
    if (kind === 'dir') {
      if (scannedAsDir(name, scanDirs)) { covered++; return; }
      if (excludedAsDir(name, excludeDirs)) { covered++; return; }
      if (allowedByName.has(name)) { covered++; return; }
      if (name.startsWith('.') && skipDotDirs.includes(name)) { total--; return; }
    } else {
      if (scannedAsFile(name, scanFiles)) { covered++; return; }
      if (excludedAsFile(name, excludeFiles)) { covered++; return; }
      if (allowedByName.has(name)) { covered++; return; }
    }
    gaps.push({ kind, name });
  };

  for (const d of dirs) judge('dir', d);
  for (const f of files) judge('file', f);

  // 防腐烂：登记了但**已经不存在**的条目 ⇒ ⇒ 要销账。
  const stale = [];
  const registered = [];
  for (const [name, a] of allowedByName) {
    const exists = dirs.includes(name) || files.includes(name);
    if (!exists) stale.push({ name, reason: a.reason });
    else registered.push({ name, reason: a.reason, kind: a.kind });
  }

  return { gaps, stale, registered, covered, total, label };
}

/**
 * 把对账结果渲染成给人看的行。
 * @param {ReturnType<typeof checkTopLevelCoverage>} res
 * @returns {string[]}
 */
export function renderCoverage(res) {
  const lines = [];
  if (res.gaps.length > 0) {
    lines.push('');
    lines.push('✗ 顶层目录/文件没有交代（未被扫描 / 未被排除 / 未登记）:');
    for (const g of res.gaps) {
      lines.push('  · ' + (g.kind === 'dir' ? '目录 ' : '文件 ') + g.name
        + '  ⇒ ⇒ 这一格**没人判** ⇒ ⇒ 补进扫描范围，或登记成「刻意不扫」（写清理由）。');
    }
  }
  if (res.stale.length > 0) {
    lines.push('');
    lines.push('✗ 登记已过期（登记了但目录/文件已经不存在）:');
    for (const s of res.stale) {
      lines.push('  · ' + s.name + '  —— ' + s.reason);
    }
    lines.push('  ⇒ ⇒ 销账：把这条登记删掉（或改成现在真实存在的东西）。');
  }
  const debts = (res.registered || []).filter((r) => r.kind !== 'skip');
  const skips = (res.registered || []).filter((r) => r.kind === 'skip');
  if (debts.length > 0) {
    lines.push('');
    lines.push('· 已登记的**顶层缺口**（放行但**仍要打印** —— 登记不是认可）:');
    for (const d of debts) {
      lines.push('  · ' + d.name + '  —— ' + d.reason);
    }
  }
  if (skips.length > 0) {
    lines.push('');
    lines.push('· 已登记的**刻意不扫**（别人家的闸管 / 工具目录）:');
    for (const d of skips) {
      lines.push('  · ' + d.name + '  —— ' + d.reason);
    }
  }
  if (res.gaps.length === 0 && res.stale.length === 0) {
    lines.push('  ✓ 顶层对账：' + res.covered + '/' + res.total + ' 个顶层条目都有交代');
  }
  return lines;
}

/**
 * 自检：证明这道判据**有分辨力**（不是恒绿）。
 * 四条：
 *   ① 一个没交代的目录 ⇒ 必须报缺口
 *   ② 一个没交代的**文件** ⇒ 必须报缺口
 *   ③ 交代齐了 ⇒ 必须不报缺口
 *   ④ 登记了但目录已不存在 ⇒ 必须报「登记已过期」
 *
 * ⚠️ 全程在**系统临时目录**里造夹具 ⇒ ⇒ 真仓库一个字节都不动。
 */
export function coverageSelfTest() {
  const lines = [];
  let fails = 0;
  let total = 0;

  const mk = (entries) => {
    const d = mkdtempSync(join(tmpdir(), 'cov-self-test-'));
    for (const e of entries) {
      const p = join(d, e);
      if (e.endsWith('/')) mkdirSync(p, { recursive: true });
      else writeFileSync(p, 'x', 'utf8');
    }
    return d;
  };
  const cleanup = (d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } };

  // ① 没交代的目录 ⇒ 缺口
  {
    total++;
    const d = mk(['src/', 'notes.txt', 'extra/']);
    const res = checkTopLevelCoverage({
      root: d, label: 'self-test-1',
      scanDirs: ['src'], scanFiles: [],
    });
    const ok = res.gaps.some((g) => g.kind === 'file' && g.name === 'notes.txt')
      && res.gaps.some((g) => g.kind === 'dir' && g.name === 'extra');
    lines.push((ok ? '✓' : '✗') + ' ① 没交代的目录与文件都会被报成缺口');
    if (!ok) fails++;
    cleanup(d);
  }

  // ② 交代齐了 ⇒ 不报缺口
  {
    total++;
    const d = mk(['src/', 'README.md', 'notes.txt']);
    const res = checkTopLevelCoverage({
      root: d, label: 'self-test-2',
      scanDirs: ['src'], scanFiles: ['README.md'],
      excludeFiles: ['notes.txt'],
    });
    const ok = res.gaps.length === 0 && res.stale.length === 0;
    lines.push((ok ? '✓' : '✗') + ' ② 交代齐了（扫描 / 排除）不会误报');
    if (!ok) { fails++; for (const g of res.gaps) lines.push('    缺口: ' + g.kind + ' ' + g.name); }
    cleanup(d);
  }

  // ③ 登记（allowedTopDirs）也算交代
  {
    total++;
    const d = mk(['src/', 'vendor/']);
    const res = checkTopLevelCoverage({
      root: d, label: 'self-test-3',
      scanDirs: ['src'],
      allowedTopDirs: [{ dir: 'vendor', reason: '第三方 vendored 目录' }],
    });
    const ok = res.gaps.length === 0;
    lines.push((ok ? '✓' : '✗') + ' ③ 登记成「刻意不扫」也算交代');
    if (!ok) { fails++; for (const g of res.gaps) lines.push('    缺口: ' + g.kind + ' ' + g.name); }
    cleanup(d);
  }

  // ④ 登记已过期 ⇒ 报「要销账」
  {
    total++;
    const d = mk(['src/']);
    const res = checkTopLevelCoverage({
      root: d, label: 'self-test-4',
      scanDirs: ['src'],
      allowedTopDirs: [{ dir: 'gone', reason: '已经不存在的目录' }],
    });
    const ok = res.stale.length === 1 && res.stale[0].name === 'gone';
    lines.push((ok ? '✓' : '✗') + ' ④ 登记已过期会被报出来（要销账）');
    if (!ok) fails++;
    cleanup(d);
  }

  return { code: fails === 0 ? 0 : 1, out: lines.join('\n'), total, fails };
}
