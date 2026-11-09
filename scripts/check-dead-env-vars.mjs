#!/usr/bin/env node
/**
 * 死环境变量闸 —— **死变量 / 改名漂移**
 * ============================================================================
 *
 * 判据（算法）在 ./lib/dead-env-vars.mjs（纯函数）⇒ 这里只有**数据**：
 * 扫哪些文件、哪些变量是**真契约**（给外部消费者用的）。
 *
 * ── 为什么需要这道闸 ────────────────────────────────────────────
 * 2026-11-05 实测：CI 的 e2e step 设了两个环境变量指向端脑二进制，
 * 但读取端（shadow-desktop/tests/e2e-ui/global-setup.ts）在改名链里
 * **已经换成了新名字** ⇒ ⇒ 那两个变量**一个读者都没有** ⇒ ⇒ CI 里 e2e
 * 安静地走了「端脑起不来 ⇒ 规格自跳过」那条分支 ⇒ ⇒ **绿灯但什么都没测**。
 * ⇒ ⇒ 而且**词级残留闸看不见它**（新名字里没有旧产品名那个词）。
 * ⇒ ⇒ 所以要有这道**按「变量有没有读者」判**的闸。
 *
 * ⚠️ **源码里不写任何旧产品名**（2026-11-05 实测踩到）：写进去 ⇒ ⇒
 *    「旧词残留闸」会把本文件判红 ⇒ ⇒ **两道闸互咬** ⇒ ⇒ 闸的源码
 *    必须与它要守的旧词**无关** ⇒ ⇒ 这样它才是**通用**的改名链检测器。
 *
 * 用法（从 shadow 仓根跑）：
 *   node scripts/check-dead-env-vars.mjs             # 主流程
 *   node scripts/check-dead-env-vars.mjs --self-test # 自检
 *
 * 退出码：0 = 绿 / 1 = 有死变量或改名漂移 / 2 = 判不了（没扫到文件）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  findEnvSets, findEnvReads, checkDeadEnvVars, deadEnvSelfTest,
} from './lib/dead-env-vars.mjs';
import { ALLOWED } from './lib/dead-env-vars-allowed.mjs';
import { EXCLUDE_DIRS, EXCLUDE_FILES } from './lib/dead-env-vars-scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 扫描范围：**设置端**与**读取端**都要看。
 * ⚠️ 两边都得看 ⇒ ⇒ 死变量才会暴露（只看设置端 ⇒ 无从知道有没有读者）。
 */
/**
 * 扫描范围 —— **设置端与读取端都要看**（只看设置端 ⇒ ⇒ 无从知道有没有读者）。
 *
 * ⚠️ **范围清单住在 lib 层**（scripts/lib/dead-env-vars-scope.mjs）
 *    ⇒ ⇒ 两把闸（工作树面 / 提交树面）**必须扫同一批文件** ⇒ ⇒ 读数才可比。
 */

/**
 * 真契约登记簿 —— **已搬到 lib 层**：scripts/lib/dead-env-vars-allowed.mjs
 * ⚠️ 两把闸必须读**同一份**登记簿 ⇒ ⇒ 否则「读数不同」可能只是登记簿不同。
 */

/**
 * 列出**受版本控制**的文本文件。
 *
 * （说明见下）
 */
function listTrackedFiles() {
  let out;
  try {
    // ⚠️ **--cached --others --exclude-standard**（2026-11-05 实测踩到）：
    //    只用 `git ls-files` ⇒ ⇒ 只看**已提交**的文件 ⇒ ⇒ **新写的代码在提交前
    //    闸根本看不见**（本轮实测：闸自己就是在提交那一刻才开始看见自己）
    //    ⇒ ⇒ 那个「提交前先跑一遍闸」的用法**根本不成立** ⇒ ⇒ 闸是恒绿的。
    //    ⇒ ⇒ 加上 --others（未跟踪但**未被忽略**）⇒ ⇒ 提交前也能判。
    //    ⇒ ⇒ --exclude-standard 保证 .gitignore 里的本地目录（.local/ 等）不进范围。
    const res = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (res.status !== 0 || !res.stdout) {
      return { files: [], gitOk: false, reason: 'git ls-files 失败（退出码 ' + res.status + '）' };
    }
    out = res.stdout.split('\0').filter(Boolean);
  } catch (e) {
    return { files: [], gitOk: false, reason: 'git 不可用：' + (e && e.message) };
  }

  const files = [];
  for (const rel of out) {
    const norm = rel.replace(/\\/g, '/');
    if (EXCLUDE_FILES.includes(norm)) continue;
    if (norm.split('/').some((seg) => EXCLUDE_DIRS.includes(seg))) continue;
    const p = join(ROOT, rel);
    try {
      const st = statSync(p);
      if (st.size > 4 * 1024 * 1024) continue;
      const buf = readFileSync(p);
      if (buf.subarray(0, 8192).includes(0)) continue;
      files.push(p);
    } catch { /* 跟踪了但本地没有（稀疏检出 / 子模块）⇒ 跳过 */ }
  }
  return { files, gitOk: true, reason: '' };
}

