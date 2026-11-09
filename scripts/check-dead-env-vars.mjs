#!/usr/bin/env node
/**
 * 死环境变量闸 —— **死变量 / 改名漂移**
 * ============================================================================
 *
 * 判据（算法）在 ./lib/dead-env-vars.mjs（纯函数）⇒ 这里只有**数据**：
 * 扫哪些文件、哪些变量是**真契约**（给外部消费者用的）。
 *
 * ── 为什么需要这道闸 ────────────────────────────────────────────
 * 2026-11-05 实测：CI 的 e2e step 设了两个环境变量指向端脑二进制，
 * 但读取端（shadow-desktop/tests/e2e-ui/global-setup.ts）在改名链里
 * **已经换成了新名字** ⇒ ⇒ 那两个变量**一个读者都没有** ⇒ ⇒ CI 里 e2e
 * 安静地走了「端脑起不来 ⇒ 规格自跳过」那条分支 ⇒ ⇒ **绿灯但什么都没测**。
 * ⇒ ⇒ 而且**词级残留闸看不见它**（新名字里没有旧产品名那个词）。
 * ⇒ ⇒ 所以要有这道**按「变量有没有读者」判**的闸。
 *
 * ⚠️ **源码里不写任何旧产品名**（2026-11-05 实测踩到）：写进去 ⇒ ⇒
 *    「旧词残留闸」会把本文件判红 ⇒ ⇒ **两道闸互咬** ⇒ ⇒ 闸的源码
 *    必须与它要守的旧词**无关** ⇒ ⇒ 这样它才是**通用**的改名链检测器。
 *
 * 用法（从 shadow 仓根跑）：
 *   node scripts/check-dead-env-vars.mjs             # 主流程
 *   node scripts/check-dead-env-vars.mjs --self-test # 自检
 *
 * 退出码：0 = 绿 / 1 = 有死变量或改名漂移 / 2 = 判不了（没扫到文件）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  findEnvSets, findEnvReads, checkDeadEnvVars, deadEnvSelfTest,
} from './lib/dead-env-vars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 扫描范围：**设置端**与**读取端**都要看。
 * ⚠️ 两边都得看 ⇒ ⇒ 死变量才会暴露（只看设置端 ⇒ 无从知道有没有读者）。
 */
const SCAN_DIRS = ['scripts', 'shadow-desktop', 'shadow-mobile', 'shadow-esp32', 'benchmark', '.github'];
const SCAN_FILES = [
  'AGENTS.md', 'README.md', 'ARCHITECTURE.md', 'agent-surface.json',
  'benchmark/.env.example',
];
const EXCLUDE_DIRS = [
  'node_modules', '.git', 'target', 'dist', 'build', 'out',
  'docs', 'playwright-report', 'test-results', 'reports', 'runs-task7-traj',
];
const EXCLUDE_FILES = [
  'pnpm-lock.yaml', 'package-lock.json', 'pubspec.lock', '.metadata',
  // ⚠️ 闸**自己**的两个文件 —— 它们**必然**含有它要认的那些形状
  //    （文档里的示例：`export NAME=…` / `NAME: value`）⇒ ⇒ 自己扫自己
  //    ⇒ ⇒ 会把自己的**文档**判成「设了没人读的环境变量」⇒ ⇒ 白报。
  //    ⇒ ⇒ 与残留闸同一套做法（它也排除自己的文件：闸当然知道那个词）。
  'scripts/check-dead-env-vars.mjs',
  'scripts/lib/dead-env-vars.mjs',
];

/**
 * 真契约 —— **有读者，但读者在本仓之外**（别的仓 / 别的进程 / 运行时自己）。
 * ⚠️ 每条都要写清「谁读它」⇒ ⇒ 否则登记就变成垃圾桶。
 *
 * ⚠️ 为什么这份清单这么长：环境变量里**绝大多数是运行时自己的**（GitHub 注入的
 *    十几个、系统的一堆、工具链的一堆）⇒ ⇒ 它们在**代码里**找不到读者
 *    ⇒ ⇒ 但它们**有读者**（GitHub 自己 / 操作系统 / 工具链自己）。
 * ⇒ ⇒ 这不是「豁免」，是「**读者不在本仓的文本里**」这一事实的登记。
 */
