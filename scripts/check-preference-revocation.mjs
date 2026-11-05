#!/usr/bin/env node
/**
 * 「用户偏好撤销通道」闸（2026-11-05）。
 *
 * ## 为什么要有这道闸
 *
 * 依据 arXiv:2606.30306《Always-On Agents》§2.5：用户说了一个偏好、后来撤回，
 * agent 仍照做 —— 那篇把这种失败叫 **authority lapse**，并测出六轴里
 * **authority 只有 72/435**（最稀有的一轴）⇒ ⇒ 「授权还生效吗」几乎没人管。
 *
 * ⚠️ 我们本机今天的样子：用户记忆面**只有一条偏好**，**没有任何撤销通道** ⇒ ⇒
 *    偏好一旦说出口，就只能靠人肉记住它被撤过。
 *
 * ## 它守什么（七条）
 *
 *   V1 账本信封 —— 每条撤销必须带全六字段（授权 epoch / 来源 / 范围 / 状态 / 取代链）；
 *   V2 撤销权限 —— **只有用户本人**能撤回用户偏好；
 *   V3 目标可解析 —— target.key 必须命中偏好或撤回声明，且偏好不得重复；
 *   V4 正向（**防 lapse**）—— 撤了**必须**在偏好面上真的生效；
 *   V5 反向（**防幽灵撤销**）—— 生效的撤销**必须**有账本来源；
 *   V6 传播 —— 派生副本（记忆层 / 项目账本）**必须**带 rev-id，
 *      否则未来会话读到那份副本仍会照做；
 *   V7 一致性 —— rev-id 不许重复、restore 必须配对 revoke、恢复后不许还挂着撤销标记。
 *
 * ## 「撤掉了」有**两种**形态（都认）
 *
 *   ① 偏好条目自带「—— 已撤回（日期，rev-id）」；
 *   ② 偏好面里有一条「### 撤回声明：偏好名（rev-id）」。
 *
 * ⚠️ 形态②是**当前唯一写得出来的** —— 实测运行时记忆工具对 user 面**只支持
 *    append**（user:edit / user:write 均 INVALID_OPERATION）⇒ ⇒ 原条目改不掉。
 *
 * ## 退出码
 *
 *   0 绿；1 红（有违规）；2 **源没读全** ⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 *   node scripts/check-preference-revocation.mjs
 *   node scripts/check-preference-revocation.mjs --self-test
 *   node scripts/check-preference-revocation.mjs --drill
 *   node scripts/check-preference-revocation.mjs --include-local
 *   node scripts/check-preference-revocation.mjs --audit
 *   node scripts/check-preference-revocation.mjs --json
 *   node scripts/check-preference-revocation.mjs --surface=user-memory=<路径>
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  analyzeUserSurface,
  analyzeLedger,
  analyzeDependents,
  judgeRevocation,
  appendTombstone,
  markDependentTitle,
} from './lib/preference-revocation.mjs';
import { SURFACES } from './lib/state-surface-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const LEDGER_ID = 'revocation-ledger';
const USER_ID = 'user-memory';
const DEP_IDS = ['agent-memory', 'project-ledger', 'desktop-ledger', 'mobile-ledger'];

function dataRoot() {
  const env = process.env.MINIMAX_DATA_DIR;
  if (env) return resolve(env);
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  return join(home, '.minimax');
}

function agentName() {
  const env = process.env.MINIMAX_AGENT_NAME;
  if (env) return env;
  const root = dataRoot();
  if (!root) return 'mavis';
  const dir = join(root, 'agents');
  if (!existsSync(dir)) return 'mavis';
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return names.length === 1 ? names[0] : 'mavis';
}

function surfaceById(id) {
  return SURFACES.find((s) => s.id === id);
}

function surfacePath(id, overrides) {
  if (overrides && overrides[id]) return overrides[id];
  const s = surfaceById(id);
  if (!s) return null;
  if (s.scope === 'repo') return join(REPO, s.rel);
  if (s.scope === 'local') {
    const root = dataRoot();
    if (!root) return null;
    return join(root, s.dataRel.replace('<agent>', agentName()));
  }
  return null;
}

function readTextOrNull(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function parseOverrides(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--surface=([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** 判一次 —— 偏好面 ＋ 账本 ＋ 派生面。 */
export function judge({ userText, ledgerObj, dependents, skipUserRules }) {
  const surface = userText === null ? { prefs: [], tombstones: [] } : analyzeUserSurface(userText);
  const ledger = analyzeLedger(ledgerObj);
  const deps = (dependents || []).map((d) => ({
    id: d.id,
    label: d.label,
    kind: d.kind,
    entries: analyzeDependents(d.text, d.kind),
  }));
  return judgeRevocation({
    prefs: surface.prefs,
    tombstones: surface.tombstones,
    ledger: ledger,
    dependents: deps,
    skipUserRules: !!skipUserRules,
  });
}

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const USER_ACTIVE = [
  '<!-- mem-append-reason: 夹具用的用户记忆面 -->',
  '### 自主推进偏好（2026-10-31）',
  '用户以「继续」驱动长会话，期望我自行推进。',
  '',
  '**应用**：遇到「继续」时直接挑最薄弱的一环去做。',
  '',
].join('\n');

