#!/usr/bin/env node
/**
 * 「providers 面上了门之后，客户端会不会 401」—— 判定闸。
 *
 * ## 为什么需要它（2026-10-31）
 *
 * 端脑把 `/models/providers*` 放到了 admin 门后面（`telencephalon` 的
 * `providers::router_with_admin` ⇒ `route_layer(require_admin_token)`
 * ⇒ **没配 token ⇒ fail-closed 401**）。
 *
 * ⇒ 于是「客户端**每一处**打这张面的请求有没有带凭据」就成了一个
 * **必须逐处回答**的问题 —— 而且**答错的后果不是报错，是静默退化**：
 *
 * * `AppInitializer` / `ModelOnboardingPage` 的那两发是「**有没有配好模型**」
 *   的**探测** ⇒ 401 ⇒ `hasCloud` 恒为 false ⇒ ⇒ **用户明明配好了，
 *   却被判定成「没配好」⇒ 踢回设置向导** ⇒ 那是「失败长得像成功」；
 * * `AddProviderModal` 的那三发是「**新增供应商**」的写操作 ⇒ 401 ⇒
 *   ⇒ **按钮直接失败**（而且是 Tauri 模式下也失败 —— 那一格不是 web-only）。
 *
 * ⚠️ 靠人读代码数点子是不可靠的（漏一处 ⇒ 门一上就坏）⇒ ⇒ 这里做成**闸**：
 * **机器可判** ⇒ 「门一上之前」跑一次，就知道清单。
 *
 * ## 判据来自哪里（不是手抄）
 *
 * ⚠️ 路由清单**从服务端源码里解析**（`../telencephalon/src/api/providers.rs`
 * 的 `provider_routes()`）⇒ ⇒ **服务端改了路由，闸自动跟着改**；
 * ⇒ 解析不到 ⇒ **退出码 2**（判据过期/源不在）⇒ **绝不「静默全绿」**。
 *
 * ## 退出码
 *
 * * `0` —— 全绿（每一处打这张面的请求都带了凭据）；
 * * `1` —— **有红**（有调用点没带凭据 ⇒ 门一上就会 401）；
 * * `2` —— **探测器坏了**（判据源找不到 / 解析不出路由 / 自检不过）⇒
 *   ⇒ 「不知道」**不等于**「没问题」。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-provider-admin-headers.mjs            # 判定
 * node scripts/check-provider-admin-headers.mjs --self-test # 探测器自检
 * ```
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, makeLineIndex } from './lib/strip-comments.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');
// 端脑仓的位置：默认是**兄弟仓**（`../telencephalon`）⇒ 可用
// `--telencephalon <path>` 或环境变量 `SHADOW_TELENCEPHALON_DIR` 指到别处
// （反向验证时就是要对着一个**历史 worktree** 跑）。
let TELENCEPHALON_DIR =
  process.env.SHADOW_TELENCEPHALON_DIR ||
  resolve(REPO, '..', 'telencephalon');
let TELENCEPHALON_SRC = resolve(TELENCEPHALON_DIR, 'src', 'api', 'providers.rs');
const DESKTOP_SRC = join(REPO, 'shadow-desktop', 'src');
const MOBILE_LIB = join(REPO, 'shadow-mobile', 'lib');

// 端脑的 admin token 头 —— 客户端**必须**带它才能过 providers 那道门。
const ADMIN_HEADER = 'X-Admin-Token';
// 客户端取那把钥匙的统一入口（`src/lib/adminToken.ts`）。
const ADMIN_GETTER = 'adminHeaders';

function printHelp() {
  console.log(`
providers 面的「客户端会不会 401」判定闸

  node scripts/check-provider-admin-headers.mjs              判定
  node scripts/check-provider-admin-headers.mjs --self-test  探测器自检

退出码：0 = 全绿 / 1 = 有红 / 2 = 探测器坏了（判据源缺失或自检不过）
`.trim());
}

/* ------------------------------------------------------------------ *
 * 1. 判据源：服务端的路由表
 * ------------------------------------------------------------------ */

