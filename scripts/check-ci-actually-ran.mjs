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
 * ## 判据（红线两条）
 *
 * · R1 **你声称要读的那一笔是门外红** ⇒ ⇒ 红（exit 1）—— 「读数」不存在。
 * · R2 **最近一笔已完成的 run 是门外红** ⇒ ⇒ 红（exit 1）—— 本仓 CI 基础设施此刻坏了。
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
 *
 * ⚠️ 跨仓量**私有仓**需要 PAT（CI 上的 GITHUB_TOKEN 跨私有仓读不到）
 *    ⇒ ⇒ 本仓（public）在 CI 上量自己；私有仓那一族在本地量（gh 已有 org 读权限）。
 */
import { execFileSync } from 'node:child_process';
import {
  classifyRun, classifyAll, isAReading,
  RAN, PARTIAL, NEVER_STARTED, CANCELLED, UNKNOWN, KIND_LABELS,
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
    { name: '判不了（没有 job 记录）', run: { status: 'completed', conclusion: 'failure' }, jobs: [], expect: UNKNOWN },
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
  const total = cases.length + 1;
  console.log('自检：' + pass + '/' + total + ' 通过');
  return pass === total ? 0 : 1;
}

function parseArgs(argv) {
  const o = { repo: DEFAULT_REPO, run: null, recent: null, strict: false, json: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') o.selfTest = true;
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--run') o.run = argv[++i];
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
    if (c.kind === UNKNOWN) process.exit(2);
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
    const latest = rows[0];
    const neverStarted = rows.filter((r) => r.kind === NEVER_STARTED);
    const unknown = rows.filter((r) => r.kind === UNKNOWN);
    const payload = {
      ok: unknown.length === 0,
      repo: o.repo,
      examined: rows.length,
      ran: rows.filter((r) => r.kind === RAN).length,
      partial: rows.filter((r) => r.kind === PARTIAL).length,
      neverStarted: neverStarted.length,
      cancelled: rows.filter((r) => r.kind === CANCELLED).length,
      unknown: unknown.length,
      latestKind: latest ? latest.kind : UNKNOWN,
      rows: rows.map((r) => ({ id: r.run ? r.run.id : null, conclusion: r.run ? r.run.conclusion : null, kind: r.kind, ranJobs: r.ranJobs, totalJobs: r.totalJobs, zeroStepJobs: r.zeroStepJobs })),
    };
    if (o.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log('CI 到底跑没跑：' + o.repo + ' 最近 ' + rows.length + ' 笔已完成的 run');
      printTable(rows);
      console.log('  合计：真跑过 ' + payload.ran + ' ｜ 部分 ' + payload.partial + ' ｜ 门外红 ' + payload.neverStarted + ' ｜ 被取消 ' + payload.cancelled + ' ｜ 判不了 ' + payload.unknown);
      if (neverStarted.length) console.log('  ℹ️ 门外红名单（历史既成事实，只报数不判红；--strict 可判红）：' + neverStarted.map((r) => r.run.id).join(', '));
    }
    const failOnLatest = latest && latest.kind === NEVER_STARTED;
    const failOnStrict = o.strict && neverStarted.length > 0;
    if (failOnLatest || failOnStrict) {
      console.log('  ⛔ 门外红 ⇒ ⇒ 这一格没有读数');
      process.exit(1);
    }
    if (unknown.length) {
      console.log('  ⚠️ 有 ' + unknown.length + ' 笔判不了 ⇒ ⇒ 「没红」不等于「没问题」');
      process.exit(2);
    }
    process.exit(0);
  }

  console.log('用法：node scripts/check-ci-actually-ran.mjs [--repo <owner/name>] [--run <id> | --recent <N>] [--strict] [--json]');
  console.log('      node scripts/check-ci-actually-ran.mjs --self-test');
  process.exit(2);
}

main();
