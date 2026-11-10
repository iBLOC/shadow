/**
 * 闸的**分母覆盖**判据库（纯函数 · 零 I/O ⇒ ⇒ 自检能喂合成夹具）
 * ============================================================================
 *
 * ## 它守的是什么 —— 「**有闸但没分母**」这一族
 *
 * ⚠️ **病（2026-11-11 真 CI 实测）**：中心流水线（ci.yml）里**直跑**的闸
 *    —— mobile-a11y-contract / provider-parity / legacy-residue /
 *    neuron-ownership / e2e-credential-shape / rust-toolchain-pin /
 *    state-surface / failure-masking / preference-revocation / dead-env-vars /
 *    gen_tokens / gen_nav / gen-icons …—— **一道都没有落判读记录** ⇒ ⇒
 *    ⇒ ⇒ 于是那盏绿灯的**分母只有 4 道**（只有走 `run-gate-once` 的那几道）
 *    ⇒ ⇒ ⇒ **「一盏绿灯」证明的东西，比它看起来少得多**。
 *
 * ⇒ ⇒ **通用形态**：**绿灯没有分母** ⇒ ⇒ 「绿」这个字**不含量** ⇒ ⇒
 *        「没验成」的那几格被同一次绿灯吞掉了 ⇒ ⇒ ⇒ 与「失败长得像成功」同族，
 *        落在**读数**这一层。
 *
 * ## 三条判据（每条都有「正向会红」的自检用例）
 *
 *   C1 gate-step-not-tallied   闸步**必须**经由判读通道（`run-gate-once.mjs`）
 *                              ⇒ ⇒ 否则它的结论**没人收** ⇒ ⇒ 分母是假的。
 *   C2 job-without-denominator 含闸步的 job **必须**有汇总步（`gate-tally --report`）
 *                              ⇒ ⇒ 否则「那一盏灯」没有读数。
 *   C3 tally-without-sink      有汇总步的 job **必须**有落盘步（写 `GATE_RESULT_FILE=`）
 *                              ⇒ ⇒ 否则汇总读到**空文件** ⇒ ⇒ 它会报
 *                              「一行结果记录都没有」⇒ ⇒ **看着像绿**。
 *
 * ## 什么**不算**闸步（口径写清楚 ⇒ ⇒ 不许含糊）
 *
 *   · `--self-test` 的步 —— 那是**闸自己的夹具**，不是「一道闸」；
 *   · `--drill` 的步 —— 那是**副本演练**（绿→红→绿），不是一道闸；
 *   · `--report-only` 的步 —— 那是**普查/读数**，不阻断 ⇒ ⇒ 不该占分母。
 *
 * 用法：
 *   node scripts/lib/gate-coverage.mjs --self-test
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanYamlText } from './yaml-valid.mjs';

/** 闸脚本的形状：check-*.mjs ｜ gen_*.mjs ｜ gen-icons.mjs */
// ⚠️ 前缀**允许多段**（`shadow/scripts/check-x.mjs` ⇒ ⇒ 要认得全）
//    ⇒ ⇒ 否则跨仓那个 job 的闸名会被截成 `scripts/check-x.mjs`（认得出，但名字会骗人）。
const GATE_SCRIPT_RE = /(?:[\w.\-\/]*\/)?(check-[a-z0-9][a-z0-9-]*|gen_[a-z0-9_]+|gen-icons)\.mjs/g;

/** 「不算闸步」的参数（见上面的口径）。 */
export const NON_GATE_FLAGS = ['--self-test', '--drill', '--report-only'];

export const CHANNEL_MARK = 'run-gate-once.mjs';
export const TALLY_MARK = 'gate-tally.mjs';
export const SINK_MARK = 'GATE_RESULT_FILE=';

function mapGet(node, key) {
  if (!node || node.type !== 'map') return null;
  for (const e of node.entries || []) {
    if (e.key === key) return e.value;
  }
  return null;
}

function scalarText(node) {
  if (!node) return '';
  if (node.type === 'scalar' || node.type === 'block-scalar') return String(node.value || '');
  return '';
}

/**
 * 把一个 workflow 文本拆成 job ⇒ ⇒ step。
 * @param {string} text
 * @returns {{id:string, name:string, steps:{name:string, run:string}[]}[]}
 */
