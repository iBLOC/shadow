#!/usr/bin/env node
/**
 * **「把 A/B 类面锁上之后，谁会被 401 打断？」—— 这台尺子。**
 *
 * ## 它补的是什么洞
 *
 * 判定表（docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md）
 * 把端脑面的路由按 A/B/C/D 分了级；A/B 类 = **本机面**（同机任意进程能打 ⇒ 要锁），
 * C/D 类 = 跨机协议（本机秘密锁不了 ⇒ 要另一种机制）。
 *
 * ⇒ 「要锁」这张表说了；⇒ **「锁了会不会自锁」这张表说不清** ——
 * 判定表自己的第②条原则就写着：「锁了会不会自锁？App 自己要用的端点，
 * 锁上去必须让 App 仍然能带 key 打通 ⇒ 「客户端是否在每一个请求上都带 key」
 * 是这一档能不能做的**前提**」⇒ ⇒ 而这个前提**没有任何机器在查** ⇒ ⇒
 * 于是「步 3」一直卡在「待用户拍板」—— 因为没人算得出**拍板的代价**。
 *
 * ⇒ ⇒ 这个脚本就是那把尺子：**读判定表 ⇒ 扫两端的客户端代码 ⇒ 逐个调用点
 * 看它带不带凭据 ⇒ 报出「锁上之后会 401 的调用点」**。
 *
 * ## 判据（门 = shadow key 或 admin token，即 providers 读门那一档）
 *
 * - **绿**：调用点带了 admin 或 shadow ⇒ 上锁后照样通。
 * - **条件绿（⚠️）**：只带了 shadow，而 shadow 在桌面端是**可选**的
 *   （用户没配就不带）⇒ ⇒ 没配 shadow 的用户会 401。
 * - **红**：**什么都不带** ⇒ 上锁后必 401。
 *
 * ## ⚠️ 它怎么认出「这一发带没带凭据」
 *
 * - **共享封装**（桌面端 this.request(...) / 移动端 _get/_post/_admin*）：
 *   ⇒ **读那一层封装的实现**（request() 里有没有塞 X-Admin-Token；
 *   _headers() 里有没有塞 X-Shadow-Key）⇒ ⇒ **封装改了，这个闸会跟着变**。
 * - **裸 fetch( / 裸 http.get(**：⇒ 就地看这一发自己的 headers。
 * - **注释里的路径不算** ⇒ ⇒ 用 scripts/lib/strip-comments.mjs（等长填充，
 *   行号不变）先剥注释。
 *
 * ## 退出码
 *
 * - 0：A/B 类里**没有**会被 401 打断的调用点 ⇒ 上锁不打断客户端；
 * - 1：**有**会被 401 打断的调用点 ⇒ ⇒ 报出是哪些（file:line）；
 * - 2：**判据源/扫描源不可用**（判定表读不到行、客户端目录读不到）
 *   ⇒ ⇒ 「没红」不等于「没问题」（承㋉ 条那第四条病）。
 *
 * ## 怎么跑
 *
 *   node scripts/check-agent-surface-credentials.mjs
 *   node scripts/check-agent-surface-credentials.mjs --self-test
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';
import { credentialIn } from './lib/credentials.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MATRIX_PATH = join(
  REPO,
  'docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md',
);
const DESKTOP_SRC = join(REPO, 'shadow-desktop', 'src');
const MOBILE_LIB = join(REPO, 'shadow-mobile', 'lib');

/**
 * **已经有门的三个面** ⇒ 不在「步 3」这次提问的范围里。
 *
 * ⚠️ 前提是**实测确认过的**（探针 probe-agent-surface.mjs 在真机上量的）：
 *   · `/models/**` ⇒ providers 三道门（ba4e87b）⇒ 真机实测：无凭据 ⇒ 401；
 *   · `/api/telencephalon/admin/**` ⇒ admin 面 fail-closed（93121d1）⇒ 实测 401；
 *   · `/shadow/v1/**` ⇒ shadow 门（4e8bfcc）⇒ 实测 401。
 * ⇒ ⇒ 「步 3」要问的是**剩下没门的那部分** ⇒ ⇒ 这三个面划出去。
 */
