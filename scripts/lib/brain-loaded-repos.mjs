#!/usr/bin/env node
/**
 * **端脑实际装载的兄弟仓** —— 「叶区身份」的真相来源。
 *
 * ⚠️⚠️ **为什么不能手写叶区名单**（2026-11-11 实测打脸）：
 *   闸里原来有一份手写的 `LEAF_REPOS`（六仓：prefrontal／diencephalon／
 *   temporal／occipital／parietal／amygdala）⇒ ⇒ 逐条核端脑的 Cargo.toml
 *   ⇒ ⇒ **真被端脑装载的叶区只有两个**（prefrontal＝`prefrontal-core`、
 *   diencephalon）⇒ ⇒ 而名单里的 temporal／occipital／parietal／amygdala
 *   **端脑根本没有依赖行**（它们是仓，但没被大脑装上）⇒ ⇒ ⇒ 名单既**漏**
 *   （将来新增的叶区不在名单里 ⇒ ⇒ 解析层不覆盖）又**多**（判了四个
 *   根本没被装载的仓 ⇒ ⇒ 白花解析时间，还让人以为「盖住了」）。
 *
 * ⚠️ **真相来源 = 端脑 Cargo.toml 的 path 依赖** ⇒ ⇒ 「谁被大脑装上」是
 * **结构事实**，不是人的记忆 ⇒ ⇒ 新增一个叶区仓 ⇒ ⇒ 只要端脑在 Cargo.toml
 * 里加了 path 依赖 ⇒ ⇒ 它**自动进面** ⇒ ⇒ 不用改名单。
 *
 * ⚠️ **「叶区」与「消费者」是两个不同的概念**（闸里 N10/N11/N12 与 N13 分列）：
 *   · **叶区** ＝ 大脑装上的、只干活不推理的那一格 ⇒ ⇒ 连 neuron / burn
 *     这类推理运行时**连依赖边都不许有**（N10/N11/N12）。
 *   · **消费者** ＝ 与大脑同进程跑、要记忆要检索的那些（海马体）⇒ ⇒ 它
 *     不许**自己起** neuron（N13）⇒ ⇒ 而它同样**不许拖**推理运行时
 *     ⇒ ⇒ ⇒ 判据应当是「**被大脑装上的兄弟仓**」⇒ ⇒ 消费者与叶区**共用**
 *     ⇒ ⇒ ⇒ 这条判据面 ⇒ ⇒ ⇒ 而不是「叶区」这个手写名字。
 */

/**
 * 从一份 Cargo.toml 里读出 **path 依赖**指向的兄弟仓名。
 *
 * ⚠️ **只认 path 依赖** ⇒ ⇒ `version = "…"` 的 crates.io 依赖不算 ⇒ ⇒
 * ⇒ 「被大脑装上」= 走本地 checkout 的那条边 ⇒ ⇒ CI 上兄弟仓被 checkout
 * ⇒ ⇒ 才有意义 ⇒ ⇒ crates.io 上的同名 crate **不是**兄弟仓。
 *
 * ⚠️ **认 `package = "…"` 重命名** ⇒ ⇒ 端脑写的是
 *   `prefrontal = { package = "prefrontal-core", path = "../prefrontal" }`
 * ⇒ ⇒ **仓名**由 path 决定（`../prefrontal` ⇒ `prefrontal`）⇒ ⇒ 而
 *   `package` 是**crate 名**（`prefrontal-core`）⇒ ⇒ ⇒ 两者不是一回事
 * ⇒ ⇒ ⇒ 本函数返回**仓名**（path 的第一段）。
 *
 * ⚠️ **path 形状**：
 *   · `"../prefrontal"` ⇒ ⇒ 兄弟仓在**上一层** ⇒ ⇒ 仓名 prefrontal
 *   · `"../hippocampus/hippocampus-core"` ⇒ ⇒ **仓名是 hippocampus**
 *     （成员名不是仓名）⇒ ⇒ 否则 workspace 成员会被当成独立仓。
 *
 * @param {string} manifestText Cargo.toml 全文
 * @returns {Set<string>} 兄弟仓名集合（path 依赖直接指向的那些）
 */
export function loadedSiblingRepos(manifestText) {
  const out = new Set();
  const text = String(manifestText || '');
  // ⚠️ **逐行扫**（不整篇正则）⇒ ⇒ 一行一个依赖 ⇒ ⇒ 形状变化不会把整段丢掉。
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // ⚠️ **跳过注释行** ⇒ ⇒ 注释里提到的 path 不算一条边。
    if (line.startsWith('#')) continue;
    // ⚠️ **只认依赖行**（`name = { … }`）⇒ ⇒ 不认 feature 定义（`name = []`）。
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}\s*$/);
    if (!m) continue;
    const pm = m[2].match(/\bpath\s*=\s*"([^"]+)"/);
    if (!pm) continue;
    const p = pm[1].replace(/\\/g, '/');
    // ⚠️ **只认指向「上一层」的相对路径** ⇒ ⇒ `../<repo>` 形状 ⇒ ⇒
    // ⇒ 那是兄弟仓 ⇒ ⇒ 仓名 = 第一段。
    const seg = p.split('/').filter(Boolean);
    if (seg.length < 2 || seg[0] !== '..') continue;
    const repo = seg[1];
    if (!repo || repo === '.' || repo === '..') continue;
    out.add(repo);
  }
  return out;
}

