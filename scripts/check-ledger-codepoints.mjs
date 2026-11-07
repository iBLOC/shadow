#!/usr/bin/env node
/**
 * 「账本圈码」的自洽性 —— 判定闸。
 *
 * ## 守什么
 *
 * ① **不撞号**：每个条目标题里那个方块字的**原始码位**两两不同；
 * ② **注解自洽**：条目正文里的「本条占 **U+XXXX**」必须等于它自己的真实码位；
 * ③ **缝合残迹**：非标题行里不得嵌着「**Updated**: 日期」形状——行首锚被吞
 *    ⇒ 前后条目并体（2026-11-06 ㌳ 插入事故实证：当时闸假绿、只有计数对得上）；
 * ④ **异体声明**：条目体里不得出现别条的「本条占 **U+XXXX**」声明（码位 ≠
 *    自己标题码位 ⇒ 又一种并体签名，挡锚连日期形态都没了的残余）。
 *
 * ## 为什么需要它（2026-11-05 真机实测；③④＝2026-11-06 ㌳ 事故加固）
 *
 * · 账本里有**五条**条目的注解写的是 `U+340x`，而落盘的字符是 `U+334x`
 *   ⇒ ⇒ 差 0xC0 ⇒ ⇒ **注解在说假话**（`U+340x` 是 CJK 扩展 A 的汉字，
 *   `U+334x` 是 CJK 兼容表意文字 —— 两者**不是同形**）。
 * · 那五条**当时就登记过**（「登记了却没修」⇒ ⇒ 「已登记」不等于「已修好」）。
 * · 还有一次**真撞号**（两条都写 U+33A0）⇒ ⇒ 引用变歧义 ⇒ ⇒ 连累两条闸红。
 *
 * ⇒ ⇒ 判据纯函数在 `scripts/lib/ledger-codepoints.mjs`（判据与 I/O 分离）。
 *
 * ## 退出码
 *
 * · `0` —— 全绿；`1` —— 有红；`2` —— 判不了（账本不在 / 读不出来）。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-ledger-codepoints.mjs             # 判定
 * node scripts/check-ledger-codepoints.mjs --self-test # 自检（含正控与孪生）
 * node scripts/check-ledger-codepoints.mjs --drill     # 副本演练（绿→红→绿）
 * ```
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { findViolations } from './lib/ledger-codepoints.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const LEDGER = join(REPO, 'AGENTS.md');

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

export function checkText(text) {
  const v = findViolations(text);
  const out = [];
  for (const d of v.dups) {
    out.push(`❌ [dup-codepoint] 码位 U+${d.cp} 被 ${d.lines.length} 条占用：行 ${d.lines.join(', ')}`);
  }
  for (const m of v.mismatched) {
    out.push(`❌ [annotation-mismatch] 第 ${m.line} 行：注解写 U+${m.claimed}，而标题里的「${m.ch}」真实码位是 U+${m.actual}`);
  }
  for (const s of v.swallowed) {
    out.push(`❌ [swallowed-anchor] 第 ${s.line} 行：非标题行里嵌着「**Updated**: 日期」形状 ⇒ 行首锚被吞、前后条目并体（㌳ 事故形状）｜ ${s.snippet}`);
  }
  for (const f of v.foreign) {
    out.push(`❌ [foreign-declaration] 第 ${f.line} 行起：条目体里出现别条的「本条占 **U+${f.claimed.join('/')}」声明（自己的应是 U+${f.actual}）⇒ 条目并体`);
  }
  return { v, out };
}

function selfTest() {
  let pass = 0, fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  [PASS] ${name}`); }
    else { fail++; console.log(`  [FAIL] ${name} ${detail}`); }
  };
  const head = (ch, claim, body) => `**Updated**: 2026-11-05 (${ch} **条目** —— ${claim} —— 讲点事。)\n${body}`;
  const ok = ['# PROJECT KNOWLEDGE BASE', '', head('㋿', '本条占 **U+32FF**', '① 正文。'), '', head('㍀', '本条占 **U+3340**', '② 正文。')].join('\n');
  const wrong = ok.replace('U+3340', 'U+3400');
  const dup = ok.replace('(㍀ **条目**', '(㋿ **条目**');
  const refs = ['# PROJECT KNOWLEDGE BASE', '', head('㋿', '本条占 **U+32FF**', '① 承 U+33A0 那笔说过的。\n② 顺带提一句 U+FFFD 是损坏字符。')].join('\n');
  check('正常账本 ⇒ 零违规', checkText(ok).out.length === 0, JSON.stringify(checkText(ok).out));
  check('注解写错 ⇒ 恰好 1 条 mismatched', checkText(wrong).v.mismatched.length === 1);
  check('注解写错 ⇒ 不是 dups', checkText(wrong).v.dups.length === 0);
  check('重复码位 ⇒ 恰好 1 个 dup', checkText(dup).v.dups.length === 1);
  check('正文里的引用/反例 ⇒ 不误报', checkText(refs).out.length === 0, JSON.stringify(checkText(refs).out));
  // ③④ 用例（2026-11-06 ㌳ 事故加固）——控制字符一律 String.fromCharCode 构造。
  const BS = String.fromCharCode(92);
  const litBreak = BS + 'r' + BS + 'n' + BS + 'r' + BS + 'n';
  const merged = ok.replace(
    '\n\n**Updated**: 2026-11-05 (㍀',
    litBreak + '**Updated**: 2026-11-05 (㍀',
  );
  const mv = checkText(merged);
  check('缝合残迹（㌳ 形状）⇒ swallowed 恰好 1 条', mv.v.swallowed.length === 1, JSON.stringify(mv.out));
  check('缝合残迹 ⇒ 异体声明恰好 1 条（㍀ 的声明并进 ㋿ 体）', mv.v.foreign.length === 1, JSON.stringify(mv.out));
  const prose = ['# PROJECT KNOWLEDGE BASE', '', head('㋿', '本条占 **U+32FF**', '① 规则引文：正文里的「本条占 **U+XXXX**」必须等于真实码位。'), '', head('㍀', '本条占 **U+3340**', '② 锚点引用：这个「本条占」锚点只认完整声明。')].join('\n');
  check('规则引文/锚点引用（㎝ 形状）⇒ 不误报', checkText(prose).out.length === 0, JSON.stringify(checkText(prose).out));
  if (!existsSync(LEDGER)) { check('真账本存在', false); } else {
    const r = checkText(readFileSync(LEDGER, 'utf8'));
    check('真账本 ⇒ 零违规', r.out.length === 0, r.out.join(' | '));
  }
  console.log(`  判据自检：${pass}/${pass + fail}`);
  return fail === 0;
}

function drill() {
  if (!existsSync(LEDGER)) { console.log('❌ 账本不在 ⇒ ⇒ 判不了'); return false; }
  const before = sha256(LEDGER);
  const dir = join(tmpdir(), 'shadow-ledger-codepoint-drill');
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, 'AGENTS.md');
  const original = readFileSync(LEDGER, 'utf8');
  writeFileSync(copy, original);
  const broken = original.replace(/(本条占\s*\*\*U\+)([0-9A-Fa-f]{4,6})/, (m, a) => a + 'FFFF');
  writeFileSync(copy, broken);
  const red = checkText(readFileSync(copy, 'utf8'));
  writeFileSync(copy, original);
  const green = checkText(readFileSync(copy, 'utf8'));
  // ③④ 并体演练：把第二个标题的行首锚吞成字面换行文本（模拟 2026-11-06 ㌳ 事故）。
  // 边界定位必须兼容 LF 与 CRLF 账本——字面 '\n\n' 锚在 CRLF 文件上永远找不到
  // （2026-11-07 实测踩过：drill 三行打印全绿却退出码 1，根因是 mergedRed 没构造出来）。
  const BS = String.fromCharCode(92);
  const litBreak = BS + 'r' + BS + 'n' + BS + 'r' + BS + 'n';
  const firstHead = original.search(/^\*\*Updated\*\*/m);
  const boundary = /\r?\n\r?\n\*\*Updated\*\*/g;
  boundary.lastIndex = firstHead + 1;
  const hit = boundary.exec(original);
  let mergedRed = null;
  if (hit) {
    const mergedCopy = original.slice(0, hit.index) + litBreak + '**Updated**' + original.slice(hit.index + hit[0].length);
    writeFileSync(copy, mergedCopy);
    mergedRed = checkText(readFileSync(copy, 'utf8'));
    writeFileSync(copy, original);
  }
  rmSync(dir, { recursive: true, force: true });
  const after = sha256(LEDGER);
  const mergedOk = mergedRed != null
    && mergedRed.out.length > 0
    && mergedRed.v.swallowed.length >= 1;
  const ok = red.out.length > 0 && green.out.length === 0 && mergedOk && before === after;
  console.log(`  副本破坏 ⇒ 判红：${red.out.length} 条`);
  console.log(`  副本还原 ⇒ 判绿：${green.out.length} 条`);
  if (mergedRed) console.log(`  并体副本（㌳ 形状）⇒ 判红：${mergedRed.out.length} 条（swallowed ${mergedRed.v.swallowed.length} / foreign ${mergedRed.v.foreign.length}）`);
  else console.log('  并体副本 ⇒ 没构造出来（第二个标题边界没找到）');
  console.log(`  真文件 SHA256 前后一致：${before === after ? '是' : '否'} (${before.slice(0, 16)}…)`);
  return ok;
}

const arg = process.argv[2];
if (arg === '--self-test') { process.exit(selfTest() ? 0 : 1); }
if (arg === '--drill') { process.exit(drill() ? 0 : 1); }
if (!existsSync(LEDGER)) { console.error('❌ 账本不在 ⇒ ⇒ 判不了（退出码 2）'); process.exit(2); }
const result = checkText(readFileSync(LEDGER, 'utf8'));
if (result.out.length === 0) {
  console.log(`✅ 零违规（${result.v.entries.length} 条条目：码位两两不同 ＋ 注解与真实码位一致）`);
  process.exit(0);
}
for (const l of result.out) console.log(l);
process.exit(1);