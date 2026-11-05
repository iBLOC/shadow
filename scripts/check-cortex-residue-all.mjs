#!/usr/bin/env node
/**
 * Cortex 残留闸 —— **跨仓入口**（一个入口扫全部 iBLOC 仓）
 *
 * ⚠️ 判据（算法）不在这里 ⇒ 在 `./lib/cortex-residue.mjs`（唯一一份）。
 *    每个仓的数据在 `./lib/cortex-registry.mjs`。
 *
 * ── 为什么要有这道闸（2026-11 的实测教训）────────────────────────────
 * 用户拍板：「Cortex 是过时概念应该删除」。
 * ⚠️ 但 iBLOC 这套栈是**十几个独立 git 仓** ⇒ 闸只住在 shadow 仓的话，
 *    **另外那些仓没人盯** ⇒ 实测真挖出来的：
 *      · prefrontal 的 tool 描述里写着「Execute a registered workflow in Cortex」
 *        —— **LLM 读得到的那一行**（模型据此理解工具）；
 *      · 三个叶区（occipital / parietal / temporal）**只认旧环境变量**
 *        `CORTEX_URL` ⇒ 新部署按新名配 `TELENCEPHALON_URL` 就会**注册不上**。
 * ⇒ ⇒ 这道闸把**每个仓**都纳管进来。
 *
 * ── 覆盖面的可读性（防「静默漏掉」）─────────────────────────────────
 * ⚠️ 闸最危险的失败模式不是「报红」而是**「漏掉一个仓还报绿」**。
 * ⇒ 所以每次跑都打印：
 *    ① 自动发现了哪些仓；
 *    ② 哪些仓由**自己的**闸管（不重复扫）；
 *    ③ 哪些仓**没登记**在本表里（⇒ 明确列出来 ⇒ 看得见的缺口）。
 *
 * ── 三条「覆盖面」判据（2026-11-04 新加）────────────────────────────
 * ⚠️ 这三条不是样式，是**「绿灯到底意味着什么」的保证**：
 * ① **假绿**：一个仓扫了 **0 个文件**却报「✓ 残留 0 处」⇒ 判据对着空气跑
 *    ⇒ 那不是「干净」，是「没判」⇒ **阻断**。
 *    （真事：lance-graph 的 scanDirs 写的两个目录**都不存在** ⇒ 扫了 0 个文件，
 *      闸一路绿了整整一轮 —— 而它 69 个 Rust 文件 + 60 个 Python 文件从没被看过。）
 * ② **缺仓**：登记在册的仓**没检出** ⇒ 它的残留本闸看不见。
 *    ⇒ CI 上（检出清单是确定的）⇒ **阻断**；本地 ⇒ 明确列出来（看得见的缺口）。
 * ③ **CI 清单对账**：shadow 的 ci.yml 里 cortex-residue-stack 这个 job checkout 了
 *    哪些仓 ⇒ 与注册表算出来的 CI_CHECKOUT **必须一致**
 *    ⇒ YAML 少检一个仓 ⇒ **闸自己报红**（而不是 CI 悄悄少扫一半）。
 *
 * 用法（从 shadow 仓根跑）：
 *   node scripts/check-cortex-residue-all.mjs             # 主流程
 *   node scripts/check-cortex-residue-all.mjs --self-test # 自检
 *
 * 退出码：0 = 全绿 / 1 = 有残留或覆盖缺口 / 2 = 判不了（豁免条目腐烂 / 引擎缺失）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { runGate, runSelfTest, listTextFiles } from './lib/cortex-residue.mjs';
import {
  REGISTRY,
  SELF_OWNED,
  SHADOW_ROOT,
  discoverRepos,
  repoSearchRoots,
  CI_CHECKOUT,
  LOCAL_ONLY,
  COMMON_EXCLUDE_DIRS,
} from './lib/cortex-registry.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** 在 CI 上跑？（GitHub Actions / 通用 CI 环境变量） */
const IS_CI = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';

