#!/usr/bin/env node
/**
 * 「状态面治理」闸（2026-11-05）。
 *
 * ## 为什么要有这道闸
 *
 * 依据 arXiv:2606.30306《Always-On Agents》：把「持久状态」按九段生命周期
 * （写 / 校验 / 组织 / 取 / 用 / 更新 / 忘 / 审 / 回滚）审，而不是按「记忆条目」审。
 * 那篇的实测：435 项工作的编码里 retrieve 269 / write 200，但 **rollback 27**、
 * **authority 72**（最稀有的轴）⇒ ⇒ **治理那一半几乎没人做**。
 *
 * ⚠️⚠️ **本仓的形状一模一样** —— 而且是**自己量出来的**（2026-11-05 实测）：
 *   · 项目账本 AGENTS.md：47 条，**0 条有信封**（授权/来源/取代链全无）；
 *   · 继承指针里**八成指向已不存在的条目**（来源凭空了）；
 *   · 一批是「承上一条」这种**位置型**指针（只追加 ⇒ ⇒ 插入就指错）；
 *   · 记忆层 173 条，一批**连日期都没有**（⇒ ⇒ 过期无法判定）；
 *   · user 记忆只有 1 条偏好，**没有撤销通道**（论文的 authority lapse）。
 * ⇒ ⇒ 而本仓最强的另一半（30 道 check-* 闸，带自检 ＋ 退化副本反向验证）
 *   **全建在源码上，状态面一条闸都没有**。
 *
 * ## 它守什么
 *
 *   R1 新条目（cutoff 之后）**必须带信封**：epoch / authority / scope /
 *      source / status / supersedes 六字段，缺一即红。
 *   R2 信封里的**值**要合法（epoch 是日期、authority/scope/status 在允许集合里）。
 *   R3 信封里的**取代链**必须解析得到（否则「这条取代了谁」是空话）。
 *   R5 **存量债务不许变多**（多了红）**也不许隐瞒**（少了红 ⇒ ⇒ 请销账）。
 *   R6 仓里出现**未登记的状态面** ⇒ ⇒ 红（否则新状态面悄悄进来没人管）。
 *
 * ## 判据为什么认「行形状」而不是关键词
 *
 * 状态面是**给人读也给人写**的 Markdown ⇒ ⇒ 判据认**行形状**
 * （行首的「> 信封：k=v | k=v」）⇒ ⇒ 正文里提一句「来源」不会把没信封的条目喂绿。
 * ⚠️ 这与本仓既有判据同源：**认形状不认关键词**（见 check-external-tools 的
 *    「brain_post_secret(」那条教训 —— 注释里提到它就会假绿）。
 *
 * ## 退出码
 *
 * - 0：绿；
 * - 1：红（有违规）；
 * - 2：**源没读全** ⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 *     node scripts/check-state-surface.mjs
 *     node scripts/check-state-surface.mjs --self-test
 *     node scripts/check-state-surface.mjs --audit
 *     node scripts/check-state-surface.mjs --json
 *     node scripts/check-state-surface.mjs --include-local
 */
import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { judgeSurface, analyzeSurface, DEBT_KINDS, ENVELOPE_KEYS } from './lib/state-surface.mjs';
import { SURFACES, KNOWN_DEBT, CUTOFF } from './lib/state-surface-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 本地状态面根（CI 里没有 ⇒ ⇒ 那两个面「本轮未覆盖」）。 */
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

/** 读一个面 ⇒ ⇒ 读不到返回 missing（**读不到 ≠ 通过**）。 */
function readSurface(surface, overrides, includeLocal) {
  let path = null;
  if (overrides && overrides[surface.id]) {
    path = overrides[surface.id];
  } else if (surface.scope === 'repo') {
    path = join(REPO, surface.rel);
  } else if (surface.scope === 'local') {
    if (!includeLocal) {
      return { surface, path: null, text: null, missing: '本地面默认不读（要读请显式 --include-local）' };
    }
    const root = dataRoot();
    if (!root) return { surface, path: null, text: null, missing: '数据目录未知' };
    path = join(root, surface.dataRel.replace('<agent>', agentName()));
  }
  if (!path) return { surface, path: null, text: null, missing: '没有路径' };
  if (!existsSync(path)) return { surface, path, text: null, missing: '文件不存在' };
  try {
    return { surface, path, text: readFileSync(path, 'utf8'), missing: null };
  } catch (e) {
    return { surface, path, text: null, missing: '读失败：' + e.message };
  }
}

