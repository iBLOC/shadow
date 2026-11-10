#!/usr/bin/env node
/**
 * MSRV 地板**跨仓对账闸** —— 「地板是否漂移」
 * ============================================================================
 *
 * ## 它判的是什么
 *
 * 承 U+34E0 条（地板口径改成分仓自报）：每个仓**自己**声明自己的地板。
 * ⇒ ⇒ 「地板是多少」不再需要人拍板。
 * ⇒ ⇒ 但**跨仓**还剩一族机械问题：**一条 path 依赖边上的地板必须单调不降**。
 *
 * · A 自报 1.94、A path 依赖 B、B 自报 1.95
 *   ⇒ ⇒ B 的 crate 要求 rustc >= 1.95 ⇒ ⇒ B 会被编进 A 的构建
 *   ⇒ ⇒ **A 在 1.94 上编不过** ⇒ ⇒ A 的承诺是假的。
 *
 * ⚠️ **各仓地板彼此不同**（桌面端 1.95 ／ 海马体 1.94）**不是红** ——
 *   在分仓自报口径下那都是诚实的 ⇒ ⇒ 只出声（distinct 列表），不判红。
 *
 * ## 它**不重做**地板闸
 *
 * `scripts/check-msrv-floor.mjs` 判「本仓第三方闭包有没有超过**自报**地板」
 * ⇒ ⇒ 而它的闭包**故意排除 path 依赖** ⇒ ⇒ 「本仓承诺被 path 依赖的兄弟仓打破」
 * ⇒ ⇒ **全仓没有任何闸在管** ⇒ ⇒ 这一刀补的就是它。
 *
 * ## 期望面 = **唯一一份**检出清单
 *
 * 期望的兄弟仓名单从 `.github/actions/ibloc-siblings/action.yml` 的
 * `outputs.workspaces.value` 读 ⇒ ⇒ 不手写第二份 ⇒ ⇒ 名单不会漂。
 * ⚠️ **认不出 ⇒ ⇒ 判不了（退出码 2），绝不是绿**。
 *
 * ## 两种布局都要认
 *
 * · 本机：兄弟仓在 shadow **仓外**（`../<name>`）；
 * · CI：兄弟仓被 checkout 到**仓根之下**（`<name>/`，因为本仓检在 `shadow/`）。
 * ⇒ ⇒ 两边都试 ⇒ ⇒ 同一套脚本。
 *
 * ## 退出码
 *
 * · 0 一致（每条边单调不降）
 * · 1 漂移（有边的消费者承诺 < 提供者承诺）
 * · 2 判不了（清单读不出 / 仓不在位 / 读不出地板）
 *
 * 用法：node scripts/check-msrv-floor-drift.mjs [--self-test] [--json]
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expectedSiblings,
  expandGlobPatterns,
  judgeFloors,
  ownerRepoOf,
  parseCargoSections,
  pathDeps,
  repoFloors,
} from './lib/msrv-floor-drift.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTION = join(REPO_ROOT, '.github', 'actions', 'ibloc-siblings', 'action.yml');

/**
 * **本仓内**的 Rust crate（它们也依赖兄弟仓 ⇒ ⇒ 它们的边也要被量）。
 *
 * ⚠️ 为什么必须进面：`shadow-desktop/src-tauri` 自报 **1.95** ＋ path 依赖
 *    `../../../encephalon` ／ `../../../synapse` ⇒ ⇒ 那两条边是「消费者承诺 ≥ 提供者承诺」
 *    的真实样本 ⇒ ⇒ 不进面 ⇒ ⇒ 它那一格永远没被量 ⇒ ⇒ 「没查却绿」。
 */
const OWN_CRATES = [
  { name: 'shadow-desktop', dir: join(REPO_ROOT, 'shadow-desktop', 'src-tauri') },
  { name: 'benchmark', dir: join(REPO_ROOT, 'benchmark') },
];

/** 兄弟仓的两种布局：仓外优先（与 scripts/lib/sibling-repo.mjs 同款口径）。 */
function siblingDir(repoRoot, name) {
  const outside = resolve(repoRoot, '..', name);
  if (existsSync(join(outside, 'Cargo.toml'))) return { dir: outside, layout: 'outside' };
  const inside = join(repoRoot, name);
  if (existsSync(join(inside, 'Cargo.toml'))) return { dir: inside, layout: 'inside' };
  return null;
}

