/**
 * **JS/TS 侧的 env 竞争扫描面** —— 引擎（判据在闸里，算法在这里）。
 * ============================================================================
 *
 * ## 为什么 JS 面的判据**不能照搬** Rust 那套
 *
 * Rust 面（`scripts/check-test-env-races.mjs`）的判据是「同一个 env 被 ≥2 个
 * 测试函数改」⇒ ⇒ 因为 `cargo test` 把**同一个二进制**里的测试**开多线程
 * 并发跑**⇒ ⇒ 进程级 env 是**共享全局**。
 *
 * ⚠️ **JS 侧不是这个机制** ⇒ ⇒ 照搬会**误报**（把安全的代码判成缺陷）。
 *
 * ## ⚠️⚠️ 2026-11-08 第二次实测：**推翻本文件上一版写下的那条结论**
 *
 * 上一版写的是：「vitest 在**文件之间**还原 `process.env` ⇒ ⇒ 跨 test file
 * **不竞争**」⇒ ⇒ 那条结论**是错的** —— 它把**一次执行顺序的巧合**当成了机制。
 *
 * **实测证据**（vitest 3.2.4，本仓 shadow-desktop 的 vitest）：
 *
 *   ❶ **vitest 不在文件之间还原 `process.env`** ⇒ ⇒ 跨文件污染是**真机制**。
 *      决定性对照实验（同一 worker、`singleThread`、`fileParallelism:false`）：
 *      · 大文件（先跑）设 env **不还原** ⇒ ⇒ 小文件（后跑）读到 **set-by-S1**
 *        ⇒ ⇒ **确实泄漏**；
 *      · 对照组：读者是大文件（先跑）⇒ ⇒ 读到 **undefined** ⇒ ⇒ 泄漏**依赖顺序**。
 *   ❷ **文件执行顺序会漂** ⇒ ⇒ 所以泄漏是**间歇性**的（飘红）。
 *      vitest 的 `BaseSequencer.sort()`（`node_modules/vitest/dist/chunks/…`）：
 *      · 没有结果缓存时 ⇒ ⇒ **按文件大小降序**（大的先跑）；
 *      · 有结果缓存时 ⇒ ⇒ **上次失败的先跑**，再**上次耗时长的先跑**；
 *      ⇒ ⇒ 缓存状态一变 ⇒ ⇒ 顺序就变 ⇒ ⇒ 同一份代码有时漏有时不漏。
 *
 * ⇒ ⇒ **JS 面的真竞争面有两族**（缺一不可）：
 *
 *   **族 1 · 并发块内的 env 写** —— `it.concurrent`／`test.concurrent`／
 *   `describe.concurrent` 的块里写 env ⇒ ⇒ 与并行的兄弟块**同时**共享 env。
 *   （实测：探针 C ⇒ 并发兄弟块读到 `set-by-C1`。）
 *
 *   **族 2 · 跨文件污染（不还原的裸写）** —— 某测试文件裸写 env **且不还原**
 *   ⇒ ⇒ 它污染**同 worker 里后续跑的任何文件** ⇒ ⇒ 顺序漂 ⇒ ⇒ 飘红。
 *   （实测：探针 S ⇒ 后续文件读到 `set-by-S1`。）
 *
 * ## 族 3 · **配置层并发**（`sequence.concurrent: true`）
 *
 * 实测（探针 G）：只要配置里开了 `sequence.concurrent: true` ⇒ ⇒ **连普通的
 * 顺序 `it` 都并发** ⇒ ⇒ 族 1 的「块内」限定就不够了 ⇒ ⇒ 全工程的 env 写都算
 * 并发面。⇒ ⇒ 判据必须**读配置**，不能只看代码里的 `.concurrent`。
 *
 * ## 豁免：`vi.stubEnv`
 *
 * vitest 官方 API `vi.stubEnv(key, value)` **由 vitest 自己管还原**
 * ⇒ ⇒ 用它写的 env **不算污染** ⇒ ⇒ 不判红（但仍可在读数里看见它）。
 *
 * ## 覆盖面：**只扫 vitest 会跑的那批文件**
 *
 * ⚠️ 本仓有多套 runner（vitest／playwright／wdio／tauri-driver）⇒ ⇒ 它们的
 * 并发模型不同 ⇒ ⇒ 把它们套上 vitest 的判据同样是**误报**。
 * ⇒ ⇒ 扫描范围＝**vitest 的 include 集**（`*.test.{ts,tsx}`）**减去**
 * 它自己配置里的 `exclude` 前缀。
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'dist-web', 'build', 'out', 'coverage',
  '.git', '.local', 'test-results', 'playwright-report', '.next',
]);

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;

/**
 * 从 vitest 配置里读出 `exclude` 的字符串前缀 ＋ `sequence.concurrent` 开关。
 * ⚠️ 认不出就返回空数组（⇒ ⇒ 扫描面偏大 ⇒ ⇒ 宁可多报也不漏报）。
 */
