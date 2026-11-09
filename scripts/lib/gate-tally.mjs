/**
 * 闸的判读汇总 —— 「一盏绿灯到底证明了多少」
 * ============================================================================
 *
 * ## 为什么要有它
 *
 * ⚠️ **workflow 层的「失败长得像成功」** —— 这是 2026-11-11 真 CI 实测（run 42717285106）：
 *
 *   「Unwired Gates」这个 workflow ＝ **success** ⇒ ⇒ 一盏绿灯
 *   ⇒ ⇒ 而那 15 道闸里，**逐条读数**是：
 *   · 8 道报「**判不了**」（跨仓闸：兄弟仓没检出 ⇒ ⇒ 读不到判据源）；
 *   · 其中 cross-client 那一步逐字写着「**2 / 5 个守卫通过，3 个判不了**」。
 *   ⇒ ⇒ **绿灯只覆盖了 7 格** ⇒ ⇒ 而「绿」这个字**没带任何限定**。
 *
 * ⇒ ⇒ **通用形态：一个由 N 格拼起来的绿灯，它证明的只有「红的那几格」；
 *        没验成的那几格被同一次绿灯吞掉了** ⇒ ⇒ 读数必须**分级**。
 *
 * ## 它做什么
 *
 * 每道闸跑完（经 scripts/run-gate-once.mjs）往结果文件里追加**一行机器可读**记录：
 *
 *   GATE_RESULT<TAB><闸名><TAB><原始退出码><TAB><verdict>
 *
 * verdict ∈ ok（0，真判通过）｜ cannot-judge（2，判不了）｜ red（其它，红）。
 *
 * ⇒ ⇒ 收尾一步把它们汇总成一句**带分母的读数**：
 *   「15 道 ｜ 真判 7 ｜ 判不了 8 ｜ 红 0」
 * ⇒ ⇒ 「绿灯」从此有分母。
 *
 * ## 判据（纯函数 · 零 I/O ⇒ ⇒ 自检能喂合成夹具）
 *
 *   node scripts/lib/gate-tally.mjs --self-test
 *   node scripts/lib/gate-tally.mjs --report [--file=<路径>]
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const RESULT_PREFIX = 'GATE_RESULT';

/**
 * 解析一行结果记录 ⇒ ⇒ 解析不了就返回 null（**不计数**，但调用方要知道有坏行）。
 * @param {string} line
 * @returns {{target: string, exit: number, verdict: string} | null}
 */
export function parseResultLine(line) {
  const text = String(line || '').trim();
  if (!text.startsWith(RESULT_PREFIX)) return null;
  const parts = text.split('	');
  if (parts.length < 4) return null;
  const target = String(parts[1] || '').trim();
  const exit = Number(parts[2]);
  const verdict = String(parts[3] || '').trim();
  if (!target) return null;
  if (!Number.isFinite(exit)) return null;
  if (!['ok', 'cannot-judge', 'red'].includes(verdict)) return null;
  return { target, exit, verdict };
}

/**
 * 汇总 ⇒ ⇒ 一个带分母的读数。
 * @param {string[]} lines
 */
export function tally(lines) {
  const entries = [];
  let malformed = 0;
  for (const line of lines || []) {
    if (!String(line || '').trim()) continue;
    const parsed = parseResultLine(line);
    if (parsed) entries.push(parsed);
    else malformed += 1;
  }
  return {
    total: entries.length,
    ok: entries.filter((e) => e.verdict === 'ok').length,
    cannotJudge: entries.filter((e) => e.verdict === 'cannot-judge').length,
    red: entries.filter((e) => e.verdict === 'red').length,
    malformed,
    entries,
  };
}

