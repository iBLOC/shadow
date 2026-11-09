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
export const UNKNOWN = 'unknown';

export const KINDS = [RAN, PARTIAL, NEVER_STARTED, CANCELLED, UNKNOWN];

/** 中文标签（输出用）。 */
export const KIND_LABELS = {
  [RAN]: '真跑过',
  [PARTIAL]: '部分跑过',
  [NEVER_STARTED]: '门外红（一个 step 都没跑）',
  [CANCELLED]: '被取消（零 step）',
  [UNKNOWN]: '判不了',
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