const RUNTIME_READERS = [
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
const SIBLING_PROCESS_READERS = [
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
const HOST_READERS = [
  'SHADOW_COMPUTER_USE_ENABLED',
  'FEISHU_ENABLED', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_DEFAULT_USER_EMAIL',
  'TAURI_TEST_NO_SINGLE_INSTANCE',
];

/** benchmark 驱动（Rust 侧）读的。 */
const BENCH_READERS = [
  'SHADOW_BENCH_WDIO_URL', 'SHADOW_BENCH_APP_URL',
  'SHADOW_BENCH_JUDGE_BASE_URL', 'SHADOW_BENCH_JUDGE_KEY', 'SHADOW_BENCH_JUDGE_MODEL',
  'SHADOW_BENCH_ANTHROPIC_KEY', 'SHADOW_BENCH_OPENAI_KEY', 'SHADOW_BENCH_ZHIPU_KEY',
  'SHADOW_BENCH_DASHSCOPE_KEY',
];

/** 本仓内 e2e 读的（**会在扫描范围里被读到**⇒ ⇒ 其实不用登记；但 AGENTS.md 也写了）。 */
const LOCAL_TEST_READERS = [
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
const LEGACY_LEAF_HOSTS = [
  'HIPPOCAMPUS_HOST',
  'PREFRONTAL_HOST',
  'RESONANCE_HOST',
  'VITE_HIPPOCAMPUS_HOST',
  'VITE_PREFRONTAL_HOST',
  'VITE_RESONANCE_HOST',
  'PREFRONTAL_MODE',
  'SHADOW_ID',
];

const MODEL_TOKEN_VARS = ['HF_TOKEN', 'MODELSCOPE_TOKEN'];

const ALLOWED = [
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

/**
 * 列出**受版本控制**的文本文件。
 *
 * （说明见下）
 */
function listTrackedFiles() {
  let out;
  try {
    // ⚠️ **--cached --others --exclude-standard**（2026-11-05 实测踩到）：
    //    只用 `git ls-files` ⇒ ⇒ 只看**已提交**的文件 ⇒ ⇒ **新写的代码在提交前
    //    闸根本看不见**（本轮实测：闸自己就是在提交那一刻才开始看见自己）
    //    ⇒ ⇒ 那个「提交前先跑一遍闸」的用法**根本不成立** ⇒ ⇒ 闸是恒绿的。
    //    ⇒ ⇒ 加上 --others（未跟踪但**未被忽略**）⇒ ⇒ 提交前也能判。
    //    ⇒ ⇒ --exclude-standard 保证 .gitignore 里的本地目录（.local/ 等）不进范围。
    const res = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (res.status !== 0 || !res.stdout) {
      return { files: [], gitOk: false, reason: 'git ls-files 失败（退出码 ' + res.status + '）' };
    }
    out = res.stdout.split('\0').filter(Boolean);
  } catch (e) {
    return { files: [], gitOk: false, reason: 'git 不可用：' + (e && e.message) };
  }

  const files = [];
  for (const rel of out) {
    const norm = rel.replace(/\\/g, '/');
    if (EXCLUDE_FILES.includes(norm)) continue;
    if (norm.split('/').some((seg) => EXCLUDE_DIRS.includes(seg))) continue;
    const p = join(ROOT, rel);
    try {
      const st = statSync(p);
      if (st.size > 4 * 1024 * 1024) continue;
      const buf = readFileSync(p);
      if (buf.subarray(0, 8192).includes(0)) continue;
      files.push(p);
    } catch { /* 跟踪了但本地没有（稀疏检出 / 子模块）⇒ 跳过 */ }
  }
  return { files, gitOk: true, reason: '' };
}

function collect() {
  const { files, gitOk, reason } = listTrackedFiles();
  const sets = [];
  const reads = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(ROOT, f).split(sep).join('/');
    for (const s of findEnvSets(text, rel)) sets.push({ ...s, file: rel });
    for (const r of findEnvReads(text, rel)) reads.push({ ...r, file: rel });
  }
  return { sets, reads, fileCount: files.length, gitOk, reason };
}

const line = '='.repeat(72);

if (process.argv.includes('--self-test')) {
  console.log(line);
  console.log('死环境变量闸 —— 自检');
  console.log(line);
  const r = deadEnvSelfTest();
  console.log(r.out);
  console.log('');
  console.log(r.code === 0 ? '✓ 自检全绿（' + r.total + '/' + r.total + '）' : '✗ 自检有红（' + r.fails + '/' + r.total + '）');
  process.exit(r.code);
}

console.log(line);
console.log('死环境变量闸 —— 死变量 / 改名漂移');
console.log(line);

const { sets, reads, fileCount, gitOk, reason } = collect();

if (!gitOk) {
  console.error('✗ git ls-files 失败 ⇒ ⇒ 判不了（不是绿）⇒ ⇒ 退出码 2。');
  console.error('  ⇒ ' + reason);
  process.exit(2);
}

if (fileCount === 0) {
  console.error('✗ 一个文件都没扫到 ⇒ ⇒ 判不了（不是绿）⇒ ⇒ 退出码 2。');
  console.error('  ⇒ 查 git 跟踪的文件（仓改名了 / 稀疏检出 / 过滤器不对）。');
  process.exit(2);
}

const res = checkDeadEnvVars({ sets, reads, allowed: ALLOWED });

console.log('');
console.log('▶ 覆盖面');
console.log('  · 扫了 ' + fileCount + ' 个文件');
console.log('  · 设置端 ' + sets.length + ' 处 / 读取端 ' + reads.length + ' 处');
console.log('  · 读者名字（去重后）' + res.readNames.length + ' 个');

if (res.legacy.length > 0) {
  console.log('');
  console.log('· 已登记的**存量债**（放行但仍要打印 —— 登记不是认可）:');
  for (const l of res.legacy) {
    console.log('  · ' + l.name + '  —— ' + l.file);
  }
}

if (res.dead.length === 0 && res.drift.length === 0) {
  console.log('');
  console.log('✓ 零死变量、零改名漂移');
  console.log(line);
  process.exit(0);
}

let failed = 0;

if (res.drift.length > 0) {
  console.log('');
  console.log('✗ 改名漂移（设置端与读取端用了不同的名字 ⇒ ⇒ 设置端那个没人读）:');
  for (const d of res.drift) {
    console.log('  · ' + d.set + '  ⇒ 读者读的是 ' + d.read);
    console.log('    设置位置: ' + d.file + '（尾部族名 ' + d.family + '）');
  }
  console.log('');
  console.log('  ⇒ ⇒ 这就是**改名链漏改**：读者早就换成新名字了 ⇒ ⇒ 设的旧名字**没有读者**');
  console.log('    ⇒ ⇒ 它的本意（那个 override）**从来没生效过** ⇒ ⇒ 失败长得像成功。');
  console.log('  ⇒ ⇒ 修法：把设置端改成与读者同名；或若它确实是真契约 ⇒ 登记进 ALLOWED。');
  failed++;
}

if (res.dead.length > 0) {
  console.log('');
  console.log('✗ 死环境变量（设了但全仓没有任何读者）:');
  for (const d of res.dead) {
    console.log('  · ' + d.name + '  —— ' + d.file);
  }
  console.log('');
  console.log('  ⇒ ⇒ 没人读的变量 = 改名链漏改的化石，或拼错了 ⇒ ⇒ 两种都不该留着。');
  console.log('  ⇒ ⇒ 修法：删掉它，或登记进 ALLOWED（写清谁读它）。');
  failed++;
}

console.log(line);
process.exit(failed > 0 ? 1 : 0);
