#!/usr/bin/env node
/**
 * 「CI 到底跑没跑」闸（2026-11-11）。
 *
 * ## 它守什么
 *
 * **一次「CI 红了」是不是真的红。**
 *
 * · **真红**：job 领到 runner、跑了 step、测试真的挂了 ⇒ ⇒ 这是读数。
 * · **门外红**：job 在**分配 runner 之前**就被拒 ⇒ ⇒ 零 step、runner_id=0、3 秒结束
 *   ⇒ ⇒ **一个测试都没跑** ⇒ ⇒ 「CI 红了」是假的。
 *
 * ⚠️ **为什么这一族在 iBLOC 特别要紧**（2026-11-11 真机实测）：
 * 私有仓（telencephalon 等）的 CI **94 笔笔笔门外红**（0 step / runner_id=0），
 * 而公开仓（shadow 等）跑得好好的 ⇒ ⇒ 「端脑 CI 红了」这句话**从来没有承载过任何信息**。
 *
 * ## 判据（红线三条 ＋ 一个**读数侧**的问法）
 *
 * · R1 **你声称要读的那一笔是门外红** ⇒ ⇒ 红（exit 1）—— 「读数」不存在。
 * · R2 **最近一笔已完成的 run 是门外红** ⇒ ⇒ 红（exit 1）—— 本仓 CI 基础设施此刻坏了。
 * · R3 **你声称要读的那一笔压根没有 run** ⇒ ⇒ 红（exit 1）—— 读数**永远不会存在**。
 *   ⇒ ⇒ ⚠️ 这一条**比 R1 还早一档**（连 run 都没有）⇒ ⇒ 实测（2026-11-11 真机）：我推完
 *   一笔 `fc9b464` 后查 GitHub 侧 ⇒ ⇒ **零 check-run ＋ 零 status** ⇒ ⇒ 而紧接着的下一笔
 *   `1cb151b` **24 道 run 全齐** ⇒ ⇒ ⇒ 同一把尺、同样问法、两次推、一次零一次齐
 *   ⇒ ⇒ ⇒ **⇒ ⇒ 「那一格没读到」有两种可能（事件被并 ／ 尺子口径错）** ⇒ ⇒ ⇒ ⇒
 *   ⇒ ⇒ ⇒ ⇒ **要分开只能靠「尺子自检」** —— **本闸的 `--sha` 问法就是那把尺子**。
 *   ⇒ ⇒ ⚠️ **而「零 run」还要再分两档**（分不清 ⇒ ⇒ 那一格只能判不了）：
 *   **还是分支尖端** ⇒ ⇒ 可能**还没起** ⇒ ⇒ 「判不了」（exit 2）；
 *   **已经不是尖端** ⇒ ⇒ ⇒ **它的 run 永远不会再来了** ⇒ ⇒ ⇒ ⇒ ⇒ **判红**。
 *
 * ## ⚠️ **`--sha` 是**读数侧**的问法，不是 CI 侧的闸**
 *
 *   它问的是「**我声称要读的那一笔**有没有读数」⇒ ⇒ 那是**读者**的问题 ⇒ ⇒
 *   ⇒ ⇒ **CI 问不了自己**（CI 正在跑 ⇒ ⇒ 这一笔至少有一道 run ⇒ ⇒ 问自己必然是绿的）
 *   ⇒ ⇒ ⇒ ⇒ 所以它**不接 `ci.yml`** ⇒ ⇒ ⇒ ⇒ 而它的**接线面是纪律**：
 *   ⇒ ⇒ ⇒ ⇒ ⇒ **每一次要引用某笔 CI 读数之前，先跑它** ⇒ ⇒ ⇒ ⇒ ⇒ ⇒
 *   ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 「读数不存在」从此是**一份机械读数**，而不是靠记性。
 *
 * ⚠️ **历史里的旧门外红只报数、不判红** —— 它们是既成事实，拖红今天的 CI 没有意义；
 *   要按「任何一笔都算」来判，用 --strict。
 *
 * ## ⚠️ **退出码 2 = 判不了 ≠ 没问题**
 *
 * · 0：绿（拿到读数，且不是门外红）
 * · 1：红（门外红）
 * · 2：**判不了**（run 未完成 / 没有 job / 读不到 / gh 不可用）
 *
 * ## 用法
 *
 *     node scripts/check-ci-actually-ran.mjs --self-test
 *     node scripts/check-ci-actually-ran.mjs --run 42663656264
 *     node scripts/check-ci-actually-ran.mjs --recent 10
 *     node scripts/check-ci-actually-ran.mjs --recent 10 --strict --json
 *     node scripts/check-ci-actually-ran.mjs --sha <full-sha>        ← 「这一笔有没有读数」
 *     node scripts/check-ci-actually-ran.mjs --sha <full-sha> --json
 *
 * ⚠️ 跨仓量**私有仓**需要 PAT（CI 上的 GITHUB_TOKEN 跨私有仓读不到）
 *    ⇒ ⇒ 本仓（public）在 CI 上量自己；私有仓那一族在本地量（gh 已有 org 读权限）。
 */
