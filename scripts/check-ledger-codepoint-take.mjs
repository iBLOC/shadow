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
import { findTakeViolations, violationIdentity, canonicalViolations, entriesOfCommit, declaredCodepoints, selfTest, semanticExemption } from './lib/ledger-codepoint-take.mjs';

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
      // ⚠️ **完整 sha** 也要带上 ⇒ ⇒ 语义豁免层要读「那一笔**之前**」的账本全文。
      events.push({ space: SPACE_OF[rel], id: c.sha.slice(0, 8), sha: c.sha, date: c.date, text });
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
    // ⚠️ `sha: 'delta'` ⇒ ⇒ 语义豁免层读「之前那一版」时改读 HEAD（未提交 ⇒ ⇒ 落笔时刻不可考）。
    events.push({ space: SPACE_OF[rel], id: 'delta', sha: 'delta', date: today, text: lines.join('\n') });
  }
  return events;
}

const digest = (s) => createHash('sha256').update(s).digest('hex');

/** space ⇒ 账本路径（判「读哪本」用）。 */
const REL_OF_SPACE = Object.fromEntries(LEDGERS.map((l) => [l.space, l.rel]));

/**
 * 读「那一笔**之前**」的账本全文 —— 语义豁免层的方向判定靠它。
 *
 * ⚠️ **读不到 ≠ 判绿** ⇒ ⇒ 读不出来要**报**（退出码 2 那一档）⇒ ⇒ 不能悄悄当空。
 * ⚠️ 路径在那一版**还不存在**（＝ 那一笔是这个账本的第一笔）⇒ ⇒ 那是**空** ⇒ ⇒ 不是读不到。
 */
function readPrevLedger(v) {
  const rel = REL_OF_SPACE[v.space];
  if (!rel) return { error: '不知道 space ' + v.space + ' 对应哪本账本' };
  const spec = (v.sha && v.sha !== 'delta') ? v.sha + '^:' + rel : 'HEAD:' + rel;
  try {
    return { text: git(['show', spec]) };
  } catch (e) {
    const msg = String((e && (e.stderr || e.message)) || '').toString();
    if (/does not exist|exists on disk|Path .* not found|Invalid path|unknown revision/i.test(msg)) {
      return { text: '' };
    }
    return { error: '读不到 ' + spec + '（' + msg.split('\n')[0].slice(0, 120) + '）' };
  }
}

/**
 * 逐条过**语义豁免层** —— 豁免的 ⇒ ⇒ **不算红**（合法例外不再假红）。
 *
 * ⚠️ 「明写的空洞」是**否决项** ⇒ ⇒ 照样红（更重的一类）⇒ ⇒ 豁免层不是「什么都能洗白」。
 *
 * @param {any[]} raw 原始新增违例
 * @param {(v:any)=>{text?:string,error?:string}} prevTextOf 读「之前那一版」的函数
 */
function judgeFresh(raw, prevTextOf) {
  const out = [];
  for (const v of raw) {
    const prev = prevTextOf(v);
    if (prev.error) return { error: prev.error };
    // ⚠️ **语义豁免层只管 A 族** ⇒ ⇒ B 族（撞上别人明写留过的让开位／缓冲）**不豁免**
    //    ⇒ ⇒ 台账原文：「按惯例**再留一枚缓冲（U+3499）**」＝ 那一枚是**让给别人**的。
    const ex = v.kind === 'A-backfill-hole'
      ? semanticExemption({ prevText: prev.text || '', entryText: v.entryBody || '', hex: v.cp })
      : { exempt: false, kind: 'not-applicable', reason: 'B 族（撞上别人明写留过的让开位／缓冲）**不豁免** ⇒ ⇒ 台账原文：「按惯例**再留一枚缓冲**」＝ 那一枚是**让给别人**的' };
    out.push({ v, ex });
  }
  return { out };
}

/**
 * **基线违例集**（豁免权的出处）—— 主判定与演练**共用这一处实现**。
 *
 * ⚠️ 指纹**不在**这里校 ⇒ ⇒ `--report`（诊断口）仍能在指纹不符时打印读数。
 */
