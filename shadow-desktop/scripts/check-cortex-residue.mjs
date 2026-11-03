#!/usr/bin/env node
/**
 * 桌面端 Cortex 残留闸 —— 薄壳
 *
 * ⚠️ 判据（算法）不在这里 ⇒ 在 `shadow/scripts/lib/cortex-residue.mjs`（**一处实现**）
 *    这里只提供**数据**：扫哪些目录 ＋ 哪些 token 属兼容契约、可以豁免。
 *
 * 为什么要有这道闸：用户拍板「Cortex 是过时概念应该删除」「清理 cortex 避免与
 * 新方案（端脑 / telencephalon / 大脑）产生混淆」。旧闸只看**标识符**
 * ⇒ 界面那句「启动 Cortex」根本不在判据里 ⇒ 闸一路绿、界面还在说 Cortex。
 *
 * 用法（从 shadow-desktop 根跑）：
 *   node scripts/check-cortex-residue.mjs             # 主流程
 *   node scripts/check-cortex-residue.mjs --self-test # 自检：判据有没有分辨力
 *
 * 退出码：0 = 干净 / 1 = 有残留 / 2 = 判不了（豁免条目腐烂）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runGate, runSelfTest } from '../../scripts/lib/cortex-residue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 兼容契约豁免清单 —— **每条都要写清理由**。
 * ⚠️ 这不是「垃圾桶」：闸会检查每条 token **是否真的还在仓库里出现过**，
 *    没出现 ⇒ 报「豁免条目已腐烂」并以退出码 2 结束。
 */
const ALLOWED = [
  {
    token: 'CORTEX_ADMIN_KEY',
    reason: '旧环境变量别名（新的 TELENCEPHALON_ADMIN_KEY 优先）—— 删了会让老部署失效。',
  },
  {
    token: 'CORTEX_SKIP_NEURON',
    reason: '旧环境变量别名（新的 TELE_SKIP_NEURON 优先）。',
  },
  {
    token: 'CORTEX_PORT',
    reason: '旧环境变量别名（新的 TELE_PORT 优先）。',
  },
  {
    token: 'CORTEX_CONFIG',
    kind: 'history',
    reason: '**改名史注释**里的旧环境变量名（端脑配置目录）—— 只在注释里出现，不在代码里。',
  },
  {
    token: 'cortex_url',
    reason: '旧设置 UI **真实用过**的 localStorage 存储键 —— 必须逐字保留（改了 ⇒ 这一条就擦不掉 ⇒ 用户的旧 API key 留在磁盘上）。',
  },
  {
    token: 'cortex_api_key',
    reason: '同上（旧的 API key 存储键）。',
  },
  {
    token: 'shadow-cortex-store',
    reason: '旧持久化键 —— 一次性搬运旧数据用的；没有它，用户已配的端脑地址 / 影子锁会**静默丢失**。',
  },
  {
    token: 'cortex_configure_llm',
    kind: 'history',
    reason: '**改名史注释**里点名的、被删掉的 Tauri 命令 —— 留着是为了说清「这个能力尚未实现」。',
  },
  {
    token: '.shadow/cortex',
    kind: 'history',
    reason: '**改名史注释**里的旧磁盘落点 ~/.shadow/cortex/llm-config.json —— Rust 侧根本没人读它（假落点），注释保留是为了说清「它已不生效」。',
  },
  {
    token: '`cortex`',
    kind: 'history',
    reason: '**改名史注释**里的旧端脑信封键 —— 保留作历史对照（说明 AgentsResponse 的信封键从旧名换成了 telencephalon）。',
  },
  {
    token: 'api/cortex',
    reason: '旧路由前缀 /api/cortex/* —— 保留作**历史对照**（提醒人别用旧路由；真路由是 /api/telencephalon/*）。',
  },
  {
    token: 'cortexVersion',
    kind: 'history',
    reason: '**改名史注释**里点名的旧 wire 字段名 —— 留着是为了说清那个「失败长得像成功」的 422 事故（客户端发旧字段 ⇒ 服务端整块反序列化失败 ⇒ 被 .catch 吞掉）。',
  },
  {
    token: 'CortexManager',
    kind: 'history',
    reason: '**改名史注释**里的**被删掉的类型名** —— 改掉等于伪造历史。',
  },
  {
    token: 'test_cortex_manager_initial_state',
    kind: 'history',
    reason: '**改名史注释**里的**被删掉的测试名** —— 同上。',
  },
  {
    token: 'check-cortex-residue',
    reason: '闸自己的文件名 —— 文档里提到这道闸就是在提到它自己。',
  },
  {
    token: 'cortex-status',
    reason: '路由路径 /cortex-status（内部 URL，不出现在界面上）。能力清单 agent-surface.json 正在被别的会话改，本轮不动它。',
  },
];

const OPTS = {
  root: ROOT,
  label: 'shadow-desktop',
  scanDirs: ['src', 'src-tauri', 'tests', 'scripts'],
  scanFiles: ['README.md', 'ARCHITECTURE.md'],
  excludeDirs: [
    'node_modules', 'target', 'dist', 'build', '.git',
    'docs',              // 历史文档：台账与历史证据不改
    'test-results',      // Playwright 产物
    'playwright-report',
    // ⚠️ 构建产物与工具快照目录（**不是活代码**）
    '.cxx', '.mimosa',
  ],
  excludeFiles: [
    'AGENTS.md',                 // 台账：**要记得历史** —— 历史里出现旧名字是对的
    'check-cortex-residue.mjs',  // 闸自己：它当然知道「cortex」这个词
    'pnpm-lock.yaml',
    'package-lock.json',
  ],
  allowed: ALLOWED,
};

if (process.argv.includes('--self-test')) {
  const r = runSelfTest({ ...OPTS, label: 'shadow-desktop' });
  console.log(r.out);
  process.exit(r.code);
}

const r = runGate(OPTS);
console.log(r.out);
process.exit(r.code);