import { execFileSync } from 'node:child_process';
import {
  classifyRun, classifyAll, isAReading, classifyShaRuns,
  RAN, PARTIAL, NEVER_STARTED, CANCELLED, NO_JOBS, UNKNOWN, NO_RUN_PENDING, NO_RUN_SUPERSEDED, KIND_LABELS,
} from './lib/ci-ran-facts.mjs';

const DEFAULT_REPO = 'iBLOC/shadow';

/** 调 gh api；失败 ⇒ ⇒ {ok:false, err}（不是抛 ⇒ ⇒ 「读不到」要能变成 exit 2，不是栈）。 */
function ghApi(path) {
  try {
    const out = execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(out) };
  } catch (e) {
    const raw = e.stderr ? String(e.stderr) : String(e.message);
    return { ok: false, err: raw.trim().split('\n').slice(0, 3).join(' / ') };
  }
}

function fetchRun(repo, id) {
  const r = ghApi('repos/' + repo + '/actions/runs/' + id);
  if (!r.ok) return { ok: false, why: 'run 读不到：' + r.err };
  const jobs = ghApi('repos/' + repo + '/actions/runs/' + id + '/jobs');
  if (!jobs.ok) return { ok: false, why: 'jobs 读不到：' + jobs.err };
  return { ok: true, run: r.data, jobs: jobs.data.jobs || [] };
}

/** 查**某一笔 sha** 名下的全部 run（这才是「我声称要读的那一笔」的读数面）。 */
function fetchRunsBySha(repo, sha) {
  const r = ghApi('repos/' + repo + '/actions/runs?head_sha=' + encodeURIComponent(sha) + '&per_page=100');
  if (!r.ok) return { ok: false, why: 'run 列表读不到：' + r.err };
  return { ok: true, runs: Array.isArray(r.data.workflow_runs) ? r.data.workflow_runs : [] };
}

/** 查分支尖端（用来分「还没起」与「已被取代」）。读不到 ⇒ ⇒ 返回 null（那一格判不了）。 */
function fetchTipSha(repo, branch) {
  const r = ghApi('repos/' + repo + '/commits/' + branch);
  if (!r.ok) return null;
  return r.data && r.data.sha ? r.data.sha : null;
}

function fetchRecent(repo, n) {
  const r = ghApi('repos/' + repo + '/actions/runs?per_page=100');
  if (!r.ok) return { ok: false, why: 'run 列表读不到：' + r.err };
  const all = Array.isArray(r.data.workflow_runs) ? r.data.workflow_runs : [];
  const completed = all.filter((x) => x.status === 'completed').slice(0, n);
  const entries = [];
  for (const run of completed) {
    const j = ghApi('repos/' + repo + '/actions/runs/' + run.id + '/jobs');
    entries.push({ run, jobs: j.ok ? (j.data.jobs || []) : null });
  }
  return { ok: true, entries };
}

