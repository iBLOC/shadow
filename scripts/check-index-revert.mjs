#!/usr/bin/env node
/**
 * 「暂存面回退」闸（2026-11-11）。
 *
 * ## 它守什么
 *
 * 提交前那一格：**暂存区（index）相对 HEAD 有没有静悄悄的回退**。
 *
 * ⚠️ **与 `scripts/check-commit-revert.mjs` 分族** ——
 *   · 本闸：**暂存面**（index vs HEAD）⇒ ⇒ 提交**前**
 *   · 那闸：**提交面**（git 历史）⇒ ⇒ 提交**后**
 * ⇒ ⇒ 两把尺子不许越界；本闸**不扫历史**（那是那把闸的事）。
 *
 * ## 五条判据（红线三条 ＋ 提示两条）
 *
 * · R1 **退回旧版**：暂存区里某个文件的内容 == 历史上某个旧提交的内容 ⇒ ⇒ 回退。
 * · R2 **拆了尺子**：暂存区把受保护的闸/判据/workflow **删掉**了。
 * · R4 **台账被退回**：暂存面的台账里少了 HEAD 有的条目符号。
 * · H1 **普通改动**：暂存面改了内容，但那份内容历史上没出现过 ⇒ ⇒ 不是回退。
 * · M1 **只翻了权限位**：内容逐字相同，只有 mode 变了 ⇒ ⇒ 提示层，不判红。
 *
 * ## ⚠️ **它在 CI 上量不到真东西**（2026-11-11 实测得出的形状）
 *
 * CI 的检出是**干净的** ⇒ ⇒ 暂存区 ≡ HEAD ⇒ ⇒ 「零差异」是**构造出来的**
 * ⇒ ⇒ 它**不是**「验过了」⇒ ⇒ 所以本闸在 CI 上的价值是**判据自检**
 * （在临时仓里造真形状 ⇒ ⇒ 证明尺子有牙）＋ **把这件事印出来**
 * ⇒ ⇒ 真读数在**活的共享工作树**上（提交前那一格）。
 *
 * ## 退出码
 *
 * - 0：绿；- 1：红；- 2：**判不了**（不是 git 仓／读不到 HEAD／读不到索引）。
 *
 * ## 用法
 *
 *     node scripts/check-index-revert.mjs
 *     node scripts/check-index-revert.mjs --self-test
 *     node scripts/check-index-revert.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyIndexFace, ledgerSymbols, LEDGER_PATHS } from './lib/index-revert.mjs';

const REPO = process.cwd();
const HISTORY_LIMIT = 60; // 每个路径往回看多少次历史改动
const ZERO_SHA = '0'.repeat(40);

function git(args, cwd = REPO) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitTry(args, cwd = REPO) {
  try { return { ok: true, out: git(args, cwd) }; } catch (e) {
    return { ok: false, out: '', err: e.stderr ? String(e.stderr) : String(e.message) };
  }
}

/** 一次 `git cat-file --batch-check` 批量解析 `rev:path` ⇒ ⇒ 免掉 N 次 git 进程。 */
function resolveBlobs(cwd, queries) {
  if (!queries.length) return new Map();
  const out = execFileSync('git', ['-C', cwd, 'cat-file', '--batch-check'], {
    input: queries.join('\n') + '\n',
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = out.split('\n');
  const map = new Map();
  queries.forEach((q, i) => {
    const line = (lines[i] || '').trim();
    const m = line.match(/^([0-9a-f]{40})\s+blob/);
    if (m) map.set(q, m[1]);
  });
  return map;
}

/** 解析 `git diff --cached --raw HEAD`：`:100644 100755 <oldsha> <newsha> <status>\t<path>` */
function parseRaw(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const head = line.slice(0, tab).trim();
    const path = line.slice(tab + 1);
    const parts = head.replace(/^:/, '').split(/\s+/);
    if (parts.length < 5) continue;
    const [oldMode, newMode, oldSha, newSha, status] = parts;
    const paths = path.split('\t');
    rows.push({
      path: paths[paths.length - 1],
      status: status[0],
      headMode: oldSha === ZERO_SHA ? null : oldMode,
      indexMode: newSha === ZERO_SHA ? null : newMode,
      headBlob: oldSha === ZERO_SHA ? null : oldSha,
      indexBlob: newSha === ZERO_SHA ? null : newSha,
    });
  }
  return rows;
}

export function runCheck(cwd = REPO) {
  const inside = gitTry(['rev-parse', '--git-dir'], cwd);
  if (!inside.ok) return { code: 2, reason: '不是 git 仓（git rev-parse 失败）' };
  const head = gitTry(['rev-parse', '--verify', 'HEAD'], cwd);
  if (!head.ok) return { code: 2, reason: '读不到 HEAD（空仓？）' };
  // ⚠️ `--no-abbrev` 是硬需求 —— 默认的 `--raw` 给的是**缩写 hash**（8 位）
  //    ⇒ ⇒ 与 `cat-file --batch-check` 给的**全长 hash**（40 位）比不上
  //    ⇒ ⇒ R1 永远匹配不上（自检实测：改成缩写 hash 那版 ⇒ ⇒ R1 恒不触发）。
  const diff = gitTry(['diff', '--cached', '--raw', '--no-abbrev', 'HEAD'], cwd);
  if (!diff.ok) return { code: 2, reason: '读不到暂存面（git diff --cached 失败）' };
  const rows = parseRaw(diff.out);
  if (!rows.length) {
    return {
      code: 0,
      violations: [],
      hints: [],
      scanned: 0,
      note: '暂存区与 HEAD 逐字一致 ⇒ ⇒ 这一格**没有待判的东西** ⇒ ⇒ ⚠️ CI 的干净检出也长这样 ⇒ ⇒ 「零回退」在这里是**构造出来的** ⇒ ⇒ 不作数（它证明的是「没提交的东西里没有回退」，不是「这个仓没问题」）',
    };
  }
  // 每个被改的路径：往回看历史，找出「暂存区内容 == 哪一次旧提交」
  const changed = rows.filter(r => r.status === 'M');
  const queries = [];
  const revsByPath = new Map();
  for (const row of changed) {
    const lg = gitTry(['log', '--format=%H', '-n', String(HISTORY_LIMIT), '--', row.path], cwd);
    if (!lg.ok) continue;
    const revs = lg.out.trim().split('\n').filter(Boolean);
    revsByPath.set(row.path, revs);
    for (const rev of revs) queries.push(rev + ':' + row.path);
  }
  const resolved = resolveBlobs(cwd, queries);
  const oldCommitFor = (path, blob) => {
    const revs = revsByPath.get(path) || [];
    for (const rev of revs) {
      if (resolved.get(rev + ':' + path) === blob) return rev.slice(0, 7);
    }
    return null;
  };
  const headLedgerSymbols = {};
  const indexLedgerSymbols = {};
  for (const p of LEDGER_PATHS) {
    const h = gitTry(['show', 'HEAD:' + p], cwd);
    if (h.ok) headLedgerSymbols[p] = [...ledgerSymbols(h.out)];
    const i = gitTry(['show', ':' + p], cwd);
    if (i.ok) indexLedgerSymbols[p] = [...ledgerSymbols(i.out)];
  }
  const { violations, hints } = classifyIndexFace(rows, { oldCommitFor, headLedgerSymbols, indexLedgerSymbols });
  return { code: violations.length ? 1 : 0, violations, hints, scanned: rows.length };
}

/* ── 自检：7 条真形状（临时 git 仓里造） ─────────────────────────── */
function selfTest() {
  const results = [];
  const dir = mkdtempSync(join(tmpdir(), 'index-revert-selftest-'));
  const g = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    g(['init', '-q']);
    g(['config', 'user.email', 't@t']);
    g(['config', 'user.name', 't']);
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v1\n');
    writeFileSync(join(dir, '.github', 'workflows', 'x.yml'), 'v1\n');
    writeFileSync(join(dir, 'AGENTS.md'), '**Updated**: 2026-11-11 (㒀 **条目一**)\n');
    g(['add', '-A']);
    g(['commit', '-qm', 'base']);

    results.push(['暂存面干净 ⇒ 不红', runCheck(dir).code === 0]);

    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v2\n');
    g(['add', '-A']);
    g(['commit', '-qm', 'v2']);
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v1\n');
    g(['add', 'scripts/check-x.mjs']);
    const r2 = runCheck(dir);
    results.push(['退回旧版 ⇒ 恰好 1 红（R1）', r2.code === 1 && r2.violations.length === 1 && r2.violations[0].code === 'R1']);

    g(['reset', '-q', '--hard', 'HEAD']);
    g(['rm', '-q', '--cached', 'scripts/check-x.mjs']);
    const r3 = runCheck(dir);
    results.push(['暂存删除受保护的闸 ⇒ 红（R2）', r3.code === 1 && r3.violations.some(v => v.code === 'R2')]);

    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), '**Updated**: 2026-11-11 (㒁 **别的条目**)\n');
    g(['add', 'AGENTS.md']);
    const r4 = runCheck(dir);
    results.push(['台账少了条目 ⇒ 红（R4）', r4.code === 1 && r4.violations.some(v => v.code === 'R4')]);

    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v2-new\n');
    g(['add', 'scripts/check-x.mjs']);
    const r5 = runCheck(dir);
    results.push(['普通改动 ⇒ 不红', r5.code === 0 && r5.hints.some(h => h.code === 'H1')]);

    g(['reset', '-q', '--hard', 'HEAD']);
    g(['update-index', '--chmod=+x', 'scripts/check-x.mjs']);
    const r6 = runCheck(dir);
    results.push(['只翻权限位 ⇒ 不判红但必须被点名（M1）', r6.code === 0 && r6.hints.some(h => h.code === 'M1')]);

    const empty = mkdtempSync(join(tmpdir(), 'index-revert-empty-'));
    const r7 = runCheck(empty);
    results.push(['不是 git 仓 ⇒ 退出码 2（判不了）', r7.code === 2]);
    rmSync(empty, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return results;
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  const results = selfTest();
  let ok = 0;
  for (const [name, pass] of results) {
    console.log((pass ? '  ✔ ' : '  ✘ ') + name + '  —— ' + JSON.stringify(pass));
    if (pass) ok++;
  }
  console.log('自检：' + ok + '/' + results.length + ' 通过');
  process.exit(ok === results.length ? 0 : 1);
}

const res = runCheck(REPO);
if (res.code === 2) {
  console.error('暂存面回退闸：**判不了** ⇒ ⇒ ' + res.reason);
  process.exit(2);
}
if (args.includes('--json')) {
  console.log(JSON.stringify(res, null, 1));
  process.exit(res.code);
}
console.log('暂存面回退闸：扫 ' + res.scanned + ' 个暂存差异');
if (res.note) console.log('   ℹ️ [N0] ' + res.note);
for (const v of res.violations) console.log('   [' + v.code + '] ' + v.msg);
for (const h of res.hints) console.log('   ℹ️ [' + h.code + '] ' + h.msg);
console.log(res.violations.length ? ('✘ ' + res.violations.length + ' 处暂存面回退') : '✓ 暂存面零回退');
process.exit(res.code);