/** 债务登记 ⇒ ⇒ {surfaceId: {kind: count}}。 */
export function debtMap() {
  const out = {};
  for (const d of KNOWN_DEBT) {
    if (!out[d.surface]) out[d.surface] = {};
    out[d.surface][d.kind] = d.count;
  }
  return out;
}

/** 仓里**像状态面**的文件名（账本/记忆/知识库那几种）。 */
const STATE_FILE_RE = /^(AGENTS|AGENT|MEMORY|KNOWLEDGE|LEDGER)([-_.].*)?\.md$/i;

/**
 * 仓里**未登记**的状态面 ⇒ ⇒ 红色信号。
 *
 * ⚠️⚠️ **这里踩过一个坑**（2026-11-05 自检时抓到）：第一版先 continue 掉了
 *    非目录项 ⇒ ⇒ **文件根本走不到判据** ⇒ ⇒ 于是「未登记状态面」这条规则
 *    **从来没生效过**（它一直绿着）⇒ ⇒ 典型的**假绿**。
 *    ⇒ ⇒ 所以判据必须**先看文件名、再判是不是目录**。
 *
 * @param {string} root 仓根
 * @param {string[]} declared 已登记的相对路径
 */
export function findUnregistered(root, declared) {
  const known = new Set(declared.map((d) => d.replace(/\\/g, '/')));
  const found = [];
  const SKIP = new Set(['node_modules', 'target', '.git', 'dist', 'build', '.local', 'benchmark', '.dart_tool']);
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        // ⚠️⚠️⚠️ **「里面带 .git 的目录」要整棵跳过** —— 两种布局都靠它
        //    （2026-11-05 实测踩到，本仓与 cortex-residue 注册表同一个坑）：
        //      ① **CI**：actions/checkout 把**兄弟仓**检到**工作区根之内**
        //         （checkout 拒绝工作区之外的路径）⇒ ⇒ 那些仓**就在本仓根下**
        //         ⇒ ⇒ 而本机那 6 个兄弟仓**每个都有 AGENTS.md**
        //         ⇒ ⇒ 不排除 ⇒ ⇒ CI 里「未登记状态面」会**误报 6 个仓**；
        //      ② **本地**：.verify-wt 里 .git 是**文件**（worktree）
        //         ⇒ ⇒ 它是**同一份状态的副本**⇒ ⇒ 不该被判成新状态面。
        //    ⇒ ⇒ 判据统一成「目录里存在 .git（文件或目录都算）⇒ ⇒ 整棵子树跳过」。
        try {
          if (existsSync(join(p, '.git'))) continue;
        } catch {
          /* 读不到就当普通目录 */
        }
        walk(p, depth + 1);
        continue;
      }
      // ⚠️ **文件必须在这里判**（第一版把文件 continue 掉了 ⇒ ⇒ 规则从未生效）
      if (!STATE_FILE_RE.test(e.name)) continue;
      const rel = relative(root, p).replace(/\\/g, '/');
      if (!known.has(rel)) found.push(rel);
    }
  };
  walk(root, 0);
  return found;
}

/**
 * 跨面符号域 —— 一个面可以合法引用另一个面的编号（子仓账本引用父仓编号）。
 *
 * ⚠️ 不给跨面符号域 ⇒ ⇒ 子仓里「承父仓㋱条」会被记成悬空 ⇒ ⇒ **假红**。
 */
export function extraSymbolsFor(surface) {
  return symbolDomainOf(surface).union;
}

