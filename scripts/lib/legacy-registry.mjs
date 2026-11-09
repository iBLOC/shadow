#!/usr/bin/env node
/**
 * Legacy residue 闸 —— **跨仓注册表**（数据）
 *
 * ⚠️ 判据（算法）不在这里 ⇒ 在 `./legacy-residue.mjs`（唯一一份）。
 *    这里只有**数据**：每个仓扫哪些目录、哪些 token 是真契约 / 史证。
 *
 * ── 为什么要有跨仓这一层 ──────────────────────────────────────────
 * 用户拍板：「Cortex 是过时概念应该删除」。
 * ⚠️ 现实：iBLOC 这套栈是**十几个独立 git 仓**（各自 CI / 各自发布节奏）。
 *    ⇒ 闸只住在 shadow 仓 ⇒ **另外那些仓没人盯**（2026-11 实测：
 *    prefrontal 的 tool 描述里还写着「Execute a registered workflow in Cortex」
 *    —— **LLM 读得到的那一行** —— 而 shadow 仓的闸完全看不见它）。
 * ⇒ 所以这里把**每个仓的数据**集中登记一次 ⇒ 一个入口扫全部仓。
 *
 * ── 为什么仓清单是**自动发现**的 ──────────────────────────────────
 * 硬编码清单在写下那天就是「已知会漏」⇒ 新建的仓会被静默漏掉。
 * ⇒ 用 `discoverRepos()` 扫工作区根下所有带 `.git` 的目录 ⇒ 新仓自动纳入。
 *
 * ── 豁免的两种分类（判据的核心）────────────────────────────────────
 *   · `contract`（默认）—— **真契约**：改了会坏东西 ⇒ **任何位置**都豁免。
 *   · `history` —— **史证**：改了只抹掉历史、不坏东西
 *     ⇒ **只在注释 / 文档行**豁免；出现在**代码行** ⇒ 判红。
 * ⚠️ 不分类的话，闸会放过真残留（典型：「活 SQL 里还留着旧表名」）。
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** shadow 仓根 */
export const SHADOW_ROOT = resolve(HERE, '..', '..');

/**
 * 自动发现工作区里的所有 git 仓。
 *
 * ⚠️ 为什么不用硬编码名单：名单在写下那天就是「已知会漏」⇒
 *    新建的仓会被静默漏掉（而漏掉的仓里的残留**没人会知道**）。
 *
 * ── ⚠️⚠️ **两种布局都要认**（2026-11 实测踩到）────────────────────
 * 同一份代码在两处跑，两处的**兄弟仓位置不一样**：
 *   · **本地**：shadow 仓在 `<工作区>/shadow` ⇒ 兄弟仓在 **`shadow` 的兄弟目录**
 *     （`C:\Projects\iBLOC\<name>`）。
 *   · **CI**：`actions/checkout` 把 shadow 仓 checkout 到 **GITHUB_WORKSPACE 根**
 *     ⇒ 兄弟仓 checkout 到 **`path: <name>`** ⇒ 落在 **shadow 仓根之下**
 *     （`$GITHUB_WORKSPACE/<name>`）。
 * ⇒ 只认一种布局 ⇒ **另一种布局下扫到 0 个仓却报「全绿」**（假绿）。
 * ⇒ 所以：**两个位置都扫**，取并集。
 *
 * ⚠️ 另外排除两类**假仓**：
 *   · `.git` 是**文件**的（git worktree / submodule）⇒ 不是独立仓
 *     （例：shadow/.verify-wt）。
 *   · **嵌在别的仓里**的第三方仓（例：shadow/benchmark/.tau2 是 τ-Rec 上游仓）
 *     ⇒ 它有自己的 .git 目录 ⇒ 不看层级会被误当成 iBLOC 的仓。
 *     ⇒ ⚠️ 但**只排除 shadow 仓内部的**嵌套 ⇒ 不能拿 shadowRoot 整个当排除前缀
 *     （CI 布局下兄弟仓**就在** shadow 仓根之下 ⇒ 那样会把它们全排掉 ⇒ 扫到 0 个仓
 *     ⇒ **假绿**）。⇒ 所以只排「shadow 仓根之下、且不是 shadow 仓自身的直接子目录」的。
 *
 * @param {string[]} roots 要扫的位置（各自的一层子目录）
 * @param {string} ownerRoot 拥有这些仓的仓根（用于排除它内部的**嵌套**第三方仓）
 * @returns {{name:string, path:string}[]} 按名字排序（去重）
 */