export function readVitestConfig(configPath) {
  let text = '';
  try { text = fs.readFileSync(configPath, 'utf8'); } catch { /* ignore */ }
  const excludes = [];
  const idx = text.indexOf('exclude:');
  if (idx >= 0) {
    const seg = text.slice(idx, text.indexOf(']', idx) + 1);
    const re = /'([^']+)'|"([^"]+)"/g;
    let m;
    while ((m = re.exec(seg)) !== null) {
      const v = m[1] || m[2];
      if (!v) continue;
      // ⚠️⚠️ **不能因为带通配符就整条丢掉** —— vitest 的 exclude 里正是
      //   'tests/wdio/**' / 'tests/tauri-e2e/**' / 'tests/e2e-ui/**' 这种形状
      //   ⇒ ⇒ 旧写法把带 '*' 的**整条静默丢弃** ⇒ ⇒ 那些**独立进程**的
      //   runner（playwright／wdio／tauri-e2e）目录**仍在扫描面内** ⇒ ⇒
      //   把它们的测试套上 vitest 的判据 ⇒ ⇒ **误报**（实测：本仓读数里
      //   出现了 tests/tauri-e2e/... 的裸写 env）⇒ ⇒ 这里取「第一个 '*' 之前
      //   的前缀」当目录前缀（tests/wdio/** ⇒ tests/wdio/）⇒ ⇒ 排除生效。
      const clean = v.replace(/\\/g, '/');
      const starIdx = clean.indexOf('*');
      const prefix = starIdx >= 0 ? clean.slice(0, starIdx) : clean;
      if (prefix) excludes.push(prefix);
    }
  }
  // sequence: { concurrent: true } ⇒ ⇒ 全部测试都并发（顺序 it 也并发）
  let sequenceConcurrent = false;
  const seqIdx = text.indexOf('sequence');
  if (seqIdx >= 0) {
    sequenceConcurrent = /concurrent\s*:\s*true/.test(text.slice(seqIdx, seqIdx + 400));
  }
  // ⚠️⚠️ **跨文件污染的成立前提＝「多个测试文件落在同一个 worker」** ——
  //   实测（探针 S + E1–E6）：
  //   · **同 worker**（fileParallelism:false／singleThread／maxWorkers:1／
  //     isolate:false）⇒ ⇒ 跨文件 env **共享** ⇒ ⇒ 写文件先跑时读文件能读到
  //     （实测 PROBE_S2_SEEN=set-by-S1）；
  //   · **多 worker**（默认）⇒ ⇒ 每个文件一个独立 worker ⇒ ⇒ env **隔离**
  //     ⇒ ⇒ 即使写文件先跑也读不到（实测 E5/E6：ORDER=leak-ran 在前，
  //     AB_SEEN 仍是 undefined）。
  //   ⇒ ⇒ 所以族 2 必须**分两档**：同 worker ⇒ 判红；默认多 worker ⇒ 只作读数。
  const boolOrNull = (re) => {
    const m = text.match(re);
    return m ? m[1] === 'true' : null;
  };
  const fileParallelism = boolOrNull(/fileParallelism\s*:\s*(true|false)/);
  const singleThread = boolOrNull(/singleThread\s*:\s*(true|false)/);
  const isolate = boolOrNull(/isolate\s*:\s*(true|false)/);
  const mwMatch = text.match(/maxWorkers\s*:\s*(\d+)/);
  const maxWorkers = mwMatch ? Number(mwMatch[1]) : null;
  const sameWorkerLikely = fileParallelism === false || singleThread === true
    || maxWorkers === 1 || isolate === false;
  return { excludes, sequenceConcurrent, fileParallelism, singleThread, isolate, maxWorkers, sameWorkerLikely };
}

