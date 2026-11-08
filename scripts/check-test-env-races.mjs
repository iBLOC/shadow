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
export function gateExit(summary, reportOnly) {
  if (reportOnly) return 0;
  return summary.candidates > 0 ? 1 : 0;
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
  console.log('   ⚠️ 候选**不是判决** ⇒ ⇒ 判定仍要靠「同一命令跑 N 轮」的 A/B。');
  if (reportOnly) {
    console.log('   ℹ️ --report-only ⇒ ⇒ 本次**只打印**候选，不判红。');
  }
}

// ⚠️⚠️ **--report-only 必须退出码 0** —— 它是「只打印读数」那一档 ⇒ ⇒
//    若它仍然退 1 ⇒ ⇒ 接到 CI 上就会**因为有存量候选而红** ⇒ ⇒ 而那些候选
//    在**兄弟仓**里（属别的工作线）⇒ ⇒ 本仓的 CI 不该替它们背锅 ⇒ ⇒
//    「有候选」与「该不该红」必须分开（**闸 vs 读数**两档）。
process.exit(gateExit(summary, REPORT_ONLY));
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
