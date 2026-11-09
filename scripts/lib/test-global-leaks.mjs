/**
 * **测试里的「全局替换泄漏」** —— 引擎（判据在闸里，算法在这里）。
 * ============================================================================
 *
 * ## 它守什么（**两族，机制不同，症状一样**）
 *
 * 2026-11-09 真机实测（iBLOC/shadow 桌面端，vitest 3.2.4）：单 worker
 * （`fileParallelism:false` ＋ `singleThread`）下**整仓飘红**，失败文件逐轮漂
 * （6 → 4 → 5 → 1 → 8 → 4）⇒ ⇒ 根因是**四处**全局替换**泄漏**：
 *
 *   **族 A · `vi.stubGlobal('window', …)` 整体替换**
 *   把**整个 `window`** 换成普通对象 ⇒ ⇒ 那个对象上**没有 `localStorage`**
 *   ⇒ ⇒ vitest 默认 `unstubGlobals: false` ⇒ ⇒ **stub 不在文件结束时还原**
 *   ⇒ ⇒ **跨文件泄漏**给同一 worker 的后续文件
 *   ⇒ ⇒ 受害者的 `zustand persist`（默认 storage 是
 *   `createJSONStorage(() => window.localStorage)`，而它**立即求值**
 *   ⇒ ⇒ **在 store 模块 import 的那一刻**就捕获）⇒ ⇒ 捕获到 `undefined`
 *   ⇒ ⇒ 之后每次 `setState` 抛
 *   `TypeError: Cannot read properties of undefined (reading 'setItem')`。
 *
 *   **族 B · 原生 `Object.defineProperty(globalThis, 'localStorage', …)`**
 *   **原生** `defineProperty` **不在** vitest 的 `_stubsGlobal` 表里
 *   ⇒ ⇒ **`vi.unstubAllGlobals()` 管不到它** ⇒ ⇒ 同样**跨文件泄漏**
 *   ⇒ ⇒ 后续受害者从 mock 读到 `undefined`（而不是 `null`）。
 *
 * ⚠️ **两族的症状长得一样**（断言都是「expected undefined …」）⇒ ⇒
 *    **不能靠症状区分** ⇒ ⇒ 必须靠「谁替换了什么全局」来分。
 *
 * ## 判据（**「有替换」不判红，「有替换且无还原」才判红**）
 *
 *   · **族 A**：某文件 `vi.stubGlobal('window'|'globalThis'|'document'|'self', …)`
 *     ⇒ ⇒ 该文件（或该工程的 setup 文件）必须**有还原**
 *     （`vi.unstubAllGlobals()`）⇒ ⇒ 否则候选。
 *   · **族 B**：某文件原生 `defineProperty(globalThis|window, '<状态载体>', …)`
 *     ⇒ ⇒ 该文件必须**有原值备份**（`getOwnPropertyDescriptor`）
 *     **且有还原**（写回原值 / `Reflect.deleteProperty`）⇒ ⇒ 否则候选。
 *
 * ⚠️ **setup 文件是例外**（`tests/setup.ts` 那种「全局接线」）：
 *   · 它是**每个文件都要跑**的 ⇒ ⇒ 它**本来就要**替换 `localStorage`；
 *   · 但**有守卫的兜底**（只在 `typeof globalThis.localStorage === 'undefined'`
 *     时才补）⇒ ⇒ **不判红**（它填的是「本来就缺的那个」）；
 *   · **无条件接管**（不看现值就替换）⇒ ⇒ **判红**（它会覆盖已经存在的真值）。
 *
 * ## ⚠️ **两个必须记住的实现坑**（2026-11-09 实测踩到）
 *
 *   ❶ **不要把字符串内容抹掉再匹配** —— 上一版用「去注释 ＋ 去字符串内容」
 *      做遮罩 ⇒ ⇒ `vi.stubGlobal('window', …)` 的**参数名**被抹成空格
 *      ⇒ ⇒ 正则失配 ⇒ ⇒ **反向验证抓不到注入的泄漏** ⇒ ⇒ 尺子没有分辨力。
 *      ⇒ ⇒ 现在：**注释**才遮罩（保留换行），**字符串原样保留** ＋ 记录区间
 *      ⇒ ⇒ 匹配后再核对「命中位置不在字符串里」。
 *   ❷ **注释里的写法不算** —— `platform.test.ts` 的文件头注释里就写着
 *      `vi.stubGlobal('window', { location: … })`（那是在解释问题）
 *      ⇒ ⇒ 不遮罩注释就会把**说明文字**判成真替换。
 *
 * ## 覆盖面：**靠发现**（不写死工程名）
 *
 * 扫到 `vitest.config.{ts,js,mjs}` 的目录 ⇒ ⇒ 那个目录就是一个 vitest 工程
 * ⇒ ⇒ 扫描面＝**它的 include 集减去 exclude** ＋ **它的 setupFiles**
 * ⇒ ⇒ **新工程自动进面**（漏判在结构上不可能发生）。
 *
 * ⚠️ **带 `.git` 文件的目录不是本仓的工程**（worktree 残留）⇒ ⇒ 跳过。
 *
 * ## 退出码
 *
 * **0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ⇒ 不许伪装成「没问题」）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { readVitestConfig, listJsTestFiles } from './env-race-js.mjs';

/** 整体替换就危险的这几个全局（换掉它们 ⇒ ⇒ 承载 API 的对象整个没了）。 */
export const WHOLE_GLOBALS = ['window', 'globalThis', 'document', 'self'];

