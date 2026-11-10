#!/usr/bin/env node
/**
 * 闸的**分母覆盖**闸 —— 「**有闸但没分母**」这一族的守门人
 * ============================================================================
 *
 * ## 病（2026-11-11 真 CI 实测）
 *
 * 中心流水线（ci.yml）里 **30 道闸**，而**只有 4 道**走了 `run-gate-once`
 * ⇒ ⇒ 也就是说：**只有 4 道的结论被收走** ⇒ ⇒
 * ⇒ ⇒ 那盏绿灯的**分母是 4** ⇒ ⇒ 「一盏绿灯」证明的东西比它看起来少得多
 * ⇒ ⇒ 剩下的 26 道（a11y 契约 / provider 对齐 / legacy 残留 / neuron 归属 /
 * 端脑链路 / 状态面 / 失败掩码 / 偏好撤销 / 死环境变量 / token 漂移 …）
 * ⇒ ⇒ **跑没跑、判没判成，绿灯里一个字都没说**。
 *
 * ⇒ ⇒ **通用形态**：**绿灯没有分母** ⇒ ⇒ 「绿」这个字**不含量**
 *        ⇒ ⇒ 「没验成」的那几格被同一次绿灯吞掉了 ⇒ ⇒
 *        ⇒ ⇒ 与「失败长得像成功」同族，落在**读数**这一层。
 *
 * ## 它判什么（三条）
 *
 *   C1  闸步**必须**经由判读通道（`run-gate-once.mjs`）⇒ ⇒ 否则它的结论没人收
 *   C2  含闸步的 job **必须**有汇总步（`gate-tally.mjs --report`）⇒ ⇒ 否则那盏灯没分母
 *   C3  有汇总步的 job **必须**有落盘步（写 `GATE_RESULT_FILE=`）⇒ ⇒
 *       否则汇总会读到空文件 ⇒ ⇒ 它会报「一行记录都没有」⇒ ⇒ **看着像绿**
 *
 * ## 处置：存量登记 ＋ 增量纪律（与治理闸同款）
 *
 *   · **严格名单**（ci.yml ／ unwired-gates.yml ／ ledger-take-discipline.yml ／
 *     gate-tally-coverage.yml）⇒ ⇒ **不留例外** ⇒ ⇒ 它们的缺口一律红；
 *   · 其它 workflow 的缺口 ⇒ ⇒ 对照 `scripts/lib/gate-coverage-debt.mjs`：
 *       登记在册 ⇒ ⇒ 放行（但打印）｜ 没登记 ⇒ ⇒ **红**（新增即错）
 *       ｜ 登记了却已修好 ⇒ ⇒ **红**（要销账）。
 *
 * 用法：
 *   node scripts/check-gate-tally-coverage.mjs            # 判
 *   node scripts/check-gate-tally-coverage.mjs --self-test # 判据自检
 *   node scripts/check-gate-tally-coverage.mjs --json      # 机器可读
 *   node scripts/check-gate-tally-coverage.mjs --root=<dir> # 换一个 workflow 目录
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeWorkflow, reconcileCoverage, renderCoverage } from './lib/gate-coverage.mjs';
import { NOT_TALLIED_WORKFLOWS } from './lib/gate-coverage-debt.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');

/**
 * 严格名单：这几盏灯**不留例外** ⇒ ⇒ 它们的缺口一律红。
 * ⚠️ 名单是**显式**的 ⇒ ⇒ 「又长出一盏没分母的灯」⇒ ⇒ 它要么进名单（自证合规），
 *    要么进存量债表 ⇒ ⇒ **不许悄悄多一盏**。
 */
export const STRICT_WORKFLOWS = [
  'ci.yml',
  'unwired-gates.yml',
  'ledger-take-discipline.yml',
  'gate-tally-coverage.yml',
];

function parseArgs(argv) {
  const opts = { selfTest: false, json: false, root: WORKFLOWS_DIR, registry: NOT_TALLIED_WORKFLOWS };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--root=')) opts.root = resolve(arg.slice('--root='.length));
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * 扫一个 workflow 目录 ⇒ ⇒ 逐个判。
 * @param {string} dir
 * @returns {{results:object[], files:string[]}}
 */
export function auditDir(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
  const results = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    results.push(judgeWorkflow(text, { file: f }));
  }
  return { results, files };
}

