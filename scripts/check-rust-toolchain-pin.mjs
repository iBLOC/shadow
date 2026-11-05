#!/usr/bin/env node
/**
 * 「Rust 工具链钉住」判定闸 —— CI 跑 cargo 的 job 是不是**真的**把尺子钉住了。
 * ============================================================================
 *
 * ## 为什么要有这道闸（2026-11-05 真机实测）
 *
 * ⚠️ **不钉的后果是「静默漂移」** —— runner 预装的 stable 随 Rust 发版往前走
 * ⇒ ⇒ **尺子的刻度会变** ⇒ ⇒ 同一份代码昨天绿、今天红，而**红的原因不在代码**。
 * ⇒ ⇒ 实测：CI 的 clippy 是 **1.99.0**、本地是 **1.96.0** ⇒ ⇒ 同一份代码
 * 本地 `-D warnings` 零 lint，CI 上报 **15 条** `clippy::double_must_use`
 * ⇒ ⇒ 而那条 lint 在 1.96 上**还在 pedantic** ⇒ ⇒ **本地量不出来**。
 *
 * ⚠️ **而「钉住了」也可能是假钉** —— `RUST_TOOLCHAIN` 只写在 env 里、
 * 没有 `rustup toolchain install` ⇒ ⇒ runner 上未必有那个版本 ⇒ ⇒ cargo
 * 直接报 "toolchain '1.99.0' is not installed" ⇒ ⇒ 那是**钉了但没用上**。
 * ⇒ ⇒ 这道闸判的是**结构**：版本精确、装得到、跨 workflow 同一个。
 *
 * ## 三态退出码
 *
 * **0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 *
 * 用法：
 *   node scripts/check-rust-toolchain-pin.mjs             # 判定
 *   node scripts/check-rust-toolchain-pin.mjs --self-test # 判据自检
 *   node scripts/check-rust-toolchain-pin.mjs --drill      # 退化演练（副本破坏 ⇒ 红 ⇒ 还原）
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findToolchainPinIssues,
  findCrossWorkflowIssues,
  scanToolchainPinning,
  EXACT_VERSION,
} from './lib/rust-toolchain-pin.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');

function listWorkflowFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();
}

/**
 * 剥 YAML 注释 —— `#` 到行尾，但**引号里的 `#` 不算注释**。
 *
 * ⚠️ 为什么必须剥：workflow 的注释里**恰好**写着 `RUST_TOOLCHAIN`（说明
 *   「为什么要钉」）⇒ ⇒ 不剥就是误报 ⇒ ⇒ 闸门会被当噪音关掉。
 *
 * ⚠️ **引号状态要跟行走** —— YAML 的引号可以跨行，但 workflow 里几乎不出现
 *   ⇒ ⇒ 这里按「行内配平」处理（引号在行尾没闭合就当它开着），够用且不会
 *   把整份文件吃掉。
 */
export function stripYamlComments(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  for (const line of lines) {
    let inSingle = false;
    let inDouble = false;
    let cut = -1;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === '#' && !inSingle && !inDouble) {
        // `#` 只有在行首或前面是空白时才是 YAML 注释的开始
        if (i === 0 || /\s/.test(line[i - 1])) {
          cut = i;
          break;
        }
      }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join('\n');
}

function readWorkflows(dir) {
  return listWorkflowFiles(dir).map((f) => {
    const raw = readFileSync(join(dir, f), 'utf8');
    return { file: f, raw, text: stripYamlComments(raw) };
  });
}

function judge(files) {
  const issues = [];
  const stripped = files.map((f) => ({ file: f.file, text: stripYamlComments(f.text) }));
  for (const f of stripped) {
    for (const i of findToolchainPinIssues(f.text, f.file)) issues.push(i);
  }
  for (const i of findCrossWorkflowIssues(stripped)) issues.push(i);
  return issues;
}

function report(issues, cargoJobs) {
  if (issues.length === 0) {
    console.log(`✅ 零违规（Rust 工具链：${cargoJobs} 个跑 cargo 的 job 全部钉住精确版本）`);
    return 0;
  }
  console.log(`❌ ${issues.length} 条违规：`);
  for (const i of issues) console.log(`  · [${i.kind}] ${i.file}：${i.detail}`);
  return 1;
}

function cargoJobCount(files) {
  return files.reduce((n, f) => n + scanToolchainPinning(f.text).cargoJobs, 0);
}

// ───────────────────────────── 自检 ─────────────────────────────