/**
 * 「叶区」＝ **被大脑装上的兄弟仓**（去掉大脑自己与实现方）。
 *
 * ⚠️ **排除项必须写清楚**（否则会把「装在大脑里的那份 neuron」当成叶区
 * ⇒ ⇒ 然后判它不许有 neuron 依赖边 ⇒ ⇒ **假红**）：
 *   · `neuron` —— 实现方（大脑内嵌的那一个 neuron 就是它）
 *   · `telencephalon` / `encephalon` —— 大脑自己
 *
 * @param {string} brainManifestText 大脑（端脑）的 Cargo.toml 全文
 * @param {string[]} exclude 排除的仓名
 * @returns {string[]} 被装上的兄弟仓名（排除后，升序）
 */
export function lobeReposLoadedBy(brainManifestText, exclude = ['neuron', 'telencephalon', 'encephalon']) {
  const skip = new Set(exclude);
  const all = loadedSiblingRepos(brainManifestText);
  return [...all].filter((r) => !skip.has(r)).sort();
}

// ── 自检 ────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('brain-loaded-repos.mjs')) {
  let pass = 0;
  let fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log('  [PASS] ' + name); }
    else { fail++; console.log('  [FAIL] ' + name + ' ' + detail); }
  };

  // ❶ 真实端脑 manifest 的形状（截取，不依赖兄弟仓在位）。
  const REAL = [
    '[workspace.dependencies]',
    'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }',
    '[dependencies]',
    'synapse = { path = "../synapse", features = ["ziti"] }',
    'prefrontal = { package = "prefrontal-core", path = "../prefrontal", default-features = false }',
    'neuron = { path = "../neuron", default-features = false }',
    'hippocampus-core = { path = "../hippocampus/hippocampus-core" }',
    'hippocampus-server = { path = "../hippocampus/hippocampus-server", optional = true }',
    'diencephalon = { path = "../diencephalon", default-features = false }',
    'uuid = { version = "1", features = ["v4", "serde"] }',
    '[dev-dependencies]',
    'tokio-util = { version = "0.3", features = ["rt"] }',
    '[patch.crates-io]',
    'reqwest = { git = "https://github.com/seanmonstar/reqwest", tag = "v0.13.4" }',
  ].join('\n');
  const loaded = loadedSiblingRepos(REAL);
  check('path 依赖 ⇒ ⇒ 认出来（synapse/prefrontal/neuron/hippocampus/diencephalon）',
    ['synapse', 'prefrontal', 'neuron', 'hippocampus', 'diencephalon'].every((r) => loaded.has(r)),
    [...loaded].join(','));
  check('crates.io 依赖（tokio/uuid）⇒ ⇒ 不算兄弟仓',
    !loaded.has('tokio') && !loaded.has('uuid'), [...loaded].join(','));
  check('git 依赖（reqwest）⇒ ⇒ 不算兄弟仓', !loaded.has('reqwest'), [...loaded].join(','));
  check('workspace 成员路径（../hippocampus/hippocampus-core）⇒ ⇒ 仓名取**第一段** hippocampus',
    loaded.has('hippocampus') && !loaded.has('hippocampus-core'),
    [...loaded].join(','));

  // ❷ 排除项。
  const lobes = lobeReposLoadedBy(REAL);
  check('排除项（neuron/telencephalon/encephalon）⇒ ⇒ 不在叶区面里',
    !lobes.includes('neuron') && !lobes.includes('telencephalon') && !lobes.includes('encephalon'),
    lobes.join(','));
  check('叶区面 = 端脑真装上的那些（synapse/prefrontal/hippocampus/diencephalon）',
    ['synapse', 'prefrontal', 'hippocampus', 'diencephalon'].every((r) => lobes.includes(r)),
    lobes.join(','));

  // ❸ **注释里的 path 不算一条边** ⇒ ⇒ 注释里提到 ../foo 不该把 foo 拉进来。
  const withComment = ['# 以前是 geniculate = { path = "../geniculate" }', 'x = { version = "1" }'].join('\n');
  check('注释里的 path 依赖 ⇒ ⇒ 不算边', !loadedSiblingRepos(withComment).has('geniculate'),
    [...loadedSiblingRepos(withComment)].join(','));

  // ❹ **feature 定义行不算依赖行**（`name = []`）⇒ ⇒ 那是 feature 不是边。
  const featOnly = ['neuron = []', 'candle = ["neuron/candle"]'].join('\n');
  check('feature 定义行（name = []）⇒ ⇒ 不算 path 边',
    loadedSiblingRepos(featOnly).size === 0, [...loadedSiblingRepos(featOnly)].join(','));

  // ❺ 空输入 ⇒ ⇒ 不崩、不瞎猜。
  check('空 manifest ⇒ ⇒ 空集合', loadedSiblingRepos('').size === 0);
  check('null manifest ⇒ ⇒ 空集合', loadedSiblingRepos(null).size === 0);

  // ❻ **孪生**：紧凑写法 ⇒ ⇒ 仍认得出来。
  const tight = 'prefrontal = {package="prefrontal-core",path="../prefrontal"}';
  check('紧凑写法（无空格）⇒ ⇒ 仍认得出来', loadedSiblingRepos(tight).has('prefrontal'),
    [...loadedSiblingRepos(tight)].join(','));

  // ❼ **反向孪生**：指向**仓内**的相对路径（不是 ../）⇒ ⇒ 不是兄弟仓。
  const inside = 'core = { path = "crates/core" }';
  check('仓内相对路径（crates/core）⇒ ⇒ 不算兄弟仓',
    !loadedSiblingRepos(inside).has('crates'), [...loadedSiblingRepos(inside)].join(','));

  console.log('  自检：' + pass + '/' + (pass + fail) + (fail ? ' ⇒ ⇒ 有红' : ' 全绿'));
  process.exit(fail === 0 ? 0 : 1);
}
