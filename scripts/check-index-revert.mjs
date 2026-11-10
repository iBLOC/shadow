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
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyIndexFace, ledgerSymbols, ledgerEntries, normalizeEol, LEDGER_PATHS, R1_KIND_LABEL } from './lib/index-revert.mjs';

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

/** 两个「条目正文集合」是否逐字相同。 */
function entriesEqual(a, b) {
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/**
 * 算一份内容的 **git blob sha1**（不落盘）—— ⚠️ **用来判「工作树是不是历史上某一版」**。
 *   git 的 blob 哈希 ＝ sha1("blob <字节数>\0" ＋ 内容) ⇒ ⇒ 本地就能算 ⇒ ⇒
 *   不用为了「问一句」把 60 个历史版本的内容全读出来。
 * ⚠️ **必须用归一后的内容**（CRLF ⇒ LF）⇒ ⇒ 否则 Windows 工作树永远算不出 blob 哈希。
 */
function gitBlobSha1(text) {
  const buf = Buffer.from(normalizeEol(text), 'utf8');
  return createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex');
}

/** 一次 `git cat-file --batch` 批量取**内容**（按 header 里的字节数切 ⇒ ⇒ 不靠猜）。 */
function resolveBlobContents(cwd, queries) {
  const map = new Map();
  if (!queries.length) return map;
  const buf = execFileSync('git', ['-C', cwd, 'cat-file', '--batch'], {
    input: queries.join('\n') + '\n',
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let p = 0;
  for (const q of queries) {
    const nl = buf.indexOf(10, p);
    if (nl < 0) break;
    const header = buf.toString('utf8', p, nl);
    const m = header.match(/^([0-9a-f]{40}) blob (\d+)$/);
    if (!m) { p = nl + 1; continue; }        // `<query> missing` ⇒ ⇒ 跳过这一条
    const size = Number(m[2]);
    const start = nl + 1;
    if (start + size > buf.length) break;
    map.set(q, { sha: m[1], content: buf.toString('utf8', start, start + size) });
    p = start + size + 1;                    // 跳过 blob 后面的换行
  }
  return map;
}

export function runCheck(cwd = REPO) {
  const inside = gitTry(['rev-parse', '--git-dir'], cwd);
  if (!inside.ok) return { code: 2, reason: '不是 git 仓（git rev-parse 失败）' };
  // ⚠️ **所有 git 调用一律以「仓根」为基准**（2026-11-11 实测补）—— 否则两套系统对
  //   「路径」的相对基准**不一样**：`git diff --cached --raw` 给的路径相对**仓根**，
  //   而 `git log -- <path>` 的 pathspec 与 `git hash-object -- <路径>` 相对 **cwd**
  //   ⇒ ⇒ 在子目录里跑 ⇒ ⇒ pathspec 落空 ＋ 工作树读不到 ⇒ ⇒ **尺子量的不是同一个东西**。
  //   ⇒ ⇒ 通用形态：**同一个路径形状，两套系统认得不一样 ⇒ ⇒ 读之前把基准归一**。
  const top = gitTry(['rev-parse', '--show-toplevel'], cwd);
  const root = top.ok && top.out.trim() ? top.out.trim() : cwd;
  const head = gitTry(['rev-parse', '--verify', 'HEAD'], root);
  if (!head.ok) return { code: 2, reason: '读不到 HEAD（空仓？）' };
  // ⚠️ `--no-abbrev` 是硬需求 —— 默认的 `--raw` 给的是**缩写 hash**（8 位）
  //    ⇒ ⇒ 与 `cat-file --batch-check` 给的**全长 hash**（40 位）比不上
  //    ⇒ ⇒ R1 永远匹配不上（自检实测：改成缩写 hash 那版 ⇒ ⇒ R1 恒不触发）。
  const diff = gitTry(['diff', '--cached', '--raw', '--no-abbrev', 'HEAD'], root);
  if (!diff.ok) return { code: 2, reason: '读不到暂存面（git diff --cached 失败）' };
  const rows = parseRaw(diff.out);
  // ⚠️ **台账三面符号要先读出来**（2026-11-11 实测补）—— 因为「工作树面那一格」
  //   **不能被「暂存面零差异」吞掉** ⇒ ⇒ 「当前恰好零差异」会把一整族缺陷掩盖掉
  //   ⇒ ⇒ 而「工作树正在丢已提交的内容」这件事**恰恰发生在暂存面干净的时候**
  //   （还没 `git add`）⇒ ⇒ 所以这一格必须独立于 rows 算。
  const headLedgerSymbols = {};
  const indexLedgerSymbols = {};
  const worktreeLedgerSymbols = {};
  // ⚠️ **条目正文**（R5／W2 要用）—— 台账是**若干条**，不是一整块文本 ⇒ ⇒ 必须**分块**比
  const headLedgerEntries = {};
  const indexLedgerEntries = {};
  const worktreeLedgerEntries = {};
  const historyLedgerEntries = {};
  const worktreeWholeOld = {};
  for (const p of LEDGER_PATHS) {
    const h = gitTry(['show', 'HEAD:' + p], root);
    if (!h.ok) continue;
    headLedgerSymbols[p] = [...ledgerSymbols(h.out)];
    headLedgerEntries[p] = ledgerEntries(h.out);
    const i = gitTry(['show', ':' + p], root);
    if (i.ok) {
      indexLedgerSymbols[p] = [...ledgerSymbols(i.out)];
      indexLedgerEntries[p] = ledgerEntries(i.out);
    }
    // ⚠️ **工作树面那一格**（2026-11-11 真机实测补）—— 路径相对**仓根**（与 diff --raw 同一基准）
    //   ⇒ ⇒ null ＝ 文件不存在（整本账被删）｜数组 ＝ 读到了，取它的条目符号
    const abs = join(root, p);
    if (!existsSync(abs)) { worktreeLedgerSymbols[p] = null; worktreeLedgerEntries[p] = null; continue; }
    const wtText = readFileSync(abs, 'utf8');
    worktreeLedgerSymbols[p] = [...ledgerSymbols(wtText)];
    worktreeLedgerEntries[p] = ledgerEntries(wtText);
    // ── R5／W2 要跟「历史上那一版」比 ⇒ ⇒ 只在**真需要**时才取历史（省开销）──
    const stagedChanged = !!indexLedgerEntries[p] && !entriesEqual(indexLedgerEntries[p], headLedgerEntries[p]);
    const wtChanged = !entriesEqual(worktreeLedgerEntries[p], headLedgerEntries[p]);
    if (!stagedChanged && !wtChanged) continue;
    const lg = gitTry(['log', '--format=%H', '-n', String(HISTORY_LIMIT), '--', p], root);
    if (!lg.ok) continue;
    const revs = lg.out.trim().split('\n').filter(Boolean);
    const queries = revs.map(rv => rv + ':' + p);
    // ⚠️ **便宜的一问**：工作树（归一后）是不是**历史上某一版**？⇒ ⇒ 整份旧版 ⇒ ⇒
    //   那是「整文件旧版」这个事实（不是段落级）⇒ ⇒ W2 不必重复出声。
    if (wtChanged) {
      const wtSha = gitBlobSha1(wtText);
      const shas = resolveBlobs(root, queries);
      for (const q of queries) if (shas.get(q) === wtSha) { worktreeWholeOld[p] = true; break; }
    }
    if (!stagedChanged && worktreeWholeOld[p]) continue;   // 不需要正文（省掉整本账的历史读）
    const contents = resolveBlobContents(root, queries);
    const list = [];
    for (const rv of revs) {
      const c = contents.get(rv + ':' + p);
      if (!c) continue;
      list.push({ rev: rv.slice(0, 7), entries: ledgerEntries(c.content) });
    }
    historyLedgerEntries[p] = list;
  }
  if (!rows.length) {
    const only = classifyIndexFace([], { oldCommitFor: () => null, headLedgerSymbols, indexLedgerSymbols, worktreeLedgerSymbols, headLedgerEntries, indexLedgerEntries, worktreeLedgerEntries, historyLedgerEntries, worktreeWholeOld });
    return {
      code: 0,
      violations: [],
      hints: only.hints,
      scanned: 0,
      note: '暂存区与 HEAD 逐字一致 ⇒ ⇒ **暂存面**这一格没有待判的东西 ⇒ ⇒ ⚠️ CI 的干净检出也长这样 ⇒ ⇒ 「零回退」在这里是**构造出来的** ⇒ ⇒ 不作数（它证明的是「没提交的东西里没有回退」，不是「这个仓没问题」）⇒ ⇒ ⚠️ 而**工作树面**那一格仍可能出声（见下面）',
    };
  }
  // 每个被改的路径：往回看历史，找出「暂存区内容 == 哪一次旧提交」
  const changed = rows.filter(r => r.status === 'M');
  const queries = [];
  const revsByPath = new Map();
  for (const row of changed) {
    const lg = gitTry(['log', '--format=%H', '-n', String(HISTORY_LIMIT), '--', row.path], root);
    if (!lg.ok) continue;
    const revs = lg.out.trim().split('\n').filter(Boolean);
    revsByPath.set(row.path, revs);
    for (const rev of revs) queries.push(rev + ':' + row.path);
  }
  const resolved = resolveBlobs(root, queries);
  const oldCommitFor = (path, blob) => {
    const revs = revsByPath.get(path) || [];
    for (const rev of revs) {
      if (resolved.get(rev + ':' + path) === blob) return rev.slice(0, 7);
    }
    return null;
  };
  // ⚠️ **工作树面只作定性交叉**（2026-11-11 真机实测补）—— R1 说得出「索引面是旧版」，
  //   说不出「**谁**把它放进去的」⇒ ⇒ 用工作树那一面把三种情况分开：
  //   · 工作树 == HEAD 的内容 ⇒ ⇒ **过期暂存**（没有任何人在回退内容）；
  //   · 工作树 == 索引那份 ⇒ ⇒ 有人在工作树里把旧版写了回来 ⇒ ⇒ 需要人确认意图；
  //   · 工作树是第三种内容 ⇒ ⇒ 意图判不了。
  //   ⇒ ⇒ **判红不放松**（危害一样）⇒ ⇒ 但**归因**必须分档 ⇒ ⇒ 否则读数会把人指向不存在的人。
  // ⚠️ **工作树那一面也必须以仓根为基准**（见上面那段：pathspec 相对 cwd，工作树读也相对 cwd）。
  const worktreeBlob = new Map();
  for (const row of changed) {
    const w = gitTry(['hash-object', '--', row.path], root);
    if (w.ok && w.out.trim()) worktreeBlob.set(row.path, w.out.trim());
  }
  const { violations, hints } = classifyIndexFace(rows, {
    oldCommitFor,
    headLedgerSymbols,
    indexLedgerSymbols,
    worktreeLedgerSymbols,
    headLedgerEntries,
    indexLedgerEntries,
    worktreeLedgerEntries,
    historyLedgerEntries,
    worktreeWholeOld,
    worktreeBlobFor: (p) => worktreeBlob.get(p) || null,
  });
  return { code: violations.length ? 1 : 0, violations, hints, scanned: rows.length };
}

/* ── 自检：7 条真形状（临时 git 仓里造） ─────────────────────────── */
function selfTest() {
  const results = [];
  // ⚠️ **台账条目的四个版本**（R5／W2 的夹具）
  const ENT_A1 = '**Updated**: 2026-11-11 (㒀 **条目一**)\n\nA 版正文（旧的）\n';
  const ENT_B1 = '**Updated**: 2026-11-11 (㒀 **条目一**)\n\nB 版正文（回填过的）\n';
  const ENT_C2 = '**Updated**: 2026-11-11 (㒁 **条目二**)\n\nC 版正文\n';
  const ENT_NEW = '**Updated**: 2026-11-11 (㒂 **条目三**)\n\n新条目\n';
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

    // ⚠️ **条目正文必须有历史**（R5 ＝「正文 == 历史上逐字相同的那一版」）⇒ ⇒ 造两笔：
    //   v2 把正文写成 A、v3 回填成 B ⇒ ⇒ 于是「退回 A」有了一个可比的旧版。
    writeFileSync(join(dir, 'AGENTS.md'), ENT_A1);
    g(['add', '-A']); g(['commit', '-qm', 'v2 条目一正文 A']);
    writeFileSync(join(dir, 'AGENTS.md'), ENT_B1 + ENT_C2);
    g(['add', '-A']); g(['commit', '-qm', 'v3 条目一正文 B ＋ 条目二']);

    results.push(['暂存面干净 ⇒ 不红', runCheck(dir).code === 0]);

    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v2\n');
    g(['add', '-A']);
    g(['commit', '-qm', 'v2']);
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v1\n');
    g(['add', 'scripts/check-x.mjs']);
    const r2 = runCheck(dir);
    results.push(['退回旧版 ⇒ 恰好 1 红（R1）', r2.code === 1 && r2.violations.length === 1 && r2.violations[0].code === 'R1']);
    // ⚠️ **归因档位（2026-11-11 补）** —— 这一格的工作树**也是**旧版 ⇒ ⇒ 需要人确认意图。
    results.push(['工作树也是旧版 ⇒ 归因档位＝worktree-old（不许含糊成「有人在回退」）',
      !!r2.violations[0] && r2.violations[0].kind === 'worktree-old']);

    // ⚠️ **过期暂存**（2026-11-11 实测补）：index 是旧版、**工作树已经是 HEAD 的内容**
    //   ⇒ ⇒ **没有任何人在回退内容**（只是索引没跟上）⇒ ⇒ 判红**照旧**（危害一样：
    //   下一次 commit 会把索引那份带进历史）⇒ ⇒ 但**归因档位**必须与上面那档不同。
    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v1\n');
    g(['add', 'scripts/check-x.mjs']);
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v2\n'); // 工作树回到 HEAD 的内容（**不** add）
    const r2b = runCheck(dir);
    results.push(['过期暂存 ⇒ 仍然红（危害一样）', r2b.code === 1 && r2b.violations.length === 1]);
    results.push(['过期暂存 ⇒ 归因档位＝stale（不许说成「有人在回退内容」）',
      !!r2b.violations[0] && r2b.violations[0].kind === 'stale']);

    // ⚠️ **路径基准那族**（2026-11-11 实测补）：**在子目录里跑** ⇒ ⇒
    //   `git diff --cached --raw` 的路径相对**仓根**，`git hash-object -- <路径>` 相对 **cwd**
    //   ⇒ ⇒ 不归一 ⇒ ⇒ 读不到工作树那一面 ⇒ ⇒ 归因档位会错成「工作树里读不到」
    //   ⇒ ⇒ 修法：工作树那一面一律以**仓根**为基准读 ⇒ ⇒ 这一格钉住它。
    mkdirSync(join(dir, 'sub'), { recursive: true });
    const r2c = runCheck(join(dir, 'sub'));
    results.push(['在子目录里跑 ⇒ 归因档位仍是 stale（路径基准必须归一到仓根）',
      r2c.code === 1 && !!r2c.violations[0] && r2c.violations[0].kind === 'stale']);

    g(['reset', '-q', '--hard', 'HEAD']);
    g(['rm', '-q', '--cached', 'scripts/check-x.mjs']);
    const r3 = runCheck(dir);
    results.push(['暂存删除受保护的闸 ⇒ 红（R2）', r3.code === 1 && r3.violations.some(v => v.code === 'R2')]);

    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), '**Updated**: 2026-11-11 (㒁 **别的条目**)\n');
    g(['add', 'AGENTS.md']);
    const r4 = runCheck(dir);
    results.push(['台账少了条目 ⇒ 红（R4）', r4.code === 1 && r4.violations.some(v => v.code === 'R4')]);

    // ⚠️ **工作树面那一格**（2026-11-11 真机实测补）：台账符号在 HEAD 有、在**工作树**没有
    //   ⇒ ⇒ 工作树正在删一条已提交的台账条目 ⇒ ⇒ 若 `git add` 它 ⇒ ⇒ 暂存面会判红（R4）
    //   ⇒ ⇒ ⇒ ⇒ **⇒ ⇒ 所以工作树面这一格**提前出声**（提示层）—— 而工作树本来就在飞
    //   ⇒ ⇒ ⇒ ⇒ **⇒ ⇒ 「少了」不总是错（有意删条目也合法）⇒ ⇒ 只出声，不判红**。
    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), '**Updated**: 2026-11-11 (㒁 **别的条目**)\n');
    const r4b = runCheck(dir);
    results.push(['工作树面少了台账条目符号 ⇒ 出声但**不判红**（W1）',
      r4b.code === 0 && r4b.hints.some(h => h.code === 'W1')]);

    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'scripts', 'check-x.mjs'), 'v2-new\n');
    g(['add', 'scripts/check-x.mjs']);
    const r5 = runCheck(dir);
    results.push(['普通改动 ⇒ 不红', r5.code === 0 && r5.hints.some(h => h.code === 'H1')]);

    g(['reset', '-q', '--hard', 'HEAD']);
    g(['update-index', '--chmod=+x', 'scripts/check-x.mjs']);
    const r6 = runCheck(dir);
    results.push(['只翻权限位 ⇒ 不判红但必须被点名（M1）', r6.code === 0 && r6.hints.some(h => h.code === 'M1')]);

    // ⚠️ **段落级（条目级）静悄悄回退**（2026-11-11 真机实测补）—— 这是 R1 与 R4 中间的那条缝：
    //   · 整文件**不是**旧版 ⇒ ⇒ R1 不响；
    //   · 条目**符号还在** ⇒ ⇒ R4 不响；
    //   · 而那一条的**正文**被换成了它**历史上逐字相同**的旧版 ⇒ ⇒ 静悄悄回退。
    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), ENT_A1 + ENT_C2 + ENT_NEW);
    g(['add', 'AGENTS.md']);
    const r5a = runCheck(dir);
    results.push(['段落级回退 ⇒ 红（R5）—— R1／R4 都看不见的那一格',
      r5a.code === 1 && r5a.violations.some(v => v.code === 'R5' && v.symbol === '㒀')]);
    // ⚠️ **合法回填不许命中**：正文是**全新**内容（历史里没有）⇒ ⇒ 零噪声
    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), ENT_B1 + ENT_C2 + ENT_NEW);
    g(['add', 'AGENTS.md']);
    const r5b = runCheck(dir);
    results.push(['合法回填（正文是全新内容）⇒ 不红（R5 零噪声）',
      r5b.code === 0 && !r5b.violations.some(v => v.code === 'R5')]);
    // ⚠️ **整文件旧版 ⇒ R1 说了算 ⇒ 不重复数 R5**（同一个事实数两遍 ⇒ ⇒ 分母失真）
    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), ENT_A1);
    g(['add', 'AGENTS.md']);
    const r5c = runCheck(dir);
    results.push(['整文件旧版 ⇒ R1 说清楚 ⇒ 不再报 R5（不重复数）',
      r5c.code === 1 && r5c.violations.some(v => v.code === 'R1') && !r5c.violations.some(v => v.code === 'R5')]);
    // ⚠️ **工作树面同一格 ⇒ 出声但不判红**（W2：工作树本来就在飞）
    g(['reset', '-q', '--hard', 'HEAD']);
    writeFileSync(join(dir, 'AGENTS.md'), ENT_A1 + ENT_C2 + ENT_NEW);
    const r5d = runCheck(dir);
    results.push(['工作树面段落级回退 ⇒ 出声但不判红（W2）',
      r5d.code === 0 && r5d.hints.some(h => h.code === 'W2')]);

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
console.log('   ℹ️ [面] 判红**只由暂存面**决定（index vs HEAD）｜**工作树面只作定性交叉**（说清「谁的责任」那一格）');
if (res.note) console.log('   ℹ️ [N0] ' + res.note);
for (const v of res.violations) {
  console.log('   [' + v.code + '] ' + v.msg);
  if (v.kind) {
    console.log('        ↳ 归因档位：' + (R1_KIND_LABEL[v.kind] || v.kind));
    console.log('        ↳ 修法：' + (v.fix || '（未登记）'));
  }
}
for (const h of res.hints) console.log('   ℹ️ [' + h.code + '] ' + h.msg);
console.log(res.violations.length ? ('✘ ' + res.violations.length + ' 处暂存面回退') : '✓ 暂存面零回退');
process.exit(res.code);
