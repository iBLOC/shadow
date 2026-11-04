#!/usr/bin/env node
/**
 * Cortex 残留闸 —— **统一入口**（shadow 仓）
 *
 * 三个范围各有自己的**数据**（扫哪些目录 ＋ 哪些 token 豁免）⇒ 但**判据只有一处**
 * （`scripts/lib/cortex-residue.mjs`）⇒ 三边不会漂。
 *
 * ⚠️ 第四个范围是**跨仓**的（scripts/check-cortex-residue-all.mjs）——
 *    iBLOC 这套栈是十几个独立 git 仓 ⇒ 只守本仓 ⇒ 另外那些仓没人盯。
 *
 * 用法（从 shadow 仓根跑）：
 *   node scripts/check-cortex-residue.mjs             # 主流程
 *   node scripts/check-cortex-residue.mjs --self-test # 自检
 *
 * 退出码：0 = 三边都干净 / 1 = 有残留 / 2 = 判不了（豁免条目腐烂）
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runGate, runSelfTest } from './lib/cortex-residue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUB = [
  { script: 'shadow-desktop/scripts/check-cortex-residue.mjs', what: '桌面端（src / src-tauri / tests / scripts）' },
  { script: 'shadow-mobile/scripts/check-cortex-residue.mjs', what: '移动端（lib / test / android / scripts）' },
  // ⚠️ **跨仓闸** —— iBLOC 这套栈是十几个独立 git 仓 ⇒ 只守 shadow 仓
  //    ⇒ 另外那些仓没人盯（2026-11 实测：prefrontal 的 tool 描述里还写着
  //    「Execute a registered workflow in Cortex」—— **LLM 读得到的那一行**）。
  // ⇒ ⇒ 这一项把**所有兄弟仓**也纳管进来（判据只有一份 ⇒ 各仓只提供数据）。
  { script: 'scripts/check-cortex-residue-all.mjs', what: '跨仓（工作区里所有 iBLOC 仓）' },
];

/** 根仓自己的范围：脚本目录 ＋ 能力清单 ＋ fixtures */
const ROOT_OPTS = {
  root: ROOT,
  label: 'shadow（仓根）',
  // ⚠️ **覆盖面本身就是被测对象** —— 2026-11 实测发现两个漏网：
  //    ① benchmark/（164 个追踪文件）② shadow-esp32/（固件代码 + 文档）
  //    ⇒ 它们**不在**旧清单里 ⇒ 闸报「全绿」而它们其实没人看。
  // ⇒ ⇒ 现在显式纳入（shadow-desktop / shadow-mobile 由各自的薄壳负责）。
  scanDirs: ['scripts', 'benchmark/src', 'benchmark/tests', 'benchmark/tools', 'benchmark/suites',
             'shadow-esp32/app', 'shadow-esp32/tools'],
  scanFiles: ['agent-surface.json', 'benchmark/README.md', 'shadow-esp32/README.md'],
  excludeDirs: [
    'node_modules', '.git', 'target', 'dist', 'build', 'docs',
    // ⚠️ benchmark/ 下有 **100+ 个 reports*/runs*/target*** 目录（评测产物）
    //    ⇒ 不排除的话闸会扫几万份产物报告 ⇒ 慢且噪声大。
    'reports', 'reports-agentic-probe', 'reports-behavior-subject', 'reports-brain-main',
    'reports-brain-qwen06', 'reports-brain-qwen06-fixed', 'reports-brain-traced',
    'reports-browser-smoke', 'reports-cost', 'reports-delta-fileloop', 'reports-delta-first',
    'reports-delta-toolloop', 'reports-desktop-behavior', 'reports-desktop-full',
    'reports-desktop-full-t600', 'reports-desktop-postfix', 'reports-desktop-probe',
    'reports-desktop-sql-repro', 'reports-desktop-v3', 'reports-desktop-v4',
    'reports-ds-cut', 'reports-final', 'reports-gaia-free4', 'reports-gaia-free4-t900',
    'reports-gaia-mimo', 'reports-gaia-native', 'reports-gaia-native-v2', 'reports-gaia-web',
    'reports-gaia50', 'reports-glm5', 'reports-longctx', 'reports-mimo', 'reports-new',
    'reports-no-prior', 'reports-oneshot-probe', 'reports-parity', 'reports-parity-native',
    'reports-prior-debug', 'reports-prior-final', 'reports-prior-main', 'reports-prior-multi',
    'reports-prior-rate', 'reports-round10', 'reports-round11', 'reports-round12',
    'reports-round13', 'reports-round14', 'reports-round2', 'reports-round3',
    'reports-round4', 'reports-round5', 'reports-round6', 'reports-round7', 'reports-round9',
    'reports-rulesmoke', 'reports-scorer-fixed', 'reports-swe-50', 'reports-swe-50-all',
    'reports-swe-50-posix', 'reports-swe-agentic', 'reports-swe-budget', 'reports-swe-gold',
    'reports-swe-gold-postclean', 'reports-swe-loop', 'reports-swe-mimo', 'reports-swe-r3-v2',
    'reports-swe50', 'reports-swe50-r3', 'reports-task7-traj', 'reports-tau2-addendum',
    'reports-tau2-addendum-v2', 'reports-tau2-free3', 'reports-tau2-mimo', 'reports-tau2-mimo-t900',
    'reports-tau2-native', 'reports-tau2-native-v2', 'reports-tau2-qwen38', 'reports-tau2-r2',
    'reports-tau2-r3', 'reports-tau2-v3', 'reports-tau2-verify', 'reports-tau2-wired',
    'reports-tb-budget', 'reports-tb-ds-after-cut', 'reports-tb-ds-baseline', 'reports-tb-glm53',
    'reports-tb-mimo', 'reports-tb-native', 'reports-tb-native-v2', 'reports-tb-plan',
    'reports-tool-loop-v13', 'reports-traced-release', 'reports-traced-smoke', 'reports-usage-check',
    'runs-task7-traj', 'runs-tau2-v3-traj', 'target-prior', 'target-scorer', 'target-trace',
  ],
  excludeFiles: [
    'check-cortex-residue.mjs',  // 闸自己
    'cortex-residue.mjs',         // 引擎自己（它当然知道这个词）
    // ⚠️ 跨仓闸的两个文件 —— 它们**当然**知道这个词（它们就是守这个概念的）
    //    ⇒ 必须显式排除，否则闸会把自己判红。
    'check-cortex-residue-all.mjs',
    'cortex-registry.mjs',
  ],
  allowed: [
    {
      token: 'desktop-no-cortex-bypass',
      reason: '闸的**规则 ID**（check-brain-chain.mjs）—— docs/superpowers/architecture/2026-10-29-brain-chain.md 逐条列了它们 ⇒ 改 ID 就等于让那份历史文档失效（历史文档不许改）。',
    },
    {
      token: 'desktop-sidecar-mounts-cortex',
      reason: '同上（闸的规则 ID）。',
    },
    {
      token: 'mobile-chat-through-cortex',
      reason: '同上（闸的规则 ID）。',
    },
    {
      token: 'cortex-status',
      reason: '桌面端路由路径 /cortex-status（内部 URL，不出现在界面上）。能力清单正在被别的会话改，本轮不动它。',
    },
    {
      token: '2026-08-16-cortex-data-channel-device-router.md',
      kind: 'history',
      reason: '**历史文档的文件名**（docs/implementation-notes/ 下那份实现记录）—— 改名会断掉所有指向它的链接 ⇒ 史证，不许改。',
    },
    {
      token: 'CONFIG_SHADOW_CORTEX_HOST',
      kind: 'history',
      reason: '**旧 Kconfig 配置项名**（2026-08-16 的变更记录里提到它）—— 活代码里已改成 CONFIG_SHADOW_TELENCEPHALON_HOST ⇒ 这里只是**变更记录里的历史证据**。',
    },
    {
      token: '发给 cortex + Answer 解析',
      kind: 'history',
      reason: '**变更记录里的旧称**（2026-08-16 的 v0.7 里程碑描述）—— 史证，不许改。',
    },
  ],
};

