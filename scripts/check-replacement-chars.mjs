#!/usr/bin/env node
/**
 * 「替换字符扫描」闸（2026-11-11）—— U+FFFD（replacement character）零容忍。
 *
 * ## 为什么要有这道闸
 *   U+FFFD 是「**UTF-8 解码失败时被替换上去的占位符**」⇒ ⇒ 它出现 ⇒ ⇒
 *   **原字符已经丢了**（不可还原）⇒ ⇒ 而它落在**注释 / 文案 / 契约**里 ⇒ ⇒
 *   人读得到、机器读不懂 ⇒ ⇒ 典型形状：「失败长得像成功」。
 *   ⚠️ 本次实测：全仓 tracked 文本里 **13 处 / 共 32 个** U+FFFD，
 *   其中 **2 处在契约与运行期文案里**（agent-surface.json ／ check-failure-masking.mjs）。
 *
 * ## 它守什么
 *   ① **未登记**的替换字符 ⇒ ⇒ 判红；
 *   ② 已登记但**行指纹失配**（那一行被改过）⇒ ⇒ 判红 ⇒ ⇒ 必须重新评审豁免；
 *   ③ 已登记且指纹相同 ⇒ ⇒ **只报告不判红**（**登记 ≠ 认可** —— 那是历史欠账）。
 *
 * ## 读哪个面
 *   **提交树面**（git grep HEAD）⇒ ⇒ 与 CI 看到的那一面一致 ⇒ ⇒ 不受工作树分叉影响。
 *
 * ## 退出码
 *   0 绿；1 红（有未登记的替换字符，或豁免失配）；2 源没读全 ⇒ ⇒「没红」不等于「没问题」。
 *
 * ## 用法
 *   node scripts/check-replacement-chars.mjs
 *   node scripts/check-replacement-chars.mjs --self-test
 *   node scripts/check-replacement-chars.mjs --emit-baseline   # 只打印，不写文件
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const FFFD = String.fromCodePoint(0xFFFD);
const MARK = String.fromCharCode(1);
const LF = String.fromCharCode(10);
const BASELINE_REL = 'state/replacement-char-baseline.json';

/** 行指纹：把替换字符换成一个占位记号后的 sha256 前 16 位 ⇒ ⇒ 只认「同一行的非坏字符部分」。 */
export function fingerprint(line) {
  return createHash('sha256').update(line.split(FFFD).join(MARK)).digest('hex').slice(0, 16);
}

/** 扫一段文本里的替换字符 ⇒ ⇒ 返回逐处（行号 / 个数 / 指纹 / 文本片段）。 */
export function scanText(text) {
  const out = [];
  const lines = text.split(LF);
  for (let i = 0; i < lines.length; i++) {
    let c = 0;
    for (const ch of lines[i]) if (ch === FFFD) c++;
    if (c > 0) out.push({ line: i + 1, count: c, fingerprint: fingerprint(lines[i]), text: lines[i].trim().slice(0, 120) });
  }
  return out;
}

import { multisetDiff } from './lib/relative-assert.mjs';

/**
 * 语义键 ＝ 文件路径 ＋ 行内容指纹（**不含行号**）。
 *
 * ⚠️ 为什么不用行号（承 U+350B 条那一课）：闸的输出行里嵌着位置型元数据 ⇒ ⇒
 *   拿它做「同一性」比较必假红 —— 台账**插入**一条就会让所有行号漂移。
 *   ⇒ ⇒ 这里用**内容指纹**当身份 ⇒ ⇒ 插入不误判、而「那一行被改过」照判红。
 */
export function siteKey(file, fp) {
  return file + '|' + fp;
}

