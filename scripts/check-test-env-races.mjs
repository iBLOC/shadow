#!/usr/bin/env node
/**
 * **测试里的进程级 env 竞争** —— 闸（不是探针）。
 * ============================================================================
 *
 * ## 它守什么
 *
 * `cargo test` 把**同一个二进制**里的测试**开多线程并发跑** ⇒ ⇒ 进程级
 * `env` 变量就是**共享全局** ⇒ ⇒ 「置 env → 构造 → 还原」与「remove env →
 * 构造」两个测试的窗口一撞，**A 的构造就读到 B 留下的值** ⇒ ⇒ 断言随机翻转。
 *
 * 2026-11-08 真机实测（iBLOC/shadow 桌面 crate）：`feishu_mcp::tests::
 * create_sheet_returns_disabled_when_off` 在 CI 上读到 `Ok` 而不是 `Disabled`
 * ⇒ ⇒ 本地 A/B 复现 **40 轮红 19 次（47%）** ⇒ ⇒ 根因就是这条。
 *
 * ## 判据（**收紧过一轮**：先量「只改没人读」不算污染）
 *
 * 候选 = **同一个 env 变量被 ≥2 个不同测试函数改** ⇒ ⇒ 它们的窗口可以撞。
 * 但「改了却没有任何人读」**不构成污染**（那个 var 只是各写各的私有桶）
 * ⇒ ⇒ 真正要判的是**有人读**：
 *   · **测试读点面**：这个 var 至少被一个**测试函数**读 ⇒ ⇒ A 的改动可能被
 *     B 读到（测试自己被污染）。
 *   · **闸值污染面**：这个 var 至少被**生产代码**读（典型：构造器读 env 定闸）
 *     ⇒ ⇒ 污染会真的落到**闸**上 ⇒ ⇒ 更严重的那一批。
 * ⚠️ **只被一个测试函数改的 var 不算** ⇒ ⇒ 同一二进制内没有第二个主人去互撞
 *    （今天 feishu 那条正是被改成「单主设计」的 ⇒ 不该再被报出来）。
 *
 * ## 覆盖面（**本仓 vs 兄弟仓，两种口径**）
 *
 * · **默认（本仓）**：只扫**本仓**的 crate ⇒ ⇒ 候选即红 ⇒ ⇒ 归本仓销账。
 * · `--root=<目录>`：扫那棵树（跨仓普查）⇒ ⇒ 默认**仍然判红**（它同样是真
 *   竞争）⇒ ⇒ 只想**打印**候选清单、不判 ⇒ ⇒ 加 `--report-only`。
 * ⚠️ **兄弟仓的债在兄弟仓销账**（2026-11-08 纪律：并行会话在那些仓里有在飞
 *   改动 ⇒ ⇒ 本仓闸不替它们改代码）⇒ ⇒ 跨仓那一面只作**读数**。
 *
 * ## 读数要可见（**别只报「有候选」**）
 *
 * 每次运行都打印：**扫了多少个 crate / 多少个 .rs 文件 / 多少个候选** ⇒ ⇒
 * 「候选 0 个」与「一个文件都没扫」必须能分开看（否则又是一把恒零的尺子）。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-test-env-races.mjs                      # 判本仓（闸）
 * node scripts/check-test-env-races.mjs --report-only        # 只打印候选
 * node scripts/check-test-env-races.mjs --root=C:/Projects/iBLOC        # 跨仓
 * node scripts/check-test-env-races.mjs --root=C:/Projects/iBLOC --report-only
 * node scripts/check-test-env-races.mjs --json
 * node scripts/check-test-env-races.mjs --self-test           # 判据自检（正控＋孪生）
 * ```
 *
 * 退出码：**0** 绿（没有候选）／**1** 有候选／**2** 判不了（读不到源码）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { censusJs, readVitestConfig } from './lib/env-race-js.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : dflt;
};
const has = (name) => args.includes('--' + name);

const SKIP_DIRS = new Set([
  'target', '.git', 'node_modules', '.local', 'build', '.dart_tool', 'Pods', '.gradle',
  // ⚠️ vendored 第三方（tauri-plugin-wdio-webdriver）⇒ ⇒ 不是本仓的债 ⇒ 不扫。
  'vendor',
]);

/** workspace 根下的 crate 目录（以 Cargo.toml 为准）。 */
function findCrates(root) {
  const crates = [];
  const seen = new Set();
  const scan = (dir, depth) => {
    if (depth > 2) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const d = path.join(dir, e.name);
      if (fs.existsSync(path.join(d, 'Cargo.toml'))) {
        let real = d;
        try { real = fs.realpathSync(d); } catch { /* ignore */ }
        if (!seen.has(real)) { seen.add(real); crates.push({ name: e.name, dir: d }); }
      }
      scan(d, depth + 1);
    }
  };
  // ⚠️ root 本身**也**可能就是一个 crate（自检就是这种形状）⇒ ⇒ 别只扫子目录。
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    crates.push({ name: path.basename(root), dir: root });
    seen.add(root);
  }
  scan(root, 0);
  return crates;
}

function listRs(dir) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(d, e.name), depth + 1);
      } else if (e.isFile() && e.name.endsWith('.rs')) {
        out.push(path.join(d, e.name));
      }
    }
  };
  walk(dir, 0);
  return out;
}

/**
 * 扫一个 .rs 文件：找出 env 变异/读取点，并标注
 *   · 在不在 #[cfg(test)] 里（inTest）
 *   · 属于哪个测试函数（testFn）
 * ⚠️ 行级启发式（不建完整 AST）⇒ ⇒ 字符串/注释里的花括号会扰动深度
 *    ⇒ ⇒ 读数是**候选清单**，不是判决。
 */
function scanFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const lines = text.split(/\r?\n/);
  const mut = [];
  const read = [];
  const stack = [];
  let depth = 0;
  let pendingTest = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const insideTest = stack.some((s) => s.isTest);

    if (/^\s*#\[cfg\(test\)\]\s*$/.test(raw)) pendingTest = true;

    const modM = raw.match(/^\s*(?:pub\s+)?(?:async\s+)?mod\s+([A-Za-z0-9_]+)\s*\{/);
    const fnM = raw.match(/^\s*(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z0-9_]+)\s*[<(]/);
    if (modM) {
      stack.push({ kind: 'mod', name: modM[1], isTest: pendingTest, insideTest, depth });
      pendingTest = false;
    } else if (fnM) {
      stack.push({ kind: 'fn', name: fnM[1], isTest: false, insideTest, depth });
    }

    const inTestNow = stack.some((s) => s.isTest);
    const testFn = [...stack].reverse().find((s) => s.kind === 'fn' && s.insideTest)?.name || null;

    const mutM = raw.match(/env::(set_var|remove_var)\s*\(\s*"([A-Za-z0-9_]+)"/);
    if (mutM) mut.push({ line: i + 1, var: mutM[2], kind: mutM[1], inTest: inTestNow, testFn, text: raw.trim() });
    const readM = raw.match(/env::(var|var_os)\s*\(\s*"([A-Za-z0-9_]+)"/);
    if (readM) read.push({ line: i + 1, var: readM[2], inTest: inTestNow, testFn, text: raw.trim() });

    for (const ch of raw) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      }
    }
  }
  return { mut, read };
}