/** 兼容旧调用：只要 exclude 前缀。 */
export function readVitestExcludes(configPath) {
  return readVitestConfig(configPath).excludes;
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
 * **字符串/注释感知的花括号曲线** —— 逐行给出「净花括号变化」。
 *
 * ⚠️ 上一版是「逐字符数花括号」⇒ ⇒ 字符串里的一个 `}` 会让深度提前归零
 *   ⇒ ⇒ 并发块被**提前截断** ⇒ ⇒ 块内后面的 env 写被判成「不在并发块」
 *   （实测漏判：探针 F ⇒ 运行时兄弟块读到 `set-by-F1`，而旧判据看不见）。
 * ⇒ ⇒ 这里把**行注释／块注释／单双引号／模板串**里的花括号全部排除。
 *
 * ⚠️ 仍是启发式：**正则字面量**里的花括号认不出（少见）；模板串里的 `${…}`
 *   插值整体被忽略（插值里若含花括号，深度会偏高）⇒ ⇒ 配平失败会被显式标为
 *   **判不了**（见 `scanJsFile` 的 `uncertain`）⇒ ⇒ 不会静默当成「干净」。
 */
export function braceProfile(text) {
  const lines = text.split(/\r?\n/);
  const delta = new Array(lines.length).fill(0);
  let state = 'code';
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const nx = line[i + 1];
      if (state === 'code') {
        if (ch === '/' && nx === '/') { state = 'line-comment'; i++; continue; }
        if (ch === '/' && nx === '*') { state = 'block-comment'; i++; continue; }
        if (ch === "'") { state = 'sq'; continue; }
        if (ch === '"') { state = 'dq'; continue; }
        if (ch === '`') { state = 'tpl'; continue; }
        if (ch === '{') delta[li]++;
        else if (ch === '}') delta[li]--;
      } else if (state === 'line-comment') {
        if (ch === '\n') state = 'code';
      } else if (state === 'block-comment') {
        if (ch === '*' && nx === '/') { state = 'code'; i++; }
      } else {
        if (ch === '\\') { i++; continue; }
        if ((state === 'sq' && ch === "'") || (state === 'dq' && ch === '"') || (state === 'tpl' && ch === '`')) {
          state = 'code';
        }
      }
    }
    if (state === 'line-comment') state = 'code';
  }
  return { delta, lines };
}