/** 在提交树面上找替换字符（git grep HEAD）⇒ ⇒ 与 CI 看到的那一面一致。 */
export function grepRef(ref) {
  let out;
  const args = ['grep', '-n', '-I', '-e', FFFD];
  if (ref) args.push(ref);
  args.push('--');
  try {
    out = execFileSync('git', args, {
      cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28,
    });
  } catch (e) {
    const status = e.status;
    if (status === 1) return { sites: [], ok: true };
    if (status === 128) return { sites: [], ok: false, error: String(e.stderr || e.message) };
    throw e;
  }
  const sites = [];
  for (const raw of out.split(LF)) {
    if (!raw) continue;
    // ⚠️ 两面的行格式不同：提交树面 ＝ HEAD:path:line:content；工作树面 ＝ path:line:content
    //   ⇒ ⇒ 统一剥掉 ref 前缀再解析 ⇒ ⇒ **不要**用「第三个冒号」做前置检查
    //   （那会把工作树面里 content 不含冒号的行静默丢掉 ⇒ ⇒ 本刀实测踩过）。
    const body = raw.startsWith('HEAD:') ? raw.slice(5) : raw;
    const p1 = body.indexOf(':');
    const p2 = body.indexOf(':', p1 + 1);
    if (p1 < 0 || p2 < 0) continue;
    const rel = body.slice(0, p1);
    const lineNo = Number(body.slice(p1 + 1, p2));
    const content = body.slice(p2 + 1);
    let n = 0;
    for (const ch of content) if (ch === FFFD) n++;
    sites.push({ file: rel, line: lineNo, count: n, fingerprint: fingerprint(content), text: content.trim().slice(0, 100) });
  }
  return { sites, ok: true };
}

