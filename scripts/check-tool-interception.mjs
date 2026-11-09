#!/usr/bin/env node
/**
 * 工具调用拦截点的完整性闸 —— 「端脑的第二道闸不许被悄悄拆掉」的守卫。
 *
 * ## 为什么要有这个闸
 *
 * 端脑有一张很扎实的**门型表**（telencephalon/src/api/door_policy.txt）⇒ ⇒
 * 它管的是 **HTTP 路由**：谁能把请求送进这扇门。
 *
 * ⚠️ 但它**管不到工具调用**：一次通过了
 * `/api/telencephalon/chat/completions`（owner 门）的请求，agent 随后发起的
 * MCP 工具调用 / WASM 叶区调用 / 设备调用 —— **都不再逐个过门**。
 *
 * ⇒ ⇒ 门授权的是「你可以对话」，不是「你可以调这个工具」。
 *
 * 这个闸守的是补上的那一层：**工具调用的类型化拦截点**
 * （telencephalon/src/tools/intercept.rs）。设计稿全文见
 * `docs/superpowers/architecture/2026-11-02-tool-interception-seam.md`。
 *
 * ## 闸门抓什么
 *
 * 1. **接缝不许被拆** —— `ToolRegistry::dispatch` 里必须还有
 *    `intercept::gate()` 的调用。拆了 ⇒ 所有工具调用回到「裸奔」。
 * 2. **未挂 gate 的能力调用点不许变多** —— 枚举端脑里所有「能力调用点」，
 *    每一个都必须**被罩住**（经过 dispatch，或附近就有 gate 调用），
 *    否则它必须落在**下面的已知缺口清单**里。
 *    ⇒ ⇒ 新增一个能力调用点却忘了挂 gate ⇒ **闸红**。
 * 3. **能力声明必须向后兼容** —— `McpToolSummary` 的 `user_only` /
 *    `destructive` 必须带 `#[serde(default)]` ⇒ ⇒ 存量行读得回来、
 *    **不需要迁移**。
 * 4. **声明必须真的被读** —— `mcp/runtime.rs` 必须读 MCP 规范的
 *    `annotations.destructiveHint` ⇒ ⇒ 否则 `destructive` 永远是 false，
 *    声明形同虚设。
 * 5. **认领与调用必须同一套命名** —— provider 的 `describe`（声明）与
 *    `invoke`（调用）若**都解析名字**，必须用同一个前缀 ⇒ ⇒ 否则
 *    「声明了但调的不是它」。
 * 6. **入站的代执行路由必须自己过 gate** —— 凡是**不经过**
 *    `ToolRegistry` 的「代执行」路由 ⇒ ⇒ 拦截点不会自动罩住它 ⇒ ⇒
 *    必须自己判。
 *    ⚠️ 曾经唯一的实例是设备那条 invoke 路由 ⇒ ⇒ **本轮已整条下线**
 *    （见 AGENTS.md ㌉ 条）⇒ ⇒ 但**规则留着** —— 下一个入站代执行
 *    路由照样会掉进同一个坑 ⇒ ⇒ 检查 6 照样得跑。
 *
 * ## 覆盖模型（两类能力调用点，处理方式不同）
 *
 * - **经 `ToolRegistry::dispatch` 的**（ToolProvider 的 `invoke`）
 *   ⇒ ⇒ 罩不罩得住**只看检查 1**（dispatch 里还有没有 gate）。
 * - **绕过 dispatch 直发的**（出站 A2A：`tasks/send`）
 *   ⇒ ⇒ 必须附近有 gate 调用，或落在已知缺口清单里。
 * - **入站的代执行路由**（`…/invoke`）⇒ ⇒ 拦截点**不会**自动罩住它
 *   ⇒ ⇒ 它必须**自己**过 gate（检查 6）。
 *
 * ## 已知缺口清单（P1 的活，不是「修好了」的证明）
 *
 * 下面这几处**今天没有**被 gate 罩住 —— 它们绕过 `ToolRegistry`，
 * 由 flow 运行时 / 视觉问答 / A2A 客户端 / WebRTC 转发直接发出去。
 * P1 挂上之后，**必须同步删掉清单里的对应条目**（闸会检查清单有没有过期）。
 *
 * ## 防假绿（这条最重要）
 *
 * **一个文件都没读到 ⇒ 退出码 2，不是 0。**
 * 路径写错、仓库挪了家 ⇒ 「没找到东西」绝不能被说成「没发现问题」。
 * 同理：探测器自己先跑一遍 `--self-test` ⇒ 探测器坏了 ⇒ 退出码 2。
 *
 * ⚠️ **测试代码不算调用点** —— Rust 的单测住在同一个文件里 ⇒
 * 闸扫的时候必须把 `#[cfg(test)]` 块抹掉（`stripTestModules`）⇒
 * 否则测试里的 `assert_eq!(door_of("…/a2a/tasks/send", "POST"), …)`
 * 会被当成真调用点 ⇒ ⇒ 假红。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-tool-interception.mjs
 * node scripts/check-tool-interception.mjs --source C:\Projects\iBLOC\telencephalon
 * node scripts/check-tool-interception.mjs --self-test
 * node scripts/check-tool-interception.mjs --json
 * ```
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, stripTestModules } from './lib/strip-comments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * 已知缺口：今天**没有**被 gate 罩住的能力调用点。
 *
 * ⚠️ 每一条都要写清楚「为什么还没挂」+「什么时候挂」—— 否则它会变成
 * 一张「已知问题」清单，永远没人还。
 */