function bucketByVar(points) {
  const m = new Map();
  for (const p of points) {
    if (!m.has(p.var)) m.set(p.var, []);
    m.get(p.var).push(p);
  }
  return m;
}

/** 普查一个工作区 ⇒ 候选清单 ＋ 读数。 */
export function census(root, opts = {}) {
  const only = opts.only || [];
  const exclude = opts.exclude || [];
  const crates = findCrates(root).filter((c) => {
    if (only.length && !only.includes(c.name)) return false;
    const rel = path.relative(root, c.dir).replace(/\\/g, '/');
    return !exclude.some((x) => rel.includes(x));
  });

  const report = [];
  let filesScanned = 0;
  let candidates = 0;

  for (const crate of crates) {
    const srcDir = path.join(crate.dir, 'src');
    const testDir = path.join(crate.dir, 'tests');
    const benchDir = path.join(crate.dir, 'benches');
    const srcFiles = fs.existsSync(srcDir) ? listRs(srcDir) : [];
    const testFiles = fs.existsSync(testDir) ? listRs(testDir) : [];
    const benchFiles = fs.existsSync(benchDir) ? listRs(benchDir) : [];

    const srcMut = [], srcRead = [];
    for (const f of srcFiles) {
      const r = scanFile(f);
      if (!r) continue;
      filesScanned++;
      for (const p of r.mut) srcMut.push({ ...p, file: path.relative(crate.dir, f).replace(/\\/g, '/') });
      for (const p of r.read) srcRead.push({ ...p, file: path.relative(crate.dir, f).replace(/\\/g, '/') });
    }
    const integMut = [];
    for (const f of testFiles) {
      const r = scanFile(f);
      if (!r) continue;
      filesScanned++;
      for (const p of r.mut) integMut.push({ ...p, file: path.relative(crate.dir, f).replace(/\\/g, '/') });
    }
    filesScanned += benchFiles.length;

    const inTestMut = srcMut.filter((p) => p.inTest);
    const byVar = bucketByVar(inTestMut);

    // ⚠️ **收紧点**：只被**一个**测试函数改的 var ⇒ ⇒ 没有第二个主人去互撞
    //    ⇒ ⇒ 不算候选（今天 feishu 那条正是被改成「单主设计」的 ⇒ 不该再报）。
    const shared = [];
    for (const [v, pts] of byVar) {
      const fns = new Set(pts.map((p) => p.testFn || '(不在测试函数里)'));
      if (fns.size >= 2) shared.push({ var: v, fns: [...fns], pts });
    }

    // 读点分两面：**测试读点**（测试自己被污染）与**生产读点**（闸被污染）。
    const testReadSites = new Map();
    for (const p of srcRead.filter((x) => x.inTest)) {
      if (!testReadSites.has(p.var)) testReadSites.set(p.var, []);
      testReadSites.get(p.var).push(p.file + ':' + p.line);
    }
    const prodReadSites = new Map();
    for (const p of srcRead.filter((x) => !x.inTest)) {
      if (!prodReadSites.has(p.var)) prodReadSites.set(p.var, []);
      prodReadSites.get(p.var).push(p.file + ':' + p.line);
    }

    // ⚠️ **「改了却没人读」不算污染** ⇒ ⇒ 候选必须**有人读**。
    const sameBinary = [];
    const gatePolluted = [];
    for (const c of shared) {
      const tReads = testReadSites.get(c.var) || [];
      const pReads = prodReadSites.get(c.var) || [];
      if (tReads.length || pReads.length) {
        sameBinary.push({ var: c.var, fns: c.fns, pts: c.pts, testRead: tReads, prodRead: pReads });
      }
      if (pReads.length) {
        gatePolluted.push({ var: c.var, fns: c.fns, pts: c.pts, prodRead: pReads });
      }
    }

    const integByFileVar = new Map();
    for (const p of integMut) {
      const k = p.file + '|' + p.var;
      if (!integByFileVar.has(k)) integByFileVar.set(k, []);
      integByFileVar.get(k).push(p);
    }
    const integ = [];
    for (const [k, pts] of integByFileVar) {
      const fns = new Set(pts.map((p) => p.testFn || '(不在测试函数里)'));
      if (fns.size >= 2) integ.push({ file: pts[0].file, var: pts[0].var, fns: [...fns], pts });
    }

    const nCand = sameBinary.length + gatePolluted.length + integ.length;
    candidates += nCand;
    report.push({
      crate: crate.name,
      dir: path.relative(root, crate.dir).replace(/\\/g, '/') || '.',
      files: { src: srcFiles.length, tests: testFiles.length, benches: benchFiles.length },
      sameBinary, gatePolluted, integ,
    });
  }

  const summary = {
    root,
    cratesScanned: crates.length,
    filesScanned,
    candidates,
    sameBinaryCandidates: report.reduce((a, r) => a + r.sameBinary.length, 0),
    gatePollutedCandidates: report.reduce((a, r) => a + r.gatePolluted.length, 0),
    integCandidates: report.reduce((a, r) => a + r.integ.length, 0),
  };
  return { summary, report };
}

/**
 * 闸的退出码（**两档：有候选 ⇒ 1；只打印读数 ⇒ 0**）。
 * ⚠️ 单独抽出来 ⇒ ⇒ 因为「report-only 也退 1」是本闸**第一版就有的真 bug**
 *    （接到 CI 上就会因为兄弟仓的存量候选而红）⇒ ⇒ 它必须被自检钉住。
 */
export function gateExit(summary, reportOnly, jsCandidates, jsUncertain) {
  if (reportOnly) return 0;
  const js = jsCandidates || 0;
  // ⚠️⚠️ **「判不了」也算红** —— 并发块的花括号配平不出来 ⇒ ⇒ 说明**扫描面
  //    本身有盲区** ⇒ ⇒ 「扫了 0 个候选」在这个文件上**不成立** ⇒ ⇒ 宁可红
  //    不可疑（否则就是一把恒零的尺子）。
  const und = jsUncertain || 0;
  return (summary.candidates + js + und) > 0 ? 1 : 0;
}