function baselineSet() {
  const commits = readHistory();
  const baseShas = new Set(
    git(['rev-list', '--reverse', BASELINE_COMMIT, '--', ...PATHS])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!baseShas.size) {
    return { error: '基线 commit ' + BASELINE_COMMIT.slice(0, 8) + ' 触不到任何账本提交' };
  }
  const base = findTakeViolations(buildEvents(commits, baseShas));
  const baseCanonical = canonicalViolations(base.violations);
  return {
    commits,
    violations: base.violations,
    stats: base.stats,
    digest: digest(baseCanonical),
    baseSet: new Set(base.violations.map(violationIdentity)),
  };
}

function main() {
  // ⚠️ 基线违例集（豁免权的出处）⇒ ⇒ **主判定与演练共用这一处实现**。
  const base = baselineSet();
  if (base.error) {
    console.error('❌ 判不了（退出码 2）：' + base.error);
    return 2;
  }
  if (process.argv.includes('--report')) {
    console.log('基线 commit ' + BASELINE_COMMIT.slice(0, 8) + ' 上的历史违例 ' + base.violations.length + ' 条：');
    for (const v of base.violations) {
      console.log('  ' + v.kind.padEnd(16) + ' U+' + v.cp + '  ' + v.space + '  ' + v.id + '  ' + v.date);
    }
    console.log('每 space：' + JSON.stringify(base.stats));
    return 0;
  }
  if (BASELINE_DIGEST !== base.digest) {
    console.error('❌ 判不了（退出码 2）：基线违例集的指纹不符');
    console.error('   钉死的是 ' + BASELINE_DIGEST);
    console.error('   实算是 ' + base.digest);
    return 2;
  }
  const baseSet = base.baseSet;
  const baseDigest = base.digest;
  const commits = base.commits;

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
    const raw = r.violations.filter((v) => !baseSet.has(violationIdentity(v)));
    // ⚠️ **语义豁免层** ⇒ ⇒ 合法例外（保留位兑现／自陈理由）**不再假红**
    //    ⇒ ⇒ 但「明写的空洞」是**否决项** ⇒ ⇒ 照样红（更重的一类）。
    const judged = judgeFresh(raw, readPrevLedger);
    if (judged.error) {
      console.error('❌ 判不了（退出码 2）：' + judged.error);
      return 2;
    }
    const fresh = judged.out.filter((j) => !j.ex.exempt);
    const exempt = judged.out.filter((j) => j.ex.exempt);
    if (f.judge) red += fresh.length;
    console.log(
      '  ' + f.name + '面 ⇒ ⇒ 违例 ' + r.violations.length + ' 条（存量 ' + (r.violations.length - raw.length) + ' ／ 新增 ' + raw.length + '）' +
        (exempt.length ? '　✅ 其中**语义豁免** ' + exempt.length + ' 条' : '') +
        (f.judge ? '' : '　⚠ **本面只报不判红** —— 未提交条目的取号时刻不可考 ⇒ ⇒ 那一格**判不了**'),
    );
    for (const j of exempt) {
      console.log('      ✅ ' + j.v.kind + ' U+' + j.v.cp + ' @' + (SPACE_NAME[j.v.space] || j.v.space) + ' ' + j.v.id + ' ' + j.v.date + ' ⇒ ⇒ **语义豁免**（' + j.ex.kind + '）');
      console.log('        ' + j.ex.reason);
    }
    for (const j of fresh) {
      const v = j.v;
      console.log('      ⚠ ' + v.kind + ' U+' + v.cp + ' @' + (SPACE_NAME[v.space] || v.space) + ' ' + v.id + ' ' + v.date);
      console.log('        ' + v.reason);
      if (j.ex.kind === 'declared-hole') console.log('        ⛔ ' + j.ex.reason);
    }
  }
  if (red) {
    console.error('阻断：' + red + ' 条新增取号违例');
    return 1;
  }
  console.log('全绿：没有新增的取号违例');
  return 0;
}