const KNOWN_GAPS = [
  {
    file: 'src/flow/adapter/a2a.rs',
    why: 'flow 的 a2a 节点直接发 tasks/send，绕过 ToolRegistry',
    when: 'P1（把 gate 挂到出站 A2A 汇聚点）',
  },
  {
    file: 'src/flow/adapter/lobe.rs',
    why: 'flow 的 lobe 节点直接发 tasks/send，绕过 ToolRegistry',
    when: 'P1（把 gate 挂到出站 A2A 汇聚点）',
  },
  {
    file: 'src/visual_qa/router.rs',
    why: '视觉问答的跨机派发直接发 tasks/send，绕过 ToolRegistry',
    when: 'P1（把 gate 挂到出站 A2A 汇聚点）',
  },
  {
    file: 'src/a2a/client.rs',
    why: '端脑的 A2A 客户端直接发 JSON-RPC tasks/send，绕过 ToolRegistry',
    when: 'P1（把 gate 挂到出站 A2A 汇聚点）',
  },
  {
    file: 'src/api/webrtc_route.rs',
    why: 'WebRTC 转发把 offer 塞给叶区的 tasks/send，绕过 ToolRegistry',
    when: 'P1（把 gate 挂到出站 A2A 汇聚点）',
  },
];

/**
 * 能力调用点的三种形态。
 *
 * ⚠️ `viaDispatch: true` = 这个调用点**必然经过**
 * `ToolRegistry::dispatch` ⇒ ⇒ 它罩不罩得住只看检查 1。
 */
const CALL_KINDS = [
  {
    kind: 'tool-registry-dispatch',
    viaDispatch: true,
    re: /\.dispatch\(\s*(crate::tools::)?ToolInvocation/g,
  },
  {
    kind: 'mcp-runtime-invoke',
    viaDispatch: true,
    re: /\.invoke\(server\.id/g,
  },
  {
    kind: 'a2a-tasks-send-url',
    viaDispatch: false,
    re: /a2a\/tasks\/send/g,
    // 只算「**真的在构造一个要发出去的 URL**」⇒ ⇒
    // 断言里的路径字面量、路由定义都不算。
    accept: (line) =>
      (line.includes('.post(') || line.includes('format!(')) &&
      !line.includes('.route('),
  },
  {
    kind: 'a2a-tasks-send-jsonrpc',
    viaDispatch: false,
    re: /"method"\s*:\s*"tasks\/send"/g,
  },
];

function parseArgs(argv) {
  const opts = {
    source: resolve(REPO, '..', 'telencephalon'),
    selfTest: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '--json') opts.json = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(
        '用法: node scripts/check-tool-interception.mjs [--source <telencephalon 路径>] [--self-test] [--json]'
      );
      process.exit(0);
    } else {
      console.error('不认识的参数: ' + argv[i]);
      process.exit(2);
    }
  }
  return opts;
}

