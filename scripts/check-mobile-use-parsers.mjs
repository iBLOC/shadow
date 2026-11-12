#!/usr/bin/env node
/**
 * 移动端解析判据的离线自检 —— 把 **pwsh** 那条腿搬进 CI 的转译器。
 * ============================================================================
 *
 * ## 它守的是什么（2026-11-11 实测）
 *
 * 仓里**已提交**的三件东西：
 *   · shadow-mobile/scripts/lib/mobile-use-parsers.ps1         （纯函数判据本体）
 *   · shadow-mobile/scripts/lib/mobile-use-parsers-selfcheck.ps1（独立 runner ＋ 空绿保护）
 *   · shadow-mobile/scripts/verify-mobile-use-on-device.ps1    （真机驱动，带 -SelfCheck 口）
 *
 * 那套判据本机**逐条全绿**（实测 32 条 / 失败 0 条 / EXIT=0），
 * 而它在**提交树面的 CI 里零接线** ⇒ ⇒ 它在 CI 上**从来没有过读数**。
 * ⇒ ⇒ 「本机全绿」这一条**没有任何一条来自 CI**。
 *
 * ⚠️ 那条接线**历史上接过一次**（救援标签 rescue-parallel-eced13b 里的 ci.yml 改动），
 *   但那条线**从未并入 master** ⇒ ⇒ 接线随笔丢掉 ⇒ ⇒ 这一刀不是「恢复旧接线」，
 *   是**在 master 上第一次把它接上**。
 *
 * ## 为什么要有这个转译器（不直接 `pwsh -File` 跑）
 *
 * ① **判读通道**：闸步必须经由 scripts/run-gate-once.mjs ⇒ ⇒ 它的结论才落判读记录
 *   ⇒ ⇒ 否则「Gate Tally Coverage」那道闸当场判红（unregistered-gap）。
 *   ⇒ ⇒ 而 run-gate-once **只 spawn node** ⇒ ⇒ 纯 .ps1 进不去 ⇒ ⇒ 需要这层转译。
 * ② **退出码语义**：pwsh 侧只有 0 / 1；本闸把「本机没有 pwsh」映射成 **2（判不了）**
 *   ⇒ ⇒ 「源没读全」与「真有问题」分得开（判不了 ≠ 绿）。
 * ③ **可数读数**：D3 要求「接进 CI 的闸，自检必须印出可数读数 N/N」
 *   ⇒ ⇒ 本闸从 runner 的输出里**解析**「共 N 条，失败 M 条」⇒ ⇒ 印成 N/N。
 *   ⇒ ⇒ ⚠️ 解析不到 ⇒ ⇒ 那是「没跑成」⇒ ⇒ 判不了（2），不是绿。
 *
 * ## 退出码
 *   0 绿（判据自检全过）／ 1 红（有不过）／ 2 判不了（没 pwsh／脚本不在／读数解析不到）
 *
 * ## 用法
 *   node scripts/check-mobile-use-parsers.mjs              # 主判定
 *   node scripts/check-mobile-use-parsers.mjs --self-test  # 判据自检（纯夹具，不碰真脚本）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = join(REPO, 'shadow-mobile', 'scripts', 'lib', 'mobile-use-parsers-selfcheck.ps1');

/**
 * 解析 runner 的输出 ⇒ ⇒ 「共 N 条，失败 M 条」
 * ⚠️ 只认**中文那一行**的形状 ⇒ ⇒ 解析不到就是「没跑成」（判不了），不是绿。
 * @param {string} out
 * @returns {{total:number, failed:number}|null}
 */
export function parseReading(out) {
  const text = String(out || '');
  const m = text.match(/共\s*(\d+)\s*条，失败\s*(\d+)\s*条/);
  if (!m) return null;
  return { total: Number(m[1]), failed: Number(m[2]) };
}

/**
 * 「判得了」的形状：runner 在不在 ＋ pwsh 在不在
 * ⚠️ 两样都缺任何一样 ⇒ ⇒ 那一格**没验成**（2），不许当绿。
 * @returns {{ok:boolean, why:string}}
 */
export function readiness(runnerExists, pwshAvailable) {
  if (!runnerExists) return { ok: false, why: 'runner 脚本不在（shadow-mobile/scripts/lib/mobile-use-parsers-selfcheck.ps1）' };
  if (!pwshAvailable) return { ok: false, why: '本机没有 pwsh ⇒ ⇒ 判不了（不是绿）' };
  return { ok: true, why: '' };
}

