#!/usr/bin/env node
/**
 * **提交面回退闸** —— 「后一个提交把前一个提交的增量悄悄退掉了」。
 * ============================================================================
 *
 * ## 它守什么
 *
 * ⚠️ **2026-11-09 真机实测（本仓 iBLOC/shadow，head d36bb09 一带）**：
 *   · 共享工作树 ＋ 并发「独立索引提交」⇒ ⇒ 两个会话各自构造自己的提交面
 *     ⇒ ⇒ **后一个的基线可能落后** ⇒ ⇒ 它写出来的文件内容会把**前一个提交
 *     的改动整段退掉**；
 *   · 实测：`afb7814` 把 `21f56d4`（TS7006 的类型补法）**退回旧版**
 *     ⇒ ⇒ 那条判据在真 CI 上红了（run 42646242924）⇒ ⇒ 表现是「类型闸红了」，
 *     **看起来像产品回归，其实是一次静悄悄的提交面回退**。
 *
 * ⇒ ⇒ 这一族失败**极难归因**（CI 只说「哪一行红了」，不说「谁把它退掉了」）
 * ⇒ ⇒ 本闸把这件事变成**可数的读数**：谁、在哪个文件上、把谁的增量退掉了。
 *
 * ## 判红的红线（**判红**）
 *
 *   **R1 · 完全回退** —— 提交 B 把文件 F 的内容整个还原到了 A 改动之前
 *     （B 的结果 == A^ 的版本）⇒ ⇒ A 的增量**一条不剩地被丢弃**。
 *   **R1b · 抹空** —— 提交 B 把文件 F 写成**零字节** ⇒ ⇒ 整个内容没了。
 *     ⚠️ 这一类**补在 2026-11-11**，而且**补在闸自己身上**：本会话自己造成过
 *       一次事故（台账 AGENTS.md 被提交成零字节）⇒ ⇒ 闸当时把它判成「部分回退」
 *       ⇒ ⇒ **没抓住** ⇒ ⇒ 而「变成空」**不等于** A^ ⇒ ⇒ **判红条件写窄了，
 *       就有一类事故从缝里掉过去** ⇒ ⇒ 这一类的破坏力**比完全回退更大**。
 *
 *   **R1c · 倒回** —— 提交 B 把 A 的**整个增量**原样倒回（A 加的行全被删、A 删的行原字加回），
 *     而 B **夹带了自己的改动** ⇒ ⇒ 文件因此**没有**回到 A 之前 ⇒ ⇒ R1 的判据看不见它
 *     ⇒ ⇒ 它掉进「部分回退」的提示层 ⇒ ⇒ ⇒ **A 的整个增量被悄悄丢弃，闸却报「零静悄悄回退」**。
 *     ⚠️ 这一类**补在 2026-11-11**：真样本 `c62f500` 把 `639a556` 的 5 行原样倒回并夹带自己的 5 行
 *       —— 事件**真发生过**（那 5 行后来由 `605dc6a`／`869a10a` 恢复）。
 *
 * ⚠️ **「部分回退」不判红**（它降级为提示层）—— 实测它在正常演进里极常见
 *   （改一行代码、改一行断言、重排一份词表）⇒ ⇒ 判红 ⇒ ⇒ 闸就恒红 ⇒ ⇒ 没人看。
 *
 * ## 放行
 *
 *   · **有意的 revert**（`git revert` 生成的提交信息里有 This reverts commit）
 *     ⇒ ⇒ 放行（并在读数里点名「有意回退 N 处」）—— 回退是合法动作，
 *     **静悄悄**的回退才是病。
 *   · 「新增文件后又删掉」⇒ ⇒ 不算（那是删文件，不是回退别人的增量）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-commit-revert.mjs
 * node scripts/check-commit-revert.mjs --self-test
 * node scripts/check-commit-revert.mjs --rev=origin/master --limit=60
 * node scripts/check-commit-revert.mjs --json
 * ```
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { scanReverts } from './lib/commit-revert-scan.mjs';
import { declaresRevert, isRegistered, shouldFail } from './lib/commit-revert.mjs';
import { REGISTERED_REVERTS } from './lib/commit-revert-registry.mjs';
import { runSelfTest } from './lib/commit-revert-selftest.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function makeGit() {
  return (args) => {
    try {
      const out = execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + '', err: String(e.stderr || e.message) };
    }
  };
}

/** 档位的中文名 —— 读数里逐字点名用（三档共用一份 ⇒ ⇒ 不会两处写岔）。 */
function kindLabel(kind) {
  if (kind === 'wiped') return '抹空';
  if (kind === 'inverted') return '倒回';
  return '完全回退';
}