/* ── 判据自检：正控（两个测试函数改同一个 var ⇒ 必须红）＋ 孪生（只有一个 ⇒ 必须绿） ── */
function selfTest() {
  const base = path.join(REPO, '.local', 'check-env-race-selftest');
  const mk = (dir, nOwners) => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n');
    const owners = [];
    for (let i = 0; i < nOwners; i++) {
      owners.push(
        '    #[test]\n' +
        '    fn owner_' + i + '() {\n' +
        '        unsafe { std::env::set_var("FIXTURE_GATE", "1"); }\n' +
        '        unsafe { std::env::remove_var("FIXTURE_GATE"); }\n' +
        '    }'
      );
    }
    fs.writeFileSync(
      path.join(dir, 'src', 'lib.rs'),
      'pub fn gate() -> bool {\n' +
      '    std::env::var("FIXTURE_GATE").is_ok()\n' +
      '}\n' +
      '\n#[cfg(test)]\nmod tests {\n' +
      '    use super::*;\n' +
      owners.join('\n\n') + '\n' +
      '}\n'
    );
  };

  const checks = [];
  const pos = path.join(base, 'positive');
  mk(pos, 2);
  const r1 = census(base, { exclude: [] });
  const posOnly = r1.report.filter((r) => r.dir.includes('positive'));
  const named = posOnly.some((r) => r.sameBinary.some((c) => c.var === 'FIXTURE_GATE'));
  const polluted = posOnly.some((r) => r.gatePolluted.some((c) => c.var === 'FIXTURE_GATE'));
  checks.push({ name: '正控：两个测试函数改同一个 var ⇒ 必须被报成候选', ok: named && polluted,
    detail: 'sameBinary=' + named + ' gatePolluted=' + polluted });

  const twin = path.join(base, 'twin');
  mk(twin, 1);
  const r2 = census(base, { exclude: [] });
  const twinOnly = r2.report.filter((r) => r.dir.includes('twin'));
  const clean = twinOnly.length > 0 && twinOnly.every((r) => r.sameBinary.length === 0 && r.gatePolluted.length === 0 && r.integ.length === 0);
  checks.push({ name: '孪生：只有一个测试函数改 ⇒ 必须不被报（没有第二个主人）', ok: clean,
    detail: 'twin candidates=' + twinOnly.reduce((a, r) => a + r.sameBinary.length + r.gatePolluted.length + r.integ.length, 0) + '（base 合计 ' + r2.summary.candidates + '，含正控那个 crate）' });

  // ⚠️ **第三个用例：「改了却没人读」不算污染** ⇒ ⇒ 这是本闸**收紧**的那一刀。
  const silent = path.join(base, 'silent');
  fs.rmSync(silent, { recursive: true, force: true });
  fs.mkdirSync(path.join(silent, 'src'), { recursive: true });
  fs.writeFileSync(path.join(silent, 'Cargo.toml'), '[package]\nname = "silent"\nversion = "0.1.0"\nedition = "2021"\n');
  fs.writeFileSync(
    path.join(silent, 'src', 'lib.rs'),
    'pub fn unrelated() -> u8 { 7 }\n' +
    '\n#[cfg(test)]\nmod tests {\n' +
    '    #[test]\n    fn a() { unsafe { std::env::set_var("SILENT_VAR", "1"); } }\n' +
    '    #[test]\n    fn b() { unsafe { std::env::remove_var("SILENT_VAR"); } }\n' +
    '}\n'
  );
  const r3 = census(base, { exclude: [] });
  const silentOnly = r3.report.filter((r) => r.dir.includes('silent'));
  const silentClean = silentOnly.every((r) => r.sameBinary.length === 0 && r.gatePolluted.length === 0);
  checks.push({ name: '收紧：两个测试函数改同一个 var、但**没人读** ⇒ 必须不被报', ok: silentClean,
    detail: 'silent candidates=' + silentOnly.reduce((a, r) => a + r.sameBinary.length + r.gatePolluted.length, 0) });

  // ⚠️ **第四个用例：--report-only 必须退 0** —— 它是「只打印读数」那一档 ⇒ ⇒
  //    若它跟着「有候选」一起退 1 ⇒ ⇒ 接到 CI 上就会因为**兄弟仓的存量候选**
  //    而红 ⇒ ⇒ 而那些候选属别的工作线 ⇒ ⇒ 本仓 CI 不该替它们背锅 ⇒ ⇒
  //    **「有候选」与「该不该红」必须分开**（闸 vs 读数两档）。
  const exitOk = gateExit({ candidates: 7 }, true) === 0 && gateExit({ candidates: 7 }, false) === 1
    && gateExit({ candidates: 0 }, false) === 0;
  checks.push({ name: '退出码两档：有候选 ⇒ 1；--report-only ⇒ 0（不替兄弟仓背锅）', ok: exitOk,
    detail: 'reportOnly+7候选 ⇒ ' + gateExit({ candidates: 7 }, true)
      + ' ／ 闸+7候选 ⇒ ' + gateExit({ candidates: 7 }, false)
      + ' ／ 闸+0候选 ⇒ ' + gateExit({ candidates: 0 }, false) });

  // ⚠️ **第五个用例：CI 布局可达** —— CI 上 shadow 检在 `<ws>/shadow` ⇒ ⇒
  //   桌面 crate 在**第 3 层**（shadow/shadow-desktop/src-tauri）⇒ ⇒ 若 crate 发现
  //   只向下扫 2 层 ⇒ ⇒ **本仓自己的 crate 在 CI 上扫不到** ⇒ ⇒ 闸会「绿但什么
  //   都没查」⇒ ⇒ **空绿**。⇒ ⇒ 这里用**真临时目录**造出 CI 的那种嵌套 ⇒ ⇒
  //   断言两种 root（工作区根 / 本仓目录）**都找得到它**。
  const ciLayout = path.join(base, 'ci-layout');
  const tauriDir = path.join(ciLayout, 'shadow', 'shadow-desktop', 'src-tauri');
  fs.mkdirSync(path.join(tauriDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tauriDir, 'Cargo.toml'), '[package]\nname = "shadow-desktop"\nversion = "0.1.0"\nedition = "2021"\n');
  fs.writeFileSync(path.join(tauriDir, 'src', 'lib.rs'), 'pub fn probe() -> u8 { 1 }\n');
  const r4 = census(ciLayout, { exclude: [] });
  const found = r4.report.some((x) => x.dir.replace(/\\/g, '/').includes('shadow/shadow-desktop/src-tauri'));
  checks.push({ name: 'CI 布局可达：shadow 在 <ws>/shadow ⇒ ⇒ 第 3 层的桌面 crate 必须被扫到', ok: found,
    detail: 'crates=' + r4.summary.cratesScanned + ' 目录=' + r4.report.map((x) => x.dir).join(', ') });

  // ⚠️ **第六个用例：JS 面的正控** —— 并发块（it.concurrent）里改 env 且有读点
  //   ⇒ ⇒ 必须被报（实测机制：同文件内并发块**共享** env ⇒ ⇒ 真竞争）。
  const jsBase = path.join(base, 'js');
  fs.mkdirSync(path.join(jsBase, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsBase, 'src', 'prod.ts'), 'export const url = process.env.JS_GATE;\n');
  fs.writeFileSync(path.join(jsBase, 'js-positive.test.ts'),
    "import { it } from 'vitest';\n" +
    "it.concurrent('writes', () => { process.env.JS_GATE = 'x'; });\n");
  const jsPos = censusJs(jsBase, { excludes: [] });
  const jsPosFound = jsPos.summary.candidates > 0
    && jsPos.report.some((x) => x.sameBinary.some((c) => c.var === 'JS_GATE'));
  checks.push({ name: 'JS 正控：并发块（it.concurrent）里改 env 且有读点 ⇒ 必须被报', ok: jsPosFound,
    detail: 'candidates=' + jsPos.summary.candidates + ' concurrentMuts=' + jsPos.summary.concurrentMuts });

  // ⚠️⚠️ **第七个用例：JS 面的孪生（**这一条钉住「不能照搬 Rust 判据」）**
  //   顺序 `it` 里改 env（**多个 owner**！）⇒ ⇒ **必须不被报** ——
  //   实测：vitest 同一文件内的顺序 `it` 是**顺序执行**的 ⇒ ⇒ 不存在窗口重叠
  //   ⇒ ⇒ 若这里被报 ⇒ ⇒ 说明判据照搬了 Rust 那套「多个 owner」⇒ ⇒ 误报。
  const jsTwin = path.join(base, 'js-twin');
  fs.mkdirSync(path.join(jsTwin, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsTwin, 'src', 'prod.ts'), 'export const url = process.env.JS_GATE;\n');
  fs.writeFileSync(path.join(jsTwin, 'js-twin.test.ts'),
    "import { it } from 'vitest';\n" +
    "it('a', () => { process.env.JS_GATE = 'x'; });\n" +
    "it('b', () => { process.env.JS_GATE = 'y'; });\n");
  const jsTwinRes = censusJs(jsTwin, { excludes: [] });
  const jsTwinFam1 = jsTwinRes.report.reduce((a, r) => a + r.sameBinary.length + r.gatePolluted.length, 0);
  const jsTwinFam2 = jsTwinRes.report.reduce((a, r) => a + (r.crossFile || []).length, 0);
  checks.push({ name: 'JS 孪生：顺序 it 里改同一个 env（多个 owner）⇒ **族 1（同文件并行面）必须为空**（顺序执行 ⇒ 不竞争）', ok: jsTwinFam1 === 0,
    detail: '族1(并发面)=' + jsTwinFam1 + '；族2(跨文件污染)=' + jsTwinFam2 + '（族2 命中的是**另一族**：同 worker 时 vitest 不在文件之间还原 env ⇒ ⇒ 裸写不还原 ⇒ ⇒ 污染别的文件；默认多 worker 时每个文件一个独立 worker ⇒ ⇒ 隔离 ⇒ ⇒ 只进条件档）' });

  // ⚠️⚠️ **第八个用例：JS 族的「跨文件污染」正控** —— 实测（探针 S）：
  //   vitest **不在文件之间还原** process.env ⇒ ⇒ 一个文件裸写 env 且不还原
  //   ⇒ ⇒ 它污染同 worker 后续跑的任何文件 ⇒ ⇒ **文件执行顺序会漂**
  //   （vitest 的 BaseSequencer：无缓存按大小降序；有结果缓存按「上次失败的
  //   先跑 → 上次耗时长的先跑」）⇒ ⇒ 泄漏是**间歇性**的（飘红）。
  const jsCross = path.join(base, 'js-crossfile');
  fs.mkdirSync(path.join(jsCross, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsCross, 'src', 'prod.ts'), 'export const u = process.env.JS_LEAK;\n');
  fs.writeFileSync(path.join(jsCross, 'a-writer.test.ts'),
    "import { it } from 'vitest';\n" +
    "it('writes and never restores', () => { process.env.JS_LEAK = 'x'; });\n");
  fs.writeFileSync(path.join(jsCross, 'b-reader.test.ts'),
    "import { it, expect } from 'vitest';\n" +
    "it('reads', () => { expect(process.env.JS_LEAK).toBeDefined(); });\n");
  // ⚠️⚠️ **夹具必须显式配「同 worker」** —— 实测：跨文件污染的**成立前提**
  //   是「多个文件落在同一个 worker」（fileParallelism:false／singleThread／
  //   maxWorkers:1／isolate:false）⇒ ⇒ 默认多 worker 时每个文件一个独立 worker
  //   ⇒ ⇒ env 隔离 ⇒ ⇒ 跨文件污染**不成立**（实测 E5/E6）⇒ ⇒ 判据要分两档。
  // ⚠️⚠️ **夹具必须显式配「同 worker ＋ 环境不隔离」两个条件** —— 实测矩阵：
  //   跨文件 env 共享 ⇔ (isolate:false) **且** (同 worker) ⇒ ⇒ 只配一个**不成立**
  //   ⇒ ⇒ v3 那个「任一成立就判红」的写法过宽 ⇒ ⇒ 这里两个都给 ⇒ ⇒ 才该判红。
  fs.writeFileSync(path.join(jsCross, 'vitest.config.ts'),
    "import { defineConfig } from 'vitest/config';\n" +
    "export default defineConfig({ test: { fileParallelism: false, isolate: false } });\n");
  const jsCrossCfg = readVitestConfig(path.join(jsCross, 'vitest.config.ts'));
  const jsCrossRes = censusJs(jsCross, { excludes: jsCrossCfg.excludes, sameWorkerLikely: jsCrossCfg.sameWorkerLikely, crossFileCertain: jsCrossCfg.crossFileCertain });
  const jsCrossFound = jsCrossCfg.crossFileCertain === true
    && jsCrossRes.report.some((x) => (x.crossFile || []).some((c) => c.var === 'JS_LEAK'));
  checks.push({ name: 'JS 正控：裸写 env 且**不还原** + 别的文件读它 + **同 worker ＋ isolate:false** ⇒ 必须被报（跨文件污染·判红档）', ok: jsCrossFound,
    detail: 'sameWorkerLikely=' + jsCrossCfg.sameWorkerLikely + '；isolateShared=' + jsCrossCfg.isolateShared + '；crossFileCertain=' + jsCrossCfg.crossFileCertain + '；candidates=' + jsCrossRes.summary.candidates + '；跨文件·判红档=' + jsCrossRes.summary.crossFileCandidates });

  // ⚠️ **第九个用例：跨文件污染的孪生** —— 写了但**本文件内还原了**
  //   （afterEach 里 delete）⇒ ⇒ 不污染别的文件 ⇒ ⇒ 必须不被报。
  const jsCrossTwin = path.join(base, 'js-crossfile-twin');
  fs.mkdirSync(path.join(jsCrossTwin, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsCrossTwin, 'src', 'prod.ts'), 'export const u = process.env.JS_LEAK2;\n');
  fs.writeFileSync(path.join(jsCrossTwin, 'a-writer.test.ts'),
    "import { it, afterEach } from 'vitest';\n" +
    "afterEach(() => { delete process.env.JS_LEAK2; });\n" +
    "it('writes and restores', () => { process.env.JS_LEAK2 = 'x'; });\n");
  fs.writeFileSync(path.join(jsCrossTwin, 'b-reader.test.ts'),
    "import { it, expect } from 'vitest';\n" +
    "it('reads', () => { expect(process.env.JS_LEAK2).toBeUndefined(); });\n");
  const jsCrossTwinRes = censusJs(jsCrossTwin, { excludes: [] });
  checks.push({ name: 'JS 孪生：裸写 env 但**本文件内还原了** ⇒ 必须不被报（还原 ⇒ 不跨文件污染）', ok: jsCrossTwinRes.summary.candidates === 0,
    detail: 'candidates=' + jsCrossTwinRes.summary.candidates });

  // ⚠️⚠️ **第十个用例：并发块的「块边界」不能被字符串里的花括号截断** ——
  //   实测（探针 F）：字符串里的一个 } 会让「逐字符数花括号」的旧算法把并发块
  //   **提前截断** ⇒ ⇒ 块内后面的 env 写被判成「不在并发块」⇒ ⇒ **漏判**。
  const jsBrace = path.join(base, 'js-brace');
  fs.mkdirSync(path.join(jsBrace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsBrace, 'src', 'prod.ts'), 'export const u = process.env.JS_BRACE;\n');
  fs.writeFileSync(path.join(jsBrace, 'brace.test.ts'),
    "import { it } from 'vitest';\n" +
    "it.concurrent('writes', async () => {\n" +
    "  const brace = '}';\n" +
    "  process.env.JS_BRACE = 'x';\n" +
    "});\n");
  const jsBraceRes = censusJs(jsBrace, { excludes: [] });
  const jsBraceFound = jsBraceRes.report.some((x) => x.sameBinary.some((c) => c.var === 'JS_BRACE'));
  checks.push({ name: 'JS 正控：并发块里有字符串花括号 ⇒ ⇒ 块边界不得被截断 ⇒ ⇒ env 写必须仍被判在并发面', ok: jsBraceFound,
    detail: 'candidates=' + jsBraceRes.summary.candidates + '（生产读点齐全）' });

  // ⚠️⚠️ **第十一个用例：配置层并发** —— 实测（探针 G）：配置里开了
  //   sequence.concurrent: true ⇒ ⇒ 连普通的顺序 it 都并发 ⇒ ⇒ 族 1 的
  //   「块内」限定不够 ⇒ ⇒ 判据必须**读配置**，不能只看代码里的 .concurrent。
  const jsSeq = path.join(base, 'js-seq');
  fs.mkdirSync(path.join(jsSeq, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsSeq, 'vitest.config.ts'),
    "import { defineConfig } from 'vitest/config';\n" +
    "export default defineConfig({ test: { sequence: { concurrent: true } } });\n");
  fs.writeFileSync(path.join(jsSeq, 'src', 'prod.ts'), 'export const u = process.env.JS_SEQ;\n');
  fs.writeFileSync(path.join(jsSeq, 'seq.test.ts'),
    "import { it } from 'vitest';\n" +
    "it('writes', () => { process.env.JS_SEQ = 'x'; });\n");
  const jsSeqCfg = readVitestConfig(path.join(jsSeq, 'vitest.config.ts'));
  const jsSeqRes = censusJs(jsSeq, { excludes: jsSeqCfg.excludes, sequenceConcurrent: jsSeqCfg.sequenceConcurrent });
  const jsSeqFound = jsSeqCfg.sequenceConcurrent === true
    && jsSeqRes.report.some((x) => x.sameBinary.some((c) => c.var === 'JS_SEQ'));
  checks.push({ name: 'JS 正控：配置里 sequence.concurrent=true ⇒ ⇒ 顺序 it 的 env 写也必须算并发面', ok: jsSeqFound,
    detail: '读到的 sequence.concurrent=' + jsSeqCfg.sequenceConcurrent + '；candidates=' + jsSeqRes.summary.candidates });

  // ⚠️⚠️ **第十二个用例：判不了必须显式** —— 并发块的花括号配平不出来 ⇒ ⇒
  //   「这个文件有没有并发」判不了 ⇒ ⇒ **不能当成「干净」** ⇒ ⇒ 必须进
  //   uncertain 档（闸据此判红）⇒ ⇒ 否则这把尺子在这里是恒零的。
  const jsUnc = path.join(base, 'js-uncertain');
  fs.mkdirSync(path.join(jsUnc, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsUnc, 'src', 'prod.ts'), 'export const u = 1;\n');
  // ⚠️⚠️ **这个夹具里不许写 env** —— 它只测「块边界配平不出来 ⇒ ⇒ 进判不了档」；
  //   而「写了一个全仓没人读的 env」会被**死环境变量闸**判红（实测：JS_UNC ⇒ ⇒
  //   Desktop Build 的那盏红**是本刀自己造成的** ⇒ ⇒ 教训：**新增的测试夹具也会
  //   踩别的闸** ⇒ ⇒ 写夹具时要问「我写的那个名字，全仓有人读吗」）。
  fs.writeFileSync(path.join(jsUnc, 'unclosed.test.ts'),
    "import { it } from 'vitest';\n" +
    "it.concurrent('unclosed', () => {\n" +
    "  const x = 1;\n" +
    "  void x;\n");
  const jsUncRes = censusJs(jsUnc, { excludes: [] });
  checks.push({ name: 'JS 正控：并发块花括号配平不出来 ⇒ ⇒ 必须进「判不了」档（不许当成干净）', ok: jsUncRes.summary.uncertainBlocks > 0,
    detail: 'uncertainBlocks=' + jsUncRes.summary.uncertainBlocks + '（读数里单列 ⇒ ⇒ 闸据此判红）' });

  // ⚠️⚠️ **第十三个用例：exclude 里带通配符的前缀必须生效** —— vitest 的
  //   exclude 写的是 'tests/wdio/**' / 'tests/tauri-e2e/**' 这种形状 ⇒ ⇒
  //   旧写法把带 '*' 的**整条静默丢弃** ⇒ ⇒ 那些**独立进程**的 runner 目录
  //   仍在扫描面内 ⇒ ⇒ 套上 vitest 的判据 ⇒ ⇒ 误报。
  const jsExcl = path.join(base, 'js-exclude');
  fs.mkdirSync(path.join(jsExcl, 'src'), { recursive: true });
  fs.mkdirSync(path.join(jsExcl, 'tests', 'wdio'), { recursive: true });
  fs.writeFileSync(path.join(jsExcl, 'src', 'prod.ts'), 'export const u = process.env.JS_EXCL;\n');
  fs.writeFileSync(path.join(jsExcl, 'vitest.config.ts'),
    "import { defineConfig } from 'vitest/config';\n" +
    "export default defineConfig({ test: { include: ['**/*.test.ts'], exclude: ['tests/wdio/**'] } });\n");
  fs.writeFileSync(path.join(jsExcl, 'tests', 'wdio', 'e2e.test.ts'),
    "import { it } from 'vitest';\n" +
    "it('writes', () => { process.env.JS_EXCL = 'x'; });\n");
  const jsExclCfg = readVitestConfig(path.join(jsExcl, 'vitest.config.ts'));
  const jsExclRes = censusJs(jsExcl, { excludes: jsExclCfg.excludes });
  const jsExclScanned = jsExclRes.summary.jsFilesScanned;
  checks.push({ name: 'JS 正控：exclude 里的通配符前缀必须生效（tests/wdio/** ⇒ ⇒ 独立进程 runner 的目录不得进扫描面）', ok: jsExclScanned === 0 && jsExclCfg.excludes.some((x) => x.indexOf('tests/wdio') === 0),
    detail: 'exclude=' + JSON.stringify(jsExclCfg.excludes) + '；扫到的测试文件数=' + jsExclScanned + '（必须为 0）' });

  // ⚠️⚠️ **第十四个用例：默认多 worker ⇒ ⇒ 跨文件污染只是「条件档」** ——
  //   实测（E5/E6）：默认每个测试文件一个独立 worker ⇒ ⇒ env **隔离** ⇒ ⇒
  //   跨文件污染**不成立** ⇒ ⇒ 若这时判红 ⇒ ⇒ 就是**误报**（造出假缺陷 ⇒ ⇒
  //   然后大家就不信这把尺子）⇒ ⇒ 必须只作读数、并在读数里说清「CI 把并发
  //   压到 1 个 worker 时它会转红」。
  const jsMulti = path.join(base, 'js-multiworker');
  fs.mkdirSync(path.join(jsMulti, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsMulti, 'src', 'prod.ts'), 'export const u = process.env.JS_MULTI;\n');
  fs.writeFileSync(path.join(jsMulti, 'a-writer.test.ts'),
    "import { it } from 'vitest';\n" +
    "it('writes and never restores', () => { process.env.JS_MULTI = 'x'; });\n");
  fs.writeFileSync(path.join(jsMulti, 'b-reader.test.ts'),
    "import { it, expect } from 'vitest';\n" +
    "it('reads', () => { expect(process.env.JS_MULTI).toBeDefined(); });\n");
  const jsMultiRes = censusJs(jsMulti, { excludes: [] });
  const jsMultiConditional = jsMultiRes.report.some((x) => (x.crossFileConditional || []).some((c) => c.var === 'JS_MULTI'));
  checks.push({ name: 'JS 孪生：默认**多 worker**（每文件一个独立 worker ⇒ ⇒ env 隔离）⇒ ⇒ 跨文件污染必须只进**条件档**、不得判红', ok: jsMultiConditional && jsMultiRes.summary.candidates === 0,
    detail: 'candidates=' + jsMultiRes.summary.candidates + '（必须 0）；条件档=' + jsMultiRes.summary.crossFileConditionalCandidates + '（必须 ≥1，可见但不判红）' });

  // ⚠️⚠️ **第十五个用例：同 worker 但 isolate 默认（true）⇒ ⇒ 不得判红** ——
  //   实测（矩阵）：`fileParallelism:false`／`singleThread`／`maxWorkers:1` 只是让
  //   多个文件**落进同一个 worker**；但 vitest 默认 **isolate: true** ⇒ ⇒ 每个文件
  //   **重建环境** ⇒ ⇒ `process.env` 仍然隔离 ⇒ ⇒ 跨文件污染**不成立**。
  //   ⇒ ⇒ v3 把这两个条件当「任一成立就判红」是**过宽** ⇒ ⇒ 会在这种配置下**误报**。
  const jsIsolate = path.join(base, 'js-isolate-true');
  fs.mkdirSync(path.join(jsIsolate, 'src'), { recursive: true });
  fs.writeFileSync(path.join(jsIsolate, 'src', 'prod.ts'), 'export const u = process.env.JS_ISO;\n');
  fs.writeFileSync(path.join(jsIsolate, 'vitest.config.ts'),
    "import { defineConfig } from 'vitest/config';\n" +
    "export default defineConfig({ test: { fileParallelism: false } });\n");
  fs.writeFileSync(path.join(jsIsolate, 'a-writer.test.ts'),
    "import { it } from 'vitest';\n" +
    "it('writes and never restores', () => { process.env.JS_ISO = 'x'; });\n");
  fs.writeFileSync(path.join(jsIsolate, 'b-reader.test.ts'),
    "import { it, expect } from 'vitest';\n" +
    "it('reads', () => { expect(process.env.JS_ISO).toBeDefined(); });\n");
  const jsIsoCfg = readVitestConfig(path.join(jsIsolate, 'vitest.config.ts'));
  const jsIsoRes = censusJs(jsIsolate, { excludes: jsIsoCfg.excludes, sameWorkerLikely: jsIsoCfg.sameWorkerLikely, crossFileCertain: jsIsoCfg.crossFileCertain });
  checks.push({ name: 'JS 孪生：**同 worker 但 isolate 默认（true）** ⇒ ⇒ 每文件重建环境 ⇒ ⇒ 跨文件污染**不得判红**（只进条件档）', ok: jsIsoCfg.sameWorkerLikely === true && jsIsoCfg.crossFileCertain === false && jsIsoRes.summary.candidates === 0,
    detail: 'sameWorkerLikely=' + jsIsoCfg.sameWorkerLikely + '；isolateShared=' + jsIsoCfg.isolateShared + '；crossFileCertain=' + jsIsoCfg.crossFileCertain + '；candidates=' + jsIsoRes.summary.candidates + '（必须 0）' });

  const pass = checks.filter((c) => c.ok).length;
  console.log('判据自检（测试里的进程级 env 竞争闸）');
  for (const c of checks) {
    console.log('  ' + (c.ok ? '✔' : '✘') + ' ' + c.name + '  —— ' + c.detail);
  }
  console.log('自检：' + pass + '/' + checks.length + ' 通过');
  fs.rmSync(base, { recursive: true, force: true });
  return pass === checks.length ? 0 : 1;
}

