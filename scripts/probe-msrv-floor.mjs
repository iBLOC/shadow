#!/usr/bin/env node
/**
 * MSRV 地板的**编译级**探针 —— 回答「声明的地板在**真编**下成立吗」
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * ⚠️ **现状（2026-11-11 实测）**：
 *   · 中心流水线的 Rust job 把工具链**钉在 1.99**（RUST_TOOLCHAIN=1.99.0）⇒ ⇒
 *     ⇒ ⇒ **CI 从来没有用地板版本编过一次** ⇒ ⇒ 「地板 = 1.94」这句话
 *     ⇒ ⇒ **没有任何编译级证据**（它只是一行文本）。
 *   · 既有地板闸（scripts/check-msrv-floor.mjs）判的是「**锁文件里的依赖要求**
 *     有没有越过地板」⇒ ⇒ 它是**图级**读数 ⇒ ⇒ 准，但**不是**「地板能不能真编出来」。
 *
 * ⚠️ **而且 metadata 不做 MSRV 检查**（实测）：
 *   cargo +1.94 metadata --locked --offline ⇒ ⇒ **EXIT=0**（telencephalon 与 prefrontal 都是）
 *   ⇒ ⇒ ⇒ 「拿 metadata 当编译级读数」是**错的** ⇒ ⇒ ⇒ 真判据只能**真编**。
 *
 * ⇒ ⇒ **所以这一格必须机械化**：用**钉住的地板版本**真编一次 ⇒ ⇒
 *   · 编得过 ⇒ ⇒ 「地板 = 1.94」**有编译级证据** ⇒ ⇒ 地板不用抬（代价＝把锁钉回 1.94 线）；
 *   · 编不过 ⇒ ⇒ 「地板 = 1.94」**被证伪** ⇒ ⇒ 地板必须抬（代价＝跨仓一起改）；
 *   ⇒ ⇒ ⇒ **于是「1.94 还是 1.95」从口味题变成事实题**。
 *
 * ## 用法
 *
 *   node scripts/probe-msrv-floor.mjs --self-test
 *   node scripts/probe-msrv-floor.mjs --manifest-path ../telencephalon/Cargo.toml
 *   node scripts/probe-msrv-floor.mjs --manifest-path ../neuron/Cargo.toml --crate neuron
 *
 * ⚠️ **它会真编**（十几分钟量级）⇒ ⇒ **它不是闸**（闸要每次 push 都跑）⇒ ⇒
 *   它是**探针** ⇒ ⇒ 由主人按需触发（CI 侧有 workflow_dispatch 的独立 workflow）
 *   ⇒ ⇒ 但**它的判读逻辑是纯函数** ⇒ ⇒ 自检能喂合成夹具 ⇒ ⇒ **判读本身天天在 CI 里验**。
 *
 * 退出码：**0 地板可建（绿） / 1 地板不可建（红） / 2 判不了**（工具链缺失／找不到 manifest／网络断）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 从当前目录向上找 Cargo.toml（与既有地板闸同款）。 */
