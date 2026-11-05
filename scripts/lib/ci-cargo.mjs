
/**
 * CI 布局探针 —— **Cargo 清单解析**这一层（工具，不是判据）。
 * ===========================================================================
 *
 * ⚠️ **这个文件不是闸** —— 闸是 scripts/check-*.mjs（治理闸只数那个形状）。
 *    这里只是**可复跑的分析工具** ⇒ ⇒ 「CI 的检出清单对不对」这件事
 *    从「人工 grep」变成「一条命令能重跑」⇒ ⇒ 但**它还没有判据、没有自检、
 *    没接 CI** ⇒ ⇒ 升级成闸是登记在册的欠账（见 AGENTS.md U+3398 条 ⑥②）。
 *
 * ── 它回答什么问题 ──────────────────────────────────────────────────────
 * 「某个 CI job 的 cargo 步骤，它真正需要的 path 依赖**闭包**是什么？
 *  而这个 job 声明的检出清单，**够不够**？」
 *
 * ⚠️ **为什么必须算闭包、不能只看一条 path** ——
 *   cargo 连 **optional 的 path 依赖**也要读它的 manifest ⇒ ⇒
 *   缺一个兄弟仓 ⇒ ⇒ **整个 job 连依赖图都解析不出来**（不是编译错）。
 *   ⇒ ⇒ 而「缺哪一个」不是看出来的，是**递归算出来的**。
 *
 * ── 两种布局（同一份代码，两处跑）─────────────────────────────────────
 *   · **本地**：兄弟仓在 shadow 仓的**兄弟目录**。
 *   · **CI**：actions/checkout 把本仓 checkout 到 **GITHUB_WORKSPACE 根**
 *     ⇒ ⇒ 兄弟仓 checkout 到 **path: <name>** ⇒ ⇒ 落在工作区**之内**。
 * ⇒ ⇒ 本仓自己在 root（CI）还是在 <ws>/shadow（release.yml）**结果不同**
 * ⇒ ⇒ 所以每条 path 表达式都要在**虚拟布局**里重新解析一遍。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** shadow 仓根 */
export const SHADOW_ROOT = path.resolve(HERE, '..', '..');
/** 工作区根（兄弟仓都在它下面） */
export const LOCAL = path.dirname(SHADOW_ROOT);

const skip = (n) =>
  n === 'target' || n === '.git' || n === 'node_modules' || n === 'build' ||
  n === '.local' || n === '.dart_tool';

/** 仓清单＝**自动发现**工作区根下所有带 .git 的目录（硬编码名单＝已知会漏）。 */
export function discoverRepos() {
  const out = [];
  let ents = [];
  try {
    ents = fs.readdirSync(LOCAL, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    if (!fs.existsSync(path.join(LOCAL, e.name, '.git'))) continue;
    out.push(e.name);
  }
  return out;
}
export const REPOS = discoverRepos();

/** 一个仓里所有 Cargo.toml（跳过 target/ 等）。 */
export function manifests(root) {
  const out = [];
  const top = path.join(root, 'Cargo.toml');
  if (fs.existsSync(top)) out.push(top);
  const walk = (d, dep) => {
    if (dep > 5) return;
    let es = [];
    try {
      es = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      if (!e.isDirectory() || skip(e.name)) continue;
      const p = path.join(d, e.name);
      walk(p, dep + 1);
      const m = path.join(p, 'Cargo.toml');
      if (fs.existsSync(m)) out.push(m);
    }
  };
  walk(root, 0);
  return out;
}

/** 去注释（Cargo.toml 里 # 与 // 后面都是注释）。 */
export function strip(t) {
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)#.*$/, '').replace(/\/\/.*$/, ''))
    .join('\n');
}

/** 把 TOML 拆成「段 + 键 + 值」的条目（值可跨行：inline table / 数组）。 */
export function logical(t) {
  const out = [];
  let sec = '';
  const L = t.split(/\n/);
  for (let li = 0; li < L.length; li++) {
    const s = L[li].trim();
    if (!s) continue;
    const th = s.match(/^\[([^\]]+)\]$/);
    if (th) {
      sec = th[1];
      out.push({ sec, key: null, val: '' });
      continue;
    }
    let val = s;
    let depth = (s.match(/[{[]/g) || []).length - (s.match(/[}\]]/g) || []).length;
    while (depth > 0 && li + 1 < L.length) {
      li++;
      val += ' ' + L[li].trim();
      depth += (L[li].match(/[{[]/g) || []).length - (L[li].match(/[}\]]/g) || []).length;
    }
    const km = val.match(/^([A-Za-z0-9_.-]+)\s*=\s*([\s\S]*)$/);
    if (km) out.push({ sec, key: km[1], val: km[2] });
  }
  return out;
}
export function entries(file) {
  return logical(strip(fs.readFileSync(file, 'utf8')));
}

/** 清单里所有 path 依赖（连 optional 的也要 —— cargo 会读它们的 manifest）。 */
export function pathDeps(file) {
  const out = [];
  for (const e of entries(file)) {
    if (!e.key) continue;
    const pm = e.val.match(/path\s*=\s*"([^"]+)"/);
    if (pm) {
      out.push({
        sec: e.sec,
        key: e.key,
        path: pm[1],
        inherited: /workspace\s*=\s*true/.test(e.val),
      });
    }
  }
  return out;
}
export function membersOf(file) {
  const es = entries(file);
  let inWs = false;
  let arr = [];
  for (const e of es) {
    if (e.key === null) {
      inWs = e.sec === 'workspace';
      continue;
    }
    if (inWs && e.key === 'members') {
      arr = (e.val.match(/"([^"]+)"/g) || []).map((x) => x.slice(1, -1));
    }
  }
  return arr;
}
/** 某个绝对路径属于哪个仓（最长前缀）。 */
export function repoOf(p) {
  let best = null;
  for (const r of REPOS) {
    const root = path.join(LOCAL, r);
    if (p === root || p.startsWith(root + path.sep)) {
      if (!best || root.length > best.length) best = r;
    }
  }
  return best;
}
/** 最近的祖先 workspace 根（带 [workspace] 表的那个）。 */
export function wsRoot(manifest) {
  let dir = path.dirname(manifest);
  for (;;) {
    const c = path.join(dir, 'Cargo.toml');
    if (fs.existsSync(c) && manifest === c) return c;
    if (fs.existsSync(c)) {
      const t = fs.readFileSync(c, 'utf8');
      if (/^\s*\[workspace\]/m.test(strip(t))) {
        const mem = membersOf(c);
        const rel = path.relative(dir, manifest).split(path.sep).join('/');
        if (mem.length === 0 || mem.some((m) => m === rel || rel.startsWith(m.replace(/\/\*$/, '')))) {
          return c;
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir.length <= LOCAL.length) break;
    dir = parent;
  }
  return null;
}