/**
 * 从 `providers.rs` 解析出「被 admin 门罩住」的路由。
 *
 * ⚠️ 解析的是**整个文件**的 `.route("…")` —— 因为 `router_with_admin`
 * 罩的是**整张表**（`provider_routes()` 的每一条都在门后面）。
 * ⇒ 路由清单变了 ⇒ 闸自动跟着变 ⇒ 不会「判据过期还在报绿」。
 *
 * @returns {{routes: string[], prefixes: string[]}}
 */
function parseGatedRoutes() {
  if (!existsSync(TELENCEPHALON_SRC)) {
    throw new Error(`判据源不存在：${TELENCEPHALON_SRC}`);
  }
  const raw = readFileSync(TELENCEPHALON_SRC, 'utf8');
  const code = stripComments(raw, { nested: true, rust: true });
  const routes = [];
  const re = /\.route\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(code)) !== null) routes.push(m[1]);
  if (routes.length === 0) {
    throw new Error(`判据源里解析不出任何 .route(...)：${TELENCEPHALON_SRC}`);
  }
  // `/models/providers/{id}` ⇒ 前缀 `/models/providers`；
  // `/models/{provider_id}/{model_id}` ⇒ 前缀 `/models`。
  const prefixes = new Set();
  for (const r of routes) {
    const cut = r.indexOf('{');
    const head = cut === -1 ? r : r.slice(0, cut);
    prefixes.add(head.endsWith('/') ? head.slice(0, -1) : head);
  }
  return { routes, prefixes: [...prefixes] };
}

/* ------------------------------------------------------------------ *
 * 2. 客户端扫描
 * ------------------------------------------------------------------ */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'build') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 从 `fetch(` 起，取出**整个调用**的文本（括号配平，跳过字符串/模板）。 */
function extractCall(code, start) {
  let i = start + 'fetch'.length;
  let depth = 0;
  let inStr = null;
  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
    i++;
  }
  return code.slice(start);
}

/** 调用文本里的第一个参数（URL）文本。 */
function firstArg(callText) {
  const open = callText.indexOf('(');
  let i = open + 1;
  let depth = 0;
  let inStr = null;
  while (i < callText.length) {
    const ch = callText[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) return callText.slice(open + 1, i);
    i++;
  }
  return callText.slice(open + 1);
}

/**
 * URL 参数里，**紧跟在插值 `}` 之后**（或开头）的路径字面量。
 * @returns {string|null}
 */
function pathLiteral(urlText) {
  const m = /\$\{[^}]*\}\s*([^`'"$]*)/.exec(urlText);
  if (m) return m[1].split('?')[0].split('#')[0];
  const s = urlText.replace(/^["'`]/, '').split('?')[0].split('#')[0];
  return s.startsWith('/') ? s : null;
}

/** `${BASE}` 里的那个 base 变量名。 */
function baseVar(urlText) {
  const m = /\$\{\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*\}/.exec(urlText);
  return m ? m[1] : null;
}

