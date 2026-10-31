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
  const opts = { source: resolve(REPO, '..', 'telencephalon'), why: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--why') opts.why = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(
        '用法: node scripts/check-endpoint-matrix.mjs [--source <telencephalon 路径>] [--why <某个路径>]',
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
 * 一个单元格里可能藏着好几条路径 ⇒ 生成**候选集**。
 *
 * 形态有两种：
 * - 第二项是**后缀**（`/…/servers` + `/{id}`）；
 * - 第二项是**兄弟**（`/…/servers/{id}/tools` + `/mcp/agents/{name}/servers`）。
 *
 * 两种都算上 ⇒ 宁可多算覆盖，也不误报「漏了」。
 */
function candidatePaths(cell) {
  const items = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
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

function pathsInMatrix() {
  const lines = readFileSync(MATRIX_PATH, 'utf8').split(/\r?\n/);
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
    const primary = [...endpointCell.matchAll(/`([^`]+)`/g)].map((m) => m[1])[0];
    if (primary) entries.push({ cls, path: primary, primary: true });
  }
  return entries;
}

/**
 * 整份文档里出现过的**所有**反引号路径 —— 不只是表格里的。
 *
 * 因为文档还有散文段落（§「不在移动端那张面上的（host 端才有）」）明确点了
 * `/api/sessions/*` 这类**只在 host 端存在**的路由 ⇒ 它们**不该**被算成「漏了」。
 */
function mentionedPaths() {
  const text = readFileSync(MATRIX_PATH, 'utf8');
  const out = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const token = m[1];
    if (!token.startsWith('/')) continue;
    out.push(token);
  }
  return out;
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
  matrixPaths.has(p) || tokens.some((t) => coveredByToken(p, t));

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
const extra = [...matrixPaths].filter(
  (p) => !sourcePaths.has(p) && matrix.some((m) => m.path === p && m.primary),
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
