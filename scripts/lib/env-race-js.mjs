/**
 * **JS/TS 侧的 env 竞争扫描面** —— 引擎（判据在闸里，算法在这里）。
 * ============================================================================
 *
 * ## 为什么 JS 面的判据**不能照搬** Rust 那套
 *
 * Rust 面（`scripts/check-test-env-races.mjs`）的判据是「同一个 env 被 ≥2 个
 * 测试函数改」⇒ ⇒ 因为 `cargo test` 把**同一个二进制**里的测试**开多线程
 * 并发跑** ⇒ ⇒ 进程级 env 是**共享全局**。
 *
 * ⚠️ **JS 侧不是这个机制** ⇒ ⇒ 照搬会**误报**（把安全的代码判成缺陷）。
 * 2026-11-08 **真机实测**（vitest 3.2.4，三个探针文件）：
 *
 *   ① **跨 test file** ⇒ ⇒ **不竞争**。探针 A 改了 env 不还原，探针 B 在
 *      **同一个 worker**（`singleThread: true` 强制）里顺序跑 ⇒ ⇒ B 读到的是
 *      **`undefined`** ⇒ ⇒ vitest 在**文件之间还原了** `process.env`。
 *   ② **同文件、顺序 `it`** ⇒ ⇒ **不竞争**。vitest 默认 `sequence.concurrent
 *      = false` ⇒ ⇒ 同一文件内的 `it` **顺序执行** ⇒ ⇒ 不存在窗口重叠。
 *   ③ **同文件、`it.concurrent`** ⇒ ⇒ **真竞争**！探针 C1 设的 env，被并行的
 *      C2 **读到了**（`PROBE_C_SEEN=set-by-C1`）⇒ ⇒ 这才是 JS 侧的真竞争面。
 *
 * ⇒ ⇒ **JS 面的判据＝「并发块里的裸 env 写」**（不是「多个 owner」）。
 *
 * ## 豁免：`vi.stubEnv`
 *
 * vitest 官方 API `vi.stubEnv(key, value)` **由 vitest 自己管还原**
 * （`vi.unstubAllEnvs()`／每个测试后自动）⇒ ⇒ 用它写的 env **不算竞争**
 * ⇒ ⇒ 不判红（但仍可在读数里看见它）。
 *
 * ## 覆盖面：**只扫 vitest 会跑的那批文件**
 *
 * ⚠️ 本仓有多套 runner（vitest／playwright／wdio／tauri-driver）⇒ ⇒ 它们的
 * 并发模型不同（playwright 与 wdio 的 worker 是**独立进程** ⇒ ⇒ env 独立）
 * ⇒ ⇒ 把它们套上 vitest 的判据同样是**误报**。
 * ⇒ ⇒ 所以扫描范围＝**vitest 的 include 集**（`*.test.{ts,tsx}`）**减去**
 * 它自己配置里的 `exclude` 前缀（wdio／tauri-e2e／e2e-ui／api-contract）。
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'dist-web', 'build', 'out', 'coverage',
  '.git', '.local', 'test-results', 'playwright-report', '.next',
]);

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;

/**
 * 从 vitest 配置里读出 `exclude` 的字符串前缀。
 * ⚠️ 认不出就返回空数组（⇒ ⇒ 扫描面偏大 ⇒ ⇒ 宁可多报也不漏报）——
 *    闸那一层会把它当「判不了」之外的保守面处理。
 */
export function readVitestExcludes(vitestConfigPath) {
  let text;
  try { text = fs.readFileSync(vitestConfigPath, 'utf8'); } catch { return []; }
  const idx = text.indexOf('exclude:');
  if (idx < 0) return [];
  const seg = text.slice(idx, text.indexOf(']', idx) + 1);
  const out = [];
  const re = /'([^']+)'|"([^"]+)"/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const v = m[1] || m[2];
    if (v && !v.includes('*')) out.push(v);
  }
  return out;
}