/** 一个仓目录下所有带 Cargo.toml 的相对目录（供 members 通配展开）。 */
function listCrateDirs(dir, depth) {
  const out = [];
  const walk = (rel, level) => {
    if (level > (depth || 3)) return;
    let entries = [];
    try { entries = readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === 'target' || e.name === '.git' || e.name === 'node_modules') continue;
      const next = rel ? rel + '/' + e.name : e.name;
      if (existsSync(join(dir, next, 'Cargo.toml'))) out.push(next);
      walk(next, level + 1);
    }
  };
  walk('', 0);
  return out;
}

/**
 * 读一个仓的地板 + 它的 **path 依赖边**。
 *
 * ⚠️ **边按路径解析**（不按名字）：`path` 依赖先解析成绝对路径 ⇒ ⇒ 再看它落在**哪个仓目录**下。
 *   ⇒ ⇒ 仓内成员（`../behavior-stub`）**不是**跨仓边；
 *   ⇒ ⇒ 三层深（`../../../encephalon`）也能认出来。
 */
function readRepo(name, dir, knownDirs) {
  const rootPath = join(dir, 'Cargo.toml');
  const rootText = readFileSync(rootPath, 'utf8');
  const rootSecs = parseCargoSections(rootText);
  const listing = listCrateDirs(dir, 3);
  const memberDirs = expandGlobPatterns(rootSecs.members, listing);
  const members = [];
  for (const m of memberDirs) {
    const p = join(dir, m, 'Cargo.toml');
    if (!existsSync(p)) continue;
    members.push({ name: m, text: readFileSync(p, 'utf8') });
  }
  const floors = repoFloors({ name, rootText, members });
  const manifests = [{ dir: dir, text: rootText }].concat(
    members.map((m) => ({ dir: join(dir, m.name), text: m.text })),
  );
  const deps = [];
  for (const man of manifests) {
    for (const depPath of pathDeps(man.text)) {
      const abs = resolve(man.dir, depPath);
      const owner = ownerRepoOf(abs, knownDirs);
      // ⚠️ **落回自己** ⇒ ⇒ 那是**仓内成员**，不是跨仓边 ⇒ ⇒ 不计。
      if (!owner || owner === name) continue;
      if (!deps.includes(owner)) deps.push(owner);
    }
  }
  return { name, dir, floors, deps, crates: members.length + 1 };
}

