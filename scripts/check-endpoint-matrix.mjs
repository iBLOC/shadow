#!/usr/bin/env node
/**
 * 判定表的**完整性**校验 —— 源码里的路由 vs 判定表里列的那些
 *
 * ## 为什么要有这个守卫
 *
 * `docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md`
 * 那张表的第二节自己写着：
 *
 * > 「这种表**必须用脚本对着源码验一遍**，人肉列一定会漏 ⇒ 端点集合是会长的
 * > （今天 127 条），表会过期。」
 *
 * ⚠️ **但那次校验用的脚本从来没进过仓** ⇒ 下一个加端点的人**没法复跑它**
 * ⇒ 表会**静默过期** ⇒ 而表过期 = 判定错 = 锁该锁的没锁。
 *
 * 这个脚本把那套校验**变成可复跑的**。
 *
 * ## 比什么
 *
 * - **源码侧**：把 `telencephalon/src/api` 下的全部 `.rs`（递归）与
 *   `telencephalon/src/flow/api/mod.rs` 里的 `.route("…"` 逐条解析出来
 *   （路径 + 方法）。
 * - **表侧**：把判定表四张分级表里的「端点」单元格拆成**候选路径**。
 *
 * ⚠️ **表侧的单元格有歧义**：同一行可能写
 * `` `/api/telencephalon/mcp/servers` \| `/{id}` ``（第二项是**后缀**），
 * 也可能写 `` `…/servers/{id}/tools` \| `/mcp/agents/{name}/servers` ``
 * （第二项是**兄弟**，不是后缀）⇒ 所以这里对每个单元格生成**多个候选**，
 * 只要**任意一个候选**命中就算覆盖 ⇒ **宁可多算覆盖，也不误报漏了**。
 *
 * ## 判定
 *
 * - **漏了**（源码里有、表里没有）⇒ **退出码 1**。这是要紧的那种漂移。
 * - **表里多写了**（表里有、源码里找不到）⇒ 只报告，不失败
 *   —— 表可能记了 host 端才有的路由（feature gate）。
 *
 * ## 用法
 *
 *   node scripts/check-endpoint-matrix.mjs
 *   node scripts/check-endpoint-matrix.mjs --source C:\Projects\iBLOC\telencephalon
 *
 * ⚠️ **防假绿**：源码侧解析出 **0 条路由** ⇒ 直接报错退出（不是「全对」）。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MATRIX_PATH = join(
  REPO,
  'docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md',
);

function parseArgs(argv) {
  const opts = { source: resolve(REPO, '..', 'telencephalon'), why: null, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--why') opts.why = argv[++i];
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(
        '用法: node scripts/check-endpoint-matrix.mjs [--source <telencephalon 路径>] [--why <某个路径>] [--self-test]',
      );
      process.exit(0);
    } else {
      console.error(`不认识的参数: ${argv[i]}`);
      process.exit(2);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 源码侧
// ---------------------------------------------------------------------------

function walkRust(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkRust(full, out);
    else if (entry.endsWith('.rs')) out.push(full);
  }
  return out;
}

/** 把源码里的 `.route("…"` 逐条解析出来。 */
function routesInSource(sourceRoot) {
  const files = [
    ...walkRust(join(sourceRoot, 'src', 'api')),
    ...walkRust(join(sourceRoot, 'src', 'flow', 'api')),
  ];
  const routes = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // `.route("path", …)` —— 路径是**第一个**参数；中间可能有换行。
    const re = /\.route\(\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const path = m[1];
      // 方法：在这一行（或往后几行）里找 `get(` / `post(` / `put(` / `delete(` / `patch(`。
      const tail = text.slice(m.index, m.index + 220);
      const method =
        /\b(get|post|put|delete|patch|head)\s*\(/.exec(tail)?.[1]?.toUpperCase() ?? 'GET';
      routes.push({ path, method, file: file.replace(sourceRoot + '\\', '') });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// 表侧
// ---------------------------------------------------------------------------

function splitRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/** 逐段的最长公共前缀。 */
function segmentCommonPrefix(a, b) {
  const as = a.split('/');
  const bs = b.split('/');
  const out = [];
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) break;
    out.push(as[i]);
  }
  return out.join('/');
}

/**
 * 剥掉**方法前缀**。
 *
 * 判定表里有两种写法：
 * - 分级表的「端点」列只有路径（方法在**另一列**）；
 * - §二那张漂移表的第一列写的是 `GET /api/telencephalon/agents`
 *   —— **方法在反引号里面**。
 *
 * ⚠️ 不剥的话，拿去和源码里的路径（源码只有路径、没有方法）比
 * ⇒ 必然「表里有、源码里找不到」⇒ **假阳性**。
 */
function stripMethod(s) {
  return s.replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i, '');
}

