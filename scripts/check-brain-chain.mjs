#!/usr/bin/env node
/**
 * 通信链路守门员 —— 「所有通信都要走 大脑 → 端脑 → 叶区」
 *
 * 桌面端和移动端是同一个 agent 的两个终端，它们**不是**推理后端的客户端：
 * 推理由端脑（telencephalon）里的叶区发起，叶区再调 neuron。客户端只跟
 * 端脑说话。
 *
 * 这条链路一旦被绕过，后果不是「少个功能」，而是**整块能力静默失效**：
 * 意图路由、工具调用（`tool_call`）、flow、人格注入全都不在链路上。
 * 桌面端就真实发生过这件事 —— `isTauri()` 分支让对话直连 neuron，
 * 于是桌面端永远收不到 `tool_call`，「影子给客户端换主题」在桌面端
 * 根本不成立。
 *
 * 所以这里把这条规则**写成可执行的检查**，而不是写进文档里靠自觉：
 *
 *   1. 桌面端客户端不得直连推理（`neuron_infer` / `/v1/chat/completions`）。
 *   2. 桌面端客户端不得有绕过端脑会话 API 的平台分支。
 *   3. 桌面端 sidecar 必须把**端脑的 HTTP 面**挂起来（不是只挂海马体）。
 *   4. 桌面端 sidecar 不得再暴露直连推理的 Tauri 命令。
 *   5. 移动端对话必须走 `TelencephalonClient`（端脑方言）。
 *   6. 移动端不得保留本地直连推理的对话编排器。
 *
 * 用法：node scripts/check-brain-chain.mjs
 * 退出码 0 = 通过；1 = 有阻断问题。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules',
  'target',
  'build',
  '.dart_tool',
  '.git',
  'dist',
  'coverage',
  'Pods',
]);

/** 扫描的根目录 → 允许的扩展名。 */
const SCAN_ROOTS = [
  { dir: join(ROOT, 'shadow-desktop', 'src'), exts: ['.ts', '.tsx'] },
  { dir: join(ROOT, 'shadow-desktop', 'src-tauri', 'src'), exts: ['.rs'] },
  { dir: join(ROOT, 'shadow-mobile', 'lib'), exts: ['.dart'] },
];

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((r) => walk(r.dir, r.exts));
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

const contents = new Map(files.map((p) => [rel(p), readFileSync(p, 'utf8')]));

/**
 * 只保留「代码行」—— 注释行不算证据。
 *
 * 为什么不用手写词法分析器：这个仓里有 Rust 的**跨行字符串续行**
 * （`tracing::info!("... \` 换行接着写），字符串状态一旦跨行就断了，
 * 状态机会把后面的代码整段当成注释吃掉 —— 而且这种坑只在某个文件
 * 里出现一次，极难定位。
 *
 * 行级判定够用：被禁的东西要么出现在**代码行**里（那就是真问题），
 * 要么出现在注释里（那只是**解释**被禁的东西，恰恰是好事）。
 */
function codeLines(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith('//')) return false; // //、///、//!
      if (t.startsWith('/*')) return false; // /* 块注释
      if (t.startsWith('*')) return false; // 块注释的续行
      return true;
    })
    .join('\n');
}

/** 只看代码：注释行剥掉之后的内容。 */
const code = new Map([...contents].map(([f, t]) => [f, codeLines(t)]));

/** 测试文件 —— 用例里出现被禁的词往往是在**断言它不存在**。 */
function isTestFile(file) {
  return file.includes('__tests__') || /\.(test|spec)\.[jt]sx?$/.test(file);
}

/**
 * 白名单：这些文件**不是**对话链路的一部分。
 *
 * `openaiClient.ts` 是**云端供应商 / 语音**客户端（TTS、转写、模型列表），
 * 打的是用户自己配的 OpenAI 兼容端点。agent 的对话链路走的是
 * `telencephalonClient` → 端脑，两者不是一回事。
 */
const ALLOWLIST = new Set(['shadow-desktop/src/lib/openaiClient.ts']);

/** 规则命中 = 阻断项。 */
const findings = [];

/**
 * @param {string} id
 * @param {string} why      命中了说明什么
 * @param {(file: string, text: string) => boolean} match
 */
function rule(id, why, match) {
  for (const [file, text] of code) {
    if (isTestFile(file) || ALLOWLIST.has(file)) continue;
    if (match(file, text)) {
      findings.push({ id, file, why });
    }
  }
}

/**
 * @param {string} id
 * @param {string} why
 * @param {string[]} needFiles  必须存在
 * @param {string[]} needIn     { file, pattern } —— 文件里必须出现的内容
 */
function requireRule(id, why, needFiles, needIn) {
  for (const f of needFiles) {
    if (!existsSync(join(ROOT, f))) {
      findings.push({ id, file: f, why: `${why}（文件缺失）` });
    }
  }
  for (const { file, pattern } of needIn) {
    // 用**代码**而不是原文：注释里提到 `build_full_app` 不算数，
    // 真的调用了才算。
    const text = code.get(file);
    if (text === undefined) {
      findings.push({ id, file, why: `${why}（文件不存在）` });
      continue;
    }
    if (!pattern.test(text)) {
      findings.push({ id, file, why: `${why}（没找到 ${pattern}）` });
    }
  }
}