function parseArgs(argv) {
  const opts = { selfTest: false, json: false, limit: 40, rev: '' };
  for (const a of argv) {
    if (a === '--self-test') opts.selfTest = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--limit=')) opts.limit = Number(a.slice(8)) || 40;
    else if (a.startsWith('--rev=')) opts.rev = a.slice(6);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.selfTest) {
    const r = runSelfTest();
    for (const c of r.cases) {
      console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + ' —— ' + c.detail);
    }
    console.log('');
    console.log('判据自检：' + r.passed + '/' + r.total + ' 通过');
    process.exit(r.passed === r.total ? 0 : 1);
  }

  const git = makeGit();
  let rev = opts.rev;
  if (!rev) {
    const has = git(['rev-parse', '--verify', 'origin/master']);
    rev = has.ok ? 'origin/master' : 'HEAD';
  }
  const res = scanReverts(git, { rev, limit: opts.limit });
  // ⚠️ **判红只给「完全回退 且 没有声明」** ⇒ ⇒ 部分回退与已声明的回退都只作提示。
  const hard = res.events.filter((e) => shouldFail(e, REGISTERED_REVERTS));
  // ⚠️ **三档都算「硬回退」** —— 完全回退 ＋ **抹空** ＋ **倒回** ⇒ ⇒ 判红与放行的分层一样。
  const HARD_KINDS = new Set(['full', 'wiped', 'inverted']);
  const fullDeclared = res.events.filter((e) => HARD_KINDS.has(e.kind) && declaresRevert(e.message));
  const fullRegistered = res.events.filter((e) =>
    HARD_KINDS.has(e.kind) && !declaresRevert(e.message) && isRegistered(REGISTERED_REVERTS, e.commit, e.file));
  const partial = res.events.filter((e) => e.kind === 'partial');
  // ⚠️ **判不了**（退出码 2）：git 读不出来、或**历史没读全**（浅克隆）
  //   ⇒ ⇒ 「零回退」在那种情形下是**假象** ⇒ ⇒ 不许伪装成绿。
  const cannotJudge = res.notes || [];

  if (opts.json) {
    console.log(JSON.stringify({ rev, scanned: res.commits.length, total: res.total, hard, fullDeclared, fullRegistered, partial, notes: cannotJudge }, null, 2));
    process.exit(hard.length > 0 ? 1 : 0);
  }

  console.log('提交面回退闸：扫 ' + res.commits.length + ' 个提交（' + rev + ' 最近 ' + opts.limit + '）');
  const hardFull = hard.filter((e) => e.kind === 'full').length;
  const hardWiped = hard.filter((e) => e.kind === 'wiped').length;
  const hardInv = hard.filter((e) => e.kind === 'inverted').length;
  console.log('  回退事件 ' + res.events.length + ' 处（判红：静悄悄的回退 ' + hard.length +
    '（完全回退 ' + hardFull + ' ｜ 抹空 ' + hardWiped + ' ｜ 倒回 ' + hardInv + '）' +
    ' ｜ 放行：已声明 ' + fullDeclared.length +
    ' ｜ 登记在册 ' + fullRegistered.length +
    ' ｜ 提示：部分回退 ' + partial.length + '）');
  for (const e of hard) {
    console.log('');
    const what = e.kind === 'wiped'
      ? '静悄悄的**抹空**（把文件整个写成零字节）'
      : e.kind === 'inverted'
        ? '静悄悄的**倒回**（把别人的整个增量原样倒回，还夹带了自己的改动）'
        : '静悄悄的完全回退';
    console.log('❌ [R1] ' + what + '：' + e.commit.slice(0, 7) + ' 在 ' + e.file + ' 上' +
      (e.kind === 'wiped'
        ? ' 把 ' + e.reverted.slice(0, 7) + ' 写进去的内容整个抹空了'
        : e.kind === 'inverted'
          ? ' 把 ' + e.reverted.slice(0, 7) + ' 的整个增量原样倒回了（并夹带了自己的改动）'
          : ' 把 ' + e.reverted.slice(0, 7) + ' 的增量整个退掉了'));
    console.log('    被退掉的提交：' + e.reverted);
    console.log('    退它的提交：' + e.commit);
    if (e.kind === 'inverted' && e.lines && e.lines.length) {
      console.log('    被倒回的行数：' + e.lines.length + ' 行（它的增量一条不剩）');
    }
    const first = (e.message || '').split('\n')[0];
    if (first) console.log('    该提交信息首行（**没有**声明这次回退）：' + first);
  }
  for (const e of fullDeclared) {
    console.log('  ✅ 已声明的' + kindLabel(e.kind) + '（放行）：' + e.commit.slice(0, 7) + ' × ' + e.file);
  }
  for (const e of fullRegistered) {
    console.log('  📌 登记在册的' + kindLabel(e.kind) + '（放行，但要说得出为什么）：' + e.commit.slice(0, 7) + ' × ' + e.file);
  }
  if (partial.length) {
    console.log('');
    console.log('  ⚠ 部分回退 ' + partial.length + ' 处（**只提示不判红** —— 正常演进里改一行也会命中）：');
    for (const e of partial.slice(0, 5)) {
      console.log('    · ' + e.commit.slice(0, 7) + ' 撤了 ' + e.reverted.slice(0, 7) + ' 在 ' + e.file + ' 上的若干行' +
        (declaresRevert(e.message) ? '（已声明回退）' : '（未声明）'));
    }
    if (partial.length > 5) console.log('    … 另有 ' + (partial.length - 5) + ' 处');
  }
  for (const n of cannotJudge) {
    console.log('');
    console.log('⚠ [判不了] ' + n);
  }
  console.log('');
  if (cannotJudge.length > 0) {
    // ⚠️⚠️ **判不了的时候不许同时印「绿」** —— 那是「失败长得像成功」的边角：
    //   人只看最后一眼 ⇒ ⇒ 一句「✅ 零静悄悄回退」会把退出码 2 盖过去。
    console.log('⚠ 这一格**判不了** ⇒ ⇒ 上面的「零回退」**不作数**（不是「没问题」）');
  } else if (hard.length === 0) {
    console.log('✅ 零静悄悄回退（扫过的 ' + res.commits.length + ' 个提交里，没有一次把别人的增量悄悄整个退掉）');
  }
  // ⚠️ **红优先于「判不了」** —— 有实打实的回退 ⇒ 先说红；判不了只在下没有红时成立。
  if (hard.length > 0) process.exit(1);
  if (cannotJudge.length > 0) process.exit(2);
  process.exit(0);
}

main();