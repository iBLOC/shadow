#!/usr/bin/env node
/**
 * 跑**一道**闸，并区分三档：**绿 / 红 / 判不了**。
 * ============================================================================
 *
 * ## 为什么需要它
 *
 * 「把闸接进 CI」这件事有个**陷阱**：闸的退出码 2 = **「判不了」**
 * （源没读全：缺工具链、缺兄弟仓、缺产物）⇒ ⇒ 而 GitHub Actions 里
 * **任何非零退出码都让步骤失败** ⇒ ⇒ 「判不了」会伪装成「有问题」
 * ⇒ ⇒ 闸一接就把 CI 拖红 ⇒ ⇒ 于是大家就不敢接 ⇒ ⇒ 「有闸但没人跑」永远在。
 *
 * ⇒ ⇒ 这里把那一档**显式转译**：
 *   · 退出码 **0** ⇒ 绿 ⇒ 原样放行；
 *   · 退出码 **2** ⇒ **判不了** ⇒ 打印一条显眼的话（⚠️ 这一格**没验成**）
 *     ⇒ ⇒ **不当红**（它不是「有问题」）⇒ ⇒ 但也**不当绿**（它不是「没问题」）；
 *   · 退出码 **1**（或其它）⇒ **红** ⇒ 原样阻断。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/run-gate-once.mjs scripts/check-xxx.mjs
 * ```
 *
 * 退出码：**0 绿 / 1 红**（判不了那一档已被转成 0 ＋ 显眼提示）。
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const target = process.argv[2];
if (!target) {
  console.error('用法：node scripts/run-gate-once.mjs scripts/check-xxx.mjs');
  process.exit(2);
}

const res = spawnSync(process.execPath, [join(REPO, target)], {
  cwd: REPO,
  stdio: 'inherit',
});

const code = res.status === null || res.status === undefined ? 2 : res.status;

// ⚠️ **workflow 层的「绿灯不带分母」** —— 2026-11-11 真 CI 实测（run 42717285106）：
//    「Unwired Gates」＝ **success**，而那 15 道闸里 **8 道是「判不了」**
//    （跨仓闸：兄弟仓没检出 ⇒ ⇒ 读不到判据源）⇒ ⇒ 「绿」把「没验成」一起吞了
//    ⇒ ⇒ 这里把每道闸的结论**落一行机器可读**，收尾一步由 scripts/lib/gate-tally.mjs
//    汇总成「真判 N ｜ 判不了 K ｜ 红 M」⇒ ⇒ 绿灯从此有分母。
if (process.env.GATE_RESULT_FILE) {
  const verdict = code === 0 ? 'ok' : code === 2 ? 'cannot-judge' : 'red';
  const line = ['GATE_RESULT', target, String(code), verdict].join('\t') + '\n';
  try {
    appendFileSync(process.env.GATE_RESULT_FILE, line, 'utf8');
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
  process.exit(0);
}
console.error('⇒ ⇒ ✗ 红（退出码 ' + code + '）');
process.exit(code);