/** 原生 defineProperty 覆盖时，这些全局名是「跨文件可见的状态载体」。 */
export const STATE_GLOBALS = [
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'crypto',
  'fetch', 'WebSocket', 'EventSource', 'BroadcastChannel', 'IntersectionObserver',
  'ResizeObserver', 'MutationObserver', 'performance', 'history', 'location',
];

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'dist-web', 'build', 'out', 'coverage',
  '.git', '.local', 'test-results', 'playwright-report', '.next',
]);

/**
 * ⚠️ **worktree 特征目录**（2026-11-09 实测踩到）——
 *   共享仓里别人会留 `.verify-wt/`、`.local/verify-*` 这类**工作树残留**
 *   ⇒ ⇒ 里面**也有** vitest.config.ts ⇒ ⇒ 「靠发现」会把它们**当成第二个工程**
 *   ⇒ ⇒ 扫描面凭空多一倍、读数不可比 ⇒ ⇒ 而且那是**别的树**的代码。
 *   ⇒ ⇒ 判据：**带 `.git` 的目录不是本仓的工程**（worktree 里 `.git` 是文件）。
 */
function isWorktreeDir(dir) {
  try {
    if (!fs.existsSync(path.join(dir, '.git'))) return false;
    return fs.statSync(path.join(dir, '.git')).isFile();
  } catch { return false; }
}

/** 找目录树里所有 vitest 工程（**靠发现** ⇒ ⇒ 新工程自动进面）。 */
export function discoverVitestProjects(root, maxDepth = 5) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        const sub = path.join(dir, e.name);
        if (isWorktreeDir(sub)) continue;   // ⚠️ worktree 残留不是本仓的工程
        walk(sub, depth + 1);
      } else if (e.isFile()) {
        if (/^vitest\.config\.(ts|js|mjs|cjs|mts)$/.test(e.name)) {
          out.push(dir);
        }
      }
    }
  };
  walk(root, 0);
  return [...new Set(out)].sort();
}

/** 该文件是不是「全局接线文件」（setup 之类 ⇒ ⇒ 每个文件都要跑 ⇒ ⇒ 例外）。 */
export function isSetupFile(relPath) {
  const base = String(relPath).split('/').pop() || '';
  return /(^|[.\-/])setup([.\-/]|$)/i.test(base);
}

