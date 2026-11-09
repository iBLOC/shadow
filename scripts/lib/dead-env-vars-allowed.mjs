#!/usr/bin/env node
/**
 * **死环境变量闸 —— 真契约登记簿**（**数据**，不是判据）。
 * ============================================================================
 *
 * ## 它为什么从 CLI 入口里搬出来
 *
 * 登记簿是**数据**（哪些变量的读者在本仓之外），判据在 scripts/lib/dead-env-vars.mjs。
 * 两把闸（**工作树面** 与 **提交树面**）必须读**同一份**登记簿
 * 否则「两个面的读数不同」可能是**登记簿不同**而不是**内容不同**
 * 通用形态：**同一族判据/数据只保留一处实现，第二处会漂**。
 *
 * 注意：它**不能**从 CLI 入口 import 那个文件 —— 那个文件有**顶层执行代码**
 * import 它会**把整把闸跑起来**，所以登记簿必须住在 lib 层。
 *
 * ## 登记不等于认可
 *
 * 每条都写清「谁读它」；kind 为 legacy 的是**存量债**，放行但**必须打印**。
 */
/**
 * 真契约 —— **有读者，但读者在本仓之外**（别的仓 / 别的进程 / 运行时自己）。
 * ⚠️ 每条都要写清「谁读它」⇒ ⇒ 否则登记就变成垃圾桶。
 *
 * ⚠️ 为什么这份清单这么长：环境变量里**绝大多数是运行时自己的**（GitHub 注入的
 *    十几个、系统的一堆、工具链的一堆）⇒ ⇒ 它们在**代码里**找不到读者
 *    ⇒ ⇒ 但它们**有读者**（GitHub 自己 / 操作系统 / 工具链自己）。
 * ⇒ ⇒ 这不是「豁免」，是「**读者不在本仓的文本里**」这一事实的登记。
 */
export const RUNTIME_READERS = [
  'GITHUB_ACTIONS', 'CI', 'RUNNER_TEMP', 'GITHUB_WORKSPACE', 'GITHUB_OUTPUT',
  'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_HEAD_REF',
  'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_JOB', 'GITHUB_ACTOR',
  'GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_SERVER_URL',
  'GITHUB_API_URL', 'GITHUB_GRAPHQL_URL', 'GITHUB_WORKSPACE_ID',
  'GITHUB_WORKFLOW', 'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA',
  'GITHUB_ACTION_REPOSITORY', 'GITHUB_ACTION_PATH',
  'GITHUB_ACTION_REPOSITORY_PATH', 'GITHUB_STEP_SUMMARY', 'GITHUB_TOKEN',
  'HOME', 'PATH', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'APPDATA',
  'LOCALAPPDATA', 'COMSPEC', 'SYSTEMROOT', 'WINDIR', 'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS', 'PROGRAMFILES', 'PROGRAMFILES_X86', 'PROGRAMDATA',
  'HOMEDRIVE', 'HOMEPATH', 'LANG', 'LC_ALL', 'SHELL', 'USERNAME', 'PWD',
  'OLDPWD', 'PSModulePath', 'PATHEXT',
  'PYTHONPATH', 'PYTHONUTF8', 'PYTHONIOENCODING', 'VIRTUAL_ENV',
  'NODE_OPTIONS', 'NODE_ENV', 'NPM_CONFIG_CACHE',
  'CARGO_HOME', 'RUSTUP_HOME', 'RUSTFLAGS', 'CARGO_TERM_COLOR',
  'CARGO_TERM_PROGRESS_WHEN', 'CARGO_BUILD_TARGET', 'CARGO_TARGET_DIR',
  'RUSTUP_TOOLCHAIN', 'RUSTUP_DIST_SERVER', 'RUSTUP_UPDATE_ROOT',
  'RUST_BACKTRACE', 'RUST_LOG', 'RUST_MIN_STACK', 'RUST_TEST_THREADS',
  'RUSTDOCFLAGS', 'RUSTC_WRAPPER',
  'SOURCE_DATE_EPOCH', 'MAKEFLAGS', 'MAKELEVEL', 'CC', 'CXX', 'AR', 'LD',
  'PKG_CONFIG_PATH', 'GH_TOKEN', 'GH_REPO', 'SSH_AUTH_SOCK', 'GIT_DIR', 'GIT_WORK_TREE',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL', 'PLAYWRIGHT_BROWSERS_PATH', 'DISPLAY',
  'JAVA_HOME', 'GRADLE_OPTS', 'ANDROID_HOME', 'ANDROID_SDK_ROOT',
  'FLUTTER_ROOT', 'PUB_CACHE', 'PUB_HOSTED_URL', 'FLUTTER_STORAGE_BASE_URL',
  'DART_SDK', 'CHROME_EXECUTABLE', 'PLATFORM', 'TERM',
  // ⚠️ **`NO_COLOR`**：读者是**测试工具链自己** —— vitest 用的 `tinyrainbow` /
  //    `picocolors`、Dart 的 `test_core`（`io.dart`）都读这个变量名
  //    ⇒ ⇒ ⇒ **它在本仓文本里找不到读者**（那些包在 `node_modules` 与
  //    pub cache 里 ⇒ ⇒ **不在闸的扫描面内**）⇒ ⇒ 登记的是「这个事实」。
  //    ⚠️ 为什么不是「删掉它就完了」：`flutter test` 的摘要行由 `test_core`
  //    打颜色码 ⇒ ⇒ 而剥码那条 `sed` 只剥 `ESC[...m` / `ESC[...K` **两种**形态
  //    ⇒ ⇒ `ESC[?25l`（光标隐藏）与 `ESC]8;;…`（OSC 超链接）**剥不掉**
  //    ⇒ ⇒ 颜色码混进读数 ⇒ ⇒ `grep` 可能匹配不上 ⇒ ⇒ ⇒ 从**源头**关颜色才是对的。
  'NO_COLOR',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME',
  // ⚠️ cargo 的配置环境变量（cargo 自己读 ⇒ ⇒ 本仓文本里永远找不到读者）：
  //    cargo 支持 CARGO_PROFILE_<profile>_<key> 与 CARGO_INCREMENTAL。
  'CARGO_PROFILE_DEV_DEBUG', 'CARGO_PROFILE_TEST_DEBUG', 'CARGO_INCREMENTAL',
  //    release 档同理（发布流水线用它压掉产物体积）。
  'CARGO_PROFILE_RELEASE_DEBUG',
  // ⚠️ west / Zephyr 构建链自己读（shadow-esp32 的 CI 设了它们）：
  'ZEPHYR_BASE', 'WEST_USER_DATA',
];