const LOCKED_FAMILIES = [
  { prefix: '/models/', why: 'providers 面 —— 三道门已落地（ba4e87b）' },
  { prefix: '/api/telencephalon/admin/', why: 'admin 面 —— fail-closed 已落地（93121d1）' },
  { prefix: '/shadow/v1/', why: 'shadow 门已落地（4e8bfcc）' },
];

function lockedReason(route) {
  for (const f of LOCKED_FAMILIES) {
    if (route.startsWith(f.prefix)) return f.why;
  }
  return null;
}

const CLASS_HEADINGS = [
  { marker: '### A 类', cls: 'A' },
  { marker: '### B 类', cls: 'B' },
  { marker: '### C 类', cls: 'C' },
  { marker: '### D 类', cls: 'D' },
];

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

// ---------------------------------------------------------------------------
// 判定表
// ---------------------------------------------------------------------------

function pathsIn(cell) {
  return [...cell.matchAll(/\x60([^\x60]+)\x60/g)].map((m) => m[1]);
}

function splitRow(line) {
  const cells = [];
  let cur = '';
  let inCode = false;
  for (const ch of line) {
    if (ch === '\x60') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** 去掉 markdown 表格行的**前导/尾随**空单元格（行首行尾的 `|` 各切出一个空格子）。 */
function normalizeRow(cells) {
  const out = cells.slice();
  if (out.length && out[0] === '') out.shift();
  if (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

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
    if (!line.startsWith('|')) continue;
    const cells = normalizeRow(splitRow(line));
    if (cells.length < 3) continue;
    const [endpointCell, methodCell] = cells;
    if (endpointCell === '端点' || endpointCell === '---' || endpointCell === '') continue;
    if (endpointCell.startsWith('---')) continue;
    const allPaths = pathsIn(endpointCell);
    if (allPaths.length === 0) continue;
    const methods = pathsIn(methodCell).length
      ? pathsIn(methodCell)
      : methodCell.split(',').map((s) => s.trim()).filter(Boolean);
    rows.push({
      cls,
      path: allPaths[0],
      extraPaths: allPaths.slice(1),
      methods: methods.length ? methods : ['GET'],
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 路径 → 正则（客户端那一侧可能写成 /x/${encodeURIComponent(id)}/y）
// ---------------------------------------------------------------------------

function pathToRegex(path) {
  let re = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '{') {
      const end = path.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
        continue;
      }
      re += "[^/'\x60]*";
      i = end;
    } else if (ch === '*') {
      re += "[^'\x60]*";
    } else if ('\\^$.|?+()[]'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  // ⚠️ **必须锚边界**：否则 `/api/telencephalon/agents` 会匹配到
  // `/api/telencephalon/agentsX` ⇒ ⇒ 凭据判定会**假命中**（实测自检抓到的）。
  // 边界 = 后面不能紧跟「路径字符」（字母数字、`-`、`_`、`/`）⇒ ⇒
  // `/api/flows` 不会命中 `/api/flows/draft`（那是另一条路由，判定表里另有一行）。
  return new RegExp(re + '(?![\\w\\-/])');
}

// ---------------------------------------------------------------------------
// 扫描客户端代码
// ---------------------------------------------------------------------------

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === '.git') continue;
      walk(p, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      if (/\.test\.[a-z]+$/.test(name) || name.endsWith('_test.dart')) continue;
      out.push(p);
    }
  }
  return out;
}

/** 这一发带没带凭据。 */
function credentialsIn(text) {
  const admin =
    /X-Admin-Token/.test(text) ||
    /adminHeaders\s*\(/.test(text) ||
    /adminToken/.test(text) ||
    /getAdminToken\s*\(/.test(text);
  const shadow =
    /X-Shadow-Key/.test(text) ||
    /shadowKey/.test(text) ||
    /this\.apiKey/.test(text) ||
    /_apiKey/.test(text) ||
    /apiKey\s*[:=]/.test(text);
  return { admin, shadow };
}

const CALL_OPENERS = [
  'fetch', 'request', '_get', '_post', '_put', '_delete',
  '_adminGet', '_adminPost', '_adminDelete', 'get', 'post', 'put', 'delete',
];

/**
 * 一次扫描把文件里所有的**调用括号**列出来（每个带：调用名 / 起止 / 那一发的文本）。
 *
 * ⚠️ 为什么不再「每次命中都从文件头重扫一遍」（第一版那么写 ⇒ 92 条路由 × 200 个文件
 * ⇒ 每次命中都重扫全文 ⇒ **跑了几分钟还没完**，实测超时）：
 * ⇒ 现在**每个文件只扫一次**，命中时在**调用跨度表**里查 ⇒ ⇒ O(命中数 × 调用数)。
 */
function buildCallSpans(text) {
  const spans = [];
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') stack.push(i);
    else if (ch === ')') {
      const open = stack.pop();
      if (open === undefined) continue;
      const before = text.slice(Math.max(0, open - 40), open);
      const m = before.match(/([A-Za-z_$][\w$]*)\s*$/);
      spans.push({
        name: m ? m[1] : '',
        open,
        end: i,
        text: text.slice(open, i + 1),
      });
    }
  }
  return spans;
}

/** 命中处最内层的**已知调用**（找不到 ⇒ 不是调用点，跳过）。 */
function findCallContext(spans, hitIndex) {
  let best = null;
  let anyEnclosing = false;
  for (const s of spans) {
    if (s.open < hitIndex && hitIndex <= s.end) {
      anyEnclosing = true;
      if (!CALL_OPENERS.includes(s.name)) continue;
      if (!best || s.end - s.open < best.end - best.open) best = s;
    }
  }
  if (best) return best;
  if (anyEnclosing) return { name: '', text: '', unknown: true };
  return null;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

// ---------------------------------------------------------------------------
// 共享封装的能力（**读实现，不写死**）
// ---------------------------------------------------------------------------

function desktopWrapperCaps() {
  const p = join(DESKTOP_SRC, 'lib', 'telencephalonClient.ts');
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const i = raw.indexOf('async request<');
  if (i === -1) return null;
  const body = raw.slice(i, i + 2500);
  return {
    admin: /X-Admin-Token/.test(body) || /getAdminToken/.test(body),
    shadow: /X-Shadow-Key/.test(body),
  };
}

function mobileWrapperCaps() {
  const p = join(MOBILE_LIB, 'services', 'telencephalon', 'telencephalon_client.dart');
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const i = raw.indexOf('Map<String, String> _headers(');
  if (i === -1) return null;
  const body = raw.slice(i, i + 1200);
  return {
    shadow: /X-Shadow-Key/.test(body),
    admin: raw.indexOf('_adminGet(') !== -1,
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function scanClientFiles() {
  const files = [];
  for (const f of walk(DESKTOP_SRC, ['.ts', '.tsx'])) files.push({ path: f, kind: 'desktop' });
  for (const f of walk(MOBILE_LIB, ['.dart'])) files.push({ path: f, kind: 'mobile' });
  // ⚠️ **每个文件只读一次、只剥一次注释** —— 第一版在「每条路由 × 每个文件」
  // 的循环里重读重剥 ⇒ 92 × 200 次 ⇒ 跑了几分钟还没完（实测超时）。
  for (const f of files) {
    const raw = readFileSync(f.path, 'utf8');
    f.text = stripComments(raw, { nested: false });
  }
  return files;
}

function analyze() {
  const rows = parseMatrix().filter((r) => r.cls === 'A' || r.cls === 'B');
  if (rows.length === 0) {
    throw new Error('判定表里读到 0 条 A/B 类路由（' + MATRIX_PATH + '）—— 不是「没问题」，是判据源坏了。');
  }
  const files = scanClientFiles();
  if (files.length === 0) throw new Error('客户端目录扫不到文件 —— 判据源不可用。');

  const dw = desktopWrapperCaps();
  const mw = mobileWrapperCaps();

  // ⚠️ **一条合并正则扫遍所有路由**（第一版是「每条路由 × 每个文件」各扫一遍
  // ⇒ 92 × 200 次全文扫描 ⇒ 实测跑了几分钟还没完）⇒ ⇒ 现在每个文件只扫一次。
  const routes = [];
  for (const row of rows) {
    for (const p of [row.path, ...(row.extraPaths || [])]) {
      routes.push({ path: p, cls: row.cls, re: pathToRegex(p) });
    }
  }
  const combined = new RegExp(routes.map((r) => '(' + r.re.source + ')').join('|'), 'g');

  const findings = [];
  for (const f of files) {
    const text = f.text;
    const spans = buildCallSpans(text);
    combined.lastIndex = 0;
    let m;
    while ((m = combined.exec(text)) !== null) {
      let idx = -1;
      for (let g = 1; g < m.length; g++) {
        if (m[g] !== undefined) { idx = g - 1; break; }
      }
      if (idx < 0) continue;
      const route = routes[idx];
      const ctx = findCallContext(spans, m.index);
      if (!ctx) continue;
      if (ctx.unknown) continue;
      // ⚠️ 用**共享判据**（scripts/lib/credentials.mjs）⇒ 与 providers 闸同一份
      //    ⇒ ⇒ 会追变量（`headers = ...`）、认展开写法、认「赋值之后才塞凭据」
      //    ⇒ ⇒ 不会把「明明带了凭据」误报成红（「红」比漏报更坑：会让人去改已经改对的代码）。
      const a1 = credentialIn(f.text, ctx.text, 'admin');
      const s1 = credentialIn(f.text, ctx.text, 'shadow');
      let admin = a1.ok;
      let shadow = s1.ok;
      let via = ctx.name;
      if (ctx.name === 'request' && dw) {
        admin = admin || dw.admin;
        shadow = shadow || dw.shadow;
        via = 'request()';
      } else if (ctx.name.startsWith('_admin') && mw) {
        admin = admin || mw.admin;
        shadow = shadow || mw.shadow;
        via = ctx.name + '()';
      } else if (ctx.name.startsWith('_') && mw) {
        shadow = shadow || mw.shadow;
        via = ctx.name + '()';
      }
      findings.push({
        route: route.path,
        cls: route.cls,
        locked: lockedReason(route.path),
        file: relative(REPO, f.path).replace(/\\/g, '/'),
        line: lineOf(text, m.index),
        via,
        admin,
        shadow,
        hasCred: admin || shadow,
        onlyShadow: !admin && shadow,
      });
    }
  }
  return { rows, findings, dw, mw, files: files.length };
}

function verdictOf(f) {
  // ⚠️ **已经有门的面不算红**（不在「步 3」的提问范围里）⇒ ⇒ 否则会拿
  //    「providers 面本来就有门」去吓人 ⇒ ⇒ 而「红」会让人去改已经改对的代码。
  if (f.locked) return 'LOCKED';
  if (!f.hasCred) return 'RED';
  if (f.onlyShadow) return 'WARN';
  return 'GREEN';
}

function run() {
  let a;
  try {
    a = analyze();
  } catch (e) {
    console.error('⚠️ ' + (e && e.message ? e.message : e));
    console.error('⇒ 判据源不可用 ⇒ 「没红」不是「没问题」⇒ 退出码 2。');
    process.exit(2);
  }

  const red = a.findings.filter((f) => verdictOf(f) === 'RED');
  const warn = a.findings.filter((f) => verdictOf(f) === 'WARN');
  const byRoute = new Map();
  for (const f of a.findings) {
    if (!byRoute.has(f.route)) byRoute.set(f.route, []);
    byRoute.get(f.route).push(f);
  }

  console.log('A/B 类面 —— 「锁上之后谁会被 401 打断」');
  console.log('  判定表：' + relative(REPO, MATRIX_PATH).replace(/\\/g, '/'));
  console.log('  A/B 类路由 ' + a.rows.length + ' 条；客户端源文件 ' + a.files + ' 个（测试文件不算调用点）');
  console.log('  共享封装能力（读实现）：桌面 request() ⇒ admin=' + (a.dw ? a.dw.admin : '?') + ' / shadow=' + (a.dw ? a.dw.shadow : '?') + '；移动端 _headers() ⇒ shadow=' + (a.mw ? a.mw.shadow : '?'));
  console.log('');

  if (a.findings.length === 0) {
    console.log('（A/B 类里客户端一处都没调 ⇒ 上锁不打断任何调用点）');
  }
  for (const [route, list] of byRoute) {
    const v = list.some((f) => verdictOf(f) === 'RED') ? 'RED' : list.some((f) => verdictOf(f) === 'WARN') ? 'WARN' : 'GREEN';
    console.log('  [' + v + '] ' + route);
    for (const f of list) {
      const tag = verdictOf(f) === 'RED' ? '❌ 不带凭据' : verdictOf(f) === 'WARN' ? '⚠️ 只带 shadow' : '✅ 带凭据';
      console.log('      ' + tag + '  ' + f.file + ':' + f.line + '  （' + f.via + '）');
    }
  }

  console.log('');
  console.log('调用点 ' + a.findings.length + ' 个 ⇒ 红 ' + red.length + ' / 条件绿 ' + warn.length + ' / 绿 ' + (a.findings.length - red.length - warn.length));
  if (red.length) {
    console.log('');
    console.log('⚠️⚠️ **锁上之后这几处会 401**：');
    for (const f of red) console.log('   · ' + f.file + ':' + f.line + '  ' + f.route + '  （' + f.via + '）');
  }
  if (warn.length) {
    console.log('');
    console.log('⚠️ **只带 shadow（桌面端没配 shadow key 的用户会 401）**：');
    for (const f of warn) console.log('   · ' + f.file + ':' + f.line + '  ' + f.route + '  （' + f.via + '）');
  }
  if (red.length) {
    console.log('');
    console.log('⇒ ⇒ **先把这几处补上凭据，再谈上锁**（不然就是把客户端自己锁在外面）。');
    process.exit(1);
  }
  console.log('');
  console.log('⇒ A/B 类面**没有**会被 401 打断的调用点 ⇒ 门 = shadow ∪ admin 这档可以上。');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 自检
// ---------------------------------------------------------------------------

function selfTest() {
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (detail ? '  —— ' + detail : ''));
  };
  console.log('判据自检：');

  check('路径 → 正则：{id} 能匹配客户端的插值写法', pathToRegex('/api/x/{id}/y').test('/api/x/${encodeURIComponent(n)}/y'));
  check('路径 → 正则：普通段不会误匹配', !pathToRegex('/api/telencephalon/agents').test('/api/telencephalon/agentsX'));
  check('路径 → 正则：* 段能匹配', pathToRegex('/api/p/*').test('/api/p/anything'));

  check('凭据识别：X-Admin-Token ⇒ admin', credentialsIn("{ 'X-Admin-Token': t }").admin);
  check('凭据识别：X-Shadow-Key ⇒ shadow', credentialsIn("{ 'X-Shadow-Key': k }").shadow);
  check('凭据识别：空 headers ⇒ 什么都不带', !credentialsIn('headers: {}').admin && !credentialsIn('headers: {}').shadow);

  const sample = "const r = await fetch(url, { headers: { 'X-Admin-Token': t } });";
  const ctx = findCallContext(buildCallSpans(sample), sample.indexOf('url'));
  check('调用上下文：认出 fetch', !!(ctx && ctx.name === 'fetch'), ctx ? ctx.name : 'null');
  check('调用上下文：取到的文本含 admin 头', !!(ctx && credentialsIn(ctx.text).admin));

  const sample2 = 'const r = await fetch(url);';
  const ctx2 = findCallContext(buildCallSpans(sample2), sample2.indexOf('url'));
  check('调用上下文：裸 fetch 不带凭据', !!(ctx2 && !credentialsIn(ctx2.text).admin && !credentialsIn(ctx2.text).shadow));

  const sample3 = "const s = '/api/telencephalon/status';";
  const ctx3 = findCallContext(buildCallSpans(sample3), sample3.indexOf('/api'));
  check('调用上下文：不是调用 ⇒ 认成「未知」并跳过', !ctx3 || ctx3.unknown === true);

  check('表格切分：前导/尾随空格子被去掉', normalizeRow(splitRow('| /a/{b} | GET | mod |'))[1] === 'GET');

  const rows = parseMatrix();
  check('判定表读得到行', rows.length > 0, rows.length + ' 行');
  check('判定表里 A/B 类都有', rows.some((r) => r.cls === 'A') && rows.some((r) => r.cls === 'B'));

  const dw = desktopWrapperCaps();
  check('桌面 request() 的能力读得到（不写死）', !!dw, dw ? 'admin=' + dw.admin : 'null');
  const mw = mobileWrapperCaps();
  check('移动端 _headers() 的能力读得到（不写死）', !!mw, mw ? 'shadow=' + mw.shadow : 'null');

  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
} else {
  run();
}