const line = '='.repeat(72);
console.log(line);
console.log('Cortex 残留闸 —— 跨仓入口');
console.log(line);

// ⚠️ 兄弟仓在两个可能的位置（本地 = shadow 的兄弟目录；CI = shadow 仓根之下）
//    ⇒ 两个都扫 ⇒ 否则另一种布局下会「扫到 0 个仓却报全绿」（假绿）。
const searchRoots = repoSearchRoots(SHADOW_ROOT);
const repos = discoverRepos(searchRoots, SHADOW_ROOT);
const found = new Map(repos.map((r) => [r.name, r.path]));

console.log('');
console.log('▶ 自动发现的仓（所有带 .git 目录的一层子目录）');
for (const r of searchRoots) console.log('  扫描位置：' + r);
for (const r of repos) {
  const own = SELF_OWNED.has(r.name)
    ? '（自有闸）'
    : (REGISTRY[r.name] ? '（本表管）' : '（⚠️ 未登记）');
  console.log('  · ' + r.name.padEnd(24) + own);
}

// ⚠️ **未登记的仓 = 看得见的缺口** —— 明确列出来（这是本闸最重要的一段输出）
const unregistered = repos.filter((r) => !SELF_OWNED.has(r.name) && !REGISTRY[r.name]);
if (unregistered.length > 0) {
  console.log('');
  console.log('✗ 未登记的仓（它们的 cortex 残留**本闸看不见** —— 这是**缺口**，不是干净）：');
  for (const r of unregistered) {
    console.log('  · ' + r.name + '  ⇒ 要么在 lib/cortex-registry.mjs 里登记，要么它本来就干净（那就写进注释里说明）。');
  }
  console.log('');
  console.log('  ⇒ ⚠️ 这一格**阻断**（退出码 1）：「有闸但漏了仓」比「没有闸」更危险');
  console.log('    （前者读起来像「已经清干净了」）。');
}

// ── 判据 ③：CI 清单对账（YAML 与注册表必须一致）──────────────────────
/**
 * 读 shadow 仓 ci.yml 里 `cortex-residue-stack` 这一个 job 的 checkout 清单。
 * ⚠️ 只认这一个 job —— 别的 job 也 checkout 兄弟仓（desktop-e2e 那个 job 就 checkout 了 9 个）
 *    ⇒ 把整份 YAML 的 repository: 都算进来会**误判成对不上**。
 * @returns {string[]|null} 仓名列表；null = 找不到这个 job
 */
function readCiCheckoutList() {
  const ymlPath = join(SHADOW_ROOT, '.github', 'workflows', 'ci.yml');
  if (!existsSync(ymlPath)) return null;
  const src = readFileSync(ymlPath, 'utf8');
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /^ {2}cortex-residue-stack:\s*$/.test(l));
  if (start < 0) return null;
  const names = new Set();
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    // 下一个 job 开始（两个空格缩进 + 非空格）⇒ 本 job 段落结束
    if (/^ {2}\S/.test(l)) break;
    const m = l.match(/repository:\s*iBLOC\/([A-Za-z0-9._-]+)/);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