const line = '═'.repeat(72);
console.log(line);
console.log('Cortex 残留闸 —— 统一入口');
console.log(line);

if (process.argv.includes('--self-test')) {
  const r = runSelfTest({ ...ROOT_OPTS, label: 'shadow（仓根）' });
  console.log(r.out);
  process.exit(r.code);
}

let failed = 0;

// ① 根仓自己
{
  console.log('');
  console.log('▶ scripts/ ＋ agent-surface.json（仓根）');
  console.log('  （仓根脚本与能力清单）');
  const r = runGate(ROOT_OPTS);
  console.log(r.out);
  if (r.code !== 0) failed++;
}

// ② 两个子项目（各自的薄壳）
for (const p of SUB) {
  console.log('');
  console.log('▶ ' + p.script);
  console.log('  （' + p.what + '）');
  const res = spawnSync(process.execPath, [join(ROOT, p.script)], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    failed++;
    console.error('  ✗ ' + p.script + ' 退出码 ' + res.status);
  }
}

console.log('');
console.log(line);
if (failed === 0) {
  console.log('全部 ' + (SUB.length + 1) + ' 个范围通过。');
} else {
  console.error(failed + ' / ' + (SUB.length + 1) + ' 个范围有阻断问题。');
}
console.log(line);
process.exit(failed > 0 ? 1 : 0);
