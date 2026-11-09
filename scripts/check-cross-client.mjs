#!/usr/bin/env node
/**
 * 跨端一致性校验 —— **统一入口**
 *
 * 为什么要有这个：
 * 跨端一致性的守卫不止一个，各自守一件事。分开跑，CI 很容易只跑其中一个
 * ⇒ 另一个守卫等于不存在（这正是「客户端工具两端不一致」能活这么久的原因）。
 *
 * 这里把每个守卫**当子进程跑一遍**，汇总退出码：
 *   - 任何一个阻断（退出码 1）⇒ 整体退出码 1；
 *   - **任何一个判不了（退出码 2）⇒ 整体退出码 2**（这一格**没验成**，但不断路）；
 *   - **守卫崩了（退出码 null / 不是 0/1/2）⇒ 整体退出码 2** ——
 *     ⚠️ 「崩了」与「判红」在 CI 上长得一模一样（步骤都是红）
 *     ⇒ ⇒ 「读不到」必须自己写成「判不了」，不许靠抛异常让平台替你判
 *     （2026-11-11 真 CI 实测：闸崩 ⇒ 退出码 1 ⇒ 「读不到」被写成「有问题」）。
 *
 * 守卫清单：
 *   1. `check-agent-surface.mjs` —— 清单 ↔ 两端路由 / token / 导航生成物 / 文案 key
 *   2. `check-client-tools.mjs`  —— 两端发给模型的 `tools` 必须一样
 *   3. `check-jni-surface.mjs`   —— JNI 面：Kotlin ↔ 宿主直测的 Java 替身，
 *                                  以及 `jniLibs/` 里那份 `.so` 真的有全部符号
 *                                  （⚠️ 装错 `.so` 会让「端脑面上锁」**静默失效**）
 *   4. `check-apk-surface.mjs`   —— **APK 产物级**：入口是不是正牌 App
 *                                  （不是集成测试壳）+ **真正装进手机那份** `.so`
 *                                  的符号 / 运行时依赖 / 与 `jniLibs` 是否同一份
 *                                  （⚠️ `jniLibs` 对了但 **APK 是旧的** ⇒ 一样是坑）
 *   5. `check-brain-route-surface.mjs` —— **端脑 HTTP 路由面**（产物级）：客户端
 *                                  依赖的端脑路由，端脑源码里有、你编出来的大脑里
 *                                  有没有（⚠️ 符号全对但路由少了一堆 ⇒ 一样是坑）
 *
 * 用法：
 *   node scripts/check-cross-client.mjs
 *   node scripts/check-cross-client.mjs --self-test
 *   node scripts/check-cross-client.mjs --guards=<逗号分隔的守卫路径>   （自检用）
 *
 * 退出码 0 = 全部通过；1 = 有阻断问题；**2 = 判不了**（缺它要的输入：兄弟仓 / 产物）。
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_GUARDS = [
  {
    script: 'scripts/check-agent-surface.mjs',
    what: '能力清单 ↔ 两端路由 / 设计 token / 导航生成物 / 文案 key',
  },
  {
    script: 'scripts/check-client-tools.mjs',
    what: '两端发给模型的客户端工具（tools 数组）必须一致',
  },
  {
    script: 'scripts/check-jni-surface.mjs',
    what: 'JNI 面：Kotlin ↔ 宿主直测的 Java 替身；jniLibs 那份 .so 的符号核验',
  },
  {
    script: 'scripts/check-apk-surface.mjs',
    what: 'APK 产物级：入口是不是正牌 App + 真正装进手机那份 .so 的符号/依赖/同一性',
  },
  {
    script: 'scripts/check-brain-route-surface.mjs',
    what: '端脑 HTTP 路由面（产物级）：客户端依赖 ∧ 端脑源码有 ∧ 产物里有没有',
  },
];

const line = '═'.repeat(72);

/** 守卫的绝对路径 + 展示名。 */
function toGuard(entry) {
  const script = typeof entry === 'string' ? entry : entry.script;
  const what = typeof entry === 'string' ? '（自检注入的守卫）' : entry.what;
  return {
    label: script.split(/[\\/]/).pop(),
    script,
    what,
    path: resolve(ROOT, script),
  };
}

