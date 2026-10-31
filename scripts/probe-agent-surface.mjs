#!/usr/bin/env node
/**
 * 端脑面（agent surface）**实测**探针 —— 「哪些端点不拿凭据就能进」
 *
 * ## 为什么要有这个探针
 *
 * `docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md`
 * 那张判定表是**静态分析**：对着源码把路由一条条列出来，再按「锁不锁」分级。
 * 静态分析有两条它自己解不了的毛病：
 *
 * 1. **它说「锁上了」不算数** —— 锁是不是真的生效，只有**打一发**才知道。
 *    这张表下一步要做的事（把锁从 `/shadow/v1/*` 提到整张面）**必须有一个
 *    验收仪器**，否则「锁上了」就只是「代码里写了 `.layer(...)`」。
 * 2. **端点集合会变** —— 端脑今天 127 条路由，明天加一条就多一条。
 *    所以这个探针**直接读那张表**（`docs/superpowers/architecture/…`）⇒
 *    表改了，探针自动跟着变；**不另抄一份端点清单**（另抄一份就会过期）。
 *
 * ## 探什么、为什么不探什么
 *
 * **只探 GET/HEAD。** ⚠️ 写路径（POST/DELETE/PUT/PATCH）在**门开着**的时候
 * 探测它就等于**真的做了一遍** —— 装一个 agent、改一次 LLM 上游、抹一次
 * 数据 ⇒ 探测行为本身成了破坏行为。⇒ 写路径一律标为
 * 「未探测（门开着就会真的改状态）」，**诚实地写进报告**，不假装覆盖了。
 *
 * **带 `{...}` 模板的路径也能探**，但要分两次：
 * - 第一次用一个**合法但不存在**的 id ⇒ 门锁着 ⇒ 401；门开着 ⇒ 404（到了处理
 *   函数，只是没这个实体）；
 * - 若第一次是 404，**再拿一个非法 id 打一次**（如 `not-a-uuid`）：若变成
 *   **400**（路径参数解析失败）⇒ 说明**这条路由确实存在** ⇒ 那么刚才那个
 *   404 就是「门开着、只是没这个实体」⇒ **开着**；若仍是 404 ⇒ 这条路由
 *   **不在这个构建里** ⇒ 不作结论。
 *
 * **SSE / WebSocket 不探**（`/api/trace/stream`、`…/ws`）—— 它们会挂住。
 *
 * ## 默认不带任何凭据
 *
 * 这一条是**安全问题本身**：「谁能**不拿钥匙**就进这张面」。所以默认的
 * 那一轮就是**空手**去敲。`--key` / `--admin` 是额外的对照轮
 * （「带上钥匙能不能进」），用来验证「锁上了，但 App 自己仍然进得来」。
 *
 * ## ⚠️ 两轮**必须**用同一套判据（「门」的视角，不是「路由在不在」的视角）
 *
 * 旧实现里两轮各判各的：额外轮把「非 401/403」一律标成 `REACHED`
 * ⇒ ⇒ 额外轮里的 **200 变成了 `REACHED`** ⇒ ⇒ 「额外轮 OPEN: 0」是
 * **假象**（真相是「全开着」）⇒ ⇒ 读报告的人会被带沟里。
 *
 * ⇒ 现在两轮共用 [`classifyDoor`]：**2xx ⇒ `OPEN`**（门开着）、
 * **401/403 ⇒ `LOCKED`**（门关着）、**其余 ⇒ `REACHED`**
 * （到了处理函数但请求不合法 ⇒ 门也是开着的）。
 * ⇒ ⇒ 于是「**带着钥匙仍然进得去**」在报告里一眼能看出来
 * ⇒ ⇒ 而那正是「门根本不认这把钥匙」的证据。
 *
 * ⚠️ `ABSENT`（这条路由不在这个构建里）是**第一轮专属**的结论 ——
 * 它说的是「构建里有没有这条路由」，与门无关 ⇒ 额外轮不做这个判断
 * （额外轮里 404 ⇒ `REACHED`：门开着，只是没这个实体）。
 *
 * ## 防假绿
 *
 * 表解析出 **0 行** ⇒ 直接**报错退出**（不是「通过」）。表被改坏、
 * 路径写错、章节改名，都会在这里现形 —— 绝不把「没读到东西」说成
 * 「没发现问题」。
 *
 * ## 用法
 *
 *   node scripts/probe-agent-surface.mjs
 *   node scripts/probe-agent-surface.mjs --base http://127.0.0.1:60080
 *   node scripts/probe-agent-surface.mjs --key <shadow key>        # 加一轮「带钥匙」
 *   node scripts/probe-agent-surface.mjs --admin <admin token>    # 加一轮「带 admin token」
 *   node scripts/probe-agent-surface.mjs --json                   # 机器可读
 *   node scripts/probe-agent-surface.mjs --strict                 # A/B 类有开着�� ⇒ 退出码 1
 *
 * 退出码：0 = 探针跑完了（**不等于**「没发现问题」—— 看报告）；
 *         1 = `--strict` 且 A/B 类里有不拿凭据就能进的端点；
 *         2 = 探针自己坏了（表读不出来 / 参数不对）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MATRIX_PATH = join(
  REPO,
  'docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md',
);

const TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(
    [
      '用法: node scripts/probe-agent-surface.mjs [选项]',
      '',
      '  --base <url>     端脑面的地址（默认 http://127.0.0.1:60080）',
      '  --key <key>      额外跑一轮「带 X-Shadow-Key」',
      '  --admin <token>  额外跑一轮「带 X-Admin-Token」',
      '  --json           输出 JSON',
      '  --strict         A/B 类里有端点不拿凭据就能进 ⇒ 退出码 1',
      '  -h, --help       这段话',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const opts = {
    base: 'http://127.0.0.1:60080',
    key: null,
    admin: null,
    json: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--base':
        opts.base = argv[++i];
        break;
      case '--key':
        opts.key = argv[++i];
        break;
      case '--admin':
        opts.admin = argv[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--strict':
        opts.strict = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`不认识的参数: ${a}`);
        printHelp();
        process.exit(2);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 读判定表
// ---------------------------------------------------------------------------

/** 把一行 markdown 表格切成单元格 —— `\|` 是转义的竖线，不是分隔符。 */
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
  return cells;
}

