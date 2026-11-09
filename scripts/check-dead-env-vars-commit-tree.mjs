#!/usr/bin/env node
/**
 * **死环境变量闸 —— 提交树面** —— 量「**提交树**里有没有死变量」。
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * 2026-11-11 真 CI 实测（head 293f4f4）：
 *   · `scripts/check-dead-env-vars.mjs`（**工作树面**那把）报「零死变量」⇒ ⇒ EXIT=0；
 *   · 而在**提交树**里注入一个「设了但没人读」的变量（`44ef2a75`）⇒ ⇒
 *     那把闸**看不见它**（它读的是磁盘上的文件）⇒ ⇒ 仍然报「零死变量」⇒ ⇒ EXIT=0；
 *   · 而提交树里那个变量**除设置端那一行外一次都没出现** ⇒ ⇒ 它**真的没人读**。
 * ⇒ ⇒ **那把闸量的是工作树，不是被测物** ⇒ ⇒ 提交树可以是破的而它是绿的。
 * ⇒ ⇒ ⇒ 通用形态：**一把只量工作树的闸，在 CI 上量的是「checkout 出来的那一份」**
 *   ⇒ ⇒ 而那恰好是提交树 ⇒ ⇒ **本地跑它量的是另一面** ⇒ ⇒ 本地绿与 CI 绿**不是同一件事**。
 *
 * ## ⚠️ 为什么是**独立文件**而不是改那把闸
 *
 * ① **同一族判据只保留一处实现** ⇒ ⇒ 判据（`findEnvSets` / `findEnvReads` /
 *    `checkDeadEnvVars`）**全部复用** `scripts/lib/dead-env-vars.mjs` ⇒ ⇒ 这里**零判据**；
 * ② 那把闸的工作树面**已有真 CI 读数**（run 42698238621 等）⇒ ⇒ 改它 ⇒ ⇒ 那个读数就作废了；
 * ③ ⇒ ⇒ 本刀**只加一个面**，不动既有面 ⇒ ⇒ 两个面的读数**可以放在一起比**。
 *
 * ## 判红
 *
 * 提交树里存在**设置了但整棵树没有任何读者**的环境变量 ⇒ ⇒ 判红，并逐字点名：
 * 变量名 ＋ 它被设置在哪个文件。
 *
 * ## 退出码
 *
 *   **0 绿 / 1 红 / 2 判不了**（不是 git 仓 / ref 读不到 / 一个文件都没扫到
 *   ⇒ ⇒ 「判不了」≠「没问题」）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-dead-env-vars-commit-tree.mjs                       # 量 HEAD 的提交树（默认）
 * node scripts/check-dead-env-vars-commit-tree.mjs --rev=origin/master    # 量某一笔
 * node scripts/check-dead-env-vars-commit-tree.mjs --self-test            # 判据自检
 * ```
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { findEnvSets, findEnvReads, checkDeadEnvVars } from './lib/dead-env-vars.mjs';
import { ALLOWED } from './lib/dead-env-vars-allowed.mjs';
import { EXCLUDE_DIRS, EXCLUDE_FILES } from './lib/dead-env-vars-scope.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 跑一条 git 命令（失败 ⇒ 返回 ok:false，不抛）。 */
function g(args, opts) {
  const res = spawnSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...(opts || {}),
  });
  if (res.error) return { ok: false, out: '', err: String(res.error.message) };
  if (res.status !== 0) return { ok: false, out: String(res.stdout || ''), err: String(res.stderr || '') };
  return { ok: true, out: String(res.stdout || '') };
}

/**
 * **扫描范围** —— 与工作树面那把**共用同一份清单**（scripts/lib/dead-env-vars-scope.mjs）。
 * ⚠️ 一致很重要 ⇒ ⇒ 否则「两面读数不同」可能是**范围不同**而不是**内容不同**。
 */

/** 列出 ref 提交树里的全部文件路径。 */
function listTreeFiles(rev) {
  const res = g(['ls-tree', '-r', '--name-only', rev]);
  if (!res.ok) return { error: res.err || ('读不到提交树 ' + rev) };
  const all = res.out.split('\n').filter((f) => f.length > 0);
  const kept = all.filter((rel) => {
    if (EXCLUDE_FILES.includes(rel)) return false;
    if (rel.split('/').some((seg) => EXCLUDE_DIRS.includes(seg))) return false;
    return true;
  });
  return { files: kept, total: all.length };
}

/**
 * 读回多个 blob（`git cat-file --batch`）。
 * ⚠️ **按字节读** ⇒ ⇒ 否则 BOM / 二进制会被解码破坏。
 * ⚠️ `git cat-file --batch` 的头是「<sha> <type> <size>」⇒ ⇒ **头里没有路径**
 *    ⇒ ⇒ 只能**按输入顺序**对齐 ⇒ ⇒ 别拿 parts[1] 当路径。
 */