const SELF_TEST = [
  {
    name: '钉住了 ⇒ 零违规',
    files: [{ file: 'a.yml', text: 'jobs:\n  j:\n    env:\n      RUST_TOOLCHAIN: \'1.99.0\'\n    steps:\n      - run: cargo build\n      - run: rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal\n' }],
    expect: 0,
  },
  {
    name: '没钉（跑 cargo 却用 stable）⇒ 恰好 1 条红',
    files: [{ file: 'a.yml', text: 'jobs:\n  j:\n    steps:\n      - run: cargo build\n' }],
    expect: 1,
  },
  {
    name: 'channel 词（stable）⇒ 红',
    files: [{ file: 'a.yml', text: 'jobs:\n  j:\n    env:\n      RUST_TOOLCHAIN: \'stable\'\n    steps:\n      - run: cargo build\n      - run: rustup toolchain install "$RUST_TOOLCHAIN"\n' }],
    expect: 1,
  },
  {
    name: '假钉（钉了但没装）⇒ 红',
    files: [{ file: 'a.yml', text: 'jobs:\n  j:\n    env:\n      RUST_TOOLCHAIN: \'1.99.0\'\n    steps:\n      - run: cargo build\n' }],
    expect: 1,
  },
  {
    name: '跨 workflow 版本漂移 ⇒ 红',
    files: [
      { file: 'a.yml', text: 'jobs:\n  j:\n    env:\n      RUST_TOOLCHAIN: \'1.99.0\'\n    steps:\n      - run: cargo build\n      - run: rustup toolchain install "$RUST_TOOLCHAIN"\n' },
      { file: 'b.yml', text: 'jobs:\n  j:\n    env:\n      RUST_TOOLCHAIN: \'1.96.0\'\n    steps:\n      - run: cargo build\n      - run: rustup toolchain install "$RUST_TOOLCHAIN"\n' },
    ],
    expect: 1,
  },
  {
    name: '注释里提到 RUST_TOOLCHAIN ⇒ 不误报（噪声）',
    files: [{ file: 'a.yml', text: 'jobs:\n  j:\n    steps:\n      # 这里要写 RUST_TOOLCHAIN: \'1.99.0\'\n      - run: cargo build\n' }],
    expect: 1,
  },
  {
    name: '不跑 cargo 的 workflow ⇒ 不归这道闸管（不误报）',
    files: [{ file: 'a.yml', text: 'jobs:\n  j:\n    steps:\n      - run: node scripts/check-x.mjs\n' }],
    expect: 0,
  },
];

function runSelfTest() {
  let pass = 0;
  const fails = [];
  for (const c of SELF_TEST) {
    const got = judge(c.files).length;
    if (got === c.expect) {
      pass += 1;
      console.log(`  [PASS] ${c.name}`);
    } else {
      fails.push(`${c.name}（期望 ${c.expect} 条，实际 ${got} 条）`);
      console.log(`  [FAIL] ${c.name}（期望 ${c.expect} 条，实际 ${got} 条）`);
    }
  }
  console.log(`判据自检：${pass}/${SELF_TEST.length}`);
  return pass === SELF_TEST.length ? 0 : 1;
}

// ───────────────────────────── 主流程 ─────────────────────────────

const mode = process.argv[2] || '';

if (mode === '--self-test') {
  process.exit(runSelfTest());
}

/**
 * `--dir <path>` —— 扫描不同的 workflow 目录。
 * ⚡️ **判据不变**（只是换了扫的目录）⇒ ⇒ 这个参数存在的意义是
 * 「在**副本**上做退化演练」（不能碰真文件）。
 */
let scanDir = WORKFLOWS_DIR;
const dirArg = process.argv.indexOf('--dir');
if (dirArg > 0 && process.argv[dirArg + 1]) scanDir = resolve(process.argv[dirArg + 1]);

if (!existsSync(scanDir)) {
  console.error('⚠️ 判不了：找不到 ' + scanDir + ' ⇒ ⇒ 源没读全（退出码 2）');
  process.exit(2);
}

const files = readWorkflows(scanDir);
if (files.length === 0) {
  console.error('⚠️ 判不了：.github/workflows/ 里没有 workflow 文件 ⇒ ⇒ 源没读全（退出码 2）');
  process.exit(2);
}

const issues = judge(files);
const n = cargoJobCount(files);
if (n === 0) {
  console.log('ℹ️ 这个仓的 workflow 里没有跑 cargo 的 job ⇒ ⇒ 这道闸不适用（退出码 0）');
  process.exit(0);
}
process.exit(report(issues, n));
