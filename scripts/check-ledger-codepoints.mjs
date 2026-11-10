#!/usr/bin/env node
/**
 * 「账本圈码」的自洽性 —— 判定闸。
 *
 * ## 守什么
 *
 * R1'（**跨三账本**不撞号）／R2（注解自洽）／R3（缝合残迹）／R4（异体声明）／
 * R5（注解里的括号字形）／R6（**悬空引用**：引用必须指向现存条目）——
 * 判据纯函数在 scripts/lib/ledger-codepoints.mjs
 * （判据与 I/O 分离，脚本层只管跑）。
 *
 * ## ⚠️ 豁免权的来源＝**历史事实**，不是「某个文件里的一行」（2026-11-08 实测）
 *
 * 上一版把「既存撞号」记在 scripts/lib/ledger-codepoint-debt.json 里，闸读那份
 * JSON 来决定「哪些撞号不红」⇒ ⇒ **那份 JSON 就是一台洗白机**：往里加一行，
 * 一个**今天才出现**的撞号立刻变成「已登记」⇒ ⇒ 不再红 ⇒ ⇒ 纪律形同虚设。
 *
 * ⇒ ⇒ 现在豁免只认**基线 commit 的历史事实**：
 *   · 基线 commit ＝ b26af295…（2026-11-08 22:04，origin/master~45）
 *   · 那个 commit 上**三账本合计**的撞号集（48 个码位）＝ **唯一的豁免集**
 *   · 豁免集的**指纹**（sha256）**钉死在本文件里** ⇒ ⇒ 改基线就要改指纹
 *     ⇒ ⇒ 那是**代码改动** ⇒ ⇒ review 看得见 ⇒ ⇒ 「悄悄洗白」这条路被堵死
 *   · 债表（ledger-codepoint-debt.json）**降级为说明**（只提供「为什么」）
 *     ⇒ ⇒ 债表里多写一行**不产生任何豁免**（闸把它当「无效豁免」报出来）
 *
 * ## ⚠️ 判三个面：工作树／索引／提交树（2026-11-08 实测）
 *
 * 上一版只判**工作树** ⇒ ⇒ 于是 master 上**已经存在的**缺陷它一条都看不见：
 * 移动端账本 L116 的**并体事故**（行首锚被吞）在提交树里**仍在**（工作树里
 * 已拆行修好）⇒ ⇒ 「工作树绿、**提交树红**」⇒ ⇒ 「工作树绿 ≠ 提交树绿」。
 *
 * ⇒ ⇒ 现在三个面各判一遍、**逐面报** ⇒ ⇒ 谁红就点名哪个面 ⇒ ⇒
 * 「你修好了但没提交」与「master 就是坏的」不再被混成一句话。
 *
 * ## 退出码
 *
 * · 0 —— 全绿；· 1 —— 有红；· 2 —— 判不了（账本不在／基线读不出来／指纹不符）。
 *
 * ## 用法
 *
 *   node scripts/check-ledger-codepoints.mjs                 # 判定（三个面）
 *   node scripts/check-ledger-codepoints.mjs --self-test     # 自检（正控＋孪生）
 *   node scripts/check-ledger-codepoints.mjs --drill         # 副本演练（绿→红→绿）
 *   node scripts/check-ledger-codepoints.mjs --face=worktree # 只判工作树面
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { findViolations, findCollisions, extractEntries, findReferenceIssues, occupiedMap, hex4, canonicalSet, setDigest, collisionIdentities, fingerprintIdentities, identityDigest, danglingRefKeys, sameKeyMultiset } from './lib/ledger-codepoints.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * 三本账本 —— ⚠️ **共用一条码位序列** ⇒ ⇒ 查重必须**一起**做
 * （移动端账本自己的条目 ❸：「**查重必须跨账本**」）。
 *
 * ⚠️ rel ＝ 仓库内相对路径（给 git show 用）⇒ path ＝ 绝对路径（给 fs 用）。
 */
const LEDGERS = [
  { name: '父仓', rel: 'AGENTS.md', path: join(REPO, 'AGENTS.md') },
  { name: '移动端', rel: 'shadow-mobile/AGENTS.md', path: join(REPO, 'shadow-mobile', 'AGENTS.md') },
  { name: '桌面端', rel: 'shadow-desktop/AGENTS.md', path: join(REPO, 'shadow-desktop', 'AGENTS.md') },
];

/**
 * ⚠️ **基线 commit** —— 豁免集的唯一出处。
 *
 * 选它的实测过程（2026-11-08）：逐历史点扫描（be69c23~0..~60）测「那个 commit
 * 上三账本合计的撞号集」⇒ ⇒ be69c23~0..~3、~10..~51 与当时的工作树**完全相同**
 * （48 个码位、不含 U+340A）⇒ ⇒ ~4..~9、~52..~54、~56..~60 是 49 个（含 U+340A）
 * ⇒ ⇒ ~55 是 50 个 ⇒ ⇒ 连续不变的区间里**最老**的那个点是 b26af295（= origin/master~45，
 * 2026-11-08 22:04）⇒ ⇒ 取它 ⇒ ⇒ 且 git merge-base --is-ancestor 验过是 HEAD 的祖先。
 */
const BASELINE_COMMIT = 'b26af2956d3267be1ec358fc646edeb074c48d17';

/**
 * ⚠️⚠️ **基线撞号集的指纹 —— 钉死在这里**。
 *
 * 这是「洗白机」的封条：豁免集 = 基线 commit 的撞号集 ⇒ ⇒ 有人想让某个**新**撞号
 * 不红，只有三条路：① 改历史（不可能）② 改基线 commit（那要同时改这个指纹 ⇒ ⇒
 * **代码改动** ⇒ ⇒ review 看得见）③ 改债表（**不产生豁免** ⇒ ⇒ 无效）。
 *
 * 指纹 ＝ sha256(「码位大写、升序、逗号连接」的规范串)。
 */
const BASELINE_DIGEST = '39534f74b79f26b1b384835ab19974d792c6acf81356d2ea4f990d3740ea5fbb';

/**
 * ⚠️ **第二把封条** —— 基线**身份映射**的指纹。
 *
 * 第一把封条（码位集）只回答「这个码位历史上撞过吗」⇒ ⇒ 有一个**已知的洞**：
 * 若某条历史撞号被**重编号**腾出那个码位、之后**别的条目**又占同一个码位
 * ⇒ ⇒ 码位级豁免会把它当「历史遗留」放过去 ⇒ ⇒ **假绿**。
 *
 * ⇒ ⇒ 第二把封条把「那个码位当时是**哪些条目**」也钉住 ⇒ ⇒ 身份对不上 ⇒ ⇒ 红。
 * ⚠️ 身份键取标题**前 60 字符**（不是整行）⇒ ⇒ 实测：标题**尾部**的引用被重编号
 * ⇒ ⇒ 身份仍算一致（U+32E3 的活例）⇒ ⇒ 而「另一个条目占同一码位」⇒ ⇒ 必红。
 */
const BASELINE_IDENTITY_DIGEST = '7120c89b7c260131f1b5f296b073030a3cf3f4f7690b1547a0fdc43184be5435';

/**
 * 基线快照 —— **只是 git 历史读不到时的回落**（浅克隆／非 git 仓）。
 * ⚠️ 它**不是**豁免权的出处（出处是 git 历史）⇒ ⇒ 但它也要过指纹 ⇒ ⇒
 * 改了它而没改指纹 ⇒ ⇒ 闸判「指纹不符」⇒ ⇒ 退出码 2（判不了）。
 */
const BASELINE_SNAPSHOT_PATH = join(REPO, 'scripts', 'lib', 'ledger-codepoint-baseline.json');

/** 父仓账本的绝对路径（演练要用）。 */
const LEDGER_PATH = LEDGERS[0].path;

