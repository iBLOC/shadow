#!/usr/bin/env node
/**
 * 「**取号**纪律」的判定闸 —— 把两族只活在习惯里的纪律做成尺子。
 *
 * ## 守什么
 *
 * 官方圈码闸（`check-ledger-codepoints.mjs`）守的是「**两个条目占同一个码位**」（R1）
 * ⇒ ⇒ 而「**取号**」这一步另有两族它管不着的错（判据纯函数在
 * `scripts/lib/ledger-codepoint-take.mjs`）：
 *
 * · **A（回填历史空洞）** —— 新条目占的码位 **低于**该账本**此刻**的最高已声明
 *   ⇒ ⇒ 症状：按「最高+1」推下一枚的人，会推出一个**已经被占过**的号。
 * · **B（撞上别人明写的让开位）** —— 新条目占的码位，别人**在更早的笔里**
 *   已经**明写**留作缓冲／让开 ⇒ ⇒ 症状同上。
 *
 * ## ⚠️ 时间线＝**git 提交顺序**，不是账本里的文件位置
 *
 * · 台账条目插在**顶部** ⇒ ⇒ 「行号大＝旧」只在**同一笔**内成立；
 * · 实测（2026-11-11）父仓账本**底部**有两条 2026-11-11 的条目是**插错位置**的
 *   ⇒ ⇒ 只按行号排 ⇒ ⇒ 判据会把「历史」读成「未来」；
 * · 而且账本里有**重复副本**（并发插同一条目）⇒ ⇒ 行号更不能当时间线；
 * · ⇒ ⇒ **提交顺序**是唯一能跨进程复原的顺序 ⇒ ⇒ 本闸按**提交时间**排。
 *
 * ## ⚠️ 阈值**逐账本**算
 *
 * 父仓／移动端／桌面端**各有自己的编号段** ⇒ ⇒ 移动端取 U+331B 时父仓已到
 * U+34AF ⇒ ⇒ 那**不是**回填（它在**它自己那一段**里就是下一个号）⇒ ⇒
 * ⇒ ⇒ 跨段比大小无意义。
 *
 * ## 三个面
 *
 * 提交树（git 历史）／索引／工作树 ⇒ ⇒ 逐面报 ⇒ ⇒ 谁红就点名哪个面。
 *
 * ## 豁免权的来源＝**基线 commit 的历史事实**
 *
 * 基线违例集 ＝ 在基线 commit 上跑同一条判据得到的历史事实 ⇒ ⇒ 其指纹
 * （sha256）**钉死在本文件里** ⇒ ⇒ 改基线就要改指纹 ⇒ ⇒ 那是**代码改动**
 * ⇒ ⇒ review 看得见 ⇒ ⇒ 「悄悄洗白」这条路被堵死。
 *
 * ## 退出码
 *
 * · 0 —— 全绿；· 1 —— 有红（新增违例）；· 2 —— 判不了（基线读不出来／指纹不符）。
 *
 * ## 用法
 *
 *   node scripts/check-ledger-codepoint-take.mjs            # 判定（三个面）
 *   node scripts/check-ledger-codepoint-take.mjs --self-test # 自检（正控＋反向注入）
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTakeViolations, violationIdentity, canonicalViolations, entriesOfCommit, selfTest } from './lib/ledger-codepoint-take.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const LEDGERS = [
  { name: '父仓', rel: 'AGENTS.md', space: 'parent' },
  { name: '移动端', rel: 'shadow-mobile/AGENTS.md', space: 'mobile' },
  { name: '桌面端', rel: 'shadow-desktop/AGENTS.md', space: 'desktop' },
];
const PATHS = LEDGERS.map((l) => l.rel);
const SPACE_OF = Object.fromEntries(LEDGERS.map((l) => [l.rel, l.space]));
const SPACE_NAME = Object.fromEntries(LEDGERS.map((l) => [l.space, l.name]));
const NAME_OF = Object.fromEntries(LEDGERS.map((l) => [l.rel, l.name]));

/**
 * ⚠️ **基线 commit** —— 存量违例豁免的唯一出处。
 *
 * 选它：闸落地那一刻的 HEAD ⇒ ⇒ 它的历史事实就是「闸落地前账本已有的违例」。
 */
