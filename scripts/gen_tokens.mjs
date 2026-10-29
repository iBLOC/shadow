#!/usr/bin/env node
/**
 * 由 design-tokens.json 生成两端的设计 token 落地文件。
 *
 *   node scripts/gen_tokens.mjs          # 写入
 *   node scripts/gen_tokens.mjs --check  # 只校验是否同步（CI 用，漂移则 exit 1）
 *
 * 产物：
 *   shadow-desktop/src/styles/tokens.css       —— CSS 变量 + shadcn 语义投影
 *   shadow-mobile/lib/theme/app_tokens.g.dart  —— Dart 常量
 *   shadow-mobile/lib/theme/shad_scheme.g.dart —— Dart 侧 shadcn 主题适配
 *
 * 生成物是**从属**的：不要手改它们，要改就改 design-tokens.json 再重跑本脚本。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildCss,
  buildDart,
  buildAccentTs,
  buildShadScheme,
} from './lib/tokens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** 目标文件 → 生成器 → 行尾风格 */
const TARGETS = [
  {
    path: 'shadow-desktop/src/styles/tokens.css',
    build: buildCss,
    eol: '\n',
  },
  {
    path: 'shadow-desktop/src/styles/accent.g.ts',
    build: (t) => buildAccentTs(t),
    eol: '\n',
    // TS 产物里本来就有合法的模板串 `${...}`，所以只查 NaN/undefined
    allowTemplateLiterals: true,
  },
  {
    path: 'shadow-mobile/lib/theme/app_tokens.g.dart',
    build: buildDart,
    eol: '\r\n', // 移动端 Dart 源码是 CRLF
  },
  {
    path: 'shadow-mobile/lib/theme/shad_scheme.g.dart',
    build: buildShadScheme,
    eol: '\r\n',
  },
];

const tokens = JSON.parse(readFileSync(join(ROOT, 'design-tokens.json'), 'utf8'));

let drift = 0;

for (const target of TARGETS) {
  const abs = join(ROOT, target.path);
  const content = target.build(tokens).split('\n').join(target.eol);

  // 自检：模板串写错时产物里会残留未展开的 ${...} 或 NaN/undefined。
  // 这类错误肉眼很难发现，但它会直接变成两端跑不起来的常量，所以在这里拦死。
  const bad = target.allowTemplateLiterals
    ? content.match(/\bNaN\b|\bundefined\b/g)
    : content.match(/\$\{[^}]*\}|\bNaN\b|\bundefined\b/g);
  if (bad) {
    console.error(`  ✗ ${target.path} 生成结果异常：${[...new Set(bad)].join(' ')}`);
    console.error('    这是生成器本身的 bug（模板串漏了反引号等），不是 token 数据问题。');
    process.exit(1);
  }

  const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;

  if (current === content) {
    console.log(`  = ${target.path} 已是最新`);
    continue;
  }

  if (CHECK) {
    drift += 1;
    console.error(`  ✗ ${target.path} 与 design-tokens.json 不同步`);
    console.error('    修复：node scripts/gen_tokens.mjs');
    continue;
  }

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  console.log(`  ✓ ${target.path} 已生成（${content.length} 字节）`);
}

if (drift > 0) {
  process.exit(1);
}
