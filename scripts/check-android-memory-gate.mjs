#!/usr/bin/env node
/**
 * Android 记忆面闸 —— 「**档位不该决定功能可用性**」这一刀的门面
 * ============================================================================
 *
 * ## 它钉什么
 *
 * 2026-11-17 那一刀把「Android 上不许用本地记忆」这道**平台闸**与
 * `BuildOptions::hippocampus_local_on_android` 这道**构建档位开关**一起拆了：
 *
 *   · **旧形状**：Android ＋ 本地落点 ⇒ 记忆面**关掉**（fail-loud，不 panic）
 *     ⇒ ⇒ 要放行必须宿主在编译期说一声「我这个构建带硬链接退路补丁」
 *     ⇒ ⇒ 那道开关把「能不能用记忆」绑在了「编译成哪个档」上
 *     ⇒ ⇒ **档位一变，功能可用性就变** ⇒ ⇒ 失败长得像成功（构建对了才通）。
 *   · **新形状**：**编了 hippocampus 就能用** ⇒ ⇒ 唯一还关记忆面的理由是
 *     「存储目标不支持」（`storage_uri` 的 scheme 不在支持集里 ⇒ 那是**真错**）。
 *
 * ## 为什么要有闸（删除类改动天生没有编译期证据）
 *
 * 这道闸守的是**一个删掉的东西** ⇒ ⇒ 删干净了编译就过，**删漏了一半也编译就过**
 * ⇒ ⇒ 唯一的证据是**形状**：那道闸、那道开关**不许再出现**。
 *
 * ⚠️ 而「不许再出现」极易退化成**恒绿**：判据一写宽（例如只查那句报错文案），
 * 有人把平台闸换个说法加回来照样绿 ⇒ ⇒ 所以这里**钉七条**，其中两条是**负控**
 * （不许把真错护栏一起拆了；不许把宿主那一侧留下）。
 *
 * ## 七条
 *
 *   G1 端脑 `src/boot.rs`：档位开关字段 **零命中**（代码层；注释不算）
 *   G2 端脑 `src/boot.rs`：平台闸的计算 `let local_on_android` 与用法
 *      `|| local_on_android` **零命中**（代码层）
 *   G3 端脑 `src/boot.rs`：`memory_off` **逐字**是 `invalid_scheme.is_some()`
 *      —— 不许偷偷加第二个条件（那＝平台闸换了个名字加回来）
 *   G4 端脑 `src/boot.rs`：**scheme 闸仍在位** ⇒ ⚠️ **负控**：这一刀只准拆
 *      平台闸，不准把「存储目标不支持」那道真错护栏一起拆了
 *   G5 端脑 `src/boot.rs`：平台闸那段整块文案 **零命中**
 *   G6 大脑 `src/mobile/mod.rs`：宿主那一侧的档位开关赋值 **零命中**（代码层）
 *   G7 大脑 `Cargo.toml`：`[patch.crates-io]` 里 **object_store 指着 vendored
 *      那份** ⇒ 「Android 上无条件放行」这件事的**构建事实**兜底
 *
 * ## 用法
 *
 *   node scripts/check-android-memory-gate.mjs              # 判
 *   node scripts/check-android-memory-gate.mjs --self-test  # 判据自检（7/7）
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ≠ 没问题）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sibling } from './lib/sibling-repo.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NL = String.fromCharCode(10);

/** 判据条数（自检与「N/N」读数都用它 ⇒ ⇒ 不许手写一个会漂的数）。 */
export const RULE_COUNT = 7;

/** Rust 行注释剥掉（行首 `//`）⇒ ⇒ 「代码层」的判据不许被注释骗过。 */
export function codeOnly(src) {
  return src
    .split(NL)
    .filter((line) => !line.trim().startsWith('//'))
    .join(NL);
}

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
function hits(src, needle) {
  if (!needle) return 0;
  return src.split(needle).length - 1;
}

/**
 * 纯函数：三个源文件的内容 ⇒ ⇒ 结论。
 * ⚠️ **零 I/O** ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ 自检不会恒绿。
 */
