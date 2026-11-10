/**
 * MSRV 地板**跨仓对账**判据（纯函数）—— 「地板是否漂移」，不是「地板是否够高」
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * 承 U+34E0 条（地板口径改成分仓自报）：每个仓**自己**声明自己的地板 ⇒ ⇒
 * 「地板是多少」不再需要人拍板 ⇒ ⇒ 但**跨仓**多了一族问题：
 *
 *  · **各仓的地板彼此不一致** —— 在**分仓自报**口径下这**不是红**
 *    （谁的仓谁自己报 ⇒ 桌面端报 1.95、海马体报 1.94 都是诚实的）
 *    ⇒ ⇒ 所以它只**出声**（distinct 列表），**不判红**；
 *  · **一个仓的承诺被它 path 依赖的兄弟仓打破** —— 这**才是红**：
 *    若 A 自报 1.94、而 A path 依赖的 B 自报 1.95 ⇒ ⇒ B 的 crate 要求 rustc >= 1.95
 *    ⇒ ⇒ B 会被编进 A 的构建 ⇒ ⇒ **A 在 1.94 上编不过** ⇒ ⇒ A 的承诺是假的。
 *
 * ⇒ ⇒ 这就是「地板漂移」的**机械判据**：不是「大家必须一样」，
 * 而是「**依赖边上的地板必须单调不降**」（消费者的承诺 ≥ 提供者的承诺）。
 *
 * ## 为什么它**不重做**地板闸
 *
 * `scripts/check-msrv-floor.mjs` 判的是「本仓的第三方依赖闭包有没有超过**自报**地板」
 * ⇒ ⇒ 而它的第三方闭包**故意排除 path 依赖**（兄弟仓的债归兄弟仓）⇒ ⇒
 * ⇒ ⇒ **「本仓的承诺被 path 依赖的兄弟仓打破」那一格，全仓没有任何闸在管** ⇒ ⇒ 本模块补的就是它。
 *
 * ## ⚠️ 四种真实形状（2026-11-11 实测 16 个仓，夹具照抄真实措辞）
 *
 * ❶ **根 package 声明** —— amygdala / synapse / neuron / prefrontal / temporal ...
 * ❷ **workspace.package 声明 ＋ 成员 `rust-version.workspace = true` 继承**
 *    —— hippocampus / telencephalon（根同时还有 package 声明）
 * ❸ **纯虚拟 workspace（根**没有** rust-version）＋ 地板只在成员 crate 里**
 *    —— ziti-rust（crates/ziti-v2）、lance-graph（三个成员）
 *    ⇒ ⇒ **只读根 Cargo.toml 的读法会把 ❸ 读成「没声明」** ⇒ ⇒ 那是尺子量错了被测物。
 * ❹ **成员的 members 列表可能是通配**（`members = ["crates/*"]` —— hengjian）
 *    ⇒ ⇒ 不展开通配 ⇒ ⇒ 会漏掉六个成员 crate。
 *
 * ## 判读三档
 *
 * · **一致**（每条依赖边都单调不降）⇒ ⇒ 绿（退出码 0）
 * · **漂移**（某条边：消费者地板 < 提供者地板）⇒ ⇒ 红（退出码 1）
 * · **判不了**（某个仓读不出地板 / 不在位 ⇒ ⇒ 那条边量不了）⇒ ⇒ 退出码 2
 *   ⇒ ⇒ **绝不当绿**（形状变了被读成「全一致」＝最坏的一类假绿）。
 *
 * ## 纯函数性
 *
 * 本模块零 I/O（YAML 解析也是纯的：字符串进、结论出）⇒ ⇒ 自检喂**合成夹具**
 * ⇒ ⇒ 天天能在 CI 上验。
 */

import { resolve, sep } from 'node:path';
import { scanYamlText } from './yaml-valid.mjs';

/**
 * 取一份 Cargo.toml 里的字符串数组（members / exclude）—— 允许多行写法。
 *
 * @param {string} text
 * @param {string} key
 * @returns {string[]}
 */
