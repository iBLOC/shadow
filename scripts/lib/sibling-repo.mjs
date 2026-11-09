/**
 * 兄弟仓定位 —— **两种布局都要认**（2026-11-11 真 CI 实测：run 42718647744）
 *
 * ⚠️ **为什么需要它**：本仓至少 10 道闸的判据源在**兄弟仓**（端脑 / 大脑 /
 *   海马体 / neuron）⇒ ⇒ 而「兄弟仓在哪儿」有**两种布局**：
 *   · A（本机）：兄弟仓在 shadow 仓**之外** —— `../telencephalon`
 *   · B（CI）：兄弟仓被 checkout 到 shadow 仓**根之下** —— `telencephalon/`
 *
 * ⚠️ **只认 A 的代价（真 CI 实测）**：CI 上兄弟仓**检出成功**
 *   （`Checkout telencephalon` ＝ success、token 在位）⇒ ⇒ 但那 15 道闸里
 *   **11 道报「判不了」** ⇒ ⇒ 根因**不是 secret、不是判据，而是布局层**
 *   ⇒ ⇒ 真判只剩 4 道 ⇒ ⇒ 一盏绿灯，**分母是 4/15**。
 *
 * ⚠️ **顺序很重要**：**仓外优先** ⇒ ⇒ 本机（A）布局下行为**逐字不变**
 *   ⇒ ⇒ 这一刀不改变任何本机读数，只在 CI（B）布局下多认一条路。
 *
 * ⚠️ **判据抽成纯函数**（零 I/O 靠注入 `exists`）⇒ ⇒ 自检喂合成夹具，
 *   不需要真把兄弟仓摆出来 ⇒ ⇒ 自检不会恒绿（承 U+34BB 条那把刀）。
 *
 * 用法：import { sibling, siblingRoot, findSibling } from './lib/sibling-repo.mjs';
 *
 *       const src = sibling(REPO, 'telencephalon');
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本仓根（scripts/lib/ 上两级）。 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 候选布局，**顺序即优先级**：仓外（本机）→ 仓内（CI checkout）。
 * 纯函数：只拼路径，不碰磁盘。
 */
export function siblingCandidates(repoRoot, name) {
  return [
    { layout: 'outside', path: resolve(repoRoot, '..', name) },
    { layout: 'inside', path: join(repoRoot, name) },
  ];
}

/**
 * 找出命中的候选 ⇒ ⇒ 找不到返回 null（**不猜、不抛**）。
 * `exists` 可注入 ⇒ ⇒ 自检用合成夹具，零 I/O。
 */
export function findSibling(repoRoot, name, exists = existsSync) {
  for (const c of siblingCandidates(repoRoot, name)) {
    if (exists(c.path)) return c;
  }
  return null;
}

/**
 * 兄弟仓路径 ⇒ ⇒ 命中则返回命中路径；**一个都没命中**时返回仓内路径
 * （与既有先例 check-door-policy.mjs / check-ziti-face.mjs 同款：
 *   闸自己会因「读不到源」报 exit 2「判不了」⇒ ⇒ 这里**不假装它存在**）。
 */
export function sibling(repoRoot, name, exists = existsSync) {
  const hit = findSibling(repoRoot, name, exists);
  return hit ? hit.path : join(repoRoot, name);
}

/**
 * 「一堆兄弟仓的父目录」⇒ ⇒ 仓外布局下是 `../`，仓内布局下是仓根。
 * （bind-exposure 的 lobesRoot / publish-address 的 root 用它）
 */
export function siblingRoot(repoRoot, exists = existsSync) {
  return exists(resolve(repoRoot, '..')) ? resolve(repoRoot, '..') : repoRoot;
}

// ---------------------------------------------------------------------------
// 自检 —— 纯函数夹具（注入 exists），零 I/O、零兄弟仓依赖。
// ---------------------------------------------------------------------------

