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
 *   ⚠️ **下列两条已被 2026-11-08 第三次实测作废**（保留在此只为记录被推翻的中间结论）：
 *   ❶ 「vitest 不在文件之间还原 `process.env` ⇒ ⇒ 跨文件污染是真机制」——**作废**。
 *   ❷ 「文件执行顺序会漂 ⇒ ⇒ 泄漏是间歇性的」——**作废**（它只是"顺序不可控"，
 *      而当时把"不可控"读成了"会泄漏"）。
 *      作废的原因：**这两条的读数都建立在「写文件先跑」这个假设上** ⇒ ⇒ 而该假设
 *      **不成立**（vitest `BaseSequencer.sort()` 对**未知**文件走「run unknown first」
 *      分支，**不是**「按大小降序」）⇒ ⇒ 顺序不可控 ≠ 会泄漏。
 *      ⇒ ⇒ **教训：凡比较「谁先跑」的实验，必须用握手/轮询（顺序无关）或显式钉顺序。**
 *      ⇒ ⇒ 现结论见下方「族 2」段。
 *
 *   **第三次实测（顺序无关的握手探针，vitest 3.2.4）**：
 *   写侧在 marker 上打点（`globalThis` 与 `process.env` 各一版）、读侧**轮询**
 *   ⇒ ⇒ 谁先跑都无所谓。决定性对照：
 *   · **N1**（root＝桌面端、探针文件在 **root 之外**）⇒ ⇒ 读侧看到 `marked-by-K3`
 *     ⇒ ⇒ **共享**；
 *   · **N2**（root＝探针目录、文件在 **root 之内**）⇒ ⇒ 读侧看到 `undefined`
 *     ⇒ ⇒ **不共享**；
 *   · root 内**五种拓扑**（多 worker／单 worker／`isolate:false`／`forks`／
 *     `maxWorkers+minWorkers`）⇒ ⇒ **全部不共享**。
 *   ⇒ ⇒ **真机制＝「测试文件在 vitest `root` 之外」**（vitest 不为 root 外的文件
 *   建独立环境）⇒ ⇒ **与 `isolate`／worker 拓扑无关**。
 *
 * ⇒ ⇒ **JS 面真正会判红的是族 1 与族 3**（族 2 已降为只读数）：
 *
 *   **族 1 · 并发块内的 env 写** —— `it.concurrent`／`test.concurrent`／
 *   `describe.concurrent` 的块里写 env ⇒ ⇒ 与并行的兄弟块**同时**共享 env。
 *   （实测：探针 C ⇒ 并发兄弟块读到 `set-by-C1`。）
 *
 *   **族 2 · 跨文件污染（不还原的裸写）** —— ⚠️⚠️ **2026-11-08 第三次实测给出了
 *   真机制**：「同 worker ⇒ ⇒ 跨文件共享」是**错的**（那些读数都建立在
 *   「大文件先跑 ⇒ ⇒ 写文件先跑」这个**不可靠**的顺序假设上 ⇒ ⇒ 首次跑时 vitest
 *   对**未知**文件**不按大小排序** ⇒ ⇒ 顺序不可控）。⇒ ⇒ **顺序无关的握手探针**
 *   （写侧打 marker ＋ 读侧轮询 ⇒ ⇒ 谁先跑都无所谓）给出真机制：
 *   **跨文件 `process.env` 共享 ⇔ 测试文件在 vitest `root` 之外**（root 内 ⇒ ⇒ 五种
 *   拓扑全部不共享；root 外 ⇒ ⇒ 共享）⇒ ⇒ 与 `isolate`／worker 拓扑**无关**。
 *   ⇒ ⇒ **在真实工程里（测试文件全在 root 内）这一族不成立** ⇒ ⇒ 判红档已撤
 *   ⇒ ⇒ 只保留**读数**（谁裸写了 env 且不还原 ⇒ ⇒ 可见，便于将来出现 root 外扫描面）。
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
    || maxWorkers === 1;
  // ⚠️⚠️ **v4 更正：跨文件 env 共享需要两个条件**（**AND**，不是 OR）——
  //   实测矩阵（同 root、首次跑、写文件先跑）：
  //   · `isolate: false` ＋ **同 worker** ⇒ ⇒ **泄漏**（PROBE_G4_SEEN=set-by-G3）
  //   · `isolate: false` ＋ **多 worker** ⇒ ⇒ 不泄漏（两个文件分到不同 worker ⇒ 隔离）
  //   · **同 worker** ＋ isolate 默认（true）⇒ ⇒ **不泄漏**（每文件重建环境 ⇒ env 隔离）
  //   · `maxWorkers: 1` ＋ isolate 默认 ⇒ ⇒ 不泄漏
  //   ⇒ ⇒ v3 那个「fileParallelism:false／singleThread／maxWorkers:1／isolate:false
  //   **任一**成立就判红」的写法**过宽** ⇒ ⇒ 会在这些配置下**误报**。
  // ⚠️⚠️ **2026-11-08 第三次实测：连「收窄成 AND」这一步也作废** ——
  //   顺序无关的握手探针给出的真机制是「**测试文件在 vitest root 之外**」
  //   ⇒ ⇒ 与 isolate／worker 拓扑**无关** ⇒ ⇒ 下面这些字段**只作读数**
  //   （拓扑形状可见），**不再**用来决定「判红档」。
  const isolateShared = isolate === false;
  const crossFileCertain = false;
  return { excludes, sequenceConcurrent, fileParallelism, singleThread, isolate, maxWorkers, sameWorkerLikely, isolateShared, crossFileCertain };
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
  // ⚠️⚠️ **族 2（跨文件污染）在真实工程里**不成立** ⇒ ⇒ 只作读数、永不判红** ——
  //   2026-11-08 **顺序无关的握手探针**（写侧在 globalThis / process.env 上打 marker，
  //   读侧轮询 ⇒ ⇒ 谁先跑都无所谓）给出决定性对照：
  //   · **root 之内**的两个测试文件 ⇒ ⇒ `process.env` 与 `globalThis` **都不共享**
  //     （五种拓扑全试过：多 worker／单 worker／isolate:false／forks／maxWorkers+minWorkers
  //      ⇒ ⇒ 全部「不共享」）⇒ ⇒ vitest **每个测试文件一个独立环境**；
  //   · **root 之外**的两个测试文件 ⇒ ⇒ **共享**（`PROBE_K4_SEEN=marked-by-K3`）
  //     ⇒ ⇒ 与 isolate／worker 拓扑**无关** ⇒ ⇒ 真机制是「**文件在 vitest root 之外**」
  //     ⇒ ⇒ vitest 不为 root 外的文件建独立环境。
  //   ⇒ ⇒ 本闸的扫描面**就是 root 的子集**（listJsTestFiles(root)）⇒ ⇒ 这一族
  //   **永不成立** ⇒ ⇒ 判红档已撤（留在这里只会诱使人写出「四个开关任一成立就判红」
  //   那种**过宽**的判据）⇒ ⇒ 只保留**读数**（可见：谁裸写了 env 且不还原）。
  const sameWorkerLikely = !!opts.sameWorkerLikely;
  const crossFileCertain = false;
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
          // ⚠️ 族 2 **只进读数**（见上方实测）⇒ ⇒ 不进 candidates ⇒ ⇒ 永不判红
          crossFileConditional.push(item);
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
    crossFileCertain: false,
    crossFileNote: '实测：跨文件 env 共享 ⇔ 测试文件在 vitest root 之外；本闸扫描面是 root 的子集 ⇒ ⇒ 这一族在真实工程里不成立 ⇒ ⇒ 只作读数、不判红',
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