/**
 * 跨面符号域 —— 分成两份：
 *   union —— 并集（用于「能不能解析」：子仓引用父仓编号 ⇒ ⇒ 不是悬空）；
 *   own   —— **跨面自己**的符号（用于「歧义」判定：本面与跨面同名 ⇒ ⇒
 *             不带限定词就分不清指的是哪一条）。
 *
 * ⚠️ 不给跨面符号域 ⇒ ⇒ 子仓里「承父仓㋱条」会被记成悬空 ⇒ ⇒ **假红**。
 * ⚠️ 只给并集不给 own ⇒ ⇒ 歧义引用查不出来 ⇒ ⇒ **漏报**（能解析但指错）。
 */
export function symbolDomainOf(surface) {
  const domains = surface.symbolDomain || [];
  const union = [];
  const own = [];
  for (const d of domains) {
    const other = SURFACES.find((x) => x.id === d);
    if (!other || other.scope !== 'repo') continue;
    const r = readSurface(other, null, false);
    if (r.text === null) continue;
    const a = analyzeSurface({ id: other.id, kind: other.kind, text: r.text });
    for (const s of a.symbols) union.push(s);
    for (const s of a.ownSymbols) own.push(s);
  }
  return { union, own };
}

export function parseOverrides(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--surface=([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 自检 —— **逐条退化**（真文件一个字不动 ⇒ ⇒ 退化只发生在内存副本里）
// ---------------------------------------------------------------------------

const FIXTURE = [
  '**Updated**: 2026-10-31 (㋰ **「旧条目」** —— 承㌁那条，本条记测试夹具。)',
  '',
  '**Updated**: 2026-11-05 (㌁ **「新条目」** —— 承㋰那条，本条记测试夹具。)',
  '> 信封：epoch=2026-11-05 | authority=user | scope=project | source=arXiv:2606.30306 | status=active | supersedes=none',
  '',
].join('\n');

function fixtureSurface() {
  return { id: 'fixture', kind: 'md-updated', text: FIXTURE, cutoff: CUTOFF };
}

/** runtime 来源面的夹具 —— 写入器是运行时的记忆工具（只产 mem-append-reason 注释）。 */
const RT_FIXTURE = [
  '<!-- mem-append-reason: 运行时记忆工具写的来源记录 -->',
  '### 新偏好（2026-11-05）',
  '这条偏好由运行时的记忆工具写入。',
  '',
].join('\n');

/** 同样的一条，但**没有** runtime 来源注释 ⇒ ⇒ 两者都没有 ⇒ ⇒ 必须红。 */
const RT_FIXTURE_BARE = ['### 新偏好（2026-11-05）', '这条偏好没有来源记录。', ''].join('\n');

export function selfTest() {
  const NL = String.fromCharCode(10);
  const results = [];
  const check = (name, cond, why) => {
    results.push({ name, ok: !!cond, why: why || '' });
  };

  const base = judgeSurface(fixtureSurface(), {});
  check(
    '基线：夹具零违规（信封齐全 ＋ 指针可解析）',
    base.violations.length === 0,
    base.violations.map((v) => v.msg).join(' | ')
  );

  /** 逐条退化 ⇒ ⇒ 验收标准是「关掉哪一处，就只红那一处」。 */
  const D = (name, expected, mutate, debt, surfaceExtra) => {
    const s = fixtureSurface();
    if (surfaceExtra) Object.assign(s, surfaceExtra);
    mutate(s);
    const got = judgeSurface(s, debt || {}).violations.map((v) => v.msg).sort();
    const want = expected.slice().sort();
    const same = got.length === want.length && got.every((x, i) => x === want[i]);
    check(name, same, same ? '' : '期望 ' + JSON.stringify(want) + '；实际 ' + JSON.stringify(got));
  };

  D(
    '退化①：新条目没有信封 ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：条目「新条目」没有信封行 ⇒ ⇒ 它没有授权/来源/取代链 ⇒ ⇒ 没人能撤销它'],
    (s) => {
      s.text = s.text.replace(/^> 信封：.*$/m, '');
    }
  );

  D(
    '退化②：信封缺 source ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：条目「新条目」的信封缺字段 source'],
    (s) => {
      s.text = s.text.replace(' | source=arXiv:2606.30306', '');
    }
  );

  D(
    '退化③：取代链指向不存在的条目 ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：条目「新条目」的取代链指向「㋱」⇒ ⇒ 解析不到 ⇒ ⇒ 取代链是断的'],
    (s) => {
      s.text = s.text.replace('supersedes=none', 'supersedes=㋱');
    }
  );

  D(
    '退化④：status 不是允许值 ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：新条目：status「maybe」不在允许集合'],
    (s) => {
      s.text = s.text.replace('status=active', 'status=maybe');
    }
  );

  D(
    '退化⑤：epoch 不是日期 ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：新条目：epoch「上周」不是日期也不是 vN'],
    (s) => {
      s.text = s.text.replace('epoch=2026-11-05', 'epoch=上周');
    }
  );

  D(
    '退化⑥：新增一条解析不到的继承指针 ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：未登记的存量债务 dangling-symbol-ref（1 处）⇒ ⇒ 请登记或修掉'],
    (s) => {
      s.text = s.text.replace('承㋰那条', '承㋱那条');
    }
  );

  D(
    '退化⑦：位置型指针 ⇒ ⇒ 恰好红这一条',
    ['状态面 fixture：未登记的存量债务 positional-ref（1 处）⇒ ⇒ 请登记或修掉'],
    (s) => {
      s.text = s.text.replace('承㋰那条', '承上一条');
    }
  );

  D(
    '退化⑧：债务登记数比实测大 ⇒ ⇒ 红「清单过期」',
    ['状态面 fixture：dangling-symbol-ref 登记 1 处，实测 0 处 ⇒ ⇒ 清单过期 ⇒ ⇒ 请销账'],
    (s) => {
      /* 夹具本身没有悬空指针 ⇒ ⇒ 登记 1 处 ⇒ ⇒ 清单过期 */
    },
    { 'dangling-symbol-ref': 1 }
  );

  D(
    '退化⑨：债务登记数比实测小 ⇒ ⇒ 红「新增了」',
    ['状态面 fixture：dangling-symbol-ref 登记 0 处，实测 1 处 ⇒ ⇒ 新增了 ⇒ ⇒ 闸红'],
    (s) => {
      s.text = s.text.replace('承㋰那条', '承㋱那条');
    },
    { 'dangling-symbol-ref': 0 }
  );

  D(
    '退化⑩：新条目占用**已被别的条目用掉的标记** ⇒ ⇒ 恰好红这一条（R4）',
    ['状态面 fixture：标记 ㋰（U+32F0）被 **2 条**占用（2026-10-31「旧条目」 ＋ 2026-11-05「撞号条目」）⇒ ⇒ 「承㋰」解析出**多条** ⇒ ⇒ 引用是歧义的'],
    (s) => {
      // ⚠️ **加一条**而不是**改标记** —— 改标记会把旧条目的引用打成悬空
      //    ⇒ ⇒ 那是另一种失败（而且会多红一条）⇒ ⇒ 验收标准要干净。
      s.text =
        s.text +
        '**Updated**: 2026-11-05 (㋰ **「撞号条目」** —— 承㌁那条，本条记测试夹具。)' +
        NL +
        '> 信封：epoch=2026-11-05 | authority=measured | scope=project | source=fixture | status=active | supersedes=none' +
        NL;
    }
  );

  D(
    '退化⑪：**跨面同名**且引用**没有限定词** ⇒ ⇒ 恰好红这一条（R7 走存量债）',
    ['状态面 fixture：未登记的存量债务 ambiguous-cross-ref（1 处）⇒ ⇒ 请登记或修掉'],
    (s) => {
      s.text = s.text.replace('承㋰那条', '承㋰那条');
    },
    {},
    { domainSymbols: ['㋰'] }
  );

  D(
    '退化⑫：**跨面同名**但引用**带限定词** ⇒ ⇒ 不判红（孪生：限定词真的消歧了）',
    [],
    (s) => {
      s.text = s.text.replace('承㋰那条', '承**父仓**㋰那条');
    },
    {},
    { domainSymbols: ['㋰'] }
  );

  // ── R6（未登记状态面）—— 用**真临时目录**做 ⇒ ⇒ 端到端 ──
  const tmp = mkdtempSync(join(tmpdir(), 'state-surface-'));
  try {
    writeFileSync(join(tmp, 'AGENTS.md'), '**Updated**: 2026-11-05 (㋰ **「x」**)\n', 'utf8');
    const found = findUnregistered(tmp, []);
    check(
      'R6 正向：仓里有一个未登记的 AGENTS.md ⇒ ⇒ 被抓到',
      found.length === 1 && found[0] === 'AGENTS.md',
      JSON.stringify(found)
    );
    const found2 = findUnregistered(tmp, ['AGENTS.md']);
    check('R6 反向：登记过就不报', found2.length === 0, JSON.stringify(found2));
    writeFileSync(join(tmp, 'NOTES.md'), '随便一个文档\n', 'utf8');
    const found3 = findUnregistered(tmp, ['AGENTS.md']);
    check('R6 边界：不是状态面名字的文件不报', found3.length === 0, JSON.stringify(found3));

    // ⚠️⚠️ **CI 布局陷阱**：兄弟仓被 checkout 到**仓根之内** ⇒ ⇒ 每个兄弟仓
    //    都有自己的 AGENTS.md ⇒ ⇒ 不排除就会在 CI 里**误报 6 个仓**。
    //    ⇒ ⇒ 判据：目录里存在 .git ⇒ ⇒ 整棵子树跳过（**目录**与**文件**两种）。
    const nestedRepo = join(tmp, 'telencephalon');
    mkdirSync(nestedRepo, { recursive: true });
    writeFileSync(join(nestedRepo, 'AGENTS.md'), '**Updated**: 2026-11-02 (㋰ **「x」**)\n', 'utf8');
    mkdirSync(join(nestedRepo, '.git'), { recursive: true });
    const found4 = findUnregistered(tmp, ['AGENTS.md']);
    check('R6 边界：**嵌套 git 仓**（CI 的兄弟仓布局）整棵跳过', found4.length === 0, JSON.stringify(found4));

    const wtRepo = join(tmp, 'verify-wt');
    mkdirSync(wtRepo, { recursive: true });
    writeFileSync(join(wtRepo, 'AGENTS.md'), '**Updated**: 2026-11-02 (㋰ **「x」**)\n', 'utf8');
    writeFileSync(join(wtRepo, '.git'), 'gitdir: elsewhere\n', 'utf8');
    const found5 = findUnregistered(tmp, ['AGENTS.md']);
    check('R6 边界：**worktree**（.git 是文件）整棵跳过', found5.length === 0, JSON.stringify(found5));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 孪生（证明判据不是「见词就红」）
  const twin = fixtureSurface();
  twin.text = twin.text.replace(
    '> 信封：epoch=2026-11-05',
    '> 这条正文里提到「信封」两个字，但它不是信封行。\n> 信封：epoch=2026-11-05'
  );
  const twinV = judgeSurface(twin, {}).violations;
  check('孪生：正文提到「信封」但不是信封行 ⇒ ⇒ 不判红', twinV.length === 0, JSON.stringify(twinV.map((v) => v.msg)));

  const twin2 = fixtureSurface();
  twin2.text = twin2.text.replace('承㋰那条', '承担那条责任');
  const twin2V = judgeSurface(twin2, {}).violations;
  check('孪生：「承担」不是继承指针 ⇒ ⇒ 不判红', twin2V.length === 0, JSON.stringify(twin2V.map((v) => v.msg)));

  const twin3 = fixtureSurface();
  twin3.text = twin3.text.replace(/^> 信封：.*$/m, '');
  twin3.text = twin3.text.replace('2026-11-05 (㌁', '2026-10-30 (㌁');
  const twin3V = judgeSurface(twin3, {}).violations;
  check(
    '孪生：cutoff 之前的旧条目没有信封 ⇒ ⇒ 不判红（存量走债务）',
    twin3V.length === 0,
    JSON.stringify(twin3V.map((v) => v.msg))
  );

  // ⚠️⚠️ **runtime 来源面** —— 写入器根本不产信封（实测：记忆工具对 user 面
  //    只有 read/search/append）⇒ ⇒ 它盖的 `mem-append-reason` 注释**就是**来源
  //    ⇒ ⇒ 判据认「信封 **或** runtime 注释」⇒ ⇒ 两者都没有才红。
  const rtSurface = (text) => ({
    id: 'rt',
    kind: 'md-heading',
    text: text,
    cutoff: CUTOFF,
    runtimeProvenance: true,
  });
  const rtV = judgeSurface(rtSurface(RT_FIXTURE), {}).violations;
  check(
    'runtimeProvenance 面：条目只有 runtime 来源注释、没有信封 ⇒ ⇒ 不判红（按写入器自己的形状判来源）',
    rtV.length === 0,
    JSON.stringify(rtV.map((v) => v.msg))
  );
  const rtBareV = judgeSurface(rtSurface(RT_FIXTURE_BARE), {}).violations;
  check(
    'runtimeProvenance 面：既没信封也没 runtime 注释 ⇒ ⇒ 恰好红这一条（R1）',
    rtBareV.length === 1 && rtBareV[0].rule === 'R1',
    JSON.stringify(rtBareV.map((v) => v.msg))
  );
  const rtNoFlagV = judgeSurface(
    { id: 'rt', kind: 'md-heading', text: RT_FIXTURE_BARE, cutoff: CUTOFF },
    {}
  ).violations;
  check(
    '孪生：没声明 runtimeProvenance 的面 ⇒ ⇒ 仍然硬要信封 ⇒ ⇒ 同样红这一条（不是全局放松）',
    rtNoFlagV.length === 1 && rtNoFlagV[0].rule === 'R1',
    JSON.stringify(rtNoFlagV.map((v) => v.msg))
  );

  // 真面基线
  const dm = debtMap();
  let realViolations = [];
  for (const s of SURFACES) {
    if (s.scope !== 'repo' || s.judge !== true) continue;
    const r = readSurface(s, null, false);
    if (r.text === null) {
      realViolations.push(s.id + ' 读不到');
      continue;
    }
    const dom = symbolDomainOf(s);
    realViolations = realViolations.concat(
      judgeSurface(
        {
          id: s.id,
          kind: s.kind,
          text: r.text,
          cutoff: s.cutoff,
          runtimeProvenance: s.runtimeProvenance,
          extraSymbols: dom.union,
          domainSymbols: dom.own,
        },
        dm[s.id] || {}
      ).violations.map((v) => v.msg)
    );
  }
  const declared = SURFACES.filter((s) => s.scope === 'repo').map((s) => s.rel);
  const unreg = findUnregistered(REPO, declared);
  check(
    '基线：真面（三个账本）零违规 ＋ 仓里没有未登记的状态面',
    realViolations.length === 0 && unreg.length === 0,
    realViolations.join(' | ') + ' 未登记：' + JSON.stringify(unreg)
  );

  const ok = results.filter((r) => r.ok).length;
  console.log(
    results.map((r) => (r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.why ? '  —— ' + r.why : '')).join(NL)
  );
  console.log('自检：' + ok + '/' + results.length + ' 通过');
  return ok === results.length;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const overrides = parseOverrides(argv);
  const includeLocal = argv.includes('--include-local');
  const dm = debtMap();
  const violations = [];
  const notes = [];
  const audit = [];

  for (const s of SURFACES) {
    const r = readSurface(s, overrides, includeLocal);
    if (s.judge === false) {
      notes.push('面 ' + s.id + '（' + s.label + '）：**只登记不判** ⇒ ' + (r.path || '路径未知'));
      continue;
    }
    if (r.text === null) {
      if (s.scope === 'repo') {
        console.error('❌ 源没读全 ⇒ ⇒ 「没红」不等于「没问题」（退出码 2）');
        console.error('   面 ' + s.id + '（' + s.label + '）读不到：' + r.missing + ' ⇒ ' + r.path);
        process.exit(2);
      }
      notes.push(
        '面 ' + s.id + '（' + s.label + '）：本轮**未覆盖** ⇒ ' + r.missing + ' ⇒ ' + (r.path || '路径未知')
      );
      continue;
    }
    const dom = symbolDomainOf(s);
    const res = judgeSurface(
      {
        id: s.id,
        kind: s.kind,
        text: r.text,
        cutoff: s.cutoff,
        // ⚠️ **runtimeProvenance 必须一起传下去** —— 少了它 ⇒ ⇒ 写入器根本不产
        //    信封的面（user-memory）会按「必须有信封」判 ⇒ ⇒ 那条规则在该面上
        //    **做不到** ⇒ ⇒ 2026-11-05 实测踩到过一次。
        runtimeProvenance: s.runtimeProvenance,
        extraSymbols: dom.union,
        domainSymbols: dom.own,
      },
      dm[s.id] || {}
    );
    for (const v of res.violations) violations.push(v);
    audit.push({
      id: s.id,
      label: s.label,
      path: r.path,
      entries: res.analysis.entries.length,
      symbols: res.analysis.symbols.length,
      counts: res.analysis.counts,
      debt: dm[s.id] || {},
      details: {
        dangling: res.analysis.details.dangling.slice(0, 20),
        positional: res.analysis.details.positional.slice(0, 20),
        noDate: res.analysis.details.noDate.slice(0, 20),
        noEnvelope: res.analysis.details.noEnvelope.slice(0, 20),
        duplicateMarkers: res.analysis.details.duplicateMarkers.slice(0, 20),
        duplicateMarkersNew: res.analysis.details.duplicateMarkersNew.slice(0, 20),
        ambiguousRefs: res.analysis.details.ambiguousRefs.slice(0, 20),
      },
    });
  }

  const declared = SURFACES.filter((s) => s.scope === 'repo').map((s) => s.rel);
  const unreg = findUnregistered(REPO, declared);
  for (const u of unreg) {
    violations.push({
      rule: 'R6',
      msg:
        '仓里有**未登记的状态面**：' + u + ' ⇒ ⇒ 请登记进 state-surface-registry.mjs（否则它悄悄进来没人管）',
    });
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ cutoff: CUTOFF, violations, notes, audit, unregistered: unreg }, null, 2));
    process.exit(violations.length === 0 ? 0 : 1);
  }

  if (argv.includes('--audit')) {
    console.log('状态面现状清单（cutoff=' + CUTOFF + '）：');
    for (const a of audit) {
      console.log('');
      console.log('◆ 面 ' + a.id + '（' + a.label + '）');
      console.log('   路径：' + a.path);
      console.log('   条目：' + a.entries + ' 条；带圈编号 ' + a.symbols + ' 个');
      for (const k of Object.keys(a.counts)) {
        console.log(
          '   - ' + k + '：' + a.counts[k] + ' 处' + (a.debt[k] !== undefined ? '（登记 ' + a.debt[k] + '）' : '')
        );
      }
      for (const k of Object.keys(a.details)) {
        const list = a.details[k];
        if (list && list.length) {
          console.log('   ▸ ' + k + '（前 ' + list.length + ' 条）：');
          for (const x of list) console.log('       · ' + (typeof x === 'string' ? x : JSON.stringify(x)));
        }
      }
    }
    console.log('');
    for (const n of notes) console.log('注：' + n);
    console.log('');
    console.log('未登记的状态面：' + (unreg.length ? unreg.join(', ') : '（无）'));
    process.exit(0);
  }

  console.log('状态面治理闸：cutoff=' + CUTOFF + '；扫 ' + audit.length + ' 个面');
  for (const n of notes) console.log('注：' + n);
  if (violations.length === 0) {
    console.log('✓ 零违规');
  } else {
    console.log('✘ ' + violations.length + ' 处违规：');
    for (const v of violations) console.log('   [' + v.rule + '] ' + v.msg);
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

main(process.argv.slice(2));