/** 列出测试文件（相对 root 的 posix 路径）。 */
export function listJsTestFiles(root, excludes) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.isFile() && TEST_FILE_RE.test(e.name)) {
        const rel = path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/');
        if (excludes.some((x) => rel.startsWith(x.replace(/\\/g, '/')))) continue;
        out.push(rel);
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

/**
 * 扫一个 JS/TS 文件：找出 env 变异点、读点，以及**它们是否落在并发块里**。
 *
 * ⚠️ 行级启发式（不建 AST）⇒ ⇒ 读数是**候选清单**，不是判决。
 *   · 并发块＝ `it.concurrent(` / `test.concurrent(` / `describe.concurrent(`
 *     开头的那个块（按花括号配平找它的结尾）。
 *   · 变异＝ `process.env.X = ...` / `delete process.env.X` /
 *     `process.env['X'] = ...`（**裸写**）。
 *   · `vi.stubEnv(` ⇒ ⇒ **豁免**（vitest 自己管还原）。
 */
export function scanJsFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const lines = text.split(/\r?\n/);

  const mut = [];   // { line, var, kind, concurrent }
  const read = [];  // { line, var, concurrent }
  const stub = [];  // { line, var }  ← vi.stubEnv（豁免）

  // 找出所有并发块的行区间（用花括号配平）。
  const concurrentRanges = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\b(?:it|test|describe)\.concurrent\s*\(/.test(lines[i])) continue;
    let depth = 0;
    let started = false;
    let end = lines.length - 1;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') {
          depth--;
          if (started && depth <= 0) { end = j; break; }
        }
      }
      if (started && depth <= 0) { end = j; break; }
    }
    concurrentRanges.push([i + 1, end + 1]);
  }
  const inConcurrent = (lineNo) =>
    concurrentRanges.some(([a, b]) => lineNo >= a && lineNo <= b);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;

    // vi.stubEnv ⇒ ⇒ 豁免（vitest 自己管还原）
    const stubM = raw.match(/vi\.stubEnv\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]/);
    if (stubM) { stub.push({ line: lineNo, var: stubM[1] }); continue; }

    // 变异：process.env.X = ... （**赋值**才算变异）
    const setM = raw.match(/process\.env\.([A-Za-z0-9_]+)\s*=(?!=)/);
    if (setM) {
      mut.push({ line: lineNo, var: setM[1], kind: 'set', concurrent: inConcurrent(lineNo) });
      continue;
    }
    // 变异：delete process.env.X
    const delM = raw.match(/delete\s+process\.env\.([A-Za-z0-9_]+)/);
    if (delM) {
      mut.push({ line: lineNo, var: delM[1], kind: 'delete', concurrent: inConcurrent(lineNo) });
      continue;
    }
    // 变异：process.env['X'] = ...
    const brM = raw.match(/process\.env\[['"`]([A-Za-z0-9_]+)['"`]\]\s*=(?!=)/);
    if (brM) {
      mut.push({ line: lineNo, var: brM[1], kind: 'set', concurrent: inConcurrent(lineNo) });
      continue;
    }
    // 读点：process.env.X（**不是赋值**）
    const readM = raw.match(/process\.env\.([A-Za-z0-9_]+)/);
    if (readM) {
      read.push({ line: lineNo, var: readM[1], concurrent: inConcurrent(lineNo) });
      continue;
    }
    const readBrM = raw.match(/process\.env\[['"`]([A-Za-z0-9_]+)['"`\]]/);
    if (readBrM) read.push({ line: lineNo, var: readBrM[1], concurrent: inConcurrent(lineNo) });
  }

  return { mut, read, stub, concurrentRanges };
}

/**
 * 普查一个 JS/TS 树 ⇒ 候选清单 ＋ 读数。
 *
 * 判据（**JS 面的**）：
 *   · **并发块面**：env 变异落在**并发块**里（⇒ ⇒ 它与并行的兄弟块共享 env）
 *     ⇒ ⇒ 且这个 var **有人读**（同文件读点，或生产代码读点）⇒ ⇒ 才是候选。
 *   · **闸值污染面**：上面这些 var，**生产代码**（非测试文件）也读它。
 */
export function censusJs(root, opts = {}) {
  const excludes = opts.excludes || [];
  const prodDirs = opts.prodDirs || ['src'];
  const files = listJsTestFiles(root, excludes);

  // 生产代码读点（src/ 下的非测试文件）。
  const prodRead = new Map();
  const prodFiles = [];
  for (const d of prodDirs) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    collectProd(abs, prodRead, prodFiles);
  }

  const perFile = [];
  let candidates = 0;
  let concurrentMuts = 0;

  for (const rel of files) {
    const r = scanJsFile(path.join(root, rel));
    if (!r) continue;

    const concurrentMut = r.mut.filter((m) => m.concurrent);
    concurrentMuts += concurrentMut.length;

    // 同文件内的读点。
    const fileRead = new Map();
    for (const p of r.read) {
      if (!fileRead.has(p.var)) fileRead.set(p.var, []);
      fileRead.get(p.var).push(rel + ':' + p.line);
    }

    const sameBinary = [];
    const gatePolluted = [];
    for (const m of concurrentMut) {
      const tReads = fileRead.get(m.var) || [];
      const pReads = prodRead.get(m.var) || [];
      if (!tReads.length && !pReads.length) continue;
      sameBinary.push({ var: m.var, fns: ['(并发块)'], pts: [m], testRead: tReads, prodRead: pReads });
      if (pReads.length) gatePolluted.push({ var: m.var, fns: ['(并发块)'], pts: [m], prodRead: pReads });
    }

    if (sameBinary.length || gatePolluted.length) {
      candidates += sameBinary.length + gatePolluted.length;
      perFile.push({ file: rel, sameBinary, gatePolluted, stubbed: r.stub });
    }
  }

  const summary = {
    jsFilesScanned: files.length,
    prodFilesScanned: prodFiles.length,
    concurrentMuts,
    candidates,
  };
  return { summary, report: perFile };
}

function collectProd(dir, prodRead, prodFiles) {
  const walk = (d, depth) => {
    if (depth > 8) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(d, e.name), depth + 1);
      } else if (e.isFile() && /\.(ts|tsx|js|mjs)$/.test(e.name) && !TEST_FILE_RE.test(e.name)) {
        prodFiles.push(path.join(d, e.name));
        let text;
        try { text = fs.readFileSync(path.join(d, e.name), 'utf8'); } catch { continue; }
        const re = /process\.env\.([A-Za-z0-9_]+)/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          const v = m[1];
          if (!prodRead.has(v)) prodRead.set(v, []);
          prodRead.get(v).push(path.relative(dir, path.join(d, e.name)).replace(/\\/g, '/'));
        }
      }
    }
  };
  walk(dir, 0);
}
