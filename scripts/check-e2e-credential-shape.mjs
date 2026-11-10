#!/usr/bin/env node
/**
 * 「E2E 凭据头形状」判定闸 —— 端脑那几扇门在 CI 上是不是**真的**拿到了凭据。
 * ============================================================================
 *
 * ## 守什么
 *
 * `shadow-desktop/playwright.config.ts` 里的凭据头（`x-admin-token` /
 * `x-shadow-key`）**只允许**出现在 `use.extraHTTPHeaders` 那个配平的块里。
 *
 * ## 为什么需要它（2026-11-05 真机实测）
 *
 * · 仓里那个形状把两个头 **spread 到 `use` 的顶层** ⇒ ⇒ Playwright **不认这个
 *   use 选项** ⇒ ⇒ **既不报错也不告警**（测试照样 pass）⇒ ⇒ **一个头都发不出去**
 *   ⇒ ⇒ 端脑那扇门一律 401 ⇒ ⇒ CI 上那批红**长得像**鉴权失败，其实是**形状错了**。
 * · 而 workflow 的注释当时写着「客户端（`playwright.config.ts` 的 `extraHTTPHeaders`）」
 *   ⇒ ⇒ **注释描述的是意图，代码里那个形状从来没落地** ⇒ ⇒ 「文档说的形状」又一次
 *   与「代码里的形状」对不上。
 *
 * ⇒ ⇒ 判据纯函数在 `scripts/lib/e2e-credential-shape.mjs`（判据与 I/O 分离）。
 *
 * ## 退出码
 *
 * · `0` —— 全绿；`1` —— 有红；`2` —— 判不了（目标文件不在 / 读不出来）。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-e2e-credential-shape.mjs             # 判定
 * node scripts/check-e2e-credential-shape.mjs --self-test # 自检（含事故夹具 ＋ 孪生）
 * node scripts/check-e2e-credential-shape.mjs --drill     # 副本演练（绿→红→绿）
 * ```
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { stripComments } from './lib/strip-comments.mjs';
import { findCredentialShapeIssues } from './lib/e2e-credential-shape.mjs';
import { injectedDelta, sameMultiset, selfTest as relativeSelfTest } from './lib/relative-assert.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const TARGET = join(REPO, 'shadow-desktop', 'playwright.config.ts');
const Q = String.fromCharCode(39);

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** 源码 ⇒ 剥注释 ⇒ 判据。 */
export function checkSource(source) {
  const code = stripComments(String(source || ''), { nested: false, rust: false });
  const v = findCredentialShapeIssues(code);
  const out = [];
  for (const i of v.issues) {
    if (i.kind === 'outside-extraHTTPHeaders') {
      out.push(`❌ [outside-extraHTTPHeaders] 第 ${i.line} 行：凭据头 \`${i.header}\` 不在 \`extraHTTPHeaders\` 块里 ⇒ ⇒ Playwright 会**静默忽略**它（头发不出去 ⇒ ⇒ 端脑那扇门 401）`);
    } else if (i.kind === 'missing-extraHTTPHeaders') {
      out.push(`❌ [missing-extraHTTPHeaders] 第 ${i.line} 行：有凭据头，却**没有** \`extraHTTPHeaders\` 块 ⇒ ⇒ 那些头一个都发不出去`);
    } else {
      out.push(`❌ [unparsable-extraHTTPHeaders] 第 ${i.line} 行：\`extraHTTPHeaders\` 的花括号不配平 ⇒ ⇒ 形状**判不了**（不许当成没问题）`);
    }
  }
  return { v, out };
}

