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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const TARGETS = [
  {
    path: 'shadow-desktop/src/navigation/nav.g.ts',
    build: buildDesktopNav,
    eol: '\n',
  },
  {
    path: 'shadow-mobile/lib/navigation/nav.g.dart',
    build: buildMobileNav,
    eol: '\r\n', // 移动端 Dart 源码是 CRLF
  },
];

const manifest = loadManifest();

let drift = 0;

for (const target of TARGETS) {
  const abs = join(ROOT, target.path);
  const content = target.build(manifest).split('\n').join(target.eol);

  const bad = content.match(/\$\{[^}]*\}|\bNaN\b|\bundefined\b/g);
  if (bad) {
    console.error(`  ✗ ${target.path} 生成结果异常：${[...new Set(bad)].join(' ')}`);
    process.exit(1);
  }

  const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (current === content) {
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