export function discoverRepos(roots, ownerRoot) {
  const seen = new Set();
  const out = [];
  for (const root of roots) {
    if (!root) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = join(root, e.name);
      if (seen.has(p)) continue;
      const gitPath = join(p, '.git');
      if (!existsSync(gitPath)) continue;
      // `.git` 必须是**目录** ⇒ 文件 = worktree/submodule ⇒ 不是独立仓
      let isDir = false;
      try {
        isDir = statSync(gitPath).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      // 嵌在 ownerRoot **更深一层**里的第三方仓 ⇒ 跳过
      // ⚠️ 只排「更深一层」⇒ ownerRoot 的**直接子目录**照常认
      //    （CI 布局下兄弟仓就住在那里 ⇒ 排掉它们就等于假绿）。
      if (ownerRoot) {
        const ownerLower = ownerRoot.toLowerCase() + sep;
        const pLower = p.toLowerCase();
        if (pLower.startsWith(ownerLower)) {
          const rest = pLower.slice(ownerLower.length);
          // rest 里还有分隔符 ⇒ 说明在 ownerRoot 内部**更深一层** ⇒ 跳过
          if (rest.includes(sep)) continue;
        }
      }
      seen.add(p);
      out.push({ name: e.name, path: p });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 兄弟仓可能出现的两个位置（本地布局 / CI 布局）。
 *
 * ⚠️ 本地：shadow 的**兄弟目录**（`<workspace>/<name>`）。
 * ⚠️ CI：shadow 仓根**之下**（`$GITHUB_WORKSPACE/<name>`，因为 shadow 仓
 *    自己 checkout 到了 GITHUB_WORKSPACE 根）。
 */
export function repoSearchRoots(shadowRoot) {
  return [resolve(shadowRoot, '..'), shadowRoot];
}

/**
 * 通用排除项 —— 对所有仓都适用。
 *
 * ⚠️ `docs` 被排除的理由：那是**历史文档 / 审计快照** ⇒
 *    里面出现旧名是**史证**（证据本身不许改）⇒ 不该由活代码闸去判。
 */
export const COMMON_EXCLUDE_DIRS = [
  // ⚠️ 2026-11-11 实测补上 `target-android`（ziti-rust 的 Android 交叉编译产物目录，
  //   那个仓的 .gitignore 第 2 行就写着 /target-android ⇒ ⇒ **未追踪的生成物**）⇒ ⇒
  //   与 target / target-bench / target-acp 同族 ⇒ ⇒ 不该被「顶层对账」当成缺口。
  '.git', 'node_modules', 'target', 'target-bench', 'target-acp', 'target-android',
  'dist', 'build', 'out', '.next', '.turbo',
  'docs', '.idea', '.vscode', '.mimosa', '.zcode', '.ai', '.opencode', '.specify',
];

/** 通用排除文件 —— 各仓的「台账」不许被活代码闸判（它们记得历史） */
const COMMON_EXCLUDE_FILES = ['AGENTS.md', 'CHANGELOG.md'];

/**
 * telencephalon 主仓的豁免清单 —— **telencephalon-verify 直接复用它**（同源同契约）。
 *
 * ⚠️ 为什么复用而不是各写一份：两份清单漂了 ⇒ 一边的闸绿了、另一边还在按旧判据跑
 *    ⇒ 「有闸」变成「有闸，但两把不一样」（本项目的老教训）。
 */
export const TELEPHALON_ALLOWED = [
  {
    token: 'CORTEX_',
    reason: '旧环境变量**前缀**（config::env_var(name, &[fallbacks]) 明确支持回退，新的 TELENCEPHALON_* / TELE_* 优先，并打弃用警告）—— 删了会让老部署直接失效。',
  },
  {
    token: '__cortex_meta_v1__',
    reason: 'A2A 信封的元数据键 —— 线上 wire 契约，别的客户端还在读。',
  },
  {
    token: 'cortex_router',
    reason: '兼容 shim 模块名 telencephalon::boot::cortex_router —— 是**真模块名**，改了就编不过。',
  },
  {
    token: 'from_cortex_id',
    reason: '**wire 字段**（发给仓外视觉 QA 服务的请求体字段）—— 那是**外部服务**的契约，端脑不能单方面改。',
  },
  {
    token: 'X-Cortex-Admin-Token',
    reason: '**wire 头**（发给仓外视觉 QA 服务的 admin 令牌）—— 同上，外部服务在读。',
  },
  {
    token: 'cortex_id',
    reason: 'mDNS TXT 记录里的旧键（2026-09 改名之前发的服务还在用）—— 代码行里是 LEGACY_TXT_KEY_PEER_ID 常量，属真契约。',
  },
  {
    token: 'cortex_lobes',
    kind: 'history',
    reason: '改名史注释里的旧 PG 表名（已 RENAME 成 telencephalon_agents）—— 活代码里只有这一句史证，没有真 SQL。',
  },
  {
    token: 'cortex_wasm_binaries',
    kind: 'history',
    reason: '改名史注释里的旧 PG 表名（已 RENAME 成 telencephalon_wasm_binaries，B sweep 后存海马体）。',
  },
  {
    token: 'cortex_mcp_servers',
    kind: 'history',
    reason: '改名史注释里的旧 PG 表名（已 RENAME 成 telencephalon_mcp_servers，B sweep 后存海马体）。',
  },
  {
    token: 'cortex_video_sources',
    kind: 'history',
    reason: '改名史注释里的旧 PG 表名（已 RENAME 成 telencephalon_video_sources，B2d 后存海马体）。',
  },
  {
    token: 'cortex_trust_store',
    kind: 'history',
    reason: '迁移史注释里的旧表名（已 RENAME 成 telencephalon_trust_store）—— 同一类史证。',
  },
  {
    token: 'cortex →',
    kind: 'history',
    reason: 'README 变更记录里的**改名链**（cortex → encephalon → telencephalon）—— 那是历史证据，抹掉就没法说清「现在为什么叫这个」。',
  },
  {
    token: 'Cerebral Cortex',
    kind: 'history',
    reason: 'README 变更记录里的旧标题原文 —— 同上，历史证据。',
  },
];

/**
 * telencephalon-verify **额外**需要的豁免 —— 因为它的基线比主仓**旧**一代。
 *
 * ⚠️ 这些是**旧基线自己的契约**，不是本轮引入的 ⇒ 登记而不是改名
 *    （改那个仓的源码 = 动另一个会话的工作副本 ⇒ 越权）。
 */
export const TELEPHALON_LEGACY_EXTRA = [
  {
    token: 'boot_cortex',
    reason: '**旧基线自己的函数名前缀**（boot_cortex_with_neuron_url 等）—— verify 仓的 HEAD 比主仓旧一代 ⇒ 那是它的**现状**，本轮不改（它在另一个会话的工作副本里）。',
  },
  {
    token: 'cortex_addr',
    reason: '同上（旧基线的变量名）。',
  },
  {
    token: 'cortex_stream',
    reason: '同上（旧基线的测试函数名）。',
  },
];

/**
 * telencephalon-verify 的**旧基线测试面** —— 那些 tests/ 里的测试名 / .sh 脚本
 * 用的还是「cortex」那一代命名。
 *
 * ⚠️ 为什么登记而不是改名：那个仓是**另一个会话的工作副本**（detached HEAD +
 *    21 个在改的文件）⇒ 改它的源码 = 越权动别人的在飞工作。
 * ⇒ 等那个仓自己把基线并到主仓时，这些豁免自然消失（闸的「防腐烂」判据会抓到）。
 */
export const TELEPHALON_LEGACY_TESTS = [
  {
    token: 'cortex_url',
    reason: '**旧基线测试夹具的字段名**（h.cortex_url 等）—— verify 仓的 tests/ 里沿用旧基线；改它 = 动另一个会话的在飞工作。',
  },
  {
    token: 'cortex_full_app',
    reason: '**旧基线测试函数名**（cortex_full_app_mounts_all_routes 等）—— 同上。',
  },
  {
    token: 'cortex_webrtc',
    reason: '**旧基线测试函数名** —— 同上。',
  },
  {
    token: 'cortex_flow_crud',
    reason: '**旧基线测试函数名** —— 同上。',
  },
  {
    token: 'cortex_a2a_inbound',
    reason: '**旧基线测试函数名** —— 同上。',
  },
  {
    token: 'cortex_api_mod_rs',
    reason: '**旧基线测试函数名** —— 同上。',
  },
  {
    token: 'cortex_lib_does_not',
    reason: '**旧基线测试函数名** —— 同上。',
  },
  {
    token: 'cortex_main_embeds',
    reason: '**旧基线测试函数名** —— 同上。',
  },
  {
    token: 'cortex_listener',
    reason: '**旧基线测试夹具的变量名** —— 同上。',
  },
  {
    token: 'parses_legacy_cortex_txt_key',
    reason: '**旧基线测试函数名**（mDNS 旧键的解析）—— 同上。',
  },
  {
    token: 'cortexClient',
    reason: '**旧基线的客户端类型名**（注释里提到）—— 同上。',
  },
  {
    token: 'CORTEX HEALTH',
    reason: '**旧基线 e2e shell 脚本的输出文案**（tests/e2e_test.sh）—— 同上。',
  },
  {
    token: 'CORTEX LOBE URLS',
    reason: '**旧基线 e2e shell 脚本的输出文案** —— 同上。',
  },
  {
    token: '/api/cortex/',
    reason: '**旧基线 e2e shell 脚本打的老端点路径** —— 那条路由在旧基线里存在 ⇒ 脚本还能跑 ⇒ 改了就把脚本改坏了。',
  },
  {
    token: 'cortexVersion',
    reason: '**旧基线测试的 JSON 字段名**（video_sources_e2e.rs）—— 同上。',
  },
  {
    token: 'Cortex translates',
    reason: '**旧基线测试注释里的旧称**（a2a_gateway.rs）—— 同上。',
  },
  {
    token: 'Tests cortex API',
    reason: '**旧基线 e2e shell 脚本的注释** —— 同上。',
  },
  {
    token: 'Cortex Health',
    reason: '**旧基线 e2e shell 脚本的输出文案** —— 同上。',
  },
  {
    token: 'for cortex e2e tests',
    reason: '**旧基线 fixture 脚本的注释** —— 同上。',
  },
  {
    token: 'the cortex stdio transport',
    reason: '**旧基线 fixture 脚本的注释** —— 同上。',
  },
  {
    token: 'CURRENT CORTEX BEHAVIOUR',
    reason: '**旧基线测试注释里的旧称**（shadow_interaction.rs）—— 同上。',
  },
  {
    token: '- Cortex with the mock temporal',
    reason: '**旧基线测试注释里的旧称**（temporal_webrtc_companion_mode.rs）—— 同上。',
  },
];

/**
 * 各仓的数据。
 *
 * ⚠️ 键是**仓名**（自动发现时的目录名）⇒ 少写一个就是「这个仓没人盯」⇒
 *    入口会打印**没登记的仓**清单（见 check-legacy-residue-all.mjs）⇒ 漏了能一眼看出。
 */
export const REGISTRY = {
  // ── 已经在跑自己那道闸的仓 ⇒ 由它们自己负责（避免同一仓被扫两遍）────
  // shadow / shadow-desktop / shadow-mobile / encephalon：各自仓里有
  // scripts/check-legacy-residue.mjs（薄壳；2026-11-06 改名刀由
  // check-cortex-residue.mjs 改姓）⇒ 本表不重复登记。
  // telencephalon：仍用旧名 scripts/check-cortex-residue.mjs（独立仓未随本刀改）。

  amygdala: {
    scanDirs: ['src', 'tests', 'scripts'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [
      {
        token: 'CORTEX_URL',
        reason: '**旧环境变量名**（新名 TELENCEPHALON_URL 优先）—— 老部署还在用它，删了会让老部署失效。',
      },
      {
        token: 'CORTEX_ADMIN_KEY',
        reason: '**旧环境变量名**（新名 TELENCEPHALON_ADMIN_KEY 优先）—— 同上，老部署兼容。',
      },
      {
        token: '__cortex_meta_v1__',
        reason: '**A2A 信封的旧元数据键** —— 线上 wire 契约，别的客户端还在读。',
      },
    ],
  },

  diencephalon: {
    scanDirs: ['src', 'examples', 'tests', 'scripts'],
    scanFiles: ['README.md', 'Cargo.toml', 'CHANGELOG.md'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    // ⚠️ CHANGELOG.md **要扫**（改名史就在里面 ⇒ 那是史证，不是残留）
    //    ⇒ 这里覆盖掉 COMMON_EXCLUDE_FILES 里的 CHANGELOG.md。
    excludeFiles: COMMON_EXCLUDE_FILES.filter((f) => f !== 'CHANGELOG.md'),
    allowed: [
      {
        token: 'cortex::visual_task',
        kind: 'history',
        reason: '**改名史**：FrameSource trait 当初在旧端脑 crate 的 visual_task 模块里 —— 那是史证（改了只是抹掉历史）。',
      },
      {
        token: 'cortex-internal',
        kind: 'history',
        reason: '**改名史**：README 里「was cortex-internal」说的是「当年是端脑内部 trait」—— 史证。',
      },
    ],
  },

  hippocampus: {
    scanDirs: ['hippocampus-core', 'hippocampus-mcp', 'hippocampus-server', 'hippocampus-storage', 'hippocampus-cli', 'scripts'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS, 'bench', 'benchmarks', 'hippocampus-bench', 'models'],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [
      {
        token: 'cortex_orchestrator',
        reason: '**serde 反序列化别名**（DecisionMaker::TelencephalonOrchestrator）—— 持久化的历史决策用它这个 tag，删了就加载不了旧数据。',
      },
      {
        token: '"cortex"',
        reason: '**decision_maker 的旧拼写值** —— 持久化的历史决策里存的就是它（与上面的 serde alias 同一件事的两面）。',
      },
      {
        token: 'Cortex-Mem',
        reason: '**外部开源项目名**（github.com/sopaco/cortex-mem）—— 与本仓的改名链毫无关系，改了就是把别人的项目名写错。',
      },
      {
        token: 'cortex-mem',
        reason: '同上（README 里 URL 里的小写写法）。',
      },
    ],
  },

  neuron: {
    scanDirs: ['src', 'tests', 'examples', 'scripts'],
    scanFiles: ['README.md', 'Cargo.toml'],
    // ⚠️ models/ **不扫** —— 那是模型权重 / 分词词表（tokenizer.json 里
    //    会出现 'cortex' 这种**普通英文词**，它是 tokenizer 的机械产物，
    //    不是命名残留 ⇒ 扫它只会产出噪声。
    excludeDirs: [...COMMON_EXCLUDE_DIRS, 'models', 'assets', 'benches'],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
  },

  occipital: {
    // ⚠️ 2026-11-04 实测：这个仓**没有 tests/ 目录** ⇒ 写上去的那个 'tests'
    //    是个**指不到任何文件的空目标**（闸会静默跳过）⇒ 拿掉。
    scanDirs: ['src'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [
      {
        token: 'CORTEX_URL',
        reason: '**旧环境变量名**（新名 TELENCEPHALON_URL 优先）—— 老部署还在用它。',
      },
    ],
  },

  parietal: {
    scanDirs: ['src', 'tests'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [
      {
        token: 'CORTEX_URL',
        reason: '**旧环境变量名**（新名 TELENCEPHALON_URL 优先）—— 老部署还在用它。',
      },
    ],
  },

  temporal: {
    // ⚠️ 2026-11-04 实测：这个仓**没有 tests/ 目录** ⇒ 那个 'tests' 是空目标 ⇒ 拿掉。
    //    ⚠️ 'examples' 同样拿掉：那个目录是**本地空目录**（git 不追踪空目录
    //    ⇒ 干净 checkout 里根本没有它）⇒ 写在 scanDirs 里 = 在 CI 上必然扫到 0 个文件。
    scanDirs: ['src'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [
      {
        token: 'CORTEX_URL',
        reason: '**旧环境变量名**（新名 TELENCEPHALON_URL 优先）—— 老部署还在用它。',
      },
    ],
  },

  prefrontal: {
    // ⚠️ 2026-11-04 实测补上：benches/ 里是**真 Rust 代码**（shadow_perf.rs / load_test.rs）。
    scanDirs: ['src', 'tests', 'examples', 'scripts', 'agents', 'skills', 'benches'],
    ignoredTopDirs: [
      {
        dir: 'pf-delta',
        reason: '**本地临时目录**（prefrontal/.gitignore 里列着 ⇒ 未追踪）⇒ 里面是探针用的 test.txt / secret.txt / copy.txt，不是产品代码。',
      },
    ],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
  },

  resonance: {
    // ⚠️ 2026-11-04 实测修：漏了 resonance-desktop/（48 个文件，含 Rust + Tauri）。
    scanDirs: ['engine', 'server', 'web', 'resonance-desktop', 'specs'],
    scanFiles: ['README.md'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS, 'coze-studio'],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
  },

  // ── 以下仓**已确认干净**（2026-11-04 全仓 git grep 命中 0）────────────
  //    登记它们是为了让「未登记」清单为空 ⇒ 缺口看得见 ⇒ 新仓漏登记能立刻发现。
  'agent-memory-benchmark': {
    // ⚠️ 2026-11-04 实测修：原来的 scanDirs 是 ['src','scripts'] ⇒ **ui/ api/ tests/
    //    sdebench/ 四个目录完全没有判据**（实测那些目录 cortex 命中 0 ⇒ 补上不引入误报）。
    //    ⚠️ data/ 与 outputs/ 是**数据集 / 评测产物** ⇒ 不扫（那里面 'cortex' 可能是普通英文词）。
    scanDirs: ['src', 'scripts', 'api', 'tests', 'ui', 'sdebench'],
    scanFiles: ['README.md'],
    ignoredTopDirs: [
      {
        dir: 'data',
        reason: '**数据集**（locomo / babilong 那些 .json.gz）⇒ 不是命名残留，是被测语料本身。',
      },
      {
        dir: 'outputs',
        reason: '**评测产物**（跑出来的结果 json / json.gz）⇒ 生成物，不是源码。',
      },
    ],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
  },
  hengjian: {
    // ⚠️ 2026-11-04 实测修：原来的 ['src','scripts'] 里 **src 根本不存在** ⇒
    //    实际只扫了 scripts/ ⇒ crates/（Rust 代码，67 个文件）与 frontend/（TS/Vue，90 个文件）
    //    **完全没人判** ⇒ 「有闸但漏了」那一族。
    scanDirs: ['crates', 'frontend', 'exam-bank', 'deploy', 'scripts'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
  },
  'ibloc-hr-agent': {
    // ⚠️ 2026-11-04 实测修：漏了 src-tauri/（Rust，81 个文件）与 e2e/（22 个文件）。
    scanDirs: ['src', 'src-tauri', 'e2e', 'scripts'],
    scanFiles: ['README.md'],
    ignoredTopDirs: [
      {
        dir: 'coverage',
        reason: '**覆盖率报告**（vitest 生成的 .html）⇒ 产物，不是源码。',
      },
      {
        dir: 'public',
        reason: '**静态资源**（vite.svg / tauri.svg）⇒ 二进制/图标，没有命名残留可言。',
      },
    ],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
    // ⚠️ **本地仓**：这个仓**没有 origin**（2026-11-04 用已认证的
    //    「gh api repos/iBLOC/ibloc-hr-agent」查过 ⇒ 不存在）⇒ CI 根本检不出来。
    ciCheckout: false,
    ciReason: '本地仓（没有 origin，GitHub 上不存在这个仓）⇒ 只能在本地扫。',
  },
  'ibloc-hr-tools': {
    // ⚠️ 2026-11-04 实测修：漏了 tests/（27）、entrypoints/（22）、chrome-mv3/（12）。
    scanDirs: ['src', 'tests', 'entrypoints', 'chrome-mv3'],
    scanFiles: ['README.md'],
    ignoredTopDirs: [
      {
        dir: 'assets',
        reason: '**静态资源**（react.svg）⇒ 图标，不是源码。',
      },
      {
        dir: 'openspec',
        reason: '**规格文档**（proposal / design / spec）⇒ 与 docs/ 同性质：历史与设计记录。',
      },
      {
        dir: 'public',
        reason: '**静态资源**（svg / png 图标）⇒ 不是源码。',
      },
      {
        dir: 'test-results',
        reason: '**测试产物**（.last-run.json）⇒ 生成物。',
      },
      {
        dir: 'wxt-dev-wxt',
        reason: '**开发构建目录**（wxt dev 生成的副本）⇒ 产物。',
      },
    ],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
    // ⚠️ **不在 GitHub**：这个仓的 origin 是 **gitee.com/iBLOC/ibloc-hr-tools**
    //    ⇒ actions/checkout 只能拉 GitHub ⇒ 检不出来。
    ciCheckout: false,
    ciReason: '宿主在 gitee.com（origin = gitee.com/iBLOC/ibloc-hr-tools）⇒ GitHub 上没有 ⇒ CI 检不出来。',
  },
  'lance-graph': {
    // ⚠️⚠️ 2026-11-04 实测修：原来的 ['src','scripts'] **两个目录都不存在** ⇒
    //    这个仓的闸**扫了 0 个文件**却报「✓ 残留 0 处」⇒ **假绿**（判据对着空气跑）。
    //    ⇒ 真目录是 crates/（Rust，69）+ python/（60）+ examples/（3）+ ci/（2）。
    scanDirs: ['crates', 'python', 'examples', 'ci'],
    scanFiles: ['README.md'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [],
  },

  // ⚠️ telencephalon-verify = telencephalon 仓的**独立 clone**（detached HEAD，
  //    另一个会话的工作副本）⇒ 它的判据**跟着 telencephalon 走**（同源 ⇒ 同契约）。
  //    ⇒ 所以豁免清单**直接复用**主仓那份（不是另抄一份 ⇒ 不会漂）。
  //    ⚠️ 它的基线比主仓**旧**（还留着 boot_cortex_* / cortex_addr 那一代命名）
  //    ⇒ 豁免面比主仓宽 ⇒ 见 TELEPHALON_LEGACY_EXTRA。
  'telencephalon-verify': {
    // ⚠️ 2026-11-04 实测修：漏了 apps/（10 个文件）。
    scanDirs: ['src', 'crates', 'tests', 'apps', 'scripts'],
    scanFiles: ['README.md'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS, 'migrations-legacy'],
    excludeFiles: [...COMMON_EXCLUDE_FILES, 'check-cortex-residue.sh'],
    allowed: [...TELEPHALON_ALLOWED, ...TELEPHALON_LEGACY_EXTRA, ...TELEPHALON_LEGACY_TESTS],
    // ⚠️ **不是独立仓**：它的 origin 是 **iBLOC/telencephalon** ⇒ 它是端脑主仓的
    //    一份 clone（detached HEAD 的旧基线）⇒ GitHub 上**没有** telencephalon-verify
    //    这个仓 ⇒ actions/checkout 检不出来。
    ciCheckout: false,
    ciReason: '它是 iBLOC/telencephalon 的一份 clone（origin 指的是端脑主仓）⇒ GitHub 上没有这个仓名 ⇒ CI 检不出来。',
  },

  synapse: {
    scanDirs: ['src', 'crates', 'tests', 'examples'],
    scanFiles: ['README.md', 'Cargo.toml'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS, 'templates'],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    allowed: [
      {
        token: 'CORTEX_PUBLIC_URL',
        reason: '**旧环境变量名**（新名 TELENCEPHALON_PUBLIC_URL 优先）—— 老部署还在用它。',
      },
    ],
  },

  'ziti-rust': {
    // ⚠️ 2026-11-05：本仓的 v1（`ziti-sdk` 根包）**已删** ⇒ ⇒ 现在只剩
    //    `crates/ziti-v2` ⇒ ⇒ 扫描目标从 ['src','crates','tests','examples']
    //    变成 ['crates']。
    //    ⚠️ 这不是「随手改一下」—— 删 v1 之前的那三个目录**已经不存在**⇒ ⇒
    //    闸会按设计报「扫描目标指不到任何文件 ⇒ 判不了（退出码 2）」⇒ ⇒
    //    跨仓闸当场变红。**指针过期就是缺陷**，不是「顺手清理」。
    scanDirs: ['crates'],
    scanFiles: ['README.md', 'ARCHITECTURE.md', 'Cargo.toml', 'NOTICE', 'LICENSE'],
    excludeDirs: [...COMMON_EXCLUDE_DIRS],
    excludeFiles: [...COMMON_EXCLUDE_FILES],
    // ⚠️ 2026-11-05：原先登记的 `cortex`（旧产品名）豁免**已销账** ——
    //    v1 删掉后，那个「Cargo.toml 注释里的旧产品名」**整条不存在了**⇒ ⇒
    //    留着它就是「登记了却已修好 ⇒ ⇒ 闸会报豁免条目腐烂（退出码 2）」⇒ ⇒
    //    豁免必须**跟着事实**走（NOTICE 也重写过，不再提旧产品名）。
    allowed: [],
    // ✅ 2026-11-05：接进 CI（跨仓 stack job 补了 checkout 步骤；该 job 当时叫
    //    cortex-residue-stack，2026-11-06 改名刀改姓 legacy-residue-stack）⇒ ⇒
    //    本仓不再是「CI 上检不出」的那一格 ⇒ ⇒ 缺口销账。
    ciCheckout: true,
  },
};

/** 已经在跑自己那道闸的仓（由它们自己的薄壳 + 自己的 CI 负责） */
export const SELF_OWNED = new Set([
  'shadow',
  'telencephalon',
  'encephalon',
]);

/**
 * **CI 检出不了**的仓（本地仓 / 不在 GitHub / 只是某个仓的 clone）。
 *
 * ⚠️ 为什么要有这一类：CI 的 checkout 清单**不能照注册表机械补全**。
 *   2026-11-04 实测：这三个仓用**已认证的** `gh api repos/iBLOC/<name>` 查过 ⇒ 不存在：
 *     · ibloc-hr-agent —— **没有 origin**（纯本地仓）；
 *     · ibloc-hr-tools —— origin 指向 **gitee.com**；
 *     · telencephalon-verify —— origin 指向 **iBLOC/telencephalon**（它是端脑的 clone）。
 *   ⇒ 照注册表补 checkout ⇒ CI 直接**失败在 checkout 步骤**（而不是闸红）。
 *   ⇒ 而**无 token 时的 404 不能当判据**（私有仓也是 404）⇒ 必须用认证过的 API 查。
 */
export const LOCAL_ONLY = Object.fromEntries(
  Object.keys(REGISTRY)
    .filter((n) => REGISTRY[n].ciCheckout === false)
    .map((n) => [n, REGISTRY[n].ciReason || '（未写原因）'])
);

/**
 * CI **必须 checkout** 的仓清单（跨仓闸在 CI 上要扫的那些）。
 *
 * ⚠️ 这是**唯一一份**清单 ⇒ shadow 的 ci.yml 里的 checkout 步骤与它对账
 *    （见 check-cortex-residue-all.mjs 的「CI 清单对账」那一段）⇒
 *    **YAML 少检一个仓 ⇒ 闸自己报红**（而不是 CI 悄悄少扫一半）。
 * ⚠️ SELF_OWNED 的三个仓**不在这里** —— 它们各自的仓里有自己的残留闸 job
 *    （2026-11-04 实测：telencephalon/.github/workflows/ci.yml:711 与
 *    encephalon/.github/workflows/ci.yml:491 各有一个；job 与闸文件在
 *    2026-11-06 改名刀由 cortex-residue 改姓 legacy-residue）⇒ 不重复检出。
 */
export const CI_CHECKOUT = Object.keys(REGISTRY)
  .filter((n) => !SELF_OWNED.has(n) && REGISTRY[n].ciCheckout !== false)
  .sort();
