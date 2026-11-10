#!/usr/bin/env node
/**
 * 跑**一道**闸，并区分三档：**绿 / 红 / 判不了**。
 * ============================================================================
 *
 * ## 为什么需要它
 *
 * 「把闸接进 CI」这件事有个**陷阱**：闸的退出码 2 = **「判不了」**
 * （源没读全：缺工具链、缺兄弟仓、缺产物）⇒ ⇒ 而 GitHub Actions 里
 * **任何非零退出码都让步骤失败**⇒ ⇒ 「判不了」会伪装成「有问题」
 * ⇒ ⇒ 闸一接就把 CI 拖红 ⇒ ⇒ 于是大家就不敢接 ⇒ ⇒ 「有闸但没人跑」永远在。
 *
 * ⇒ ⇒ 这里把那一档**显式转译**：
 *   · 退出码 **0** ⇒ 绿 ⇒ 原样放行；
 *   · 退出码 **2** ⇒ **判不了** ⇒ 打印一条显眼的话（⚠️ 这一格**没验成**）
 *     ⇒ ⇒ **不当红**（它不是「有问题」）⇒ ⇒ 但也**不当绿**（它不是「没问题」）；
 *   · 退出码 **1**（或其它）⇒ **红** ⇒ 原样阻断。
 *
 * ## 两种口径（**语义不许被悄悄改掉**）
 *
 * · **默认**（新接的闸用它）：退出码 2 ⇒ 「显眼但不阻断」。
 * · **`--strict`**（把**已经在跑**的闸改走跑批器时用它）：
 *   闸的退出码**原样透传**（2 仍然阻断）⇒ ⇒ 但**仍然落判读记录**。
 *   ⇒ ⇒ **这一档的意义是「语义不变，只加记录」**⇒ ⇒
 *   ⇒ ⇒ 改接线时**不会**把一道「红/判不了都阻断」的闸悄悄变成「不阻断」。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/run-gate-once.mjs scripts/check-xxx.mjs
 * node scripts/run-gate-once.mjs --strict scripts/check-xxx.mjs
 * node scripts/run-gate-once.mjs --strict scripts/gen_tokens.mjs -- --check
 * ```
 *
 * 闸自己的参数写在「`--`」之后（原样透传）⇒ ⇒ 不会与跑批器自己的参数混淆。
 *
 * 退出码：**0 绿 / 1 红**（判不了那一档已被转成 0 ＋ 显眼提示）；
 * 带 `--strict` 时 ⇒ ⇒ **原样透传闸的退出码**。
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRunnerArgs, resolveTarget, resultLine, verdictFor } from './lib/gate-runner.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);

if (argv.includes('--self-test')) {
  // 判据自检住在 lib 里（纯函数 ⇒ ⇒ 能喂合成夹具）⇒ ⇒ 这里只是转个手。
  const res = spawnSync(process.execPath, [join(REPO, 'scripts', 'lib', 'gate-runner.mjs'), '--self-test'], {
    stdio: 'inherit',
  });
  process.exit(res.status === null ? 2 : res.status);
}

const opts = parseRunnerArgs(argv);

if (opts.errors.length > 0) {
  for (const e of opts.errors) console.error('❌ ' + e);
  console.error('用法：node scripts/run-gate-once.mjs [--strict] [--file=<路径>] <闸脚本> [-- <闸自己的参数>]');
  process.exit(2);
}

if (!opts.target) {
  console.error('用法：node scripts/run-gate-once.mjs [--strict] [--file=<路径>] <闸脚本> [-- <闸自己的参数>]');
  process.exit(2);
}

// ⚠️ **目标按「调用者 cwd」解析**（不是按跑批器所在的仓）⇒ ⇒
//    脑侧那个 job 把仓检在 `shadow/` 子目录里 ⇒ ⇒ 那边写
//    `node shadow/scripts/run-gate-once.mjs shadow/scripts/check-x.mjs` 才找得到。
const scriptPath = resolveTarget(opts.target, process.cwd(), REPO);

const res = spawnSync(process.execPath, [scriptPath, ...opts.args], {
  // ⚠️ **cwd 保持调用者的 cwd** ⇒ ⇒ 闸读到的相对路径与「直跑」时**逐字一样**
  // ⇒ ⇒ 改接线**不会**改变闸看到的目录布局。
  cwd: process.cwd(),
  stdio: 'inherit',
});

const code = res.status === null || res.status === undefined ? 2 : res.status;

// ⚠️ **workflow 层的「绿灯不带分母」** —— 2026-11-11 真 CI 实测（run 42717285106）：
//    「Unwired Gates」＝ **success**，而那 15 道闸里 **8 道是「判不了」**
//    （跨仓闸：兄弟仓没检出 ⇒ ⇒ 读不到判据源）⇒ ⇒ 「绿」把「没验成」一起吞了
//    ⇒ ⇒ 这里把每道闸的结论**落一行机器可读**，收尾一步由 scripts/lib/gate-tally.mjs
//    汇总成「真判 N ｜ 判不了 K ｜ 红 M」⇒ ⇒ 绿灯从此有分母。
// ⚠️ 2026-11-11：**--strict 那一档也落记录** ⇒ ⇒ 因为「分母要覆盖所有真跑的闸」
//    ⇒ ⇒ 而「直跑的闸」改走跑批器时用的是 --strict ⇒ ⇒ 它们也必须落判读。
const resultFile = opts.file || process.env.GATE_RESULT_FILE;
if (resultFile) {
  const verdict = verdictFor(code);
  const line = resultLine(opts.target, code, verdict);
  try {
    appendFileSync(resultFile, line, 'utf8');
  } catch (err) {
    console.error('（写闸判读记录失败：' + err.message + '）');
  }
  console.log('⇒ ⇒ ' + line.trim());
}

if (code === 0) {
  console.log('⇒ ⇒ ✅ 绿');
  process.exit(0);
}
if (code === 2) {
  console.log('');
  console.log('⇒ ⇒ ⚠️ **判不了**（闸的退出码 2）：这一格**没验成**');
  console.log('   ⇒ ⇒ 它**不是**「有问题」（所以不当红）⇒ ⇒ 但它也**不是**「没问题」');
  console.log('   ⇒ ⇒ 缺口要留在视野里 —— 别把「判不了」读成「绿」。');
  if (opts.strict) {
    console.log('   ⇒ ⇒ ⚙️ **--strict**：退出码**原样透传** ⇒ ⇒ 2 仍然**阻断**（语义不变，只加记录）。');
    process.exit(2);
  }
  process.exit(0);
}
console.error('⇒ ⇒ ✗ 红（退出码 ' + code + '）');
process.exit(code);