export function parseWorkflowJobs(text) {
  const doc = scanYamlText(String(text || ''), { workflow: true }).doc;
  const jobsNode = mapGet(doc, 'jobs');
  const out = [];
  if (!jobsNode || jobsNode.type !== 'map') return out;
  for (const entry of jobsNode.entries || []) {
    const jobMap = entry.value;
    const stepsNode = mapGet(jobMap, 'steps');
    const steps = [];
    if (stepsNode && stepsNode.type === 'seq') {
      for (const item of stepsNode.items || []) {
        const stepMap = item.node;
        const run = scalarText(mapGet(stepMap, 'run'));
        const name = scalarText(mapGet(stepMap, 'name'));
        steps.push({ name, run });
      }
    }
    out.push({
      id: String(entry.key),
      name: scalarText(mapGet(jobMap, 'name')) || String(entry.key),
      steps,
    });
  }
  return out;
}

/**
 * 这一步是不是「一道闸」（**不是**自检／演练／普查）。
 * @param {{run:string}} step
 * @returns {{script:string}|null}
 */
export function gateScriptOf(step) {
  const run = String((step && step.run) || '');
  if (!run) return null;
  for (const flag of NON_GATE_FLAGS) {
    if (run.includes(flag)) return null;
  }
  GATE_SCRIPT_RE.lastIndex = 0;
  const m = GATE_SCRIPT_RE.exec(run);
  if (!m) return null;
  return { script: m[0] };
}

/**
 * 判一个 job：闸步清单 ／ 是否经由通道 ／ 有没有分母。
 * @param {{id:string, name:string, steps:{name:string, run:string}[]}} job
 */
export function classifyJob(job) {
  const gates = [];
  let viaChannel = false;
  let hasTally = false;
  let hasSink = false;
  for (const step of job.steps || []) {
    const run = String(step.run || '');
    if (run.includes(CHANNEL_MARK)) viaChannel = true;
    if (run.includes(TALLY_MARK) && run.includes('--report')) hasTally = true;
    if (run.includes(SINK_MARK)) hasSink = true;
    const g = gateScriptOf(step);
    if (g) {
      gates.push({
        name: step.name,
        script: g.script,
        viaChannel: run.includes(CHANNEL_MARK),
      });
    }
  }
  return {
    id: job.id,
    name: job.name,
    gates,
    gateCount: gates.length,
    viaChannel,
    hasTally,
    hasSink,
  };
}

/**
 * 判一个 workflow ⇒ ⇒ 找出三条缺口。
 * @param {string} text
 * @param {{file?:string}} [opts]
 */
export function judgeWorkflow(text, opts) {
  const options = opts || {};
  const file = options.file || '(未知名)';
  const jobs = parseWorkflowJobs(text).map(classifyJob);
  const findings = [];
  for (const job of jobs) {
    for (const g of job.gates) {
      if (!g.viaChannel) {
        findings.push({
          kind: 'gate-step-not-tallied',
          file,
          job: job.id,
          gate: g.script,
          message:
            'workflow「' + file + '」的 job「' + job.id + '」里有一道闸「' + g.script +
            '」是**直跑**的 ⇒ ⇒ 它的结论**没人收** ⇒ ⇒ 那盏灯的分母是假的',
        });
      }
    }
    if (job.gateCount > 0 && !job.hasTally) {
      findings.push({
        kind: 'job-without-denominator',
        file,
        job: job.id,
        gate: null,
        message:
          'workflow「' + file + '」的 job「' + job.id + '」跑着 ' + job.gateCount +
          ' 道闸 ⇒ ⇒ 却**没有汇总步**（gate-tally --report）⇒ ⇒ 那一盏灯**没有分母**',
      });
    }
    if (job.hasTally && !job.hasSink) {
      findings.push({
        kind: 'tally-without-sink',
        file,
        job: job.id,
        gate: null,
        message:
          'workflow「' + file + '」的 job「' + job.id + '」有汇总步 ⇒ ⇒ 却**没有落盘步**' +
          '（写 GATE_RESULT_FILE=）⇒ ⇒ 汇总会读到空文件 ⇒ ⇒ 它会报「一行记录都没有」' +
          '⇒ ⇒ **看着像绿**',
      });
    }
  }
  return {
    file,
    jobs,
    findings,
    gateCount: jobs.reduce((a, j) => a + j.gateCount, 0),
    talliedGates: jobs.reduce(
      (a, j) => a + j.gates.filter((g) => g.viaChannel).length,
      0,
    ),
    jobsWithDenominator: jobs.filter((j) => j.gateCount > 0 && j.hasTally).length,
    jobsWithGates: jobs.filter((j) => j.gateCount > 0).length,
  };
}

