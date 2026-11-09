#!/usr/bin/env node
/**
 * **提交面 import 自足性闸** —— 提交树里每一条相对 import 都必须解析得到树内真实文件。
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * 2026-11-11 真 CI 实测（head a5a8b5d）：主 CI 的 **Desktop Build** 与 **Desktop Tests**
 * 双红 ＋ **E2E Typecheck** 红 —— 三个红灯，**同一个根因**：
 * 并行会话的 `6ea630a` 把引用方 `src/pages/SettingsPage.tsx` 提交了，
 * 而它 import 的 `src/lib/chatBackground.ts` **从未进提交树**
 * ⇒ ⇒ **提交树自相矛盾** ⇒ ⇒ 编译不过。
 *
 * ⚠️ 而这一格此前**只由 CI 的 tsc / vitest / vite 顺带回答**
 * ⇒ ⇒ 要等整套工具链装好、跑起来才暴露 ⇒ ⇒ **红灯已经是既成事实**了。
 * ⇒ ⇒ 这把闸把它提前到「提交那一刻」：只要提交树里有悬空 import，当场红。
 *
 * ## 判红
 *
 *   提交树（或工作树）里存在一条**相对 import**（`./x` / `../x`），
 *   它的目标**在树里不存在** ⇒ ⇒ 判红，并逐字点名：谁、在第几行、import 了什么。
 *
 * ## 退出码
 *
 *   **0 绿 / 1 红 / 2 判不了**（不是 git 仓 / ref 读不到 ⇒ ⇒ 「判不了」≠「没问题」）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-commit-import-integrity.mjs                 # 量 HEAD 的提交树（默认）
 * node scripts/check-commit-import-integrity.mjs --rev=6ea630a    # 量某一笔的提交树
 * node scripts/check-commit-import-integrity.mjs --worktree       # 量工作树（提交前用）
 * node scripts/check-commit-import-integrity.mjs --self-test      # 判据自检
 * node scripts/check-commit-import-integrity.mjs --json           # 机器可读
 * ```
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractRelativeImports,
  findDanglingImports,
  resolveRelativeImport,
} from './lib/commit-import-integrity.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');

/** 跑一条 git 命令（失败 ⇒ ok:false，不抛）。 */
function g(args, opts) {
  const res = spawnSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...(opts || {}),
  });
  if (res.error) return { ok: false, out: '', err: String(res.error.message) };
  if (res.status !== 0) return { ok: false, out: String(res.stdout || ''), err: String(res.stderr || '') };
  return { ok: true, out: String(res.stdout || '') };
}

/** 列出 ref 提交树里的全部文件路径。 */
function listTreeFiles(rev) {
  const res = g(['ls-tree', '-r', '--name-only', rev]);
  if (!res.ok) return { error: res.err || ('读不到提交树 ' + rev) };
  return { files: res.out.split('\n').filter((f) => f.length > 0) };
}

/**
 * 用 `git cat-file --batch` 一次读回多个 blob（比逐个 `git show` 快一个量级）。
 * ⚠️ **按字节读**（encoding:'buffer'）⇒ ⇒ 否则 BOM / 二进制会被解码破坏。
 */
