#!/usr/bin/env node
/**
 * **零成本全历史「抹空」扫描** —— 检测任何一个提交把**非空**文件写成**零字节**。
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * 「提交面回退闸」（刀 P ＋ 刀 R）扫历史时**每对提交都要打 diff** ⇒ ⇒ 成本随历史线性上涨
 * （实测：40 笔 52.5 秒 ｜ 150 笔 202.7 秒 ｜ 全历史 1123 笔 ≈ 1 小时）⇒ ⇒ 「更早的历史」
 * 那一格**长期是欠账**。
 *
 * ⚠️ 而「抹空」这一族**根本不需要 diff** —— git **不会**给空文件发新哈希 ⇒ ⇒ 「这个文件
 * 是不是被写成零字节」只要比**空 blob 的哈希常量** ⇒ ⇒ 于是**一遍 `git log --raw`** 就够
 * ⇒ ⇒ 全历史覆盖从**一小时**变成**几秒**。
 *
 * ## 判红
 *
 *   · 非空 blob ⇒ 空 blob 的转换，**且**那笔提交**没有声明**这次回退，**且**它**没有登记在册**。
 *   · 「新增一个空文件」**不算**（那不是抹空别人的东西）。
 *
 * ## 逃逸口（与提交面回退闸一致）
 *
 *   · 标题行声明（git revert 形状 / 明写「撤销」「回退」「退回」）⇒ ⇒ 放行。
 *   · 登记在册（**逐字**写明为什么能放行）⇒ ⇒ 放行。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-blank-blob-history.mjs
 * node scripts/check-blank-blob-history.mjs --self-test
 * node scripts/check-blank-blob-history.mjs --rev=origin/master   # ⚠️ 量的是**远端面**
 * ```
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emptyBlobHash, declaresRevert, isRegistered } from './lib/commit-revert.mjs';
import { REGISTERED_REVERTS } from './lib/commit-revert-registry.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');

const ZERO = '0'.repeat(40);

/** 读一个 git 命令的结果（失败 ⇒ ok:false）。 */
function g(repo, args) {
  try {
    const out = execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + '', err: String(e.stderr || e.message) };
  }
}

/**
 * 扫一遍历史，找「非空 blob ⇒ 空 blob」的转换。
 *
 * ⚠️ **只用 `--raw`**（不取 diff）⇒ ⇒ 成本与历史长度**无关**（除了一次输出量）。
 * ⚠️ `--no-renames` ⇒ ⇒ 重命名不冒充成「新增＋删除」。
 */
export function scanBlankBlobs(repo, rev) {
  const fmt = g(repo, ['rev-parse', '--show-object-format']);
  if (!fmt.ok) return { error: '读不到对象格式（不是 git 仓？）' };
  const empty = emptyBlobHash(fmt.out.trim());
  const log = g(repo, ['log', '--raw', '--no-abbrev', '--no-renames', '--format=C %H%x09%s', rev]);
  if (!log.ok) return { error: 'git log 读不到 ' + rev };
  const lines = log.out.split('\n');
  const hits = [];
  let cur = null;
  let curMsg = '';
  let commits = 0;
  for (const line of lines) {
    if (line.startsWith('C ')) {
      const rest = line.slice(2);
      const tab = rest.indexOf('\t');
      cur = tab >= 0 ? rest.slice(0, tab) : rest;
      curMsg = tab >= 0 ? rest.slice(tab + 1) : '';
      commits++;
      continue;
    }
    if (!line.startsWith(':')) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const meta = line.slice(1, tab).split(' ');
    const path = line.slice(tab + 1);
    const oldSha = meta[2];
    const newSha = meta[3];
    if (!oldSha || !newSha) continue;
    if (newSha !== empty) continue;
    if (oldSha === empty || oldSha === ZERO) continue;
    hits.push({ commit: cur, message: curMsg, file: path, oldSha });
  }
  return { commits, hits, empty };
}