/**
 * 债对账：把「实测缺口」与「登记在册的存量债」对账。
 *
 * ⚠️ 与治理闸（check-gate-discipline.mjs）**同款纪律**：
 *   · 实测有缺口、登记没有 ⇒ ⇒ **新增即错** ⇒ ⇒ 红（不许悄悄长出来）；
 *   · 登记在册 ⇒ ⇒ **放行**（但仍然打印 ⇒ ⇒ 放行 ≠ 看不见）；
 *   · 登记在册、但实测**没有**缺口了 ⇒ ⇒ **要销账** ⇒ ⇒ 红（清单不许过期）。
 * ⚠️ 而 `strictFiles`（主 CI 与本仓自己新建的灯）**不留例外** ⇒ ⇒
 *    它们的缺口一律红 ⇒ ⇒ 那几盏灯不许欠。
 *
 * @param {{file:string, findings:object[]}[]} results
 * @param {Record<string, {why:string, when:string}>} registry
 * @param {string[]} strictFiles
 */
export function reconcileCoverage(results, registry, strictFiles) {
  const reg = registry || {};
  const strict = new Set(strictFiles || []);
  const tolerated = [];
  const unregistered = [];
  const stale = [];
  const strictFindings = [];

  for (const res of results || []) {
    const file = res.file;
    const findings = res.findings || [];
    if (strict.has(file)) {
      for (const f of findings) {
        strictFindings.push({ file, kind: f.kind, message: f.message });
      }
      continue;
    }
    const known = Object.prototype.hasOwnProperty.call(reg, file);
    if (findings.length > 0) {
      if (known) {
        tolerated.push({ file, count: findings.length, why: reg[file].why, when: reg[file].when });
      } else {
        unregistered.push({ file, count: findings.length, kinds: [...new Set(findings.map((f) => f.kind))] });
      }
    } else if (known) {
      stale.push({ file });
    }
  }
  return { tolerated, unregistered, stale, strictFindings };
}