/** 并发块的声明行（`.concurrent` 前面必须挂着 it/test/describe）。 */
const CONCURRENT_RE = /\b(?:it|test|describe)\b[^\n]*?\.\s*concurrent\s*\(/;

/**
 * 找出所有并发块的行区间。
 * ⚠️ **配平不出来 ⇒ 显式标「判不了」**（不是「当作没有并发块」）⇒ ⇒
 *   保守起见把余下整段都算并发区（宁可多报不漏报），同时把该文件登记进
 *   `uncertain` ⇒ ⇒ 读数里单列，闸会因此**判红**（判不了 ≠ 没问题）。
 */
function findConcurrentRanges(lines, profile) {
  const ranges = [];
  const uncertain = [];
  for (let i = 0; i < lines.length; i++) {
    if (!CONCURRENT_RE.test(lines[i])) continue;
    let d = 0;
    let end = -1;
    for (let j = i; j < lines.length; j++) {
      d += profile.delta[j];
      if (d <= 0) { end = j; break; }
    }
    if (end < 0) {
      uncertain.push({ line: i + 1, reason: '并发块的花括号没配平 ⇒ ⇒ 块边界判不了' });
      ranges.push([i + 1, lines.length]);
    } else {
      ranges.push([i + 1, end + 1]);
    }
  }
  return { ranges, uncertain };
}

/**
 * 扫一个 JS/TS 文件：找出 env 变异点、读点、**是否落在并发块里**、
 * 以及**这个 var 有没有被还原**。
 *
 * ⚠️ 行级启发式（不建 AST）⇒ ⇒ 读数是**候选清单**，不是判决。
 */
export function scanJsFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const lines = text.split(/\r?\n/);
  const profile = braceProfile(text);
  const { ranges, uncertain } = findConcurrentRanges(lines, profile);
  const inConcurrent = (lineNo) => ranges.some(([a, b]) => lineNo >= a && lineNo <= b);

  const mut = [];
  const read = [];
  const stub = [];
  const restored = new Set();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;

    // vi.stubEnv ⇒ ⇒ 豁免（vitest 自己管还原）
    const stubM = raw.match(/vi\.stubEnv\s*\(\s*['"`]([A-Za-z0-9_]+)['"`]/);
    if (stubM) {
      stub.push({ line: lineNo, var: stubM[1] });
      restored.add(stubM[1]);
      continue;
    }

    // 变异：delete process.env.X ⇒ ⇒ **这是还原**
    const delM = raw.match(/delete\s+process\.env\.([A-Za-z0-9_]+)/);
    if (delM) {
      mut.push({ line: lineNo, var: delM[1], kind: 'delete', concurrent: inConcurrent(lineNo), restores: true });
      restored.add(delM[1]);
      continue;
    }
    // 变异：process.env.X = ...
    const setM = raw.match(/process\.env\.([A-Za-z0-9_]+)\s*=(?!=)/);
    if (setM) {
      mut.push({ line: lineNo, var: setM[1], kind: 'set', concurrent: inConcurrent(lineNo), restores: false });
      continue;
    }
    // 变异：process.env['X'] = ...
    const brM = raw.match(/process\.env\[['"`]([A-Za-z0-9_]+)['"`]\]\s*=(?!=)/);
    if (brM) {
      mut.push({ line: lineNo, var: brM[1], kind: 'set', concurrent: inConcurrent(lineNo), restores: false });
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

  return { mut, read, stub, restored: [...restored], concurrentRanges: ranges, uncertain };
}

/**
 * 普查一个 JS/TS 树 ⇒ 候选清单 ＋ 读数。
 *
 * 判据（**JS 面的**）：
 *   · **族 1（并发块面）**：env 变异落在**并发块**里 ⇒ ⇒ 它与并行的兄弟块
 *     同时共享 env ⇒ ⇒ 且这个 var **有人读**（同文件读点或生产读点）⇒ ⇒ 候选。
 *   · **族 3（配置层并发）**：工程配置 `sequence.concurrent: true` ⇒ ⇒ 全工程
 *     的 env 写都算并发面。
 *   · **族 2（跨文件污染面）**：某文件裸写 env **且本文件内不还原**
 *     ⇒ ⇒ 它污染同 worker 后续文件 ⇒ ⇒ **别的文件**（别的测试文件或生产代码）
 *     读它 ⇒ ⇒ 候选。
 *   · **判不了（uncertain）**：并发块的花括号配平不出来 ⇒ ⇒ 单列 ⇒ ⇒ 闸判红。
 */
export function censusJs(root, opts = {}) {
  const excludes = opts.excludes || [];
  const prodDirs = opts.prodDirs || ['src'];
  const sequenceConcurrent = !!opts.sequenceConcurrent;
  // ⚠️ 同 worker 条件（由配置推出来）⇒ ⇒ 决定族 2 是「判红」还是「只读数」
  const sameWorkerLikely = !!opts.sameWorkerLikely;
  const files = listJsTestFiles(root, excludes);

  // 生产代码读点（src/ 下的非测试文件）。
  const prodRead = new Map();
  const prodFiles = [];
  for (const d of prodDirs) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    collectProd(abs, prodRead, prodFiles);
  }

  // 先扫全部测试文件：收集读点（**跨文件污染面要看别的文件的读点**）。
  const scans = new Map();
  const allTestRead = new Map();
  for (const rel of files) {
    const r = scanJsFile(path.join(root, rel));
    if (!r) continue;
    scans.set(rel, r);
    for (const p of r.read) {
      if (!allTestRead.has(p.var)) allTestRead.set(p.var, []);
      allTestRead.get(p.var).push(rel + ':' + p.line);
    }
  }

  const perFile = [];
  const unrestoredList = [];
  let candidates = 0;
  let concurrentMuts = 0;
  let unrestoredMuts = 0;
  const uncertainAll = [];

  for (const [rel, r] of scans) {
    const fileRead = new Map();
    for (const p of r.read) {
      if (!fileRead.has(p.var)) fileRead.set(p.var, []);
      fileRead.get(p.var).push(rel + ':' + p.line);
    }
    const restored = new Set(r.restored);

    const sameBinary = [];
    const gatePolluted = [];
    const crossFile = [];
    const crossFileConditional = [];

    for (const m of r.mut) {
      const isConcurrent = m.concurrent || (sequenceConcurrent && m.kind === 'set');
      if (isConcurrent && m.kind === 'set') {
        concurrentMuts++;
        const tReads = fileRead.get(m.var) || [];
        const pReads = prodRead.get(m.var) || [];
        if (tReads.length || pReads.length) {
          sameBinary.push({ var: m.var, fns: ['(并发面)'], pts: [m], testRead: tReads, prodRead: pReads });
          if (pReads.length) gatePolluted.push({ var: m.var, fns: ['(并发面)'], pts: [m], prodRead: pReads });
        }
      }

      // ⚠️ **族 2**：裸写且**不还原** ⇒ ⇒ 跨文件污染面。
      if (m.kind === 'set' && !restored.has(m.var)) {
        unrestoredMuts++;
        unrestoredList.push({ file: rel, var: m.var, line: m.line, concurrent: m.concurrent });
        const otherTestReads = (allTestRead.get(m.var) || []).filter((s) => !s.startsWith(rel + ':'));
        const pReads = prodRead.get(m.var) || [];
        if (otherTestReads.length || pReads.length) {
          const item = { var: m.var, pts: [m], otherTestRead: otherTestReads, prodRead: pReads };
          // ⚠️ **两档**：同 worker ⇒ 必然污染 ⇒ 判红；默认多 worker ⇒ 条件性
          if (sameWorkerLikely) crossFile.push(item);
          else crossFileConditional.push(item);
        }
      }
    }

    if (sameBinary.length || gatePolluted.length || crossFile.length || crossFileConditional.length) {
      candidates += sameBinary.length + gatePolluted.length + crossFile.length;
      perFile.push({ file: rel, sameBinary, gatePolluted, crossFile, crossFileConditional, stubbed: r.stub });
    }
    if (r.uncertain.length) {
      uncertainAll.push({ file: rel, items: r.uncertain });
    }
  }

  const summary = {
    jsFilesScanned: files.length,
    prodFilesScanned: prodFiles.length,
    concurrentMuts,
    unrestoredMuts,
    candidates,
    crossFileCandidates: perFile.reduce((a, f) => a + f.crossFile.length, 0),
    crossFileConditionalCandidates: perFile.reduce((a, f) => a + (f.crossFileConditional || []).length, 0),
    sameWorkerLikely,
    uncertainBlocks: uncertainAll.reduce((a, f) => a + f.items.length, 0),
    sequenceConcurrent,
  };
  return { summary, report: perFile, uncertain: uncertainAll, unrestored: unrestoredList };
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