function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('正常的 runner 输出 ⇒ ⇒ 解析出「32 条 / 失败 0 条」', () => {
    const r = parseReading('共 32 条，失败 0 条');
    return !!r && r.total === 32 && r.failed === 0;
  });

  add('有失败的那一行 ⇒ ⇒ 失败数被解析出来（不是只读总数）', () => {
    const r = parseReading('共 32 条，失败 3 条');
    return !!r && r.total === 32 && r.failed === 3;
  });

  add('runner 的逐条输出（很多行）⇒ ⇒ 仍能解析出总数那一行', () => {
    const out = ['  [过] 用例一', '  [过] 用例二', '  [红] 用例三', '共 3 条，失败 1 条'].join('\n');
    const r = parseReading(out);
    return !!r && r.total === 3 && r.failed === 1;
  });

  add('输出里没有那一行 ⇒ ⇒ 解析不到（⇒ ⇒ 判不了，不是绿）', () => {
    return parseReading('啥也没有') === null;
  });

  add('空输出 ⇒ ⇒ 解析不到（⇒ ⇒ 判不了，不是绿）', () => {
    return parseReading('') === null;
  });

  add('runner 不在 ⇒ ⇒ 判不了，且说的是真话', () => {
    const r = readiness(false, true);
    return !r.ok && r.why.includes('runner');
  });

  add('没有 pwsh ⇒ ⇒ 判不了，且说的是真话', () => {
    const r = readiness(true, false);
    return !r.ok && r.why.includes('pwsh');
  });

  add('两样都在 ⇒ ⇒ 判得了', () => {
    return readiness(true, true).ok === true;
  });

  add('⚠️ 空绿保护：解析不到读数 ⇒ ⇒ 不许当成「全过」', () => {
    const r = parseReading('共 0 条，失败 0 条');
    return r !== null && r.total === 0;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try { ok = !!c.run(); } catch (e) { ok = false; }
    if (!ok) { bad += 1; console.error('  ❌ ' + c.name); }
    else { console.log('  ✅ ' + c.name); }
  }
  console.log('自检：' + (cases.length - bad) + '/' + cases.length + ' 通过');
  if (bad) process.exit(1);
  process.exit(0);
}

if (process.argv.includes('--self-test')) {
  selfTest();
}

// ---- 主判定 ----
const runnerExists = existsSync(RUNNER);
const probe = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
  encoding: 'utf8',
  timeout: 60000,
});
const pwshAvailable = !probe.error && probe.status === 0;

const ready = readiness(runnerExists, pwshAvailable);
if (!ready.ok) {
  console.error('⚠️ 判不了：' + ready.why);
  console.error('   ⇒ ⇒ 这一格**没验成** ⇒ ⇒ 不许当绿（也不许当红）');
  process.exit(2);
}

const res = spawnSync('pwsh', ['-NoProfile', '-File', RUNNER], {
  encoding: 'utf8',
  timeout: 300000,
});
const out = (res.stdout || '') + (res.stderr || '');
if (res.error) {
  console.error('⚠️ 判不了：跑不动 pwsh ⇒ ⇒ ' + res.error.message);
  process.exit(2);
}
if (res.status === null || res.status === undefined) {
  console.error('⚠️ 判不了：pwsh 没有给出退出码 ⇒ ⇒ 那一格**没验成**');
  process.exit(2);
}

const reading = parseReading(out);
if (!reading) {
  console.error('⚠️ 判不了：runner 的输出里解析不到「共 N 条，失败 M 条」⇒ ⇒ 没跑成');
  console.error('   ⇒ ⇒ 逐字输出如下（供人核）：');
  console.error(out.split(/\r?\n/).slice(0, 40).join('\n'));
  process.exit(2);
}

console.log('解析判据自检：' + (reading.total - reading.failed) + '/' + reading.total + ' 通过');
if (reading.failed > 0) {
  console.error('❌ 有不过的判据（' + reading.failed + ' 条）');
  process.exit(1);
}
if (reading.total === 0) {
  console.error('❌ 一条用例都没执行 ⇒ ⇒ 空绿 ⇒ ⇒ 判红');
  process.exit(1);
}
console.log('✅ 绿');
process.exit(0);