/** 递归列出 .rs 文件。 */
function rustFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...rustFiles(p));
    else if (entry.endsWith('.rs')) out.push(p);
  }
  return out;
}

/** 注释与测试代码都抹掉 ⇒ 剩下的才是「产物里的代码」。 */
function productionCode(raw) {
  return stripTestModules(stripComments(raw, { nested: true, rust: true }));
}

/** 把源码里所有能力调用点找出来。 */
function findCallSites(stripped) {
  const lines = stripped.split('\n');
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ck of CALL_KINDS) {
      ck.re.lastIndex = 0;
      if (!ck.re.test(line)) continue;
      if (ck.accept && !ck.accept(line)) continue;
      sites.push({ kind: ck.kind, viaDispatch: !!ck.viaDispatch, line: i + 1, text: line.trim() });
    }
  }
  return sites;
}

/** 这个调用点被罩住了吗？（只对**绕过 dispatch** 的调用点有意义） */
function isCovered(relFile, site, gateLines) {
  for (const g of gateLines) {
    if (Math.abs(g - site.line) <= 30) {
      return { covered: true, why: '同文件 ±30 行内有 intercept::gate()' };
    }
  }
  return { covered: false, why: '附近没有 intercept::gate() 调用' };
}

/**
 * `impl ToolProvider for …` 块的行范围。
 *
 * ⚠️ 为什么需要它：**provider 的 `invoke` 里的出站调用**（例如 WASM
 * provider 发 `tasks/send`）**必然经过 `ToolRegistry::dispatch`** ⇒ ⇒
 * 它是被 dispatch 的 gate 罩住的 ⇒ ⇒ 不能当成「未挂点」。
 */
function providerImplRanges(stripped) {
  const lines = stripped.split('\n');
  const ranges = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('impl ToolProvider for')) continue;
    let end = i + 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === '}') {
        end = j;
        break;
      }
      end = j;
    }
    ranges.push({ start: i + 1, end: end + 1 });
  }
  return ranges;
}

/**
 * 入站的「**代执行工具**」路由 —— 路径里带 invoke 的那种。
 *
 * ⚠️ 为什么单列一类：它们**不经过** `ToolRegistry::dispatch` ⇒ ⇒
 * 拦截点**不会**自动罩住它们 ⇒ ⇒ 每一个都必须**自己**过 gate。
 *
 * ⇒ ⇒ 这类洞是**闸自己**曾经看不见的（2026-11-02 实测：设备那条路由
 * 就是这么溜过去的 ⇒ ⇒ 闸加了这一类）。
 *
 * ⚠️ 那个实例**本轮已随整条设备路下线**（见 AGENTS.md ㌉ 条）⇒ ⇒
 * **这一类判据必须留着** —— 它现在报 0 条，**不等于**它没用了 ⇒ ⇒
 * 下一个入站代执行路由会直接掉进同一个坑。
 */
const INBOUND_EXEC_RE = /\.route\(\s*"([^"]*\/invoke[^"]*)"/g;

function findInboundExecRoutes(stripped) {
  const out = [];
  INBOUND_EXEC_RE.lastIndex = 0;
  let m;
  while ((m = INBOUND_EXEC_RE.exec(stripped)) !== null) {
    const line = stripped.slice(0, m.index).split('\n').length;
    out.push({ path: m[1], line });
  }
  return out;
}

function collectGateLines(stripped) {
  const lines = stripped.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('intercept::gate()')) out.push(i + 1);
  }
  return out;
}