/**
 * 一个单元格里可能藏着好几条路径 ⇒ 生成**候选集**。
 *
 * 形态有两种：
 * - 第二项是**后缀**（`/…/servers` + `/{id}`）；
 * - 第二项是**兄弟**（`/…/servers/{id}/tools` + `/mcp/agents/{name}/servers`）。
 *
 * 两种都算上 ⇒ 宁可多算覆盖，也不误报「漏了」。
 */
function candidatePaths(cell) {
  const items = [...cell.matchAll(/`([^`]+)`/g)].map((m) => stripMethod(m[1]));
  if (items.length === 0) return [];
  const cands = new Set([items[0]]);
  for (const it of items.slice(1)) {
    if (!it.startsWith('/')) {
      // axum 0.8 的 `:param` 形态（表里写作 `` `/…/messages` \| `:stream` ``）
      // ⇒ 它挂在**最后一段**后面。
      if (it.startsWith(':')) cands.add(items[0] + it);
      continue;
    }
    cands.add(items[0] + it);
    const common = segmentCommonPrefix(items[0], it);
    if (common) cands.add(common + it);
    // 兄弟形态：`/api/telencephalon` + `/mcp/agents/…`
    const segs = items[0].split('/');
    for (let i = segs.length - 1; i > 0; i--) {
      const prefix = segs.slice(0, i).join('/');
      if (prefix) cands.add(prefix + it);
    }
  }
  return [...cands];
}

const CLASS_HEADINGS = [
  { marker: '### A 类', cls: 'A' },
  { marker: '### B 类', cls: 'B' },
  { marker: '### C 类', cls: 'C' },
  { marker: '### D 类', cls: 'D' },
];

/**
 * 把**围栏代码块**（``` … ```）从正文里剥出来。
 *
 * ## 为什么必须剥（实测踩过的坑）
 *
 * markdown 的行内代码是**按反引号顺序两两配对**的 ⇒ 而围栏的 ``` 里有
 * **相邻**的反引号 ⇒ 正则 `` /`([^`]+)`/g `` 配不出空 span ⇒
 * ⇒ **每出现一个围栏，后面所有反引号的配对就整体错位一格**
 * ⇒ ⇒ 判定表里的路径**全都认不出来**（实测：在文档里加了 3 个围栏代码块
 * ⇒ 复跑脚本报「漏了 18 条」+「表里有 6 条源码里找不到」，
 * 而源码一个路由都没变 ⇒ **表没坏，是解析器被文档格式搞坏了**）。
 *
 * ⇒ 所以：**围栏内容单独收集**（路径 token 一个不丢），**正文**先把围栏抹平
 * （保留换行 ⇒ 行号不变）再配对。
 *
 * ⚠️ 这条坑还有个孪生兄弟：**同一个字符串在两种语言里含义不同**
 * （JS 块注释不可嵌套、Rust 可嵌套，见 ㊺ 条）—— 同一个道理：
 * **校验器也得扛得住文档的普通写法**，不然它就成了「一改文档就误报」的东西。
 */
function splitFences(text) {
  const lines = text.split(/\r?\n/);
  const prose = [];
  const fences = [];
  let current = null;
  for (const line of lines) {
    if (/^\s*(`{3,})/.test(line)) {
      if (current === null) {
        current = [];
        fences.push(current);
      } else {
        current = null;
      }
      prose.push(' '.repeat(line.length));
      continue;
    }
    if (current !== null) current.push(line);
    prose.push(current === null ? line : ' '.repeat(line.length));
  }
  return { prose: prose.join('\n'), fences };
}