/** 读基线（登记在案的既存欠账）。 */
export function readBaseline() {
  const p = join(REPO, BASELINE_REL);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * 判读（纯函数）—— 判据与 I/O 分离。
 *   extra ＝ 实际比基线**多出来**的（⇒ ⇒ 判红：未登记的新坏字符，或那一行被改过）；
 *   lost  ＝ 基线里有、实际没有的（⇒ ⇒ 只报告：那几行被修好了）。
 */
export function judge(sites, baseline) {
  const baseKeys = [];
  for (const k of Object.keys(baseline.byKey || {})) {
    const n = (baseline.byKey[k] && baseline.byKey[k].count) || 1;
    for (let i = 0; i < n; i++) baseKeys.push(k);
  }
  const actualKeys = sites.map((s) => siteKey(s.file, s.fingerprint));
  return {
    baseKeys,
    actualKeys,
    extra: multisetDiff(baseKeys, actualKeys),
    lost: multisetDiff(actualKeys, baseKeys),
  };
}

/** 自检 —— 判据自证（承 U+350D 条「那 10 组断言在 CI 上真的被跑到」）。 */
export function selfTest() {
  const results = [];
  const check = (name, cond, why) => results.push({ name, ok: !!cond, why: why || '' });
  const NL = String.fromCharCode(10);

  const a = '某某这里是凡' + FFFD + FFFD + '两个字的目录';
  const b = '某某这里是凡' + FFFD + FFFD + '两个字的目录 ';
  check('① 指纹对非坏字符敏感：行内容变了 ⇒ ⇒ 指纹变', fingerprint(a) !== fingerprint(b), fingerprint(a) + ' vs ' + fingerprint(b));
  check('② 语义键不含行号（插入不误判）', siteKey('a.md', 'abc').indexOf(':') < 0, siteKey('a.md', 'abc'));
  const sites = scanText('第一行' + NL + '第二行' + FFFD + FFFD + '尾巴' + NL);
  check('③ 扫描计数正确（一行两个坏字符 ⇒ count=2）', sites.length === 1 && sites[0].count === 2 && sites[0].line === 2, JSON.stringify(sites));
  check('④ 空输入 ⇒ ⇒ 零 findings', scanText('干干净净' + NL).length === 0, '');

  const fp = fingerprint('坏行' + FFFD);
  const k = siteKey('x.md', fp);
  const base = { byKey: {} };
  base.byKey[k] = { count: 1 };
  const j1 = judge([{ file: 'x.md', line: 7, count: 1, fingerprint: fp }], base);
  check('⑤ 登记在案 ⇒ ⇒ 不判红（extra 空）', j1.extra.length === 0, JSON.stringify(j1.extra));
  const j2 = judge([
    { file: 'x.md', line: 7, count: 1, fingerprint: fp },
    { file: 'x.md', line: 9, count: 1, fingerprint: fingerprint('新坏行' + FFFD) },
  ], base);
  check('⑥ 未登记的新坏字符 ⇒ ⇒ 判红（extra 有 1 条）', j2.extra.length === 1, JSON.stringify(j2.extra));
  const j3 = judge([{ file: 'x.md', line: 7, count: 1, fingerprint: fingerprint('改过的坏行' + FFFD) }], base);
  check('⑦ 登记的那一行被改过 ⇒ ⇒ 豁免失配 ⇒ ⇒ 判红（extra 1 ／ lost 1）', j3.extra.length === 1 && j3.lost.length === 1, JSON.stringify({ extra: j3.extra, lost: j3.lost }));
  const j4 = judge([{ file: 'x.md', line: 999, count: 1, fingerprint: fp }], base);
  check('⑧ 行号漂移 ⇒ ⇒ 不判红（键不含行号）', j4.extra.length === 0, JSON.stringify(j4.extra));

  const ok = results.filter((r) => r.ok).length;
  console.log(results.map((r) => (r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.ok ? '' : '  —— ' + r.why)).join(NL));
  console.log('判据自检：' + ok + '/' + results.length);
  return ok === results.length;
}

function main(argv) {
  if (argv.includes('--self-test')) { process.exitCode = selfTest() ? 0 : 1; return; }
  if (argv.includes('--emit-baseline')) {
    const g = grepRef('HEAD');
    if (!g.ok) { console.error('❌ 读提交树面失败 ⇒ ⇒ ' + g.error); process.exit(2); }
    const byKey = {};
    for (const s of g.sites) {
      const k = siteKey(s.file, s.fingerprint);
      if (!byKey[k]) byKey[k] = { count: 0, chars: 0, sample: s.text };
      byKey[k].count++;
      byKey[k].chars += s.count;
    }
    console.log(JSON.stringify({ schema: 'ibloc/replacement-char-baseline@1', byKey }, null, 2));
    process.exitCode = 0;
    return;
  }
  const baseline = readBaseline();
  if (!baseline) {
    console.error('❌ 基线文件不在（' + BASELINE_REL + '）⇒ ⇒ 退出码 2 ⇒ ⇒ 「没红」不等于「没问题」');
    process.exitCode = 2;
    return;
  }
  const g = grepRef('HEAD');
  if (!g.ok) { console.error('❌ 读提交树面失败 ⇒ ⇒ ' + g.error); process.exit(2); }
  const j = judge(g.sites, baseline);
  const total = g.sites.reduce((n, s) => n + s.count, 0);
  console.log('替换字符扫描：提交树面 ｜ 检出 ' + g.sites.length + ' 处 ／ 共 ' + total + ' 个 ｜ 基线登记 ' + j.baseKeys.length + ' 处');
  const byKey = {};
  for (const s of g.sites) {
    const k = siteKey(s.file, s.fingerprint);
    if (!byKey[k]) byKey[k] = { count: 0, chars: 0, sample: s.text };
    byKey[k].count++;
    byKey[k].chars += s.count;
  }
  for (const k of Object.keys(byKey)) {
    console.log('   · ' + k + ' ｜ ' + byKey[k].chars + ' 个 ｜ ' + byKey[k].sample.slice(0, 70));
  }
  if (j.lost.length > 0) {
    console.log('   ⚠️ 基线里有、实际没有的（那几行被修好了／被改了）＝ ' + j.lost.length + ' 处：');
    for (const k of j.lost) console.log('      · ' + k);
  }
  if (j.extra.length > 0) {
    console.log('   ❌ 未登记／豁免失配：' + j.extra.length + ' 处 ⇒ ⇒ 判红');
    for (const k of j.extra) console.log('      · ' + k);
    process.exitCode = 1;
    return;
  }
  console.log('   ✅ 零违规（登记在案的是**既存欠账**，**登记 ≠ 认可**）');
  // ⚠️ **工作树面报告腿**（**不参与判绿**）：CI 读的是**提交树面** ⇒ ⇒ 工作树面的差异
  //   ⇒ ⇒ 必须在 CI 上说得出、在这儿也说得出 ⇒ ⇒ 否则「CI 绿」会盖住共享工作树上的坏字符。
  const wt = grepRef('');
  if (wt.ok) {
    const wtExtra = multisetDiff(j.actualKeys, wt.sites.map((s) => siteKey(s.file, s.fingerprint)));
    if (wtExtra.length > 0) {
      console.log('   ⚠️ 工作树面比提交树面多 ' + wtExtra.length + ' 处替换字符（**不判红**，但那多半是**谁的在飞面**里带的）：');
      for (const k of wtExtra) console.log('      · ' + k);
    }
  }
  process.exitCode = 0;
  return;
}

main(process.argv.slice(2));