let ciList = null;
let ciMissing = [];
let ciExtra = [];
{
  ciList = readCiCheckoutList();
  const want = new Set(CI_CHECKOUT);
  const got = new Set(ciList || []);
  ciMissing = CI_CHECKOUT.filter((n) => !got.has(n));
  ciExtra = [...got].filter((n) => !want.has(n));
  console.log('');
  console.log('▶ CI 清单对账（ci.yml 的 cortex-residue-stack job ↔ 注册表）');
  if (ciList === null) {
    console.log('  ⚠️ 在 ci.yml 里找不到 cortex-residue-stack 这个 job ⇒ 对不了账。');
  } else {
    console.log('  ci.yml 检出 ' + ciList.length + ' 个仓 / 注册表要求 ' + CI_CHECKOUT.length + ' 个');
    for (const n of CI_CHECKOUT) {
      console.log('    ' + (got.has(n) ? '✓' : '✗') + ' ' + n);
    }
    if (ciExtra.length > 0) {
      console.log('  ✗ ci.yml 多检了：' + ciExtra.join(', ') + '  ⇒ 注册表里没有它们 ⇒ 多检无害但说明两边漂了。');
    }
    if (ciMissing.length > 0) {
      console.log('  ✗ ci.yml **少检了**：' + ciMissing.join(', '));
      console.log('    ⇒ 这些仓的残留在 CI 上**没人判** ⇒ 阻断。');
      console.log('    ⇒ 修法：在 ci.yml 的 cortex-residue-stack job 里补 checkout 步骤。');
    }
  }
}

// ── 判据 ④：引擎副本一致性（两份必须字节相同）──────────────────────
// ⚠️ `scripts/lib/cortex-residue.mjs` 在 shadow 与端脑仓**各有一份**
//    ⇒ ⇒ 「判据只有一份」的前提是「两份不会漂」⇒ ⇒ 这一格就是那个门。
//    ⚠️ 之前**没有任何闸判这件事**（引擎注释里写的「副本一致性门」并不存在）
//    ⇒ ⇒ 两份漂了没人知道 ⇒ ⇒ 两个仓各判各的。
let cannotJudge = 0;
const parityGaps = [];
let parityChecked = 0;
{
  const ENGINE_REL = join('scripts', 'lib', 'cortex-residue.mjs');
  const mine = join(SHADOW_ROOT, ENGINE_REL);
  let mineBuf = null;
  try { mineBuf = readFileSync(mine); } catch { /* 本仓那份读不到 */ }
  console.log('');
  console.log('▶ 判据 ④：引擎副本一致性（shadow ↔ 各兄弟仓的 scripts/lib/cortex-residue.mjs）');
  if (!mineBuf) {
    console.error('  ✗ 本仓的引擎副本读不到 ⇒ ⇒ 判不了');
    cannotJudge++;
  } else {
    for (const name of SELF_OWNED) {
      if (name === 'shadow') continue;
      const p = found.get(name);
      if (!p) {
        console.log('  · ' + name.padEnd(24) + '未检出 ⇒ ⇒ 本轮没判到（这一格在 CI 上是空的）');
        continue;
      }
      let other = null;
      try { other = readFileSync(join(p, ENGINE_REL)); } catch { other = null; }
      if (!other) {
        console.log('  · ' + name.padEnd(24) + '仓里没有这份引擎 ⇒ ⇒ 它不跑这道闸（不判）');
        continue;
      }
      parityChecked++;
      if (other.equals(mineBuf)) {
        console.log('  ✓ ' + name.padEnd(24) + '字节相同（' + other.length + ' 字节）');
      } else {
        console.error('  ✗ ' + name.padEnd(24) + '与本仓**字节不同** ⇒ ⇒ 两个仓各判各的（判据会漂）');
        parityGaps.push(name);
      }
    }
    if (parityChecked === 0) {
      console.log('  · 本轮没有可比对的副本（兄弟仓都没检出）⇒ ⇒ 这一格没判到');
    }
  }
}

// ── 判据 ②：登记在册却没检出的仓 ────────────────────────────────────
const missingRegistered = Object.keys(REGISTRY).filter((n) => !found.has(n));
const localOnlyMissing = missingRegistered.filter((n) => LOCAL_ONLY[n]);
const ciRequiredMissing = missingRegistered.filter((n) => !LOCAL_ONLY[n]);