export function evaluate(sources) {
  const findings = [];
  const add = (rule, file, detail) => findings.push({ rule, file, detail });

  const boot = sources.boot || '';
  const bootCode = codeOnly(boot);
  const mob = sources.mob || '';
  const mobCode = codeOnly(mob);
  const cargo = sources.cargo || '';

  // G1 —— 档位开关字段（代码层）
  const g1 = hits(bootCode, 'hippocampus_local_on_android');
  if (g1 !== 0) {
    add('G1', 'telencephalon/src/boot.rs',
      '档位开关 hippocampus_local_on_android 在代码里还有 ' + g1 + ' 处 ⇒ ⇒ 「档位决定能不能用记忆」那套没拆干净');
  }

  // G2 —— 平台闸的计算与用法（代码层）
  // ⚠️ 词元刻意选成「let local_on_android」与「|| local_on_android」——
  //    裸词「local_on_android」是字段名 hippocampus_local_on_android 的**子串**
  //    ⇒ ⇒ 裸词会把「字段残留」误报成「平台闸残留」⇒ ⇒ 判据不许自己骗自己。
  const g2a = hits(bootCode, 'let local_on_android');
  const g2b = hits(bootCode, '|| local_on_android');
  if (g2a !== 0 || g2b !== 0) {
    add('G2', 'telencephalon/src/boot.rs',
      '平台闸在代码里还有 ' + (g2a + g2b) + ' 处（定义 ' + g2a + ' ｜ 用法 ' + g2b +
      '）⇒ ⇒ Android 记忆面那道闸还在');
  }

  // G3 —— memory_off 只剩「scheme 不支持」这一支（逐字）
  const memLines = bootCode
    .split(NL)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('let memory_off ='));
  if (memLines.length !== 1 || memLines[0] !== 'let memory_off = invalid_scheme.is_some();') {
    add('G3', 'telencephalon/src/boot.rs',
      'memory_off 必须逐字是「let memory_off = invalid_scheme.is_some();」⇒ ⇒ 现在是 ' +
      (memLines.length === 0 ? '（零处定义）' : memLines.join(' ｜ ')));
  }

  // G4 —— 负控：真错护栏（scheme 闸）不许被一起拆了
  if (hits(bootCode, 'invalid_scheme') === 0) {
    add('G4', 'telencephalon/src/boot.rs',
      'scheme 闸（invalid_scheme）不见了 ⇒ ⇒ 这一刀只准拆平台闸，不准把「存储目标不支持」那道真错护栏一起拆了');
  }
  if (hits(boot, 'the hippocampus storage target is not usable') === 0) {
    add('G4', 'telencephalon/src/boot.rs',
      'scheme 闸的报错文案不见了 ⇒ ⇒ 「存储目标不支持 ⇒ 记忆面关掉」这条不许消失');
  }

  // G5 —— 平台闸那段整块文案
  const g5 = hits(boot, 'SELinux forbids the hard links Lance');
  if (g5 !== 0) {
    add('G5', 'telencephalon/src/boot.rs',
      '平台闸那段 fail-loud 文案还在（' + g5 + ' 处）⇒ ⇒ 那道闸只是被藏起来了');
  }

  // G6 —— 负控：宿主那一侧的档位开关赋值
  const g6 = hits(mobCode, 'hippocampus_local_on_android');
  if (g6 !== 0) {
    add('G6', 'encephalon/src/mobile/mod.rs',
      '宿主那一侧还在给档位开关赋值（' + g6 + ' 处）⇒ ⇒ 端脑删了开关，宿主还在传 ⇒ ⇒ 两边对不上');
  }

  // G7 —— 构建事实：vendored 硬链接退路补丁在位
  const patchAt = cargo.indexOf('[patch.crates-io]');
  if (patchAt < 0) {
    add('G7', 'encephalon/Cargo.toml',
      '找不到 [patch.crates-io] 段 ⇒ ⇒ 「Android 上无条件放行」的构建事实没了');
  } else {
    const section = cargo.slice(patchAt);
    if (!section.includes('object_store') || !section.includes('vendor/object_store')) {
      add('G7', 'encephalon/Cargo.toml',
        '[patch.crates-io] 段里没有「object_store 指着 vendored 那份」⇒ ⇒ Android 本地落点会撞 SELinux 的 link(2)');
    }
  }

  return findings;
}

/** 读三个源（读不到 ⇒ ⇒ 判不了 ⇒ ⇒ 退出码 2，不假装绿）。 */
export function readSources(repoRoot) {
  const telRoot = sibling(repoRoot, 'telencephalon');
  const encRoot = sibling(repoRoot, 'encephalon');
  const files = {
    boot: join(telRoot, 'src', 'boot.rs'),
    mob: join(encRoot, 'src', 'mobile', 'mod.rs'),
    cargo: join(encRoot, 'Cargo.toml'),
  };
  const missing = [];
  const out = { boot: '', mob: '', cargo: '' };
  for (const key of Object.keys(files)) {
    if (!existsSync(files[key])) {
      missing.push(files[key]);
      continue;
    }
    out[key] = readFileSync(files[key], 'utf8');
  }
  return { out, missing };
}

