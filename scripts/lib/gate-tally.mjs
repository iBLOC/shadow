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
 *
 * ## 「该验几道」（2026-11-11 本刀）
 *
 * ⚠️ 汇总步的输入是「**收到几条判读记录**」⇒ ⇒ 红灯时后面的闸步被 skipped
 *   ⇒ ⇒ 记录没交上来 ⇒ ⇒ **分母会自己缩水** ⇒ ⇒ 「红 0 ｜ 20 道」会被读成全绿。
 * ⇒ ⇒ 现在汇总步**自己**从 workflow 定义算出「该验几道」（**覆盖闸同一套发现逻辑**）
 *   ⇒ ⇒ 报「该验 30 ｜ 实跑 20 ⇒ ⇒ 少跑 10 道 ⇒ ⇒ 那一格判不了」。
 * ⚠️ 那个面可以用 `GATE_WORKFLOWS_DIR` 指到别处 ⇒ ⇒ 便于对着**别的面**验证。
 */

import { existsSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedGates, workflowNameOf } from './gate-coverage.mjs';

export const RESULT_PREFIX = 'GATE_RESULT';

/**
 * 解析一行结果记录 ⇒ ⇒ 解析不了就返回 null（**不计数**，但调用方要知道有坏行）。
 *
 * ⚠️ **四段 / 五段都认**（2026-11-11 本刀）：
 *   四段 ＝ GATE_RESULT<TAB>target<TAB>exit<TAB>verdict（**历史记录逐字不变**）
 *   五段 ＝ 上面四段 ＋ <TAB>job（job 身份 ⇒ ⇒ 「这条结论是哪个 job 交的」）
 * ⇒ ⇒ **老记录没有 job 那一格** ⇒ ⇒ 它**仍然被计入分母**（不许丢）
 * ⇒ ⇒ 但它**归不到 job** ⇒ ⇒ 那一格「归因」只能说「不知道是哪个 job」。
 *
 * @param {string} line
 * @returns {{target: string, exit: number, verdict: string, job: string} | null}
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
  const job = parts.length >= 5 ? String(parts[4] || '').trim() : '';
  return { target, exit, verdict, job };
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

/**
 * 「该验几道」对账 ⇒ ⇒ 分母的**分母**。
 *
 * ⚠️ 为什么要有它（2026-11-11 真 CI 实测，run 42783415633）：
 *   汇总步的输入是「**收到几条判读记录**」⇒ ⇒ 红灯时后面的闸步被 skipped
 *   ⇒ ⇒ 记录没交上来 ⇒ ⇒ 分母从 **30 缩到 20** ⇒ ⇒ 「红 0 ｜ 20 道」
 *   ⇒ ⇒ 会被读成**全绿** ⇒ ⇒ **假绿**。
 *   ⇒ ⇒ 而「该验几道」是 workflow 定义里**写着的事实** ⇒ ⇒ 自己算 ⇒ ⇒
 *   汇总步就能说「该验 30 ｜ 实跑 20 ⇒ ⇒ 少跑 10 道 ⇒ ⇒ 那一格判不了」。
 *
 * ⚠️ **同名闸在两个 job 里各跑一次** ⇒ ⇒ 按**多重集**比（不是集合）
 *   ⇒ ⇒ 否则「跑了一次」会被当成「两次都跑了」⇒ ⇒ 少跑的那道就消失了。
 *
 * @param {{total:number, expected:number, gates:string[], recorded:{target:string}[]}} input
 * @returns {{expected:number, actual:number, shortfall:number, missing:string[]}}
 */
