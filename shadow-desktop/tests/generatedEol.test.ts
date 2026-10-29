import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 生成器的**行尾契约**。
 *
 * ## 这条契约为什么存在
 *
 * 仓里所有 blob 都是 LF（`git ls-files --eol` → `i/lf`，且没有
 * `.gitattributes`），但工作树里的行尾取决于 checkout：
 *   - Windows 开发机 `core.autocrlf=true` → LF 检出成 CRLF；
 *   - Linux CI（默认 `core.autocrlf=false`）→ 检出就是 LF。
 *
 * 生成器早先给移动端 Dart 产物硬编码了 `eol: '\r\n'`（注释还写着
 * 「移动端 Dart 源码是 CRLF」），比对又是逐字节相等 —— 于是：
 *   - Windows：checkout 是 CRLF，生成 CRLF → **恰好蒙对**，本地永远绿；
 *   - Linux CI：checkout 是 LF，生成 CRLF → **判漂移**，`Desktop Build`
 *     这个 job 长期红，而且本地跑多少遍都复现不出来。
 *
 * 现在的规矩：**生成物一律 LF 落盘，比对时归一化行尾**。
 * 这样两种工作树都判「同步」，见 `scripts/lib/eol.mjs`。
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 三个会产出/校验生成物的脚本。 */
const GENERATOR_SCRIPTS = [
  'scripts/gen_tokens.mjs',
  'scripts/gen_nav.mjs',
  'scripts/check-agent-surface.mjs',
];

/** 生成物清单（路径 → 脚本负责产出它的那个脚本）。 */
const GENERATED_TARGETS = [
  { path: 'shadow-desktop/src/styles/tokens.css', script: 'scripts/gen_tokens.mjs' },
  { path: 'shadow-desktop/src/styles/accent.g.ts', script: 'scripts/gen_tokens.mjs' },
  { path: 'shadow-mobile/lib/theme/app_tokens.g.dart', script: 'scripts/gen_tokens.mjs' },
  { path: 'shadow-mobile/lib/theme/shad_scheme.g.dart', script: 'scripts/gen_tokens.mjs' },
  { path: 'shadow-desktop/src/navigation/nav.g.ts', script: 'scripts/gen_nav.mjs' },
  { path: 'shadow-mobile/lib/navigation/nav.g.dart', script: 'scripts/gen_nav.mjs' },
];

describe('生成器的行尾契约', () => {
  it('不得再硬编码 CRLF 行尾（仓内 blob 是 LF，CI checkout 也是 LF）', () => {
    for (const rel of GENERATOR_SCRIPTS) {
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
      expect(
        src.includes("'\\r\\n'"),
        `${rel} 里出现了硬编码的 CRLF 行尾 —— 仓内 blob 与 CI checkout 都是 LF，` +
          '硬编码 CRLF 会变成「本地绿 / CI 红」的坑。行尾统一交给 scripts/lib/eol.mjs。',
      ).toBe(false);
    }
  });

  it('每个生成器都必须用 normalizeEol 比对（忽略工作树的行尾差异）', () => {
    for (const rel of GENERATOR_SCRIPTS) {
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
      expect(
        src.includes('normalizeEol'),
        `${rel} 没有用 normalizeEol —— Windows 工作树是 CRLF、CI 是 LF，` +
          '不归一化就比对会有一边永远判漂移。',
      ).toBe(true);
    }
  });

  it('当前工作树下所有生成物都判「已是最新」', () => {
    for (const rel of ['scripts/gen_tokens.mjs', 'scripts/gen_nav.mjs']) {
      const out = execFileSync('node', [join(REPO_ROOT, rel), '--check'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(out, `${rel} --check 应当通过`).toContain('已是最新');
    }
  });

  it('每个生成物都存在（生成器不会静默少产一个）', () => {
    for (const target of GENERATED_TARGETS) {
      const abs = join(REPO_ROOT, target.path);
      expect(() => readFileSync(abs, 'utf8'), `${target.path} 不存在`).not.toThrow();
    }
  });
});