function findManifest(start) {
  let dir = start;
  for (let i = 0; i < 40; i++) {
    const p = resolve(dir, 'Cargo.toml');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 判读 cargo 的输出 ⇒ ⇒ 纯函数（**不跑 cargo**）⇒ ⇒ 自检能喂合成夹具。
 *
 * ⚠️ 两种真实形状都要认（Rust 1.84+ 两种措辞都出现过）：
 *   ❶ error: package [反引号]sysinfo v0.39.6[反引号] cannot be built because it requires rustc 1.95 or newer
 *   ❷ error: rustc 1.94.0 is not supported by the following packages:
 *        sysinfo@0.39.6 requires rustc 1.95
 *
 * @param {{code:number, output:string}} res
 * @returns {{verdict:string, offenders:{name:string,version:string,required:string}[], reason:string}}
 */
export function interpretProbe(res) {
  const code = Number((res && res.code) || 0);
  const out = String((res && res.output) || '');
  const offenders = [];

  // 形状 ①：cargo 的真实措辞是 package `sysinfo v0.39.6` cannot be built because it requires rustc 1.95 or newer
  // ⚠️ 包名带反引号 ⇒ ⇒ 正则必须**显式处理反引号**（否则抓到的名字会带上 ` 前缀 ⇒ ⇒ 点名失败）。
  const re1 = /package\s+`?([^`\s]+)`?\s+v([0-9][^`\s]*?)`?\s+cannot be built because it requires rustc\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/g;
  let m;
  // ⚠️ 去重：cargo 会把**同一个包的多个特性变体**各一行（实测 aws-types@1.4.0 出现 3 次）
  //   ⇒ ⇒ 不去重 就会把「23 个包」报成「25 个」（实测确认）⇒ ⇒ 读数不可比 ⇒ ⇒ 化成 Set 去重。
  const seen = new Set();
  const push = (name, version, required) => {
    const key = name + '|' + version + '|' + required;
    if (seen.has(key)) return;
    seen.add(key);
    offenders.push({ name, version, required });
  };
  while ((m = re1.exec(out)) !== null) {
    push(m[1], m[2], m[3]);
  }
  const re2 = /(^|\n)\s*([^\s@]+)@([^\s]+) requires rustc ([0-9]+\.[0-9]+(?:\.[0-9]+)?)/g;
  while ((m = re2.exec(out)) !== null) {
    push(m[2], m[3], m[4]);
  }

  // 环境类问题 ⇒ ⇒ 「判不了」而不是「地板不可建」。
  const envHints = [
    'is not installed',
    'toolchain ',
    'no such command',
    'failed to get',
    'network',
    'could not resolve host',
    'failed to load source',
    'unable to get packages',
  ];
  const isEnv = envHints.some((h) => out.includes(h)) && offenders.length === 0;

  if (code === 0) {
    return { verdict: 'floor-buildable', offenders: [], reason: '用地板版本的工具链编过了 ⇒ ⇒ 地板成立' };
  }
  if (offenders.length > 0) {
    return {
      verdict: 'floor-unbuildable',
      offenders,
      reason: '依赖图要求比地板更高的 rustc ⇒ ⇒ **声明的地板是假的**（**编译级**事实）',
    };
  }
  if (isEnv) {
    return { verdict: 'cannot-judge', offenders: [], reason: '环境类问题（工具链缺失／网络／找不到 manifest）⇒ ⇒ 判不了 ≠ 地板不成立' };
  }
  return {
    verdict: 'floor-unbuildable',
    offenders: [],
    reason: '用地板版本的工具链**编不过**（未见 MSRV 措辞 ⇒ ⇒ 可能是我们自己的代码在该版本下编不过）',
  };
}

/**
 * 地板 ⇒ ⇒ 工具链的**精确值**。
 *
 * ⚠️⚠️ **这里有个会骗人的默认**：cargo 的 `+1.94` 解析到**已装的最新 1.94.x**
 *   （本机实测：1.94.1）⇒ ⇒ 「用 +1.94 编过了」**不证明**「1.94.0 编过了」。
 * ⚠️ 而 rust-version = "1.94" 在 cargo 眼里就是 **>= 1.94.0**
 *   ⇒ ⇒ 所以「地板」要验的是**精确值 1.94.0**，不是「1.94 线」。
 * ⇒ ⇒ 通用形态：「版本号」有两个口径（**线** vs **精确值**）⇒ ⇒ 判定器必须先说清自己算哪一档。
 */
/**
 * **自报地板**（分仓口径）—— 从 manifest 原文里读 `[package]` 段的 `rust-version`。
 *
 * ⚠️ **纯函数**（零 I/O）⇒ ⇒ 自检能喂合成夹具。
 * ⚠️ 只认 **[package] 段**里的那行 ⇒ ⇒ 依赖段里的 rust-version 不算数。
 * ⚠️ 虚拟 manifest（只有 [workspace] 没有 [package]）⇒ ⇒ 返回 null ⇒ ⇒ **判不了**。
 *
 * @param {string} text manifest 原文
 * @returns {string|null}
 */
export function declaredFloor(text) {
  const src = String(text || '');
  const lines = src.split(/\r?\n/);
  let inPackage = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[/.test(line)) {
      inPackage = /^\[package\]/.test(line);
      continue;
    }
    if (!inPackage) continue;
    const m = line.match(/^rust-version\s*=\s*"([^"]+)"/);
    if (m) return m[1].trim();
  }
  return null;
}

export function floorToolchain(floor) {
  const parts = String(floor).trim().split('.');
  if (parts.length >= 3) return parts.slice(0, 3).join('.');
  return parts.join('.') + '.0';
}

function parseArgs(argv) {
  const out = {
    manifest: null,
    // ⚠️ **默认＝auto（自报）** ⇒ ⇒ 地板由**那个仓自己**声明 ⇒ ⇒ 口径机械化了。
    floor: 'auto',
    toolchain: null,
    crate: null,
    timeout: 3600,
    json: false,
    online: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest-path' && argv[i + 1]) out.manifest = resolve(argv[++i]);
    else if (a === '--floor' && argv[i + 1]) out.floor = argv[++i];
    else if (a === '--toolchain' && argv[i + 1]) out.toolchain = argv[++i];
    else if (a === '--crate' && argv[i + 1]) out.crate = argv[++i];
    else if (a === '--timeout' && argv[i + 1]) out.timeout = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--online') out.online = true;
  }
  if (!out.toolchain && out.floor !== 'auto') {
    // 地板 1.94 ⇒ ⇒ 工具链**精确值** 1.94.0（不是 `+1.94`）
    out.toolchain = floorToolchain(out.floor);
  }
  // ⚠️ auto 那一档的工具链**不能在这里推导** ⇒ ⇒ 它要等 manifest 读到自报声明。
  return out;
}

function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('编过了 ⇒ ⇒ 地板可建（绿）', () => {
    const r = interpretProbe({ code: 0, output: '    Checking telencephalon v0.1.0' });
    return r.verdict === 'floor-buildable';
  });

  add('MSRV 形状 ❶ ⇒ ⇒ 地板不可建 ＋ 指出那个包', () => {
    const r = interpretProbe({
      code: 1,
      output:
        'error: package `sysinfo v0.39.6` cannot be built because it requires rustc 1.95 or newer, ' +
        'while the currently active rustc version is 1.94.0',
    });
    return r.verdict === 'floor-unbuildable' && r.offenders.length === 1 && r.offenders[0].name === 'sysinfo';
  });

  add('MSRV 形状 ❷ ⇒ ⇒ 同样认得出', () => {
    const r = interpretProbe({
      code: 1,
      output:
        'error: rustc 1.94.0 is not supported by the following packages:\n  sysinfo@0.39.6 requires rustc 1.95\n  generator@0.8.12 requires rustc 1.95',
    });
    return r.verdict === 'floor-unbuildable' && r.offenders.length === 2;
  });

  add('孪生：形状 ❷ 的两个包**都要**被点名', () => {
    const r = interpretProbe({
      code: 1,
      output: '  sysinfo@0.39.6 requires rustc 1.95\n  generator@0.8.12 requires rustc 1.95',
    });
    const names = r.offenders.map((o) => o.name).sort().join(',');
    return names === 'generator,sysinfo';
  });

  add('同一包重复出现（多特性变体）⇒ ⇒ 只被点名**一次**', () => {
    const r = interpretProbe({
      code: 101,
      output:
        'error: rustc 1.94.0 is not supported by the following packages:\n' +
        '  aws-types@1.4.0 requires rustc 1.94.1\n' +
        '  aws-types@1.4.0 requires rustc 1.94.1\n' +
        '  aws-types@1.4.0 requires rustc 1.94.1',
    });
    return r.verdict === 'floor-unbuildable' && r.offenders.length === 1;
  });

  add('工具链缺失 ⇒ ⇒ 判不了（**不是**「地板不可建」）', () => {
    const r = interpretProbe({ code: 1, output: "error: toolchain '1.94' is not installed" });
    return r.verdict === 'cannot-judge';
  });

  add('找不到依赖源 ⇒ ⇒ 判不了', () => {
    const r = interpretProbe({ code: 1, output: 'error: failed to load source for dependency' });
    return r.verdict === 'cannot-judge';
  });

  add('我们自己的代码编不过 ⇒ ⇒ 地板不可建（不是判不了）', () => {
    const r = interpretProbe({ code: 101, output: 'error[E0308]: mismatched types' });
    return r.verdict === 'floor-unbuildable' && r.offenders.length === 0;
  });

  add('空输出 + 非零 ⇒ ⇒ 不可建（保守：不能当成绿）', () => {
    const r = interpretProbe({ code: 1, output: '' });
    return r.verdict === 'floor-unbuildable';
  });

  add('参数：地板 1.94 ⇒ ⇒ 工具链默认取**精确值** 1.94.0（不是 `+1.94`）', () => {
    const a = parseArgs(['--floor', '1.94']);
    return a.toolchain === '1.94.0';
  });

  add('地板→工具链：1.94 ⇒ 1.94.0 ｜ 1.94.2 ⇒ 1.94.2 ｜ 1.95 ⇒ 1.95.0', () => {
    return floorToolchain('1.94') === '1.94.0' && floorToolchain('1.94.2') === '1.94.2' && floorToolchain('1.95') === '1.95.0';
  });

  add('参数：显式指定工具链 ⇒ ⇒ 覆盖地板推导', () => {
    const a = parseArgs(['--floor', '1.94', '--toolchain', '1.94.0']);
    return a.toolchain === '1.94.0';
  });

  add('自报地板：从 manifest 原文读 [package] 段的 rust-version', () => {
    const t = ['[package]', 'name = "x"', 'rust-version = "1.94.1"', '', '[dependencies]', 'serde = "1"'].join('\n');
    return declaredFloor(t) === '1.94.1';
  });

  add('自报地板：依赖段里的 rust-version **不算数**（只认 [package] 段）', () => {
    const t = ['[package]', 'name = "x"', '', '[dependencies]', 'foo = { version = "1", rust-version = "1.99" }'].join('\n');
    return declaredFloor(t) === null;
  });

  add('自报地板：虚拟 manifest（只有 [workspace]）⇒ ⇒ 读不到 ⇒ ⇒ 判不了', () => {
    return declaredFloor('[workspace]\nmembers = ["a"]\n') === null;
  });

  add('默认地板＝auto（自报）⇒ ⇒ **没有人挑的数**', () => {
    const a = parseArgs([]);
    return a.floor === 'auto' && a.toolchain === null;
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
    console.error('❌ 自检没过 ⇒ 探针的判读不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (process.argv.includes('--self-test')) selfTest();

  const manifest = opts.manifest || findManifest(process.cwd());
  if (!manifest || !existsSync(manifest)) {
    console.error('❌ 找不到 Cargo.toml ⇒ ⇒ 判不了 ≠ 地板不成立');
    process.exit(2);
  }

  // ── 地板解析：**auto（自报）＝ 默认** ／ 显式 --floor（取证面）────────────
  let floor = opts.floor;
  let toolchain = opts.toolchain;
  if (floor === 'auto') {
    const declared = declaredFloor(readFileSync(manifest, 'utf8'));
    if (!declared) {
      console.error('❌ 这个仓**没有自报地板**（manifest 的 [package] 段没有 rust-version）⇒ ⇒ 判不了 ≠ 地板不成立');
      process.exit(2);
    }
    floor = declared;
    if (!toolchain) toolchain = floorToolchain(declared);
  } else if (!toolchain) {
    toolchain = floorToolchain(floor);
  }

  const args = ['+' + toolchain, 'check', '--locked'];
  if (!opts.online) args.push('--offline');
  if (opts.crate) args.push('-p', opts.crate);
  args.push('--manifest-path', manifest);

  console.log('⇒ ⇒ MSRV 地板编译级探针 :: 地板 ' + floor + ' ｜ 工具链 ' + toolchain);
  console.log('   manifest :: ' + manifest);
  console.log('   命令     :: cargo ' + args.join(' '));
  console.log('   ⚠️ 真编（可能十几分钟）⇒ ⇒ 这一格**不会**在每次 push 里跑 ⇒ ⇒ 由主人按需触发。');

  const res = spawnSync('cargo', args, {
    encoding: 'utf8',
    timeout: opts.timeout * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = String(res.stdout || '') + String(res.stderr || '');
  const code = res.status === null || res.status === undefined ? 2 : res.status;
  const verdict = interpretProbe({ code, output });

  if (opts.json) {
    console.log(
      JSON.stringify(
        { manifest, floor, toolchain, exit: code, ...verdict },
        null,
        2,
      ),
    );
  } else {
    console.log('   退出码   :: ' + code);
    console.log('   判定     :: ' + verdict.verdict + ' —— ' + verdict.reason);
    for (const o of verdict.offenders) {
      console.log('     · ' + o.name + ' ' + o.version + ' 要 rustc ' + o.required);
    }
    if (verdict.verdict === 'floor-unbuildable') {
      console.log('   ⇒ ⇒ **处置有两条**（**都在这个仓自己身上** —— 分仓地板：谁的仓谁自己改）：');
      console.log('      ① 抬**这个仓**自报的地板（改它自己的 rust-version ⇒ ⇒ 它的承诺变成真的）；');
      console.log('      ② 降**这个仓**的依赖到 ≤ 自报地板（重解析锁文件；需要网络；要验它编得过）。');
      console.log('      ⇒ ⇒ 本探针只回答「这个仓的地板现在是不是假的」，**不替你选**。');
    }
    if (verdict.verdict === 'cannot-judge') {
      console.log('   ⇒ ⇒ 这一格**没验成**（不是「地板不成立」）⇒ ⇒ 缺口要留在视野里。');
    }
  }

  if (verdict.verdict === 'cannot-judge') process.exit(2);
  if (verdict.verdict === 'floor-unbuildable') process.exit(1);
  process.exit(0);
}

// ⚠️ **入口守卫** —— 这个文件同时是**判据库**（export interpretProbe / floorToolchain，可被单测 import）
//   ⇒ ⇒ 没有守卫 ⇒ ⇒ 一 import 就执行 CLI 块 ⇒ ⇒ **把宿主进程直接带走**。
const invokedDirectly = (() => {
  try {
    const here = process.argv[1] ? resolve(process.argv[1]) : '';
    const self = resolve(fileURLToPath(import.meta.url));
    return here === self;
  } catch (err) {
    return false;
  }
})();

if (invokedDirectly) {
  main();
}
