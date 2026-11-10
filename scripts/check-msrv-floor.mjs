#!/usr/bin/env node
/**
 * MSRV 地板闸 —— **分仓地板**（每个仓自报自己的地板；尺子只读事实，不替人挑数）
 * ============================================================================
 *
 * ## 这一版改了什么（2026-11-11）
 *
 * ⚠️ **旧版**有一个**人挑的数**：`--floor 1.94`（默认值写死）⇒ ⇒ 「地板」靠一个人裁决 ⇒ ⇒
 *   而「**1.94 线**」（允许到 1.94.99）与「**地板精确值 1.94.0**」（cargo 眼里 `>= 1.94.0`）
 *   两套口径并存 ⇒ ⇒ 「线内 PASS」≠「地板可建」⇒ ⇒ ⇒
 *   于是「地板到底是多少」成了一件**没有机械答案**的事 ⇒ ⇒ 只能靠人拍板 ⇒ ⇒ **尺子机械化不了**。
 *
 * ✅ **新版（默认口径 auto）**：**地板 ＝ 该仓自己 manifest 里声明的 `rust-version`**（自报）⇒ ⇒
 *   · 尺子**不再需要任何人拍板** ⇒ ⇒ 口径**机械**了（谁承诺谁负责）；
 *   · **承诺按 cargo 的原意读**（`rust-version = "1.94"` 就是 `>= 1.94.0`）⇒ ⇒
 *     **「线内 PASS」那种假绿消失** ⇒ ⇒ 依赖要 1.94.1 ⇒ ⇒ 就是**越了自报的承诺**；
 *   · **零跨仓改动** ⇒ ⇒ 谁的仓谁自己报 ⇒ ⇒ **不代改任何兄弟仓的声明**。
 *
 * ⚠️ **全局地板那一档还在**（`--floor <v>`）⇒ ⇒ 那是**取证面**（要与历史读数逐字对齐），
 *   **不是默认口径** ⇒ ⇒ 默认就是 **auto（自报）**。
 *
 * ## 判据（auto 口径）
 *   1. **自报地板** ＝ 该仓 **workspace 成员**声明的 `rust-version` 的**最严值**
 *      （⚠️ 一个都没声明 ⇒ ⇒ **判不了**，不是红：那一格没验成）；
 *   2. **承诺**：该仓的**第三方依赖闭包**里，每个包的 `rust-version` 必须 ≤ 自报地板 ⇒ ⇒ 越线 ⇒ 红；
 *      （⚠️ **第三方闭包**＝只走「非 path 依赖」的边 ⇒ ⇒ **兄弟仓（path 依赖）自己的债不记在这个仓头上**
 *        ⇒ ⇒ 「谁的债归谁」这一条才立得住 ⇒ ⇒ 否则一个仓的债会顺着 path 依赖染遍全家）；
 *   3. **自有 crate 缺声明** ⇒ 红（声明债：没有自报就没有承诺）；
 *   4. **自有 crate 声明不一致** ⇒ 只出声（承诺按**最严**那个算 ⇒ ⇒ 不判红）。
 *
 * ## 两档地板语义（global 那一档保留，auto 那一档不用它）
 *   - 「1.94 线」＝ 1.94.x ⇒ 允许上限 1.94.99（任何 1.95+ 越线）——**旧口径**；
 *   - 「地板精确值」＝ 1.94.0 —— `rust-version = "1.94"` 在 cargo 眼里就是 `>= 1.94.0`
 *     ⇒ ⇒ 依赖要 1.94.1 ⇒ ⇒ **在地板精确值上编不过** ⇒ ⇒ 「线内 PASS」≠「地板可建」
 *     ⇒ ⇒ 实测（2026-11-11）hippocampus 在 rustc 1.94.0 上真编：20 个 aws 系包要 1.94.1。
 *
 * ## 用法
 *   node scripts/check-msrv-floor.mjs [--manifest-path <Cargo.toml>] [--floor auto|<v>]
 *   node scripts/check-msrv-floor.mjs --self-test   ← 合成夹具，**不需要 cargo**
 *   不传 --manifest-path 时，从当前目录向上找 Cargo.toml。
 *
 * 退出码：0 = 通过；1 = 有违规；2 = 自身出错 / **判不了**（查不到 manifest / cargo 跑不通 / 没人自报地板）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  // ⚠️ **默认＝auto（自报）** —— 口径机械化的关键：默认路径上**没有人挑的数**。
  const out = { manifest: null, floor: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest-path' && argv[i + 1]) out.manifest = resolve(argv[++i]);
    else if (argv[i] === '--floor' && argv[i + 1]) out.floor = argv[++i];
    else if (argv[i].startsWith('--floor=')) out.floor = argv[i].slice('--floor='.length);
  }
  return out;
}

function findManifest(start) {
  let dir = start;
  for (let i = 0; i < 40; i++) {
    const p = resolve(dir, 'Cargo.toml');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 语义化版本比较：缺段当 0。 */