/** 检查 1：dispatch 里的接缝不许被拆。 */
function checkDispatchSeam(stripped) {
  const lines = stripped.split('\n');
  const start = lines.findIndex((l) => l.includes('pub async fn dispatch('));
  if (start < 0) return { ok: false, why: '找不到 ToolRegistry::dispatch' };
  const indent = (lines[start].match(/^\s*/) || [''])[0].length;
  let end = start + 1;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    const ind = (l.match(/^\s*/) || [''])[0].length;
    if (ind <= indent && !l.trim().startsWith('//')) {
      end = i;
      break;
    }
    end = i;
  }
  const body = lines.slice(start, end + 1).join('\n');
  const ok = body.includes('intercept::gate()');
  return { ok, why: ok ? '' : 'ToolRegistry::dispatch 里没有 intercept::gate() 调用 —— 接缝被拆了' };
}

/** 检查 3：能力声明字段必须带 #[serde(default)]。 */
function checkSerdeDefaults(stripped) {
  const problems = [];
  const structStart = stripped.indexOf('pub struct McpToolSummary');
  if (structStart < 0) return { ok: false, problems: ['找不到 McpToolSummary'] };
  const lines = stripped.slice(structStart).split('\n');
  for (const field of ['user_only', 'destructive']) {
    const idx = lines.findIndex((l) => l.includes('pub ' + field + ':'));
    if (idx < 0) {
      problems.push('McpToolSummary 缺少字段 ' + field);
      continue;
    }
    const before = lines.slice(Math.max(0, idx - 3), idx).join('\n');
    if (!before.includes('#[serde(default)]')) {
      problems.push('McpToolSummary.' + field + ' 缺少 #[serde(default)] ⇒ 存量行读不回来');
    }
  }
  return { ok: problems.length === 0, problems };
}

/** 检查 4：声明必须真的被读。 */
function checkAnnotationsRead(stripped) {
  const ok = stripped.includes('destructiveHint');
  return {
    ok,
    why: ok ? '' : 'mcp/runtime.rs 没有读 annotations.destructiveHint ⇒ destructive 永远是 false',
  };
}

/**
 * 检查 5：认领与调用必须同一套命名。
 *
 * ⚠️ 只有**双方都解析名字**时才要求一致 ——
 * 一个 provider 的 `invoke` 根本不解析名字（直接返回 not-wired）⇒ ⇒
 * 那不是「不一致」，那是「还没接线」。
 *
 * ⚠️ 默认清单只列**今天还活着**的那个 provider（`mcp:`）—— 设备那条
 * （`device:` ⇒ `DeviceToolProvider`）本轮下线了 ⇒ ⇒ 从默认清单里摘掉。
 * ⚠️ 但「检查器认得这一对」这件事**没被削弱** —— 自检样本 8c 显式传
 * `[['device:', 'DeviceToolProvider']]` ⇒ ⇒ 判据本身照样被钉住。
 */