/** ── 自检（内核层，零网络） ── */
function selfTest() {
  const cases = [
    { name: '真跑过（3 steps / runner_id≠0）', run: { status: 'completed', conclusion: 'success' }, jobs: [{ steps: [{}, {}, {}], runner_id: 1000002515, conclusion: 'success' }], expect: RAN },
    { name: '门外红（0 step / runner_id=0 / failure）', run: { status: 'completed', conclusion: 'failure' }, jobs: [{ steps: [], runner_id: 0, conclusion: 'failure' }], expect: NEVER_STARTED },
    { name: '被取消（0 step / conclusion=cancelled）', run: { status: 'completed', conclusion: 'cancelled' }, jobs: [{ steps: [], runner_id: null, conclusion: 'cancelled' }], expect: CANCELLED },
    { name: '部分跑过（一个跑了一个没跑）', run: { status: 'completed', conclusion: 'failure' }, jobs: [{ steps: [{}], runner_id: 1000002515, conclusion: 'success' }, { steps: [], runner_id: 0, conclusion: 'failure' }], expect: PARTIAL },
    { name: '判不了（run 还没完成）', run: { status: 'in_progress', conclusion: null }, jobs: [{ steps: [], runner_id: 0 }], expect: UNKNOWN },

    { name: '被取消且零 job（cancel-in-progress 取消得太早）⇒ ⇒ 归 cancelled，不是判不了', run: { status: 'completed', conclusion: 'cancelled' }, jobs: [], expect: CANCELLED },
    { name: '连 job 都没造出来（0 job ＋ failure）⇒ ⇒ 这一族比门外红还早一档：workflow 压根没启动成 job', run: { status: 'completed', conclusion: 'failure' }, jobs: [], expect: NO_JOBS },
    { name: '判不了（run 读不到）', run: null, jobs: null, expect: UNKNOWN },
    { name: '判不了（steps 缺字段）', run: { status: 'completed', conclusion: 'failure' }, jobs: [{ runner_id: 0, conclusion: 'failure' }], expect: NEVER_STARTED },
  ];
  let pass = 0;
  for (const c of cases) {
    const got = classifyRun(c.run, c.jobs);
    const ok = got.kind === c.expect;
    if (ok) pass++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + c.name + ' ⇒ ' + got.kind + (ok ? '' : '（期望 ' + c.expect + '）'));
  }
  const nr = classifyRun({ status: 'completed', conclusion: 'failure' }, [{ steps: [], runner_id: 0 }]);
  const nrOk = !isAReading(nr.kind);
  if (nrOk) pass++;
  console.log((nrOk ? '  ✓ ' : '  ✗ ') + '门外红不算「有读数」');
  // ⚠️ **「这一笔零 run」那一族**（2026-11-11 真机实测：推完一笔却零 check-run）
  const shaCases = [
    { name: '零 run ＋ 还是分支尖端 ⇒ ⇒ 判不了（可能还没起）', p: { sha: 'abc1234', runs: [], isTip: true }, expect: NO_RUN_PENDING },
    { name: '零 run ＋ 已被取代（非尖端）⇒ ⇒ 读数不存在 ⇒ ⇒ 判红', p: { sha: 'abc1234', runs: [], isTip: false }, expect: NO_RUN_SUPERSEDED },
    { name: '零 run ＋ 尖端读不到 ⇒ ⇒ 分不清 ⇒ ⇒ 判不了', p: { sha: 'abc1234', runs: [], isTip: null }, expect: NO_RUN_PENDING },
    { name: '有 run 且真跑过 ⇒ ⇒ 有读数', p: { sha: 'abc1234', runs: [{ run: { status: 'completed', conclusion: 'success' }, jobs: [{ steps: [{}, {}], runner_id: 1, conclusion: 'success' }] }], isTip: true }, expect: RAN },
    { name: '有 run 但全是门外红 ⇒ ⇒ 读数不存在', p: { sha: 'abc1234', runs: [{ run: { status: 'completed', conclusion: 'failure' }, jobs: [{ steps: [], runner_id: 0, conclusion: 'failure' }] }], isTip: true }, expect: NEVER_STARTED },
  ];
  for (const c of shaCases) {
    const got = classifyShaRuns(c.p);
    const ok = got.kind === c.expect;
    if (ok) pass++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + c.name + ' ⇒ ' + got.kind + (ok ? '' : '（期望 ' + c.expect + '）'));
  }
  const total = cases.length + 1 + shaCases.length;
  console.log('自检：' + pass + '/' + total + ' 通过');
  return pass === total ? 0 : 1;
}

function parseArgs(argv) {
  const o = { repo: DEFAULT_REPO, run: null, recent: null, sha: null, branch: 'master', strict: false, json: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') o.selfTest = true;
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--run') o.run = argv[++i];
    else if (a === '--sha') o.sha = argv[++i];
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--recent') {
      const v = argv[++i];
      o.recent = v === undefined || String(v).startsWith('-') ? 10 : Number(v);
      if (v === undefined || String(v).startsWith('-')) i--;
    }
  }
  return o;
}

function printTable(rows) {
  for (const r of rows) {
    const id = r.run && r.run.id !== undefined ? r.run.id : '-';
    const sha = r.run && r.run.head_sha ? String(r.run.head_sha).slice(0, 7) : '-';
    const concl = r.run && r.run.conclusion ? r.run.conclusion : '-';
    console.log('  ' + String(id).padEnd(13) + ' ' + sha + '  ' + String(concl).padEnd(10) + ' ' + (KIND_LABELS[r.kind] || r.kind) + '  [job ' + r.ranJobs + '/' + r.totalJobs + ' 真跑过，零 step ' + r.zeroStepJobs + ']');
    if (r.kind === NEVER_STARTED || r.kind === PARTIAL || r.kind === UNKNOWN) console.log('      ↳ ' + r.why);
  }
}