if (has('self-test')) {
  process.exit(selfTest());
}

// ⚠️⚠️ **被 import 时不许跑主流程** —— 本文件导出 `census()` 供别处复用
//    ⇒ ⇒ 若 import 就执行 ⇒ ⇒ 复用方会**顺带**跑一遍判定并**把它的退出码
//    带出来**（实测：import 这个文件来做「模拟 CI 布局」的探查 ⇒ ⇒ 主流程
//    跟着跑了一遍并 `process.exit` ⇒ ⇒ 探查脚本的输出被闸的输出顶掉了）
//    ⇒ ⇒ **判据与执行必须分开**：文件被 import ⇒ ⇒ 只导出函数；
//    直接当脚本跑 ⇒ ⇒ 才执行判定。
if (!isMainModule()) {
  // 仅导出 ⇒ 不执行。
} else {
  await main();
}

async function main() {
const ROOT = path.resolve(opt('root', REPO));
const ONLY = opt('crates', '').split(',').map((s) => s.trim()).filter(Boolean);
const EXCLUDE = opt('exclude', 'sandbox,verify,clean-scan,.verify-wt,cilayout')
  .split(',').map((s) => s.trim()).filter(Boolean);

if (!fs.existsSync(ROOT)) {
  console.error('判不了：读不到根目录 ' + ROOT + ' ⇒ ⇒ 退出码 2（不是「没问题」）');
  process.exit(2);
}

const { summary, report } = census(ROOT, { only: ONLY, exclude: EXCLUDE });
const REPORT_ONLY = has('report-only');

// ── JS/TS 面（**判据与 Rust 面不同**，见 scripts/lib/env-race-js.mjs 头注）──
// ⚠️ 只扫 **vitest 会跑的那批文件**（vitest 的 include 集减去它自己的 exclude
//   前缀）⇒ ⇒ playwright／wdio 那些**独立进程**的 runner 不套这条判据
//   （套了就是误报）。
// ⚠️⚠️ **JS 工程的位置必须是「白名单式布局」，不能是「搜索式发现」** ——
//   第一版写成了「在 root 下递归搜 vitest.config.ts」⇒ ⇒ 当场撞了**两个**东西：
//   ❶ 别的会话留在仓内的 **worktree 旧副本**（`.verify-wt/shadow-desktop`）⇒ ⇒
//      扫的是**旧代码**（本地读到 150 个文件，真实是 185）⇒ ⇒ **读数不可信**；
//   ❷ 跨仓读数时撞上**另一个仓**（`ibloc-hr-agent`）⇒ ⇒ 扫的根本不是本仓桌面端。
//   ⇒ ⇒ 教训：**「自动发现」只有在边界明确时才安全**（工作区根是明确边界；
//      任意树里搜就不是）⇒ ⇒ 这里改成**几条已知布局的白名单**，找不到就明确说
//      「未找到」⇒ ⇒ **「没扫」与「扫了 0 个候选」必须能分开看**。
function findJsProject(root) {
  const candidates = [
    path.join(root, 'shadow-desktop'),                       // 本仓判定：root＝仓根
    path.join(root, 'shadow', 'shadow-desktop'),             // 跨仓读数：root＝工作区根
  ];
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, 'vitest.config.ts'))) return d;
  }
  return null;
}
const jsRoot = findJsProject(ROOT);
// ⚠️ **必须读配置** —— 实测（探针 G）：配置里开了 sequence.concurrent: true
//   ⇒ ⇒ 连普通的顺序 it 都并发 ⇒ ⇒ 只看代码里的 .concurrent 会漏掉这一族。
const jsConfig = jsRoot ? readVitestConfig(path.join(jsRoot, 'vitest.config.ts')) : { excludes: [], sequenceConcurrent: false, sameWorkerLikely: false, isolateShared: false, crossFileCertain: false };
const jsResult = jsRoot
  ? censusJs(jsRoot, { excludes: jsConfig.excludes, sequenceConcurrent: jsConfig.sequenceConcurrent, sameWorkerLikely: jsConfig.sameWorkerLikely, crossFileCertain: jsConfig.crossFileCertain })
  : { summary: { jsFilesScanned: 0, prodFilesScanned: 0, concurrentMuts: 0, unrestoredMuts: 0, candidates: 0, crossFileCandidates: 0, crossFileConditionalCandidates: 0, uncertainBlocks: 0, sequenceConcurrent: false, sameWorkerLikely: false, crossFileCertain: false }, report: [], uncertain: [] };
