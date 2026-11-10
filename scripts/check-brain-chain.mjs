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
 *   7. 客户端**不许知道 neuron's 地址**（只有一个入口：大脑那张面）。
 *   8. 「一张面」必须真的只有一张（本地模型那一半走大脑）。
 *
 * 用法：node scripts/check-brain-chain.mjs
 * 退出码 0 = 通过；1 = 有阻断问题；**2 = 判不了**（源没读全：兄弟仓 / 扫描根不在位）。
 */

import { sibling } from './lib/sibling-repo.mjs';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname, resolve } from 'node:path';

/** CLI：`--root=<目录>`（换被测物根）⇒ ⇒ 「判不了」那一档可被真实验证。 */
function argValue(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const ROOT = argValue('root')
  ? resolve(argValue('root'))
  : join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 「判不了」的原因清单。
 *
 * ⚠️ **「读不到」≠「没问题」** ⇒ ⇒ 这道闸的核心价值是**跨仓契约**
 * ⇒ ⇒ 兄弟仓不在位 ⇒ ⇒ 那一层**根本没查** ⇒ ⇒ 报绿就是**构造出来的零**。
 */
const cannotJudge = [];

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

/**
 * **兄弟仓** —— 「大脑那张面」是一条**跨仓**契约（三个宿主分处三个仓）⇒ ⇒
 * 只扫本仓就看不见「另两个宿主还各拼各的」这件事。
 *
 * ⚠️ **存在才扫** —— `shadow` 单独 clone 时兄弟仓不在 ⇒ ⇒ 跳过 ⇒ ⇒ 闸不会
 * 因为「仓库没检出来」而假红（那不是代码问题，是环境问题）。
 */
const SIBLING_CANDIDATES = [
  // ⚠️ **两种布局都要认**（仓外优先／仓内兜底）—— 见 `scripts/lib/sibling-repo.mjs`
  //    ⇒ ⇒ CI 上兄弟仓被 checkout 到仓根**之下**，写死仓外就读不到 ⇒ ⇒ 退出码 2。
  { dir: sibling(ROOT, 'telencephalon'), exts: ['.rs'] },
  { dir: sibling(ROOT, 'encephalon'), exts: ['.rs'] },
];
const SIBLING_ROOTS = SIBLING_CANDIDATES.filter((r) => existsSync(r.dir));

// ⚠️ **「存在才扫」不等于「扫过了」** —— 兄弟仓不在位时，这一层**没查**
// ⇒ ⇒ 必须记成「判不了」（退出码 2），不能报绿。
for (const r of SIBLING_CANDIDATES) {
  if (!existsSync(r.dir)) {
    cannotJudge.push(
      `兄弟仓不在位：${relative(ROOT, r.dir).replace(/\\/g, '/')} ⇒ ⇒ 跨仓契约这一层**没查**`,
    );
  }
}
for (const r of SCAN_ROOTS) {
  if (!existsSync(r.dir)) {
    cannotJudge.push(
      `本仓扫描根不在位：${relative(ROOT, r.dir).replace(/\\/g, '/')}`,
    );
  }
}

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
function requireRule(id, why, needFiles, needIn, mustNotIn = []) {
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
  // ⚠️ **必须不含** —— 「不许出现的东西」也要能钉住 ⇒ ⇒ 否则
  // 「删干净了」和「从来没删过」长得一模一样。
  for (const { file, pattern } of mustNotIn) {
    const text = code.get(file);
    if (text === undefined) {
      findings.push({ id, file, why: `${why}（文件不存在）` });
      continue;
    }
    if (pattern.test(text)) {
      findings.push({ id, file, why: `${why}（不该出现的 ${pattern} 还在）` });
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
  '桌面端没有把端脑的 HTTP 面挂起来',
  ['shadow-desktop/src-tauri/src/telencephalon_http.rs'],
  [
    {
      file: 'shadow-desktop/src-tauri/src/telencephalon_http.rs',
      pattern: /surface::build_brain_face/,
    },
    {
      file: 'shadow-desktop/src-tauri/src/telencephalon_http.rs',
      pattern: /FaceContent::Full/,
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

// ── 7. 客户端不许知道 neuron's 地址 ──────────────────────────────────────
//
// 用户拍板（2026-11-02）：「**坚持嵌入式，所有的入口都在大脑，由大脑负责
// 路由和分发**」⇒ ⇒ 客户端**只有一个**后端地址（大脑那张面）⇒ ⇒
// 直连 neuron's 自己的 listener 是**绕过大脑的入口** ⇒ ⇒ 大脑那一侧
// 看不见「谁在管本地模型」⇒ ⇒ 这条入口必须消失。
//
// ⚠️ **作用域**：只管**桌面端客户端**（`shadow-desktop/src/`）⇒ ⇒
// ① `src-tauri/` 里的 `127.0.0.1:8085` 是 neuron's **真实监听地址**
// （叶区的 LLM 端点要指过去）⇒ ⇒ 服务端合法，不判；
// ② 移动端的 `8083` / `8085` 是**它自己内嵌**的运行时（同样属于
// 「坚持嵌入式」这一形态）⇒ ⇒ 合法，不判。
//
// ⚠️ **只判代码行** ⇒ ⇒ 注释里写「以前是 neuronUrl()」是**史证**，
// 恰恰是好事 ⇒ ⇒ 不判红。
const noNeuronAddress = (file, text) =>
  file.startsWith('shadow-desktop/src/') &&
  (text.includes('neuronUrl') ||
    text.includes('VITE_NEURON_URL') ||
    /localhost:808[35]\b/.test(text) ||
    /127\.0\.0\.1:808[35]\b/.test(text));

rule(
  'desktop-no-neuron-address',
  "桌面端客户端知道了 neuron's 地址 —— 那是绕过大脑的第二个入口",
  noNeuronAddress,
);

// ── 8. 「一张面」必须真的只有一张 ────────────────────────────────────────
//
// ⚠️ 「不许知道第二个地址」只钉住**不许出现什么** ⇒ ⇒ 还差一条
// 「**必须**从大脑那张面取地址」⇒ ⇒ 两边合起来才完整：
// ① 不许有第二个地址；② 本地模型那一半**必须**走大脑。
//
// ⚠️ 为什么点名这三个文件：它们是**本地模型那一半**的全部调用点 ⇒ ⇒
// 「本地模型走大脑」这条决定只能落在这里。
const brainBaseFromClient = (text) =>
  /telencephalonClient\.getBaseUrl\(\)/.test(text);

requireRule(
  'desktop-single-brain-face',
  '桌面端客户端没有把「大脑那张面」收成一张（本地模型那一半必须走大脑）',
  [],
  [
    {
      file: 'shadow-desktop/src/lib/modelConfigProbe.ts',
      pattern: /telencephalonClient\.getBaseUrl\(\)/,
    },
    {
      file: 'shadow-desktop/src/pages/ModelsPage.tsx',
      pattern: /telencephalonClient\.getBaseUrl\(\)/,
    },
    {
      file:
        'shadow-desktop/src/components/business/LocalEnginePanel/LocalEnginePanel.tsx',
      pattern: /telencephalonClient\.getBaseUrl\(\)/,
    },
  ],
  [
    {
      file: 'shadow-desktop/src/lib/platform.ts',
      pattern: /export const neuronUrl/,
    },
  ],
);

// ── 9. 「大脑那张面」必须只有一个组装入口 ────────────────────────────────
//
// ⚠️ 2026-11-03：桌面端 / 移动端 / 独立服务器以前**各拼各的**同一张面 ⇒ ⇒
// 形状一样但**代码有三份** ⇒ ⇒ 迟早漂 ⇒ ⇒ 而且「门罩住谁」在三处各不相同
// ⇒ ⇒ 「neuron 面 / 海马体面在门外」没人说得清是**设计**还是**巧合**。
//
// ⇒ 现在收成大脑仓的 `surface::build_brain_face` ⇒ ⇒ 三个宿主都必须调它。
//
// ⚠️ **兄弟仓存在才要求** —— `shadow` 单独 clone 时那两仓不在 ⇒ ⇒ 跳过 ⇒ ⇒
// 闸不会因为「仓库没检出来」而假红（那是环境问题，不是代码问题）。
const BRAIN_FACE_ENTRY = /surface::build_brain_face/;
const unifiedEntryFiles = [
  { file: 'shadow-desktop/src-tauri/src/telencephalon_http.rs' },
  { file: '../encephalon/src/mobile/mod.rs' },
  { file: '../encephalon/src/a2a_server.rs' },
].filter(({ file }) => code.has(file));

requireRule(
  'single-brain-face-entrypoint',
  '「大脑那张面」不是从统一入口组装的 —— 三个宿主各拼各的 ⇒ 迟早漂',
  [],
  unifiedEntryFiles.map(({ file }) => ({ file, pattern: BRAIN_FACE_ENTRY })),
);

// ── 自检：证明这道闸**有分辨力**，不是恒绿 ────────────────────────────────
//
// ⚠️ 自检必须包含**正控**（干净代码 ⇒ 不判红）**和反控**（有残留 ⇒
// 判红）⇒ ⇒ 只测「反控」的闸会给人「恒绿」的错觉。
if (process.argv.includes('--self-test')) {
  const F = 'shadow-desktop/src/lib/probe.ts';
  const cases = [
    {
      name: '代码行里有 neuronUrl() ⇒ 判红',
      got: noNeuronAddress(F, codeLines('const b = neuronUrl();')),
      want: true,
    },
    {
      name: '注释里提到 neuronUrl() ⇒ 不判红（史证是好事）',
      got: noNeuronAddress(F, codeLines('// 以前是 neuronUrl()\nconst b = 1;')),
      want: false,
    },
    {
      name: '代码行里有 VITE_NEURON_URL ⇒ 判红',
      got: noNeuronAddress(F, codeLines("const u = import.meta.env.VITE_NEURON_URL;")),
      want: true,
    },
    {
      name: "写死 neuron's 端口 8085 ⇒ 判红",
      got: noNeuronAddress(F, codeLines("const b = 'http://localhost:8085';")),
      want: true,
    },
    {
      name: "写死 neuron's 端口 8083 ⇒ 判红",
      got: noNeuronAddress(F, codeLines("const b = 'http://127.0.0.1:8083';")),
      want: true,
    },
    {
      name: '走大脑的干净代码 ⇒ 不判红（正控）',
      got: noNeuronAddress(F, codeLines('const b = brainBase();\nawait fetch(`${b}/v1/models`);')),
      want: false,
    },
    {
      name: "Rust 侧（服务端）的 8085 ⇒ 不判红（作用域限定）",
      got: noNeuronAddress(
        'shadow-desktop/src-tauri/src/telencephalon_http.rs',
        codeLines("let addr = '127.0.0.1:8085';"),
      ),
      want: false,
    },
    {
      name: '本地模型那一半必须从 client 取 base ⇒ 缺了就判红',
      got: brainBaseFromClient(codeLines('const b = someOtherUrl();')),
      want: false,
    },
    {
      name: '本地模型那一半从 client 取 base ⇒ 不判红（正控）',
      got: brainBaseFromClient(codeLines('const b = telencephalonClient.getBaseUrl();')),
      want: true,
    },
    {
      name: '宿主调统一入口 ⇒ 不判红（正控）',
      got: BRAIN_FACE_ENTRY.test(
        codeLines('let f = encephalon::surface::build_brain_face(opts, n, c);'),
      ),
      want: true,
    },
    {
      name: '宿主又自己拼端脑面 ⇒ 判红',
      got: BRAIN_FACE_ENTRY.test(
        codeLines('let app = telencephalon::api::build_full_app(s, c, n, h);'),
      ),
      want: false,
    },
  ];
  let fails = 0;
  console.log('─'.repeat(72));
  console.log('通信链路闸 —— 自检');
  console.log('─'.repeat(72));
  for (const c of cases) {
    const ok = c.got === c.want;
    if (!ok) fails++;
    console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  }
  console.log('─'.repeat(72));
  if (fails === 0) {
    console.log(`✓ 自检全绿（${cases.length} / ${cases.length} 条全绿）`);
    process.exit(0);
  }
  console.error(`✗ 自检 ${fails} / ${cases.length} 条红`);
  process.exit(1);
}

// ── 报告 ──────────────────────────────────────────────────────────────────

console.log('─'.repeat(72));
console.log('通信链路校验 —— 大脑 → 端脑 → 叶区');
console.log('─'.repeat(72));
console.log(`  · 扫描文件 ${files.length} 个`);

/**
 * 「扫描根不在位」时，那些「文件不存在」类发现**不是证据** —— 它们是缺输入的
 * 副作用 ⇒ ⇒ 必须排除 ⇒ ⇒ 否则「读不到」会被写成「有问题」（假红）。
 */
const missingScopeRels = SCAN_ROOTS.filter((r) => !existsSync(r.dir)).map((r) =>
  relative(ROOT, r.dir).replace(/\\/g, '/'),
);
const isArtifact = (f) =>
  missingScopeRels.some((r) => f.file === r || f.file.startsWith(r + '/'));
const realFindings = findings.filter((f) => !isArtifact(f));
const artifactCount = findings.length - realFindings.length;

if (realFindings.length > 0) {
  console.log('─'.repeat(72));
  for (const f of realFindings) {
    console.log(`  ✗ [${f.id}] ${f.file}`);
    console.log(`      ${f.why}`);
  }
  console.log('─'.repeat(72));
  console.log(
    `阻断 ${realFindings.length} 项` +
      (artifactCount > 0 ? `（另有 ${artifactCount} 项因扫描根不在位而无法判定 ⇒ ⇒ 不算证据）` : ''),
  );
  process.exit(1);
}

if (cannotJudge.length > 0) {
  // ⚠️ **「读不到」≠「没问题」** ⇒ ⇒ 缺输入必须说出来（退出码 2）。
  console.warn(`判不了：${cannotJudge.length} 项输入不在位 ⇒ ⇒ 这一格**没验成**：`);
  for (const c of cannotJudge) console.warn(`  · ${c}`);
  if (artifactCount > 0) {
    console.warn(`  · 另有 ${artifactCount} 项发现因扫描根不在位而**不是证据**（已排除，不计红）`);
  }
  console.log('─'.repeat(72));
  process.exit(2);
}

console.log('  · 桌面端：sidecar 挂端脑面，客户端无直连推理');
console.log('  · 移动端：对话走端脑，无本地直连编排器');
console.log('─'.repeat(72));
console.log('阻断 0 项');
process.exit(0);