const BASELINE_COMMIT = '87608a0367d1ad70b88d493e3fc030fbf714be88';

/** ⚠️ **基线违例集的指纹 —— 钉死在这里**（改基线就要改它 ⇒ ⇒ 代码改动 ⇒ review 看得见）。 */
const BASELINE_DIGEST = '305b4ef6000e95a1daecf107f25f602ef320d4eb25c54cbac5f4d6d70f7115ff';

const git = (args) =>
  execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });

/** 解析一份 unified=0 的 diff ⇒ {rel: [新增行]}。 */
function parseDiff(text) {
  const out = {};
  let file = null;
  for (const ln of text.split('\n')) {
    if (ln.startsWith('diff --git ')) {
      const m = ln.match(/ b\/(.+)$/);
      file = m ? m[1] : null;
      continue;
    }
    if (ln.startsWith('+++ ')) {
      const m = ln.match(/\+\+\+ b\/(.+)$/);
      file = m ? m[1] : file;
      continue;
    }
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      if (!file) continue;
      (out[file] = out[file] || []).push(ln.slice(1));
    }
  }
  return out;
}

/** 账本的**历史**（一次 git 调用读完）⇒ [{sha, ct, date, adds}]，按提交时间升序。 */
function readHistory() {
  const out = git(['log', '--reverse', '-p', '--unified=0', '--date=short', '--format=@@@%H|%ct|%ad', '--', ...PATHS]);
  const commits = [];
  let cur = null;
  let file = null;
  for (const ln of out.split('\n')) {
    if (ln.startsWith('@@@')) {
      const [sha, ct, date] = ln.slice(3).split('|');
      cur = { sha, ct: Number(ct), date, adds: {} };
      commits.push(cur);
      file = null;
      continue;
    }
    if (!cur) continue;
    if (ln.startsWith('diff --git ')) {
      const m = ln.match(/ b\/(.+)$/);
      file = m ? m[1] : null;
      continue;
    }
    if (ln.startsWith('+++ ')) {
      const m = ln.match(/\+\+\+ b\/(.+)$/);
      file = m ? m[1] : file;
      continue;
    }
    if (ln.startsWith('+') && !ln.startsWith('+++')) {
      if (!file) continue;
      (cur.adds[file] = cur.adds[file] || []).push(ln.slice(1));
    }
  }
  // 提交时间升序；同一秒按原序（git 的逆序输出）⇒ ⇒ 稳定。
  commits.forEach((c, i) => { c.idx = i; });
  commits.sort((a, b) => (a.ct - b.ct) || (a.idx - b.idx));
  return commits;
}

/** 历史 ⇒ 事件（每个 space 独立；每笔提交一个 text）。 */
function buildEvents(commits, shaSet) {
  const events = [];
  for (const c of commits) {
    if (shaSet && !shaSet.has(c.sha)) continue;
    for (const [rel, adds] of Object.entries(c.adds)) {
      if (!SPACE_OF[rel]) continue;
      const text = adds.join('\n');
      events.push({ space: SPACE_OF[rel], id: c.sha.slice(0, 8), date: c.date, text });
    }
  }
  return events;
}

/** 某个面的**增量**（相对 HEAD）⇒ 追加为最新的一笔。 */
function deltaEvents(args) {
  let text = '';
  try {
    text = git(['diff', ...args, '--', ...PATHS]);
  } catch {
    return [];
  }
  const adds = parseDiff(text);
  const events = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const [rel, lines] of Object.entries(adds)) {
    if (!SPACE_OF[rel]) continue;
    events.push({ space: SPACE_OF[rel], id: 'delta', date: today, text: lines.join('\n') });
  }
  return events;
}

const digest = (s) => createHash('sha256').update(s).digest('hex');