function main() {
  const o = parseArgs(process.argv.slice(2));

  if (o.selfTest) {
    process.exit(selfTest());
  }

  if (o.run) {
    const f = fetchRun(o.repo, o.run);
    if (!f.ok) {
      if (o.json) console.log(JSON.stringify({ ok: false, why: f.why }, null, 2));
      else console.log('✗ 判不了：' + f.why);
      process.exit(2);
    }
    const c = classifyRun(f.run, f.jobs);
    if (o.json) {
      console.log(JSON.stringify({ ok: c.kind !== UNKNOWN, repo: o.repo, run: Number(o.run), kind: c.kind, why: c.why, ranJobs: c.ranJobs, totalJobs: c.totalJobs }, null, 2));
    } else {
      console.log('CI 到底跑没跑：' + o.repo + ' run ' + o.run);
      console.log('  分类：' + (KIND_LABELS[c.kind] || c.kind));
      console.log('  ' + c.why);
      console.log('  job：' + c.ranJobs + '/' + c.totalJobs + ' 真跑过，零 step ' + c.zeroStepJobs);
      if (c.kind === NEVER_STARTED) console.log('  ⛔ 这笔 run 红了，但一个测试都没跑 ⇒ ⇒ 「CI 红了」是假的');
    }
    if (c.kind === NEVER_STARTED) process.exit(1);
    if (c.kind === UNKNOWN || c.kind === NO_JOBS) process.exit(2);
    process.exit(0);
  }

  if (o.recent) {
    const f = fetchRecent(o.repo, o.recent);
    if (!f.ok) {
      if (o.json) console.log(JSON.stringify({ ok: false, why: f.why }, null, 2));
      else console.log('✗ 判不了：' + f.why);
      process.exit(2);
    }
    const rows = classifyAll(f.entries);
    // ⚠️ **只看「最近一笔有 job 记录的」** —— 被取消得太早的 run（0 job）是常态
    //   （本仓多数 workflow 用 cancel-in-progress: true ⇒ ⇒ 每次 push 都会取消上一轮）
    //   ⇒ ⇒ 它们**没有读数**，但**不该让整批判红**（2026-11-11 真 CI 实测：就因为一笔
    //   cancelled+0 job ⇒ ⇒ exit 2 ⇒ ⇒ 把 CI 拖红了）。
    const measurable = rows.filter((r) => r.totalJobs > 0);
    const latest = measurable[0];
    const neverStarted = rows.filter((r) => r.kind === NEVER_STARTED);
    const unknown = rows.filter((r) => r.kind === UNKNOWN);
    const payload = {
      ok: unknown.length === 0,
      repo: o.repo,
      examined: rows.length,
      ran: rows.filter((r) => r.kind === RAN).length,
      partial: rows.filter((r) => r.kind === PARTIAL).length,
      neverStarted: neverStarted.length,
      noJobs: rows.filter((r) => r.kind === NO_JOBS).length,
      cancelled: rows.filter((r) => r.kind === CANCELLED).length,
      unknown: unknown.length,
      latestKind: latest ? latest.kind : UNKNOWN,
      rows: rows.map((r) => ({ id: r.run ? r.run.id : null, conclusion: r.run ? r.run.conclusion : null, kind: r.kind, ranJobs: r.ranJobs, totalJobs: r.totalJobs, zeroStepJobs: r.zeroStepJobs })),
    };
    if (o.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log('CI 到底跑没跑：' + o.repo + ' 最近 ' + rows.length + ' 笔已完成的 run');
      printTable(rows);
      console.log('  合计：真跑过 ' + payload.ran + ' ｜ 部分 ' + payload.partial + ' ｜ 门外红 ' + payload.neverStarted + ' ｜ 连 job 都没造出来 ' + payload.noJobs + ' ｜ 被取消 ' + payload.cancelled + ' ｜ 判不了 ' + payload.unknown);
      if (neverStarted.length) console.log('  ℹ️ 门外红名单（历史既成事实，只报数不判红；--strict 可判红）：' + neverStarted.map((r) => r.run.id).join(', '));
    }
    const failOnLatest = latest && latest.kind === NEVER_STARTED;
    const failOnStrict = o.strict && neverStarted.length > 0;
    if (failOnLatest || failOnStrict) {
      // ⚠️ **--json 时不许混人类可读的行** —— 否则下游按 JSON 解析会炸（JSON.parse 会
      //   报「Additional text encountered after finished reading JSON content」）
      //   ⇒ ⇒ 这一格只出现在人读的那一面。
      if (!o.json) console.log('  ⛔ 门外红 ⇒ ⇒ 这一格没有读数');
      process.exit(1);
    }
    if (unknown.length) {
      console.log('  ⚠️ 有 ' + unknown.length + ' 笔判不了（历史既成事实，只报数不判红）⇒ ⇒ 「没红」不等于「没问题」');
    }
    if (!latest) {
      console.log('  ⚠️ 最近 ' + rows.length + ' 笔里**没有一笔带 job 记录** ⇒ ⇒ 无从量起 ⇒ ⇒ 判不了');
      process.exit(2);
    }
    process.exit(0);
  }

  // ⚠️⚠️ **第三问法：--sha** —— 「**我声称要读的那一笔**」到底有没有读数。
  //   ⇒ ⇒ 这是**读数侧**的问题（CI 问不了「我声称要读的那一笔」）⇒ ⇒ ⇒ 所以它**不接 ci.yml**。
  if (o.sha) {
    const f2 = fetchRunsBySha(o.repo, o.sha);
    if (!f2.ok) {
      if (o.json) console.log(JSON.stringify({ ok: false, why: f2.why }, null, 2));
      else console.log('✗ 判不了：' + f2.why);
      process.exit(2);
    }
    const entries = [];
    for (const run of f2.runs) {
      const j = ghApi('repos/' + o.repo + '/actions/runs/' + run.id + '/jobs');
      entries.push({ run, jobs: j.ok ? (j.data.jobs || []) : null });
    }
    const tip = fetchTipSha(o.repo, o.branch);
    const isTip = tip === null ? null : (tip === o.sha);
    const c = classifyShaRuns({ sha: o.sha, runs: entries, isTip });
    const payload = {
      ok: c.readingCount > 0, repo: o.repo, sha: c.sha, branch: o.branch, tip,
      isTip, kind: c.kind, why: c.why, runCount: c.runCount, readingCount: c.readingCount,
      rows: entries.map((e) => ({ id: e.run.id, name: e.run.name, status: e.run.status, conclusion: e.run.conclusion })),
    };
    if (o.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log('这一笔的 CI 读数存不存在：' + o.repo + ' sha ' + c.sha);
      console.log('  分支 ' + o.branch + ' 尖端：' + (tip ? tip.slice(0, 7) : '读不到') + (isTip === false && c.kind === NO_RUN_SUPERSEDED ? '（这一笔**已不是**尖端 ⇒ ⇒ 它的 run 永远不会再来了）' : (isTip === false ? '（这一笔已不是尖端；但它的 run 存在 ⇒ ⇒ 读数在）' : '')));
      console.log('  分类：' + (KIND_LABELS[c.kind] || c.kind));
      console.log('  ' + c.why);
      console.log('  run 数：' + c.runCount + ' ｜ 真跑过（有读数）：' + c.readingCount);
      for (const r of payload.rows) console.log('    ' + String(r.id).padEnd(13) + ' ' + String(r.name || '-').padEnd(30) + ' ' + r.status + ' / ' + r.conclusion);
      if (c.kind === NO_RUN_SUPERSEDED) console.log('  ⛔ 这一笔的 run **永远不会再来了** ⇒ ⇒ 它的读数**不存在** ⇒ ⇒ 不许拿别的 sha 的绿冒充它');
      if (c.kind === NO_RUN_PENDING) console.log('  ⚠ 这一格**判不了**（可能还没起）⇒ ⇒ 不许当「没问题」');
    }
    if (c.kind === NO_RUN_PENDING || c.kind === UNKNOWN) process.exit(2);
    if (c.kind === NEVER_STARTED || c.kind === NO_JOBS || c.kind === NO_RUN_SUPERSEDED) process.exit(1);
    process.exit(0);
  }

  console.log('用法：node scripts/check-ci-actually-ran.mjs [--repo <owner/name>] [--run <id> | --recent <N> | --sha <sha>] [--branch <b>] [--strict] [--json]');
  console.log('      node scripts/check-ci-actually-ran.mjs --self-test');
  process.exit(2);
}

main();