function checkNamingConsistency(stripped, pairs = [
  ['mcp:', 'McpToolProvider'],
]) {
  const problems = [];
  for (const [prefix, provider] of pairs) {
    const idx = stripped.indexOf('impl ToolProvider for ' + provider);
    if (idx < 0) {
      problems.push('找不到 ' + provider + ' 的 ToolProvider 实现');
      continue;
    }
    const rest = stripped.slice(idx);
    const describeIdx = rest.indexOf('async fn describe(');
    const invokeIdx = rest.indexOf('async fn invoke(');
    if (describeIdx < 0) {
      problems.push(provider + ' 没有实现 describe ⇒ 它声明不了任何能力');
      continue;
    }
    if (invokeIdx < 0) {
      problems.push(provider + ' 没有 invoke ⇒ 怪了');
      continue;
    }
    const quoted = '"' + prefix + '"';
    const describePart = rest.slice(describeIdx, describeIdx + 1200);
    const invokePart = rest.slice(invokeIdx, invokeIdx + 1200);
    if (!describePart.includes('strip_prefix(' + quoted + ')')) {
      problems.push(provider + '.describe 的命名解析与 invoke 不同 ⇒ 声明的可能是别的工具');
    }
    // invoke 根本不解析名字 ⇒ 「还没接线」，不是「不一致」。
    if (invokePart.includes('strip_prefix(') && !invokePart.includes('strip_prefix(' + quoted + ')')) {
      problems.push(provider + '.invoke 变了命名解析 ⇒ 与 describe 对不上');
    }
  }
  return { ok: problems.length === 0, problems };
}

function runGate(sourceRoot) {
  if (!existsSync(sourceRoot)) {
    return { fatal: '端脑仓不存在: ' + sourceRoot };
  }
  const srcRoot = join(sourceRoot, 'src');
  if (!existsSync(srcRoot)) {
    return { fatal: '端脑源码不存在: ' + srcRoot };
  }
  const toolsMod = join(srcRoot, 'tools', 'mod.rs');
  const intercept = join(srcRoot, 'tools', 'intercept.rs');
  if (!existsSync(toolsMod)) {
    return { fatal: '找不到 ' + toolsMod };
  }
  if (!existsSync(intercept)) {
    return { fatal: '找不到 ' + intercept + '（拦截点模块不存在）' };
  }

  const files = rustFiles(srcRoot);
  if (files.length === 0) return { fatal: '一个 .rs 文件都没读到' };

  const strippedByFile = new Map();
  for (const f of files) {
    strippedByFile.set(f, productionCode(readFileSync(f, 'utf8')));
  }

  const violations = [];
  const notes = [];

  // ── 检查 1 ────────────────────────────────────────────────
  const toolsStripped = strippedByFile.get(toolsMod);
  const seam = checkDispatchSeam(toolsStripped);
  if (!seam.ok) violations.push('接缝被拆：' + seam.why);

  // ── 检查 2 ────────────────────────────────────────────────
  const uncovered = [];
  const gapFiles = new Set(KNOWN_GAPS.map((g) => g.file));
  const seenGapFiles = new Set();
  for (const [file, stripped] of strippedByFile) {
    const rel = relative(sourceRoot, file).replace(/\\/g, '/');
    const gateLines = collectGateLines(stripped);
    const providerImpls = providerImplRanges(stripped);
    for (const site of findCallSites(stripped)) {
      // 经 dispatch 的 ⇒ 罩不罩得住只看检查 1
      if (site.viaDispatch) continue;
      // 在某个 `ToolProvider` 实现块里 ⇒ 它只会被 dispatch 调 ⇒ ⇒ 罩住了
      if (providerImpls.some((r) => site.line >= r.start && site.line <= r.end)) continue;
      const cov = isCovered(rel, site, gateLines);
      if (cov.covered) continue;
      if (gapFiles.has(rel)) {
        seenGapFiles.add(rel);
        continue;
      }
      uncovered.push({ file: rel, ...site, why: cov.why });
    }
  }
  for (const u of uncovered) {
    violations.push(
      '能力调用点没有被 gate 罩住: ' + u.file + ':' + u.line + ' (' + u.kind + ') —— ' + u.why
    );
  }
  for (const g of KNOWN_GAPS) {
    if (!seenGapFiles.has(g.file)) {
      violations.push(
        '已知缺口清单已过期: ' + g.file + ' —— 那里现在要么被罩住了、要么调用点没了 ⇒ 请更新清单'
      );
    }
  }

  // ── 检查 6：入站的代执行路由必须**自己**过 gate ──────────────
  for (const [file, stripped] of strippedByFile) {
    const rel = relative(sourceRoot, file).replace(/\\/g, '/');
    const routes = findInboundExecRoutes(stripped);
    if (routes.length === 0) continue;
    if (collectGateLines(stripped).length > 0) continue;
    if (gapFiles.has(rel)) continue;
    for (const r of routes) {
      violations.push(
        '入站的代执行路由没有过 gate: ' + rel + ':' + r.line + ' (' + r.path +
          ') —— 它不经过 ToolRegistry ⇒ ⇒ 拦截点不会自动罩住它'
      );
    }
  }

  // ── 检查 3 ────────────────────────────────────────────────
  const mcpServer = join(srcRoot, 'mcp', 'server.rs');
  if (!existsSync(mcpServer)) {
    violations.push('找不到 ' + mcpServer);
  } else {
    const s = checkSerdeDefaults(strippedByFile.get(mcpServer));
    for (const p of s.problems) violations.push('能力声明：' + p);
  }

  // ── 检查 4 ────────────────────────────────────────────────
  const mcpRuntime = join(srcRoot, 'mcp', 'runtime.rs');
  if (!existsSync(mcpRuntime)) {
    violations.push('找不到 ' + mcpRuntime);
  } else {
    const s = checkAnnotationsRead(strippedByFile.get(mcpRuntime));
    if (!s.ok) violations.push('能力声明：' + s.why);
  }

  // ── 检查 5 ────────────────────────────────────────────────
  const s5 = checkNamingConsistency(toolsStripped);
  for (const p of s5.problems) violations.push('命名一致性：' + p);

  notes.push('扫了 ' + files.length + ' 个 .rs 文件');
  notes.push('已知缺口（绕过 dispatch 的能力调用点）: ' + KNOWN_GAPS.length + ' 条');

  return { violations, notes, scanned: files.length };
}