function parseArgs(argv) {
  const out = { selfTest: false, guards: null };
  for (const a of argv) {
    if (a === '--self-test') {
      out.selfTest = true;
    } else if (a.startsWith('--guards=')) {
      out.guards = a
        .slice('--guards='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      console.error(`未知参数：${a}`);
      console.error('用法：node scripts/check-cross-client.mjs [--self-test] [--guards=a,b,c]');
      process.exit(1);
    }
  }
  return out;
}

/**
 * 跑一个守卫 ⇒ ⇒ 归成四档：**通过 / 阻断 / 判不了 / 崩了**。
 *
 * ⚠️ 「崩了」归到**判不了**而不是「阻断**——
 *   崩 ⇒ ⇒ 它的读数是「没读到」⇒ ⇒ 「没读到」≠「有问题」。
 */
function runGuard(guard) {
  const res = spawnSync(process.execPath, [guard.path], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  const status = res.status;
  const stderr = res.stderr || '';

  // ⚠️ **「崩了」怎么认**：Node 的未捕获异常退出码是 **1** ⇒ ⇒ 与「闸判红」
  //   **一模一样** ⇒ ⇒ 光看退出码分不出来 ⇒ ⇒ 只能看 stderr 的崩溃签名
  //   （栈帧 / 模块找不到）⇒ ⇒ 这也说明：**每个闸自己**必须把「读不到」写成
  //   退出码 2 ⇒ ⇒ wrapper 只能兜住「崩得很明显」的那一类，救不了「崩得很像红」。
  const crashed =
    !!res.error ||
    status === null ||
    (status !== 0 && status !== 1 && status !== 2) ||
    /\n\s+at\s+(?:[^\n]*\((?:file:|[A-Za-z]:)|file:|[A-Za-z]:)/.test(stderr) ||
    /MODULE_NOT_FOUND|Cannot find module/.test(stderr);

  if (status === 0 && !crashed) return { kind: 'pass' };
  if (status === 1 && !crashed) return { kind: 'fail' };
  if (status === 2 && !crashed) return { kind: 'cannot' };
  return {
    kind: 'cannot',
    crashed: true,
    status: status === null ? 'null' : status,
    reason: res.error
      ? String(res.error.message)
      : '未捕获异常（退出码与判红无法区分 ⇒ ⇒ 靠 stderr 签名认出来）',
  };
}

/** 汇总 ⇒ ⇒ 退出码：**红优先**；没有红但有判不了 ⇒ ⇒ 2。 */
function main(guards, opts = {}) {
  const quiet = opts.quiet === true;
  const say = quiet ? () => {} : (s) => process.stdout.write(s + '\n');
  const warn = quiet ? () => {} : (s) => console.warn(s);
  const err = quiet ? () => {} : (s) => console.error(s);

  say(line);
  say('跨端一致性校验 —— 统一入口');
  say(line);

  let passed = 0;
  let failed = 0;
  let cannot = 0;
  const cannotList = [];
  const crashedList = [];

  for (const g of guards) {
    say('');
    say(`▶ ${g.label}`);
    say(`  （${g.what}）`);
    const r = runGuard(g);
    if (r.kind === 'pass') {
      passed++;
      say(`  ✓ ${g.label} 通过`);
    } else if (r.kind === 'fail') {
      failed++;
      err(`  ✗ ${g.label} 退出码 1 —— 有阻断问题`);
    } else if (r.crashed) {
      cannot++;
      crashedList.push(g.label);
      err(
        `  ! ${g.label} **崩了**（退出码 ${r.status}${r.reason ? '：' + r.reason : ''}）`,
      );
      err('    ⇒ ⇒ 它的读数是「没读到」⇒ ⇒ 记为**判不了**，**不记为「有问题」**');
    } else {
      cannot++;
      cannotList.push(g.label);
      warn(`  ! ${g.label} 判不了（退出码 2）—— 缺它要的输入；这一格没验`);
    }
  }

  const total = guards.length;
  say('');
  say(line);
  if (failed > 0) {
    err(`${failed} / ${total} 个守卫有阻断问题。`);
    say(line);
    return 1;
  }
  if (cannot > 0) {
    const names = cannotList.concat(crashedList).join('、');
    warn(`${passed} / ${total} 个守卫通过，${cannot} 个判不了（${names}）`);
    warn('⇒ ⇒ **这一格没验成**：不是「没问题」，是「没验」⇒ ⇒ 退出码 2');
    say(line);
    return 2;
  }
  say(`全部 ${total} 个守卫通过。`);
  say(line);
  return 0;
}

/**
 * 真自检 —— **用真子进程**注入四种退出码，验证汇总逻辑会红。
 *
 * ⚠️ 为什么不用「恒绿的自检」：只测纯函数 ⇒ ⇒ 证明不了「退出码真能传到
 *   平台那一层」⇒ ⇒ 所以这里真的 spawn 真的脚本。
 */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'shadow-cross-client-'));
  const mk = (name, body) => {
    const p = join(dir, name);
    writeFileSync(p, body, 'utf8');
    return p;
  };

  const ok = mk('ok.mjs', 'process.exit(0);\n');
  const red = mk('red.mjs', 'console.error("注入的阻断");\nprocess.exit(1);\n');
  const cannot = mk('cannot.mjs', 'console.warn("注入的判不了");\nprocess.exit(2);\n');
  const crash = mk('crash.mjs', 'throw new Error("注入的崩溃");\n');
  const missing = join(dir, 'not-here.mjs');

  const g = (p) => ({ label: p.split(/[\\/]/).pop(), script: p, what: '自检注入', path: p });

  const cases = [
    { name: '全绿 ⇒ 退出码 0', guards: [g(ok)], want: 0 },
    { name: '有阻断 ⇒ 退出码 1', guards: [g(ok), g(red)], want: 1 },
    { name: '有判不了 ⇒ 退出码 2（**不是** 0）', guards: [g(ok), g(cannot)], want: 2 },
    { name: '守卫崩了 ⇒ 退出码 2（**不是** 1）', guards: [g(crash)], want: 2 },
    { name: '守卫文件不在 ⇒ 退出码 2（**不是** 0）', guards: [g(missing)], want: 2 },
    { name: '红 ＋ 判不了 ⇒ 退出码 1（红优先）', guards: [g(red), g(cannot)], want: 1 },
  ];

  console.log(line);
  console.log('跨端一致性校验 —— 自检');
  console.log(line);

  let fails = 0;
  for (const c of cases) {
    const got = main(c.guards, { quiet: true });
    const okCase = got === c.want;
    if (!okCase) fails++;
    console.log(`  ${okCase ? '✓' : '✗'} ${c.name}（期望 ${c.want}，实得 ${got}）`);
  }

  console.log(line);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响结论 */
  }
  if (fails === 0) {
    console.log(`✓ 自检全绿（${cases.length} / ${cases.length} 条全绿）`);
    process.exit(0);
  }
  console.error(`✗ 自检 ${fails} / ${cases.length} 条红`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args.selfTest) {
  selfTest();
} else {
  const guards = (args.guards || DEFAULT_GUARDS).map(toGuard);
  const code = main(guards);
  if (code === 2) process.exit(2);
  process.exit(code);
}