function collect() {
  const { files, gitOk, reason } = listTrackedFiles();
  const sets = [];
  const reads = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(ROOT, f).split(sep).join('/');
    for (const s of findEnvSets(text, rel)) sets.push({ ...s, file: rel });
    for (const r of findEnvReads(text, rel)) reads.push({ ...r, file: rel });
  }
  return { sets, reads, fileCount: files.length, gitOk, reason };
}

const line = '='.repeat(72);

if (process.argv.includes('--self-test')) {
  console.log(line);
  console.log('死环境变量闸 —— 自检');
  console.log(line);
  const r = deadEnvSelfTest();
  console.log(r.out);
  console.log('');
  console.log(r.code === 0 ? '✓ 自检全绿（' + r.total + '/' + r.total + '）' : '✗ 自检有红（' + r.fails + '/' + r.total + '）');
  process.exit(r.code);
}

console.log(line);
console.log('死环境变量闸 —— 死变量 / 改名漂移');
console.log(line);

const { sets, reads, fileCount, gitOk, reason } = collect();

if (!gitOk) {
  console.error('✗ git ls-files 失败 ⇒ ⇒ 判不了（不是绿）⇒ ⇒ 退出码 2。');
  console.error('  ⇒ ' + reason);
  process.exit(2);
}

if (fileCount === 0) {
  console.error('✗ 一个文件都没扫到 ⇒ ⇒ 判不了（不是绿）⇒ ⇒ 退出码 2。');
  console.error('  ⇒ 查 git 跟踪的文件（仓改名了 / 稀疏检出 / 过滤器不对）。');
  process.exit(2);
}

const res = checkDeadEnvVars({ sets, reads, allowed: ALLOWED });

console.log('');
console.log('▶ 覆盖面');
console.log('  · 扫了 ' + fileCount + ' 个文件');
console.log('  · 设置端 ' + sets.length + ' 处 / 读取端 ' + reads.length + ' 处');
console.log('  · 读者名字（去重后）' + res.readNames.length + ' 个');

if (res.legacy.length > 0) {
  console.log('');
  console.log('· 已登记的**存量债**（放行但仍要打印 —— 登记不是认可）:');
  for (const l of res.legacy) {
    console.log('  · ' + l.name + '  —— ' + l.file);
  }
}

if (res.dead.length === 0 && res.drift.length === 0) {
  console.log('');
  console.log('✓ 零死变量、零改名漂移');
  console.log(line);
  process.exit(0);
}

let failed = 0;

if (res.drift.length > 0) {
  console.log('');
  console.log('✗ 改名漂移（设置端与读取端用了不同的名字 ⇒ ⇒ 设置端那个没人读）:');
  for (const d of res.drift) {
    console.log('  · ' + d.set + '  ⇒ 读者读的是 ' + d.read);
    console.log('    设置位置: ' + d.file + '（尾部族名 ' + d.family + '）');
  }
  console.log('');
  console.log('  ⇒ ⇒ 这就是**改名链漏改**：读者早就换成新名字了 ⇒ ⇒ 设的旧名字**没有读者**');
  console.log('    ⇒ ⇒ 它的本意（那个 override）**从来没生效过** ⇒ ⇒ 失败长得像成功。');
  console.log('  ⇒ ⇒ 修法：把设置端改成与读者同名；或若它确实是真契约 ⇒ 登记进 ALLOWED。');
  failed++;
}

if (res.dead.length > 0) {
  console.log('');
  console.log('✗ 死环境变量（设了但全仓没有任何读者）:');
  for (const d of res.dead) {
    console.log('  · ' + d.name + '  —— ' + d.file);
  }
  console.log('');
  console.log('  ⇒ ⇒ 没人读的变量 = 改名链漏改的化石，或拼错了 ⇒ ⇒ 两种都不该留着。');
  console.log('  ⇒ ⇒ 修法：删掉它，或登记进 ALLOWED（写清谁读它）。');
  failed++;
}

console.log(line);
process.exit(failed > 0 ? 1 : 0);