export function compareDenominator({ total, expected, gates, recorded }) {
  const norm = (p) => String(p == null ? '' : p).replace(/\\/g, '/').trim();
  const base = (p) => norm(p).split('/').pop();
  const need = new Map();
  for (const g of gates || []) {
    const k = norm(g);
    need.set(k, (need.get(k) || 0) + 1);
  }
  const have = new Map();
  for (const r of recorded || []) {
    const k = norm(r.target);
    have.set(k, (have.get(k) || 0) + 1);
  }
  const missing = [];
  for (const [k, n] of need) {
    let left = n - (have.get(k) || 0);
    if (left <= 0) continue;
    // ⚠️ 路径前缀可能不同（有的 job 跑的是 shadow/scripts/…）⇒ ⇒ 退回按**文件名**配。
    if (left > 0) {
      const b = base(k);
      let spare = 0;
      for (const [hk, cnt] of have) {
        if (base(hk) === b && hk !== k) spare += cnt;
      }
      const use = Math.min(left, spare);
      left -= use;
      for (const [hk, cnt] of have) {
        if (base(hk) === b && hk !== k && cnt > 0) {
          have.set(hk, cnt - 1);
          break;
        }
      }
    }
    for (let i = 0; i < left; i++) missing.push(k);
  }
  const expectedN = Number(expected) || 0;
  const actualN = Number(total) || 0;
  return {
    expected: expectedN,
    actual: actualN,
    shortfall: Math.max(0, expectedN - actualN),
    missing,
  };
}

/**
 * 「**谁该跑没跑** ⇒ ⇒ **归到 job ＋ 归到步**」的判据（纯函数 · 零 I/O）。
 *
 * ⚠️ **为什么不能靠「记录协议补 step 级跳过原因」**（2026-11-11 实测）：
 *   **被跳过的步根本没跑** ⇒ ⇒ 它**一行记录都写不出来** ⇒ ⇒
 *   ⇒ ⇒ 「我为什么没跑」**不能自报** ⇒ ⇒ 只能由**别的**证据推出来。
 *   ⇒ ⇒ 推的原料有三样（都在手边）：
 *     ① **定义**：哪个 job 的第几步跑哪道闸（`expectedGates` 的 plan）；
 *     ② **已交记录**：哪些闸真的跑了、结论是什么（`GATE_RESULT` 行）；
 *     ③ **平台语义**：一步失败 ⇒ ⇒ 后面那几步被 **skipped**。
 *
 * ⚠️ **归因规则（三条，逐条都有自检用例）**：
 *   ❶ 一个 job 里，**某道闸没交记录** ⇒ ⇒ 它在那个 job 里**少跑了**；
 *   ❷ **它前面最近的一个「红闸」** ⇒ ⇒ 就是**挡住它的那一步**
 *      （⚠️ 前提：**闸步之间没有 if: always()** ⇒ ⇒ 带 if 的闸**不算被跳过**）；
 *   ❸ **没有红闸在前面** ⇒ ⇒ 挡住它的**不是闸**（是别的步红了）
 *      ⇒ ⇒ 那一格**归因判不了** ⇒ ⇒ **不许猜**（说「判不了」，不编一个）。
 *
 * ⚠️ **「判不了」不许塞进「归因」那一格**：归因要么指到一个**具体的步**，
 *    要么明说「判不了」⇒ ⇒ **不许输出一个没有证据的步号**。
 *
 * @param {{jobs: {id:string,name:string,gates:object[]}[], recorded: {target:string,verdict:string,job:string}[]}} input
 * @returns {{byJob: object[], missing: object[], attributable: number, unattributable: number}}
 */