const jsCandidates = jsResult.summary.candidates;
const jsUncertain = jsResult.summary.uncertainBlocks;

if (summary.cratesScanned === 0) {
  console.error('判不了：' + ROOT + ' 下一个 crate 都没扫到 ⇒ ⇒ 退出码 2（不是「没问题」）');
  process.exit(2);
}

if (has('json')) {
  console.log(JSON.stringify({ summary, report }, null, 2));
} else {
  const reportOnly = REPORT_ONLY;
  console.log('=== 测试里的进程级 env 竞争（' + (reportOnly ? '读数' : '闸') + '）===');
  console.log('根目录: ' + ROOT);
  for (const r of report) {
    if (!r.sameBinary.length && !r.gatePolluted.length && !r.integ.length) continue;
    console.log('');
    console.log('== crate ' + r.crate + '  (' + r.dir + ')  扫到 .rs: src ' + r.files.src + ' / tests ' + r.files.tests + ' / benches ' + r.files.benches);
    if (r.sameBinary.length) {
      console.log('   ▸ 同二进制测试面 —— 同一个 var 被 ≥2 个测试函数改、**且有人读**（⇒ 污染真的落得到）：');
      for (const c of r.sameBinary) {
        console.log('       ' + c.var + '  ← ' + c.fns.length + ' 个测试函数: ' + c.fns.join(', '));
        for (const p of c.pts) console.log('           ' + p.file + ':' + p.line + '  (' + p.kind + ')');
        if (c.testRead.length) console.log('           测试读点: ' + c.testRead.join(', '));
        if (c.prodRead.length) console.log('           生产读点: ' + c.prodRead.join(', '));
      }
    }
    if (r.gatePolluted.length) {
      console.log('   ▸ 闸值污染面 —— 上面这些 var，生产代码也读它（⇒ 构造时的闸值会被污染）：');
      for (const c of r.gatePolluted) {
        console.log('       ' + c.var + '  ← ' + c.fns.length + ' 个测试函数；生产代码读它于: ' + c.prodRead.join(', '));
      }
    }
    if (r.integ.length) {
      console.log('   ▸ 集成测试面 —— 同一文件内同一个 var 被 ≥2 个测试函数改（文件是独立二进制，跨文件不互撞）：');
      for (const c of r.integ) {
        console.log('       ' + c.file + '  ' + c.var + '  ← ' + c.fns.join(', '));
        for (const p of c.pts) console.log('           ' + p.file + ':' + p.line + '  (' + p.kind + ')');
      }
    }
  }
  console.log('');
  console.log('—— 汇总：扫了 ' + summary.cratesScanned + ' 个 crate / ' + summary.filesScanned + ' 个 .rs 文件');
  console.log('   候选：同二进制 ' + summary.sameBinaryCandidates + ' / 闸值污染 ' + summary.gatePollutedCandidates + ' / 集成测试 ' + summary.integCandidates + ' ⇒ 合计 ' + summary.candidates);
  console.log('');
  console.log('—— JS/TS 面（vitest：**判据不同**，见 scripts/lib/env-race-js.mjs 头注）——');
  if (!jsRoot) {
    console.log('   ⚠️ **未找到 vitest 工程**（没找到 vitest.config.ts）⇒ ⇒ 这一面**没扫** ⇒ ⇒ 不是「扫了 0 个候选」');
  } else {
    console.log('   工程: ' + path.relative(ROOT, jsRoot).replace(/\\/g, '/') + '（按 vitest.config.ts 探测）');
    console.log('   扫了 ' + jsResult.summary.jsFilesScanned + ' 个 vitest 测试文件 / ' + jsResult.summary.prodFilesScanned + ' 个生产文件');
    console.log('   并发面：并发块里的 env 写 ' + jsResult.summary.concurrentMuts + ' 处（配置 sequence.concurrent=' + jsResult.summary.sequenceConcurrent + '）');
    console.log('   跨文件污染面：裸写且**不还原**的 env 写 ' + jsResult.summary.unrestoredMuts + ' 处 ⇒ ⇒ 候选 ' + jsCandidates + '（跨文件·判红档 ' + jsResult.summary.crossFileCandidates + ' ／ 跨文件·条件档 ' + jsResult.summary.crossFileConditionalCandidates + '）');
    console.log('   worker 条件：同 worker 可能＝' + jsResult.summary.sameWorkerLikely + '（fileParallelism:false／singleThread／maxWorkers:1）＋ 环境不隔离＝' + jsResult.summary.crossFileCertain + '（isolate:false）⇒ ⇒ **两者同时成立**才判红（实测矩阵：同 worker 但 isolate 默认 ⇒ ⇒ 每文件重建环境 ⇒ ⇒ env 隔离 ⇒ ⇒ 不判红）');
    console.log('   判不了（并发块花括号配平不出来）: ' + jsResult.summary.uncertainBlocks + ' 处 ' + (jsResult.summary.uncertainBlocks > 0 ? '⇒ ⇒ 这一面**判不了** ⇒ ⇒ 闸据此判红' : '✔（这一面判得了）'));
    for (const u of (jsResult.unrestored || [])) {
      console.log('   · 裸写且不还原: ' + u.var + ' @ ' + u.file + ':' + u.line + (u.concurrent ? '（在并发面里 ⇒ ⇒ 族 1 也会命中）' : '（顺序 it ⇒ ⇒ 族 1 不命中；跨文件污染面靠「有别的文件读它」才成立）'));
    }
  }
  for (const f of jsResult.report) {
    console.log('   == ' + f.file);
    for (const c of f.sameBinary) {
      console.log('       ' + c.var + '（并发面里写的）' + (c.prodRead.length ? '；生产读点: ' + c.prodRead.join(', ') : '') + (c.testRead.length ? '；同文件读点: ' + c.testRead.join(', ') : ''));
    }
    for (const c of (f.crossFile || [])) {
      console.log('       ' + c.var + '（**裸写且不还原** ⇒ ⇒ 跨文件污染·判红档）' + (c.prodRead.length ? '；生产读点: ' + c.prodRead.join(', ') : '') + (c.otherTestRead.length ? '；别的测试文件读点: ' + c.otherTestRead.join(', ') : ''));
    }
    for (const c of (f.crossFileConditional || [])) {
      console.log('       ' + c.var + '（**裸写且不还原** ⇒ ⇒ 跨文件污染·**条件档**（当前多 worker ⇒ ⇒ 不污染；但 CI 把并发压到 1 个 worker 时会转红））' + (c.prodRead.length ? '；生产读点: ' + c.prodRead.join(', ') : ''));
    }
  }
  for (const u of (jsResult.uncertain || [])) {
    console.log('   ⚠️ 判不了: ' + u.file + ' —— ' + u.items.map((x) => '第' + x.line + '行 ' + x.reason).join('；'));
  }
  console.log('   ⚠️ JS 侧**不适用** Rust 那套「多个 owner」判据（实测：vitest 同一文件内的顺序 it 是顺序执行的 ⇒ ⇒ 不竞争）；但**跨文件污染是真的**（实测：vitest **不在文件之间还原** env ⇒ ⇒ 裸写不还原 ⇒ ⇒ 文件顺序漂 ⇒ ⇒ 飘红）。');
  console.log('   ℹ️ Dart 侧**不适用**：Dart 的 `Platform.environment` 是只读的，没有 env 写入 API ⇒ ⇒ 本仓该族不成立。');
  console.log('   ⚠️ 候选**不是判决** ⇒ ⇒ 判定仍要靠「同一命令跑 N 轮」的 A/B。');
  if (reportOnly) {
    console.log('   ℹ️ --report-only ⇒ ⇒ 本次**只打印**候选，不判红。');
  }
}

// ⚠️⚠️ **--report-only 必须退出码 0** —— 它是「只打印读数」那一档 ⇒ ⇒
//    若它仍然退 1 ⇒ ⇒ 接到 CI 上就会**因为有存量候选而红** ⇒ ⇒ 而那些候选
//    在**兄弟仓**里（属别的工作线）⇒ ⇒ 本仓的 CI 不该替它们背锅 ⇒ ⇒
//    「有候选」与「该不该红」必须分开（**闸 vs 读数**两档）。
process.exit(gateExit(summary, REPORT_ONLY, jsCandidates, jsUncertain));
} // main()

/** 本文件是不是被**直接当脚本**跑（而不是被 import）？ */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