const USER_REVOKED = USER_ACTIVE.replace(
  '### 自主推进偏好（2026-10-31）',
  '### 自主推进偏好（2026-10-31）—— 已撤回（2026-11-05，rev-0001）'
);

const USER_BODY_MENTION = USER_ACTIVE.replace(
  '**应用**：遇到「继续」时直接挑最薄弱的一环去做。',
  '**应用**：遇到「继续」时直接挑最薄弱的一环去做。（旧的说法「已撤回」写在正文里不算数。）'
);

const TOMBSTONE = [
  '### 撤回声明：自主推进偏好（2026-11-05，rev-0001）',
  '> 信封：epoch=2026-11-05 | authority=user | scope=user | source=撤销账本 rev-0001 | status=active | supersedes=none',
  '',
  '偏好「自主推进偏好」已于 2026-11-05 被撤回（rev-0001）⇒ ⇒ **上文那条关于它的描述作废，不得再作为偏好执行**。',
  '',
].join('\n');

const USER_WITH_TOMBSTONE = USER_ACTIVE + TOMBSTONE;

const DEP_PLAIN = [
  '### 自主推进偏好（2026-10-31）',
  '这是把用户偏好抄进记忆层的那一条（派生副本）。',
  '',
].join('\n');

const DEP_MARKED = [
  '### 自主推进偏好（已撤回 rev-0001）（2026-10-31）',
  '这是把用户偏好抄进记忆层的那一条（派生副本，已同步撤销标记）。',
  '',
].join('\n');

const DEP_OTHER_TITLE = [
  '### 别的教训（2026-10-31）',
  '正文里提到过「自主推进偏好」这个名字，但这条讲的是别的事。',
  '',
].join('\n');

function ledgerEntry(over) {
  return Object.assign(
    {
      id: 'rev-0001',
      target: { surface: 'user-memory', key: '自主推进偏好' },
      action: 'revoke',
      epoch: '2026-11-05',
      authority: 'user',
      scope: 'user',
      source: '用户当场所说',
      status: 'active',
      supersedes: 'none',
      reason: '用户改主意了',
    },
    over || {}
  );
}

// ---------------------------------------------------------------------------
// 自检
// ---------------------------------------------------------------------------