/**
 * **靶子选点**：从真实账本里挑一个「**没被声明过**」且低于最高已声明的号。
 *
 * ⚠️ 必须挑**真实未声明**的号 ⇒ ⇒ 否则注入会被「重复声明」跳过 ⇒ ⇒ 演练空转
 *   ⇒ ⇒ 症状：**候选 0 条**＋「尺子咬住了：否」⇒ ⇒ 看着像闸没劲，其实是夹具没造全
 *   （实测踩过：U+33C1 早被占过 ⇒ ⇒ 闸自检那条反向验证**一直是死的**）。
 */
function pickHoleTarget() {
  const headText = git(['show', 'HEAD:AGENTS.md']);
  const declared = new Set(declaredCodepoints(headText).map((d) => d.cp));
  const stats = findTakeViolations(buildEvents(readHistory())).stats;
  const maxDeclared = parseInt(stats.parent.maxDeclared, 16);
  for (let cp = maxDeclared - 1; cp >= 0x3200; cp--) {
    const h = cp.toString(16).toUpperCase().padStart(4, '0');
    if (!declared.has(h)) {
      return { hex: h, cp, glyph: String.fromCodePoint(cp), maxDeclared: stats.parent.maxDeclared };
    }
  }
  return null;
}

/**
 * 副本演练（绿 → 红 → 绿）—— 四格读数：
 *   ❶ 真账本（提交树面，基线之外）⇒ ⇒ **零新增红**；
 *   ❷ 注入**盲回填**（无据）⇒ ⇒ **判红** ⇒ ⇒ 尺子咬得住；
 *   ❸ 注入**自陈理由**的那一笔 ⇒ ⇒ **不红** ⇒ ⇒ 合法例外这条路走得通；
 *   ❹ 同一笔但**先前状态明写为空洞** ⇒ ⇒ **照样红** ⇒ ⇒ 更重的一类没被放过。
 */
function drill() {
  const base = baselineSet();
  if (base.error) { console.error('❌ ' + base.error + ' ⇒ ⇒ 演练判不了'); return false; }
  const events = buildEvents(base.commits);
  const freshReal = findTakeViolations(events).violations
    .filter((v) => !base.baseSet.has(violationIdentity(v)));
  const target = pickHoleTarget();
  if (!target) { console.error('❌ 找不到未被声明的空位 ⇒ ⇒ 演练判不了（尺子没有靶子）'); return false; }
  const holeHex = target.hex;
  const holeGlyph = target.glyph;
  const head = '**Updated**: 2099-01-01 (' + holeGlyph + ' **注入** —— 夹具）';
  const blind = { space: 'parent', id: 'inject-blind', date: '2099-01-01', sha: 'delta', text: head + '\n⑨ 本条占 U+' + holeHex + '（' + holeGlyph + '）。\n' };
  const justified = { space: 'parent', id: 'inject-just', date: '2099-01-02', sha: 'delta', text: head + '\n⑨ 本条占 U+' + holeHex + '（' + holeGlyph + '）—— 避开 U+3300–U+33FF（NFKC 会变形）。\n' };
  const probe = (ev, prevText) => {
    const vs = findTakeViolations(events.concat([ev])).violations
      .filter((v) => v.cp === holeHex && v.kind === 'A-backfill-hole');
    const j = judgeFresh(vs, () => ({ text: prevText }));
    return { cand: vs.length, red: j.out.filter((x) => !x.ex.exempt).length };
  };
  const rBlind = probe(blind, '');
  const rJust = probe(justified, '');
  const rHole = probe(justified, 'U+' + holeHex + ' 空着不填。');
  console.log('  靶子选点：U+' + holeHex + '（低于**全历史**最高已声明 U+' + target.maxDeclared + ' ＋ 真实未被声明）');
  const ok = freshReal.length === 0 && rBlind.cand === 1 && rBlind.red === 1
    && rJust.cand === 1 && rJust.red === 0 && rHole.red === 1;
  console.log('  真实账本（提交树面，基线之外）⇒ ⇒ 新增违例 ' + freshReal.length + ' 条 ⇒ ⇒ 绿');
  console.log('  注入**盲回填**（无据）⇒ ⇒ 候选 ' + rBlind.cand + ' 条 ／ 判红 ' + rBlind.red + ' 条 ⇒ ⇒ 尺子咬住了：' + (rBlind.red === 1 ? '是' : '否'));
  console.log('  注入**自陈理由**（纪律词 ＋ 证据令牌）⇒ ⇒ 候选 ' + rJust.cand + ' 条 ／ 判红 ' + rJust.red + ' 条 ⇒ ⇒ 豁免路走得通：' + (rJust.red === 0 ? '是' : '否'));
  console.log('  同一笔 ＋ **先前状态明写为空洞** ⇒ ⇒ 判红 ' + rHole.red + ' 条 ⇒ ⇒ 更重的一类照样红：' + (rHole.red === 1 ? '是' : '否'));
  console.log('  真文件未被改动（演练只读不改）：是');
  return ok;
}