function selfTest() {
  let total = 0;
  let failed = 0;
  const check = (name, cond) => {
    total += 1;
    if (!cond) failed += 1;
    console.log((cond ? '  [PASS] ' : '  [FAIL] ') + name);
  };

  const R = '/w/shadow';
  const OUT = resolve(R, '..', 'telencephalon');
  const IN = join(R, 'telencephalon');
  const only = (...hits) => (p) => hits.includes(p);

  // ① 候选顺序：仓外优先（⇒ ⇒ 本机行为逐字不变）
  const cs = siblingCandidates(R, 'telencephalon');
  check('候选是两份且**仓外在先**', cs.length === 2 && cs[0].layout === 'outside' && cs[1].layout === 'inside');
  check('候选路径 = 仓外/仓内各一', cs[0].path === OUT && cs[1].path === IN);

  // ② 只有仓外命中 ⇒ ⇒ 布局 A
  check('仓外命中 ⇒ ⇒ 取仓外', findSibling(R, 'telencephalon', only(OUT)).path === OUT);
  check('仓外命中 ⇒ ⇒ 布局标成 outside', findSibling(R, 'telencephalon', only(OUT)).layout === 'outside');

  // ③ 只有仓内命中 ⇒ ⇒ 布局 B（CI）
  check('仓内命中 ⇒ ⇒ 取仓内', findSibling(R, 'telencephalon', only(IN)).path === IN);
  check('仓内命中 ⇒ ⇒ 布局标成 inside', findSibling(R, 'telencephalon', only(IN)).layout === 'inside');

  // ④ 两边都在 ⇒ ⇒ 仓外优先（与既有先例同款）
  const both = findSibling(R, 'telencephalon', only(OUT, IN));
  check('两边都在 ⇒ ⇒ 仓外优先', both.path === OUT && both.layout === 'outside');

  // ⑤ 两边都不在 ⇒ ⇒ findSibling 返回 null（**不猜**）
  check('两边都不在 ⇒ ⇒ 返回 null', findSibling(R, 'telencephalon', only()) === null);

  // ⑥ 兜底：sibling() 找不到时返回仓内路径（闸随后自己报「判不了」）
  check('sibling() 兜底返回仓内路径（不抛）', sibling(R, 'telencephalon', only()) === IN);
  check('sibling() 命中时返回命中路径', sibling(R, 'telencephalon', only(IN)) === IN);

  // ⑦ 纯函数性：同一夹具两次调用结果相同（⇒ ⇒ 量的是输入不是磁盘）
  check('纯函数 ⇒ ⇒ 两次调用同结果', sibling(R, 'telencephalon', only(IN)) === sibling(R, 'telencephalon', only(IN)));

  // ⑧ siblingRoot：仓外有东西 ⇒ ⇒ 兄弟仓的父目录是仓外；否则是仓根
  check('siblingRoot：仓外存在 ⇒ ⇒ 取仓外', siblingRoot(R, only(resolve(R, '..'))) === resolve(R, '..'));
  check('siblingRoot：仓外不存在 ⇒ ⇒ 取仓根', siblingRoot(R, only()) === R);

  // ⑨ 多仓互不干扰（端脑在仓内 ⇒ ⇒ 海马体在仓外，各取各的）
  const H_OUT = resolve(R, '..', 'hippocampus');
  check('多仓 ⇒ ⇒ 各自独立命中', sibling(R, 'telencephalon', only(IN)) === IN && sibling(R, 'hippocampus', only(H_OUT)) === H_OUT);

  console.log('判据自检：' + (total - failed) + '/' + total);
  if (failed > 0) {
    console.error('❌ 自检失败：' + failed + ' 条');
    process.exit(1);
  }
  console.log('✅ 自检通过');
}

if (process.argv[1] && process.argv[1].endsWith('sibling-repo.mjs') && process.argv.includes('--self-test')) {
  selfTest();
}
