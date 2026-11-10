/**
 * 「CI 到底跑没跑」判定内核（2026-11-11）。
 *
 * ## 它守什么
 *
 * GitHub Actions 的 run 只有两种「红」：
 *
 * · **真红**：job 领到了 runner、跑了 step、测试真的挂了 ⇒ ⇒ 这是一个**读数**。
 * · **门外红**：job 在**分配 runner 之前**就被拒 ⇒ ⇒ steps 为空、runner_id = 0、
 *   整个 run 在 3 秒内结束 ⇒ ⇒ **一个测试都没跑** ⇒ ⇒ 「CI 红了」这句话是**假的**。
 *
 * ⚠️ **为什么这一族值得单独造一把尺子**（2026-11-11 真机实测）：
 * iBLOC org 下**私有仓**（telencephalon / hippocampus / prefrontal / diencephalon / ziti-rust …）
 * 的 CI 从建仓起就**笔笔门外红**：94 笔 run、7 个 job、全部 3 秒失败、0 step、runner_id = 0。
 * ⇒ ⇒ 而**公开仓**（shadow / synapse / neuron）跑得好好的 ⇒ ⇒ 差异不是代码，是**私有仓的
 * 托管 runner 分钟配额**（hippocampus 在 2026-11-01～11-03 有过 12 笔**真跑过**的成功 run
 * ⇒ ⇒ 配额有窗口；窗口一过就又全红）。
 * ⇒ ⇒ **读数不可得**（org billing API 需要 admin scope，本机 token 是 403）⇒ ⇒ 根因是**假说**，
 *   不是结论 —— 但「门外红」这个**形状**是**逐字实测**的。
 *
 * ## ⚠️ 通用形态
 *
 * **「没跑」长得像「跑了并失败了」** ⇒ ⇒ 一次门外红在台账上、在 run 列表上、在
 * 「CI 全红」的转述里，**与一次真红完全同形** ⇒ ⇒ 而它承载的信息量是**零**。
 * ⇒ ⇒ 这就是「尺子要对着被测物」的又一格：**量「有没有跑过」，再谈「跑的结果是什么」**。
 *
 * ## 五档分类（纯函数，无网络 ⇒ ⇒ 可自检）
 *
 * · ran           真跑过：≥1 个 job 有 step 且 runner_id ≠ 0。
 * · partial       部分跑过：有的 job 跑了，有的没有。
 * · never-started **门外红**：completed ＋ conclusion=failure ＋ 所有 job 零 step。
 * · cancelled     被取消：同样零 step，但 run 的结论是 cancelled ⇒ ⇒ 不是「门外红」。
 * · unknown       **判不了**：run 未完成 / 没有 job 记录 / 读不到。
 */

/** 五档分类标签。 */
export const RAN = 'ran';
export const PARTIAL = 'partial';
export const NEVER_STARTED = 'never-started';
export const CANCELLED = 'cancelled';
export const NO_JOBS = 'no-jobs';
export const UNKNOWN = 'unknown';
// ⚠️ 2026-11-11 补两档：**这一笔压根没有 run**（比「连 job 都没造出来」还早一档 —— 连 run 都没有）。
export const NO_RUN_PENDING = 'no-run-pending';
export const NO_RUN_SUPERSEDED = 'no-run-superseded';

export const KINDS = [RAN, PARTIAL, NEVER_STARTED, CANCELLED, NO_JOBS, UNKNOWN, NO_RUN_PENDING, NO_RUN_SUPERSEDED];

/** 中文标签（输出用）。 */
export const KIND_LABELS = {
  [RAN]: '真跑过',
  [PARTIAL]: '部分跑过',
  [NEVER_STARTED]: '门外红（一个 step 都没跑）',
  [CANCELLED]: '被取消（零 step）',
  [NO_JOBS]: '连 job 都没造出来（0 job ＋ failure）',
  [UNKNOWN]: '判不了',
  [NO_RUN_PENDING]: '这一笔还没有 run（可能还没起 ⇒ ⇒ 判不了）',
  [NO_RUN_SUPERSEDED]: '这一笔已被取代 ⇒ ⇒ 它永远不会有 run ⇒ ⇒ 读数不存在',
};

/** job 是否真的领到 runner 并跑过至少一个 step。 */
export function jobActuallyRan(job) {
  if (!job || typeof job !== 'object') return false;
  const steps = Array.isArray(job.steps) ? job.steps.length : 0;
  const runnerId = Number(job.runner_id);
  return steps > 0 && Number.isFinite(runnerId) && runnerId > 0;
}