/** 读者是**兄弟仓的进程**（端脑 / 大脑 / 海马体 / neuron）—— 本仓不读它们。 */
export const SIBLING_PROCESS_READERS = [
  'NEURON_PORT', 'NEURON_DEFAULT_SOURCE',
  'TELENCEPHALON_URL', 'TELENCEPHALON_ADMIN_KEY', 'TELENCEPHALON_PUBLIC_URL',
  'TELE_PORT', 'TELE_SKIP_NEURON',
  // 端脑 boot.rs:235 读 TELENCEPHALON_CONFIG（另有一个旧名兼容）
  // ⇒ ⇒ 桌面端 tauri-e2e 造的 telencephalon.yaml 就靠它被端脑读到
  // ⇒ ⇒ **这是 2026-11-05 修掉的那条改名链漏改的落点**。
  'TELENCEPHALON_CONFIG',
  // ⚠️ 旧名的兼容别名（桌面端 admin_token.rs / logger.rs 读它们）**不登记**：
  //    它们在本仓**从来没有被设置过** ⇒ ⇒ 登记它们对判据没有任何作用
  //    ⇒ ⇒ 反而会把这道闸的源码染上旧产品名 ⇒ ⇒ 与残留闸互咬。
  'ENCEPHALON_BRAIN_PORT', 'ENCEPHALON_DEFAULT_MODEL', 'ENCEPHALON_LOBE_MODELS',
  'HIPPOCAMPUS_INMEMORY_ONLY', 'HIPPOCAMPUS_DATA_DIR', 'LANCE_URI',
  'DATASOURCE_URL',
];

/** 读者是**宿主应用 / 桌面端二进制**（不在本仓的 JS/TS 文本里）。 */
export const HOST_READERS = [
  'SHADOW_COMPUTER_USE_ENABLED',
  'FEISHU_ENABLED', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_DEFAULT_USER_EMAIL',
  'TAURI_TEST_NO_SINGLE_INSTANCE',
];

/** benchmark 驱动（Rust 侧）读的。 */
export const BENCH_READERS = [
  'SHADOW_BENCH_WDIO_URL', 'SHADOW_BENCH_APP_URL',
  'SHADOW_BENCH_JUDGE_BASE_URL', 'SHADOW_BENCH_JUDGE_KEY', 'SHADOW_BENCH_JUDGE_MODEL',
  'SHADOW_BENCH_ANTHROPIC_KEY', 'SHADOW_BENCH_OPENAI_KEY', 'SHADOW_BENCH_ZHIPU_KEY',
  'SHADOW_BENCH_DASHSCOPE_KEY',
];