/** 读 vitest 配置里的 `setupFiles`（相对工程目录的 posix 路径）。 */
export function readSetupFiles(configPath) {
  let text = '';
  try { text = fs.readFileSync(configPath, 'utf8'); } catch { return []; }
  const idx = text.indexOf('setupFiles');
  if (idx < 0) return [];
  const after = text.slice(idx);
  const open = after.indexOf('[');
  let seg;
  if (open >= 0) {
    const close = after.indexOf(']', open);
    seg = after.slice(open + 1, close < 0 ? undefined : close);
  } else {
    seg = after.slice(0, 200);
  }
  const out = [];
  const re = /'([^']+)'|"([^"]+)"/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const v = m[1] || m[2];
    if (!v) continue;
    out.push(v.replace(/^\.\//, '').replace(/\\/g, '/'));
  }
  return out;
}

/**
 * **遮罩**：注释 → 空格（**保留换行**），字符串 → **原样保留** ＋ 记下区间。
 *
 * ⚠️⚠️ **为什么不把字符串内容也抹掉**（2026-11-09 实测踩到）：
 *   抹掉 ⇒ ⇒ `vi.stubGlobal('window', …)` 的**参数名**没了 ⇒ ⇒ 正则失配
 *   ⇒ ⇒ 尺子抓不到注入的泄漏 ⇒ ⇒ **没有分辨力** ⇒ ⇒ 闸是「恒绿尺子」。
 *   ⇒ ⇒ 字符串保留 ＋ 命中后再核对「位置不在字符串里」⇒ ⇒ 两头都对。
 */
export function maskSource(text) {
  const src = String(text == null ? '' : text);
  const out = new Array(src.length);
  const stringRanges = [];
  let quote = null;
  let strStart = -1;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const nx = i + 1 < src.length ? src[i + 1] : '';
    if (quote) {
      out[i] = ch;
      if (ch === '\\') {
        out[i + 1] = nx;
        i += 2;
        continue;
      }
      if (ch === quote) {
        stringRanges.push([strStart, i]);
        quote = null;
        strStart = -1;
      }
      i += 1;
      continue;
    }
    if (ch === '/' && nx === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (ch === '/' && nx === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; break; }
        out[i] = src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      strStart = i;
      out[i] = ch;
      i += 1;
      continue;
    }
    out[i] = ch;
    i += 1;
  }
  if (strStart >= 0) stringRanges.push([strStart, src.length - 1]);
  return { code: out.join(''), stringRanges };
}

function inStringRange(offset, ranges) {
  for (const r of ranges) {
    if (offset >= r[0] && offset <= r[1]) return true;
  }
  return false;
}

/** 只认**代码里**的匹配（不在字符串里的）。 */
export function realMatches(code, stringRanges, re) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const g = new RegExp(re.source, flags);
  const out = [];
  let m;
  while ((m = g.exec(code)) !== null) {
    if (!inStringRange(m.index, stringRanges)) out.push(m);
    if (m.index === g.lastIndex) g.lastIndex += 1;
  }
  return out;
}