export function selfTest() {
  const NL = String.fromCharCode(10);
  const results = [];
  const check = (name, cond, why) => results.push({ name, ok: !!cond, why: why || '' });

  const D = (name, expected, got) => {
    const g = got.map((x) => x.msg).sort();
    const w = expected.slice().sort();
    const same = g.length === w.length && g.every((x, i) => x === w[i]);
    check(name, same, same ? '' : '期望 ' + JSON.stringify(w) + '；实际 ' + JSON.stringify(g));
  };

  const dep = (text) => [{ id: 'drill-dependent', label: '演练派生面', kind: 'md-heading', text: text }];

  D(
    '基线：空账本 ＋ 一条生效偏好 ＋ 一个派生副本 ⇒ ⇒ 零违规',
    [],
    judge({ userText: USER_ACTIVE, ledgerObj: { entries: [] }, dependents: dep(DEP_PLAIN) }).violations
  );

  D(
    '退化①：账本条目缺 source ⇒ ⇒ 恰好红这一条（V1）',
    ['撤销账本 rev-0001：信封缺字段 source ⇒ ⇒ 这次撤销没有完整的授权/来源 ⇒ ⇒ 不可审计'],
    judge({
      userText: USER_REVOKED,
      ledgerObj: { entries: [ledgerEntry({ source: '' })] },
      dependents: dep(DEP_MARKED),
    }).violations
  );

  D(
    '退化②：撤销条目的 authority 是 measured（不是 user）⇒ ⇒ 恰好红这一条（V2）',
    ['撤销账本 rev-0001：authority 是「measured」⇒ ⇒ 只有用户本人能撤回用户偏好（论文 §2.5 authority）⇒ ⇒ 闸红'],
    judge({
      userText: USER_REVOKED,
      ledgerObj: { entries: [ledgerEntry({ authority: 'measured' })] },
      dependents: dep(DEP_MARKED),
    }).violations
  );

  D(
    '退化③：账本撤的是一条不存在的偏好 ⇒ ⇒ 恰好红这一条（V3）',
    [
      '撤销账本 rev-0001：目标偏好「不存在的偏好」在用户记忆面里**既没有条目也没有撤回声明** ⇒ ⇒ 这次撤销是空的 ⇒ ⇒ 撤了个不存在的东西',
    ],
    judge({
      userText: USER_ACTIVE,
      ledgerObj: { entries: [ledgerEntry({ target: { surface: 'user-memory', key: '不存在的偏好' } })] },
      dependents: dep(DEP_PLAIN),
    }).violations
  );

  D(
    '退化④：撤了但偏好面**没改** ⇒ ⇒ 恰好红这一条（V4 ★ authority lapse）',
    [
      '用户撤了偏好「自主推进偏好」（rev-0001）⇒ ⇒ 但偏好面里它**仍是生效形态**（既没有「已撤回」标记，也没有撤回声明）⇒ ⇒ 这就是论文说的 **authority lapse**（撤回后仍被执行）',
    ],
    judge({
      userText: USER_ACTIVE,
      ledgerObj: { entries: [ledgerEntry()] },
      dependents: dep(DEP_MARKED),
    }).violations
  );

  D(
    '退化⑤：偏好面标了「已撤回」但账本里没有 ⇒ ⇒ 恰好红这一条（V5 ★ 撤销没有来源）',
    [
      '用户记忆面里偏好「自主推进偏好」标着「已撤回（rev-0001）」⇒ ⇒ 但撤销账本里**没有** rev-0001 ⇒ ⇒ 这次撤销没有来源（论文：a memory that drops its source ⇒ ⇒ strictly worse than empty）',
    ],
    judge({ userText: USER_REVOKED, ledgerObj: { entries: [] }, dependents: dep(DEP_MARKED) }).violations
  );

  D(
    '退化⑥：撤了也生效了，但派生副本没带 rev-id ⇒ ⇒ 恰好红这一条（V6）',
    [
      '被撤回的偏好「自主推进偏好」（rev-0001）在派生面「drill-dependent」的条目「自主推进偏好（2026-10-31）」里仍然**照旧生效**（标题里没有 rev-0001）⇒ ⇒ 未来会话读到它仍会照做 ⇒ ⇒ 撤销没传播',
    ],
    judge({
      userText: USER_REVOKED,
      ledgerObj: { entries: [ledgerEntry()] },
      dependents: dep(DEP_PLAIN),
    }).violations
  );

  D(
    '退化⑦：账本里 rev-id 重复 ⇒ ⇒ 恰好红这一条（V7）',
    ['撤销账本里 rev-0001 出现了 **2 次** ⇒ ⇒ 撤销标记会指错'],
    judge({
      userText: USER_REVOKED,
      ledgerObj: { entries: [ledgerEntry(), ledgerEntry()] },
      dependents: dep(DEP_MARKED),
    }).violations
  );

  D(
    '退化⑧：restore 没有配对的 revoke ⇒ ⇒ 恰好红这一条（V7）',
    [
      '撤销账本 rev-0002 是 restore ⇒ ⇒ 但账本里没有针对偏好「自主推进偏好」的 revoke ⇒ ⇒ 恢复了一个没被撤过的东西',
    ],
    judge({
      userText: USER_ACTIVE,
      ledgerObj: { entries: [ledgerEntry({ id: 'rev-0002', action: 'restore' })] },
      dependents: dep(DEP_PLAIN),
    }).violations
  );

  D(
    '退化⑨：偏好面有撤回声明但账本里没有 ⇒ ⇒ 恰好红这一条（V5 ★ 撤销没有来源）',
    [
      '用户记忆面里的撤回声明「自主推进偏好」（rev-0001）⇒ ⇒ 但撤销账本里**没有** rev-0001 ⇒ ⇒ 这次撤销没有来源（论文：a memory that drops its source ⇒ ⇒ strictly worse than empty）',
    ],
    judge({ userText: USER_WITH_TOMBSTONE, ledgerObj: { entries: [] }, dependents: dep(DEP_MARKED) })
      .violations
  );

  D(
    '形态A：偏好条目自带「已撤回」形状 ⇒ ⇒ 零违规（形态①也认）',
    [],
    judge({
      userText: USER_REVOKED,
      ledgerObj: { entries: [ledgerEntry()] },
      dependents: dep(DEP_MARKED),
    }).violations
  );

  D(
    '形态B：偏好条目保留 ＋ 追加撤回声明 ⇒ ⇒ 零违规（形态②也认，且这是当前唯一写得出的形态）',
    [],
    judge({
      userText: USER_WITH_TOMBSTONE,
      ledgerObj: { entries: [ledgerEntry()] },
      dependents: dep(DEP_MARKED),
    }).violations
  );

  D(
    '孪生：正文里写「已撤回」三个字，但标题没有那个形状 ⇒ ⇒ 不判红（认形状不认关键词）',
    [],
    judge({ userText: USER_BODY_MENTION, ledgerObj: { entries: [] }, dependents: dep(DEP_PLAIN) })
      .violations
  );

  D(
    '孪生：派生副本**正文**提到偏好名但标题不是它 ⇒ ⇒ 不判传播（只认标题形状）',
    [],
    judge({
      userText: USER_REVOKED,
      ledgerObj: { entries: [ledgerEntry()] },
      dependents: dep(DEP_OTHER_TITLE),
    }).violations
  );

  D(
    '孪生：用户记忆面读不到（CI）⇒ ⇒ 只判账本自身的规则 ⇒ ⇒ 不拿空面判红',
    [],
    judge({
      userText: null,
      ledgerObj: { entries: [ledgerEntry()] },
      dependents: dep(DEP_MARKED),
      skipUserRules: true,
    }).violations
  );

  // ── 完整生命周期演练 ──
  const step = (label, userText, ledgerObj, depText) => {
    const r = judge({ userText: userText, ledgerObj: ledgerObj, dependents: dep(depText) });
    return r;
  };
  const ledger0 = { entries: [] };
  const ledger1 = { entries: [ledgerEntry()] };

  const s0 = step('0 基线', USER_ACTIVE, ledger0, DEP_PLAIN);
  const s1 = step('1 只写账本', USER_ACTIVE, ledger1, DEP_PLAIN);
  const s2 = step('2 追加撤回声明', USER_WITH_TOMBSTONE, ledger1, DEP_PLAIN);
  const s3 = step('3 派生副本没传播', USER_WITH_TOMBSTONE, ledger1, DEP_PLAIN);
  const s4 = step('4 传播完成', USER_WITH_TOMBSTONE, ledger1, DEP_MARKED);
  const s5 = step('5 抹掉撤销记录', USER_WITH_TOMBSTONE, ledger0, DEP_MARKED);

  check('生命周期①：基线是绿的', s0.violations.length === 0, JSON.stringify(s0.violations.map((x) => x.msg)));
  check(
    '生命周期②：只写账本 ⇒ ⇒ 红 V4（撤了没生效）',
    s1.violations.length === 1 && s1.violations[0].rule === 'V4',
    JSON.stringify(s1.violations.map((x) => x.rule))
  );
  check(
    '生命周期③：追加撤回声明 ⇒ ⇒ 只剩 V6（派生副本没传播）',
    s2.violations.length === 1 && s2.violations[0].rule === 'V6',
    JSON.stringify(s2.violations.map((x) => x.rule))
  );
  check(
    '生命周期④：派生副本没传播时 ⇒ ⇒ 红 V6',
    s3.violations.length === 1 && s3.violations[0].rule === 'V6',
    JSON.stringify(s3.violations.map((x) => x.rule))
  );
  check(
    '生命周期⑤：传播完成后 ⇒ ⇒ 全绿',
    s4.violations.length === 0,
    JSON.stringify(s4.violations.map((x) => x.msg))
  );
  check(
    '生命周期⑥：抹掉撤销记录 ⇒ ⇒ 红 V5（撤销没有来源）',
    s5.violations.length === 1 && s5.violations[0].rule === 'V5',
    JSON.stringify(s5.violations.map((x) => x.rule))
  );

  const ok = results.filter((r) => r.ok).length;
  console.log(
    results.map((r) => (r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.ok ? '' : '  —— ' + r.why)).join(NL)
  );
  console.log('自检：' + ok + '/' + results.length + ' 通过');
  return ok === results.length;
}