/**
 * 真自检 —— **合成夹具**喂进 judgeFloors() ⇒ ⇒ 证明这一格会红。
 *
 * ⚠️ 夹具照抄**真实措辞**（2026-11-11 实测 16 个仓）：
 *   根 package 声明 ／ workspace.package ＋ 成员继承 ／ 纯虚拟 workspace ／ members 通配。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const R = (name, floor, deps) => ({ repo: name, floors: floor ? [floor] : [], floor: floor || null, problems: [] });

  add('单边且单调不降（消费者 1.95 依赖提供者 1.94）⇒ ⇒ 一致（绿）', () => {
    const j = judgeFloors({ repos: [R('a', '1.95', []), R('b', '1.94', [])], edges: [{ from: 'a', to: 'b' }] });
    return j.verdict === 'consistent' && j.violations.length === 0;
  });

  add('消费者承诺 < 提供者承诺（消费者 1.94 依赖提供者 1.95）⇒ ⇒ 漂移（红）', () => {
    const j = judgeFloors({ repos: [R('a', '1.94', []), R('b', '1.95', [])], edges: [{ from: 'a', to: 'b' }] });
    return j.verdict === 'drift' && j.violations.length === 1 && j.violations[0].from === 'a' && j.violations[0].to === 'b';
  });

  add('地板相等 ⇒ ⇒ 一致（同值不算漂移）', () => {
    const j = judgeFloors({ repos: [R('a', '1.94', []), R('b', '1.94', [])], edges: [{ from: 'a', to: 'b' }] });
    return j.verdict === 'consistent';
  });

  add('**各仓地板彼此不同**（桌面端 1.95 ／ 海马体 1.94）⇒ ⇒ **不是红**（分仓自报口径）', () => {
    const j = judgeFloors({ repos: [R('desktop', '1.95', []), R('hippo', '1.94', [])], edges: [] });
    return j.verdict === 'consistent' && j.distinct.length === 2;
  });

  add('提供者读不出地板 ⇒ ⇒ 判不了（**绝不是绿**）', () => {
    const j = judgeFloors({ repos: [R('a', '1.94', []), R('b', null, [])], edges: [{ from: 'a', to: 'b' }] });
    return j.verdict === 'cannot-judge' && j.unresolved.length === 1;
  });

  add('被依赖的仓不在面里 ⇒ ⇒ 判不了', () => {
    const j = judgeFloors({ repos: [R('a', '1.94', [])], edges: [{ from: 'a', to: 'ghost' }] });
    return j.verdict === 'cannot-judge';
  });

  add('**已证实的漂移优先于「判不了」**（漂移是事实，判不了只是没验完）', () => {
    // ⚠️ **边的方向**：from ＝ 消费者（依赖方），to ＝ 提供者（被依赖方）
    //    ⇒ ⇒ 漂移 ＝ 消费者地板 **低于** 提供者地板（a 1.94 依赖 b 1.95 ⇒ a 的承诺是假的）
    const j = judgeFloors({
      repos: [R('a', '1.94', []), R('b', '1.95', []), R('c', null, [])],
      edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }],
    });
    return j.verdict === 'drift' && j.violations.length === 1 && j.unresolved.length === 1;
  });

  add('解析：根 package 声明 ⇒ ⇒ 读到那个值', () => {
    const s = parseCargoSections('[package]\nname = "a"\nrust-version = "1.94"\n');
    return s.packageRust === '1.94' && s.workspaceRust === null;
  });

  add('解析：workspace.package 声明 ＋ 成员继承 ⇒ ⇒ 两个值都读到', () => {
    const root = parseCargoSections('[workspace]\nmembers = ["core"]\n\n[workspace.package]\nrust-version = "1.94"\n');
    const mem = parseCargoSections('[package]\nname = "core"\nrust-version.workspace = true\n');
    return root.workspaceRust === '1.94' && mem.packageRustInherit === true;
  });

  add('解析：纯虚拟 workspace（根没有 rust-version）⇒ ⇒ 根读出来是空（**不是** 1.94）', () => {
    const s = parseCargoSections('[workspace]\nmembers = ["crates/ziti-v2"]\n');
    return s.packageRust === null && s.workspaceRust === null && s.members.length === 1;
  });

  add('解析：members 多行写法 ⇒ ⇒ 读得到', () => {
    const s = parseCargoSections('[workspace]\nmembers = [\n  "a",\n  "b",\n]\n');
    return s.members.length === 2 && s.members[0] === 'a';
  });

  add('**通配 members**（`crates/*`）⇒ ⇒ 展开成实际目录（hengjian 的六个成员）', () => {
    const listing = ['crates/hengjian', 'crates/hengjian-ai', 'crates/hengjian-api', 'crates/hengjian-core', 'crates/hengjian-db', 'crates/hengjian-tools'];
    const got = expandGlobPatterns(['crates/*'], listing);
    return got.length === 6 && got.includes('crates/hengjian-core');
  });

  add('通配：仓里没有匹配目录 ⇒ ⇒ 展开为空（**不是**原样留着 `crates/*`）', () => {
    const got = expandGlobPatterns(['crates/*'], ['src']);
    return got.length === 0;
  });

  add('仓地板：纯虚拟 workspace ＋ 成员自带声明 ⇒ ⇒ 地板读到成员那个（**根没声明不等于没地板**）', () => {
    const f = repoFloors({
      name: 'ziti-rust',
      rootText: '[workspace]\nmembers = ["crates/ziti-v2"]\n',
      members: [{ name: 'crates/ziti-v2', text: '[package]\nname = "ziti-v2"\nrust-version = "1.94"\n' }],
    });
    return f.floor === '1.94' && f.problems.length === 0;
  });

  add('仓地板：成员继承 workspace.package ⇒ ⇒ 地板继承得到', () => {
    const f = repoFloors({
      name: 'hippocampus',
      rootText: '[workspace]\nmembers = ["hippocampus-core"]\n\n[workspace.package]\nrust-version = "1.94"\n',
      members: [{ name: 'hippocampus-core', text: '[package]\nname = "hippocampus-core"\nrust-version.workspace = true\n' }],
    });
    return f.floor === '1.94' && f.problems.length === 0;
  });

  add('仓地板：成员既不声明也不继承 ⇒ ⇒ 落进 problems（**地板那句话在它身上是空的**）', () => {
    const f = repoFloors({
      name: 'x',
      rootText: '[workspace]\nmembers = ["core"]\n',
      members: [{ name: 'core', text: '[package]\nname = "core"\n' }],
    });
    return f.floor === null && f.problems.length === 1;
  });

  add('仓地板：成员值不一致 ⇒ ⇒ 取**最严**那个（与地板闸同口径）', () => {
    const f = repoFloors({
      name: 'x',
      rootText: '[package]\nname = "x"\nrust-version = "1.94"\n',
      members: [{ name: 'core', text: '[package]\nname = "core"\nrust-version = "1.95"\n' }],
    });
    return f.floor === '1.95';
  });

  add('path 依赖发现：只在**依赖表**里认（`[[bin]] path` 不是依赖）', () => {
    const deps = pathDeps('[dependencies]\nserde = { version = "1" }\n\n[[bin]]\nname = "bench"\npath = "src/bin/bench.rs"\n');
    return deps.length === 0;
  });

  add('path 依赖发现：`../hippocampus/hippocampus-core` ⇒ ⇒ 认出一个 path 依赖', () => {
    const deps = pathDeps('[dependencies]\nhippocampus-core = { path = "../hippocampus/hippocampus-core" }\n');
    return deps.length === 1 && deps[0] === '../hippocampus/hippocampus-core';
  });

  add('**按路径认仓**：落在某个仓目录下的依赖 ⇒ ⇒ 那个仓就是归属仓', () => {
    const dirs = [{ name: 'hippocampus', dir: '/w/hippocampus' }, { name: 'telencephalon', dir: '/w/telencephalon' }];
    const owner = ownerRepoOf('/w/hippocampus/hippocampus-core', dirs);
    return owner === 'hippocampus';
  });

  add('**按路径认仓**：仓内成员（落在自己仓目录下）⇒ ⇒ 归属是自己 ⇒ ⇒ 不是跨仓边', () => {
    const dirs = [{ name: 'telencephalon', dir: '/w/telencephalon' }];
    return ownerRepoOf('/w/telencephalon/crates/behavior-stub', dirs) === 'telencephalon';
  });

  add('**按路径认仓**：三层深（`../../../encephalon`）⇒ ⇒ 也能认出来', () => {
    const dirs = [{ name: 'shadow-desktop', dir: '/w/shadow/shadow-desktop/src-tauri' }, { name: 'encephalon', dir: '/w/encephalon' }];
    return ownerRepoOf('/w/encephalon', dirs) === 'encephalon';
  });

  add('**按路径认仓**：不属于任何已知仓 ⇒ ⇒ null（不猜）', () => {
    const dirs = [{ name: 'a', dir: '/w/a' }];
    return ownerRepoOf('/other/x', dirs) === null;
  });

  add('检出清单：认得出 composite 的 outputs.workspaces.value', () => {
    const yml = 'name: X\noutputs:\n  workspaces:\n    description: d\n    value: |\n      telencephalon\n      hippocampus\n';
    const got = expectedSiblings(yml);
    return got.ok === true && got.repos.length === 2 && got.repos[1] === 'hippocampus';
  });

  add('检出清单：**形状变了**（没有 outputs.workspaces.value）⇒ ⇒ 判不了，**绝不是绿**', () => {
    const got = expectedSiblings('name: X\noutputs:\n  other:\n    value: 1\n');
    return got.ok === false && got.repos.length === 0;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try { ok = c.run() === true; } catch { ok = false; }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ ⇒ 这把尺子证明不了自己会红');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();
  const asJson = argv.includes('--json');

  // ❶ 期望面 = **唯一一份**检出清单
  if (!existsSync(ACTION)) {
    console.error('❌ 读不到 .github/actions/ibloc-siblings/action.yml ⇒ ⇒ 判不了');
    process.exit(2);
  }
  const expected = expectedSiblings(readFileSync(ACTION, 'utf8'));
  if (!expected.ok) {
    console.error('❌ 检出清单读不出来 :: ' + expected.reason + ' ⇒ ⇒ 判不了（绝不是绿）');
    process.exit(2);
  }

  // ❷ 逐仓读地板 + path 依赖边（**两遍**：先定目录，再解析边）
  const hits = [];
  const missing = [];
  for (const name of expected.repos) {
    const hit = siblingDir(REPO_ROOT, name);
    if (!hit) { missing.push(name); continue; }
    hits.push({ name, dir: hit.dir });
  }
  // ⚠️ **本仓内的 crate 也进面**（它们同样有跨仓依赖边）。
  for (const own of OWN_CRATES) {
    if (!existsSync(join(own.dir, 'Cargo.toml'))) { missing.push(own.name); continue; }
    hits.push({ name: own.name, dir: own.dir });
  }
  const knownDirs = hits.map((h) => ({ name: h.name, dir: h.dir }));
  const repos = hits.map((h) => readRepo(h.name, h.dir, knownDirs));

  // ❸ 边 = 本仓 path 依赖**另一个在面里的**仓
  const inFace = new Set(repos.map((r) => r.name));
  const edges = [];
  const edgesOut = [];
  for (const r of repos) {
    for (const dep of r.deps) {
      if (!inFace.has(dep)) { edgesOut.push({ from: r.name, to: dep }); continue; }
      edges.push({ from: r.name, to: dep });
    }
  }

  const judged = judgeFloors({
    repos: repos.map((r) => ({ repo: r.name, floors: r.floors.floors, floor: r.floors.floor, problems: r.floors.problems })),
    edges,
  });

  // ⚠️ **仓不在位 ⇒ ⇒ 那一格没验成**（不是「没问题」）
  const notInPlace = missing.length > 0 || edgesOut.length > 0;
  let verdict = judged.verdict;
  if (verdict === 'consistent' && notInPlace) verdict = 'cannot-judge';

  const lines = [];
  lines.push('MSRV 地板跨仓对账（分仓自报口径 · 判「漂移」不判「够不够高」）');
  lines.push('  期望的兄弟仓（唯一一份检出清单） :: ' + expected.repos.length + ' 个');
  for (const r of repos) {
    lines.push('  ' + (r.name + ' (' + r.crates + ' crates)').padEnd(34) + ' :: 自报 ' + (r.floors.floor || '<读不出>') + (r.floors.problems.length ? ' :: ⚠ ' + r.floors.problems.join('; ') : ''));
  }
  if (missing.length) lines.push('  ⚠ 不在位 :: ' + missing.join(', '));
  if (edgesOut.length) lines.push('  ⚠ 依赖了不在面里的仓 :: ' + edgesOut.map((e) => e.from + ' -> ' + e.to).join(', '));
  lines.push('  各仓地板取值（**彼此不同不是红**，分仓自报口径下那都是诚实的） :: ' + (judged.distinct.join(' / ') || '<none>'));
  lines.push('  path 依赖边（量「消费者承诺 >= 提供者承诺」） :: ' + edges.length + ' 条');
  for (const v of judged.violations) {
    lines.push('    ✗ 漂移 :: ' + v.from + '（自报 ' + v.fromFloor + '）依赖 ' + v.to + '（自报 ' + v.toFloor + '）⇒ ⇒ 消费者的承诺是假的');
  }
  for (const u of judged.unresolved) {
    lines.push('    ⚠ 判不了 :: ' + u.from + ' -> ' + u.to + ' :: ' + u.reason);
  }
  for (const r of judged.reasons) lines.push('  ⇒ ⇒ ' + r);
  lines.push('DRIFT :: ' + verdict + ' :: 仓数 ' + repos.length + ' :: 边 ' + edges.length + ' :: 漂移 ' + judged.violations.length + ' :: 判不了 ' + judged.unresolved.length + ' :: 取值 ' + (judged.distinct.join('/') || '-'));

  if (asJson) {
    console.log(JSON.stringify({ verdict, repos: repos.map((r) => ({ repo: r.name, floor: r.floors.floor, floors: r.floors.floors, problems: r.floors.problems })), edges, violations: judged.violations, unresolved: judged.unresolved, distinct: judged.distinct, missing, edgesOut }, null, 2));
  } else {
    for (const l of lines) console.log(l);
  }

  if (verdict === 'drift') process.exit(1);
  if (verdict === 'cannot-judge') process.exit(2);
  process.exit(0);
}

main();