/** 在文件里找 `const|let|var <name> = <rhs>` 的 rhs 文本。 */
function findAssignment(code, name) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name.replace(/[$]/g, '\\$')}\\s*=\\s*`, 'g');
  const m = re.exec(code);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  let inStr = null;
  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ';' && depth === 0) break;
    else if (ch === '\n' && depth === 0) break;
    i++;
  }
  return code.slice(m.index + m[0].length, i);
}

/** 这份代码打的是**哪张面**？ */
function classifySurface(code, urlText) {
  const base = baseVar(urlText);
  if (!base) {
    // 不是插值 ⇒ 要么是绝对 URL，要么是常量字面量 ⇒ 判不了。
    return { surface: 'UNKNOWN', reason: 'URL 里没有 base 插值' };
  }
  const rhs = findAssignment(code, base);
  if (rhs === null) {
    return { surface: 'UNKNOWN', reason: `找不到 ${base} 的赋值` };
  }
  if (/neuronUrl\s*\(/.test(rhs)) return { surface: 'NEURON', reason: `${base} = neuronUrl()` };
  if (/prefrontalUrl\s*\(/.test(rhs)) return { surface: 'TELE', reason: `${base} = prefrontalUrl()` };
  if (/connection\.baseUrl|useTelencephalonStore|telencephalonStore/.test(rhs)) {
    return { surface: 'TELE', reason: `${base} = 端脑面（store.connection.baseUrl）` };
  }
  return { surface: 'UNKNOWN', reason: `${base} 的来源认不出来` };
}

/**
 * 这个 fetch 有没有带 admin 凭据？
 *
 * ⚠️ `headers` 有**两种**写法，都要认：
 *   ① `headers: await adminHeaders()` —— 带值；
 *   ② `{ headers }` —— **简写属性**（值是同名变量）⇒ ②在第一版里被漏掉
 *      ⇒ 把两处本来合规的调用**误报成红** ⇒ ⇒ 被 `--self-test` 当场抓住。
 */
function hasAdminCredential(code, callText) {
  const CRED = new RegExp(`\\b(${ADMIN_GETTER}|${ADMIN_HEADER})\\b`);

  // ① `headers: <表达式>` —— 值里直接出现 adminHeaders()/X-Admin-Token
  const valued = /\bheaders\s*:\s*([^,}]*)/.exec(callText);
  if (valued) {
    const value = valued[1];
    if (CRED.test(value)) return { ok: true, how: '直接带 adminHeaders()/X-Admin-Token' };
    // 值是一个裸标识符 ⇒ 追它的赋值。
    const ident = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(value);
    if (ident) {
      const rhs = findAssignment(code, ident[1]);
      if (rhs && CRED.test(rhs)) {
        return { ok: true, how: `headers = ${ident[1]}（它来自 adminHeaders()）` };
      }
      return { ok: false, how: `headers = ${ident[1]}，但它不带 admin 凭据` };
    }
    return { ok: false, how: '有 headers，但不是 admin 凭据' };
  }

  // ② `{ headers }` —— 简写属性 ⇒ 值是同名变量。
  const shorthand = /[{,]\s*headers\s*[,}]/.test(callText);
  if (shorthand) {
    const rhs = findAssignment(code, 'headers');
    if (rhs && CRED.test(rhs)) {
      return { ok: true, how: 'headers（简写）—— 它来自 adminHeaders()' };
    }
    return { ok: false, how: 'headers（简写）—— 但它不带 admin 凭据' };
  }

  return { ok: false, how: '这个请求**根本没带 headers**' };
}

/* ------------------------------------------------------------------ *
 * 3. 扫一个仓
 * ------------------------------------------------------------------ */

/**
 * @param {string} root 扫描根
 * @param {string[]} prefixes 被门罩住的前缀
 * @returns {{red: object[], unknown: object[], green: object[], scanned: number}}
 */
function scanClient(root, prefixes) {
  const red = [];
  const unknown = [];
  const green = [];
  let scanned = 0;

  const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f) && !/__tests__|\.test\.tsx?$/.test(f));
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    const code = stripComments(raw, { nested: false });
    const lineOf = makeLineIndex(code);
    scanned++;

    // 统一注入路径：`telencephalonClient.request()` 自己带那个头 ⇒ 豁免。
    const isUnifiedClient = /telencephalonClient\.ts$/.test(f.replace(/\\/g, '/'));

    let idx = -1;
    while ((idx = code.indexOf('fetch(', idx + 1)) !== -1) {
      const callText = extractCall(code, idx);
      const urlText = firstArg(callText);
      const p = pathLiteral(urlText);
      if (!p) continue;
      const hit = prefixes.find((pfx) => p === pfx || p.startsWith(`${pfx}/`));
      if (!hit) continue;

      const rel = relative(REPO, f).replace(/\\/g, '/');
      const line = lineOf(idx);

      if (isUnifiedClient) {
        green.push({ rel, line, route: hit, how: '走 telencephalonClient.request()（统一注入）' });
        continue;
      }

      const { surface, reason } = classifySurface(code, urlText);
      if (surface === 'NEURON') {
        // neuron 面**没有**这张路由 ⇒ 不在这道门的范围内。
        green.push({ rel, line, route: hit, how: `打在 neuron 面（${reason}）⇒ 不受这道门管` });
        continue;
      }
      if (surface === 'UNKNOWN') {
        unknown.push({ rel, line, route: hit, why: reason });
        continue;
      }
      const cred = hasAdminCredential(code, callText);
      if (cred.ok) {
        green.push({ rel, line, route: hit, how: cred.how });
      } else {
        red.push({ rel, line, route: hit, why: cred.how });
      }
    }
  }
  return { red, unknown, green, scanned };
}

/**
 * 移动端：这张面**是不是**被调用了？（dart 只做「有没有」判断）
 *
 * ⚠️ 这里用**完整路由**（不含 `{…}` 的那些），**不用**前缀 ——
 * 前缀 `/models` 会把移动端一大堆 `/v1/models`、本地路由 `/models` 一锅端
 * （第一版扫出 26 条**全是误报**）⇒ ⇒ 只有 `/models/providers` 与
 * `/api/telencephalon/chat/completions` 这种**完整路径**才值得报。
 */
function scanMobile(root, concreteRoutes) {
  const hits = [];
  if (!existsSync(root)) return hits;
  for (const f of walk(root).filter((f) => f.endsWith('.dart'))) {
    const raw = readFileSync(f, 'utf8');
    const code = stripComments(raw, { nested: false });
    const lineOf = makeLineIndex(code);
    for (const route of concreteRoutes) {
      let i = -1;
      while ((i = code.indexOf(route, i + 1)) !== -1) {
        const before = i > 0 ? code[i - 1] : '';
        if (/[A-Za-z0-9_]/.test(before)) continue; // 路径段边界
        hits.push({ rel: relative(REPO, f).replace(/\\/g, '/'), line: lineOf(i), route });
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ *
 * 4. 自检 —— 探测器自己也得有守卫
 * ------------------------------------------------------------------ */

const SELF_TEST_CASES = [
  {
    name: '端脑面 + 直接带 adminHeaders() ⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { headers: await adminHeaders() });",
    want: 'green',
  },
  {
    name: '端脑面 + headers 变量来自 adminHeaders() ⇒ 绿',
    code: "const API_BASE = prefrontalUrl();\nconst headers = await adminHeaders();\nawait fetch(`${API_BASE}/models/providers`, { headers });",
    want: 'green',
  },
  {
    name: '端脑面 + 根本没带 headers ⇒ 红',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { method: 'POST' });",
    want: 'red',
  },
  {
    name: '端脑面 + 带的是别的头 ⇒ 红',
    code: "const API_BASE = prefrontalUrl();\nawait fetch(`${API_BASE}/models/providers`, { headers: { 'Content-Type': 'application/json' } });",
    want: 'red',
  },
  {
    name: 'neuron 面 ⇒ 不受这道门管',
    code: "const NEURON_BASE = neuronUrl();\nawait fetch(`${NEURON_BASE}/models/providers`);",
    want: 'green',
  },
  {
    name: '注释里提到这条路由 ⇒ 不算命中',
    code: "const API_BASE = prefrontalUrl();\n// 以前这里打 ${API_BASE}/models/providers\nconst x = 1;",
    want: 'none',
  },
  {
    name: '/v1/models 不是这张面（不是 /models 前缀）',
    code: "const NEURON_BASE = neuronUrl();\nawait fetch(`${NEURON_BASE}/v1/models?engine=llm`);",
    want: 'none',
  },
  {
    name: '端脑面 + 路由在插值里（/models/{provider}/{model}）⇒ 红',
    code: "const baseUrl = useTelencephalonStore((s) => s.connection.baseUrl);\nawait fetch(`${baseUrl}/models/foo/bar`, { method: 'DELETE' });",
    want: 'red',
  },
];

function runSelfTest() {
  const prefixes = ['/models/providers', '/models', '/api/telencephalon/chat/completions'];
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const code = stripComments(c.code, { nested: false });
    const idx = code.indexOf('fetch(');
    let got = 'none';
    if (idx !== -1) {
      const callText = extractCall(code, idx);
      const urlText = firstArg(callText);
      const p = pathLiteral(urlText);
      const hit = p ? prefixes.find((pfx) => p === pfx || p.startsWith(`${pfx}/`)) : null;
      if (hit) {
        const { surface } = classifySurface(code, urlText);
        if (surface === 'NEURON') got = 'green';
        else if (surface === 'UNKNOWN') got = 'unknown';
        else got = hasAdminCredential(code, callText).ok ? 'green' : 'red';
      }
    }
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`  ${ok ? '✅' : '❌'} ${c.name} ⇒ 期望 ${c.want}，实测 ${got}`);
  }
  return failed;
}

/* ------------------------------------------------------------------ *
 * 5. 主流程
 * ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }

  // `--telencephalon <path>`：把判据源指到别的 checkout
  // （反向验证时对着一个**历史 worktree** 跑）。
  const tIdx = args.indexOf('--telencephalon');
  if (tIdx !== -1 && args[tIdx + 1]) {
    TELENCEPHALON_DIR = resolve(process.cwd(), args[tIdx + 1]);
    TELENCEPHALON_SRC = resolve(TELENCEPHALON_DIR, 'src', 'api', 'providers.rs');
  }

  if (args.includes('--self-test')) {
    console.log('探测器自检 —— 判据本身会不会看错：');
    const failed = runSelfTest();
    if (failed > 0) {
      console.error(`\n❌ 自检没过（${failed} 条）⇒ 探测器坏了 ⇒ 退出码 2。`);
      return 2;
    }
    console.log('\n✅ 自检全过。');
    return 0;
  }
  let routes;
  try {
    routes = parseGatedRoutes();
  } catch (e) {
    console.error(`❌ 判据源不可用：${e.message}`);
    console.error('   ⇒ 「不知道」不等于「没问题」⇒ 退出码 2。');
    return 2;
  }

  console.log('providers 门 —— 客户端凭据判定闸');
  console.log(`  判据源: ${relative(REPO, TELENCEPHALON_SRC).replace(/\\/g, '/')}`);
  console.log(`  被罩住的路由 (${routes.routes.length}):`);
  for (const r of routes.routes) console.log(`    ${r}`);
  console.log('');

  const desktop = scanClient(DESKTOP_SRC, routes.prefixes);
  const concrete = routes.routes.filter((r) => !r.includes('{'));
  const mobileHits = scanMobile(MOBILE_LIB, concrete);

  console.log(`  桌面端: ${desktop.scanned} 个文件`);
  console.log(`    绿 ${desktop.green.length} / 红 ${desktop.red.length} / 判不了 ${desktop.unknown.length}`);
  console.log('');

  for (const h of desktop.green) {
    console.log(`  ✅ ${h.rel}:${h.line}  ${h.route}  — ${h.how}`);
  }
  for (const u of desktop.unknown) {
    console.log(`  ⚠️ ${u.rel}:${u.line}  ${u.route}  — 判不了：${u.why}`);
  }
  for (const r of desktop.red) {
    console.log(`  ❌ ${r.rel}:${r.line}  ${r.route}  — ${r.why}`);
    console.log(`       ⇒ 门一上，这一发就是 401。`);
  }
  console.log('');
  if (mobileHits.length > 0) {
    console.log(`  移动端也提到了这张面（${mobileHits.length} 处）—— 请人工确认：`);
    for (const m of mobileHits) console.log(`     ${m.rel}:${m.line}  ${m.route}`);
  } else {
    console.log('  移动端: 0 处调用这张面 ⇒ 这道门不会把手机锁在外面。');
  }
  console.log('');

  const bad = desktop.red.length + desktop.unknown.length;
  if (bad > 0) {
    console.error(`❌ ${bad} 处打这张面的请求没有 admin 凭据 ⇒ 门一上就会 401。`);
    return 1;
  }
  console.log('✅ 每一处打这张面的请求都带了 admin 凭据 ⇒ 门一上不会 401。');
  return 0;
}

process.exit(main());