function selfTest() {
  // ⚠️ **相对断言那一族的自检**（判据只有**一处实现** ⇒ ⇒ 这里只转个手 ⇒ ⇒ 不许各写一份）
  if (relativeSelfTest() !== 0) return false;
  let pass = 0, fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass += 1; console.log(`  [PASS] ${name}`); }
    else { fail += 1; console.log(`  [FAIL] ${name} ${detail}`); }
  };

  const hdr = (k) => '      ' + Q + k + Q + ': process.env.KEY,';

  const good = [
    'export default defineConfig({',
    '  use: {',
    '    extraHTTPHeaders: {',
    hdr('x-admin-token'),
    hdr('x-shadow-key'),
    '    },',
    '  },',
    '});',
  ].join('\n');

  // ⚠️ **事故夹具** —— 就是仓里那个形状（顶层 spread ⇒ ⇒ 静默忽略）
  const broken = [
    'export default defineConfig({',
    '  use: {',
    '    ...(process.env.KEY',
    '      ? {',
    hdr('x-admin-token'),
    hdr('x-shadow-key'),
    '        }',
    '      : {}),',
    '  },',
    '});',
  ].join('\n');

  const noCred = [
    'export default defineConfig({',
    '  use: { baseURL, trace: onFirstRetry },',
    '});',
  ].join('\n');

  const commented = [
    'export default defineConfig({',
    '  use: {',
    '    // 端脑只认 x-admin-token 与 x-shadow-key 两个头名',
    '    extraHTTPHeaders: {',
    hdr('x-admin-token'),
    hdr('x-shadow-key'),
    '    },',
    '  },',
    '});',
  ].join('\n');

  const g = checkSource(good);
  const b = checkSource(broken);
  const n = checkSource(noCred);
  const c = checkSource(commented);

  check('正确形状 ⇒ 零违规', g.out.length === 0, JSON.stringify(g.out));
  check('事故夹具（顶层 spread）⇒ 恰好 3 条红', b.out.length === 3, JSON.stringify(b.out));
  check('事故夹具 ⇒ 含 missing-extraHTTPHeaders', b.v.issues.some((i) => i.kind === 'missing-extraHTTPHeaders'));
  check('没有凭据 ⇒ 不误报', n.out.length === 0, JSON.stringify(n.out));
  check('注释里提到头名 ⇒ 不误报', c.out.length === 0, JSON.stringify(c.out));

  if (!existsSync(TARGET)) {
    check('真配置存在', false);
  } else {
    const r = checkSource(readFileSync(TARGET, 'utf8'));
    check('真配置 ⇒ 零违规', r.out.length === 0, r.out.join(' | '));
  }

  console.log(`  判据自检：${pass}/${pass + fail}`);
  return fail === 0;
}

function drill() {
  if (!existsSync(TARGET)) { console.log('❌ 配置不在 ⇒ ⇒ 判不了'); return false; }
  const before = sha256(TARGET);
  const dir = join(tmpdir(), 'shadow-e2e-credential-shape-drill');
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, 'playwright.config.ts');
  const original = readFileSync(TARGET, 'utf8');
  writeFileSync(copy, original);
  // 把两个头挪出 extraHTTPHeaders 块（复原事故形状）
  const broken = original.replace(
    /(extraHTTPHeaders:\s*\{)([\s\S]*?)(\n\s*\},)/,
    '$1$3\n    ...(process.env.SHADOW_E2E_ADMIN_KEY\n      ? {\n$2\n        }\n      : {}),',
  );
  writeFileSync(copy, broken);
  const red = checkSource(readFileSync(copy, 'utf8'));
  writeFileSync(copy, original);
  const green = checkSource(readFileSync(copy, 'utf8'));
  // ⚠️ **原始读数**（真文件内容）⇒ ⇒ 判绿**不**看它（被测物带伤时它可以非零）。
  const base = checkSource(original);
  rmSync(dir, { recursive: true, force: true });
  const after = sha256(TARGET);
  // ⚠️ **相对断言**（2026-11-11 刀⑫）：判绿**只由注入腿**决定 ⇒ ⇒
  //   被测物带伤时演练**不再恒红** ⇒ ⇒ 演练红**不遮蔽**主判定（U+350B／U+350C 条那个机制）。
  const keysOf = (r) => r.v.issues.map((i) => i.kind + (i.header ? ':' + i.header : ''));
  const baseKeys = keysOf(base);
  const delta = injectedDelta(baseKeys, keysOf(red));
  const restoredOk = sameMultiset(baseKeys, keysOf(green));
  const ok = delta.ok && restoredOk && before === after;
  console.log(`  原始读数（真文件内容）⇒ ${baseKeys.length} 条（**报告腿**：不参与判绿）`);
  console.log(`  副本破坏 ⇒ 判红：${keysOf(red).length} 条 ⇒ ⇒ 相对原始读数：${delta.reason}`);
  console.log(`  副本还原 ⇒ 与原始读数逐键同数：${restoredOk ? '是' : '否'}`);
  console.log(`  真文件 SHA256 前后一致：${before === after ? '是' : '否'} (${before.slice(0, 16)}…)`);
  console.log(`  演练判绿（**只看注入腿 ＋ 还原腿 ＋ 真文件未改动**）⇒ ${ok ? '是' : '否'}`);
  return ok;
}

const arg = process.argv[2];
if (arg === '--self-test') { process.exit(selfTest() ? 0 : 1); }
if (arg === '--drill') { process.exit(drill() ? 0 : 1); }
if (!existsSync(TARGET)) { console.error('❌ 配置不在 ⇒ ⇒ 判不了（退出码 2）'); process.exit(2); }
const result = checkSource(readFileSync(TARGET, 'utf8'));
if (result.out.length === 0) {
  console.log(`✅ 零违规（E2E 凭据头形状：${result.v.total} 处凭据头，全部落在 \`extraHTTPHeaders\` 里）`);
  process.exit(0);
}
for (const l of result.out) console.log(l);
process.exit(1);