/** 本仓内 e2e 读的（**会在扫描范围里被读到**⇒ ⇒ 其实不用登记；但 AGENTS.md 也写了）。 */
export const LOCAL_TEST_READERS = [
  'SHADOW_TEST_DATA_DIR', 'SHADOW_TEST_ADMIN_TOKEN', 'SHADOW_API_TESTS_STRICT',
  'SHADOW_TAURI_TEST_DIR',
];


/**
 * ── 存量债（2026-11-05 实测后登记）──────────────────────────────
 *
 * ⚠️ 这些是**旧架构时代**的环境变量名（叶区各有自己的 host ⇒ 端脑统一后
 *    它们失去了读者）⇒ ⇒ 登记为**真契约**（给兄弟仓 / 宿主用）或**待清理**。
 *
 * ⚠️ 登记 ≠ 认可。AGENTS.md:1624 已经明写：
 *   「旧的 RESONANCE_HOST / PREFRONTAL_HOST / HIPPOCAMPUS_HOST / PREFRONTAL_MODE
 *    / SHADOW_ID / MTLS_*_PATH 在 shadow 代码里**没有任何消费方**」
 *   ⇒ ⇒ 本闸**实测印证**了那条记载（不是抄的）。
 * ⇒ ⇒ 什么时候修：等这些变量的最后读者（端脑 / synapse / 宿主）也摘掉。
 */
export const LEGACY_LEAF_HOSTS = [
  'HIPPOCAMPUS_HOST',
  'PREFRONTAL_HOST',
  'RESONANCE_HOST',
  'VITE_HIPPOCAMPUS_HOST',
  'VITE_PREFRONTAL_HOST',
  'VITE_RESONANCE_HOST',
  'PREFRONTAL_MODE',
  'SHADOW_ID',
];

export const MODEL_TOKEN_VARS = ['HF_TOKEN', 'MODELSCOPE_TOKEN'];

export const ALLOWED = [
  ...RUNTIME_READERS.map((name) => ({
    name,
    reason: '**读者是运行时 / 工具链自己**（GitHub Actions / 操作系统 / 构建工具）'
      + '=> => 它的读者不在本仓的文本里 => => 登记的是「这个事实」，不是「豁免」。',
  })),
  ...SIBLING_PROCESS_READERS.map((name) => ({
    name,
    reason: '**读者是兄弟仓的进程**（端脑 / 大脑 / 海马体 / neuron）'
      + '=> => 本仓不读它 => => 改它要改兄弟仓 => => 跨仓契约。',
  })),
  ...HOST_READERS.map((name) => ({
    name,
    reason: '**读者是宿主应用 / 桌面端二进制**（不在本仓的 JS/TS 文本里）。',
  })),
  ...BENCH_READERS.map((name) => ({
    name,
    reason: '**读者是 benchmark 驱动（Rust 侧）** => => 本仓不读它。',
  })),
  ...LOCAL_TEST_READERS.map((name) => ({
    name,
    reason: '**读者在本仓的 e2e 里**（shadow-desktop/tests/…）=> => 扫描范围覆盖到 => => 登记只是备份。',
  })),
  ...LEGACY_LEAF_HOSTS.map((name) => ({
    name,
    kind: 'legacy',
    reason:
      '**旧架构时代的叶区主机名**（端脑统一前每个叶区各有自己的 host）'
      + '=> => 本仓已无读者（AGENTS.md:1624 明写「没有任何消费方」）'
      + '=> => 但端脑 / synapse / 桌面端**还在读它的新名字**（HIPPOCAMPUS_HOST'
      + ' 仍是 synapse 的 hippo_target 优先级之一）'
      + '=> => **存量债**：等最后一位读者摘掉它再删。',
  })),
  ...MODEL_TOKEN_VARS.map((name) => ({
    name,
    kind: 'legacy',
    reason:
      '**模型仓库令牌**（HF_TOKEN / MODELSCOPE_TOKEN）—— 文档（AGENTS.md）让用户 export，'
      + '但本仓代码里**没有读者**（桌面端只在 HfTokenSettings.tsx 的**注释**里提到它会被'
      + '转发给端脑 ⇒ => 真正的读者在**端脑那个仓**里）'
      + '=> => **存量债**：等端脑侧确认了转发链再决定去留。',
  })),
];