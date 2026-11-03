#!/usr/bin/env node
/**
 * Cortex 残留闸 —— **统一入口**（shadow 仓）
 *
 * 三个范围各有自己的**数据**（扫哪些目录 ＋ 哪些 token 豁免）⇒ 但**判据只有一处**
 * （`scripts/lib/cortex-residue.mjs`）⇒ 三边不会漂。
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
];

/** 根仓自己的范围：脚本目录 ＋ 能力清单 ＋ fixtures */
const ROOT_OPTS = {
  root: ROOT,
  label: 'shadow（仓根）',
  scanDirs: ['scripts'],
  scanFiles: ['agent-surface.json'],
  excludeDirs: ['node_modules', '.git', 'target', 'dist', 'build', 'docs'],
  excludeFiles: [
    'check-cortex-residue.mjs',  // 闸自己
    'cortex-residue.mjs',         // 引擎自己（它当然知道这个词）
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