export function attributeSkips({ jobs, recorded }) {
  const base = (p) => String(p == null ? '' : p).replace(/\\/g, '/');
  const tail = (p) => base(p).split('/').pop();
  const recs = Array.isArray(recorded) ? recorded : [];
  const byJob = [];
  const missing = [];
  let attributable = 0;
  let unattributable = 0;
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const gates = Array.isArray(job.gates) ? job.gates : [];
    if (gates.length === 0) continue;
    // 本 job 交上来的记录（**按 job 身份**筛 ⇒ ⇒ 老记录没 job ⇒ ⇒ 归不到这儿）。
    const mine = recs.filter((r) => r.job && r.job === job.id);
    // 按「文件名」配对（有的 job 跑的是 shadow/scripts/… ⇒ ⇒ 前缀不同）。
    const pool = mine.slice();
    const consumed = new Set();
    const state = new Map();
    for (const g of gates) {
      const t = tail(g.script);
      let hit = -1;
      for (let i = 0; i < pool.length; i += 1) {
        if (consumed.has(i)) continue;
        if (tail(pool[i].target) === t) { hit = i; break; }
      }
      if (hit >= 0) {
        consumed.add(hit);
        state.set(g, pool[hit]);
      } else {
        state.set(g, null);
      }
    }
    // 找**最近的、位于它前面的红闸** ⇒ ⇒ 那就是挡住它的那一步。
    for (const g of gates) {
      if (state.get(g)) continue;
      // ❶ 带 if: always() 之类 ⇒ ⇒ 前一步红了它照样跑 ⇒ ⇒ 它没交记录**不是被跳过**。
      if (g.runsAfterFailure) {
        missing.push({
          job: job.id, jobName: job.name, script: g.script, step: g.stepNo,
          stepName: g.name, reason: 'runs-after-failure',
        });
        unattributable += 1;
        continue;
      }
      let blocker = null;
      for (const prev of gates) {
        if (prev.stepNo >= g.stepNo) continue;
        const r = state.get(prev);
        if (!r) continue;
        if (r.verdict === 'red') blocker = prev;
      }
      if (blocker) {
        attributable += 1;
        missing.push({
          job: job.id, jobName: job.name, script: g.script, step: g.stepNo,
          stepName: g.name, reason: 'skipped-after-red',
          blockedBy: { script: blocker.script, step: blocker.stepNo, stepName: blocker.name },
        });
      } else {
        unattributable += 1;
        missing.push({
          job: job.id, jobName: job.name, script: g.script, step: g.stepNo,
          stepName: g.name, reason: 'no-red-gate-before',
        });
      }
    }
    byJob.push({
      id: job.id, name: job.name, expected: gates.length,
      recorded: mine.length,
    });
  }
  return { byJob, missing, attributable, unattributable };
}

