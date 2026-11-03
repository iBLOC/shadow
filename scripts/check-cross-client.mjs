#!/usr/bin/env node
/**
 * 跨端一致性校验 —— **统一入口**
 *
 * 为什么要有这个：
 * 跨端一致性的守卫不止一个，各自守一件事。分开跑，CI 很容易只跑其中一个
 * ⇒ 另一个守卫等于不存在（这正是「客户端工具两端不一致」能活这么久的原因）。
 *
 * 这里把每个守卫**当子进程跑一遍**，汇总退出码：
 *   - 任何一个阻断 ⇒ 整体非 0
 *   - 提示（warning）不阻断，但**会打印出来** —— 缺口要留在视野里
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
 *
 * 用法：
 *   node scripts/check-cross-client.mjs
 *
 * 退出码 0 = 全部通过；1 = 有阻断问题。
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GUARDS = [
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
];

const line = '═'.repeat(72);
console.log(line);
console.log('跨端一致性校验 —— 统一入口');
console.log(line);

let failed = 0;

for (const guard of GUARDS) {
  console.log('');
  console.log(`▶ ${guard.script}`);
  console.log(`  （${guard.what}）`);

  const res = spawnSync(process.execPath, [join(ROOT, guard.script)], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  if (res.status !== 0) {
    failed++;
    console.error(`  ✗ ${guard.script} 退出码 ${res.status}`);
  }
}

console.log('');
console.log(line);
if (failed === 0) {
  console.log(`全部 ${GUARDS.length} 个守卫通过。`);
} else {
  console.error(`${failed} / ${GUARDS.length} 个守卫有阻断问题。`);
}
console.log(line);

process.exit(failed > 0 ? 1 : 0);