/** 汇总一句人话（**必须带分母**）。 */
export function renderCoverage(result) {
  const r = result || {};
  const lines = [];
  lines.push(
    '⇒ ⇒ 闸的分母覆盖：闸步 ' + (r.gateCount || 0) + ' ｜ 经由判读通道 ' +
      (r.talliedGates || 0) + ' ｜ 有闸的 job ' + (r.jobsWithGates || 0) +
      ' ｜ 有分母的 job ' + (r.jobsWithDenominator || 0),
  );
  for (const f of r.findings || []) {
    lines.push('   · [' + f.kind + '] ' + f.message);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 自检 —— 纯夹具 ⇒ ⇒ 不需要磁盘上的任何 workflow
// ---------------------------------------------------------------------------
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const wf = [
    'name: T',
    'on:',
    '  push:',
    '    branches: [master]',
    'jobs:',
    '  a:',
    '    name: A',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: sink',
    '        run: echo "GATE_RESULT_FILE=$RUNNER_TEMP/g.ndjson" >> "$GITHUB_ENV"',
    '      - name: gate',
    '        run: node scripts/run-gate-once.mjs --strict scripts/check-foo.mjs',
    '      - name: tally',
    '        run: node scripts/lib/gate-tally.mjs --report',
    '',
  ].join('\n');

  add('完整合规的 workflow ⇒ ⇒ 零缺口', () => {
    const res = judgeWorkflow(wf, { file: 't.yml' });
    return res.findings.length === 0 && res.gateCount === 1 && res.talliedGates === 1;
  });

  add('闸步**直跑** ⇒ ⇒ 恰好红 C1', () => {
    const bad = wf.replace(
      'run: node scripts/run-gate-once.mjs --strict scripts/check-foo.mjs',
      'run: node scripts/check-foo.mjs',
    );
    const res = judgeWorkflow(bad, { file: 't.yml' });
    return res.findings.length === 1 && res.findings[0].kind === 'gate-step-not-tallied';
  });

  add('有闸但**没有汇总步** ⇒ ⇒ 恰好红 C2', () => {
    const bad = wf.replace('      - name: tally\n        run: node scripts/lib/gate-tally.mjs --report\n', '');
    const res = judgeWorkflow(bad, { file: 't.yml' });
    return res.findings.length === 1 && res.findings[0].kind === 'job-without-denominator';
  });

  add('有汇总步但**没有落盘步** ⇒ ⇒ 恰好红 C3', () => {
    const bad = wf.replace(
      '      - name: sink\n        run: echo "GATE_RESULT_FILE=$RUNNER_TEMP/g.ndjson" >> "$GITHUB_ENV"\n',
      '',
    );
    const res = judgeWorkflow(bad, { file: 't.yml' });
    return res.findings.length === 1 && res.findings[0].kind === 'tally-without-sink';
  });

  add('孪生：自检步**不算**闸步（它不占分母）', () => {
    const st = wf.replace('scripts/check-foo.mjs', 'scripts/check-foo.mjs --self-test');
    const res = judgeWorkflow(st, { file: 't.yml' });
    // ⚠️ 期望是**零缺口**：这个 job 一道闸都没有了 ⇒ ⇒ 「没有闸」不需要分母
    //    ⇒ ⇒ （第一版这里写成「期望 1 条 job-without-denominator」⇒ ⇒ 当场自检红
    //    ⇒ ⇒ 真相是**夹具的期望写错了**，不是判据写错了。）
    return res.gateCount === 0 && res.findings.length === 0;
  });

  add('孪生：演练步（--drill）**不算**闸步', () => {
    const st = wf.replace('scripts/check-foo.mjs', 'scripts/check-foo.mjs --drill');
    const res = judgeWorkflow(st, { file: 't.yml' });
    return res.gateCount === 0;
  });

  add('孪生：普查步（--report-only）**不算**闸步', () => {
    const st = wf.replace('scripts/check-foo.mjs', 'scripts/check-foo.mjs --report-only');
    const res = judgeWorkflow(st, { file: 't.yml' });
    return res.gateCount === 0;
  });

  add('生成器类闸（gen_tokens / gen_nav / gen-icons）**也算**闸步', () => {
    const st = [
      'jobs:',
      '  a:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: gen',
      '        run: node scripts/gen_tokens.mjs -- --check',
      '      - name: gen2',
      '        run: node brand/gen-icons.mjs -- --check',
      '',
    ].join('\n');
    const res = judgeWorkflow(st, { file: 't.yml' });
    return res.gateCount === 2;
  });

  add('跨仓那个 job（仓检在子目录里）⇒ ⇒ 闸步照样认得出', () => {
    const st = [
      'jobs:',
      '  a:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: gate',
      '        run: node shadow/scripts/run-gate-once.mjs --strict shadow/scripts/check-foo.mjs',
      '',
    ].join('\n');
    const res = judgeWorkflow(st, { file: 't.yml' });
    return res.gateCount === 1 && res.findings.length === 1 && res.findings[0].kind === 'job-without-denominator';
  });

  add('没有 jobs 的文本 ⇒ ⇒ 零闸零缺口（不假装有问题）', () => {
    const res = judgeWorkflow('name: T\n', { file: 't.yml' });
    return res.jobs.length === 0 && res.findings.length === 0;
  });

  add('债对账：登记在册的缺口 ⇒ ⇒ **放行**（只报，不红）', () => {
    const cmp = reconcileCoverage(
      [{ file: 'a.yml', findings: [{ kind: 'gate-step-not-tallied' }] }],
      { 'a.yml': { why: 'x', when: 'y' } },
      [],
    );
    return cmp.unregistered.length === 0 && cmp.tolerated.length === 1 && cmp.stale.length === 0;
  });

  add('债对账：新缺口没登记 ⇒ ⇒ 红（新增即错）', () => {
    const cmp = reconcileCoverage(
      [{ file: 'b.yml', findings: [{ kind: 'gate-step-not-tallied' }] }],
      {},
      [],
    );
    return cmp.unregistered.length === 1 && cmp.tolerated.length === 0;
  });

  add('债对账：登记了、但缺口没了 ⇒ ⇒ 红（要销账）', () => {
    const cmp = reconcileCoverage(
      [{ file: 'c.yml', findings: [] }],
      { 'c.yml': { why: 'x', when: 'y' } },
      [],
    );
    return cmp.stale.length === 1 && cmp.tolerated.length === 0;
  });

  add('严格名单（主 CI 那几盏灯）⇒ ⇒ **不留例外** ⇒ ⇒ 缺口一律红', () => {
    const cmp = reconcileCoverage(
      [{ file: 'ci.yml', findings: [{ kind: 'gate-step-not-tallied' }] }],
      { 'ci.yml': { why: 'x', when: 'y' } },
      ['ci.yml'],
    );
    return cmp.strictFindings.length === 1 && cmp.tolerated.length === 0 && cmp.unregistered.length === 0;
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

// ⚠️ **入口守卫** —— 这个文件同时是**判据库**（被 check-gate-tally-coverage.mjs import）
//    ⇒ ⇒ 没有守卫 ⇒ ⇒ 一 import 就执行 CLI 块 ⇒ ⇒ **把宿主进程直接带走**。
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
  } else {
    console.log('用法: node scripts/lib/gate-coverage.mjs --self-test');
    process.exit(2);
  }
}