/** 从单元格里取出反引号包着的路径们。 */
function pathsIn(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

const CLASS_HEADINGS = [
  { marker: '### A 类', cls: 'A' },
  { marker: '### B 类', cls: 'B' },
  { marker: '### C 类', cls: 'C' },
  { marker: '### D 类', cls: 'D' },
];

function parseMatrix() {
  const raw = readFileSync(MATRIX_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const rows = [];
  let cls = null;

  for (const line of lines) {
    const heading = CLASS_HEADINGS.find((h) => line.startsWith(h.marker));
    if (heading) {
      cls = heading.cls;
      continue;
    }
    if (!cls) continue;
    if (!line.startsWith('|')) {
      // 分节之间有空行 ⇒ 表格结束 ⇒ 退出当前类
      if (line.trim() === '' && rows.length > 0 && cls) {
        // 继续往下找也没关系；只有遇到下一个标题才换类
      }
      continue;
    }
    const cells = splitRow(line);
    // markdown 表格行以 `|` 开头 ⇒ splitRow 会多出一个**前导空单元格**
    // （行尾还有一个）⇒ 去掉它们，否则第一格永远是空的。
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 3) continue;
    const [endpointCell, methodCell, moduleCell] = cells;
    if (endpointCell === '端点' || endpointCell === '---' || endpointCell === '') continue;
    if (endpointCell.startsWith('---')) continue;

    const allPaths = pathsIn(endpointCell);
    if (allPaths.length === 0) continue;

    const methods = pathsIn(methodCell).length
      ? pathsIn(methodCell)
      : methodCell
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    rows.push({
      cls,
      path: allPaths[0],
      extraPaths: allPaths.slice(1),
      methods: methods.length ? methods : ['GET'],
      module: moduleCell.replace(/[`*]/g, '').trim(),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 路径模板
// ---------------------------------------------------------------------------

const TEMPLATE_VALUES = {
  id: '00000000-0000-4000-8000-000000000000',
  name: 'probe-nonexistent',
  modality: 'audio',
  session_id: 'probe-session',
  camera: 'probe-camera',
  ts_ms: '0',
  capability: 'probe',
};

function hasTemplate(path) {
  return /\{[^}]+\}|\*/.test(path);
}

function fillTemplate(path) {
  return path.replace(/\{([^}]+)\}/g, (_, key) => TEMPLATE_VALUES[key] ?? 'probe').replace(/\*/g, 'probe');
}

function isSseOrWs(path) {
  return /\/(stream|ws)$/.test(path) || path.includes('/ws');
}

// ---------------------------------------------------------------------------
// 探测
// ---------------------------------------------------------------------------

async function statusOf(url, headers) {
  try {
    const res = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 把 body 读掉，避免连接悬挂
    try {
      await res.arrayBuffer();
    } catch {
      /* 读不干净也无所谓 —— 我们只要状态码 */
    }
    return { status: res.status, error: null };
  } catch (e) {
    return { status: 0, error: e?.message ?? String(e) };
  }
}

/**
 * 状态码 → **门**的结论。**两轮共用这一份。**
 *
 * ⚠️ 判的是「**门**开没开」，不是「这条路由在不在这个构建里」——
 * 后者是 `ABSENT`，只在第一轮判（见 `probePath` 里的 404 分支）。
 *
 * - `OPEN`    —— 门开着（2xx）
 * - `LOCKED`  —— 门关着（401 / 403）
 * - `REACHED` —— 到了处理函数但请求不合法（400 / 405 / 404 …）⇒ 门也是开着的
 */
function classifyDoor(status) {
  if (status === 200 || status === 201 || status === 204) return 'OPEN';
  if (status === 401 || status === 403) return 'LOCKED';
  return 'REACHED';
}

/**
 * 探一条路径。
 *
 * 返回 { status, verdict, note }：
 * - `OPEN`   —— 不拿凭据就能进（2xx）
 * - `LOCKED` —— 被挡住了（401 / 403）
 * - `OPEN?`  —— 门开着但实体不存在（404 + 路由确实存在）
 * - `ABSENT` —— 这条路由不在这个构建里（404 + 路由不存在）
 * - `REACHED`—— 到了处理函数但请求不合法（400 / 405 …）⇒ 门是开的
 * - `SKIP`   —— 没探（SSE / WebSocket / 方法不是 GET）
 */
async function probePath(base, row) {
  const path = row.path;

  if (!row.methods.some((m) => m === 'GET' || m === 'HEAD')) {
    return {
      ...row,
      status: null,
      verdict: 'SKIP',
      note: `方法是 ${row.methods.join('/')} —— 门开着就会真的改状态 ⇒ 不探`,
    };
  }
  if (isSseOrWs(path)) {
    return { ...row, status: null, verdict: 'SKIP', note: 'SSE / WebSocket —— 会挂住 ⇒ 不探' };
  }

  const url = `${base.replace(/\/$/, '')}${fillTemplate(path)}`;
  const first = await statusOf(url, {});

  if (first.status === 0) {
    return { ...row, status: 0, verdict: 'ERROR', note: `连不上：${first.error}`, url };
  }
  if (first.status === 404) {
    // ⚠️ 404 有两种可能：「路由不在这个构建里」 vs「门开着、只是没这个实体」
    // ⇒ 分不清就不下结论（`ABSENT` 只在这一轮判）。
    if (hasTemplate(path)) {
      // 拿一个非法 id 再打一次。
      const badUrl = `${base.replace(/\/$/, '')}${path.replace(/\{[^}]+\}/g, 'not-a-valid-id')}`;
      const second = await statusOf(badUrl, {});
      if (second.status === 400 || second.status === 422) {
        return {
          ...row,
          status: first.status,
          verdict: 'OPEN',
          note: '非法 id ⇒ 400 ⇒ 路由确实存在 ⇒ 那个 404 是「门开着、只是没这个实体」',
          url,
        };
      }
      return { ...row, status: first.status, verdict: 'ABSENT', note: '这条路由不在这个构建里', url };
    }
    return { ...row, status: first.status, verdict: 'ABSENT', note: '这条路由不在这个构建里', url };
  }
  const verdict = classifyDoor(first.status);
  if (verdict === 'OPEN') {
    return { ...row, status: first.status, verdict, note: '不拿凭据就能进', url };
  }
  if (verdict === 'LOCKED') {
    return { ...row, status: first.status, verdict, note: '被挡住了', url };
  }
  return {
    ...row,
    status: first.status,
    verdict: 'REACHED',
    note: '到了处理函数（请求不合法）⇒ 门是开的',
    url,
  };
}

/**
 * 额外的一轮：带上凭据（只对 GET 做 ⇒ 无副作用）。
 *
 * ⚠️ **与第一轮共用 `classifyDoor`** —— 旧实现这里把 200 标成 `REACHED`
 * ⇒ ⇒ 「额外轮 OPEN: 0」是假象 ⇒ ⇒ 读报告的人会被带沟里。
 * ⇒ 现在 200 就是 `OPEN` ⇒ ⇒ 「带着钥匙仍然进得去」一眼可见。
 *
 * ⚠️⚠️ **但第一轮说「这个构建里没这条路由」的，额外轮不许算「仍然进得去」**
 * —— 那种 404 是**框架的 fallback** 回的，不是处理器回的 ⇒ ⇒ 说它是
 * 「门开着」是**冤枉了门**，也是**冤枉了报表**（把「这条路由不存在」
 * 混进「门开着」里 ⇒ 数字虚高 ⇒ ⇒ 又是「失败长得像成功」）。
 */
async function probeWithCredentials(base, row, headers) {
  const url = `${base.replace(/\/$/, '')}${fillTemplate(row.path)}`;
  const r = await statusOf(url, headers);
  if (row.verdict === 'ABSENT') {
    return { ...row, status: r.status, verdict: 'ABSENT', url };
  }
  return { ...row, status: r.status, verdict: classifyDoor(r.status), url };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const VERDICT_LABEL = {
  OPEN: '🔓 开着',
  LOCKED: '🔒 锁着',
  'OPEN?': '🔓 开着?',
  ABSENT: '— 这构建里没有',
  REACHED: '🔓 开着（到了处理函数）',
  SKIP: '— 未探测',
  ERROR: '⚠️ 探测失败',
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let rows;
  try {
    rows = parseMatrix();
  } catch (e) {
    console.error(`读判定表失败：${e?.message ?? e}`);
    process.exit(2);
  }
  if (rows.length === 0) {
    // 防假绿：一行都没读到 ⇒ 不是「没问题」，是「探针坏了」。
    console.error(
      `判定表里读到 0 行（${MATRIX_PATH}）—— 这不是「没发现问题」，是探针坏了。\n` +
        '表结构变了？章节标题改了？先修探针，别把「没读到」说成「没问题」。',
    );
    process.exit(2);
  }

  const results = [];
  for (const row of rows) {
    results.push(await probePath(opts.base, row));
  }

  // 额外的对照轮：带钥匙 / 带 admin token
  const extraRounds = [];
  for (const [label, headers] of [
    ['带 X-Shadow-Key', opts.key ? { 'X-Shadow-Key': opts.key } : null],
    ['带 X-Admin-Token', opts.admin ? { 'X-Admin-Token': opts.admin } : null],
  ]) {
    if (!headers) continue;
    const round = [];
    for (const r of results) {
      if (r.verdict === 'SKIP' || !r.methods.some((m) => m === 'GET' || m === 'HEAD')) continue;
      round.push(await probeWithCredentials(opts.base, r, headers));
    }
    extraRounds.push({ label, results: round });
  }

  const openAb = results.filter(
    (r) => (r.cls === 'A' || r.cls === 'B') && (r.verdict === 'OPEN' || r.verdict === 'REACHED'),
  );
  const skipped = results.filter((r) => r.verdict === 'SKIP');
  const notProbedSiblings = results.reduce((n, r) => n + r.extraPaths.length, 0);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          base: opts.base,
          parsedRows: rows.length,
          results,
          extraRounds: extraRounds.map((round) => ({
            label: round.label,
            results: round.results,
            // ⚠️ **仍然进得去** = `OPEN` + `REACHED`。
            // ⚠️ 这里**不能**只数 `OPEN` —— 额外轮里 404/400/405 也说明
            // 「到了处理函数」⇒ 门是开着的（旧实现把它们混在一起，
            // 于是「额外轮 OPEN: 0」看起来像「全锁上了」，其实全开着）。
            stillOpen: round.results
              .filter((r) => r.verdict === 'OPEN' || r.verdict === 'REACHED')
              .map((r) => ({ cls: r.cls, path: r.path, status: r.status, verdict: r.verdict })),
          })),
          openAorB: openAb.map((r) => ({ cls: r.cls, path: r.path, status: r.status, verdict: r.verdict })),
          skippedCount: skipped.length,
          notProbedSiblingPaths: notProbedSiblings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`端脑面实测探针 —— ${opts.base}`);
    console.log(`判定表读到 ${rows.length} 行；不拿凭据就敲：\n`);
    const byClass = { A: [], B: [], C: [], D: [] };
    for (const r of results) byClass[r.cls]?.push(r);
    for (const cls of ['A', 'B', 'C', 'D']) {
      const list = byClass[cls];
      if (!list.length) continue;
      console.log(`── ${cls} 类 ──`);
      for (const r of list) {
        const status = r.status === null ? '  - ' : String(r.status).padStart(3);
        console.log(`  ${status}  ${r.path.padEnd(52)} ${VERDICT_LABEL[r.verdict]} ${r.note ?? ''}`);
      }
      console.log('');
    }
    console.log('小结：');
    console.log(`  不拿凭据就能进（A/B 类）：${openAb.length} 条`);
    for (const r of openAb) console.log(`    ${r.cls}  ${r.path}  (${r.status})`);
    for (const round of extraRounds) {
      const stillOpen = round.results.filter(
        (r) => r.verdict === 'OPEN' || r.verdict === 'REACHED',
      );
      console.log(
        `  对照轮「${round.label}」：仍然进得去 ${stillOpen.length} 条（OPEN + REACHED）`,
      );
      for (const r of stillOpen) {
        console.log(`      ${r.cls}  ${r.path}  (${r.status} ${r.verdict})`);
      }
    }
    console.log(`  未探测：${skipped.length} 条（写路径 / SSE / WS —— 见脚本头部「为什么不探」）`);
    if (notProbedSiblings > 0) {
      console.log(`  ⚠️ 另有 ${notProbedSiblings} 条同族路径（同一行的第 2…N 项）没探 —— 表里那几行写法有歧义，不猜。`);
    }
    console.log('');
    console.log('⚠️ 「锁着」只说明**这一次**这一发被挡住了 —— 它不证明所有路径都锁上了。');
  }

  if (opts.strict && openAb.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`探针自己炸了：${e?.stack ?? e}`);
  process.exit(2);
});