/** 既存撞号的**说明清单**（只提供「为什么」，**不产生豁免**）—— 见下。 */
const DEBT_PATH = join(REPO, 'scripts', 'lib', 'ledger-codepoint-debt.json');

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** 读说明清单（读不到 ⇒ 空清单 ⇒ ⇒ 只是没有说明，不影响豁免）。 */
function readDebt() {
  if (!existsSync(DEBT_PATH)) return { items: [] };
  try {
    return JSON.parse(readFileSync(DEBT_PATH, 'utf8'));
  } catch (e) {
    return { items: [], broken: String(e) };
  }
}

/** git show（失败 ⇒ null ⇒ ⇒ 那一面/那个 commit 读不到）。 */
function gitShow(spec) {
  try {
    return execFileSync('git', ['show', spec], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return null;
  }
}

/**
 * ⚠️ **豁免集的唯一出处** —— 基线 commit 上三账本合计的撞号集。
 *
 * 优先**现场从 git 历史重算**（那是事实本身）⇒ ⇒ 浅克隆／非 git 仓时回落到
 * 快照文件 ⇒ ⇒ 两条路都要过指纹。
 */
function loadBaseline() {
  const ledgers = [];
  for (const l of LEDGERS) {
    const text = gitShow(BASELINE_COMMIT + ':' + l.rel);
    if (text == null) { ledgers.push(null); break; }
    ledgers.push({ name: l.name, text });
  }
  if (ledgers.length === LEDGERS.length && ledgers.every(Boolean)) {
    const collisions = findCollisions(ledgers);
    const cps = collisions.map((c) => hex4(c.cp));
    const identities = {};
    for (const c of collisions) identities[hex4(c.cp)] = fingerprintIdentities(collisionIdentities(ledgers, c));
    // ⚠️ **基线标记集合** —— R6 用它把「②」这类**列表序号**排除在引用之外。
    const markers = new Set();
    for (const l of ledgers) for (const e of extractEntries(l.text).entries) if (e.actual) markers.add(e.actual);
    return {
      source: 'git:' + BASELINE_COMMIT.slice(0, 8),
      cps,
      identities,
      markers,
      digest: setDigest(cps),
      identityDigest: identityDigest(identities),
    };
  }
  if (existsSync(BASELINE_SNAPSHOT_PATH)) {
    try {
      const j = JSON.parse(readFileSync(BASELINE_SNAPSHOT_PATH, 'utf8'));
      const cps = (j.codepoints || []).map((c) => String(c).toUpperCase());
      const identities = j.identities || {};
      return {
        source: 'snapshot',
        cps,
        identities,
        digest: setDigest(cps),
        identityDigest: identityDigest(identities),
        commit: j.commit || null,
      };
    } catch (e) {
      return { error: '基线快照读不出来：' + String(e) };
    }
  }
  return { error: '既读不到基线 commit（' + BASELINE_COMMIT.slice(0, 8) + '）的历史，也没有基线快照文件' };
}

/** 单个账本面（纯文本 ⇒ 逐条判 R2/R3/R4/R5）。 */
export function checkText(text) {
  const v = findViolations(text);
  const out = [];
  for (const d of v.dups) {
    out.push('❌ [dup-codepoint] 码位 U+' + d.cp + ' 被 ' + d.lines.length + ' 条占用：行 ' + d.lines.join(', '));
  }
  for (const m of v.mismatched) {
    out.push('❌ [annotation-mismatch] 第 ' + m.line + ' 行：注解写 U+' + m.claimed + '，而标题里的「' + m.ch + '」真实码位是 U+' + m.actual);
  }
  for (const s of v.swallowed) {
    out.push('❌ [swallowed-anchor] 第 ' + s.line + ' 行：非标题行里嵌着「**Updated**: 日期」形状 ⇒ 行首锚被吞、前后条目并体（㌳ 事故形状）｜ ' + s.snippet);
  }
  for (const f of v.foreign) {
    out.push('❌ [foreign-declaration] 第 ' + f.line + ' 行起：条目体里出现别条的「本条占 U+' + f.claimed.join('/') + '」声明（自己的应是 U+' + f.actual + '）⇒ 条目并体');
  }
  for (const g of v.glyphMismatch || []) {
    out.push('❌ [glyph-mismatch] 第 ' + g.line + ' 行：注解写 U+' + g.claimed + '，而括号里的「' + g.glyph + '」真实码位是 U+' + g.glyphCp + ' ⇒ 注解在说假话（两个码位不同形，肉眼几乎看不出来）');
  }
  // ⚠️⚠️ **R7（孤儿声明）** —— 声明必须挂在自己那条的体内（2026-11-09 实测入库）。
  for (const o of v.orphanClaims || []) {
    out.push('❌ [orphan-declaration] 第 ' + o.line + ' 行：「本条占 U+' + o.claimed + '」**不归属任何条目** ⇒ ⇒ 那条条目的标题行被吞了（正文浮在文件里），或这是一条重复声明 ⇒ ⇒ 圈码声明必须挂在自己那条的体内｜ …' + o.snippet + '…');
  }
  return { v, out };
}

/**
 * 三账本判定：R1'（跨账本不撞号）＋ 逐账本的 R2/R3/R4/R5。
 *
 * ⚠️⚠️ **豁免只认 opts.exempt（基线集）** ⇒ ⇒ 债表（opts.debt）**不产生豁免**
 * ⇒ ⇒ 「往债表里加一行洗白」这条路被堵死（自检里有那根钉）。
 *
 * @param {{name: string, text: string}[]} ledgerTexts
 * @param {{exempt?: string[], debt?: {items?: {cp: string, reason?: string}[]}}} opts
 */
export function checkLedgers(ledgerTexts, opts = {}) {
  const out = [];
  const debts = [];
  const exempt = new Set((opts.exempt || []).map((c) => String(c).toUpperCase()));
  const identities = opts.identities || {};
  const warnings = [];
  const debtItems = (opts.debt && opts.debt.items) || [];
  const debtMap = new Map(debtItems.map((i) => [String(i.cp).toUpperCase(), i]));
  const agg = { mismatched: [], swallowed: [], foreign: [], dups: [], glyphMismatch: [], orphanClaims: [] };

  for (const l of ledgerTexts) {
    const v = findViolations(l.text);
    for (const m of v.mismatched) agg.mismatched.push({ ...m, ledger: l.name });
    for (const s of v.swallowed) agg.swallowed.push({ ...s, ledger: l.name });
    for (const f of v.foreign) agg.foreign.push({ ...f, ledger: l.name });
    for (const g of v.glyphMismatch || []) agg.glyphMismatch.push({ ...g, ledger: l.name });
    for (const o of v.orphanClaims || []) agg.orphanClaims.push({ ...o, ledger: l.name });
    for (const m of v.mismatched) {
      out.push('❌ [annotation-mismatch] ' + l.name + ' 第 ' + m.line + ' 行：注解写 U+' + m.claimed + '，而标题里的「' + m.ch + '」真实码位是 U+' + m.actual);
    }
    for (const s of v.swallowed) {
      out.push('❌ [swallowed-anchor] ' + l.name + ' 第 ' + s.line + ' 行：非标题行里嵌着「**Updated**: 日期」形状 ⇒ 行首锚被吞、前后条目并体｜ ' + s.snippet);
    }
    for (const f of v.foreign) {
      out.push('❌ [foreign-declaration] ' + l.name + ' 第 ' + f.line + ' 行起：条目体里出现别条的「本条占 U+' + f.claimed.join('/') + '」声明（自己的应是 U+' + f.actual + '）⇒ 条目并体');
    }
    for (const g of v.glyphMismatch || []) {
      out.push('❌ [glyph-mismatch] ' + l.name + ' 第 ' + g.line + ' 行：注解写 U+' + g.claimed + '，而括号里的「' + g.glyph + '」真实码位是 U+' + g.glyphCp + ' ⇒ 注解在说假话');
    }
    // ⚠️⚠️ **R7（孤儿声明）** —— 声明必须挂在自己那条的体内（2026-11-09 实测入库）。
    for (const o of v.orphanClaims || []) {
      out.push('❌ [orphan-declaration] ' + l.name + ' 第 ' + o.line + ' 行：「本条占 U+' + o.claimed + '」**不归属任何条目** ⇒ ⇒ 那条条目的标题行被吞了（正文浮在文件里），或这是一条重复声明 ⇒ ⇒ 圈码声明必须挂在自己那条的体内｜ …' + o.snippet + '…');
    }
  }

  const collisions = findCollisions(ledgerTexts);
  const collided = new Set();
  for (const c of collisions) {
    const hex = hex4(c.cp);
    collided.add(hex);
    const where = c.uses.map((u) => u.name + 'L' + u.line).join(', ');
    if (exempt.has(hex)) {
      // ⚠️ **身份级豁免** —— 码位在基线集里**还不够**：还得是**同一批条目**。
      const liveRaw = collisionIdentities(ledgerTexts, c);
      const liveIds = fingerprintIdentities(liveRaw);
      const baseIds = (identities[hex] || []).slice().sort();
      if (baseIds.length === 0) {
        warnings.push('⚠️ [identity-missing] 码位 U+' + hex + ' 在基线集里，但基线快照没有它的身份记录 ⇒ ⇒ 本次只按码位豁免 ⇒ ⇒ 下次要把快照重新生成');
        debts.push({ hex, where, reason: (debtMap.get(hex) || {}).reason || '' });
        continue;
      }
      // ⚠️⚠️ **子集语义**（不是「完全相等」）—— 2026-11-08 实测踩出来的：
      //   闸在**子集账本**上跑时（例如演练的夹具腿只带「夹具＋移动端＋桌面端」、
      //   没有父仓）⇒ ⇒ 基线撞号少了一个占用者 ⇒ ⇒ 若按「完全相等」判 ⇒ ⇒ **假红**
      //   ⇒ ⇒ 而「现在多出来的占用者」才是真正的洞（重编号腾出的码位被别的条目占了）。
      //   ⇒ ⇒ 判据：**现在的占用者必须都在基线里**（不许多）⇒ ⇒ 少（被删/被修）不算红。
      const baseSet = new Set(baseIds);
      const extra = liveIds.filter((k) => !baseSet.has(k));
      if (extra.length > 0) {
        out.push('❌ [identity-mismatch] 码位 U+' + hex + ' 的历史撞号**多出了基线里没有的占用者**：基线（指纹）＝' + baseIds.join(' ／ ') + '；现在＝' + liveRaw.join(' ／ ') + ' ⇒ ⇒ 视为**新增撞号**（重编号腾出的码位被**别的条目**占了 ⇒ ⇒ 码位级豁免不适用）');
        continue;
      }
      debts.push({ hex, where, reason: (debtMap.get(hex) || {}).reason || '' });
      continue;
    }
    out.push('❌ [dup-codepoint] 码位 U+' + hex + ' 被 ' + c.uses.length + ' 条占用：' + where +
      ' ⇒ ⇒ **不在基线集里** ⇒ ⇒ 这是**新增撞号**（豁免只认基线 commit 的历史事实 ⇒ ⇒ 债表/任何文件都洗不白它）');
  }

  // ⚠️⚠️ **R6（悬空引用）** —— 引用必须指向**现存条目**（**跨三账本**算）。
  //   ⇒ ⇒ 「承 ㋛ 条」里的 ㋛ 若没有任何条目占着 ⇒ ⇒ 那处引用**悬空** ⇒ ⇒ 红。
  //   ⇒ ⇒ 歧义引用（多个条目共用一个码位）**只警告**：那是 R1 撞号那笔债。
  const universe = new Set([...(opts.markerUniverse || []), ...occupiedMap(ledgerTexts).keys()]);
  const refIssues = findReferenceIssues(ledgerTexts, universe);
  for (const d of refIssues.dangling) {
    out.push('❌ [dangling-reference] ' + d.ledger + ' 第 ' + d.line + ' 行：引用「' + d.glyph + ' 条」指向 U+' + d.cp + '，但**三账本里没有任何条目占这个码位** ⇒ ⇒ 这条引用**悬空**（读者点不动、机器判不出真假）｜ …' + d.snippet + '…');
  }
  if (refIssues.ambiguous.length) {
    // ⚠️ **聚合成一条** —— 闸的输出必须**可数**（一行一条红是纪律，逐行刷屏不是）。
    const byCp = new Map();
    for (const a of refIssues.ambiguous) byCp.set(a.cp, (byCp.get(a.cp) || 0) + 1);
    const top = [...byCp.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)
      .map(([cp, n]) => 'U+' + cp + '×' + n).join('、');
    warnings.push('⚠️ [ambiguous-reference] ' + refIssues.ambiguous.length + ' 处引用指向**有歧义**的码位（多个条目共用；涉及 ' + byCp.size + ' 个码位，最多：' + top + '）⇒ ⇒ 那是 R1 撞号那笔债（由基线豁免挡着）⇒ ⇒ 本条**不重复红**');
  }

  const settled = [...exempt].filter((hex) => !collided.has(hex)).sort();

  for (const c of collisions) {
    agg.dups.push({ cp: hex4(c.cp), lines: c.uses.map((u) => u.name + 'L' + u.line) });
  }

  return { out, debts, settled, collisions, v: agg, exemptSize: exempt.size, warnings };
}
/** 多个面各判一遍（面与面**分开**报 ⇒ ⇒ 「谁红」不会被混成一句话）。 */
export function checkFaces(faces, opts) {
  return faces.map((f) => {
    const r = checkLedgers(f.ledgerTexts, opts);
    return { name: f.name, desc: f.desc || '', ledgerTexts: f.ledgerTexts, ...r };
  });
}

function selfTest() {
  let pass = 0, fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log('  [PASS] ' + name); }
    else { fail++; console.log('  [FAIL] ' + name + ' ' + detail); }
  };
  const head = (ch, claim, body) => '**Updated**: 2026-11-05 (' + ch + ' **条目** —— ' + claim + ' —— 讲点事。)\n' + body;
  const ok = ['# PROJECT KNOWLEDGE BASE', '', head('㋿', '本条占 **U+32FF**', '① 正文。'), '', head('㍀', '本条占 **U+3340**', '② 正文。')].join('\n');
  const wrong = ok.replace('U+3340', 'U+3400');
  const dup = ok.replace('(㍀ **条目**', '(㋿ **条目**');
  const refs = ['# PROJECT KNOWLEDGE BASE', '', head('㋿', '本条占 **U+32FF**', '① 承 U+33A0 那笔说过的。\n② 顺带提一句 U+FFFD 是损坏字符。')].join('\n');
  check('正常账本 ⇒ 零违规', checkText(ok).out.length === 0, JSON.stringify(checkText(ok).out));
  check('注解写错 ⇒ 恰好 1 条 mismatched', checkText(wrong).v.mismatched.length === 1);
  check('注解写错 ⇒ 不是 dups', checkText(wrong).v.dups.length === 0);
  check('重复码位 ⇒ 恰好 1 个 dup', checkText(dup).v.dups.length === 1);
  check('正文里的引用/反例 ⇒ 不误报', checkText(refs).out.length === 0, JSON.stringify(checkText(refs).out));
  const BS = String.fromCharCode(92);
  const litBreak = BS + 'r' + BS + 'n' + BS + 'r' + BS + 'n';
  const merged = ok.replace('\n\n**Updated**: 2026-11-05 (㍀', litBreak + '**Updated**: 2026-11-05 (㍀');
  const mv = checkText(merged);
  check('缝合残迹（㌳ 形状）⇒ swallowed 恰好 1 条', mv.v.swallowed.length === 1, JSON.stringify(mv.out));
  check('缝合残迹 ⇒ 异体声明恰好 1 条（㍀ 的声明并进 ㋿ 体）', mv.v.foreign.length === 1, JSON.stringify(mv.out));
  const prose = ['# PROJECT KNOWLEDGE BASE', '', head('㋿', '本条占 **U+32FF**', '① 规则引文：正文里的「本条占 **U+XXXX**」必须等于真实码位。'), '', head('㍀', '本条占 **U+3340**', '② 锚点引用：这个「本条占」锚点只认完整声明。')].join('\n');
  check('规则引文/锚点引用（㎝ 形状）⇒ 不误报', checkText(prose).out.length === 0, JSON.stringify(checkText(prose).out));

  const G_32FF = String.fromCodePoint(0x32ff);
  const G_3340 = String.fromCodePoint(0x3340);
  const G_340B = String.fromCodePoint(0x340b);
  const headReal = (ch, claim, glyph) =>
    '**Updated**: 2026-11-05 (' + ch + ' **条目** —— 本条占 U+' + claim + '（' + glyph + '）—— 讲点事。）\n① 正文。';
  const plainOk = ['# PROJECT KNOWLEDGE BASE', '', headReal(G_32FF, '32FF', G_32FF)].join('\n');
  check('真账本形状（不加粗）＋ 字形一致 ⇒ 零违规', checkText(plainOk).out.length === 0, JSON.stringify(checkText(plainOk).out));
  const glyphWrong = ['# PROJECT KNOWLEDGE BASE', '', headReal(G_32FF, '32FF', G_3340)].join('\n');
  const gw = checkText(glyphWrong);
  check('真账本形状 ＋ 括号字形与注解数字不符 ⇒ 恰好 1 条红（glyph-mismatch）',
    gw.out.length === 1 && gw.v.glyphMismatch.length === 1, JSON.stringify(gw.out));
  const numWrong = ['# PROJECT KNOWLEDGE BASE', '', headReal(G_32FF, '340B', G_340B)].join('\n');
  const nw = checkText(numWrong);
  check('真账本形状 ＋ 注解数字与标题字形不符 ⇒ 恰好 1 条红（annotation-mismatch）',
    nw.out.length === 1 && nw.v.mismatched.length === 1, JSON.stringify(nw.out));
  // ⚠️⚠️ **R7（孤儿声明）** —— 声明必须挂在自己那条的体内（2026-11-09 实测入库）。
  const orphanDecl = ['# PROJECT KNOWLEDGE BASE', '', '⑨ **⚠️ 圈码：本条占 U+32FF（' + G_32FF + '）** —— 无主的声明。', '', headReal(G_32FF, '32FF', G_32FF)].join('\n');
  const od = checkText(orphanDecl);
  check('孤儿声明（声明不归属任何条目）⇒ 恰好 1 条红（orphan-declaration）',
    od.out.length === 1 && od.v.orphanClaims.length === 1, JSON.stringify(od.out));
  const ownedDecl = ['# PROJECT KNOWLEDGE BASE', '', headReal(G_32FF, '32FF', G_32FF) + '\n⑨ **⚠️ 圈码：本条占 U+32FF（' + G_32FF + '）** —— 挂在体里的声明。'].join('\n');
  check('同一句声明**挂在条目体内** ⇒ 零违规（R7 不误报）', checkText(ownedDecl).out.length === 0, JSON.stringify(checkText(ownedDecl).out));
  const headMobile = (ch, claim, body) => '**Updated:** 2026-11-05 (' + ch + ' **条目** —— ' + claim + ' —— 讲点事。)\n' + body;
  const twoShapes = [
    '**Updated**: 2026-11-05 (㋿ **条目** —— 本条占 **U+32FF** —— 父仓形状。）\n① 正文。',
    '**Updated:** 2026-11-05 (㍀ **条目** —— 本条占 **U+3340** —— 移动端形状。）\n② 正文。',
  ].join('\n');
  const shapes = checkLedgers([{ name: '混合', text: twoShapes }], { exempt: [] });
  check('两种头形状 ⇒ **都**被看见（两条都算条目）',
    shapes.collisions.length === 0 && findViolations(twoShapes).entries.length === 2,
    JSON.stringify(findViolations(twoShapes).entries.map((e) => e.cp)));

  // ⚠️⚠️ **豁免权的来源＝历史事实，不是文件** —— 这一族是本轮的核心判据。
  const twoSame = [
    '**Updated**: 2026-11-05 (㋿ **条目** —— 本条占 **U+32FF** —— 第一条。）\n① 正文。',
    '**Updated**: 2026-11-05 (㋿ **条目** —— 本条占 **U+32FF** —— 第二条。）\n② 正文。',
  ].join('\n');
  const newClash = checkLedgers([{ name: 'A', text: twoSame }], { exempt: [], debt: { items: [] } });
  check('新增撞号（不在基线集）⇒ 恰好 1 条红（且就是 dup）',
    newClash.out.length === 1 && newClash.out[0].includes('dup-codepoint'), JSON.stringify(newClash.out));

  const knownClash = checkLedgers([{ name: 'A', text: twoSame }], { exempt: ['32FF'], debt: { items: [{ cp: '32FF', reason: '测试债' }] } });
  check('基线集里的撞号 ⇒ 不红（进债档）',
    knownClash.out.length === 0 && knownClash.debts.length === 1, JSON.stringify(knownClash.out));

  const settled = checkLedgers([{ name: 'A', text: twoShapes }], { exempt: ['32FF'], debt: { items: [{ cp: '32FF', reason: '已销' }] } });
  check('基线集里已不撞的 ⇒ 进「可销账」档', settled.out.length === 0 && settled.settled.includes('32FF'), JSON.stringify(settled.settled));

  // ⚠️⚠️⚠️ **洗白机孪生（本轮新钉）** —— 上一版的豁免权就是「债表里的一行」
  // ⇒ ⇒ 往债表里加一行 ⇒ ⇒ 新增撞号立刻不红 ⇒ ⇒ 那是一台洗白机。
  // ⇒ ⇒ 现在豁免只认基线集 ⇒ ⇒ **债表写了也必须仍红**（这一条是本刀的承重断言）。
  const wash = checkLedgers([{ name: 'A', text: twoSame }], {
    exempt: ['32FE'],
    debt: { items: [{ cp: '32FF', reason: '试图洗白' }] },
  });
  check('把新增撞号写进**说明清单** ⇒ 仍红（说明清单不是白名单）',
    wash.out.length === 1 && wash.out[0].includes('dup-codepoint') && wash.out[0].includes('32FF'),
    JSON.stringify(wash.out));
  check('洗白不成的红 ⇒ 消息里点名「不在基线集里」（让人看见为什么红）',
    wash.out.length === 1 && wash.out[0].includes('不在基线集里'), JSON.stringify(wash.out));
  check('洗白不成 ⇒ 债档里**没有**它（没有混进去当豁免）', wash.debts.length === 0, JSON.stringify(wash.debts));

  // ⚠️⚠️ **身份级豁免（第二把封条）** —— 码位在基线集里**还不够**，还得是**同一批条目**。
  // ⇒ ⇒ 场景：某条历史撞号被**重编号**腾出那个码位、之后**别的条目**占同一码位
  // ⇒ ⇒ 码位级豁免会放它过去 ⇒ ⇒ **假绿** ⇒ ⇒ 身份层必须把它变成红。
  const sameLed = [{ name: 'A', text: twoSame }];
  const sameCol = findCollisions(sameLed);
  const sameIds = fingerprintIdentities(collisionIdentities(sameLed, sameCol[0]));
  const idOk = checkLedgers(sameLed, { exempt: ['32FF'], identities: { '32FF': sameIds }, debt: { items: [] } });
  check('基线集里的码位 ＋ 身份一致 ⇒ 不红（身份级豁免成立）',
    idOk.out.length === 0 && idOk.debts.length === 1, JSON.stringify(idOk.out));
  const idBad = checkLedgers(sameLed, {
    exempt: ['32FF'],
    identities: { '32FF': fingerprintIdentities(['A|**Updated**: 2026-11-05 (㋿ **完全另一个条目** —— 讲点事。)']) },
    debt: { items: [] },
  });
  check('基线集里的码位、但**身份不符**（别的条目占同一号）⇒ 必须红',
    idBad.out.length === 1 && idBad.out[0].includes('identity-mismatch'), JSON.stringify(idBad.out));
  // ⚠️ **容忍「引用重编号」**（U+32E3 的活例）—— 标题**尾部**变了 ⇒ 身份仍算一致 ⇒ 不红。
  const longA = '**Updated**: 2026-11-05 (㋿ **条目** —— 本条占 **U+32FF** —— 这是一条刻意写长的主题用来把尾部推到第 60 字符之后：第一条。）';
  const longB = '**Updated**: 2026-11-05 (㋿ **条目** —— 本条占 **U+32FF** —— 这是一条刻意写长的主题用来把尾部推到第 60 字符之后：第二条。）';
  const tailLed = [{ name: 'A', text: longA + '\n' + longB }];
  const tailIds = fingerprintIdentities(collisionIdentities(tailLed, findCollisions(tailLed)[0]));
  const tailLive = [{ name: 'A', text: tailLed[0].text.replace('第一条。）', '第一条（后来把引用重编号了）。）') }];
  const tailRes = checkLedgers(tailLive, { exempt: ['32FF'], identities: { '32FF': tailIds }, debt: { items: [] } });
  check('标题**尾部**被改（引用重编号）⇒ 身份仍一致 ⇒ 不红（U+32E3 的活例）',
    tailRes.out.length === 0, JSON.stringify(tailRes.out));

  // ⚠️⚠️ **R6（悬空引用）** —— 引用必须指向**现存条目**；且**不许把表项序号当引用**。
  const G_32DB = String.fromCodePoint(0x32db);
  const refDangle = ['# L', '', headReal(G_32FF, '32FF', G_32FF), '① 承 ' + G_32DB + ' 条 那条。'].join('\n');
  const rd = checkLedgers([{ name: 'A', text: refDangle }], { exempt: [] });
  check('悬空引用（指向不存在的码位）⇒ 恰好 1 条红（dangling-reference）',
    rd.out.length === 1 && rd.out[0].includes('dangling-reference'), JSON.stringify(rd.out));
  const refLive = ['# L', '', headReal(G_32FF, '32FF', G_32FF), '① 承 ' + G_32FF + ' 条 那条。'].join('\n');
  const ro = checkLedgers([{ name: 'A', text: refLive }], { exempt: [] });
  check('引用指向**现存条目** ⇒ 零违规', ro.out.length === 0, JSON.stringify(ro.out));
  const listNo = ['# L', '', headReal(G_32FF, '32FF', G_32FF), '① 判定表第 ② 条原则（② 不是条目标记 ⇒ 不是引用）。'].join('\n');
  const rl = checkLedgers([{ name: 'A', text: listNo }], { exempt: [] });
  check('「第 ② 条」这类**表项序号** ⇒ 不误报（零违规）', rl.out.length === 0, JSON.stringify(rl.out));

  // ⚠️⚠️ **负控腿的「相对原始读数」断言**（2026-11-11 落刀）——
  //   原版是**绝对**断言（「一行 dangling 都不许有」）⇒ ⇒ 被测物**带真缺陷**时它恒假
  //   ⇒ ⇒ 红的不是注入、是**存量** ⇒ ⇒ 而 CI 的步骤顺序是「演练先跑、主判定后跑」
  //   ⇒ ⇒ **主判定被 skipped** ⇒ ⇒ 那批真缺陷**在 CI 上从没被判过**
  //   （活例：run 42854031828 第 5 步演练 failure、第 6 步主判定 skipped）。
  // ⇒ ⇒ 现在改成：**注入没有新增**悬空引用 ⇒ ⇒ 存量归存量、伤害归伤害。
  const dgMix = ['❌ [dangling-reference] 父仓 第 9872 行：引用「䶿 条」指向 U+4DBF，…', '❌ [dup-codepoint] 乙行'];
  const dgShift = ['❌ [dangling-reference] 父仓 第 9874 行：引用「䶿 条」指向 U+4DBF，…', '❌ [dup-codepoint] 乙行'];
  const dgExtra = dgMix.concat(['❌ [dangling-reference] 父仓 第 9872 行：引用「䶿 条」指向 U+4DBF，…']);
  check('danglingRefKeys 只挑「悬空引用」那些行、且键是**码位**（其余不动）',
    danglingRefKeys(dgMix).length === 1 && danglingRefKeys(dgMix)[0] === 'U+4DBF',
    JSON.stringify(danglingRefKeys(dgMix)));
  check('**行号漂移**（注入条目插在顶部）⇒ ⇒ 键不变 ⇒ ⇒ 相对断言仍成立',
    sameKeyMultiset(danglingRefKeys(dgMix), danglingRefKeys(dgShift)) === true);
  check('注入**多出一条**悬空引用 ⇒ 相对断言必须红（尺子仍咬得住新伤害）',
    sameKeyMultiset(danglingRefKeys(dgMix), danglingRefKeys(dgExtra)) === false);
  check('存量带真缺陷时：**绝对断言恒假**、**相对断言成立** ⇒ ⇒ 这就是「演练被存量污染」的机制',
    (!dgMix.some((l) => l.includes('dangling-reference')) === false
      && sameKeyMultiset(danglingRefKeys(dgMix), danglingRefKeys(dgMix)) === true));
  const amb = ['# L', '', headReal(G_32FF, '32FF', G_32FF), '① 承 ' + G_32FF + ' 条 那条。', headReal(G_32FF, '32FF', G_32FF)].join('\n');
  const ra = checkLedgers([{ name: 'A', text: amb }], { exempt: ['32FF'], debt: { items: [] } });
  check('引用指向**撞号**码位 ⇒ 只警告（ambiguous-reference）、不红',
    ra.out.length === 0 && (ra.warnings || []).some((w) => w.includes('ambiguous-reference')),
    JSON.stringify(ra.out) + ' / ' + JSON.stringify(ra.warnings));

  // ⚠️ **面判据**：三个面各判一遍 ⇒ ⇒ 只有坏的那个面红。
  const faceGood = { name: '好面', desc: '好', ledgerTexts: [{ name: 'A', text: ok }] };
  const faceBad = { name: '坏面', desc: '坏', ledgerTexts: [{ name: 'A', text: merged }] };
  const faces = checkFaces([faceGood, faceBad], { exempt: [] });
  check('面判据 ⇒ 好面绿、坏面红（逐面分开）',
    faces[0].out.length === 0 && faces[1].out.length >= 1, JSON.stringify(faces.map((f) => f.out.length)));

  // ⚠️ **基线指纹**：规范串（排序＋去重）与指纹的稳定性 —— 指纹是「封条」。
  check('canonicalSet ⇒ 升序＋去重',
    canonicalSet(['32FF', '2472', '32FF']) === '2472,32FF', canonicalSet(['32FF', '2472', '32FF']));
  check('setDigest ⇒ 与顺序无关（同一集合同一指纹）',
    setDigest(['32FF', '2472']) === setDigest(['2472', '32FF']));

  // ⚠️ **真账本**（工作树面）⇒ 零违规 + 基线指纹与钉住值一致。
  const baseline = loadBaseline();
  check('基线撞号集读得到（git 历史或快照）', !baseline.error, String(baseline.error || ''));
  if (!baseline.error) {
    check('基线撞号集指纹 == 钉住值（豁免集没被偷改）',
      baseline.digest === BASELINE_DIGEST, baseline.digest.slice(0, 16) + '… vs ' + BASELINE_DIGEST.slice(0, 16) + '…');
  }
  const real = [];
  let missing = null;
  for (const l of LEDGERS) {
    if (!existsSync(l.path)) { missing = l.name; break; }
    real.push({ name: l.name, text: readFileSync(l.path, 'utf8') });
  }
  if (missing) {
    check('三本账本都在（' + missing + ' 缺）', false);
  } else {
    const r = checkLedgers(real, { exempt: baseline.cps || [], identities: baseline.identities || {}, debt: readDebt() });
    // ⚠️⚠️⚠️ **自检只判「尺子」，不判「仓库」**（2026-11-08 实测）：
    //   在**干净克隆**里跑（master 的账本带着并体事故）⇒ ⇒ 「真账本 ⇒ 零违规」那条
    //   ⇒ ⇒ **永远红** ⇒ ⇒ CI 会把「**仓库坏了**」报成「**自检坏了**」⇒ ⇒ **归因错**
    //   ⇒ ⇒ 而且 CI 的步骤顺序是「先自检、后主检查」⇒ ⇒ 真缺陷会被**自检的红**挡住
    //   ⇒ ⇒ 看不到 ⇒ ⇒ ⇒ 改成：
    //   ① 打印仓库当前 verdict（**ℹ️ INFO**，由**主检查**去判）
    //   ② 断言「三账本路径逐类条数 == 单账本判据直接算的条数」（**接线**没错，
    //      且**与仓库状态无关** ⇒ ⇒ 仓库再坏这条也稳）
    const perLedger = (key) => real.reduce((n, l) => n + (findViolations(l.text)[key] || []).length, 0);
    check('三账本路径逐类条数 == 单账本判据直接算的（**接线**没错，与仓库状态无关）',
      r.v.mismatched.length === perLedger('mismatched')
      && r.v.swallowed.length === perLedger('swallowed')
      && r.v.foreign.length === perLedger('foreign')
      && (r.v.glyphMismatch || []).length === perLedger('glyphMismatch')
      && (r.v.orphanClaims || []).length === perLedger('orphanClaims'),
      JSON.stringify({ agg: r.v.mismatched.length + '/' + r.v.swallowed.length + '/' + r.v.foreign.length + '/' + (r.v.glyphMismatch || []).length + '/' + (r.v.orphanClaims || []).length, direct: perLedger('mismatched') + '/' + perLedger('swallowed') + '/' + perLedger('foreign') + '/' + perLedger('glyphMismatch') + '/' + perLedger('orphanClaims') }));
    console.log('  ℹ️ 真账本当前 verdict：' + r.out.length + ' 条红（**这是仓库状态**，由主检查负责判定；自检只管尺子）');
    const realClaimed = real.reduce((n, l) => n + findViolations(l.text).entries.filter((e) => e.claimed).length, 0);
    check('真账本上「有注解的条目」数 > 0 ⇒ R2 不是暗的', realClaimed > 0, String(realClaimed));
    check('真账本 ⇒ 基线集里的既存撞号都被认出来（债档非空）',
      r.debts.length > 0 || r.collisions.length === 0, String(r.debts.length));
  }
  console.log('  判据自检：' + pass + '/' + (pass + fail));
  return fail === 0;
}

