#!/usr/bin/env node
/**
 * 从 agent-surface.json 生成两端的导航数据。
 *
 *   node scripts/gen_nav.mjs          # 写入
 *   node scripts/gen_nav.mjs --check  # 只校验是否同步（CI 用，漂移则 exit 1）
 *
 * 产物：
 *   shadow-desktop/src/navigation/nav.g.ts    —— 桌面端侧栏分段
 *   shadow-mobile/lib/navigation/nav.g.dart   —— 移动端底 tab + 对话形态
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadManifest, buildDesktopNav, buildMobileNav } from './lib/nav.mjs';
import { normalizeEol } from './lib/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/**
 * 目标文件 → 生成器
 *
 * 行尾**不再逐目标硬编码**：一律 LF 落盘、比对时归一化 —— 见
 * `scripts/lib/eol.mjs` 里的理由（本地 autocrlf 是 CRLF、CI 是 LF，
 * 硬编码行尾会变成「本地绿 / CI 红」的坑）。
 */
const TARGETS = [
  {
    path: 'shadow-desktop/src/navigation/nav.g.ts',
    build: buildDesktopNav,
  },
  {
    path: 'shadow-mobile/lib/navigation/nav.g.dart',
    build: buildMobileNav,
  },
];

const manifest = loadManifest();

let drift = 0;

for (const target of TARGETS) {
  const abs = join(ROOT, target.path);
  const content = normalizeEol(target.build(manifest));

  const bad = content.match(/\$\{[^}]*\}|\bNaN\b|\bundefined\b/g);
  if (bad) {
    console.error(`  ✗ ${target.path} 生成结果异常：${[...new Set(bad)].join(' ')}`);
    process.exit(1);
  }

  const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  // 比对时归一化行尾：Windows 工作树是 CRLF（autocrlf 检出），CI 是 LF，
  // 两者都应判「同步」—— 详见 scripts/lib/eol.mjs。
  if (normalizeEol(current) === content) {
    console.log(`  = ${target.path} 已是最新`);
    continue;
  }

  if (CHECK) {
    drift += 1;
    console.error(`  ✗ ${target.path} 与 agent-surface.json 不同步`);
    console.error('    修复：node scripts/gen_nav.mjs');
    continue;
  }

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  console.log(`  ✓ ${target.path} 已生成（${content.length} 字节）`);
}

if (drift > 0) {
  process.exit(1);
}