export function collectStringArray(text, key) {
  const m = String(text || '').match(new RegExp('^\\s*' + key + '\\s*=\\s*\\[([\\s\\S]*?)\\]', 'm'));
  if (!m) return [];
  const out = [];
  for (const part of m[1].split(',')) {
    const s = part.trim().replace(/^["']|["']$/g, '');
    if (s) out.push(s);
  }
  return out;
}

/**
 * 解析一份 Cargo.toml 里与地板有关的那几处。
 *
 * @param {string} text Cargo.toml 全文
 * @returns {{workspaceRust:string|null, packageRust:string|null,
 *          packageRustInherit:boolean, members:string[], exclude:string[]}}
 */
export function parseCargoSections(text) {
  const src = String(text || '');
  const out = { workspaceRust: null, packageRust: null, packageRustInherit: false, members: [], exclude: [] };
  let cur = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const h = line.match(/^\[([^\]]+)\]$/);
    if (h) { cur = h[1].trim(); continue; }
    const inherit = line.match(/^rust-version\.workspace\s*=\s*true$/);
    if (inherit && cur === 'package') { out.packageRustInherit = true; continue; }
    const rv = line.match(/^rust-version\s*=\s*["']([^"']+)["']/);
    if (rv) {
      if (cur === 'workspace.package') out.workspaceRust = rv[1];
      else if (cur === 'package') out.packageRust = rv[1];
      continue;
    }
  }
  out.members = collectStringArray(src, 'members');
  out.exclude = collectStringArray(src, 'exclude');
  return out;
}

/**
 * 展开 members 里的**通配**（`crates/*`）。
 *
 * ⚠️ 为什么必须展开（2026-11-11 实测）：hengjian 的 members 就是 `crates/*`
 *    ⇒ ⇒ 不展开 ⇒ ⇒ 它的六个成员 crate **一个都看不见** ⇒ ⇒ 那把尺子量的是空面。
 *
 * @param {string[]} patterns 原始 members
 * @param {string[]} listing 该仓里所有带 Cargo.toml 的目录（相对路径）
 * @returns {string[]} 展开后的成员目录
 */
export function expandGlobPatterns(patterns, listing) {
  const out = [];
  const seen = new Set();
  const push = (p) => { const v = String(p).replace(/\\/g, '/'); if (!v || seen.has(v)) return; seen.add(v); out.push(v); };
  for (const pat of patterns || []) {
    const p = String(pat).replace(/\\/g, '/');
    if (!p.includes('*')) { push(p); continue; }
    const prefix = p.slice(0, p.indexOf('*'));
    const suffix = p.slice(p.indexOf('*') + 1);
    for (const dir of listing || []) {
      const d = String(dir).replace(/\\/g, '/');
      if (!d.startsWith(prefix)) continue;
      if (suffix && !d.endsWith(suffix)) continue;
      push(d);
    }
  }
  return out;
}