// ---------------------------------------------------------------------------
// 演练 —— 在**副本**上把整条撤销链走一遍（真文件一个字不动）
// ---------------------------------------------------------------------------

function drill(argv) {
  const overrides = parseOverrides(argv);
  const includeLocal = argv.includes('--include-local');
  const NL = String.fromCharCode(10);

  const userPath = surfacePath(USER_ID, overrides);
  const ledgerPath = surfacePath(LEDGER_ID, overrides);
  const realUser = readTextOrNull(userPath);
  const realLedgerRaw = readTextOrNull(ledgerPath);
  const beforeUser = realUser === null ? null : sha256(realUser);
  const beforeLedger = realLedgerRaw === null ? null : sha256(realLedgerRaw);

  const baseUser = realUser === null ? USER_ACTIVE : realUser;
  const baseNote =
    realUser === null ? '（真实用户记忆面本轮不可读 ⇒ ⇒ 用合成夹具演练）' : '（真实用户记忆面，只读）';

  let ledgerObj = { entries: [] };
  if (realLedgerRaw !== null) {
    try {
      ledgerObj = JSON.parse(realLedgerRaw);
    } catch (e) {
      console.error('❌ 撤销账本解析失败 ⇒ ⇒ ' + e.message);
      process.exit(2);
    }
  }

  const prefs = analyzeUserSurface(baseUser).prefs;
  if (prefs.length === 0) {
    console.error('❌ 用户记忆面里没有偏好 ⇒ ⇒ 演练无目标');
    process.exit(2);
  }
  const key = prefs[0].key;
  const revId = 'rev-drill';

  const depBase = ['### ' + key + '（2026-11-05）', '（演练用的派生副本：把这条偏好抄进记忆层。）', ''].join(NL);

  const run = (label, userText, ledger, depTextValue, expect) => {
    const r = judge({
      userText: userText,
      ledgerObj: ledger,
      dependents: [{ id: 'drill-dependent', label: '演练派生面', kind: 'md-heading', text: depTextValue }],
    });
    const rules = r.violations.map((x) => x.rule);
    const verdict = r.violations.length === 0 ? '绿' : '红（' + rules.join(' ＋ ') + '）';
    const ok = expect === '绿' ? r.violations.length === 0 : r.violations.length > 0;
    console.log((ok ? '  ✔ ' : '  ✘ ') + label + ' ⇒ ⇒ ' + verdict);
    for (const x of r.violations) console.log('       · [' + x.rule + '] ' + x.msg);
    return ok;
  };

  console.log('撤销通道演练（全部在**副本**上跑 ⇒ ⇒ 真文件一个字不动）：');
  console.log('   目标偏好：「' + key + '」' + baseNote);
  console.log('');

  const ledger1 = {
    schema: 'ibloc/revocation-ledger@1',
    entries: [
      ledgerEntry({
        id: revId,
        target: { surface: 'user-memory', key: key },
        source: '演练（不是真实撤销）',
      }),
    ],
  };

  const withTombstone = appendTombstone(baseUser, key, '2026-11-05', revId);
  const markedDep = markDependentTitle(depBase, 'md-heading', key, revId);

  let allOk = true;
  allOk = run('步骤 0 · 基线（没有撤销）', baseUser, { entries: [] }, depBase, '绿') && allOk;
  allOk = run('步骤 1 · 只写撤销账本，偏好面**没改**', baseUser, ledger1, depBase, '红') && allOk;
  allOk = run('步骤 2 · 追加撤回声明（撤掉生效）', withTombstone, ledger1, depBase, '红') && allOk;
  allOk = run('步骤 3 · 派生副本**没**传播', withTombstone, ledger1, depBase, '红') && allOk;
  allOk = run('步骤 4 · 派生副本也盖上 rev-id（传播完成）', withTombstone, ledger1, markedDep, '绿') && allOk;
  allOk = run('步骤 5 · 抹掉撤销记录（模拟删账本）', withTombstone, { entries: [] }, markedDep, '红') && allOk;

  const afterUser = readTextOrNull(userPath);
  const afterLedger = readTextOrNull(ledgerPath);
  const userSame = realUser === null ? true : sha256(afterUser) === beforeUser;
  const ledgerSame = realLedgerRaw === null ? true : sha256(afterLedger) === beforeLedger;
  console.log('');
  console.log(
    '   真文件未被动过：用户记忆面 ' + (userSame ? '✔ 逐字一致' : '✘ 变了！') + '；撤销账本 ' + (ledgerSame ? '✔ 逐字一致' : '✘ 变了！')
  );
  if (beforeUser) console.log('   用户记忆面 SHA256：' + beforeUser);
  if (beforeLedger) console.log('   撤销账本 SHA256：' + beforeLedger);
  console.log('');
  console.log('   每一步该红的地方都红了 ⇒ ⇒ 这条通道**真的会在该红的时候红**。');
  console.log('   ⚠️ 但注意：演练证明的是「机制会红」，**不是**「agent 读到撤回声明就不照做」——');
  console.log('      后者只能靠真机行为测试（派一个全新会话问它偏好列表）。');
  process.exit(allOk && userSame && ledgerSame ? 0 : 1);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  if (argv.includes('--drill')) {
    drill(argv);
    return;
  }

  const overrides = parseOverrides(argv);
  const includeLocal = argv.includes('--include-local');
  const notes = [];

  const ledgerPath = surfacePath(LEDGER_ID, overrides);
  const ledgerRaw = readTextOrNull(ledgerPath);
  if (ledgerRaw === null) {
    console.error('❌ 源没读全 ⇒ ⇒ 「没红」不等于「没问题」（退出码 2）');
    console.error('   撤销账本读不到：' + ledgerPath);
    process.exit(2);
  }
  let ledgerObj;
  try {
    ledgerObj = JSON.parse(ledgerRaw);
  } catch (e) {
    console.error('❌ 源没读全 ⇒ ⇒ 撤销账本解析失败：' + e.message);
    process.exit(2);
  }

  const userPath = surfacePath(USER_ID, overrides);
  const userText = includeLocal ? readTextOrNull(userPath) : null;
  const userAvailable = userText !== null;
  if (!includeLocal) {
    notes.push('用户记忆面本轮**未覆盖**（要读请显式 --include-local）⇒ ⇒ V3/V4/V5/V6 这轮不判');
  } else if (!userAvailable) {
    notes.push('用户记忆面**读不到**（' + (userPath || '路径未知') + '）⇒ ⇒ V3/V4/V5/V6 这轮不判');
  }

  const dependents = [];
  for (const id of DEP_IDS) {
    const s = surfaceById(id);
    if (!s) continue;
    if (s.scope === 'local' && !includeLocal) {
      notes.push('派生面 ' + id + '：本轮**未覆盖**（本地面，默认不读）');
      continue;
    }
    const p = surfacePath(id, overrides);
    const t = readTextOrNull(p);
    if (t === null) {
      if (s.scope === 'repo') {
        console.error('❌ 源没读全 ⇒ ⇒ 派生面读不到：' + id + ' ⇒ ' + p);
        process.exit(2);
      }
      notes.push('派生面 ' + id + '：**读不到** ⇒ ⇒ 本轮不判传播');
      continue;
    }
    dependents.push({ id: id, label: s.label, kind: s.kind, text: t });
  }

  const res = judge({
    userText: userText,
    ledgerObj: ledgerObj,
    dependents: dependents,
    skipUserRules: !userAvailable,
  });

  const surface = userAvailable ? analyzeUserSurface(userText) : { prefs: [], tombstones: [] };
  const entries = analyzeLedger(ledgerObj);

  if (argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          ledgerPath: ledgerPath,
          userPath: userPath,
          userSurfaceCovered: userAvailable,
          violations: res.violations,
          notes: notes,
          preferences: surface.prefs.map((p) => ({ key: p.key, revoked: p.revoked, revId: p.revId, line: p.line })),
          tombstones: surface.tombstones.map((t) => ({ key: t.key, revId: t.revId, line: t.line })),
          ledgerEntries: entries.map((e) => ({ id: e.id, key: e.key, action: e.action, authority: e.authority, status: e.status })),
        },
        null,
        2
      )
    );
    process.exit(res.violations.length === 0 ? 0 : 1);
  }

  if (argv.includes('--audit')) {
    console.log('撤销通道现状：');
    console.log('   撤销账本：' + ledgerPath);
    console.log('   账本条目：' + entries.length + ' 条');
    for (const e of entries) {
      console.log('      · ' + e.id + '  ' + e.action + '  「' + e.key + '」  authority=' + e.authority + '  epoch=' + e.epoch + '  status=' + e.status);
    }
    console.log('   用户记忆面：' + (userPath || '路径未知') + (userAvailable ? '' : '（本轮未覆盖）'));
    console.log('   偏好条目：' + (userAvailable ? surface.prefs.length + ' 条' : '本轮未覆盖'));
    for (const p of surface.prefs) {
      console.log('      · ' + (p.revoked ? '[已撤回 ' + p.revId + ']' : '[生效]') + ' ' + p.key);
    }
    console.log('   撤回声明：' + (userAvailable ? surface.tombstones.length + ' 条' : '本轮未覆盖'));
    for (const t of surface.tombstones) {
      console.log('      · ' + t.revId + '  「' + t.key + '」');
    }
    console.log('');
    for (const n of notes) console.log('注：' + n);
    console.log('');
    console.log('违规：' + (res.violations.length ? res.violations.length + ' 处' : '（无）'));
    for (const v of res.violations) console.log('   [' + v.rule + '] ' + v.msg);
    process.exit(0);
  }

  console.log(
    '用户偏好撤销通道闸：账本 ' + entries.length + ' 条；偏好面 ' + (userAvailable ? surface.prefs.length + ' 条' : '本轮未覆盖')
  );
  for (const n of notes) console.log('注：' + n);
  if (res.violations.length === 0) {
    console.log('✓ 零违规' + (userAvailable ? '' : '（⚠️ 用户面未覆盖 ⇒ ⇒ V3/V4/V5/V6 这轮没判）'));
  } else {
    console.log('✘ ' + res.violations.length + ' 处违规：');
    for (const v of res.violations) console.log('   [' + v.rule + '] ' + v.msg);
  }
  process.exit(res.violations.length === 0 ? 0 : 1);
}

main(process.argv.slice(2));