function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const compliant = [
    'jobs:',
    '  a:',
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
  const direct = compliant.replace(
    'run: node scripts/run-gate-once.mjs --strict scripts/check-foo.mjs',
    'run: node scripts/check-foo.mjs',
  );

  const withDir = (files, fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-coverage-'));
    try {
      for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, 'utf8');
      return fn(dir);
    } finally {
      // ⚠️ 临时目录留在系统临时区 ⇒ ⇒ 不动它（删除通道在 CI 上另说）
    }
  };

  add('一个完全合规的 workflow ⇒ ⇒ 零缺口、零债', () => {
    const { results } = withDir({ 'ok.yml': compliant }, (dir) => auditDir(dir));
    const cmp = reconcileCoverage(results, {}, []);
    return cmp.unregistered.length === 0 && cmp.stale.length === 0 && cmp.strictFindings.length === 0;
  });

  add('闸步直跑 ⇒ ⇒ **新缺口**（没登记）⇒ ⇒ 红', () => {
    const { results } = withDir({ 'bad.yml': direct }, (dir) => auditDir(dir));
    const cmp = reconcileCoverage(results, {}, []);
    return cmp.unregistered.length === 1;
  });

  add('登记在册的缺口 ⇒ ⇒ 放行（只报，不红）', () => {
    const { results } = withDir({ 'bad.yml': direct }, (dir) => auditDir(dir));
    const cmp = reconcileCoverage(results, { 'bad.yml': { why: 'x', when: 'y' } }, []);
    return cmp.unregistered.length === 0 && cmp.tolerated.length === 1;
  });

  add('登记了、但缺口已修好 ⇒ ⇒ **要销账** ⇒ ⇒ 红', () => {
    const { results } = withDir({ 'ok.yml': compliant }, (dir) => auditDir(dir));
    const cmp = reconcileCoverage(results, { 'ok.yml': { why: 'x', when: 'y' } }, []);
    return cmp.stale.length === 1;
  });

  add('严格名单里的文件 ⇒ ⇒ **不留例外** ⇒ ⇒ 有缺口就红', () => {
    const { results } = withDir({ 'ci.yml': direct }, (dir) => auditDir(dir));
    const cmp = reconcileCoverage(results, {}, ['ci.yml']);
    return cmp.strictFindings.length >= 1 && cmp.unregistered.length === 0;
  });

  add('读数里**带分母**（闸步数 / 经由通道数 / 有分母的 job 数）', () => {
    const { results } = withDir({ 'ok.yml': compliant }, (dir) => auditDir(dir));
    const text = renderCoverage(results[0]);
    return text.includes('闸步 1') && text.includes('经由判读通道 1');
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) selfTest();

  if (!existsSync(opts.root)) {
    console.error('❌ 读不到 workflow 目录：' + opts.root + ' ⇒ ⇒ 判不了 ≠ 没问题');
    process.exit(2);
  }

  let scanned;
  try {
    scanned = auditDir(opts.root);
  } catch (err) {
    console.error('❌ 读 workflow 目录失败：' + err.message + ' ⇒ ⇒ 判不了 ≠ 没问题');
    process.exit(2);
  }
  if (scanned.results.length === 0) {
    console.error('❌ 一个 workflow 都没扫到 ⇒ ⇒ 判不了 ≠ 没问题');
    process.exit(2);
  }

  const cmp = reconcileCoverage(scanned.results, opts.registry, STRICT_WORKFLOWS);

  const totals = scanned.results.reduce(
    (acc, r) => {
      acc.gates += r.gateCount;
      acc.tallied += r.talliedGates;
      acc.jobsWithGates += r.jobsWithGates;
      acc.jobsWithDenominator += r.jobsWithDenominator;
      return acc;
    },
    { gates: 0, tallied: 0, jobsWithGates: 0, jobsWithDenominator: 0 },
  );

  const hardFailures = [
    ...cmp.strictFindings.map((f) => ({ kind: f.kind, file: f.file, message: f.message })),
    ...cmp.unregistered.map((f) => ({
      kind: 'unregistered-gap',
      file: f.file,
      message:
        'workflow「' + f.file + '」有 ' + f.count + ' 条分母缺口（' + f.kinds.join('、') +
        '）⇒ ⇒ **没登记** ⇒ ⇒ 新增即错（要么把它的闸步接进判读通道，要么显式登记成存量债）',
    })),
    ...cmp.stale.map((f) => ({
      kind: 'debt-stale',
      file: f.file,
      message:
        'workflow「' + f.file + '」登记在册的「没有分母」缺口**已经不存在**了 ⇒ ⇒ **要销账**（清单不许过期）',
    })),
  ];

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          totals,
          strict: STRICT_WORKFLOWS,
          findings: cmp.strictFindings,
          tolerated: cmp.tolerated,
          unregistered: cmp.unregistered,
          stale: cmp.stale,
          perFile: scanned.results.map((r) => ({
            file: r.file,
            gates: r.gateCount,
            tallied: r.talliedGates,
            jobsWithGates: r.jobsWithGates,
            jobsWithDenominator: r.jobsWithDenominator,
            findings: r.findings.length,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      '⇒ ⇒ 闸的分母覆盖：扫了 ' + scanned.results.length + ' 个 workflow ｜ 闸步 ' +
        totals.gates + ' ｜ 经由判读通道 ' + totals.tallied + ' ｜ 有闸的 job ' +
        totals.jobsWithGates + ' ｜ 有分母的 job ' + totals.jobsWithDenominator,
    );
    for (const r of scanned.results) {
      const mark = r.findings.length === 0 ? '✔' : '·';
      console.log(
        '   ' + mark + ' ' + r.file.padEnd(34) + ' 闸步 ' + String(r.gateCount).padStart(2) +
          ' ｜ 经由通道 ' + String(r.talliedGates).padStart(2) + ' ｜ 有闸的 job ' +
          r.jobsWithGates + ' ｜ 有分母 ' + r.jobsWithDenominator,
      );
    }
    for (const t of cmp.tolerated) {
      console.log(
        '⚠ [存量债] workflow「' + t.file + '」的 ' + t.count + ' 条分母缺口已登记 ⇒ ⇒ 放行（但仍可见）',
      );
      console.log('   为什么还没修：' + t.why);
      console.log('   什么时候修：' + t.when);
    }
    for (const f of hardFailures) {
      console.error('❌ [' + f.kind + '] ' + f.message);
    }
    if (hardFailures.length === 0) {
      console.log(
        '✅ 零违规（' + scanned.results.length + ' 个 workflow ｜ 存量债 ' +
          cmp.tolerated.length + ' 条已登记）',
      );
    } else {
      console.error('❌ 共 ' + hardFailures.length + ' 条违规（另有存量债 ' + cmp.tolerated.length + ' 条）');
    }
  }

  process.exit(hardFailures.length > 0 ? 1 : 0);
}

main();