/** 语义化版本比较：缺段当 0。 */
export function parseVer(v) {
  if (!v) return null;
  const core = String(v).split('+')[0].split('-')[0];
  const parts = core.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
export function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * 一个**仓**的地板 —— 从根 manifest ＋ 成员 manifest 合起来读。
 *
 * 口径与地板闸一致：**取最严**（成员里最严的那个才是这个仓的真地板）。
 *
 * @param {{name:string, rootText:string, members:{name:string,text:string}[]}} repo
 * @returns {{repo:string, floors:string[], floor:string|null, problems:string[]}}
 */
export function repoFloors(repo) {
  const root = parseCargoSections(repo.rootText);
  const floors = [];
  const problems = [];
  const push = (v) => { if (v && !floors.includes(v)) floors.push(v); };

  if (root.packageRust) push(root.packageRust);

  for (const mem of repo.members || []) {
    const s = parseCargoSections(mem.text);
    if (s.packageRust) { push(s.packageRust); continue; }
    if (s.packageRustInherit) {
      if (root.workspaceRust) push(root.workspaceRust);
      else problems.push(mem.name + ' 继承 workspace 地板但根没有 [workspace.package] rust-version');
      continue;
    }
    problems.push(mem.name + ' 没有声明 rust-version');
  }
  let floor = null;
  for (const f of floors) {
    const v = parseVer(f);
    if (!v) continue;
    if (!floor || cmpVer(v, parseVer(floor)) > 0) floor = f;
  }
  return { repo: repo.name, floors, floor, problems };

}

/**
 * 一份 manifest 里的 **path 依赖**（原始路径串）—— 只看**依赖表**。
 *
 * ⚠️ 为什么必须看**表名**：本仓 `[[bin]] path = "src/bin/bench.rs"` 那是**目标路径**
 *    不是依赖 ⇒ ⇒ 不看表名就会把一个文件当成一个仓。
 *
 * ⚠️ 为什么**不 import** `brain-loaded-repos.mjs`：它在**别的会话的在飞面**上
 *    ⇒ ⇒ 我的尺子不依赖别人的在飞件 ⇒ ⇒ 也不会被它的改动打断。
 *
 * @param {string} text Cargo.toml 全文
 * @returns {string[]} path 依赖的原始路径串
 */
export function pathDeps(text) {
  const src = String(text || '');
  const out = [];
  let cur = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const h = line.match(/^\[([^\]]+)\]$/);
    if (h) { cur = h[1].trim(); continue; }
    if (!cur) continue;
    const isDepTable =
      cur === 'dependencies' ||
      cur === 'dev-dependencies' ||
      cur === 'build-dependencies' ||
      cur === 'workspace.dependencies' ||
      /(^|\.)dependencies$/.test(cur);
    if (!isDepTable) continue;
    // ⚠️ **依赖行可能是多行的**（实测 `encephalon = { path = "...", features = [` 换行续写）
    //    ⇒ ⇒ 只按「一行里同时有 { 和 }」认 ⇒ ⇒ 会漏掉多行的那一条。
    //    ⇒ ⇒ 改成：**表内**任何一行出现 `name = {` 就**开一条依赖**，
    //    ⇒ ⇒ 它的 `path = "..."` 在**后面若干行**里找（到下一个 `name = {` 或表尾为止）。
    const start = line.match(/^([A-Za-z0-9_-]+)\s*=\s*\{/);
    if (start) {
      const pm = line.match(/\bpath\s*=\s*"([^"]+)"/);
      if (pm) out.push(pm[1]);
      // 往后吃续行，直到下一个依赖名或表尾
      const rest = src.slice(src.indexOf(raw) + raw.length);
      const tail = rest.split(/\r?\n/);
      let consumed = 0;
      for (const t2 of tail) {
        const l2 = t2.trim();
        if (!l2 || l2.startsWith('#')) { consumed += 1; continue; }
        if (/^\[/.test(l2)) break;               // 表尾 ⇒ 停
        if (/^[A-Za-z0-9_-]+\s*=\s*\{/.test(l2)) break;  // 下一个依赖 ⇒ 停
        const p2 = l2.match(/\bpath\s*=\s*"([^"]+)"/);
        if (p2) { out.push(p2[1]); break; }
        consumed += 1;
        if (consumed > 40) break;
      }
    }
  }
  return out;
}

/**
 * 一个绝对路径**属于哪个仓** —— 找那个「目录是它的祖先」的仓。
 *
 * ⚠️ 为什么必须按**路径**认而不是按**名字**认（2026-11-11 实测）：
 *   · `shadow-desktop/src-tauri` 的依赖写的是 `../../../encephalon`（**三层**）；
 *   · `telencephalon` 成员之间的依赖写的是 `../behavior-stub`（**仓内**）；
 *   ⇒ ⇒ 按名字认 ⇒ ⇒ 前者找不到、后者把**同仓成员**当成兄弟仓 ⇒ ⇒ 两种都错。
 *
 * @param {string} absPath 依赖解析后的绝对路径
 * @param {{name:string, dir:string}[]} repoDirs 已知仓（名字 ＋ 目录）
 * @returns {string|null} 所属仓名（null ⇒ 不属于任何已知仓）
 */
export function ownerRepoOf(absPath, repoDirs) {
  const target = resolve(String(absPath || ''));
  let best = null;
  let bestLen = -1;
  for (const entry of repoDirs || []) {
    const dir = resolve(entry.dir);
    const hit = target === dir || target.startsWith(dir + sep);
    if (!hit) continue;
    if (dir.length > bestLen) { best = entry; bestLen = dir.length; }
  }
  return best ? best.name : null;
}

/**
 * 跨仓对账 —— 判「依赖边上的地板漂移」。
 *
 * @param {{repos:{repo:string,floors:string[],floor:string|null,problems:string[]}[], edges:{from:string,to:string}[]}} input
 * @returns {{verdict:string, violations:{from:string,to:string,fromFloor:string,toFloor:string}[],
 *          unresolved:{from:string,to:string,reason:string}[], distinct:string[], reasons:string[]}}
 */
