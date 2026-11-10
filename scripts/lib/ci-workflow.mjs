
/**
 * CI 布局探针 —— **workflow 解析 + 虚拟布局 + 依赖闭包**这一层（工具）。
 * ===========================================================================
 *
 * ⚠️ 同样**不是闸**（见同目录的 ci-cargo.mjs 头部说明）。
 *
 * ── 虚拟布局是什么 ──────────────────────────────────────────────────────
 * CI 里 actions/checkout 把仓放进 GITHUB_WORKSPACE：
 *   · 没有 path: 的那个 checkout ⇒ 落在 **工作区根**（本仓在 CI 里就是它）；
 *   · 有 path: <name> 的 ⇒ 落在 **<工作区>/<name>**。
 * ⇒ ⇒ 一条形如 "../../../neuron" 的 path 依赖，在**本地**与**CI**里
 *    **指向的位置不一样**（甚至一个能指到、一个指不到）⇒ ⇒
 *    必须把表达式丢进虚拟布局里重新解析，而不是看本机能不能指到。
 */
import fs from 'node:fs';
import path from 'node:path';
import { LOCAL, SHADOW_ROOT, pathDeps, repoOf, wsRoot, entries, membersOf } from './ci-cargo.mjs';

/**
 * 把 `run: |` / `run: >` 这类**块标量**的正文**提上来并拼进同一行**。
 *
 * ⚠️⚠️ 2026-11-08：**不处理块标量，解析器就会把整个 job 静默漏掉** ——
 *   原来只认单行的 `run: cargo check ...`（正则能匹配到正文）⇒ ⇒ 多行命令
 *   （如本仓 desktop-rust.yml 的 `run: |` + `set -o pipefail ...`）的正文行
 *   缩进更深 ⇒ ⇒ 匹配不到 ⇒ ⇒ **正文从未进入 step.run** ⇒ ⇒ 探针的判据
 *   （/cargo\s/ 与 /--manifest-path/）全部落空 ⇒ ⇒ 那个 job **整段不被判**
 *   ⇒ ⇒ 一个真的检出闭包缺口，可以躲在一道**自报「没发现破口」**的工具后面。
 */
function expandRunBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const m = raw.match(/^([ \t]*)run:[ \t]*[|>][-+]?[ \t]*$/);
    if (!m) { out.push(raw); continue; }
    const ind = m[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') { body.push(''); continue; }
      if (l.length - l.trimStart().length <= ind) break;
      body.push(l.trim());
    }
    out.push(m[1] + 'run: ' + body.join(' ').trim());
    i = j - 1;
  }
  return out.join('\n');
}

/** 把 workflow 文本拆成 job → step。 */
export function parseWorkflow(text) {
  const lines = expandRunBlocks(text).split(/\r?\n/);
  const jobs = [];
  let job = null;
  let step = null;
  for (const raw of lines) {
    const jm = raw.match(/^  ([A-Za-z0-9_.-]+):\s*$/);
    if (jm) {
      job = { name: jm[1], steps: [] };
      jobs.push(job);
      step = null;
      continue;
    }
    if (!job) continue;
    const sm = raw.match(/^      - name: (.*)$/);
    if (sm) {
      step = { name: sm[1].trim(), uses: null, repo: null, withPath: null, wd: null, run: '' };
      job.steps.push(step);
      continue;
    }
    if (!step) continue;
    let m;
    if ((m = raw.match(/^        uses: (.*)$/))) step.uses = m[1].trim();
    if ((m = raw.match(/^          repository: (.*)$/))) step.repo = m[1].trim();
    if ((m = raw.match(/^          path: (.*)$/))) step.withPath = m[1].trim();
    if ((m = raw.match(/^        working-directory: (.*)$/))) step.wd = m[1].trim();
    if ((m = raw.match(/^        run: (.*)$/))) step.run = (step.run + ' ' + m[1].trim()).trim();
  }
  return jobs;
}

/**
 * 解析本地 composite action（ibloc-siblings）里的 checkout 清单 ⇒
 * 「哪个兄弟仓落在工作区根的哪个目录」。
 * ⚠️ 清单**只有这一份**（在 .github/actions/ibloc-siblings/action.yml）⇒
 *   ⇒ 探针与 CI 不会漂。
 */