/** ── 自检：探测器自己坏没坏？六只样本。 ───────────────────── */
function selfTest() {
  let failed = 0;
  let total = 0;
  const check = (name, ok) => {
    total++;
    if (!ok) {
      failed++;
      console.error('  ✗ ' + name);
    } else {
      console.log('  ✓ ' + name);
    }
  };
  const strip = (s) => productionCode(s);

  const s1 = strip('async fn go() {\n  client.post(format!("{}/a2a/tasks/send", url)).await;\n}');
  check('样本1：识别出 a2a URL 出站调用点', findCallSites(s1).some((x) => x.kind === 'a2a-tasks-send-url'));

  const s2 = strip('// 曾经这里发过 a2a/tasks/send\n/* 块注释里的 tasks/send 也不算 */\nfn x() {}\n');
  check('样本2：注释里的调用点不被算', findCallSites(s2).length === 0);

  const s3 = strip('.route("/wasm/{name}/a2a/tasks/send", post(send_task))\n');
  check('样本3：入站路由定义不算调用点', findCallSites(s3).length === 0);

  const s4 = strip('registry.dispatch(ToolInvocation { name: n, args: a }).await\n');
  check('样本4：识别出 dispatch 调用点', findCallSites(s4).some((x) => x.kind === 'tool-registry-dispatch'));

  const s5 = strip('#[cfg(test)]\nmod tests {\n  fn t() {\n    assert_eq!(door_of("/a2a/tasks/send", "POST"), Door::Open);\n  }\n}\n');
  check('样本5：测试模块里的路径字面量不算调用点', findCallSites(s5).length === 0);

  const s6 = strip('let body = json!({ "jsonrpc": "2.0", "method": "tasks/send", "params": {} });\n');
  check('样本6：识别出 JSON-RPC tasks/send 调用点', findCallSites(s6).some((x) => x.kind === 'a2a-tasks-send-jsonrpc'));

  const s9 = strip('.route(\n  "/api/telencephalon/devices/{id}/invoke",\n  post(invoke_device_tool_handler),\n)\n');
  const r9 = findInboundExecRoutes(s9);
  check('样本9：认得出入站的代执行路由', r9.length === 1 && r9[0].path.includes('/invoke'));

  const s10 = strip('.route("/api/telencephalon/devices/{id}", get(get_device_handler))\n');
  check('样本10：普通路由不算代执行路由', findInboundExecRoutes(s10).length === 0);

  const bad = checkSerdeDefaults('pub struct McpToolSummary {\n  pub user_only: bool,\n}');
  check('样本7：认得出缺 #[serde(default)] 的字段', !bad.ok);
  const good = checkSerdeDefaults(
    'pub struct McpToolSummary {\n  #[serde(default)]\n  pub user_only: bool,\n  #[serde(default)]\n  pub destructive: bool,\n}'
  );
  check('样本7b：字段齐全时判绿', good.ok);

  // ⚠️ 只查 McpToolProvider ⇒ ⇒ 样本里没有 DeviceToolProvider 不会
  // 造成「因为缺实现而红」⇒ ⇒ 假通过。
  const ONLY_MCP = [['mcp:', 'McpToolProvider']];
  const inconsistent = checkNamingConsistency(
    'impl ToolProvider for McpToolProvider {\n  async fn describe(&self, n: &str) -> Option<ToolCapabilities> { let s = n.strip_prefix("mcp:"); None }\n  async fn invoke(&self, n: &str, a: Value) -> Result<Value, ToolError> { let s = n.strip_prefix("other:"); Ok(Value::Null) }\n}',
    ONLY_MCP
  );
  check('样本8：认得出 describe 与 invoke 的命名不一致', !inconsistent.ok);

  const consistent = checkNamingConsistency(
    'impl ToolProvider for McpToolProvider {\n  async fn describe(&self, n: &str) -> Option<ToolCapabilities> { let s = n.strip_prefix("mcp:"); None }\n  async fn invoke(&self, n: &str, a: Value) -> Result<Value, ToolError> { let s = n.strip_prefix("mcp:"); Ok(Value::Null) }\n}',
    ONLY_MCP
  );
  check('样本8b：命名一致时判绿', consistent.ok);

  // 样本 8c：invoke **根本不解析名字**（device 那样）⇒ ⇒ 不算「不一致」
  const notResolving = checkNamingConsistency(
    'impl ToolProvider for DeviceToolProvider {\n  async fn describe(&self, n: &str) -> Option<ToolCapabilities> { let s = n.strip_prefix("device:"); None }\n  async fn invoke(&self, _n: &str, _a: Value) -> Result<Value, ToolError> { Err(ToolError::ProviderNotWired {}) }\n}',
    [['device:', 'DeviceToolProvider']]
  );
  check('样本8c：invoke 不解析名字时不算命名不一致', notResolving.ok);

  if (failed) {
    console.error('\n自检失败: ' + failed + ' 条 ⇒ 探测器坏了（退出码 2）');
    process.exit(2);
  }
  console.log('\n自检全过（' + (total - failed) + '/' + total + '）');
}

const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) {
  selfTest();
  process.exit(0);
}

const result = runGate(opts.source);
if (result.fatal) {
  console.error('✗ ' + result.fatal);
  console.error('  ⇒ 没读到东西不能算「没发现问题」⇒ 退出码 2');
  process.exit(2);
}

if (opts.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.violations.length === 0 ? 0 : 1);
}

for (const n of result.notes) console.log('· ' + n);
if (result.violations.length === 0) {
  console.log('✓ 工具调用的拦截点接缝完整');
  console.log('  （已知缺口 ' + KNOWN_GAPS.length + ' 条：那些是 P1 的活，不是「修好了」的证明）');
  process.exit(0);
}
console.error('\n✗ 拦截点闸红了 ' + result.violations.length + ' 条：');
for (const v of result.violations) console.error('  - ' + v);
process.exit(1);