export function judgeFloors(input) {
  const repos = input.repos || [];
  const edges = input.edges || [];
  const byName = new Map(repos.map((r) => [r.repo, r]));
  const violations = [];
  const unresolved = [];
  const distinct = [];

  for (const r of repos) {
    if (r.floor && !distinct.includes(r.floor)) distinct.push(r.floor);
  }

  for (const e of edges) {
    const from = byName.get(e.from);
    const to = byName.get(e.to);
    if (!from) { unresolved.push({ from: e.from, to: e.to, reason: '消费者仓不在面里' }); continue; }
    if (!to) { unresolved.push({ from: e.from, to: e.to, reason: '被依赖的仓不在面里' }); continue; }
    if (!from.floor) { unresolved.push({ from: e.from, to: e.to, reason: from.repo + ' 读不出地板' }); continue; }
    if (!to.floor) { unresolved.push({ from: e.from, to: e.to, reason: to.repo + ' 读不出地板' }); continue; }
    if (cmpVer(parseVer(from.floor), parseVer(to.floor)) < 0) {
      violations.push({ from: e.from, to: e.to, fromFloor: from.floor, toFloor: to.floor });
    }
  }

  const reasons = [];
  if (violations.length > 0) {
    reasons.push('依赖边上的地板漂移 ' + violations.length + ' 条（消费者承诺 < 提供者承诺 ⇒ ⇒ 消费者的承诺是假的）');
    return { verdict: 'drift', violations, unresolved, distinct, reasons };
  }
  if (unresolved.length > 0) {
    reasons.push('有 ' + unresolved.length + ' 条依赖边量不了（读不到地板 / 仓不在面里）⇒ ⇒ 那一格没验成');
    return { verdict: 'cannot-judge', violations, unresolved, distinct, reasons };
  }
  reasons.push('每条 path 依赖边上的地板都单调不降');
  return { verdict: 'consistent', violations, unresolved, distinct, reasons };
}

/**
 * 在 YAML 文档里按路径取值（只认 map 的 entry）⇒ ⇒ 纯函数。
 *
 * @param {object} node
 * @param {string[]} path
 * @returns {object|null}
 */
export function mapPath(node, path) {
  let cur = node;
  for (const key of path || []) {
    if (!cur || cur.type !== 'map') return null;
    let hit = null;
    for (const entry of cur.entries || []) {
      if (entry.key === key) { hit = entry.value; break; }
    }
    cur = hit;
  }
  return cur || null;
}

/**
 * 从 **composite action** 里读出「检出清单」—— 那是全仓**唯一一份**兄弟仓名单。
 *
 * ⚠️ 为什么不用手写名单：**清单只有这一份**（连 ci.yml／desktop-e2e.yml／
 *    desktop-rust.yml 都调它）⇒ ⇒ 复制第二份 ⇒ ⇒ 迟早漂 ⇒ ⇒ 而漂了的名单
 *    会让「判少了仓」看起来像「判过了」。
 *
 * ⚠️ **认不出 ⇒ ⇒ 判不了，绝不是绿**：形状变了（改 key / 改成流式 / 删掉 outputs）
 *    ⇒ ⇒ 必须报「判不了」⇒ ⇒ 否则「格式变了」会被读成「全一致」＝最坏的一类假绿。
 *
 * @param {string} actionText composite action 的 YAML 全文
 * @returns {{ok:boolean, repos:string[], reason:string}}
 */
export function expectedSiblings(actionText) {
  if (!actionText) return { ok: false, repos: [], reason: '读不到 composite action 文本' };
  let doc;
  try {
    doc = scanYamlText(String(actionText), { composite: true }).doc;
  } catch (err) {
    return { ok: false, repos: [], reason: 'composite action 解析失败：' + String(err && err.message ? err.message : err) };
  }
  const node = mapPath(doc, ['outputs', 'workspaces', 'value']);
  if (!node || !node.value) {
    return { ok: false, repos: [], reason: 'composite action 里没有 outputs.workspaces.value（形状变了）' };
  }
  const repos = String(node.value).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!repos.length) return { ok: false, repos: [], reason: 'outputs.workspaces.value 是空的' };
  return { ok: true, repos, reason: '' };
}