function drill() {
  if (!existsSync(LEDGER_PATH)) { console.log('❌ 账本不在 ⇒ ⇒ 判不了'); return false; }
  const baseline = loadBaseline();
  if (baseline.error) { console.log('❌ 基线读不到 ⇒ ⇒ 演练判不了：' + baseline.error); return false; }
  const before = sha256(LEDGER_PATH);
  const dir = join(tmpdir(), 'shadow-ledger-codepoint-drill');
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, 'AGENTS.md');
  const original = readFileSync(LEDGER_PATH, 'utf8');
  const others = LEDGERS.filter((l) => l.path !== LEDGER_PATH).map((l) => ({ name: l.name, text: readFileSync(l.path, 'utf8') }));
  const debt = readDebt();
  const opts = { exempt: baseline.cps, identities: baseline.identities, debt, markerUniverse: baseline.markers };
  const checkAll = (parentText, o = opts) => checkLedgers([{ name: '父仓', text: parentText }, ...others], o);
  writeFileSync(copy, original);
  // ⚠️ **原始读数**（仓库**当前**状态 ⇒ 可能是红的）—— 演练的断言要**相对**它。
  const origRed = checkAll(readFileSync(copy, 'utf8'));
  // ⚠️⚠️⚠️ **破坏的对象必须是「某个条目自己的声明」**（2026-11-09 实测踩到）：
  //   旧版直接 `replace(/本条占…U\+XXXX/)` ⇒ ⇒ 改的是**文件里碰到的第一处**字符串
  //   ⇒ ⇒ 而那处**可能不属于任何条目**（真账本里**当场就有一处**：并行会话插入条目时
  //   **漏了标题行** ⇒ ⇒ 那段正文连同圈码声明浮在文件顶部）⇒ ⇒ R2/R4 **都看不见它**
  //   ⇒ ⇒ 尺子**咬不到** ⇒ ⇒ 演练腿红（而「尺子坏了」与「仓库坏了」根本分不清）。
  //   ⇒ ⇒ 改成：**先找到一条真条目**，再改**它自己的**声明 ⇒ ⇒ 尺子对着**被测物**。
  const entList = extractEntries(original).entries;
  let targetEntry = null;
  for (const e of entList) { if (e.claims && e.claims.length > 0) { targetEntry = e; break; } }
  let broken = original;
  let brokeOk = false;
  if (targetEntry) {
    const oLines = original.split(/\r?\n/);
    const startIdx = targetEntry.line - 1;
    let endIdx = oLines.length;
    for (const e of entList) { if (e.line > targetEntry.line) { endIdx = e.line - 1; break; } }
    for (let i = startIdx; i < endIdx && !brokeOk; i++) {
      const mm = oLines[i].match(/(本条占\s*\*{0,2}U\+)([0-9A-Fa-f]{4,6})/);
      if (mm) {
        oLines[i] = oLines[i].slice(0, mm.index) + mm[1] + 'FFFF' + oLines[i].slice(mm.index + mm[0].length);
        brokeOk = true;
      }
    }
    if (brokeOk) {
      const sep = original.includes('\r\n') ? '\r\n' : '\n';
      broken = oLines.join(sep);
    }
  }
  writeFileSync(copy, broken);
  const red = checkAll(readFileSync(copy, 'utf8'));
  writeFileSync(copy, original);
  const green = checkAll(readFileSync(copy, 'utf8'));
  const BS = String.fromCharCode(92);
  const litBreak = BS + 'r' + BS + 'n' + BS + 'r' + BS + 'n';
  const firstHead = original.search(/^\*\*Updated\*\*/m);
  const boundary = /\r?\n\r?\n\*\*Updated\*\*/g;
  boundary.lastIndex = firstHead + 1;
  const hit = boundary.exec(original);
  let mergedRed = null;
  if (hit) {
    const mergedCopy = original.slice(0, hit.index) + litBreak + '**Updated**' + original.slice(hit.index + hit[0].length);
    writeFileSync(copy, mergedCopy);
    mergedRed = checkAll(readFileSync(copy, 'utf8'));
    writeFileSync(copy, original);
  }

  const fa = String.fromCodePoint(0x32FF);
  const fb = String.fromCodePoint(0x3340);
  const fixture = [
    '# FIXTURE',
    '',
    '**Updated**: 2026-11-05 (' + fa + ' **第一条** —— 本条占 **U+32FF**。)',
    '① 第一条正文一行。',
    '**Updated**: 2026-11-05 (' + fb + ' **第二条** —— 本条占 **U+3340**。)',
  ].join('\r\n');
  const fixtureMerged = fixture.replace('\r\n**Updated**: 2026-11-05 (' + fb, litBreak + '**Updated**: 2026-11-05 (' + fb);
  // ⚠️⚠️ **必须带上父仓**（2026-11-09 实测踩出来的）：R6 是**跨账本**判据
  //   ⇒ ⇒ 只喂「夹具＋移动端＋桌面端」时，**移动端/桌面端里指向父仓条目的引用**
  //   ⇒ ⇒ 会被判成悬空（实测多出 30+ 条假红）⇒ ⇒ 尺子被**缺席的账本**误伤。
  //   ⇒ ⇒ 占用表要**三本齐**才有意义。
  const fixtureRed = checkLedgers([{ name: '夹具', text: fixtureMerged }, { name: '父仓', text: original }, ...others], opts);

  // ⚠️⚠️⚠️ **洗白机演练腿（真实数据）** —— 上一版这里会**绿**（因为豁免＝债表）
  // ⇒ ⇒ 现在豁免＝基线集 ⇒ ⇒ 注入一个**基线集里没有**的撞号 ⇒ ⇒ 必须红
  // ⇒ ⇒ 而且**再往说明清单里补一行** ⇒ ⇒ **仍必须红**（那台洗白机被封死了）。
  // ⚠️⚠️⚠️ **注入的码位必须「当下空闲」**（2026-11-09 实测踩到）：写死 0x3412
  // ⇒ ⇒ 别的条目**占了它**以后（实测：U+3412 被「失败长得像成功」族那条占了）
  // ⇒ ⇒ 注入不再制造**新**撞号 ⇒ ⇒ 演练那条断言「比原始多红」落空
  // ⇒ ⇒ 尺子自己失灵（而且它报的是「尺子没咬住」⇒ ⇒ 看不出是尺子坏了还是仓库坏了）。
  // ⇒ ⇒ 改成：**当场算**一个「没人占 ＋ 不在基线豁免集里」的码位
  // ⇒ ⇒ 尺子永远对着**当下**的现实，而不是某个历史快照。
  const usedCps = new Set();
  for (const t of [original].concat(others.map((o) => o.text))) {
    for (const e of extractEntries(t).entries) usedCps.add(e.cp);
  }
  const baselineCps = baseline.cps || [];
  let injectCp = 0x3400;
  while (usedCps.has(injectCp) || baselineCps.includes(hex4(injectCp))) injectCp++;
  const injectHex = hex4(injectCp);
  const gi = String.fromCodePoint(injectCp);
  const injected =
    '**Updated**: 2026-11-05 (' + gi + ' **注入的第一条** —— 本条占 U+' + injectHex + '（' + gi + '）。)\n① 注入。\n' +
    '**Updated**: 2026-11-05 (' + gi + ' **注入的第二条** —— 本条占 U+' + injectHex + '（' + gi + '）。)\n② 注入。\n';
  const injectedCopy = injected + original;
  const injectRed = checkAll(injectedCopy);
  const washDebt = { items: [...(debt.items || []), { cp: injectHex, reason: '演练：试图洗白' }] };
  const injectWash = checkAll(injectedCopy, { exempt: baseline.cps, identities: baseline.identities, debt: washDebt });
  const injectRedHasDup = injectRed.out.some((l) => l.includes('dup-codepoint') && l.includes(injectHex));
  const injectWashStillRed = injectWash.out.some((l) => l.includes('dup-codepoint') && l.includes(injectHex));

  // ⚠️⚠️⚠️ **身份级豁免腿（真实数据）** —— 取一个**基线集里已有**的码位（U+32F1）
  // ⇒ ⇒ 在父仓副本里让**另一个条目**占它 ⇒ ⇒ 旧版（码位级豁免）会**绿**
  // ⇒ ⇒ 新版必须**红**（identity-mismatch ⇒ ⇒ 视为新增撞号）⇒ ⇒ 那是本刀的承重断言。
  const gj = String.fromCodePoint(0x32F1);
  const injJ = '**Updated**: 2026-11-05 (' + gj + ' **注入的另一个条目** —— 本条占 U+32F1（' + gj + '）。)\n① 注入。\n';
  const injJCopy = injJ + original;
  const idRed = checkAll(injJCopy);
  const idRedOk = idRed.out.some((l) => l.includes('32F1') && l.includes('identity-mismatch'));
  const idWashDebt = { items: [...(debt.items || []), { cp: '32F1', reason: '演练：试图用说明清单洗白身份不符' }] };
  const idWash = checkAll(injJCopy, { exempt: baseline.cps, identities: baseline.identities, debt: idWashDebt });
  const idWashStillRed = idWash.out.some((l) => l.includes('32F1') && l.includes('identity-mismatch'));

  // ⚠️⚠️⚠️ **R6 演练腿（真实数据）** —— 往副本里注入一处**指向不存在码位**的引用
  // ⇒ ⇒ 必须红（尺子咬住）；再注入「第 ② 条」⇒ ⇒ **不许新增悬空引用**（不许误报｜相对原始读数）。
  // ⚠️ 注入用的两个码位**现场算**：一个当注入条目的标记，一个当被引用的目标 ——
  //   ⚠️ 两者必须**不同** ⇒ ⇒ 否则那处引用会被注入条目自己接住 ⇒ ⇒ 测不到悬空。
  const freeCps = (() => {
    const used = new Set();
    for (const l of [{ name: '父仓', text: original }, ...others]) {
      for (const e of extractEntries(l.text).entries) if (e.actual) used.add(e.actual);
    }
    const out = [];
    for (let cp = 0x3200; cp <= 0x4dbf && out.length < 2; cp++) {
      const h = cp.toString(16).toUpperCase().padStart(4, '0');
      if (!used.has(h)) out.push(h);
    }
    return out;
  })();
  let refRedOk = false;
  let refNoFalsePositive = false;
  if (freeCps.length >= 2) {
    const gEntry = String.fromCodePoint(parseInt(freeCps[0], 16));
    const gTarget = String.fromCodePoint(parseInt(freeCps[1], 16));
    const injectRef = '**Updated**: 2026-11-05 (' + gEntry + ' **注入的引用** —— 本条占 U+' + freeCps[0] + '（' + gEntry + '）。)\n① 承 ' + gTarget + ' 条 那条。\n';
    writeFileSync(copy, injectRef + original);
    const refRed = checkAll(readFileSync(copy, 'utf8'));
    refRedOk = refRed.out.length > origRed.out.length
      && refRed.out.some((l) => l.includes('dangling-reference') && l.includes(freeCps[1]));
    const injectNum = '**Updated**: 2026-11-05 (' + gEntry + ' **注入的序号** —— 本条占 U+' + freeCps[0] + '（' + gEntry + '）。)\n① 判定表第 ② 条原则。\n';
    writeFileSync(copy, injectNum + original);
    const refFp = checkAll(readFileSync(copy, 'utf8'));
    // ⚠️⚠️ **断言必须相对「原始读数」**（2026-11-11 实测踩到）：原版是**绝对**断言
    //   （「一行 dangling 都不许有」）⇒ ⇒ 被测物**带真缺陷**时它恒假 ⇒ ⇒ 红的不是
    //   注入、是**存量** ⇒ ⇒ 而 CI 的步骤顺序是「演练先跑、主判定后跑」⇒ ⇒
    //   **主判定被 skipped** ⇒ ⇒ 那批真缺陷**在 CI 上从没被判过**
    //   （活例：run 42854031828 @5a85a9f —— 第 5 步演练 failure、第 6 步主判定 skipped）。
    // ⇒ ⇒ 改成：**注入没有新增**悬空引用 ⇒ ⇒ 存量归存量、伤害归伤害。
    // ⇒ ⇒ 键取**码位**（悬空引用的语义身份）⇒ ⇒ **行号漂移不影响比较**
    //   （注入条目插在文件顶部 ⇒ 同一条缺陷两次读数行号不同 ⇒ ⇒ 逐字比必失配）。
    refNoFalsePositive = sameKeyMultiset(danglingRefKeys(refFp.out), danglingRefKeys(origRed.out));
    writeFileSync(copy, original);
  }
  rmSync(dir, { recursive: true, force: true });
  const after = sha256(LEDGER_PATH);
  const mergedOk = mergedRed != null && mergedRed.out.length > 0 && mergedRed.v.swallowed.length >= 1;
  const fixtureOk = fixtureRed.out.length >= 2 && fixtureRed.v.swallowed.length >= 1 && fixtureRed.v.foreign.length >= 1;
  // ⚠️⚠️ **断言必须相对「仓库当前状态」，不能写死「绿」** —— 2026-11-08 实测：
  //   在**干净克隆**里跑演练（master 的账本带着并体事故）⇒ ⇒ 「还原 ⇒ 判绿」那条
  //   ⇒ ⇒ 永远红 ⇒ ⇒ 演练腿被**仓库状态**绑架 ⇒ ⇒ 尺子自己失灵（而 CI 会照报）。
  //   ⇒ ⇒ 改成：**破坏 ⇒ 比原始多红**（且多出来的那条正是本次注入的伤害）
  //   ⇒ ⇒ **还原 ⇒ 读数与原始逐字相同**（红也允许，只要一样）。
  const redAddsDamage = red.out.length > origRed.out.length
    && red.out.some((l) => l.includes('annotation-mismatch'));
  const greenRestores = green.out.length === origRed.out.length
    && green.out.join('\n') === origRed.out.join('\n');
  const ok = brokeOk && redAddsDamage && greenRestores && mergedOk && fixtureOk && injectRedHasDup && injectWashStillRed && idRedOk && idWashStillRed && refRedOk && refNoFalsePositive && before === after;
  console.log('  破坏对象：**条目自己的声明**（' + (targetEntry ? ('第 ' + targetEntry.line + ' 行那条 · U+' + targetEntry.actual) : '没找到有声明的条目') + '）⇒ ⇒ 改到了：' + (brokeOk ? '是' : '否'));
  console.log('  副本破坏 ⇒ 判红：' + red.out.length + ' 条（原始 ' + origRed.out.length + ' 条 ⇒ ⇒ 本次注入**多**红 ' + (red.out.length - origRed.out.length) + ' 条 ⇒ ⇒ 尺子咬住了本次伤害：' + (redAddsDamage ? '是' : '否') + '）');
  console.log('  副本还原 ⇒ 读数与原始**逐字相同**：' + (greenRestores ? '是' : '否') + '（' + green.out.length + ' 条）');
  if (mergedRed) console.log('  并体副本（㌳ 形状，真实父仓）⇒ 判红：' + mergedRed.out.length + ' 条（swallowed ' + mergedRed.v.swallowed.length + ' / foreign ' + mergedRed.v.foreign.length + '）');
  else console.log('  并体副本 ⇒ 没构造出来（标题边界没找到）');
  console.log('  并体夹具（自带）⇒ 判红：' + fixtureRed.out.length + ' 条（swallowed ' + fixtureRed.v.swallowed.length + ' / foreign ' + fixtureRed.v.foreign.length + '）⇒ R3＋R4 两条路都咬住：' + (fixtureOk ? '是' : '否'));
  console.log('  注入新增撞号（U+' + injectHex + '，**当下空闲** ＋ 基线集里没有）⇒ 判红：' + (injectRedHasDup ? '是' : '否'));
  console.log('  同一注入 ＋ 往说明清单补一行 ⇒ **仍判红**（洗白机被封死）：' + (injectWashStillRed ? '是' : '否'));
  console.log('  基线码位被**另一个条目**占用（U+32F1）⇒ 判红（旧版码位级豁免会绿）：' + (idRedOk ? '是' : '否'));
  console.log('  同一情形 ＋ 往说明清单补一行 ⇒ **仍判红**：' + (idWashStillRed ? '是' : '否'));
  console.log('  注入**悬空引用**（指向不存在的码位）⇒ 判红：' + (refRedOk ? '是' : '否'));
  console.log('  同一注入改成「第 ② 条」⇒ **不许新增悬空引用**（不许误报｜相对原始读数）：' + (refNoFalsePositive ? '是' : '否'));
  console.log('  真文件 SHA256 前后一致：' + (before === after ? '是' : '否') + ' (' + before.slice(0, 16) + '…)');
  return ok;
}