/** 汇总 ⇒ ⇒ 一句人话（**必须带分母**）。 */
export function renderTally(result, denominator, attribution) {
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
  // ⚠️ **分母的口径**（2026-11-11 本刀）—— 「该验几道」与「实跑几道」必须一起读。
  // ⚠️ **归因那一段**（2026-11-11 本刀）—— 「少跑的那几道」归到 **job ＋ 步**。
  //    ⚠️ 只在**有 job 身份**的记录上成立 ⇒ ⇒ 没有就明说「归不了」，不猜。
  if (attribution && attribution.missing && attribution.missing.length > 0) {
    lines.push(
      '⇒ ⇒ ⚠️ 少跑的那几道**归因**（谁该跑没跑 ⇒ ⇒ 归到 job ＋ 归到步）：',
    );
    for (const m of attribution.missing) {
      if (m.reason === 'skipped-after-red' && m.blockedBy) {
        lines.push(
          '     · ' + m.jobName + ' 第 ' + m.step + ' 步「' + m.stepName + '」⇒ ⇒ **被第 ' +
          m.blockedBy.step + ' 步「' + m.blockedBy.stepName + '」挡住了**（那一步红了）',
        );
      } else if (m.reason === 'runs-after-failure') {
        lines.push(
          '     · ' + m.jobName + ' 第 ' + m.step + ' 步「' + m.stepName + '」⇒ ⇒ 它带 if ⇒ ⇒ ' +
          '**前一步红了它照样跑** ⇒ ⇒ 它没交记录**不是被跳过** ⇒ ⇒ 这一格真丢了',
        );
      } else {
        lines.push(
          '     · ' + m.jobName + ' 第 ' + m.step + ' 步「' + m.stepName + '」⇒ ⇒ **归因判不了**' +
          '（它前面没有红的闸 ⇒ ⇒ 挡住它的不是闸 ⇒ ⇒ 不许猜）',
        );
      }
    }
  }

  if (denominator && denominator.unreadable) {
    lines.push('⇒ ⇒ ⚠️ **该验几道：读不出**（' + (denominator.reason || '原因未记录') + '）⇒ ⇒ 这一格的分母口径判不了');
  } else if (denominator) {
    if (denominator.shortfall > 0) {
      lines.push(
        '⇒ ⇒ ⚠️ **该验 ' + denominator.expected + ' 道 ｜ 实跑 ' + denominator.actual +
          ' 道 ⇒ ⇒ 少跑 ' + denominator.shortfall + ' 道 ⇒ ⇒ 那一格判不了**（不是「全绿」）',
      );
      for (const m of denominator.missing) lines.push('     · 少跑：' + m);
      lines.push('⇒ ⇒ ⚠️ 少跑的那几道**没跑** ⇒ ⇒ 那几格**从没被查过** ⇒ ⇒ 不许当成「没问题」');
    } else if (denominator.expected === denominator.actual) {
      lines.push('⇒ ⇒ ✅ 分母齐：该验 ' + denominator.expected + ' 道 ＝ 实跑 ' + denominator.actual + ' 道');
    } else {
      lines.push(
        '⇒ ⇒ ⚠️ 实跑 ' + denominator.actual + ' 道 ＞ 该验 ' + denominator.expected +
          ' 道 ⇒ ⇒ 多出来的那些不属于这一盏灯 ⇒ ⇒ 请核（不是「跑得更多就更好」）',
      );
    }
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

  // ── 「该验几道」对账（2026-11-11 本刀）──
  add('分母对账：该验 3 ｜ 实跑 2 ⇒ ⇒ 少跑 1 道，且**点名**少跑的那道', () => {
    const d = compareDenominator({
      total: 2,
      expected: 3,
      gates: ['scripts/check-a.mjs', 'scripts/check-b.mjs', 'scripts/check-c.mjs'],
      recorded: [{ target: 'scripts/check-a.mjs' }, { target: 'scripts/check-b.mjs' }],
    });
    return d.shortfall === 1 && d.missing.length === 1 && d.missing[0].includes('check-c');
  });

  add('分母对账：孪生 —— 期望改成 2 ⇒ ⇒ 少跑变 0（**这一格不是恒真**）', () => {
    const mk = (expected) => compareDenominator({
      total: 2,
      expected,
      gates: ['scripts/check-a.mjs', 'scripts/check-b.mjs', 'scripts/check-c.mjs'],
      recorded: [{ target: 'scripts/check-a.mjs' }, { target: 'scripts/check-b.mjs' }],
    });
    return mk(3).shortfall === 1 && mk(2).shortfall === 0 && mk(5).shortfall === 3;
  });

  add('分母对账：**同一个闸在两个 job 里各跑一次** ⇒ ⇒ 跑一次仍算「少跑 1 道」（按多重集比）', () => {
    const d = compareDenominator({
      total: 1,
      expected: 2,
      gates: ['scripts/check-a.mjs', 'scripts/check-a.mjs'],
      recorded: [{ target: 'scripts/check-a.mjs' }],
    });
    return d.shortfall === 1 && d.missing.length === 1;
  });

  add('分母对账：路径前缀不同（shadow/scripts/…）⇒ ⇒ 仍认得出是同一道', () => {
    const d = compareDenominator({
      total: 1,
      expected: 1,
      gates: ['scripts/check-a.mjs'],
      recorded: [{ target: 'shadow/scripts/check-a.mjs' }],
    });
    return d.shortfall === 0;
  });

  add('渲染：**少跑 ⇒ ⇒ 必须说「那一格判不了」且不许读成全绿**', () => {
    const out = renderTally(tally(['GATE_RESULT\ta\t0\tok']), {
      expected: 2,
      actual: 1,
      shortfall: 1,
      missing: ['scripts/check-b.mjs'],
    });
    return out.includes('少跑 1 道') && out.includes('判不了') && out.includes('不是「全绿」') && out.includes('check-b');
  });

  add('渲染：分母齐 ⇒ ⇒ 明说「该验 N ＝ 实跑 N」', () => {
    const out = renderTally(tally(['GATE_RESULT\ta\t0\tok']), {
      expected: 1,
      actual: 1,
      shortfall: 0,
      missing: [],
    });
    return out.includes('分母齐');
  });

  add('渲染：**该验几道读不出 ⇒ ⇒ 说「判不了」，不许静默**', () => {
    const out = renderTally(tally(['GATE_RESULT\ta\t0\ok']), { unreadable: true, reason: '找不到定义' });
    return out.includes('读不出') && out.includes('判不了');
  });

  // ── 归因（2026-11-11 本刀）：从「定义 ＋ 已交记录」反推「谁挡了它」──
  const jobsFx = [
    {
      id: 'j1',
      name: 'J1',
      gates: [
        { script: 'scripts/a.mjs', name: 'A', stepNo: 2, strict: true, runsAfterFailure: false },
        { script: 'scripts/b.mjs', name: 'B', stepNo: 3, strict: true, runsAfterFailure: false },
        { script: 'scripts/c.mjs', name: 'C', stepNo: 4, strict: true, runsAfterFailure: false },
      ],
    },
  ];
  const recRedB = [
    { target: 'scripts/a.mjs', exit: 0, verdict: 'ok', job: 'j1' },
    { target: 'scripts/b.mjs', exit: 1, verdict: 'red', job: 'j1' },
  ];

  add('归因：B 红 ⇒ ⇒ C 少跑 ⇒ ⇒ **归因到第 3 步「B」**', () => {
    const a = attributeSkips({ jobs: jobsFx, recorded: recRedB });
    const c = a.missing.find((m) => m.script === 'scripts/c.mjs');
    return a.missing.length === 1 && c && c.reason === 'skipped-after-red' &&
      c.blockedBy && c.blockedBy.step === 3 && c.blockedBy.stepName === 'B' && c.step === 4;
  });

  add('归因孪生：**没有红闸在前面** ⇒ ⇒ 归因判不了（**不许猜一个步号**）', () => {
    const a = attributeSkips({
      jobs: jobsFx,
      recorded: [{ target: 'scripts/a.mjs', exit: 0, verdict: 'ok', job: 'j1' }],
    });
    const c = a.missing.find((m) => m.script === 'scripts/b.mjs');
    return a.missing.length === 2 && c && c.reason === 'no-red-gate-before' && !c.blockedBy;
  });

  add('归因孪生：**带 if 的闸没交记录 ⇒ ⇒ 不是被跳过**（真丢了）', () => {
    const a = attributeSkips({
      jobs: [{ id: 'j2', name: 'J2', gates: [
        { script: 'scripts/x.mjs', name: 'X', stepNo: 2, strict: true, runsAfterFailure: true },
      ] }],
      recorded: [],
    });
    return a.missing.length === 1 && a.missing[0].reason === 'runs-after-failure' &&
      a.unattributable === 1;
  });

  add('归因孪生：**没有 job 身份的老记录** ⇒ ⇒ 归不到 job ⇒ ⇒ 那一格不算「少跑」', () => {
    const a = attributeSkips({
      jobs: jobsFx,
      recorded: [{ target: 'scripts/a.mjs', exit: 0, verdict: 'ok', job: '' }],
    });
    return a.byJob[0].recorded === 0 && a.missing.length === 3;
  });

  add('归因孪生：**别的 job 的红闸** ⇒ ⇒ 挡不到本 job 的步（归因不许跨 job）', () => {
    const a = attributeSkips({
      jobs: jobsFx,
      recorded: [
        { target: 'scripts/a.mjs', exit: 0, verdict: 'ok', job: 'j1' },
        { target: 'scripts/b.mjs', exit: 1, verdict: 'red', job: 'OTHER' },
      ],
    });
    const c = a.missing.find((m) => m.script === 'scripts/c.mjs');
    return c && c.reason === 'no-red-gate-before' && !c.blockedBy;
  });

  add('渲染：归因那一段 ⇒ ⇒ 逐字点名「被第 N 步挡住了」', () => {
    const a = attributeSkips({ jobs: jobsFx, recorded: recRedB });
    const out = renderTally(tally(['GATE_RESULT\tscripts/a.mjs\t0\tok']), {
      expected: 3, actual: 2, shortfall: 1, missing: ['scripts/c.mjs'],
    }, a);
    return out.includes('归因') && out.includes('被第 3 步「B」挡住了');
  });

  add('渲染：归因判不了 ⇒ ⇒ **不许输出步号**（那一格不许看起来像归到了某一步）', () => {
    const a = attributeSkips({ jobs: jobsFx, recorded: [] });
    const out = renderTally(tally(['GATE_RESULT\tscripts/a.mjs\t0\tok']), {
      expected: 3, actual: 1, shortfall: 2, missing: [],
    }, a);
    return out.includes('归因判不了') && !out.includes('挡住了');
  });

  add('**老记录（四段）仍然被计入分母** ⇒ ⇒ 解析不丢', () => {
    const p = parseResultLine('GATE_RESULT\tscripts/a.mjs\t0\tok');
    return p && p.target === 'scripts/a.mjs' && p.verdict === 'ok' && p.job === '';
  });

  add('**新记录（五段）读得出 job 身份**', () => {
    const p = parseResultLine('GATE_RESULT\tscripts/a.mjs\t0\tok\tbrain-gates');
    return p && p.job === 'brain-gates';
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
// 「该验几道」—— 从 workflow 定义里**现算**（2026-11-11 本刀）
// ---------------------------------------------------------------------------

/** 仓根（**从脚本自身位置**推 ⇒ ⇒ 不看 cwd ⇒ ⇒ 哪个 job 跑都对得上）。 */
function repoRootOf() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}

/**
 * 「该验几道」对账。
 *
 * ⚠️ 只有在 **CI 里**（GITHUB_WORKFLOW 有值）才做 ⇒ ⇒ 本机随手跑汇总步时
 *   没有「这一盏灯」⇒ ⇒ 不比较 ⇒ ⇒ 不制造噪声。
 * ⚠️ 用**覆盖闸同一套**发现逻辑（expectedGates）⇒ ⇒ 零手写名单。
 */
function readExpectedDenominator(result, workflowsDir) {
  const wfName = String(process.env.GITHUB_WORKFLOW || '');
  if (!wfName) return null;
  const dir = workflowsDir || join(repoRootOf(), '.github', 'workflows');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
  } catch (err) {
    return { unreadable: true, reason: '读不到 .github/workflows' };
  }
  let hit = null;
  for (const f of files) {
    let text = '';
    try {
      text = readFileSync(join(dir, f), 'utf8');
    } catch (err) {
      continue;
    }
    // ⚠️ **便宜的预筛**（先看含不含这个名字）⇒ ⇒ 只解析那一个文件。
    if (!text.includes(wfName)) continue;
    if (workflowNameOf(text) === wfName) {
      hit = { file: f, text };
      break;
    }
  }
  if (!hit) {
    return { unreadable: true, reason: '找不到名字是「' + wfName + '」的 workflow 定义' };
  }
  const exp = expectedGates({ text: hit.text, jobId: String(process.env.GITHUB_JOB || '') });
  const cmp = compareDenominator({
    total: result.total,
    expected: exp.expected,
    gates: exp.gates,
    recorded: result.entries,
  });
  // ⚠️ **归因**（2026-11-11 本刀）—— 用**同一份**定义 ＋ 已交记录反推。
  const attribution = attributeSkips({ jobs: exp.jobs, recorded: result.entries });
  return Object.assign({}, cmp, { scope: exp.scope, file: hit.file, attribution });
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
  const denominator = readExpectedDenominator(result, process.env.GATE_WORKFLOWS_DIR || null);
  const text = renderTally(result, denominator, denominator ? denominator.attribution : null);
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

// ⚠️⚠️ **入口守卫** —— 这个文件同时是**判据库**（被别的脚本 import）
//    ⇒ ⇒ 若没有守卫 ⇒ ⇒ 一 import 就执行下面的 CLI 块 ⇒ ⇒ **把宿主进程直接带走**
//    ⇒ ⇒ （2026-11-11 实测：探针一 import 它就打印「用法」并退出 2 ⇒ ⇒ 探针整个死了）
//    ⇒ ⇒ **「库文件带 CLI 块」必须自己守入口**（`gate-coverage.mjs` 与
//    ⇒ ⇒ `gate-runner.mjs` 都有这一段 ⇒ ⇒ 本库是**唯一漏掉**的那个 ⇒ ⇒ 补齐）。
const invokedDirectly = (() => {
  try {
    const here = process.argv[1] ? resolve(process.argv[1]) : '';
    const self = resolve(fileURLToPath(import.meta.url));
    return here === self;
  } catch (err) {
    return false;
  }
})();

if (invokedDirectly) {
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
}