/** job 是否「零 step」。 */
export function jobHasNoSteps(job) {
  if (!job || typeof job !== 'object') return false;
  const steps = Array.isArray(job.steps) ? job.steps.length : 0;
  return steps === 0;
}

/**
 * 把一个 run ＋ 它的 jobs 归成一档。
 *
 * @param {object|null} run  gh api 的 workflow run（至少含 status / conclusion）
 * @param {Array|null} jobs gh api 的 jobs（至少含 steps / runner_id / conclusion）
 * @returns {{kind:string, why:string, ranJobs:number, zeroStepJobs:number, totalJobs:number}}
 */
export function classifyRun(run, jobs) {
  const shape = { kind: UNKNOWN, why: '', ranJobs: 0, zeroStepJobs: 0, totalJobs: 0 };

  if (!run || typeof run !== 'object') {
    return { ...shape, why: 'run 读不到（不是对象）' };
  }
  if (run.status && run.status !== 'completed') {
    return { ...shape, why: 'run 未完成（status=' + run.status + '）⇒ ⇒ 还在排队/在跑，不能当读数' };
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    // ⚠️ **「没有 job 记录」有两种完全不同的东西**（2026-11-11 真 CI 抓到的）：
    //   ① **被取消得太早**（concurrency 取消时 job 还没排上）⇒ ⇒ run.conclusion=cancelled
    //      ⇒ ⇒ 这**不是**「基础设施坏了」，只是**没有读数**⇒ ⇒ 归 cancelled 档（不判红）。
    //   ② 其它 ⇒ ⇒ 真的读不到 ⇒ ⇒ unknown（「判不了」）。
    if (run.conclusion === 'cancelled') {
      return { ...shape, kind: CANCELLED, why: 'run 已被取消且没有任何 job 记录（连 runner 都没排上）⇒ ⇒ 没有读数，但这不是门外红' };
    }
    if (run.conclusion === 'failure') {
      return { ...shape, kind: NO_JOBS, why: '这个 run **连 job 都没造出来**（0 job ＋ 0 check run ＋ 空日志 zip）⇒ ⇒ 它比「门外红」还早一档：**workflow 压根没被启动成 job** ⇒ ⇒ ⚠️ 实测：同一个 headSha 上 rerun 同一笔即造出 10 个 job ⇒ ⇒ 这一档多半是**平台侧偶发**，不是代码的账 ⇒ ⇒ 出声、不判红' };
    }
    return { ...shape, why: '该 run 没有 job 记录（total_count=0）⇒ ⇒ 判不了' };
  }

  const ranJobs = jobs.filter(jobActuallyRan).length;
  const zeroStepJobs = jobs.filter(jobHasNoSteps).length;
  const base = { ...shape, ranJobs, zeroStepJobs, totalJobs: jobs.length };

  if (ranJobs === 0) {
    if (run.conclusion === 'cancelled') {
      return { ...base, kind: CANCELLED, why: '全部 job 零 step，但 run 的结论是 cancelled ⇒ ⇒ 是被取消，不是门外红' };
    }
    return {
      ...base,
      kind: NEVER_STARTED,
      why: '全部 ' + jobs.length + ' 个 job 零 step 且 runner_id=0 ⇒ ⇒ job 在分配 runner 之前就被拒 ⇒ ⇒ 一个测试都没跑',
    };
  }
  if (zeroStepJobs > 0) {
    return {
      ...base,
      kind: PARTIAL,
      why: ranJobs + ' 个 job 跑过，' + zeroStepJobs + ' 个 job 零 step ⇒ ⇒ 部分跑过',
    };
  }
  return { ...base, kind: RAN, why: ranJobs + '/' + jobs.length + ' 个 job 都领到 runner 并跑过 step' };
}

/**
 * 批量分类（保持传入顺序）。
 *
 * @param {Array<{run:object, jobs:Array|null}>} entries
 */
export function classifyAll(entries) {
  return entries.map((e) => ({ run: e.run, ...classifyRun(e.run, e.jobs) }));
}

/** 这档分类算不算「有读数」。 */
export function isAReading(kind) {
  return kind === RAN || kind === PARTIAL;
}