/* ------------------------------ 自检 ------------------------------ */
function runSelfTest() {
  const rc = selfTest();
  if (rc !== 0) return rc;
  // 反向验证 ①：注入一笔「低于高水位」的声明 ⇒ ⇒ 判据必须红。
  // ⚠️ 靶子**必须**是真实没被声明过的号 ⇒ ⇒ 否则会被「重复声明」跳过 ⇒ ⇒ 这条断言会**永远红**
  //   （而它此前**从来没跑过** ⇒ ⇒ 因为核心库底部自己 exit 了 ⇒ ⇒ 闸的这段自检是**死代码**）。
  const commits = readHistory();
  const events = buildEvents(commits);
  const target = pickHoleTarget();
  if (!target) { console.error('  ✗ 找不到未被声明的空位 ⇒ ⇒ 自检判不了（尺子没有靶子）'); return 2; }
  const head = '**Updated**: 2099-01-01 (' + target.glyph + ' **注入** —— 夹具）';
  const before = findTakeViolations(events).violations.length;
  const fake = { space: 'parent', id: 'inject', date: '2099-01-01', sha: 'delta', text: head + '\n⑨ 本条占 U+' + target.hex + '（' + target.glyph + '）。\n' };
  const after = findTakeViolations(events.concat([fake])).violations.length;
  const ok = after > before;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '反向验证 ①：注入一笔「低于高水位」的声明（U+' + target.hex + '）⇒ ⇒ 违例数 ' + before + ' → ' + after);
  if (!ok) return 2;

  // 反向验证 ②：**自陈理由**的那一笔 ⇒ ⇒ 必须**不红**（语义豁免层不是摆设）。
  const justified = { space: 'parent', id: 'inject-j', date: '2099-01-02', sha: 'delta', text: head + '\n⑨ 本条占 U+' + target.hex + '（' + target.glyph + '）—— 避开 U+3300–U+33FF（NFKC 会变形）。\n' };
  const jIn = findTakeViolations(events.concat([justified])).violations
    .filter((v) => v.cp === target.hex && v.kind === 'A-backfill-hole');
  const jRed = judgeFresh(jIn, () => ({ text: '' })).out.filter((j) => !j.ex.exempt).length;
  const ok2 = jIn.length === 1 && jRed === 0;
  console.log((ok2 ? '  ✓ ' : '  ✗ ') + '反向验证 ②：注入一笔**自陈理由**的「低于高水位」声明 ⇒ ⇒ 候选 ' + jIn.length + ' 条 ／ **判红** ' + jRed + ' 条 ⇒ ⇒ 合法例外不再假红');
  if (!ok2) return 2;

  // 反向验证 ③：同一笔，但**先前状态里那一位被明写为空洞** ⇒ ⇒ 必须**照样红**。
  const hRed = judgeFresh(jIn, () => ({ text: 'U+' + target.hex + ' 空着不填。' })).out.filter((j) => !j.ex.exempt).length;
  const ok3 = hRed === 1;
  console.log((ok3 ? '  ✓ ' : '  ✗ ') + '反向验证 ③：同一笔，但先前状态**明写为空洞** ⇒ ⇒ 判红 ' + hRed + ' 条 ⇒ ⇒ 更重的一类照样红');
  if (!ok3) return 2;

  console.log('自检全过');
  return 0;
}

if (process.argv.includes('--self-test')) {
  process.exit(runSelfTest());
}

if (process.argv.includes('--drill')) {
  process.exit(drill() ? 0 : 1);
}

process.exit(main());