function compositeCheckouts() {
  const f = path.join(SHADOW_ROOT, '.github', 'actions', 'ibloc-siblings', 'action.yml');
  if (!fs.existsSync(f)) return [];
  const out = [];
  let repo = null;
  for (const raw of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    let m;
    if ((m = raw.match(/^\s+repository:\s*(\S+)\s*$/))) { repo = m[1].split('/').pop(); continue; }
    if ((m = raw.match(/^\s+path:\s*(\S+)\s*$/))) {
      if (repo) { out.push({ repo, path: m[1] }); repo = null; }
    }
  }
  return out;
}
/** 一个 job 的检出清单 ⇒ 虚拟布局（每个仓的虚拟根）。 */
export function layoutOf(job) {
  const vrootByRepo = {};
  const co = [];
  for (const s of job.steps) {
    if (!s.uses) continue;
    if (s.uses.includes('actions/checkout')) {
      const repo = (s.repo || 'iBLOC/shadow').split('/').pop();
      co.push({ repo, path: s.withPath || null });
      vrootByRepo[repo] = s.withPath || null;
      continue;
    }
    // ⚠️⚠️ 2026-11-08：**composite action 的检出也要算进虚拟布局** ——
    //   ibloc-siblings 这个本地 action 一次检出 14 个兄弟仓（都落在工作区**根**）
    //   ⇒ ⇒ 探针原来只认 ctions/checkout ⇒ ⇒ desktop-e2e.yml 那类 job 的
    //   布局里**一个兄弟仓都没有** ⇒ ⇒ pathOf 拿到 undefined ⇒ ⇒ 直接崩
    //   （ERR_INVALID_ARG_TYPE）⇒ ⇒ 闭包分析对 composite 型 job **整段不可用**。
    if (/actions\/[A-Za-z0-9._-]+$/.test(s.uses) || s.uses.includes('ibloc-siblings')) {
      for (const c of compositeCheckouts()) {
        co.push({ repo: c.repo, path: c.path });
        vrootByRepo[c.repo] = c.path;
      }
    }
  }
  const VR = 'C:/__ci__';
  const vroot = {};
  for (const r of Object.keys(vrootByRepo)) {
    vroot[r] = vrootByRepo[r] ? VR + '/' + vrootByRepo[r] : VR;
  }
  return { co, vroot, VR };
}

/** 一条 path 表达式在虚拟布局里指到哪。 */
export function vpathOf(M, depPath, layout) {
  const R = repoOf(M);
  if (!R) return null;
  // ⚠️ 2026-11-08：**别崩** —— 这个仓不在虚拟布局里（检出清单缺它）⇒ ⇒ 判「指不到」，
  //   而不是让 path.join(undefined) 把整个分析打断（那会让后面的 job 全都跑不到）。
  if (!layout.vroot[R]) return null;
  const rel = path.relative(path.join(LOCAL, R), M).split(path.sep).join('/');
  const vDir = path.posix.join(layout.vroot[R], path.posix.dirname(rel));
  return path.posix.normalize(path.posix.join(vDir, depPath));
}

/** 虚拟目标能不能落在某个**已检出**的仓里（且那个位置真的有东西）。 */
export function checkVirtual(vt, layout) {
  if (!vt) return { ok: false, why: '不在任何已知仓里' };
  if (vt.startsWith('..')) return { ok: false, why: '指到工作区之外：' + vt };
  let best = null;
  for (const R of Object.keys(layout.vroot)) {
    const vr = layout.vroot[R];
    if (vt === vr || vt.startsWith(vr.endsWith('/') ? vr : vr + '/')) {
      if (!best || vr.length > best.vr.length) best = { R, vr };
    }
  }
  if (!best) return { ok: false, why: '虚拟布局下没有对应的已检出仓：' + vt };
  const rel = path.posix.relative(best.vr, vt);
  const local = path.join(LOCAL, best.R, rel.split('/').join(path.sep));
  if (!fs.existsSync(local)) {
    return { ok: false, why: '虚拟布局下指不到：' + vt + ' → ' + local };
  }
  return { ok: true, repo: best.R, local };
}

/** 从一个清单出发，递归算出 path 依赖闭包（并逐条验虚拟布局指不指得到）。 */
export function closure(startManifest, layout) {
  const seen = new Set();
  const edges = [];
  const queue = [startManifest];
  while (queue.length) {
    const M = queue.shift();
    if (seen.has(M)) continue;
    seen.add(M);
    const W = wsRoot(M);
    const wsMap = {};
    if (W) {
      for (const d of pathDeps(W)) if (d.sec === 'workspace.dependencies') wsMap[d.key] = d.path;
    }
    const own = pathDeps(M).filter((d) => d.sec !== 'workspace.dependencies');
    const list = own.map((d) => ({ ...d, effective: d.inherited ? wsMap[d.key] || null : d.path }));
    if (W) {
      for (const d of pathDeps(W)) {
        if (d.sec === 'workspace.dependencies') {
          list.push({ sec: 'workspace.dependencies', key: d.key, path: d.path, effective: d.path });
        }
      }
    }
    if (W && M === W) {
      for (const mem of membersOf(W)) {
        const mm = path.join(path.dirname(W), mem, 'Cargo.toml');
        if (fs.existsSync(mm)) queue.push(mm);
      }
    }
    for (const d of list) {
      if (!d.effective) {
        edges.push({
          from: M, key: d.key, path: d.path, status: 'MISSING',
          why: 'workspace=true 但工作区里没有这条依赖',
        });
        continue;
      }
      const target = path.resolve(path.dirname(M), d.effective);
      const tm = path.join(target, 'Cargo.toml');
      if (!fs.existsSync(tm)) {
        edges.push({
          from: M, key: d.key, path: d.effective, status: 'MISSING',
          why: '本地就没有这个 manifest：' + target,
        });
        continue;
      }
      const vt = vpathOf(M, d.effective, layout);
      const vcheck = vt ? checkVirtual(vt, layout) : { ok: false, why: '不在任何已知仓里' };
      const localRepo = repoOf(target);
      edges.push({
        from: M, key: d.key, path: d.effective,
        status: vcheck.ok ? 'OK' : 'HOLE',
        why: vcheck.ok
          ? '→ ' + localRepo + '  ' + path.relative(path.join(LOCAL, localRepo), target)
          : vcheck.why,
        virtual: vt || null,
        repo: localRepo,
      });
      if (localRepo) queue.push(tm);
    }
  }
  return { seen, edges };
}