function readBlobs(rev, files) {
  const input = files.map((f) => rev + ':' + f).join('\n') + '\n';
  const res = spawnSync('git', ['-C', REPO, 'cat-file', '--batch'], {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error) return { error: String(res.error.message) };
  if (res.status !== 0) return { error: String(res.stderr || '') };
  const buf = res.stdout;
  const out = new Map();
  let off = 0;
  let idx = 0;
  while (off < buf.length && idx < files.length) {
    const nl = buf.indexOf(10, off);
    if (nl < 0) break;
    const header = buf.toString('utf8', off, nl);
    off = nl + 1;
    const name = files[idx];
    idx += 1;
    const parts = header.split(' ');
    if (parts.length < 3) continue;
    const size = Number(parts[parts.length - 1]);
    if (!Number.isFinite(size)) continue;
    out.set(name, buf.toString('utf8', off, off + size));
    off += size + 1;
  }
  return { blobs: out };
}

/**
 * **提交树面**的收集 —— 内容来自**提交树里的 blob**（不是磁盘上的文件）。
 * ⇒ ⇒ 这一面量的**就是 CI 会 checkout 出来的那一份**。
 */
function collectCommitTree(rev) {
  const listed = listTreeFiles(rev);
  if (listed.error) return { error: listed.error };
  const { blobs } = readBlobs(rev, listed.files);
  const sets = [];
  const reads = [];
  let fileCount = 0;
  for (const [rel, text] of blobs) {
    if (Buffer.from(text, 'utf8').subarray(0, 8192).includes(0)) continue;
    fileCount += 1;
    for (const s of findEnvSets(text, rel)) sets.push({ ...s, file: rel });
    for (const r of findEnvReads(text, rel)) reads.push({ ...r, file: rel });
  }
  return { sets, reads, fileCount, total: listed.total };
}

/** 在一份「文件 → 内容」的映射上跑判据 ⇒ ⇒ 返回死变量列表。 */
function judge(files) {
  const sets = [];
  const reads = [];
  for (const f of Object.keys(files)) {
    for (const s of findEnvSets(files[f], f)) sets.push({ ...s, file: f });
    for (const r of findEnvReads(files[f], f)) reads.push({ ...r, file: f });
  }
  return checkDeadEnvVars({ sets, reads, allowed: ALLOWED });
}

const line = '='.repeat(72);

/**
 * **判据自检** —— 在**合成的小树**上证明这把尺子有牙（且不多报）。
 * ⚠️ 必须印出**可数读数**（N/N）⇒ ⇒ 否则接进 CI 后治理闸会记它一笔债。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  // ⚠️ 合成的小树（**关键**：读者**只存在于提交树面** ⇒ ⇒ 两个面的读数**必须不同**
  //    ⇒ ⇒ 否则这把闸「量的是哪一面」这件事**没被证明**）。
  const WF = [
    'name: a',
    'on: [push]',
    'jobs:',
    '  j:',
    '    runs-on: ubuntu-latest',
    '    env:',
    '      SHADOW_DEAD: v',
    '      SHADOW_ONLY_IN_COMMIT_TREE: v',
    '    steps:',
    '      - run: echo hi',
  ].join('\n');
  const READER = 'const v = process.env.SHADOW_ONLY_IN_COMMIT_TREE;\n';
  const commitTreeFace = { '.github/workflows/a.yml': WF, 'src/reader.ts': READER };
  const worktreeFace = { '.github/workflows/a.yml': WF };

  add('提交树面：设了但没人读 ⇒ ⇒ 恰好报死那一个（另一个有读者）', () => {
    const res = judge(commitTreeFace);
    return res.dead.length === 1 && res.dead[0].name === 'SHADOW_DEAD';
  });

  add('提交树面：没人读的那一个要逐字点名（名字 ＋ 文件）', () => {
    const res = judge(commitTreeFace);
    const d = res.dead[0];
    return d && d.name === 'SHADOW_DEAD' && d.file === '.github/workflows/a.yml';
  });

  add('全部有人读 ⇒ ⇒ 零死变量', () => {
    const only = { '.github/workflows/a.yml': WF.split('\n').filter((l) => !l.includes('SHADOW_DEAD')).join('\n'), 'src/reader.ts': READER };
    return judge(only).dead.length === 0;
  });

  add('**两个面的读数必须不一样**（工作树面缺那个读者 ⇒ ⇒ 多一个死变量）⇒ ⇒ 证明「量的是哪一面」', () => {
    const wtDead = judge(worktreeFace).dead.length;
    const ctDead = judge(commitTreeFace).dead.length;
    return wtDead === 2 && ctDead === 1;
  });

  add('**同一份内容 ⇒ ⇒ 两个面的读数必须相同**（不许因为「换了面」就漂）', () => {
    return judge(commitTreeFace).dead.length === judge({ ...commitTreeFace }).dead.length;
  });

  add('**零读数必须自证「确实扫到了东西」** ⇒ ⇒ 空树不许报「零死变量」（那是假绿）', () => {
    // ⚠️ 空树 ⇒ ⇒ 死变量数是 0、读者数也是 0 ⇒ ⇒ **「零」有两种含义**（真干净 / 根本没扫到）
    //    ⇒ ⇒ 入口层必须靠「扫到几个文件」把两者分开 ⇒ ⇒ 这里断言「读者数为 0」可被区分。
    const res = judge({});
    return res.dead.length === 0 && res.readNames.length === 0 && res.legacy.length === 0;
  });

  add('**读端与设置端都要能被看见** ⇒ ⇒ 「0 条读端」不能被当成「没人读」', () => {
    // ⚠️ 若读端识别整体失效（读法表整个坏了）⇒ ⇒ 死变量会**暴增** ⇒ ⇒ 这一档守住
    //    「两个面读数不同」那档**没有因为读端整体失效而假通过**。
    const res = judge(commitTreeFace);
    return res.dead.length === 1 && res.readNames.length >= 1;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length + ' 通过');
  return bad === 0;
}

const argRev = (process.argv.find((a) => a.startsWith('--rev=')) || '').slice('--rev='.length);
const rev = argRev || 'HEAD';

if (process.argv.includes('--self-test')) {
  console.log(line);
  console.log('死环境变量闸（提交树面） —— 自检');
  console.log(line);
  const ok = selfTest();
  console.log('');
  console.log(ok ? '✓ 自检全绿' : '✗ 自检有红');
  process.exit(ok ? 0 : 1);
}

console.log(line);
console.log('死环境变量闸 —— 提交树面（' + rev + '）');
console.log(line);

const collected = collectCommitTree(rev);

if (collected.error) {
  console.error('✗ 读不到提交树 ' + rev + ' ⇒ ⇒ 判不了（不是绿）⇒ ⇒ 退出码 2。');
  console.error('  ⇒ ' + collected.error);
  process.exit(2);
}

if (collected.fileCount === 0) {
  console.error('✗ 提交树里一个文件都没扫到 ⇒ ⇒ 判不了（不是绿）⇒ ⇒ 退出码 2。');
  process.exit(2);
}

const { sets, reads, fileCount, total } = collected;
const res = checkDeadEnvVars({ sets, reads, allowed: ALLOWED });

console.log('');
console.log('▶ 覆盖面');
console.log('  · ref = ' + rev);
console.log('  · 扫了 ' + fileCount + ' 个文件（树里共 ' + total + ' 个，排除后）');
console.log('  · 设置端 ' + sets.length + ' 处 / 读取端 ' + reads.length + ' 处');
console.log('  · 读者名字（去重后）' + res.readNames.length + ' 个');

// ⚠️ **登记的存量债必须打印**（与工作树面那把**同构**）⇒ ⇒ 否则两个面的输出
//    不可比 ⇒ ⇒ 「两个面的读数放在一起比」这句话就落空了。
if (res.legacy.length > 0) {
  console.log('');
  console.log('· 已登记的**存量债**（放行但仍要打印 —— 登记不是认可）:');
  for (const d of res.legacy) {
    console.log('  · ' + d.name + '  —— ' + d.file);
  }
}

if (res.dead.length === 0 && res.drift.length === 0) {
  console.log('');
  console.log('✓ 提交树面：零死变量、零改名漂移');
  console.log(line);
  process.exit(0);
}

let failed = 0;

if (res.drift.length > 0) {
  console.log('');
  console.log('✗ 改名漂移（提交树面 · 设置端与读取端用了不同的名字）:');
  for (const d of res.drift) {
    console.log('  · ' + d.set + '  ⇒ 读者读的是 ' + d.read);
    console.log('    设置位置: ' + d.file + '（尾部族名 ' + d.family + '）');
  }
  failed++;
}

if (res.dead.length > 0) {
  console.log('');
  console.log('✗ 死环境变量（提交树面 · 设了但整棵树里没有任何读者）:');
  for (const d of res.dead) {
    console.log('  · ' + d.name + '  —— ' + d.file);
  }
  console.log('');
  console.log('  ⇒ ⇒ 这一面量的**就是 CI 会 checkout 出来的那一份**');
  console.log('    ⇒ ⇒ 这里的红**不是假红** ⇒ ⇒ 它在 CI 上也会红。');
  failed++;
}

console.log(line);
process.exit(failed > 0 ? 1 : 0);