function lineStarts(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineOfOffset(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * 这个替换是不是「**有守卫的兜底**」—— 即：它在「值本来就缺」时才补。
 * 判法：往前看最近的一个 `if (`，看它的条件里有没有
 * `typeof globalThis.<name>` 与 `undefined`。
 */
function isGuardedFallback(code, offset, name) {
  const back = code.slice(Math.max(0, offset - 900), offset);
  const ifIdx = back.lastIndexOf('if (');
  if (ifIdx < 0) return false;
  const guard = back.slice(ifIdx);
  const re = new RegExp('typeof\\s+(?:globalThis|window)\\s*\\.\\s*' + name + '\\b');
  return re.test(guard) && /undefined/.test(guard);
}

/**
 * 扫**一段源码** ⇒ 候选清单（纯函数 ⇒ 自检可以直接喂字符串）。
 * @param {string} text 源码
 * @param {string} relPath 相对路径（只用来判「是不是 setup 文件」）
 * @param {{isSetup?: boolean, projectHasUnstub?: boolean}} [opts]
 * @returns {{candidates: object[], hasUnstub: boolean}}
 */
export function scanSource(text, relPath, opts) {
  const o = opts || {};
  const { code, stringRanges } = maskSource(text);
  const starts = lineStarts(code);
  const lineOf = (offset) => lineOfOffset(starts, offset);
  const setup = o.isSetup === undefined ? isSetupFile(relPath) : !!o.isSetup;

  const hasUnstub = realMatches(code, stringRanges, /\bvi\s*\.\s*unstubAllGlobals\s*\(/g).length > 0;
  const projectHasUnstub = !!o.projectHasUnstub;

  // 备份原值：const __orig = Object.getOwnPropertyDescriptor(globalThis, 'name')
  // ⚠️ **要记住「是哪个变量」** —— 因为**还原**的形状就是
  //    `defineProperty(globalThis, 'name', __orig)` ⇒ ⇒ 第三参数是**标识符**
  //    ⇒ ⇒ 而**替换**的形状是 `defineProperty(globalThis, 'name', { … })`
  //    ⇒ ⇒ **不区分 ⇒ ⇒ 还原调用本身会被当成又一次替换**（实测夹具抓到了这一条）。
  const backups = new Set();
  const captured = new Map();   // 变量名 → 它备份的全局名
  for (const m of realMatches(
    code, stringRanges,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\s*\.\s*)?getOwnPropertyDescriptor\s*\(\s*(?:globalThis|window|global)\s*,\s*(['"])([\w$]+)\2/g,
  )) {
    captured.set(m[1], m[3]);
    backups.add(m[3]);
  }
  // 也有直接调用不赋值的 ⇒ ⇒ 也算「备份过」（但没有可写回的标识符 ⇒ ⇒ 还原不了）
  for (const m of realMatches(
    code, stringRanges,
    /\bgetOwnPropertyDescriptor\s*\(\s*(?:globalThis|window|global)\s*,\s*(['"])([\w$]+)\1/g,
  )) {
    backups.add(m[2]);
  }

  // defineProperty 的**第三参数形状**决定它是「替换」还是「还原」
  const replacements = [];
  const restores = [];
  for (const m of realMatches(
    code, stringRanges,
    /\bdefineProperty\s*\(\s*(?:globalThis|window|global)\s*,\s*(['"])([\w$]+)\1\s*,\s*([^,\n)]{0,60})/g,
  )) {
    const name = m[2];
    const third = String(m[3] || '').trim();
    const ident = third.match(/^[A-Za-z_$][\w$]*$/);
    const line = lineOf(m.index);
    if (ident && captured.get(ident[0]) === name) {
      restores.push({ name, line, offset: m.index });   // 写回原值 ⇒ ⇒ 这是**还原**
    } else {
      replacements.push({ name, line, offset: m.index }); // 装一个描述符 ⇒ ⇒ 这是**替换**
    }
  }
  for (const m of realMatches(
    code, stringRanges,
    /\bReflect\s*\.\s*deleteProperty\s*\(\s*(?:globalThis|window|global)\s*,\s*(['"])([\w$]+)\1/g,
  )) {
    restores.push({ name: m[2], line: lineOf(m.index) });
  }

  const candidates = [];

  // 族 A：整体替换 window/globalThis/document/self
  for (const m of realMatches(
    code, stringRanges,
    /\bvi\s*\.\s*stubGlobal\s*\(\s*(['"])([A-Za-z_$][\w$]*)\1/g,
  )) {
    const name = m[2];
    if (!WHOLE_GLOBALS.includes(name)) continue;
    if (hasUnstub || projectHasUnstub) continue;
    candidates.push({
      family: 'A', var: name, line: lineOf(m.index),
      reason: '整体替换 ' + name + ' 且该文件没有 vi.unstubAllGlobals() 还原 ⇒ ⇒ 跨文件泄漏',
    });
  }

  // 族 B：原生 defineProperty 覆盖状态载体
  for (const rep of replacements) {
    const name = rep.name;
    if (!STATE_GLOBALS.includes(name)) continue;
    const line = rep.line;
    if (setup) {
      if (!isGuardedFallback(code, rep.offset, name)) {
        candidates.push({
          family: 'B', var: name, line,
          reason: 'setup 文件**无条件接管**状态载体 ' + name +
            ' ⇒ ⇒ 它会覆盖已经存在的真值',
        });
      }
      continue;
    }
    const hasBackup = backups.has(name);
    const hasRestore = restores.some((r) => r.name === name && r.line > line);
    if (!hasBackup || !hasRestore) {
      candidates.push({
        family: 'B', var: name, line,
        reason: '原生替换 ' + name + ' 且没有「备份原值 ＋ 还原」' +
          (hasBackup ? '（备份了但没还原）' : '（连备份都没有）') +
          ' ⇒ ⇒ 跨文件泄漏',
      });
    }
  }

  return { candidates, hasUnstub };
}

/** 扫**一个**测试文件 ⇒ 候选清单（读盘版）。 */
export function scanTestFile(absPath, relPath, opts) {
  let raw;
  try { raw = fs.readFileSync(absPath, 'utf8'); } catch { return { candidates: [], hasUnstub: false }; }
  return scanSource(raw, relPath, opts);
}

/**
 * 普查一棵仓 ⇒ 候选清单 ＋ 读数。
 *
 * ⚠️ **「判不了」**：某个 vitest 工程**扫不到任何测试文件** ⇒ ⇒ 那多半是
 *   include/exclude 读不懂 ⇒ ⇒ 单独列出来（不许当成「干净」）。
 */
export function censusGlobalLeaks(root) {
  const projects = discoverVitestProjects(root);
  const perProject = [];
  const candidates = [];
  const unjudged = [];
  let filesScanned = 0;
  let setupScanned = 0;

  for (const proj of projects) {
    const cfgPath = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs', 'vitest.config.cjs', 'vitest.config.mts']
      .map((n) => path.join(proj, n))
      .find((p) => fs.existsSync(p));
    const cfg = cfgPath ? readVitestConfig(cfgPath) : { excludes: [] };
    const rel = listJsTestFiles(proj, cfg.excludes || []);
    const projName = path.relative(root, proj).replace(/\\/g, '/');
    if (rel.length === 0) {
      unjudged.push({
        project: projName,
        reason: '扫不到测试文件（include/exclude 可能读不懂）',
      });
      continue;
    }

    // setup 文件**也进扫描面**（它是**每个文件都要跑**的全局接线 ⇒ ⇒ 最该盯）
    const setupRel = (cfgPath ? readSetupFiles(cfgPath) : [])
      .map((f) => f.replace(/^\.\//, ''))
      .filter((f) => fs.existsSync(path.join(proj, f)));

    // 工程级还原：setup 里若有 vi.unstubAllGlobals() ⇒ ⇒ 它兜住所有文件
    let projectHasUnstub = false;
    for (const r of setupRel) {
      const s = scanTestFile(path.join(proj, r), r, { isSetup: true });
      if (s.hasUnstub) projectHasUnstub = true;
    }

    const projCands = [];
    const allRel = [...new Set([...setupRel, ...rel])];
    for (const r of allRel) {
      const abs = path.join(proj, r);
      const isSetup = setupRel.includes(r);
      const s = scanTestFile(abs, r, { isSetup, projectHasUnstub });
      filesScanned += 1;
      if (isSetup) setupScanned += 1;
      for (const c of s.candidates) {
        projCands.push({
          ...c,
          file: path.relative(root, abs).replace(/\\/g, '/'),
          isSetup,
        });
      }
    }
    perProject.push({
      project: projName,
      files: allRel.length,
      setupFiles: setupRel,
      candidates: projCands,
    });
    candidates.push(...projCands);
  }

  return {
    projects,
    perProject,
    candidates,
    unjudged,
    summary: {
      projectsFound: projects.length,
      filesScanned,
      setupScanned,
      candidates: candidates.length,
      familyA: candidates.filter((c) => c.family === 'A').length,
      familyB: candidates.filter((c) => c.family === 'B').length,
      unjudged: unjudged.length,
    },
  };
}
