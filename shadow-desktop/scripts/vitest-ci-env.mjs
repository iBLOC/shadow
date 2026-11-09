// ⚠️ **「CI 仿真读数」工具** —— 用 **CI 的运行时形状** 起 vitest。
//
// ⚠️⚠️ **为什么需要它** —— 2026-11-09 真 CI 红过，而本机绿：
// `tests/setup.ts` 原来写成「运行时自带的 localStorage 能用就用、不能用才造一个」。
// ⇒ ⇒ 那个「能用」由**运行时**决定：
// · Node 22+ 开启 `--experimental-webstorage` 时 → 原生对象（本机 Node 25 就在其列）。
// · Node 24（CI 用的）没有原生 localStorage → 落到 jsdom 分支 → jsdom 的 `localStorage` 是 **Proxy**。
// ⇒ ⇒ 屏幕上的形状不同 → 判据读到的东西不同 → 本机绿不代表 CI 绿。
//
// ⇒ ⇒ 本工具把“原生 webstorage ”关掉（`--no-experimental-webstorage`）⇒ ⇒ 本机读到的就是 CI 那一种形状。
//
// 用法：`pnpm test:ci-env` ⇒ ⇒ 等价于 `pnpm exec vitest run`，只多一个环境开关。
//【退出码】0 = 裁判通过（1/2）；1 = 裁判不过（3）；2 = **判不了**（本机 Node 不支持那个开关）。
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const FLAG = '--no-experimental-webstorage';

// ① 这个开关在本机 Node 上可用吗？ 不可用 ⇒ ⇒ 判不了（退出码 2）。
const probe = spawnSync(process.execPath, [FLAG, '-e', '0'], { stdio: 'ignore' });
if (probe.status !== 0) {
  console.error('❌ 本机 Node 不支持 ' + FLAG + ' ⇒ ⇒ 做不了 CI 仿真 ⇒ ⇒ 退出码 2（判不了）');
  process.exit(2);
}

// ② vitest 入口
let vitestBin = '';
try {
  vitestBin = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
} catch {
  console.error('❌ 找不到 vitest ⇒ ⇒ 退出码 2（判不了）');
  process.exit(2);
}

const args = process.argv.slice(2);
const vitestArgs = args.length ? args : ['run'];
const nodeOptions = [process.env.NODE_OPTIONS || '', FLAG].filter(Boolean).join(' ');

console.log('[仿真] 运行时开关：NODE_OPTIONS=' + nodeOptions + ' ⇒ ⇒ 本次读数 = CI 那一种形状');
const res = spawnSync(process.execPath, [vitestBin, ...vitestArgs], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});
process.exit(res.status === null ? 2 : res.status);