function pathsInMatrix() {
  const raw = readFileSync(MATRIX_PATH, 'utf8');
  const lines = splitFences(raw).prose.split(/\r?\n/);
  const entries = [];
  let cls = null;
  for (const line of lines) {
    const heading = CLASS_HEADINGS.find((h) => line.startsWith(h.marker));
    if (heading) {
      cls = heading.cls;
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < 3) continue;
    const endpointCell = cells[0];
    if (!endpointCell || endpointCell === '端点' || endpointCell.startsWith('---')) continue;
    for (const p of candidatePaths(endpointCell)) {
      entries.push({ cls, path: p });
    }
    // 主路径（单元格的第一项）—— 「表里多写了」只用主路径来报，
    // 否则会把我**拼出来的候选**（`…/start` + `/stop` ⇒ `…/start/stop`）
    // 也报成漂移 ⇒ 一堆噪音。
    const primary = [...endpointCell.matchAll(/`([^`]+)`/g)].map((m) => stripMethod(m[1]))[0];
    if (primary) entries.push({ cls, path: primary, primary: true });
  }
  return entries;
}

/**
 * 抽出正文里的**行内代码跨度**（CommonMark 规则）。
 *
 * ## 为什么不能用「顺序配对」
 *
 * Markdown 的行内代码跨度**可以跨行**，而且闭合串的反引号数必须与开启串
 * **相等**（CommonMark §6.1）。而 `` /`([^`]+)`/g `` 这种「按顺序两两配对」
 * 只在「每个跨度都在一行里、且每行反引号成对」时才成立。
 *
 * ⚠️ **实测踩到的两种形态**（判定表里都有）：
 * - 散文里出现 **三个连续反引号**（L100：「而围栏的 ``` 里有…」）
 *   ⇒ 顺序配对从这里起**整体错一格**；
 * - **跨行的行内代码**（L209-210：`shadow-mobile/lib/…/telencephalon/`
 *   换行才闭合）⇒ 顺序配对把跨度接错。
 *
 * ⇒ 两种叠加 ⇒ 全文只剩 13 个路径 token（文档明明有几百个）
 * ⇒ 通配行 `/…/preview/*`、`/api/sessions/*` 永远覆盖不到具体路径
 * ⇒ 守卫报「漏了 18 条」—— **而源码一个路由都没变** ⇒ **表没坏，是解析器坏了**。
 *
 * ## 规则怎么实现
 *
 * 扫到一串反引号（长度 N）⇒ 往后找**长度恰为 N**的另一串 ⇒ 它闭合这个跨度
 * ⇒ 找不到就当普通字符跳过。围栏（```）已被 `splitFences` 抹平 ⇒
 * 散文里剩下的多反引号串不会误闭合。
 */
function inlineSpans(text) {
  const spans = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text[i] !== '`') {
      i++;
      continue;
    }
    let open = 0;
    while (i + open < n && text[i + open] === '`') open++;
    // 往后找**长度恰为 open**的闭合串
    let j = i + open;
    let close = -1;
    while (j < n) {
      if (text[j] !== '`') {
        j++;
        continue;
      }
      let len = 0;
      while (j + len < n && text[j + len] === '`') len++;
      if (len === open) {
        close = j;
        break;
      }
      j += len;
    }
    if (close === -1) {
      i += open; // 没有同长度的闭合串 ⇒ 这串反引号是普通文字
      continue;
    }
    spans.push(text.slice(i + open, close));
    i = close + open;
  }
  return spans;
}

/**
 * 整份文档里出现过的**所有**路径 —— 不只是表格里的。
 *
 * 因为文档还有散文段落（§「不在移动端那张面上的（host 端才有）」）明确点了
 * `/api/sessions/*` 这类**只在 host 端存在**的路由 ⇒ 它们**不该**被算成「漏了」。
 */
function mentionedPathsIn(raw) {
  const { prose, fences } = splitFences(raw);
  const out = [];
  const push = (s) => {
    // 一个跨度里可能塞了**好几条路径**（散文里写 `` `GET /a/b|/c` ``）
    // ⇒ 拆开，各看各的。
    for (const part of stripMethod(s.trim()).split('|')) {
      const t = part.trim();
      if (t.startsWith('/')) out.push(t);
    }
  };
  // 正文：CommonMark 跨度（跨行也算一个跨度）
  for (const s of inlineSpans(prose)) push(s);
  // 围栏：**按行各自解析**（围栏里 markdown 不再解析跨度 ⇒ 一行一行看）
  for (const block of fences) {
    for (const line of block) {
      for (const s of inlineSpans(line)) push(s);
    }
  }
  return out;
}

function mentionedPaths() {
  return mentionedPathsIn(readFileSync(MATRIX_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// 自检（守卫的守卫）
// ---------------------------------------------------------------------------

/**
 * 判定表**本身**会被不断改写 ⇒ 解析器必须扛得住文档的普通写法。
 *
 * ⚠️ 这不是「测试覆盖率」的自嗨，是**防假绿**：解析器一旦被文档格式带坏
 * （配对错位 ⇒ token 几乎为 0 ⇒ 通配行失效），
 * 守卫会**稳定地报一堆假阳性** ⇒ 而「守卫一直是红的」比「没有守卫」更坏
 * ⇒ 下一个人会以为表坏了 ⇒ **把真行删掉**。
 *
 * ⇒ 所以把这三种**实测踩到过**的文档形态钉死：
 * ① 散文里出现三个连续反引号；
 * ② 行内代码**跨行**才闭合；
 * ③ 方法写在反引号里面（`GET /api/…`）。
 */
function selfTest() {
  const SAMPLE = [
    '普通段落里的 `/api/plain/one` 应当被认出来。',
    '而围栏的 ``` 里有**相邻**反引号 ⇒ 配不出空 span。',
    '跨行的行内代码：',
    '`shadow-mobile/lib/services/telencephalon/',
    'telencephalon_client.dart:679-687`）在 `_apiKey` 非空时加 `X-Shadow-Key`',
    '```bash',
    'curl -X POST http://127.0.0.1:60080/a2a',
    '```',
    '| `/api/flows` | `/{id}` | `/executions` | GET | flow | ✅ | 说明 |',
    '`GET /api/telencephalon/agents` 这一行的方法写在反引号里。',
  ].join('\n');

  const toks = mentionedPathsIn(SAMPLE);
  const has = (t) => toks.includes(t);
  const cases = [
    ['普通行内代码被认出来', has('/api/plain/one')],
    ['散文里的 ``` 不破坏后面的配对', has('/api/flows') && has('/executions')],
    ['表格单元格的路径被认出来', has('/{id}')],
    ['方法前缀被剥掉', has('/api/telencephalon/agents')],
    ['跨行跨度不会被当成路径', !toks.some((t) => t.includes('\n'))],
    ['认出来的 token 数合理（不是 0，也不是全文）', toks.length >= 4 && toks.length <= 12],
  ];

  console.log('自检：文档形态 → 路径 token');
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? '✔' : '✘'} ${name}`);
  }
  console.log(`  （认出的 token：${toks.map((t) => JSON.stringify(t)).join(' ')}）`);
  const failed = cases.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`\n✘ 自检没过 ${failed.length} 条 —— 解析器被文档格式带坏了。`);
    return false;
  }
  console.log('\n✔ 自检全过。');
  return true;
}

/** 一个 token 能不能当「尾巴」用（源码路径以它结尾）？ */
function usableAsTail(token) {
  if (!token.startsWith('/')) return false;
  if (token.endsWith('/*')) return false;
  const segs = token.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  // 光有模板段（如 `/{id}`）太泛 —— 任何以它结尾的路径都会被误算成覆盖。
  return segs.some((s) => !/^\{.*\}$/.test(s));
}

/** 源码路径 P 是否被文档里的某个 token 覆盖？ */
function coveredByToken(p, token) {
  if (token === p) return true;
  // 通配：`/api/telencephalon/neuron/preview/*` 覆盖它下面的一切。
  if (token.endsWith('/*')) {
    const prefix = token.slice(0, -2);
    return p === prefix || p.startsWith(prefix + '/');
  }
  // 同族后缀：`/executions`、`/stop`、`/tools`、`/clips/...`。
  if (usableAsTail(token) && p.endsWith(token)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));

// 自检先行：解析器坏了就别谈覆盖率了（而且自检**不需要**端脑源码在位）。
if (opts.selfTest) {
  process.exit(selfTest() ? 0 : 1);
}

let routes;
try {
  routes = routesInSource(opts.source);
} catch (e) {
  console.error(`读端脑源码失败（${opts.source}）：${e?.message ?? e}`);
  console.error('用 --source 指一下 telencephalon 仓的路径。');
  process.exit(2);
}

if (routes.length === 0) {
  // 防假绿：一条路由都没解析到 ⇒ 不是「表和源码一致」，是「我没读到源码」。
  console.error(
    `在 ${opts.source} 里解析出 0 条路由 —— 这不是「表与源码一致」，是解析器坏了。\n` +
      '路由写法变了吗？（现在认的是 `.route("…`）先修解析器。',
  );
  process.exit(2);
}

const matrix = pathsInMatrix();
const matrixPaths = new Set(matrix.map((m) => m.path));
const tokens = mentionedPaths();
const sourcePaths = new Set(routes.map((r) => r.path));

const isCovered = (p) =>
  matrixPaths.has(p) ||
  // 表里自己的**通配行**（`/…/preview/*`）也该覆盖它下面的一切
  [...matrixPaths].some((mp) => mp.endsWith('/*') && coveredByToken(p, mp)) ||
  tokens.some((t) => coveredByToken(p, t));

// `--why`：这条路径是被哪条规则算成覆盖的？（校验器自己也得可被审）
if (opts.why) {
  const p = opts.why;
  console.log(`问：${p} 被判定表覆盖了吗？`);
  if (matrixPaths.has(p)) console.log('  ✔ 表格候选路径里有它本身。');
  for (const t of tokens) {
    if (coveredByToken(p, t)) console.log(`  ✔ token \`${t}\` 覆盖它`);
  }
  process.exit(0);
}

const missing = routes.filter((r) => !isCovered(r.path));
// 「表里有源码里找不到」：**只报主路径**（候选是我拼出来的，报了是噪音），
// **通配行不算**（`/…/preview/*` 本来就写得比源码粗 ⇒ 故意多覆盖，不是漂移）。
const extra = [...matrixPaths].filter(
  (p) =>
    !p.endsWith('/*') &&
    !sourcePaths.has(p) &&
    matrix.some((m) => m.path === p && m.primary),
);

console.log(`源码：${opts.source}`);
console.log(`  解析出 ${routes.length} 条路由（${sourcePaths.size} 条唯一路径）`);
console.log(`判定表：${MATRIX_PATH}`);
console.log(`  表格里解析出 ${matrixPaths.size} 条候选路径；全文提到 ${tokens.length} 个路径 token`);

if (missing.length === 0) {
  console.log('\n✔ 表覆盖了源码里的每一条路由。');
} else {
  console.log(`\n⚠️ 漏了 ${missing.length} 条（源码里有、表里没有）：`);
  for (const r of missing) {
    console.log(`  ${r.method.padEnd(6)} ${r.path}    ← ${r.file}`);
  }
}

if (extra.length > 0) {
  console.log(`\nℹ️ 表里有 ${extra.length} 条源码里找不到（可能是 host 端才有的路由，或表已过期）：`);
  for (const p of extra.slice(0, 20)) console.log(`  ${p}`);
  if (extra.length > 20) console.log(`  … 还有 ${extra.length - 20} 条`);
}

process.exit(missing.length === 0 ? 0 : 1);