function parseVer(v) {
  if (!v) return null;
  const core = String(v).split('+')[0].split('-')[0];
  const parts = core.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
function fmt(v) {
  return v.join('.');
}

/**
 * **自报地板** —— 纯函数（零 I/O）⇒ ⇒ 自检能喂合成夹具。
 *
 * 口径：**该仓 workspace 成员的 `rust-version` 声明里最严的那个**。
 * ⚠️ 为什么取**最严**而不是最松：承诺是**整个仓**的 ⇒ ⇒ 成员里最严的那个才是这个仓的真地板。
 * ⚠️ 为什么用 **workspace 成员**而不是「所有 path 依赖」：path 依赖可能是**兄弟仓**
 *   ⇒ ⇒ 那是**别的仓的承诺** ⇒ ⇒ 记在本仓头上就是「替别人认债」。
 *
 * @param {object} meta cargo metadata
 * @returns {{floor:number[]|null, declared:Array, missing:Array, inconsistent:string[], members:number}}
 */
export function selfReportedFloor(meta) {
  const memberIds = new Set(meta.workspace_members || []);
  const members = (meta.packages || []).filter((p) => memberIds.has(p.id));
  const declared = [];
  const missing = [];
  for (const p of members) {
    if (!p.rust_version) {
      missing.push(p.name + ' ' + p.version);
      continue;
    }
    declared.push({ name: p.name, version: p.version, rust_version: p.rust_version, v: parseVer(p.rust_version) });
  }
  let floor = null;
  for (const d of declared) if (!floor || cmp(d.v, floor.v) > 0) floor = d;
  const distinct = [...new Set(declared.map((d) => d.rust_version))];
  return {
    floor: floor ? floor.v : null,
    floorRaw: floor ? floor.rust_version : null,
    floorFrom: floor ? floor.name + ' ' + floor.version : null,
    declared,
    missing,
    inconsistent: distinct.length > 1 ? distinct : [],
    members: members.length,
  };
}

/**
 * **第三方依赖闭包** —— 纯函数（零 I/O）。
 *
 * 只走「非 path 依赖」的边 ⇒ ⇒ **兄弟仓（path 依赖）的债不记在这个仓头上**。
 * ⚠️ 走的是 cargo 的 resolve 图（`resolve.nodes[].deps[].dep_kinds[].kind`）⇒ ⇒
 *   「path」那一类边**不跟** ⇒ ⇒ 兄弟仓那棵子树整体被排除。
 * ⚠️ 拿不到 resolve 图 ⇒ ⇒ 返回 null ⇒ ⇒ 判不了（**绝不**退回「全部算我的」⇒ 那会把
 *   兄弟仓的债染遍全家 ⇒ ⇒ 分仓地板就白做了）。
 *
 * @param {object} meta cargo metadata
 * @param {Set<string>} rootIds 起点（workspace 成员）
 * @returns {Set<string>|null}
 */
export function thirdPartyClosure(meta, rootIds) {
  const nodes = meta.resolve && meta.resolve.nodes;
  if (!nodes) return null;
  const byId = new Map((meta.packages || []).map((p) => [p.id, p]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodeById.get(id);
    if (!node) continue;
    for (const d of node.deps || []) {
      const kinds = (d.dep_kinds || []).map((k) => k.kind);
      // ⚠️ **path 边不跟** ⇒ ⇒ 兄弟仓那棵子树整体排除。
      if (kinds.length && kinds.every((k) => k === 'path')) continue;
      const p = byId.get(d.pkg);
      if (!p) continue;
      const isPathDep = p.source === null || String(p.source).startsWith('path+');
      if (isPathDep) continue; // ← 就算 kind 没标 path，源是 path 的也不算第三方
      stack.push(d.pkg);
    }
  }
  const out = new Set();
  for (const id of seen) if (!rootIds.has(id)) out.add(id);
  return out;
}

/**
 * 判断一份 cargo metadata ⇒ ⇒ 返回各条计数。
 *
 * ⚠️ **纯函数**（零 I/O）⇒ ⇒ 自检可以直接喂它**合成的夹具**⇒ ⇒
 *   不用 cargo、不用工具链 ⇒ ⇒ 「本机判不了」那一档不再挡住自检。
 *
 * @param {object} meta
 * @param {object} policy
 *   · mode: 'auto' | 'global'
 *   · limit:        要比的那个数（auto＝自报地板的精确值；global＝地板线）
 *   · lineLimit:    「同一条小版本线」的上限（用于**分档报数**：跨线 vs 补丁级）
 *   · ownIds:       自有 crate（workspace 成员）；null ⇒ 用旧口径（path 依赖）
 *   · depIds:       第三方依赖闭包；null ⇒ 用旧口径（所有非自有、非 vendor）
 *   · reportOnlyPatch: true ⇒ 补丁级越线**只报不判红**（global 那一档的历史行为）
 */
export function judge(meta, policy) {
  const ownIds = policy.ownIds || null;
  const depIds = policy.depIds || null;
  const limit = policy.limit;
  const lineLimit = policy.lineLimit;
  const reportOnlyPatch = !!policy.reportOnlyPatch;

  const patchViolations = [];
  const violations = [];
  const lineViolations = [];
  const ownMissing = [];
  const ownWrong = [];
  const vendored = [];
  let depMax = null;

  for (const p of meta.packages || []) {
    const isPath = p.source === null || String(p.source).startsWith('path+');
    // vendor/ 下的是第三方代码的 vendored 副本 —— 它的 MSRV 是上游的事，
    // 我们不该去改它的声明（改了就会与上游分叉），也不该拿它当自己的地板。
    const isVendored = isPath && String(p.manifest_path || '').split(/[\\/]/).includes('vendor');
    const isOwn = ownIds ? ownIds.has(p.id) : isPath && !isVendored;
    const rv = parseVer(p.rust_version);
    if (isVendored) {
      if (p.rust_version) vendored.push(p.name + ' ' + p.version + ' -> ' + p.rust_version);
      continue;
    }
    if (isOwn) {
      if (!p.rust_version) {
        ownMissing.push(p.name + ' ' + p.version);
      } else if (policy.mode === 'global' && cmp(rv, policy.exact) !== 0) {
        ownWrong.push(p.name + ' ' + p.version + ' -> ' + p.rust_version);
      }
      continue;
    }
    // ⚠️ **第三方依赖集合**：auto 口径下**只算本仓的第三方闭包**（兄弟仓的债不记在这）。
    if (depIds && !depIds.has(p.id)) continue;
    if (!rv) continue;
    if (!depMax || cmp(rv, parseVer(depMax.rust_version)) > 0) {
      depMax = { name: p.name, version: p.version, rust_version: p.rust_version };
    }
    if (cmp(rv, limit) > 0) {
      // ⚠️ **越承诺** ⇒ ⇒ auto 口径下**一律红**（补丁级也是：cargo 眼里 "1.94" 就是 ">= 1.94.0"）。
      violations.push(p.name + ' ' + p.version + ' -> ' + p.rust_version);
      if (cmp(rv, lineLimit) > 0) lineViolations.push(p.name + ' ' + p.version + ' -> ' + p.rust_version);
      else patchViolations.push(p.name + ' ' + p.version + ' -> ' + p.rust_version);
    } else if (reportOnlyPatch && cmp(rv, policy.exact) > 0) {
      patchViolations.push(p.name + ' ' + p.version + ' -> ' + p.rust_version);
    }
  }
  return { violations, patchViolations, lineViolations, ownMissing, ownWrong, vendored, depMax };
}

/**
 * 真自检 —— **合成夹具**喂进 judge() ⇒ ⇒ 证明这一格会红。
 *
 * ⚠️ 为什么不用「跑一次正常检查」当自检：它要 cargo ＋ Cargo.toml ⇒ ⇒
 *   本机判不了（退出码 2）⇒ ⇒ 恒绿或恒红都**证明不了任何事**。
 * ⚠️ 顺带一条：这样自检就**不需要环境**⇒ ⇒ 「本机判不了」那一档不再挡住 D2 纪律。
 */
function selfTest() {
  const own = (name, rv, opts) => {
    const o = opts || {};
    return {
      id: o.id || 'id-' + name,
      name: name,
      version: '0.1.0',
      source: null,
      rust_version: rv,
      manifest_path: o.path || '/w/' + name + '/Cargo.toml',
    };
  };
  const dep = (name, rv, id) => ({
    id: id || 'id-' + name,
    name: name,
    version: '1.0.0',
    source: 'registry+https://github.com/rust-lang/crates.io-index',
    rust_version: rv,
    manifest_path: '/r/' + name,
  });

  // ── 旧口径（global）：9 条历史断言逐字保留 ⇒ ⇒ 取证面不变 ──────────────
  const gFloor = parseVer('1.94');
  const gPolicy = {
    mode: 'global',
    limit: [gFloor[0], gFloor[1], 99],
    lineLimit: [gFloor[0], gFloor[1], 99],
    exact: [gFloor[0], gFloor[1], 0],
    ownIds: null,
    depIds: null,
    reportOnlyPatch: true,
  };
  const gCases = [
    { name: '自有 crate 缺 rust-version ⇒ 判红', packages: [own('a')], want: 1 },
    { name: '自有 crate 声明 != 地板 ⇒ 判红', packages: [own('a', '1.93')], want: 1 },
    { name: '依赖 1.95 ⇒ 越线判红', packages: [dep('d', '1.95.0')], want: 1 },
    { name: '依赖 1.94.1 ⇒ 仍在 1.94 线内 ⇒ 不判红', packages: [dep('d', '1.94.1')], want: 0 },
    { name: 'vendored 副本 1.99 ⇒ 不计入地板 ⇒ 不判红', packages: [own('v', '1.99.0', { path: '/w/vendor/v/Cargo.toml' })], want: 0 },
    { name: '依赖没有 rust_version ⇒ 跳过 ⇒ 不判红', packages: [dep('d', undefined)], want: 0 },
    { name: '全部合规（自有 1.94 ＋ 依赖 1.94.0）⇒ 不判红', packages: [own('a', '1.94'), dep('d', '1.94.0')], want: 0 },
    { name: '依赖 1.94.1 ⇒ 补丁级越线被点名 ⇒ ⇒ 但**不**判红（线语义不变）', packages: [own('a', '1.94'), dep('d', '1.94.1')], want: 0, patchWant: 1 },
    { name: '依赖 1.94.0 ⇒ 补丁级零越线', packages: [own('a', '1.94'), dep('d', '1.94.0')], want: 0, patchWant: 0 },
  ];

  // ── 新口径（auto：自报地板）───────────────────────────────────────────
  const aPolicy = (floorRaw) => {
    const f = parseVer(floorRaw);
    return {
      mode: 'auto',
      limit: f,
      lineLimit: [f[0], f[1], 99],
      exact: f,
      ownIds: null,
      depIds: null,
      reportOnlyPatch: false,
    };
  };
  const autoCases = [
    {
      name: 'auto：自报 1.94 ＋ 依赖 1.94.1 ⇒ ⇒ **补丁级也判红**（承诺按 cargo 的原意读）',
      run: () => {
        const r = judge({ packages: [own('a', '1.94'), dep('d', '1.94.1')] }, aPolicy('1.94'));
        return r.violations.length === 1 && r.patchViolations.length === 1 && r.ownMissing.length === 0;
      },
    },
    {
      name: 'auto：自报 1.95 ＋ 依赖 1.95 ⇒ ⇒ 不判红',
      run: () => {
        const r = judge({ packages: [own('a', '1.95'), dep('d', '1.95')] }, aPolicy('1.95'));
        return r.violations.length === 0;
      },
    },
    {
      name: 'auto：自报 1.94 ＋ 依赖 1.95 ⇒ ⇒ 判红（跨线档）',
      run: () => {
        const r = judge({ packages: [own('a', '1.94'), dep('d', '1.95')] }, aPolicy('1.94'));
        return r.violations.length === 1 && r.lineViolations.length === 1 && r.patchViolations.length === 0;
      },
    },
    {
      name: 'auto：自报 1.94 ＋ 依赖 1.94.0 ⇒ ⇒ 不判红',
      run: () => {
        const r = judge({ packages: [own('a', '1.94'), dep('d', '1.94.0')] }, aPolicy('1.94'));
        return r.violations.length === 0 && r.patchViolations.length === 0;
      },
    },
    {
      name: 'auto：**没人自报地板** ⇒ ⇒ 地板未定（⇒ main 判不了，绝不是绿）',
      run: () => {
        const s = selfReportedFloor({ workspace_members: ['id-a'], packages: [own('a', undefined)] });
        return s.floor === null && s.missing.length === 1;
      },
    },
    {
      name: 'auto：**自报取最严**（成员声明 1.94 / 1.95 ⇒ 地板 1.95）',
      run: () => {
        const s = selfReportedFloor({
          workspace_members: ['id-a', 'id-b'],
          packages: [own('a', '1.94'), own('b', '1.95')],
        });
        return s.floor.join('.') === '1.95.0' && s.inconsistent.length === 2;
      },
    },
    {
      name: 'auto：**判红用整图**（兄弟仓子树里的高 MSRV 也算我的）⇒ ⇒ 绝不因为「排除 path 子树」而假绿',
      run: () => {
        const r = judge({ packages: [own('a', '1.94'), dep('sib', '1.95', 'id-sib')] }, { ...aPolicy('1.94'), depIds: null });
        return r.violations.length === 1;
      },
    },
    {
      name: 'auto：**第三方闭包**只算本仓 ⇒ ⇒ 兄弟仓的债不记在这个仓头上',
      run: () => {
        const meta = {
          workspace_members: ['id-a'],
          packages: [own('a', '1.94'), dep('sib', '1.95', 'id-sib'), dep('mine', '1.94.0', 'id-mine')],
          resolve: {
            nodes: [
              {
                id: 'id-a',
                deps: [
                  { pkg: 'id-sib', dep_kinds: [{ kind: 'path' }] },
                  { pkg: 'id-mine', dep_kinds: [{ kind: 'normal' }] },
                ],
              },
            ],
          },
        };
        const ids = thirdPartyClosure(meta, new Set(['id-a']));
        if (!ids) return false;
        const r = judge(meta, { ...aPolicy('1.94'), ownIds: new Set(['id-a']), depIds: ids });
        return ids.has('id-mine') && !ids.has('id-sib') && r.violations.length === 0;
      },
    },
    {
      name: 'auto：**拿不到 resolve 图** ⇒ ⇒ 闭包判不了（绝不退回「全算我的」）',
      run: () => {
        const meta = { workspace_members: ['id-a'], packages: [own('a', '1.94'), dep('d', '1.95')] };
        return thirdPartyClosure(meta, new Set(['id-a'])) === null;
      },
    },
    {
      name: 'auto：**成员缺声明** ⇒ ⇒ 判红（声明债）',
      run: () => {
        const r = judge({ packages: [own('a', '1.94'), own('b', undefined, { id: 'id-b' })] }, aPolicy('1.94'));
        return r.ownMissing.length === 1;
      },
    },
  ];

  console.log('─'.repeat(72));
  console.log('MSRV 地板闸 —— 自检');
  console.log('─'.repeat(72));
  let fails = 0;
  for (const c of gCases) {
    const r = judge({ packages: c.packages }, gPolicy);
    const bad = r.ownMissing.length + r.ownWrong.length + r.violations.length;
    const patchOk = c.patchWant === undefined || r.patchViolations.length === c.patchWant;
    const ok = bad === c.want && patchOk;
    if (!ok) fails++;
    const tail = c.patchWant === undefined ? '' : '，补丁级 ' + r.patchViolations.length + '/' + c.patchWant;
    console.log('  ' + (ok ? '✓' : '✗') + ' [global] ' + c.name + '（期望 ' + c.want + ' 项，实得 ' + bad + ' 项' + tail + '）');
  }
  for (const c of autoCases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    if (!ok) fails++;
    console.log('  ' + (ok ? '✓' : '✗') + ' [auto] ' + c.name);
  }
  const total = gCases.length + autoCases.length;
  console.log('─'.repeat(72));
  if (fails === 0) {
    console.log('✓ 自检全绿（' + total + ' / ' + total + ' 条全绿）');
    process.exit(0);
  }
  console.error('✗ 自检 ' + fails + ' / ' + total + ' 条红');
  process.exit(1);
}

// ⚠️⚠️ **入口守卫** —— 这个文件同时是**判据库**（export judge / selfReportedFloor / thirdPartyClosure）
//   ⇒ ⇒ 若没有守卫 ⇒ ⇒ 一 import 就执行下面的 CLI 块 ⇒ ⇒ **把宿主进程直接带走**。
//   ⇒ ⇒ （2026-11-11 实测：import 本闸就会打印「找不到 Cargo.toml」并退出 2 ⇒ ⇒ 判据库根本用不了）
//   ⇒ ⇒ 形状照抄 scripts/lib/gate-runner.mjs 的那条纪律。
const invokedDirectly = (() => {
  try {
    const here = process.argv[1] ? resolve(process.argv[1]) : '';
    const self = resolve(fileURLToPath(import.meta.url));
    return here === self;
  } catch (err) {
    return false;
  }
})();

function main() {
  // ⚠️ 自检必须在「找 manifest」**之前**跑（它不需要 cargo，也不需要 Cargo.toml）。
  if (process.argv.includes('--self-test')) {
    selfTest();
  }
  const args = parseArgs(process.argv.slice(2));
  const manifest = args.manifest || findManifest(process.cwd());
  if (!manifest) {
    console.error('check-msrv-floor: 找不到 Cargo.toml');
    process.exit(2);
  }

  let raw;
  try {
    raw = execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', manifest], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 512,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = String((e.stderr || '') + (e.message || '')).split('\n').filter((l) => l.trim()).slice(0, 3).join(' | ');
    console.error('check-msrv-floor: cargo metadata --locked 跑不通 :: ' + err);
    process.exit(2);
  }

  let meta;
  try {
    meta = JSON.parse(raw);
  } catch {
    console.error('check-msrv-floor: cargo metadata 输出不是合法 JSON');
    process.exit(2);
  }

  const label = manifest.replace(/\\/g, '/').split('/').slice(-2).join('/');

  // ── 地板解析：auto（自报）＝ 默认 ／ global（人挑的数）＝ 取证面 ─────────────
  let policy;
  let floorRaw;
  let floorFrom = '';
  let selfInfo = null;
  if (args.floor === 'auto') {
    selfInfo = selfReportedFloor(meta);
    if (!selfInfo.floor) {
      // ⚠️ **没人自报地板 ⇒ ⇒ 判不了**（不是红）：那一格**没验成**，不是「有问题」。
      console.error(
        'check-msrv-floor: 这个仓**没有自报地板**（workspace 成员都没声明 rust-version）⇒ ⇒ 判不了',
      );
      process.exit(2);
    }
    const memberIds = new Set(meta.workspace_members || []);
    const closure = thirdPartyClosure(meta, memberIds);
    if (!closure) {
      // ⚠️ **拿不到 resolve 图 ⇒ ⇒ 算不出「本仓的第三方闭包」⇒ ⇒ 判不了**
      //   ⇒ ⇒ 绝不退回「所有第三方都算我的」⇒ ⇒ 那会把兄弟仓的债染遍全家。
      console.error('check-msrv-floor: cargo metadata 没给 resolve 图 ⇒ ⇒ 算不出本仓的第三方依赖闭包 ⇒ ⇒ 判不了');
      process.exit(2);
    }
    policy = {
      mode: 'auto',
      limit: selfInfo.floor,
      lineLimit: [selfInfo.floor[0], selfInfo.floor[1], 99],
      exact: selfInfo.floor,
      ownIds: memberIds,
      // ⚠️⚠️ **判红用「整图」**（depIds=null）⇒ ⇒ 问的是「**我这一坨构建**在自报地板上编不编得过」⇒ ⇒
      //   ⇒ ⇒ 兄弟仓子树里的高 MSRV 包**也**算我的 ⇒ ⇒ 因为我的构建真的要用它们 ⇒ ⇒
      //   ⇒ ⇒ 早先一版曾用「排除 path 子树的闭包」⇒ ⇒ 桌面端被判成「干净」⇒ ⇒ **假绿**
      //   ⇒ ⇒ （实测 2026-11-11：桌面端自己的闭包最高只有 notify-rust 1.89 ⇒ ⇒ 而它的整图有 7 项要 1.95
      //   ⇒ ⇒ ⇒ 而它的探针在 1.94.0 上真的编不过 ⇒ ⇒ 「地板可建」才是承诺的真义）
      depIds: null,
      // ⚠️ 下面这个闭包**只作归因参考**（只出声，不判红）：它回答「那些越线的包在**谁的子树**里」。
      closureForAttribution: closure,
      reportOnlyPatch: false,
    };
    floorRaw = selfInfo.floorRaw;
    floorFrom = selfInfo.floorFrom || '';
  } else {
    const floor = parseVer(args.floor);
    if (!floor) {
      console.error('check-msrv-floor: --floor 解析失败 :: ' + args.floor);
      process.exit(2);
    }
    policy = {
      mode: 'global',
      limit: [floor[0], floor[1], 99],
      lineLimit: [floor[0], floor[1], 99],
      exact: [floor[0], floor[1], 0],
      ownIds: null,
      depIds: null,
      reportOnlyPatch: true,
    };
    floorRaw = args.floor;
  }

  const judged = judge(meta, policy);
  const violations = judged.violations;
  const ownMissing = judged.ownMissing;
  const ownWrong = judged.ownWrong;
  const vendored = judged.vendored;
  const depMax = judged.depMax;
  const patchViolations = judged.patchViolations || [];
  const lineViolations = judged.lineViolations || [];

  if (policy.mode === 'auto') {
    console.log('MSRV floor check :: ' + label + ' :: floor=auto ⇒ 自报 ' + floorRaw + (floorFrom ? '（最严来自 ' + floorFrom + '）' : ''));
    console.log('  自报地板 :: ' + floorRaw + '（workspace 成员 ' + selfInfo.members + ' 个，声明 ' + selfInfo.declared.length + ' 个）');
    console.log('  自有 crate 缺 rust-version 声明 :: ' + ownMissing.length);
    ownMissing.forEach((v) => console.log('    - ' + v));
    console.log('  自有 crate 声明不一致（只出声，不判红） :: ' + selfInfo.inconsistent.length);
    selfInfo.inconsistent.forEach((v) => console.log('    ~ ' + v));
    console.log('  依赖越线（超出**自报地板** ' + fmt(policy.limit) + ' ⇒ ⇒ 在该地板上编不过） :: ' + violations.length);
    violations.forEach((v) => console.log('    - ' + v));
    if (lineViolations.length > 0) {
      console.log('    · 其中跨小版本线的 :: ' + lineViolations.length);
      lineViolations.forEach((v) => console.log('      - ' + v));
    }
    if (patchViolations.length > 0) {
      console.log('    · 其中同线内（补丁级）的 :: ' + patchViolations.length);
      patchViolations.forEach((v) => console.log('      - ' + v));
    }
    console.log('  依赖图最高 MSRV :: ' + (depMax ? depMax.name + ' ' + depMax.version + ' -> ' + depMax.rust_version : '<none>'));
    if (policy.closureForAttribution) {
      const own = meta.packages.filter((p) => policy.closureForAttribution.has(p.id));
      let ownMax = null;
      for (const p of own) {
        const rv = parseVer(p.rust_version);
        if (!rv) continue;
        if (!ownMax || cmp(rv, parseVer(ownMax.rust_version)) > 0) ownMax = { name: p.name, version: p.version, rust_version: p.rust_version };
      }
      console.log('  本仓自有闭包最高 MSRV（**归因参考**） :: ' + (ownMax ? ownMax.name + ' ' + ownMax.version + ' -> ' + ownMax.rust_version : '<none>'));
    }
    // ⚠️ **机器可读一行** ⇒ ⇒ 普查器优先读它（不靠人眼扫日志 ⇒ ⇒ 「只报」也能被对账）。
    console.log(
      '  MSRV :: mode=auto floor=' +
        floorRaw +
        ' violations=' +
        violations.length +
        ' line=' +
        lineViolations.length +
        ' patch=' +
        patchViolations.length +
        ' missing=' +
        ownMissing.length +
        ' max=' +
        (depMax ? depMax.rust_version : 'none'),
    );
  } else {
    console.log('MSRV floor check :: ' + label + ' :: floor=' + args.floor + ' (允许到 ' + fmt(policy.limit) + ')');
    console.log('  自有 crate 缺 rust-version 声明 :: ' + ownMissing.length);
    ownMissing.forEach((v) => console.log('    - ' + v));
    console.log('  自有 crate 声明 != 地板 :: ' + ownWrong.length);
    ownWrong.forEach((v) => console.log('    - ' + v));
    console.log('  vendored 第三方 crate（不计入地板） :: ' + vendored.length);
    vendored.forEach((v) => console.log('    ~ ' + v));
    console.log('  依赖要求超出地板的线 :: ' + violations.length);
    violations.forEach((v) => console.log('    - ' + v));
    console.log('  补丁级越线（超出地板**精确值** ' + fmt(policy.exact) + ' ⇒ ⇒ 在该精确值上编不过） :: ' + patchViolations.length);
    patchViolations.forEach((v) => console.log('    ~ ' + v));
    if (patchViolations.length > 0) {
      console.log('    ⚠️ 「线内 PASS」≠「地板可建」⇒ ⇒ 编译级读数靠 scripts/probe-msrv-floor.mjs（钉住 ' + fmt(policy.exact) + ' 真编）');
    }
    console.log('  依赖图最高 MSRV :: ' + (depMax ? depMax.name + ' ' + depMax.version + ' -> ' + depMax.rust_version : '<none>'));
    console.log(
      '  MSRV :: mode=global floor=' +
        args.floor +
        ' violations=' +
        violations.length +
        ' line=' +
        violations.length +
        ' patch=' +
        patchViolations.length +
        ' missing=' +
        ownMissing.length +
        ' max=' +
        (depMax ? depMax.rust_version : 'none'),
    );
  }

  const bad = ownMissing.length + ownWrong.length + violations.length;
  if (bad > 0) {
    console.error('VERDICT: FAIL (' + bad + ' 项)');
    process.exit(1);
  }
  console.log('VERDICT: PASS');

}

if (invokedDirectly) main();