// ── 1. 桌面端客户端不得直连推理 ───────────────────────────────────────────
//
// `neuron_infer` 是那条直连推理的 Tauri 命令，已经从 sidecar 拆掉了；
// `/v1/chat/completions` 是 neuron 的 OpenAI 兼容面 —— 客户端碰它就等于
// 绕过了端脑和叶区。
rule(
  'desktop-no-direct-inference',
  '桌面端客户端直连了推理（neuron_infer / /v1/chat/completions）—— 绕过端脑和叶区',
  (file, text) =>
    file.startsWith('shadow-desktop/src/') &&
    (text.includes('neuron_infer') || text.includes('/v1/chat/completions')),
);

// ── 2. 桌面端客户端不得有绕过端脑会话 API 的平台分支 ──────────────────────
//
// 老路的名字：`newLocalConversation`（本地桩会话）+ `streamMessageNeuron`
// （直连 neuron 的流）。它们都曾经挂在 `isTauri()` 后面。
rule(
  'desktop-no-cortex-bypass',
  '桌面端又出现了绕过端脑会话 API 的旁路（本地桩 / 直连 neuron 的流）',
  (file, text) =>
    file === 'shadow-desktop/src/lib/telencephalonClient.ts' &&
    (text.includes('newLocalConversation') || text.includes('streamMessageNeuron')),
);

// ── 3. 桌面端 sidecar 必须挂起端脑的 HTTP 面 ──────────────────────────────
//
// 只挂海马体是不够的：那样桌面对话仍然够不到端脑。
requireRule(
  'desktop-sidecar-mounts-cortex',
  '桌面端 sidecar 没有把端脑的 HTTP 面挂起来',
  ['shadow-desktop/src-tauri/src/cortex_http.rs'],
  [
    {
      file: 'shadow-desktop/src-tauri/src/cortex_http.rs',
      pattern: /build_full_app|build_with_conversation_store/,
    },
    {
      file: 'shadow-desktop/src-tauri/src/cortex_http.rs',
      pattern: /hippocampus/,
    },
  ],
);

// ── 4. 桌面端 sidecar 不得再暴露直连推理的 Tauri 命令 ──────────────────────
rule(
  'desktop-no-infer-command',
  '桌面端 sidecar 仍然暴露直连推理的 Tauri 命令 —— 链路留了后门',
  (file, text) =>
    file.startsWith('shadow-desktop/src-tauri/src/') && text.includes('neuron_infer'),
);

// ── 5. 移动端对话必须走端脑 ───────────────────────────────────────────────
//
// 端脑方言 = `/shadow/v1/conversations`。移动端此前把对话挂在
// `PrefrontalClient`（前额叶方言 `/api/sessions`）上，改嵌大脑之后那条路
// 根本不存在了。
requireRule(
  'mobile-chat-through-cortex',
  '移动端对话没有走端脑（TelencephalonClient / /shadow/v1/conversations）',
  [],
  [
    {
      file: 'shadow-mobile/lib/providers/chat_provider.dart',
      pattern: /createConversation\(/,
    },
    {
      file: 'shadow-mobile/lib/providers/chat_provider.dart',
      pattern: /streamMessage\(/,
    },
    {
      file: 'shadow-mobile/lib/services/telencephalon/telencephalon_client.dart',
      pattern: /\/shadow\/v1\/conversations/,
    },
  ],
);

// ── 6. 移动端不得保留本地直连推理的对话编排器 ────────────────────────────
//
// `MainAgentNotifier` 是端脑之前的旧编排器：它直接拿 `ModelEngine`
// （本地 MNN）跑推理，绕过端脑和叶区。它一旦被重新接上，移动端就会
// 静默退回旧链路。
rule(
  'mobile-no-local-llm-orchestrator',
  '移动端还留着本地直连推理的对话编排器（MainAgentNotifier）—— 可以绕过端脑',
  (file, text) => file.startsWith('shadow-mobile/lib/') && text.includes('MainAgentNotifier'),
);

// ── 报告 ──────────────────────────────────────────────────────────────────

console.log('─'.repeat(72));
console.log('通信链路校验 —— 大脑 → 端脑 → 叶区');
console.log('─'.repeat(72));
console.log(`  · 扫描文件 ${files.length} 个`);

if (findings.length === 0) {
  console.log('  · 桌面端：sidecar 挂端脑面，客户端无直连推理');
  console.log('  · 移动端：对话走端脑，无本地直连编排器');
  console.log('─'.repeat(72));
  console.log('阻断 0 项');
  process.exit(0);
}

console.log('─'.repeat(72));
for (const f of findings) {
  console.log(`  ✗ [${f.id}] ${f.file}`);
  console.log(`      ${f.why}`);
}
console.log('─'.repeat(72));
console.log(`阻断 ${findings.length} 项`);
process.exit(1);