/** 汇总 ⇒ ⇒ 一句人话（**必须带分母**）。 */
export function renderTally(result) {
  const t = result || tally([]);
  const lines = [];
  lines.push(
    '⇒ ⇒ 闸的判读：' +
      t.total +
      ' 道 ｜ 真判 ' +
      t.ok +
      ' ｜ 判不了 ' +
      t.cannotJudge +
      ' ｜ 红 ' +
      t.red,
  );
  if (t.cannotJudge > 0) {
    lines.push(
      '⇒ ⇒ ⚠️ ' +
        t.cannotJudge +
        ' 道**判不了** ⇒ ⇒ 那一格**没验成**（不是「有问题」，也不是「没问题」）⇒ ⇒ 缺口要留在视野里',
    );
    for (const e of t.entries.filter((x) => x.verdict === 'cannot-judge')) {
      lines.push('     · 判不了：' + e.target);
    }
  }
  if (t.red > 0) {
    lines.push('⇒ ⇒ ❌ ' + t.red + ' 道**红**（判红）⇒ ⇒ 阻断');
    for (const e of t.entries.filter((x) => x.verdict === 'red')) {
      lines.push('     · 红：' + e.target + '（退出码 ' + e.exit + '）');
    }
  }
  if (t.malformed > 0) {
    lines.push('⇒ ⇒ ⚠️ 有 ' + t.malformed + ' 行结果记录**读不出来** ⇒ ⇒ 不计入（不假装它验过）');
  }
  if (t.total === 0) {
    lines.push('⇒ ⇒ ⚠️ 一行结果记录都没有 ⇒ ⇒ 这一格**没验成**（不是「全绿」）');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 自检 —— 纯夹具 ⇒ ⇒ 不需要任何闸、不需要文件系统
// ---------------------------------------------------------------------------
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('解析一行 GATE_RESULT 记录', () => {
    const p = parseResultLine('GATE_RESULT\tcheck-foo\t0\tok');
    return p && p.target === 'check-foo' && p.exit === 0 && p.verdict === 'ok';
  });

  add('孪生：坏行解析不出来（不计数）', () => {
    return parseResultLine('随便一行') === null && parseResultLine('GATE_RESULT\tx\t0') === null;
  });

  add('孪生：verdict 不认识 ⇒ ⇒ 不计数', () => {
    return parseResultLine('GATE_RESULT\tcheck-foo\t0\tmaybe') === null;
  });

  add('空输入 ⇒ ⇒ 总数 0', () => {
    const t = tally([]);
    return t.total === 0 && t.ok === 0 && t.cannotJudge === 0 && t.red === 0;
  });

  add('三种退出码各一行 ⇒ ⇒ 计数正确（**ok 与 判不了 的条数必须不一样**，否则口径错了也看不出来）', () => {
    const t = tally([
      'GATE_RESULT\ta\t0\tok',
      'GATE_RESULT\tb\t0\tok',
      'GATE_RESULT\tc\t2\tcannot-judge',
      'GATE_RESULT\td\t1\tred',
    ]);
    return t.total === 4 && t.ok === 2 && t.cannotJudge === 1 && t.red === 1;
  });

  add('孪生：「判不了」**不许**被算进「真判」', () => {
    const t = tally(['GATE_RESULT\ta\t0\tok', 'GATE_RESULT\tb\t2\tcannot-judge']);
    return t.ok === 1 && t.cannotJudge === 1 && t.ok + t.cannotJudge === 2;
  });

  add('坏行单独记数（不混进三档）', () => {
    const t = tally(['GATE_RESULT\ta\t0\tok', '乱码']);
    return t.total === 1 && t.malformed === 1;
  });

  add('渲染出来的那句**带分母**', () => {
    const out = renderTally(tally(['GATE_RESULT\ta\t0\tok', 'GATE_RESULT\tb\t2\tcannot-judge']));
    return out.includes('2 道') && out.includes('真判 1') && out.includes('判不了 1');
  });

  add('有判不了 ⇒ ⇒ 渲染里点出「没验成」并逐个点名', () => {
    const out = renderTally(tally(['GATE_RESULT\tcheck-foo\t2\tcannot-judge']));
    return out.includes('没验成') && out.includes('check-foo');
  });

  add('有红 ⇒ ⇒ 渲染里逐个点名', () => {
    const out = renderTally(tally(['GATE_RESULT\tcheck-bar\t1\tred']));
    return out.includes('红') && out.includes('check-bar');
  });

  add('零行 ⇒ ⇒ 明说「没验成」，不假装全绿', () => {
    const out = renderTally(tally([]));
    return out.includes('没验成') && out.includes('不是「全绿」');
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 报告模式
// ---------------------------------------------------------------------------
function report(fileArg) {
  const file = resolve(
    fileArg ||
      process.env.GATE_RESULT_FILE ||
      join(process.cwd(), '.gate-results.ndjson'),
  );
  let lines = [];
  if (existsSync(file)) {
    lines = readFileSync(file, 'utf8').split('\n');
  }
  const result = tally(lines);
  const text = renderTally(result);
  console.log(text);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      appendFileSync(summary, text + '\n\n', 'utf8');
    } catch (err) {
      console.error('（写 step summary 失败：' + err.message + '）');
    }
  }
  // ⚠️ 只有「红」才阻断；「判不了」**不当红**（它不是「有问题」），
  //    但它也**不当绿** ⇒ ⇒ 它已经被点名、进了 step summary。
  process.exit(result.red > 0 ? 1 : 0);
}

const argv = process.argv.slice(2);
if (argv.includes('--self-test')) {
  selfTest();
} else if (argv.includes('--report')) {
  const fileArg = (argv.find((a) => a.startsWith('--file=')) || '').slice('--file='.length);
  report(fileArg || null);
} else {
  console.log('用法: node scripts/lib/gate-tally.mjs --self-test | --report [--file=<路径>]');
  process.exit(2);
}