/** 分类：判红 / 声明放行 / 登记放行。 */
export function classify(hit, registry) {
  if (declaresRevert(hit.message)) return { kind: 'declared', red: false };
  if (isRegistered(registry, hit.commit, hit.file)) return { kind: 'registered', red: false };
  return { kind: 'silent', red: true };
}
/**
 * **判据自检** —— 在**临时仓**里造真形状 ⇒ ⇒ 证明这把尺子有牙（且恰好红那一条）。
 */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'blank-blob-selftest-'));
  const rg = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const wr = (name, content) => writeFileSync(join(dir, name), content, 'utf8');
  let ok = true;
  let passed = 0;
  let total = 0;
  const check = (label, got, want) => {
    total++;
    const pass = got === want;
    if (!pass) ok = false; else passed++;
    console.log('  ' + (pass ? '✅' : '❌') + ' ' + label + ' —— ' + (pass ? '对' : '**错**（期望 ' + want + '，实测 ' + got + '）'));
  };
  try {
    rg(['init', '-q']);
    rg(['config', 'user.email', 'selftest@example.invalid']);
    rg(['config', 'user.name', 'selftest']);
    wr('a.txt', 'hello\n');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', 'seed: 非空文件']);

    // ① 抹空，未声明，未登记 ⇒ ⇒ 必须判红
    wr('a.txt', '');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', 'chore: 清理']);
    const c1 = rg(['rev-parse', 'HEAD']).trim();

    // ② 抹空，但标题行声明了 ⇒ ⇒ 放行
    wr('a.txt', 'hello\n');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', 'chore: 还原']);
    wr('a.txt', '');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', '撤销刚才那一次']);
    const c2 = rg(['rev-parse', 'HEAD']).trim();

    // ③ 抹空，但登记在册 ⇒ ⇒ 放行
    wr('a.txt', 'hello\n');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', 'chore: 再还原']);
    wr('a.txt', '');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', 'chore: 再清理']);
    const c3 = rg(['rev-parse', 'HEAD']).trim();

    // ④ 新增一个**空**文件 ⇒ ⇒ 不是抹空（没有可被抹掉的东西）
    wr('b.txt', '');
    rg(['add', 'b.txt']);
    rg(['commit', '-q', '-m', 'chore: 新增空占位']);

    // ⑤ 正常改动 ⇒ ⇒ 不该命中
    wr('a.txt', 'hello again\n');
    rg(['add', 'a.txt']);
    rg(['commit', '-q', '-m', 'feat: 正常改动']);

    const res = scanBlankBlobs(dir, 'HEAD');
    if (res.error) { console.log('  ❌ 扫描失败：' + res.error); return false; }
    const noReg = res.hits.map((h) => ({ h, k: classify(h, []).kind }));
    const silent = noReg.filter((x) => x.k === 'silent').map((x) => x.h);
    const declared = noReg.filter((x) => x.k === 'declared').map((x) => x.h);
    // ⚠️ 登记簿**只登记 c3** ⇒ ⇒ c1 仍然是静悄悄（⇒ ⇒ 登记簿不是万能赦免）
    const regOnlyC3 = res.hits.map((h) => ({ h, k: classify(h, [{ commit: c3, file: 'a.txt' }]).kind }));
    const registered = regOnlyC3.filter((x) => x.k === 'registered').map((x) => x.h);
    const stillSilent = regOnlyC3.filter((x) => x.k === 'silent').map((x) => x.h);
    check('抹空必被扫出来（3 处）', res.hits.length, 3);
    check('未声明未登记 ⇒ 判红 2 处（c1 与 c3 都是没声明的）', silent.length, 2);
    check('判红里含第一条抹空 c1', silent.some((h) => h.commit === c1), true);
    check('声明过 ⇒ 放行 1 处', declared.length, 1);
    check('声明过的那一条正是 c2', declared.length === 1 && declared[0].commit === c2, true);
    check('登记在册 ⇒ 放行 1 处（只有 c3）', registered.length, 1);
    check('登记在册的那一条正是 c3', registered.length === 1 && registered[0].commit === c3, true);
    check('登记簿**不是万能赦免**（c1 仍判红）', stillSilent.length === 1 && stillSilent[0].commit === c1, true);
    check('新增空文件不算抹空（b.txt 不在命中里）', res.hits.some((h) => h.file === 'b.txt'), false);
    check('正常改动不算抹空', res.hits.some((h) => h.commit === rg(['rev-parse', 'HEAD']).trim()), false);
    console.log('  扫了 ' + res.commits + ' 个提交（临时仓）');
    console.log('判据自检：' + passed + '/' + total + ' 通过');
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 临时目录留在原地也无妨 */ }
  }
  return ok;
}

function main() {
  const revArg = (process.argv.find((a) => a.startsWith('--rev=')) || '').slice('--rev='.length);
  // ⚠️ **默认量 HEAD，不量 origin/master** —— 本地刚做的那一笔在 HEAD 上，
  //   而 origin/master 是**远端跟踪引用** ⇒ ⇒ 量它 ⇒ ⇒ 本地新提交**不在被测面**
  //   ⇒ ⇒ 实测：注入一次抹空后跑闸仍然 EXIT=0（读的是远端面）⇒ ⇒ 「尺子要对着被测物」。
  const rev = revArg || 'HEAD';
  const res = scanBlankBlobs(REPO, rev);
  if (res.error) {
    console.error('❌ 判不了（退出码 2）：' + res.error);
    return 2;
  }
  const shallow = g(REPO, ['rev-parse', '--is-shallow-repository']);
  if (shallow.ok && shallow.out.trim() === 'true') {
    console.error('❌ 判不了（退出码 2）：这是**浅克隆** ⇒ ⇒ 历史不完整 ⇒ ⇒ 「零抹空」是假象');
    return 2;
  }
  const silent = [], declared = [], registered = [];
  for (const h of res.hits) {
    const k = classify(h, REGISTERED_REVERTS).kind;
    if (k === 'silent') silent.push(h);
    else if (k === 'declared') declared.push(h);
    else registered.push(h);
  }
  console.log('零成本全历史「抹空」扫描：扫了 ' + res.commits + ' 个提交（' + rev + '）');
  console.log('  非空 ⇒ 空 blob 的转换共 ' + res.hits.length + ' 处' +
    '（判红：静悄悄的抹空 ' + silent.length + ' ｜ 放行：已声明 ' + declared.length + ' ｜ 登记在册 ' + registered.length + '）');
  for (const h of registered) console.log('  📌 登记在册的抹空（放行，但要说得出为什么）：' + h.commit.slice(0, 8) + ' × ' + h.file);
  for (const h of declared) console.log('  ✅ 已声明的抹空（放行）：' + h.commit.slice(0, 8) + ' × ' + h.file);
  if (silent.length) {
    console.log('');
    for (const h of silent) {
      console.log('❌ 静悄悄的抹空：' + h.commit.slice(0, 8) + ' 把一个非空文件写成了零字节 × ' + h.file);
      console.log('    该提交信息首行（**没有**声明这次回退）：' + (h.message || '').split('\n')[0]);
    }
    return 1;
  }
  console.log('✅ 全历史零静悄悄抹空');
  return 0;
}

if (process.argv[2] === '--self-test') {
  console.log('判据自检（临时仓夹具）：');
  process.exit(selfTest() ? 0 : 1);
}
process.exit(main());