/** 合成夹具（自检用）—— 每一份都只含本闸关心的那几行。 */
function fixture(overrides) {
  const base = {
    boot: [
      '        let invalid_scheme: Option<String> = host_config',
      '            .as_ref()',
      '            .and_then(|c| c.storage_options_checked().err());',
      '                "the hippocampus storage target is not usable — the memory face stays OFF for this run"',
      '        let memory_off = invalid_scheme.is_some();',
    ].join(NL),
    mob: [
      '        hippocampus_data_dir: data_dir.map(|d| format!("{d}/lance")),',
    ].join(NL),
    cargo: [
      '[patch.crates-io]',
      'object_store = { path = "../hippocampus/vendor/object_store" }',
    ].join(NL),
  };
  return Object.assign(base, overrides || {});
}

function selfTest() {
  const compliant = fixture();
  const shapes = [
    {
      name: '合规（平台闸与档位开关都不在、真错护栏还在）',
      expect: [],
      src: compliant,
    },
    {
      name: '平台闸残留（local_on_android 回来了）',
      expect: ['G2', 'G3'],
      src: fixture({
        boot: compliant.boot +
          NL +
          '        let local_on_android = cfg!(target_os = "android");' +
          NL +
          '        let memory_off = invalid_scheme.is_some() || local_on_android;',
      }),
    },
    {
      name: '档位开关残留（字段回来了）',
      expect: ['G1'],
      src: fixture({
        boot: compliant.boot + NL + '    pub hippocampus_local_on_android: bool,',
      }),
    },
    {
      name: '负控：真错护栏被一起拆了（invalid_scheme 没了）',
      expect: ['G4'],
      src: fixture({
        boot: '        let memory_off = invalid_scheme.is_some();',
      }),
    },
    {
      name: 'memory_off 被偷偷加了条件（平台闸换名加回来）',
      expect: ['G3'],
      src: fixture({
        boot: compliant.boot.replace(
          'let memory_off = invalid_scheme.is_some();',
          'let memory_off = invalid_scheme.is_some() || android_local_blocked;',
        ),
      }),
    },
    {
      name: '负控：宿主那一侧还在传档位开关',
      expect: ['G6'],
      src: fixture({
        mob: compliant.mob +
          NL +
          '        hippocampus_local_on_android: cfg!(feature = "mobile-memory"),',
      }),
    },
    {
      name: '构建事实没了（object_store 补丁没接）',
      expect: ['G7'],
      src: fixture({
        cargo: '[patch.crates-io]' + NL + 'reqwest = { git = "https://example.invalid/x" }',
      }),
    },
  ];

  let total = 0;
  let failed = 0;
  for (const shape of shapes) {
    total += 1;
    const findings = evaluate(shape.src);
    const got = findings.map((f) => f.rule);
    const ok = shape.expect.length === 0
      ? findings.length === 0
      : shape.expect.every((r) => got.includes(r));
    if (!ok) failed += 1;
    const mark = ok ? '✔' : '✘';
    console.log(mark + ' ' + shape.name + ' ⇒ 期望 [' + shape.expect.join(',') + ']，实际 [' + got.join(',') + ']');
    for (const f of findings) {
      console.log('    · [' + f.rule + '] ' + f.file + ' ⇒ ' + f.detail);
    }
  }
  console.log('自检 ' + (total - failed) + '/' + total + ' 绿');
  return failed === 0 ? 0 : 1;
}

function main() {
  if (process.argv.slice(2).includes('--self-test')) {
    process.exit(selfTest());
  }

  const { out, missing } = readSources(REPO_ROOT);
  if (missing.length > 0) {
    console.error('⚠ 判不了：源没读全（读不到 ≠ 没问题）');
    for (const m of missing) console.error('  · 缺：' + m);
    process.exit(2);
  }

  const findings = evaluate(out);
  if (findings.length === 0) {
    console.log('✔ Android 记忆面闸：' + RULE_COUNT + '/' + RULE_COUNT + ' 绿');
    console.log('  · 端脑：平台闸与档位开关都不在了；memory_off 只剩「存储目标不支持」那一支');
    console.log('  · 大脑：宿主不再传档位开关；vendored 硬链接退路补丁在位');
    process.exit(0);
  }
  console.error('✘ Android 记忆面闸：' + findings.length + ' 条红');
  for (const f of findings) {
    console.error('  · [' + f.rule + '] ' + f.file + ' ⇒ ' + f.detail);
  }
  process.exit(1);
}

main();