if (missingRegistered.length > 0) {
  console.log('');
  console.log('▶ 登记在册但**没检出**的仓');
  for (const n of localOnlyMissing) {
    console.log('  · ' + n.padEnd(24) + 'CI 检不出（' + LOCAL_ONLY[n] + '）');
  }
  for (const n of ciRequiredMissing) {
    console.log('  · ' + n.padEnd(24) + '✗ **没检出** ⇒ 它的残留本闸看不见');
  }
  if (ciRequiredMissing.length > 0 && IS_CI) {
    console.log('');
    console.log('  ⇒ ⚠️ 在 CI 上：检出清单是**确定的** ⇒ 没检出 = ci.yml 少 checkout 了一个仓');
    console.log('    ⇒ 这一格**阻断**（退出码 1）：CI 悄悄少扫一半，比没有闸更危险。');
  } else if (ciRequiredMissing.length > 0) {
    console.log('');
    console.log('  ⇒ 本地没 clone 这些仓 ⇒ 本闸这一次**没覆盖**它们（这一项本地不阻断；CI 上会阻断）。');
  }
}

if (process.argv.includes('--self-test')) {
  console.log('');
  console.log('▶ 自检（判据有没有分辨力）');
  let failed = 0;
  let tested = 0;
  // ① shadow 仓根（它自己有闸，但这里也要证明引擎可用）
  {
    const r = runSelfTest({
      root: SHADOW_ROOT,
      label: 'shadow（仓根）',
      allowed: [
        { token: '__cortex_selftest_probe__', reason: '自检用的假 token' },
      ],
    });
    console.log(r.out);
    if (r.code !== 0) failed++;
  }
  // ② 每个登记的仓 —— 用它**自己的**豁免清单跑一遍自检
  //    （证明「这个仓的豁免表没把判据废掉」）
  for (const r of repos) {
    const cfg = REGISTRY[r.name];
    if (!cfg) continue;
    const res = runSelfTest({
      root: r.path,
      label: r.name,
      allowed: [
        ...(cfg.allowed || []),
        { token: '__cortex_selftest_probe__', reason: '自检用的假 token' },
      ],
    });
    const ok = res.code === 0;
    console.log((ok ? '✓' : '✗') + ' 自检 —— ' + r.name + (ok ? '' : ' （红）'));
    tested++;
    if (!ok) {
      failed++;
      console.log(res.out);
    }
  }
  console.log('');
  // ⚠️ 读数必须是 **N/N**（可数）⇒ ⇒ 否则闸纪律闸判「读数不可比」。
  if (failed === 0) {
    console.log('✓ 自检：' + tested + '/' + tested + ' 仓全绿');
  } else {
    console.error('✗ 自检：' + (tested - failed) + '/' + tested + ' 项红');
  }
  console.log(line);
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * 判据 ①（加强）：**配置本身要成立** ——
 *   · 每个 scanDir 都必须真的扫到 ≥1 个文件（否则 = 目录名写错了 / 仓改名了）；
 *   · 每个**顶层目录**都必须有交代（扫到了 / 排除了 / 登记成刻意不扫）。
 *
 * ⚠️ 为什么要有这条：2026-11-04 实测 lance-graph 的 scanDirs 写的两个目录
 *    **都不存在** ⇒ 闸「扫了 0 个文件」却一路绿 ⇒ 它的 69 个 Rust 文件 +
 *    60 个 Python 文件**从来没被看过** ⇒ 「有闸但漏了」那一族。
 *    ⇒ 这类错**只有把配置本身当被测对象**才抓得到。
 *
 * @returns {string[]} 配置上的缺口（空数组 = 配置成立）
 */
function checkRepoConfig(repoPath, cfg) {
  const problems = [];
  const excludeDirs = cfg.excludeDirs || [];
  const excludeFiles = cfg.excludeFiles || [];
  // ⚠️ 「扫描目标指不到文件」由**引擎**统一判（退出码 2）⇒ 这里不重复。
  let topDirs = [];
  try {
    topDirs = readdirSync(repoPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '.git')
      .map((e) => e.name);
  } catch {
    /* 读不到就跳过这一项 */
  }
  const accounted = new Set([
    ...(cfg.scanDirs || []),
    ...excludeDirs,
    ...COMMON_EXCLUDE_DIRS,
    ...(cfg.ignoredTopDirs || []).map((x) => x.dir),
  ]);
  for (const d of topDirs) {
    if (accounted.has(d)) continue;
    // 点目录 = 工具/配置目录（.github / .idea / .venv …）⇒ 默认不扫
    if (d.startsWith('.')) continue;
    const n = listTextFiles(join(repoPath, d), { excludeDirs, excludeFiles }).length;
    if (n === 0) continue; // 空目录（git 不追踪空目录）⇒ 不算缺口
    problems.push('顶层目录 ' + d + ' 没有交代（既没被扫，也没登记成刻意不扫）');
  }
  return problems;
}

console.log('');
console.log('▶ 逐仓判');
let failed = 0;
let checked = 0;
const scanned = new Map();
const vacuous = [];
const configGaps = [];
for (const r of repos) {
  if (SELF_OWNED.has(r.name)) {
    // ⚠️ 标成「自有闸」但**闸文件不在** ⇒ 它的覆盖是**假装的** ⇒ 阻断。
    const own = join(r.path, 'scripts', 'check-cortex-residue.mjs');
    if (!existsSync(own)) {
      console.error('✗ ' + r.name + ' —— 标成「自有闸」但仓里没有 scripts/check-cortex-residue.mjs ⇒ 没人判它 ⇒ 阻断。');
      failed++;
    }
    console.log('');
    console.log('· ' + r.name + ' —— 跳过（自有闸：' + relative(SHADOW_ROOT, own) + '）');
    continue;
  }
  const cfg = REGISTRY[r.name];
  if (!cfg) {
    console.log('');
    console.log('· ' + r.name + ' —— 跳过（未登记）');
    continue;
  }
  if (!existsSync(r.path)) {
    console.error('✗ ' + r.name + ' —— 目录不存在');
    failed++;
    continue;
  }
  console.log('');
  console.log('▶ ' + r.name);
  const res = runGate({
    root: r.path,
    label: r.name,
    scanDirs: cfg.scanDirs || [],
    scanFiles: cfg.scanFiles || [],
    excludeDirs: cfg.excludeDirs || [],
    excludeFiles: cfg.excludeFiles || [],
    allowed: cfg.allowed || [],
  });
  // ⚠️ 判据 ①（加强）：**配置本身**也要成立 ⇒ 缺口列出来 ⇒ 阻断。
  for (const p of checkRepoConfig(r.path, cfg)) configGaps.push(r.name + '：' + p);
  console.log(res.out);
  checked++;
  const n = res.scannedFiles ?? 0;
  scanned.set(r.name, n);
  // ⚠️ 判据 ①：**扫了 0 个文件** = 判据对着空气跑 ⇒ 「✓ 残留 0 处」是**假绿** ⇒ 阻断。
  if (res.code === 0 && n === 0) {
    vacuous.push(r.name);
    console.error('');
    console.error('✗ ' + r.name + ' —— **扫了 0 个文件** ⇒ 判据对着空气跑 ⇒ 「✓ 残留 0 处」是**假绿** ⇒ 阻断。');
    console.error('  ⇒ 查 lib/cortex-registry.mjs 里这个仓的 scanDirs ⇒ 目录名写错了 / 仓改名了。');
    failed++;
  }
  // ⚠️ 退出码 2 = **判不了**（豁免条目腐烂 / 扫描目标指不到文件）
  //    ⇒ ⇒ 那是「环境缺」，不是「有问题」⇒ ⇒ 必须与真正的失败分开。
  if (res.code === 2) {
    cannotJudge++;
    console.error('  ⇒ ' + r.name + ' 这一格是「判不了」（退出码 2）⇒ ⇒ 不是「有问题」，但也不能算通过。');
  } else if (res.code !== 0) {
    failed++;
  }
}

console.log('');
console.log('▶ 覆盖面（这一轮到底判了哪些仓）');
for (const r of repos) {
  if (SELF_OWNED.has(r.name)) {
    console.log('  · ' + r.name.padEnd(24) + '自有闸（本闸不重复扫）');
    continue;
  }
  const cfg = REGISTRY[r.name];
  if (!cfg) {
    console.log('  · ' + r.name.padEnd(24) + '⚠️ 未登记（阻断）');
    continue;
  }
  console.log('  · ' + r.name.padEnd(24) + '扫了 ' + (scanned.get(r.name) ?? 0) + ' 个文件');
}
for (const n of Object.keys(LOCAL_ONLY)) {
  console.log('  · ' + n.padEnd(24) + 'CI 检不出（' + LOCAL_ONLY[n] + '）'
    + (found.has(n) ? '　—— 本地已扫' : '　—— 本地也没有'));
}

if (configGaps.length > 0) {
  console.log('');
  console.log('✗ 配置缺口（判据对着空气跑 ⇒ 绿灯是**假的**）:');
  for (const g of configGaps) console.log('  · ' + g);
  console.log('  ⇒ 修法：把目录名改对；或者确实不该扫 ⇒ 登记进 ignoredTopDirs（写清理由）。');
}

console.log('');
console.log(line);
if (failed === 0 && unregistered.length === 0 && ciMissing.length === 0 && ciRequiredMissing.length === 0 && configGaps.length === 0 && parityGaps.length === 0 && cannotJudge === 0) {
  console.log('✓ 全绿（扫了 ' + checked + ' 个仓 / ' + [...scanned.values()].reduce((a, b) => a + b, 0) + ' 个文件）');
  if (unregistered.length === 0) {
    console.log('  （未登记的仓数为 0 ⇒ 没有看得见的缺口。）');
  }
} else {
  if (failed > 0) console.error(failed + ' 个仓 / 判据有阻断问题。');
  if (unregistered.length > 0) {
    console.error('✗ 另有 ' + unregistered.length + ' 个仓未登记 ⇒ 它们的残留本闸看不见（见上面清单）⇒ 阻断。');
  }
  if (ciMissing.length > 0) {
    console.error('✗ ci.yml 的 cortex-residue-stack job 少 checkout 了 ' + ciMissing.length + ' 个仓 ⇒ CI 上没人判它们 ⇒ 阻断。');
  }
  if (ciRequiredMissing.length > 0 && IS_CI) {
    console.error('✗ 另有 ' + ciRequiredMissing.length + ' 个登记在册的仓在 CI 上没检出 ⇒ 覆盖缺口 ⇒ 阻断。');
  }
  if (configGaps.length > 0) {
    console.error('✗ 另有 ' + configGaps.length + ' 处配置缺口 ⇒ 判据没覆盖到 ⇒ 阻断。');
  }
  if (parityGaps.length > 0) {
    console.error('✗ 另有 ' + parityGaps.length + ' 个仓的引擎副本与本仓字节不同 ⇒ 判据会漂 ⇒ 阻断。');
  }
  if (cannotJudge > 0) {
    console.error('✗ 另有 ' + cannotJudge + ' 个仓是「判不了」（退出码 2）⇒ ⇒ 不是「有问题」。');
  }
}
console.log(line);
// ⚠️ 退出码三态：0 通过 / 1 有问题 / **2 判不了**
//    ⇒ ⇒ 「判不了」在批量跑闸的清单里**长得跟「通过」一模一样** ⇒ ⇒ 必须分得开。
const blocked =
  failed > 0 || unregistered.length > 0 || ciMissing.length > 0 ||
  (IS_CI && ciRequiredMissing.length > 0) || configGaps.length > 0 ||
  parityGaps.length > 0;
if (blocked) process.exit(1);
if (cannotJudge > 0) process.exit(2);
process.exit(0);