/**
 * 判「**这一笔（按 sha）** 有没有读数」—— 这是**读数侧**的问题，不是「CI 跑没跑」。
 *
 * ⚠️ **为什么要有这一格**（2026-11-11 真机实测）：
 *   我推完一笔 `fc9b464` 后查 GitHub 侧 ⇒ ⇒ **零 check-run ＋ 零 status** ⇒ ⇒
 *   而紧接着的下一笔 `1cb151b` **24 道 run 全齐** ⇒ ⇒ ⇒ 同一把尺、同样问法、两次推、
 *   一次零一次齐 ⇒ ⇒ ⇒ **⇒ ⇒ 「那一格没读到」有两种可能（事件被并 ／ 尺子口径错）**
 *   ⇒ ⇒ ⇒ ⇒ ⇒ **要分开只能靠「尺子自检」**（同一查询对已知有 run 的 sha 返不返得出数）。
 *   ⇒ ⇒ 而**本函数就是那把尺子**：它把「这一笔到底有没有读数」变成**一份机械读数**，
 *   而不是靠记性。
 *
 * ⚠️ **「零 run」还要再分两档**（分不清 ⇒ ⇒ 那一格只能判不了）：
 *   · **还是分支尖端** ⇒ ⇒ 可能**还没起** ⇒ ⇒ 「判不了」（不是「没问题」）。
 *   · **已经不是尖端** ⇒ ⇒ ⇒ **它的 run 永远不会再来了** ⇒ ⇒ ⇒ ⇒ **它的读数不存在**
 *     ⇒ ⇒ ⇒ ⇒ ⇒ **⇒ ⇒ 不许拿别的 sha 的绿冒充它** ⇒ ⇒ 与「门外红」同族 ⇒ ⇒ ⇒ 判红。
 *
 * @param {object} p
 * @param {string} p.sha      目标 sha
 * @param {Array}  p.runs     这一笔名下的 run（gh api `?head_sha=…` 的 workflow_runs）
 * @param {boolean} p.isTip   这一笔是否还是分支尖端（null ＝ 读不到尖端 ⇒ ⇒ 分不清 ⇒ ⇒ 判不了）
 * @param {Function} [p.classifyRun] 逐 run 分类（默认本文件的 classifyRun）
 */
export function classifyShaRuns({ sha, runs, isTip, classifyRun: cf }) {
  const cls = cf || classifyRun;
  const list = Array.isArray(runs) ? runs : [];
  const short = String(sha || '').slice(0, 7);
  if (list.length === 0) {
    const base = { sha: short, runCount: 0, readingCount: 0 };
    if (isTip === null || isTip === undefined) {
      return { ...base, kind: NO_RUN_PENDING, why: '这一笔（' + short + '）名下**零 run**，而**分支尖端读不到** ⇒ ⇒ 分不清「还没起」与「已被取代」⇒ ⇒ ⇒ **那一格判不了**（不是「没问题」）' };
    }
    if (isTip) {
      return { ...base, kind: NO_RUN_PENDING, why: '这一笔（' + short + '）名下**零 run**，而它**还是分支尖端** ⇒ ⇒ 可能**还没起** ⇒ ⇒ ⇒ **那一格判不了**（不是「没问题」）' };
    }
    return { ...base, kind: NO_RUN_SUPERSEDED, why: '这一笔（' + short + '）名下**零 run**，而它**已经不是**分支尖端 ⇒ ⇒ ⇒ ⇒ **它的 run 永远不会再来了** ⇒ ⇒ ⇒ ⇒ ⇒ **⇒ ⇒ 它的读数不存在 ⇒ ⇒ 不许拿别的 sha 的绿冒充它**' };
  }
  const kinds = list.map((r) => cls(r.run || r, r.jobs));
  const readings = kinds.filter((k) => isAReading(k.kind));
  const base = { sha: short, runCount: list.length, readingCount: readings.length };
  if (readings.length > 0) {
    return { ...base, kind: RAN, why: '这一笔（' + short + '）名下 ' + list.length + ' 道 run，其中 ' + readings.length + ' 道**真跑过**（有读数）' };
  }
  const worst = kinds.find((k) => k.kind === NEVER_STARTED) || kinds.find((k) => k.kind === NO_JOBS) || kinds[0];
  return { ...base, kind: worst.kind, why: '这一笔（' + short + '）名下 ' + list.length + ' 道 run，但**一道都没真跑过**（' + (KIND_LABELS[worst.kind] || worst.kind) + '）⇒ ⇒ 它的读数不存在' };
}