function readBlobs(rev, files) {
  const input = files.map((f) => rev + ':' + f).join('\n') + '\n';
  const res = spawnSync('git', ['-C', REPO, 'cat-file', '--batch'], {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error) return { error: String(res.error.message) };
  if (res.status !== 0) return { error: String(res.stderr || '') };
  const buf = res.stdout;
  const out = new Map();
  let off = 0;
  // ⚠️ `git cat-file --batch` 的头是「<sha> <type> <size>」⇒ ⇒ **头里没有路径**
  //    ⇒ ⇒ 只能**按输入顺序**对齐（输入一行 ⇒ 输出一条记录）⇒ ⇒ 别拿 parts[1] 当路径。
  let idx = 0;
  while (off < buf.length && idx < files.length) {
    const nl = buf.indexOf(10, off);
    if (nl < 0) break;
    const header = buf.toString('utf8', off, nl);
    off = nl + 1;
    const name = files[idx];
    idx += 1;
    const parts = header.split(' ');
    if (parts.length < 3) continue; // 「<name> missing」⇒ ⇒ 树里没这个路径
    const size = Number(parts[parts.length - 1]);
    if (!Number.isFinite(size)) continue;
    const body = buf.toString('utf8', off, off + size);
    off += size + 1;
    out.set(name, body);
  }
  return { blobs: out };
}

/** 读工作树文件。 */
function readWorktree(files) {
  const map = new Map();
  for (const f of files) {
    try {
      map.set(f, readFileSync(join(REPO, f), 'utf8'));
    } catch (err) {
      /* 文件不在磁盘上（被删）⇒ ⇒ 跳过 */
    }
  }
  return { blobs: map };
}

/**
 * **判据自检** —— 在**合成的小树**上证明这把尺子有牙（且不多报）。
 * ⚠️ 必须印出**可数读数**（N/N）⇒ ⇒ 否则接进 CI 后治理闸会记它一笔债。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const tree = [
    'src/a.ts',
    'src/b.tsx',
    'src/c/index.ts',
    'src/d.d.ts',
    'src/e.ts',
    'src/style.css',
    'src/lib/dep.ts',
  ];
  const bodies = {
    'src/a.ts': "import { x } from './lib/dep';\n",
    'src/b.tsx': "import './style.css';\n",
    'src/c/index.ts': "export { x } from '../lib/dep';\n",
    'src/d.d.ts': "export declare const x: number;\n",
    'src/e.ts': "import { x } from './missing';\n",
  };
  const read = (p) => bodies[p];

  add('相对 import 解析得到树内文件 ⇒ ⇒ 不算悬空', () => {
    const r = resolveRelativeImport('src/a.ts', './lib/dep', new Set(tree));
    return r.ok === true && r.resolved === 'src/lib/dep.ts';
  });
  add('非相对 import（依赖包）⇒ ⇒ 不在射程内', () => {
    return extractRelativeImports("import React from 'react';\n").length === 0;
  });
  add('悬空的相对 import ⇒ ⇒ 恰好报一条', () => {
    const r = findDanglingImports(tree, read);
    return r.dangling.length === 1 && r.dangling[0].from === 'src/e.ts';
  });
  add('悬空那条要逐字点名（谁、第几行、import 了什么）', () => {
    const r = findDanglingImports(tree, read);
    const d = r.dangling[0];
    return d.line === 1 && d.specifier === './missing';
  });
  add('目录 import（./c ⇒ ./c/index.ts）⇒ ⇒ 不算悬空', () => {
    const r = resolveRelativeImport('src/a.ts', './c', new Set(tree));
    return r.ok === true && r.resolved === 'src/c/index.ts';
  });
  add('export ... from 也算一条 import', () => {
    return extractRelativeImports("export { x } from './lib/dep';\n").length === 1;
  });
  add('require(...) 也算一条 import', () => {
    return extractRelativeImports("const a = require('./lib/dep');\n").length === 1;
  });
  add('动态 import(...) 也算一条 import', () => {
    return extractRelativeImports("const a = await import('./lib/dep');\n").length === 1;
  });
  add('注释里的 import 不算', () => {
    return extractRelativeImports("// import { x } from './missing';\n").length === 0;
  });
  add('块注释里的 import 不算', () => {
    return extractRelativeImports("/* import { x } from './missing'; */\n").length === 0;
  });
  add('字符串字面量里的 "from \'./missing\'" 不算', () => {
    return extractRelativeImports("const s = \"import x from './missing'\";\n").length === 0;
  });
  add('ESM 风格 ./x.js ⇒ ⇒ 解析到 ./x.ts', () => {
    const r = resolveRelativeImport('src/a.ts', './lib/dep.js', new Set(tree));
    return r.ok === true && r.resolved === 'src/lib/dep.ts';
  });
  add('带扩展名的相对 import ⇒ ⇒ 按原样解析', () => {
    const r = resolveRelativeImport('src/a.ts', './style.css', new Set(tree));
    return r.ok === true && r.resolved === 'src/style.css';
  });
  add('复合扩展名（../styles/accent.g ⇒ ⇒ accent.g.ts）⇒ ⇒ 不算悬空', () => {
    const files2 = tree.concat(['src/styles/accent.g.ts']);
    const r = resolveRelativeImport('src/a.ts', './styles/accent.g', new Set(files2));
    return r.ok === true && r.resolved === 'src/styles/accent.g.ts';
  });
  add('.d.ts 也算树内文件', () => {
    const r = resolveRelativeImport('src/a.ts', './d', new Set(tree));
    return r.ok === true && r.resolved === 'src/d.d.ts';
  });
  add('相对 import 的行号要落在真实行上', () => {
    const src = "import a from 'pkg';\n\nimport { x } from './lib/dep';\n";
    const hits = extractRelativeImports(src);
    return hits.length === 1 && hits[0].line === 3;
  });
  add('多行 import 语句也能抓到', () => {
    const src = "import {\n  a,\n  b,\n} from './lib/dep';\n";
    return extractRelativeImports(src).length === 1;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ ⇒ 这把尺子不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

function parseArgs(argv) {
  const opts = { selfTest: false, json: false, rev: 'HEAD', worktree: false };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--worktree') opts.worktree = true;
    else if (arg.startsWith('--rev=')) opts.rev = arg.slice('--rev='.length);
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) selfTest();

  let files;
  let read;
  let what;

  if (opts.worktree) {
    const res = g(['ls-files']);
    if (!res.ok) {
      console.error('❌ 读不到工作树文件清单 ⇒ ⇒ 判不了 ≠ 没问题');
      process.exit(2);
    }
    files = res.out.split('\n').filter((f) => f.length > 0);
    const { blobs } = readWorktree(files);
    read = (p) => (blobs.has(p) ? blobs.get(p) : null);
    what = '工作树';
  } else {
    const listed = listTreeFiles(opts.rev);
    if (listed.error) {
      console.error('❌ ' + listed.error + ' ⇒ ⇒ 判不了 ≠ 没问题');
      process.exit(2);
    }
    files = listed.files;
    const batch = readBlobs(opts.rev, files);
    if (batch.error) {
      console.error('❌ 读不到提交树内容（' + batch.error + '）⇒ ⇒ 判不了 ≠ 没问题');
      process.exit(2);
    }
    read = (p) => (batch.blobs.has(p) ? batch.blobs.get(p) : null);
    what = '提交树 ' + opts.rev;
  }

  const result = findDanglingImports(files, read);

  if (opts.json) {
    console.log(JSON.stringify({
      what,
      scannedFiles: result.scanned,
      relativeImports: result.relativeCount,
      dangling: result.dangling.map((d) => ({ from: d.from, line: d.line, specifier: d.specifier })),
    }, null, 2));
    process.exit(result.dangling.length > 0 ? 1 : 0);
  }

  console.log('提交面 import 自足性：' + what);
  console.log('   扫 ' + result.scanned + ' 个文件里的 ' + result.relativeCount + ' 条相对 import');
  if (result.dangling.length === 0) {
    console.log('✅ 零悬空 ⇒ ⇒ 提交树自足（每条相对 import 都解析得到树内真实文件）');
    process.exit(0);
  }
  console.error('❌ 悬空相对 import：' + result.dangling.length + ' 条 ⇒ ⇒ 这一面编译不过');
  for (const d of result.dangling) {
    console.error('   · ' + d.from + ':' + d.line + '  ⇒  import ' + d.specifier + '  ⇒  树里没有这个文件');
  }
  console.error('   ⇒ ⇒ 修法：把被引用的文件一起提交（或把引用方撤回）⇒ ⇒ 别让引用方单独进提交树');
  process.exit(1);
}

main();