function main() {
  const faceArg = (process.argv.find((a) => a.startsWith('--face=')) || '').slice('--face='.length);
  const baseline = loadBaseline();
  if (baseline.error) {
    console.error('❌ 判不了（退出码 2）：' + baseline.error);
    return 2;
  }
  if (baseline.digest !== BASELINE_DIGEST) {
    console.error('❌ [baseline-digest] 基线撞号集指纹不符：实测 ' + baseline.digest.slice(0, 16) + '… ≠ 钉住 ' + BASELINE_DIGEST.slice(0, 16) + '…');
    console.error('   ⇒ ⇒ 豁免集被改过了 ⇒ ⇒ 判不了（不许在这种情况下判绿）');
    return 2;
  }
  if (baseline.identityDigest !== BASELINE_IDENTITY_DIGEST) {
    console.error('❌ [baseline-identity-digest] 基线身份映射指纹不符：实测 ' + String(baseline.identityDigest).slice(0, 16) + '… ≠ 钉住 ' + BASELINE_IDENTITY_DIGEST.slice(0, 16) + '…');
    console.error('   ⇒ ⇒ 身份层被改过了 ⇒ ⇒ 判不了（不许在这种情况下判绿）');
    return 2;
  }
  const debt = readDebt();
  const opts = { exempt: baseline.cps, identities: baseline.identities, debt, markerUniverse: baseline.markers };
  const faces = [];
  if (!faceArg || faceArg === 'worktree' || faceArg === 'all') {
    faces.push({
      name: '工作树',
      desc: '你正在编辑的那一份',
      ledgerTexts: LEDGERS.map((l) => ({ name: l.name, text: readFileSync(l.path, 'utf8') })),
    });
  }
  if (!faceArg || faceArg === 'index' || faceArg === 'all') {
    const ledgers = LEDGERS.map((l) => ({ name: l.name, text: gitShow(':' + l.rel) }));
    if (ledgers.some((l) => l.text == null)) {
      console.log('⚠️ [索引面] 判不了（索引里读不到那三本账本）⇒ ⇒ 本次没判这一面');
    } else {
      faces.push({ name: '索引', desc: '下一次提交会写进去的那一份', ledgerTexts: ledgers });
    }
  }
  if (!faceArg || faceArg === 'head' || faceArg === 'all') {
    const ledgers = LEDGERS.map((l) => ({ name: l.name, text: gitShow('HEAD:' + l.rel) }));
    if (ledgers.some((l) => l.text == null)) {
      console.log('⚠️ [提交树面] 判不了（HEAD 上读不到那三本账本）⇒ ⇒ 本次没判这一面');
    } else {
      faces.push({ name: '提交树', desc: '已经提交、别人 clone 到的那一份', ledgerTexts: ledgers });
    }
  }

  const results = checkFaces(faces, opts);
  let red = 0;
  for (const r of results) {
    const total = r.ledgerTexts.reduce((n, l) => n + findViolations(l.text).entries.length, 0);
    if (r.out.length === 0) {
      console.log('✅ ' + r.name + '面：零违规（' + total + ' 条条目：码位两两不同 ＋ 注解与真实码位一致）');
      if (r.debts.length) {
        console.log('   ⚠️ 基线集里的既存撞号 ' + r.debts.length + ' 条（豁免；出处＝基线 commit ' + BASELINE_COMMIT.slice(0, 8) + ' 的历史事实，来源：' + baseline.source + '）');
      }
      for (const w of r.warnings || []) console.log('   ' + w);
      if (r.settled.length) {
        console.log('   ⚠️ 基线集里已不再撞的 ' + r.settled.length + ' 条（可销账）：' + r.settled.join(', '));
      }
    } else {
      red++;
      console.log('❌ ' + r.name + '面：' + r.out.length + ' 条红（' + r.desc + '）');
      for (const line of r.out) console.log('   ' + line);
    }
  }

  const exemptSet = new Set(baseline.cps);
  const debtSet = new Set((debt.items || []).map((i) => String(i.cp).toUpperCase()));
  const invalid = [...debtSet].filter((c) => !exemptSet.has(c));
  const undocumented = [...exemptSet].filter((c) => !debtSet.has(c));
  if (invalid.length) {
    console.log('⚠️ 说明清单里 ' + invalid.length + ' 条**不产生豁免**（基线集里没有这些码位 ⇒ ⇒ 写在这里也洗不白）：' + invalid.join(', '));
  }
  if (undocumented.length) {
    console.log('⚠️ 基线集里 ' + undocumented.length + ' 条没有说明（不影响判定）：' + undocumented.join(', '));
  }

  const wt = results.find((r) => r.name === '工作树');
  const hd = results.find((r) => r.name === '提交树');
  if (red > 0 && wt && wt.out.length === 0 && hd && hd.out.length > 0) {
    console.log('💡 工作树面已绿、提交树面仍红 ⇒ ⇒ **修好了但没提交** ⇒ ⇒ 提交后这一面就绿（这正是「工作树绿 ≠ 提交树绿」的机械读数）。');
  }
  return red > 0 ? 1 : 0;
}

const arg = process.argv[2];
if (arg === '--self-test') { process.exit(selfTest() ? 0 : 1); }
if (arg === '--drill') { process.exit(drill() ? 0 : 1); }
process.exit(main());