function main() {
  const commits = readHistory();
  // 基线可达的账本提交集（基线 commit 本身**不一定**碰账本 ⇒ ⇒ 用 rev-list 取可达集）。
  const baseShas = new Set(
    git(['rev-list', '--reverse', BASELINE_COMMIT, '--', ...PATHS])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!baseShas.size) {
    console.error('判不了：基线 commit ' + BASELINE_COMMIT + ' 触不到任何账本提交');
    return 2;
  }
  const baseEvents = buildEvents(commits, baseShas);
  const base = findTakeViolations(baseEvents);
  const baseCanonical = canonicalViolations(base.violations);
  if (process.argv.includes('--report')) {
    console.log('基线 commit ' + BASELINE_COMMIT.slice(0, 8) + ' 上的历史违例 ' + base.violations.length + ' 条：');
    for (const v of base.violations) {
      console.log('  ' + v.kind.padEnd(16) + ' U+' + v.cp + '  ' + v.space + '  ' + v.id + '  ' + v.date);
    }
    console.log('每 space：' + JSON.stringify(base.stats));
    return 0;
  }
  const baseDigest = digest(baseCanonical);
  if (BASELINE_DIGEST !== baseDigest) {
    console.error('判不了：基线违例集的指纹不符');
    console.error('  钉死的是 ' + BASELINE_DIGEST);
    console.error('  实算是 ' + baseDigest);
    return 2;
  }
  const baseSet = new Set(base.violations.map(violationIdentity));

  // ⚠️ 只有**提交树面**判红。
  //   索引／工作树面里的条目**还没提交** ⇒ ⇒ 它们「什么时候取的号」不可考
  //   （同一笔里可能夹着别的会话的在飞件 ⇒ ⇒ 顺序只有作者知道）⇒ ⇒
  //   ⇒ 那一格**判不了** ⇒ ⇒ 只**报**、不判红（不是「判过且没问题」）。
  const faces = [
    { name: '提交树', judge: true, events: buildEvents(commits) },
    { name: '索引', judge: false, events: buildEvents(commits).concat(deltaEvents(['--cached', 'HEAD'])) },
    { name: '工作树', judge: false, events: buildEvents(commits).concat(deltaEvents(['HEAD'])) },
  ];

  let red = 0;
  console.log('本闸守：取号纪律的两族 —— A 回填历史空洞／B 撞上别人明写的让开位');
  console.log('读数：基线 commit ' + BASELINE_COMMIT.slice(0, 8) + ' 上的历史违例 ' + base.violations.length + ' 条（指纹 ' + baseDigest.slice(0, 12) + '…）');
  for (const f of faces) {
    const r = findTakeViolations(f.events);
    const fresh = r.violations.filter((v) => !baseSet.has(violationIdentity(v)));
    if (f.judge) red += fresh.length;
    console.log(
      '  ' + f.name + '面 ⇒ ⇒ 违例 ' + r.violations.length + ' 条（存量 ' + (r.violations.length - fresh.length) + ' ／ 新增 ' + fresh.length + '）' +
        (f.judge ? '' : '　⚠ **本面只报不判红** —— 未提交条目的取号时刻不可考 ⇒ ⇒ 那一格**判不了**'),
    );
    for (const v of fresh) {
      console.log('      ⚠ ' + v.kind + ' U+' + v.cp + ' @' + (SPACE_NAME[v.space] || v.space) + ' ' + v.id + ' ' + v.date);
      console.log('        ' + v.reason);
    }
  }
  if (red) {
    console.error('阻断：' + red + ' 条新增取号违例');
    return 1;
  }
  console.log('全绿：没有新增的取号违例');
  return 0;
}

/* ------------------------------ 自检 ------------------------------ */
function runSelfTest() {
  const rc = selfTest();
  if (rc !== 0) return rc;
  // 反向验证：把一笔真实事件改成「回填历史空洞」的形状 ⇒ ⇒ 判据必须红。
  const commits = readHistory();
  const events = buildEvents(commits);
  const before = findTakeViolations(events).violations.length;
  const fake = { space: 'parent', id: 'inject', date: '2099-01-01', text: '**Updated**: 2099-01-01 (\u3403 **注入** —— 夹具)\n⑨ 本条占 U+33C1（\u3401）。\n' };
  const after = findTakeViolations(events.concat([fake])).violations.length;
  const ok = after > before;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '反向验证：注入一笔「低于高水位」的声明 ⇒ ⇒ 违例数 ' + before + ' → ' + after);
  if (!ok) return 2;
  console.log('自检全过');
  return 0;
}

if (process.argv.includes('--self-test')) {
  process.exit(runSelfTest());
}

process.exit(main());