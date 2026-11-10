#!/usr/bin/env node
/**
 * neuron 归属闸 —— 「全局唯一 neuron，由大脑直接管理」
 *
 * # 这条不变量是什么
 *
 * 由**大脑**直接管理 neuron，是为了保证**全局唯一**的那一个 neuron 实例 ——
 * 一旦有第二个 neuron 的 运行时，同一批模型就会被**重复占用**（同一份权重在
 * 两个进程 / 两套状态里各加载一份）⇒ ⇒ ⇒ 显存与内存白占一份，而且两个
 * 实例的「谁在推理」说不清。
 *
 * 实测（本机，2026-11-05）：一个游离的 `neuron_server` 进程与桌面端脑面
 * 内嵌的 neuron **登记同一批 38 个模型** ⇒ ⇒ ⇒ 这就是「重复占用」在运行时
 * 的长相。
 *
 * # 谁可以持有 neuron
 *
 * | 角色 | 仓 | 能做什么 |
 * |---|---|---|
 * | **实现方** | `neuron` | 拥有 candle 等后端；自己怎么实例化都行 |
 * | **大脑** | `telencephalon` / `encephalon` | 持有**那一个**实例，把它交给面 |
 * | **消费者** | 其余全部 | 只能**用**大脑那张面，不许自己实例化 |
 *
 * # 为什么要写成闸（而不是写进文档靠自觉）
 *
 * ① 前额叶真实发生过：它有个 `NeuronLocalProvider`，进程内直接
 *    `CandleLlmRuntime::load` ⇒ ⇒ 于是它成了**第二个推理宿主**。
 * ② 海马体曾经有**两种形态**：独立托管（自己嵌一个 neuron）与脑侧托管
 *    （走大脑那张面）⇒ ⇒ 2026-11-08 用户拍板「所有的本地推理任务都应该
 *    由大脑中的 neuron 提供」⇒ ⇒ **独立托管那形态整个删掉** ⇒ ⇒ 海马体
 *    要本地推理就指大脑那张面 ⇒ ⇒ 本闸用 N1 + N5 + N13 三条钉住它。
 *
 * # 规则
 *
 *   N1 消费者不得实例化 neuron 的 运行时（run_embedded / CandleLlmRuntime /
 *      neuron::create_router）—— 实现方与大脑除外。**没有例外**
 *      （2026-11-08：那处「海马体挂在 local-models 后就放过」的豁免收掉）。
 *   N2 独立 neuron 的 可执行文件（neuron_server）只许出现在 neuron 仓的
 *      examples / tests / benches 与各仓的测试文件里。
 *   N3 桌面端必须把**脑内嵌的那一个** neuron 交给面（不许自己重建）。
 *   N4 消费者对 neuron 的依赖必须 `default-features = false` ——
 *      不许靠默认 feature 偷偷把 candle 拉进来。
 *   N5 **任何仓都不许有 `local-models`** —— 那个 feature 的全部内容就是
 *      「让海马体自己嵌一个 neuron」⇒ ⇒ 它存在本身就是第二个 neuron 的
 *      入口 ⇒ ⇒ 现在连 hippocampus 仓里也不许有。
 *   N6 叶区必须被指向**脑面自己**（router-only 形态）—— 否则叶区会去打
 *      一个「自己的」neuron。
 *   N7 **feature 图层**：脑侧那条链**解析后**的 feature 图里不许出现
 *      hippocampus-server/local-models（第二套运行时的来源）；消费者的图里不许
 *      出现 neuron/candle。⇒ ⇒ 认**解析后的图**，不认关键词（N5 是关键词层）。
 *   N8 **产物层**：neuron 运行时的字节痕迹只许出现在**一个**产物里，且叶区产物
 *      里不许带。⇒ ⇒ 手机 APK 里若同时装了「带运行时的脑」与「带运行时的叶区」，
 *      那就是一个进程两套运行时。
 *   N9 脑内嵌的 neuron 必须带着推理后端（candle）—— 否则脑是空壳。
 *   N10 **叶区的 manifest 里不许出现 neuron 依赖行** —— 叶区是「叶」
 *      ⇒ ⇒ 推理能力归大脑 ⇒ ⇒ 「不推理」必须是**结构事实**，不是「默认关」。
 *   N11 **叶区解析后的依赖图里不许有 neuron** —— 认**解析后的图**，不认
 *      manifest 的字面 ⇒ ⇒ 防的是**传递边**（N10 看不见的那些）。
 *   N12 叶区不许有**别的**推理运行时依赖（burn / voxcpm-rs）。
 *   N13 **消费者不许有 neuron 依赖边**（连 dev-dependencies 都不许）——
 *      「推理能力归大脑」必须是**结构事实**：桌面端的测试曾经直接依赖
 *      neuron crate、自己起了第二个 neuron ⇒ ⇒ 那条边删掉了，闸钉住它。
 *   N14 **桌面端必须把脑面注入给海马体** —— 海马体是端脑 boot 时建的那
 *      一份 ⇒ ⇒ 它自己不知道脑面在哪 ⇒ ⇒ 只有宿主（桌面端）知道
 *      ⇒ ⇒ 不注入 ⇒ ⇒ 进程内那份海马体的本地推理就落到别处去了
 *      ⇒ ⇒ 「本地推理只由大脑提供」这条在桌面端落不了地。
 *   N15 **端脑不许凭空造脑面地址；递进去的地址必须来自真在监听的那个
 *      listener** —— 「延迟放行」是用户拍板的架构不变量（bind 成功前海马体
 *      不拿脑面地址）⇒ ⇒ 它有两端：宿主那一端不许递「猜的地址」，端脑那一端
 *      不许在宿主没递时自己兜底一个 ⇒ ⇒ 否则海马体会指向一个**可能被别人占的**
 *      端口 ⇒ ⇒ 记忆与推理落进**陌生的大脑**（界面上看不出异常）。
 *      ⚠️ **「猜的地址」有三档形状**（2026-11-09 实测打脸后补齐）：**字面量**
 *      ／**零参调用**（`brain_face_base()` —— 地址是 `format!("http://{DEFAULT_ADDR}/v1")`）
 *      ／**零参函数当值** ⇒ ⇒ 三档都要红 ⇒ ⇒ 只查「含引号」是**查错了对象**
 *      ⇒ ⇒ 旧代码的形状恰好从那个缝里漏了过去。
 *      ⚠️ **「带参调用但参数是常量」（`f(DEFAULT_ADDR)`）这一格闸抓不到**
 *      ⇒ ⇒ **桌面端单测承重那一格**（端口换 61999 ⇒ 地址必须跟着换）⇒ ⇒
 *      闸与单测**各盯一半**，谁都不许声称自己盯全了。
 *   N16 **持有方豁免必须按「crate 身份 ＋ 同源」判，不许按目录名** —— 端脑的副本
 *      （验证副本 / worktree / CI 检出）**目录名是随机的**⇒ ⇒ 手写目录名
 *      名单**永远追不上**⇒ ⇒ 名单一旧，那个副本就被 N13/N4 **误指控**
 *      ⇒ ⇒ 而「误指控」与「漏判」一样坏：闸天天红 ⇒ ⇒ 没人看它。
 *      ⇒ ⇒ 豁免依据 = **crate 名相同 ＋ 上游同源**（两条证据**共同承重**）⇒ ⇒
 *      ⇒ ⇒ crate 名**只在同一个依赖图里唯一** ⇒ ⇒ 两个**独立仓**可以各有各的同名 ⇒ ⇒ ⇒ 任何仓把 package name 改成 `telencephalon` 就能骗过「只有 crate 名」那一半 ⇒ ⇒ ⇒ 而豁免是**危险方向**（放走一条自起 neuron 的边）⇒ ⇒ ⇒ 所以「上游同源」是**必需的第二条证据**，不是可选加固
 *      ⚠️ **上游必须归一化再比**（`.git` 后缀 / 协议 / `git@host:path` 写法 /
 *      大小写 / 尾部斜杠）⇒ ⇒ CI 的 `actions/checkout` 给的 origin URL **不带
 *      `.git`** ⇒ ⇒ 不归一化 ⇒ ⇒ 本机与 CI 判成两个上游 ⇒ ⇒ ⇒ **假红**。
 *      ⇒ ⇒ **N16 有两条判据**：❶ 持有方名单里不许有「目录名 ≠ crate 名」的条目；❷ **冒充持有方**（自称持有方 crate 名但上游不同 ⇒ ⇒ 红）；❸ 同源证据**三档强度**：**上游逐字相同**（强，当前工作区生效）／**上游仓名同名**（弱，挡不住同名 fork）／**manifest 逐字相同**（弱，只在读不到上游时兜底）⇒ ⇒ ⇒ 读不到上游 ⇒ ⇒ 标 `unverified` 仍豁免但**单列**，不许当「已判无问题」。
 *   N17 **叶区面必须按「大脑实际装载的兄弟仓」发现 —— 不许手写名单** ——
 *      「叶区」＝ 端脑 Cargo.toml 里有 path 依赖的那些兄弟仓 ⇒ ⇒ **结构事实**
 *      ⇒ ⇒ 新增一个叶区仓 ⇒ ⇒ 只要端脑加了 path 依赖 ⇒ ⇒ 它**自动进面**。
 *      ⚠️⚠️ **手写名单既漏又多**（2026-11-11 实测打脸）：旧名单写六仓
 *      （prefrontal／diencephalon／temporal／parietal／occipital／amygdala）
 *      ⇒ ⇒ 端脑**真装上的只有四个**（diencephalon／hippocampus／prefrontal／
 *      synapse）⇒ ⇒ 而 temporal／parietal／occipital／amygdala **端脑根本没
 *      依赖行** ⇒ ⇒ ⇒ 漏的是「将来新增的叶区」（不在名单 ⇒ ⇒ 解析层不覆盖
 *      ⇒ ⇒ ⇒ **假绿**），多的是「压根没被装载的仓」（白花解析时间，还让人
 *      ⇒ ⇒ ⇒ 以为「盖住了」）⇒ ⇒ ⇒ N17 判「手写名单非空 ⇒ ⇒ 红」。
 *      ⚠️ **海马体现在也在这一面里** ⇒ ⇒ 它被端脑装上（hippocampus-core
 *      ＋ hippocampus-server）⇒ ⇒ 而它同样不许拖推理运行时 ⇒ ⇒ ⇒ N13 与
 *      ⇒ ⇒ ⇒ N11 共用这一面**不是矛盾**（声明层 ／ 解析层两层）。
 *      ⚠️ **排除项**：neuron（实现方）／telencephalon／encephalon（大脑自己）
 *      ⇒ ⇒ 否则「装在大脑里的那份 neuron」会被当叶区 ⇒ ⇒ **假红**。
 *   N18 **叶区面判不了 ⇒ ⇒ 闸不许绿** —— 「没查」不是「没问题」：端脑不在
 *      工作区时叶区面是空的 ⇒ ⇒ N10（声明层）／N11（解析层）／N12（别的推理
 *      运行时）**一条都不判** ⇒ ⇒ ⇒ 闸照样绿 ⇒ ⇒ ⇒ 那是一盏「没查却绿」的灯
 *      ⇒ ⇒ ⇒ 所以判不了 ⇒ ⇒ **阻断**（不是绿）⇒ ⇒ ⇒ 降级来源 = **同源的
 *      ⇒ ⇒ ⇒ 端脑副本**（按 crate 身份 ＋ 同源判）⇒ ⇒ ⇒ 而「副本的同源性靠
 *      ⇒ ⇒ ⇒ 端脑本体证明」是个死结 ⇒ ⇒ ⇒ 端脑不在位时用**副本互证**
 *      ⇒ ⇒ ⇒ （多个副本上游一致 ⇒ ⇒ 更强）⇒ ⇒ ⇒ ⚠️ 但基准必须**自带身份**
 *      ⇒ ⇒ ⇒ （上游仓名 == 持有方 crate 名）⇒ ⇒ ⇒ 否则**冒充者自己就成了
 *      ⇒ ⇒ ⇒ 基准**（实测打脸：造一个上游 iBLOC/prefrontal 的冒充端脑
 *      ⇒ ⇒ ⇒ ⇒ 它成了「唯一候选」⇒ ⇒ ⇒ 降级成功 ⇒ ⇒ ⇒ 闸绿 ⇒ ⇒ ⇒ 假绿）
 *      ⇒ ⇒ ⇒ ⇒ 候选互相冲突 ⇒ ⇒ ⇒ 那一格**判不了** ⇒ ⇒ ⇒ 红。
 *
 * 用法：node scripts/check-neuron-ownership.mjs
 *       node scripts/check-neuron-ownership.mjs --no-cargo   （跳过 feature 图）
 *       node scripts/check-neuron-ownership.mjs --self-test
 * 退出码 0 = 通过；1 = 有阻断问题。
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  RUNTIME_MARKERS,
  classifyArtifactRole,
  evaluateArtifacts,
  isStaleLockError,
  judgeFeatureParse,
  listFiles,
  parseFeatureTree,
  scanFileMarkers,
  stripAnsi,
  withRestoredLock,
} from './lib/neuron-invariant-scan.mjs';
import { loadedSiblingRepos, lobeReposLoadedBy } from './lib/brain-loaded-repos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IBLOC = join(ROOT, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  'target',
  'build',
  '.dart_tool',
  '.git',
  'dist',
  'coverage',
  'Pods',
  'out',
]);

/**
 * **CI 的检出清单** —— 归属闸在 CI 上会判哪些仓。
 *
 * ⚠️ **清单只有一份**（`.github/actions/ibloc-siblings/action.yml`）⇒ ⇒ 三个
 * ⚠️ workflow（ci.yml／desktop-e2e.yml／desktop-rust.yml）共用它 ⇒ ⇒ ⇒ 改一处
 * ⚠️ 三处受益 ⇒ ⇒ ⇒ 不会漂。
 *
 * ⚠️⚠️ **为什么这一格必须能被判**（2026-11-11 实测打脸）：清单少一个仓 ⇒ ⇒
 * ⇒ ⇒ 那个仓在 CI 上**压根没被检出** ⇒ ⇒ ⇒ 闸**发现不到它** ⇒ ⇒ ⇒ 它若自己
 * ⇒ ⇒ ⇒ 起了 neuron ⇒ ⇒ ⇒ CI **不红** ⇒ ⇒ ⇒ **假绿** ⇒ ⇒ ⇒ 而「清单少一个」
 * ⇒ ⇒ ⇒ 这件事**没有任何闸会报** ⇒ ⇒ ⇒ 所以要在读数里**对账**。
 *
 * @returns {{ok: boolean, repos: string[], reason: string}}
 */
function listedCheckouts() {
  const p = join(ROOT, '.github', 'actions', 'ibloc-siblings', 'action.yml');
  if (!existsSync(p)) return { ok: false, repos: [], reason: '检出清单文件不在（.github/actions/ibloc-siblings/action.yml）' };
  const text = readFileSync(p, 'utf8');
  const repos = new Set();
  // ⚠️ **认两处**：`repository: iBLOC/<repo>` ⇒ ⇒ **path: <repo>** ⇒ ⇒ 后者是
  // ⚠️ **检出到哪**（工作区根）⇒ ⇒ ⇒ 闸按目录名找仓 ⇒ ⇒ ⇒ 那才是闸能看到的名字。
  for (const m of text.matchAll(/^\s*repository:\s*\S+\/(\S+)\s*$/gm)) repos.add(m[1]);
  for (const m of text.matchAll(/^\s*path:\s*(\S+)\s*$/gm)) repos.add(m[1]);
  const list = [...repos].filter((r) => r && r !== 'shadow').sort();
  if (list.length === 0) return { ok: false, repos: [], reason: '清单里一个仓都没解析出来（形状变了？）' };
  return { ok: true, repos: list, reason: '' };
}

/**
 * **发现**工作区里的仓 —— 而不是手写清单。
 *
 * ⚠️⚠️ **为什么不能再手写**（2026-11-09 实测）：闸的「manifest 全集」原本就是
 * `CONSUMER_REPOS` ＋ `OWNER_SCAN` 那两份**手写名单** ⇒ ⇒ **名单外的仓一律
 * 判不到** ⇒ ⇒ 「新建一个仓、在里面自己起一个 neuron」**完全不会红**
 * ⇒ ⇒ 「本地推理只由大脑中的 neuron 提供」那条结构保证**只覆盖名单里那几个**
 * ⇒ ⇒ 名单一旧，保证就漏（实测：`telencephalon-verify` / `synapse` /
 * `ziti-rust` / `lance-graph` / `hengjian` 全在名单外 ⇒ ⇒ 它们各自起没起
 * neuron，这道闸**答不上来**）。
 *
 * ⇒ ⇒ 现在改成**发现**：工作区里凡是有 `Cargo.toml` / `package.json` 的目录
 * **都是仓** ⇒ ⇒ 新仓自动进面 ⇒ ⇒ 名单只剩**分类**（谁是持有方）
 * ⇒ ⇒ 而分类是**危险的方向**（新仓默认算消费者 ⇒ ⇒ 漏判不可能发生）。
 *
 * ⚠️ **两种布局都要认**（同 `repoRoot`）：本机多仓工作区里兄弟仓在工作区
 * **之外**（iBLOC/<repo>）；CI 里 `actions/checkout` 把兄弟仓 checkout 到工作区
 * **之内**（<workspace>/<repo>）⇒ ⇒ 两边都扫。
 */
export function reposFromListing(entries, selfName) {
  const names = new Set();
  for (const e of entries) {
    if (!e.hasManifest) continue;
    if (e.name.startsWith('.')) continue; // .git / .shadow-pkg-wt / …
    if (e.name === selfName) continue; // 本仓自己（shadow）不算兄弟
    names.add(e.name);
  }
  return [...names].sort();
}

function discoverRepoNames() {
  const entries = [];
  for (const base of [IBLOC, ROOT]) {
    if (!existsSync(base)) continue;
    // ⚠️ **ROOT 的子目录在**本机布局**里是**本仓自己的子项目**
    // （`shadow/benchmark`、`shadow/shadow-desktop`）⇒ ⇒ 把它们当兄弟仓就是
    // ⇒ ⇒ **误判**（判了不属于这一层的代码）。⇒ ⇒ 只有**自带 `.git`** 的才算
    // ⇒ ⇒ 兄弟仓（CI 布局里 `actions/checkout` 出来的兄弟仓个个都有 `.git` ✔）。
    const needOwnGit = base === ROOT;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const dir = join(base, name);
      if (needOwnGit && !existsSync(join(dir, '.git'))) continue;
      entries.push({
        name,
        hasManifest: existsSync(join(dir, 'Cargo.toml')) || existsSync(join(dir, 'package.json')),
      });
    }
  }
  return reposFromListing(entries, basename(ROOT));
}

/**
 * **可以持有 / 实例化 neuron 的仓** —— 实现方 ＋ 大脑。
 *
 * ⚠️ 这份名单**故意很小**且每条都有理由 ⇒ ⇒ 因为它只决定「谁被豁免」
 * ⇒ ⇒ 豁免是**危险**的方向（新仓默认进消费者面 ⇒ ⇒ 漏判不可能发生）。
 *
 * ⚠️⚠️⚠️ **2026-11-09 实测打脸：按「目录名」豁免就是漏的** —— 本机的
 * `wt-tel-verify` 是**端脑仓的 git worktree**（`git rev-parse
 * --git-common-dir` 与端脑**同一个** ⇒ ⇒ 共享同一份 git 历史；它的
 * Cargo.toml 与端脑的 **SHA256 逐字相同**；package 名也是 `telencephalon`）
 * ⇒ ⇒ 它的 neuron 依赖边**就是大脑自己那条** ⇒ ⇒ 合法
 * ⇒ ⇒ 而它**不在**这份目录名名单里 ⇒ ⇒ N13 判它红 ⇒ ⇒ **误指控**
 * ⇒ ⇒ ⇒ ⇒ 而且 worktree 的**名字是随机的**（`wt-` 前缀 ＋ 谁建的）
 * ⇒ ⇒ ⇒ ⇒ 手写名单**永远追不上** ⇒ ⇒ ⇒ ⇒ 名单里那条
 * `telencephalon-verify` 本身就是**同一族补丁**（另一个端脑副本）⇒ ⇒
 * ⇒ ⇒ ⇒ ⇒ **豁免必须由「crate 身份」承重，不能由「目录名」承重**。
 */
const OWNERS = new Set(['neuron', 'telencephalon', 'encephalon']);

/**
 * **持有方的 crate 名** —— 「这个仓是不是大脑/实现方那份」的第二条依据。
 *
 * ⚠️ **为什么这是**身份**而不是又一份目录名名单**：crate 名相同 ⇒ ⇒（**只是一半证据**，同源那一半见 `ownerEvidenceOf`）⇒ ⇒
 * **它就是同一个 crate**（同一个依赖图内 crate 名全局唯一 ⇒ ⇒ 两个仓同名
 * ⇒ ⇒ 同一个依赖图内不可能各自独立；**跨仓则要靠上游同源才成立**）⇒ ⇒ 它的 neuron 依赖边**同源** ⇒ ⇒ 合法。
 * ⇒ ⇒ 于是**任何**端脑副本／验证副本／worktree／CI 检出都自动对
 * ⇒ ⇒ 不靠谁记得把它加进名单。
 *
 * ⚠️ **为什么这条豁免需要**第二条证据**（豁免是危险方向）**：一个仓想把 crate 名
 * 改成 `telencephalon` 来骗过闸 ⇒ ⇒ **crate 名跨仓可以重名** ⇒ ⇒ cargo
 * 层面它**不是**端脑 ⇒ ⇒ 它的 neuron 边**未必**是大脑自己那条 ⇒ ⇒
 * ⇒ ⇒ 豁免**可能放走东西** ⇒ ⇒ ⇒ 所以「上游同源」（同一份代码的另一个 checkout / worktree）⇒ ⇒ ⇒ 才是真证据 ⇒ ⇒ ⇒ （实测：端脑三份副本上游**逐字相同**；冒充者上游是自己的仓 ⇒ ⇒ ⇒ 分得开）。
 */
const OWNER_PACKAGES = new Set(['neuron', 'telencephalon', 'encephalon']);

/**
 * 一个 manifest 的 **crate 名**（`[package] name = "…"`）。
 *
 * ⚠️ **只认 `[package]` 段里那一行** ⇒ ⇒ 别的段里的 `name` 不算
 * ⇒ ⇒ workspace 成员的名字不会被误当成仓的名字。
 */
export function packageNameOf(manifest) {
  const sec = /\[package\][\s\S]*?(?=\n\[|$)/.exec(String(manifest || ''));
  if (!sec) return null;
  const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(sec[0]);
  return m ? m[1] : null;
}

/**
 * 这个仓**是不是持有方** —— 按 **crate 身份**判，不按目录名判。
 *
 * ⚠️ **两条依据**：
 * ❶ 目录名在 OWNERS 里（`neuron` / `telencephalon` / `encephalon`
 *    —— 这三个仓的**目录名恰好等于 crate 名**，两条依据重合）；
 * ❷ **crate 名**在 OWNER_PACKAGES 里 ⇒ ⇒ 它是端脑/实现方的**另一个
 *    副本**（验证副本 / worktree / CI 检出）⇒ ⇒ 它的 neuron 依赖边
 *    **同源** ⇒ ⇒ 合法。
 *
 * ⚠️ **为什么 ❷ 必须靠 manifest 而不是靠目录名**（2026-11-09 实测）：
 * 副本的**目录名是随机的**（`wt-tel-verify` / `telencephalon-verify` …）
 * ⇒ ⇒ 手写名单永远追不上 ⇒ ⇒ 名单一旧，保证就漏。
 *
 * ⚠️ **纯函数** ⇒ ⇒ 自检能直接拿它当夹具（不用真文件系统）。
 */
/**
 * **上游归一化** —— 「这个仓是不是那份代码的副本」的**第二个证据**。
 *
 * ⚠️ **为什么需要第二个证据**（2026-11-09 实测打脸）：crate 名只在**同一个
 * 依赖图**里唯一 ⇒ ⇒ **两个独立仓可以各有各的 `name = "telencephalon"`**
 * ⇒ ⇒ ⇒ 「crate 名相同 ⇒ ⇒ 不可能各自独立」这句话**只在同一个依赖图里成立**
 * ⇒ ⇒ ⇒ 任何仓把 package name 改成 `telencephalon` ⇒ ⇒ 就能骗过豁免
 * ⇒ ⇒ ⇒ ⇒ 而豁免是**危险方向**（放走一条自起 neuron 的边）⇒ ⇒ ⇒ 真证据是
 * ⇒ ⇒ ⇒ ⇒ **上游相同**（同一份代码的另一个 checkout / worktree / CI 检出）
 * ⇒ ⇒ ⇒ ⇒ 实测：端脑的三个副本（本体 / 验证副本 / worktree）上游**逐字相同**
 * ⇒ ⇒ ⇒ ⇒ （`github.com/iBLOC/telencephalon`）⇒ ⇒ 而冒充者的上游是**它自己的**
 * ⇒ ⇒ ⇒ ⇒ 仓库 ⇒ ⇒ 分得开。
 *
 * ⚠️ 归一化掉：`.git` 后缀、协议（ssh / https）、大小写、`git@host:path` 写法
 * ⇒ ⇒ CI 的 `actions/checkout` 与本机的 `git clone` 写法不同 ⇒ ⇒ 不归一化
 * ⇒ ⇒ ⇒ 就会把「同一个上游」判成「两个上游」⇒ ⇒ **假红**。
 */
export function normalizeUpstream(url) {
  let s = String(url || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
  s = s.replace(/^git@([^:]+):/, '$1/');
  s = s.replace(/^ssh:\/\//, '');
  s = s.replace(/^https?:\/\//, '');
  return s;
}
/**
 * **持有方判定的证据** —— 「这个仓是不是持有方那份代码」。
 *
 * ⚠️⚠️ **crate 名相同只是「一半」证据**（2026-11-09 实测打脸，账本 U+3459 条）：
 * crate 名**只在同一个依赖图里唯一** ⇒ ⇒ **两个独立仓可以各有各的
 * `name = "telencephalon"`** ⇒ ⇒ ⇒ 「同名 ⇒ ⇒ 不可能各自独立」这句论证
 * ⇒ ⇒ ⇒ **只在同一个依赖图里成立** ⇒ ⇒ ⇒ 任何仓把 package name 改成
 * ⇒ ⇒ ⇒ `telencephalon` 就能骗过「只有 crate 名」那一半 ⇒ ⇒ ⇒ 而豁免是
 * ⇒ ⇒ ⇒ **危险方向**（放走一条「自己起 neuron」的边）⇒ ⇒ ⇒ 所以豁免必须
 * ⇒ ⇒ ⇒ 由**两条证据共同承重**：crate 名 ＋ **同源**。
 *
 * ⚠️ **同源有三条档位，强度不同**（边界写清楚，不许声称盯全了）：
 * ❶ **上游逐字相同**（强）⇒ ⇒ 同一份代码的另一个 checkout / worktree ⇒ ⇒
 *    实测端脑的三个副本上游**逐字相同** ⇒ ⇒ 冒充者（同名但上游是自己的）
 *    ⇒ ⇒ 在这一档被挡住 ⇒ ⇒ ⇒ **这一档在当前工作区上生效**。
 * ❷ **上游仓名 == crate 名**（弱，只在 canonical 上游读不到时兜底）⇒ ⇒
 *    ⇒ ⇒ **挡不住同名 fork** ⇒ ⇒ ⇒ **那一格要靠人读**。
 * ❸ **manifest 逐字相同**（弱，只在读不到上游时兜底）⇒ ⇒ 例如 tarball
 *    解出来的副本（没有 .git ⇒ 读不到上游）⇒ ⇒ ⇒ 同样挡不住改过名的副本。
 *
 * ⚠️ **判不了（读不到上游）⇒ ⇒ 仍豁免，但证据标成 `unverified`** ⇒ ⇒
 * ⇒ ⇒ 那一格要单独报（主流程读数里单列）⇒ ⇒ **不许当成「已判无问题」**。
 */
export function ownerEvidenceOf(
  name,
  manifest,
  owners = OWNERS,
  ownerPackages = OWNER_PACKAGES,
  upstreams = new Map(),
  ownerCrateInfo = new Map()
) {
  if (owners.has(name)) return { owner: true, evidence: 'directory-name' };
  const pkg = packageNameOf(manifest);
  if (pkg === null || !ownerPackages.has(pkg)) return { owner: false, evidence: null };
  const mine = upstreams.get(name) || null;
  const info = ownerCrateInfo.get(pkg) || null;
  const canonical = info ? info.upstream || null : null;
  if (mine && canonical) {
    return mine === canonical
      ? { owner: true, evidence: 'same-upstream' }
      : { owner: false, evidence: 'upstream-mismatch', detail: { mine, canonical } };
  }
  if (mine && !canonical) {
    return upstreamRepoName(mine) === pkg
      ? { owner: true, evidence: 'upstream-repo-name' }
      : { owner: false, evidence: 'upstream-repo-name-mismatch', detail: { mine } };
  }
  // ⚠️ 读不到上游 ⇒ ⇒ 仍豁免（不许误指控端脑的副本）⇒ ⇒ 但证据是「未验证」。
  if (info && info.manifest && manifest === info.manifest) {
    return { owner: true, evidence: 'same-manifest' };
  }
  return { owner: true, evidence: 'unverified' };
}

/**
 * 这个仓**是不是持有方** —— 按 **crate 身份 ＋ 同源**判，不按目录名判。
 *
 * ⚠️ **纯函数** ⇒ ⇒ 自检能直接拿它当夹具（不用真文件系统）。
 */
/**
 * 规则层用的持有方判定 —— 从 **ctx** 取证据（上游 ＋ canonical 身份）。
 *
 * ⚠️ **ctx 里没有上游数据 ⇒ ⇒ 判不了 ⇒ ⇒ 不指控**（保守：误指控与漏判一样坏）
 * ⇒ ⇒ ⇒ 但那一格要单独报（主流程读数里单列「未验证的豁免」）。
 */
export function ownerInCtx(ctx, repo, manifest) {
  return isOwnerRepo(
    repo,
    manifest,
    ctx.owners || OWNERS,
    ctx.ownerPackages || OWNER_PACKAGES,
    ctx.upstreams || new Map(),
    ctx.ownerCrateInfo || new Map()
  );
}
export function isOwnerRepo(
  name,
  manifest,
  owners = OWNERS,
  ownerPackages = OWNER_PACKAGES,
  upstreams = new Map(),
  ownerCrateInfo = new Map()
) {
  return ownerEvidenceOf(name, manifest, owners, ownerPackages, upstreams, ownerCrateInfo).owner;
}
export function classifyRepos(
  names,
  owners = OWNERS,
  manifests = new Map(),
  ownerPackages = OWNER_PACKAGES,
  upstreams = new Map(),
  ownerCrateInfo = new Map()
) {
  const ownerList = [];
  const consumerList = [];
  for (const n of names) {
    const isOwner = isOwnerRepo(n, manifests.get(n), owners, ownerPackages, upstreams, ownerCrateInfo);
    (isOwner ? ownerList : consumerList).push(n);
  }
  return { owners: ownerList, consumers: consumerList };
}

/** 少数仓的源码不在仓根的 `src` 下（显式钉住）。 */
const REPO_SOURCE_DIRS = {
  hippocampus: ['hippocampus-core/src', 'hippocampus-server/src'],
};

/**
 * 一个仓的**源码目录** —— 也是**发现**的（不手写）。
 *
 * 约定：仓根有 `src` 就用它；没有就看 `crates/<成员>/src` 与 `packages/<成员>/lib`
 * ⇒ ⇒ 多 crate 的仓（`lance-graph` / `hengjian` / `ziti-rust`）也进面
 * ⇒ ⇒ 否则它们在自己体内起一个 neuron 也没人判。
 */
function sourceDirsOf(repo) {
  if (REPO_SOURCE_DIRS[repo]) return REPO_SOURCE_DIRS[repo];
  const root = repoRoot(repo);
  if (!root) return [];
  const dirs = [];
  if (existsSync(join(root, 'src'))) dirs.push('src');
  for (const sub of ['crates', 'packages']) {
    const sd = join(root, sub);
    if (!existsSync(sd)) continue;
    for (const m of readdirSync(sd, { withFileTypes: true })) {
      if (!m.isDirectory()) continue;
      for (const inner of ['src', 'lib']) {
        if (existsSync(join(sd, m.name, inner))) dirs.push(`${sub}/${m.name}/${inner}`);
      }
    }
  }
  return dirs;
}

/** 发现到的仓（工作区里凡是有 manifest 的目录）。 */
const DISCOVERED = discoverRepoNames();

/**
 * 各仓的**根 manifest** —— 持有方判定按 crate 身份时要用它。
 *
 * ⚠️ **只收根 manifest**（不收 workspace 成员）⇒ ⇒ 「这个仓的 crate 名」
 * 才有唯一答案 ⇒ ⇒ 成员的 crate 名是**别的东西**（例如 `workflow-schema`）
 * ⇒ ⇒ 用成员判身份会把端脑判成别的。
 */
const ROOT_MANIFESTS = (() => {
  const m = new Map();
  for (const repo of DISCOVERED) {
    const root = repoRoot(repo);
    if (!root) continue;
    const p = join(root, 'Cargo.toml');
    if (existsSync(p)) m.set(repo, readFileSync(p, 'utf8'));
  }
  return m;
})();

/**
 * **消费者** —— 与大脑同进程跑的那些仓。
 *
 * ⚠️ 现在是**发现**出来的（不是手写名单）⇒ ⇒ 2026-11-08：hippocampus 进了
 * 这个面（「独立托管（自己嵌一个 neuron）」那种形态整个删掉了 —— 用户拍板：
 * 「所有的本地推理任务都应该由大脑中的 neuron 提供」）⇒ ⇒ 海马体要本地
 * 推理就**指大脑那张面**（`HIPPOCAMPUS_BRAIN_BASE`）⇒ ⇒ 它也是消费者。
 */
/**
 * **上游读数**（懒加载）—— 各仓的 git `remote.origin.url`（归一化后）。
 *
 * ⚠️ **懒加载是刻意的** ⇒ ⇒ 自检不该碰真文件系统（自检必须**快**且**不依赖
 * 兄弟仓在位**）⇒ ⇒ 自检自己造夹具 ⇒ ⇒ 主流程才读真上游。
 */
let UPSTREAMS_CACHE = null;
function getUpstreams() {
  if (!UPSTREAMS_CACHE) UPSTREAMS_CACHE = collectUpstreams();
  return UPSTREAMS_CACHE;
}

/**
 * 持有方的 **canonical 身份** —— 按 **crate 名**索引（谁才是「那份代码」）。
 *
 * ⚠️ **canonical = 目录名在 OWNERS 里的那个仓** ⇒ ⇒ 它的上游就是「同源」的
 * ⇒ ⇒ 基准 ⇒ ⇒ 副本要豁免 ⇒ ⇒ 上游必须与它**逐字相同**。
 */
function getOwnerCrateInfo(upstreams) {
  const m = new Map();
  for (const owner of OWNERS) {
    const root = repoRoot(owner);
    if (!root) continue;
    const p = join(root, 'Cargo.toml');
    if (!existsSync(p)) continue;
    const manifest = readFileSync(p, 'utf8');
    const pkg = packageNameOf(manifest);
    if (!pkg) continue;
    m.set(pkg, { upstream: upstreams.get(owner) || null, manifest });
  }
  // ⚠️⚠️ **canonical 缺席时的互证基准**（2026-11-11 实测打脸后补）：
  //   canonical = 目录名在 OWNERS 里的那个仓（telencephalon）⇒ ⇒ 它的上游就是
  //   「同源」的基准 ⇒ ⇒ **端脑不在位 ⇒ ⇒ 基准也没了** ⇒ ⇒ ⇒ 降级链断在
  //   ⇒ ⇒ ⇒ 「副本的同源性恰恰靠端脑本体来证明」⇒ ⇒ ⇒ 那是个死结。
  //   ⇒ ⇒ 修法：**没有 canonical 时，用「自称持有方 crate 名 ＋ 上游一致」的
  //   ⇒ ⇒ ⇒ 那些仓互证** ⇒ ⇒ 它们的上游就是基准（**多副本一致 ⇒ ⇒ 更强**）。
  //   ⚠️ **只有一个候选时也认** ⇒ ⇒ 那是「至少有个副本在位」这一格。
  //   ⚠️ **候选互相冲突（多个不同上游）⇒ ⇒ 不给基准** ⇒ ⇒ 那一格判不了
  //   ⇒ ⇒ ⇒ **不许随便挑一个**（挑一个＝放走冒充者）。
  for (const pkg of OWNER_PACKAGES) {
    if (m.has(pkg) && m.get(pkg).upstream) continue; // canonical 在位且有上游 ⇒ ⇒ 基准就是它
    const candidates = new Map(); // upstream -> Set(仓名)
    for (const repo of DISCOVERED) {
      const root = repoRoot(repo);
      if (!root) continue;
      const p = join(root, 'Cargo.toml');
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf8');
      if (packageNameOf(text) !== pkg) continue;
      const up = upstreams.get(repo) || null;
      if (!up) continue;
      // ⚠️⚠️ **上游仓名必须 == 持有方 crate 名**（2026-11-11 实测打脸后补）：
      //   canonical 缺席时基准只能从**候选**里来 ⇒ ⇒ 若不筛，**冒充者自己
      //   ⇒ ⇒ 就成了基准**（实测：造一个上游 iBLOC/prefrontal 的冒充端脑
      //   ⇒ ⇒ ⇒ 它成了「唯一候选」⇒ ⇒ 降级成功 ⇒ ⇒ ⇒ 闸绿 ⇒ ⇒ ⇒ 假绿）
      //   ⇒ ⇒ ⇒ 所以基准必须**自带身份**：上游地址里那个仓名要与持有方
      //   ⇒ ⇒ ⇒ 的 crate 名**同名**（telencephalon ↔ telencephalon）⇒ ⇒ ⇒
      //   ⇒ ⇒ ⇒ 冒充者的上游仓名是 prefrontal ⇒ ⇒ ⇒ 对不上 ⇒ ⇒ ⇒ 候选集
      //   ⇒ ⇒ ⇒ 为空 ⇒ ⇒ ⇒ 那一格**判不了** ⇒ ⇒ ⇒ 红（而不是拿冒充者的
      //   ⇒ ⇒ ⇒ manifest 当真相来源）。
      if (upstreamRepoName(up) !== pkg) continue;
      if (!candidates.has(up)) candidates.set(up, new Set());
      candidates.get(up).add(repo);
    }
    if (candidates.size === 0) continue;
    // ⚠️ **候选冲突 ⇒ ⇒ 不给基准** ⇒ ⇒ 那一格判不了。
    if (candidates.size > 1) continue;
    const only = [...candidates.entries()][0];
    m.set(pkg, { upstream: only[0], manifest: null, corroboratedBy: [...only[1]].sort() });
  }
  return m;
}
const CONSUMER_REPOS = classifyRepos(
  DISCOVERED,
  OWNERS,
  ROOT_MANIFESTS,
  OWNER_PACKAGES,
  getUpstreams(),
  getOwnerCrateInfo(getUpstreams())
).consumers.map((repo) => ({
  repo,
  dirs: sourceDirsOf(repo),
}));

/**
 * **叶区**（lobe）—— 结构上**没有推理能力**的那些仓。
 *
 * ⚠️ 与「消费者」的区别：消费者是「不许实例化运行时」，叶区是
 * **「连 neuron 这个 crate 都不许依赖」** ⇒ ⇒ 前者是行为约束，后者是
 * 结构约束 ⇒ ⇒ 后者更强 ⇒ ⇒ 所以这两层判据（N10 声明层 / N11 解析层）要单列。
 *
 * ⚠️⚠️⚠️ **这一面现在是「发现」出来的，不是手写名单**（2026-11-11 实测打脸）：
 *   手写名单写的是六仓（prefrontal／diencephalon／temporal／parietal／
 *   occipital／amygdala）⇒ ⇒ 逐条核端脑的 Cargo.toml ⇒ ⇒ **真被端脑装载的
 *   只有 prefrontal 与 diencephalon** ⇒ ⇒ 而 temporal／parietal／occipital／
 *   amygdala **端脑根本没有依赖行**（它们是仓，但没被大脑装上）⇒ ⇒ ⇒
 *   ⇒ ⇒ 手写名单**既漏又多**：漏的是「将来新增的叶区」（不在名单 ⇒ ⇒
 *   ⇒ ⇒ 解析层不覆盖 ⇒ ⇒ **假绿**），多的是「压根没被装载的仓」（白花解析
 *   ⇒ ⇒ ⇒ 时间，还让人以为「盖住了」）。
 *
 *   ⇒ ⇒ 真相来源 = **端脑 Cargo.toml 的 path 依赖**（结构事实，不是记忆）
 *   ⇒ ⇒ 新增一个叶区仓 ⇒ ⇒ 只要端脑加了 path 依赖 ⇒ ⇒ 它**自动进面**。
 *
 * ⚠️ ** hippocampus 现在也在这面里** —— 它是被端脑装上的（`hippocampus-core`
 *   ＋ `hippocampus-server`）⇒ ⇒ 而它**同样不许拖**推理运行时 ⇒ ⇒ ⇒
 *   ⇒ 「不许有 neuron 依赖边」这一格对它**本来就成立**（N13 也判它）⇒ ⇒
 *   ⇒ ⇒ 两层（N13 声明层 ／ N11 解析层）**共用这一面** ⇒ ⇒ ⇒ 不是矛盾。
 *
 * ⚠️ **排除项**：neuron（实现方）、telencephalon／encephalon（大脑自己）
 *   ⇒ ⇒ 否则「装在大脑里的那份 neuron」会被判成叶区 ⇒ ⇒ **假红**。
 */
const LEAF_REPOS = [];

/**
 * **叶区面** —— 被大脑**实际装载**的兄弟仓（发现，不是手写）。
 *
 * ⚠️ **懒加载** ⇒ ⇒ 自检不碰真文件系统（自检必须快且不依赖兄弟仓在位）
 * ⇒ ⇒ 主流程才读真端脑 manifest。
 *
 * ⚠️ **读不到端脑 ⇒ ⇒ 空面** ⇒ ⇒ 那时 N10/N11/N12 一条都不判 ⇒ ⇒
 * ⇒ ⇒ **判不了 ≠ 没问题** ⇒ ⇒ 主流程读数要单列「叶区面判不了」。
 *
 * @param {string[]} exclude 额外排除的仓名（持有方副本等）
 * @returns {{repos: string[], ok: boolean, reason: string}}
 */
let LEAF_FACE_CACHE = null;
/**
 * **叶区面** —— 被大脑**实际装载**的兄弟仓（发现，不是手写）。
 *
 * ⚠️⚠️ **真相来源要能降级**（2026-11-11 补）：端脑仓不在工作区里时 ⇒ ⇒
 * 「叶区面」就**判不了** ⇒ ⇒ 而 N10/N11/N12 **一条都不判** ⇒ ⇒ ⇒ 闸**照样绿**
 * ⇒ ⇒ ⇒ 那是一盏「没查却绿」的灯（与 U+34C5 条记的「漏的那一格是假绿」同族）。
 * ⇒ ⇒ ⇒ 所以：
 *   ❶ **降级来源** ＝ **同源的端脑副本**（按 crate 身份 ＋ 同源判定认出来的那几份
 *      端脑副本 ⇒ ⇒ 实测 `wt-tel-verify` 的 manifest 与端脑**逐字相同** ⇒ ⇒
 *      ⇒ 它的 path 依赖就是端脑的 path 依赖）⇒ ⇒ 那一格照样判得出来。
 *   ❷ **两个来源都没有** ⇒ ⇒ **判不了** ⇒ ⇒ 闸**必须阻断**（不是绿）。
 *
 * @param {string[]} exclude 额外排除的仓名（持有方副本等）
 * @returns {{repos: string[], ok: boolean, reason: string, source: string}}
 */
function getLeafFace(exclude = []) {
  if (LEAF_FACE_CACHE) return LEAF_FACE_CACHE;
  const skip = new Set(exclude);
  const fromText = (text) => lobeReposLoadedBy(text).filter((r) => !skip.has(r));
  // ❶ **首选端脑自己**（那是「大脑装了什么」的第一手事实）。
  const root = repoRoot('telencephalon');
  const mp = root ? join(root, 'Cargo.toml') : null;
  if (mp && existsSync(mp)) {
    const repos = fromText(readFileSync(mp, 'utf8'));
    LEAF_FACE_CACHE = { repos, ok: true, reason: '', source: 'telencephalon/Cargo.toml' };
    return LEAF_FACE_CACHE;
  }
  // ❷ **降级到同源副本** ⇒ ⇒ 端脑不在位但副本在位 ⇒ ⇒ 那一格仍判得出来。
  //    ⚠️ **按 crate 身份 ＋ 同源**挑（不是按目录名）⇒ ⇒ 否则「名字像端脑的
  //    陌生仓」会被当真相来源 ⇒ ⇒ ⇒ 那是**冒充**（U+3459 条那条判据）。
  const upstreams = getUpstreams();
  const ownerCrateInfo = getOwnerCrateInfo(upstreams);
  for (const repo of DISCOVERED) {
    const r2 = repoRoot(repo);
    if (!r2) continue;
    const p2 = join(r2, 'Cargo.toml');
    if (!existsSync(p2)) continue;
    const text2 = readFileSync(p2, 'utf8');
    if (packageNameOf(text2) !== 'telencephalon') continue;
    // ⚠️ **同源才认** ⇒ ⇒ 上游必须与 canonical 逐字相同（强证据那档）。
    const ev = ownerEvidenceOf(repo, text2, OWNERS, OWNER_PACKAGES, upstreams, ownerCrateInfo);
    if (!ev.owner || ev.evidence !== 'same-upstream') continue;
    const repos = fromText(text2);
    LEAF_FACE_CACHE = {
      repos,
      ok: true,
      reason: '',
      source: repo + '/Cargo.toml（端脑不在位 ⇒ 用**同源副本**降级）',
    };
    return LEAF_FACE_CACHE;
  }
  // ❸ **两个来源都没有** ⇒ ⇒ 判不了 ⇒ ⇒ 由闸阻断（**不许绿**）。
  LEAF_FACE_CACHE = {
    repos: [],
    ok: false,
    reason: '端脑 manifest 读不到（端脑不在工作区里，且没有同源副本可降级）',
    source: '',
  };
  return LEAF_FACE_CACHE;
}

/** 本仓内的消费者。 */
const LOCAL_DIRS = [
  { dir: join(ROOT, 'shadow-desktop', 'src-tauri', 'src'), exts: ['.rs'], label: 'shadow-desktop/src-tauri/src' },
  { dir: join(ROOT, 'shadow-mobile', 'lib'), exts: ['.dart'], label: 'shadow-mobile/lib' },
];

/** 实现方自己（扫它是为了 N2：独立可执行文件只许在 examples/tests/benches）。 */
const OWNER_SCAN = [
  { repo: 'neuron', dirs: ['src', 'examples', 'tests', 'benches'] },
  { repo: 'telencephalon', dirs: ['src'] },
  { repo: 'encephalon', dirs: ['src'] },
];

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 从 `openIdx`（指向 '('）开始取**平衡**的那一段实参。
 *
 * ⚠️ **为什么不用正则 `[^)]*`**（2026-11-09 实测）：那会在**第一个右括号**
 * 处截断 ⇒ ⇒ `Some(f(bound_addr))` 被截成 `f(bound_addr` ⇒ ⇒ 形状判据
 * 认不出来 ⇒ ⇒ 「带参调用」与「裸标识符」两档都会**判错**。
 */
function balancedArg(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return text.slice(openIdx + 1);
}

/**
 * 只保留「代码行」—— 注释行不算证据。
 *
 * 为什么不用手写词法分析器：这个仓里有 Rust 的**跨行字符串续行**
 * （`tracing::info!("... \` 换行接着写），字符串状态一旦跨行就断了，
 * 状态机会把后面的代码整段当成注释吃掉 —— 而且这种坑只在某个文件
 * 里出现一次，极难定位。
 */
function codeLines(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith('//')) return false;
      if (t.startsWith('/*')) return false;
      if (t.startsWith('*')) return false;
      return true;
    })
    .join('\n');
}

/** 测试 / 示例 / bench —— 那里出现被禁的词往往是在**断言它不存在**。 */
function isNonProductFile(file) {
  return (
    file.includes('/tests/') ||
    file.includes('/test/') ||
    file.includes('/__tests__/') ||
    file.includes('/examples/') ||
    file.includes('/benches/') ||
    /_tests?\.rs$/.test(file) ||
    /\.(test|spec)\.[jt]sx?$/.test(file)
  );
}

/** 键的第一段就是仓名（`prefrontal/src/x.rs` / `shadow-desktop/src/...`）。 */
function repoOf(file) {
  return file.split('/')[0];
}

/**
 * 兄弟仓在哪 ⇒ ⇒ **两种布局都要认**：
 *
 * · 本机多仓 path 工作区：兄弟仓在工作区**之外**（iBLOC/<repo>）
 * · CI：actions/checkout 把兄弟仓 checkout 到**工作区之内**（<workspace>/<repo>）
 *
 * ⚠️ 只认一种布局 ⇒ ⇒ 闸在 CI 上就只剩本仓那点代码 ⇒ ⇒ **假绿**
 * （上一轮 YAML 闸撞过同族坑：worktree 与主仓共享 git-common-dir）。
 */
function repoRoot(name) {
  const outside = join(IBLOC, name);
  if (existsSync(outside)) return outside;
  const inside = join(ROOT, name);
  if (existsSync(inside)) return inside;
  return null;
}

/**
 * 某个仓的 manifest 在哪 —— **认两种布局**（本机工作区之外 / CI 工作区之内）。
 *
 * ⚠️ shadow-desktop 特判：它的 manifest 在 `shadow-desktop/src-tauri/` 下面，
 * 不是仓根。
 */
function manifestPathOf(repo) {
  if (repo === 'shadow-desktop') {
    const p = join(ROOT, 'shadow-desktop', 'src-tauri', 'Cargo.toml');
    return existsSync(p) ? p : null;
  }
  const root = repoRoot(repo);
  return root ? join(root, 'Cargo.toml') : null;
}

/** 收集要判的代码（键 = 仓内相对路径，跨仓统一以仓名开头）。 */
function collectCode() {
  const code = new Map();
  for (const { repo, dirs } of [...CONSUMER_REPOS, ...OWNER_SCAN]) {
    const root = repoRoot(repo);
    if (!root) continue;
    for (const d of dirs) {
      for (const f of walk(join(root, d), ['.rs'])) {
        code.set(join(repo, relative(root, f)).replace(/\\/g, '/'), codeLines(readFileSync(f, 'utf8')));
      }
    }
  }
  for (const { dir, exts, label } of LOCAL_DIRS) {
    for (const f of walk(dir, exts)) {
      code.set(join(label, relative(dir, f)).replace(/\\/g, '/'), codeLines(readFileSync(f, 'utf8')));
    }
  }
  return code;
}

/** manifest 键 ⇒ 仓名（键可能是「仓」或「仓/成员」）。 */
function repoName(key) {
  return key.split('/')[0];
}

/** manifest 键 ⇒ 给人看的路径。 */
function manifestLabel(key) {
  if (key === 'shadow-desktop') return 'shadow-desktop/src-tauri/Cargo.toml';
  return key + '/Cargo.toml';
}

/**
 * 从 workspace 根 manifest 里读出**成员**名单。
 *
 * ⚠️ 为什么必须读成员：海马体那条 neuron 依赖曾经写在
 * `hippocampus-server/Cargo.toml`（**成员**的 manifest）里 ⇒ ⇒ 只看根
 * manifest 的闸**根本看不见它** ⇒ ⇒ 「零违规」是**假绿**
 * （2026-11-08 实测：成员里的那条依赖边躲过了 N4/N5）。
 */
function workspaceMembers(rootManifest) {
  const m = rootManifest.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** 收集各仓的 Cargo.toml（键 = 仓名，或 仓名/成员名）。 */
/**
 * 各仓的 **git 上游**（`remote.origin.url`）—— 「同源」的第二个证据。
 *
 * ⚠️ **为什么读 git 而不是只看 manifest**：crate 名跨仓可重名（见
 * `normalizeUpstream` 的注释）⇒ ⇒ 光靠 crate 名 ⇒ ⇒ 「改名冒充」能骗过豁免
 * ⇒ ⇒ ⇒ 上游相同 ⇒ ⇒ 才是「同一份代码的另一个检出」⇒ ⇒ ⇒ 判据才有牙。
 *
 * ⚠️ **读不到**（不是 git 仓 / 没有 remote）⇒ ⇒ **不红**（判不了 ≠ 违规）
 * ⇒ ⇒ ⇒ 但那一格算「**未覆盖**」⇒ ⇒ 别把它当「已判且没问题」。
 */
function collectUpstreams() {
  const upstreams = new Map();
  for (const repo of DISCOVERED) {
    const root = repoRoot(repo);
    if (!root) continue;
    const r = spawnSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' });
    const raw = r.status === 0 && r.stdout ? String(r.stdout).trim() : null;
    upstreams.set(repo, raw ? normalizeUpstream(raw) : null);
  }
  return upstreams;
}

/**
 * 归一化上游的**仓名**（最后一段）—— 「上游仓库名 == crate 名」那条弱证据。
 */
export function upstreamRepoName(normalized) {
  if (!normalized) return null;
  const parts = String(normalized).split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
function collectManifests() {
  const manifests = new Map();
  // ⚠️ **全集 = 发现到的仓**（不是手写名单）⇒ ⇒ 新仓的 manifest 也进面 ⇒ ⇒
  // ⇒ 「名单外那个仓自己起了 neuron」不再判不到（2026-11-09 实测的老洞）。
  const repos = DISCOVERED;
  for (const repo of repos) {
    const root = repoRoot(repo);
    if (!root) continue;
    const p = join(root, 'Cargo.toml');
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf8');
    manifests.set(repo, raw);
    // ⚠️ **workspace 成员也要看** ⇒ ⇒ 否则成员里的依赖边是**看不见**的
    // ⇒ ⇒ 「零违规」长得跟「真干净」一模一样（假绿的经典形态）。
    for (const member of workspaceMembers(raw)) {
      // ⚠️ **成员 "." 就是仓根本身** ⇒ ⇒ 收它 ⇒ ⇒ 同一个文件被收两遍
      // （键 `repo` ＋ `repo/.`）⇒ ⇒ **同一条违规报两遍** ⇒ ⇒ 读数虚增。
      // ⇒ ⇒ 跳过它。
      if (member === '.') continue;
      const mp = join(root, member, 'Cargo.toml');
      if (existsSync(mp)) manifests.set(`${repo}/${member}`, readFileSync(mp, 'utf8'));
    }
  }
  const local = join(ROOT, 'shadow-desktop', 'src-tauri', 'Cargo.toml');
  if (existsSync(local)) manifests.set('shadow-desktop', readFileSync(local, 'utf8'));
  return manifests;
}

/** 去掉 Cargo.toml 的注释行（只看真依赖）。 */
function manifestCode(text) {
  return text
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
}

// ── feature 图层（N7 / N9）与产物层（N8） ────────────────────────────────
//
// ⚠️ 这两层**不是**源码层的替代品 ⇒ ⇒ 它们补的是源码层看不见的两种失败：
//   · feature 层：谁在脑侧那条链上打开了「海马体自己嵌 neuron」的那个开关
//   · 产物层：编译出来的二进制里到底装了几套运行时

/**
 * 产物登记册 —— 「哪些产物会一起装进同一个 app」。
 *
 * ⚠️ 组 = **一起被装进同一个进程**的那批文件 ⇒ ⇒ 手机端是 jniLibs 目录下的
 * 全部 .so（APK 里一起装）⇒ ⇒ 桌面端是那个 exe。
 */
const ARTIFACT_GROUPS = [
  {
    group: 'mobile-android',
    desc: '手机 APK 里一起装进去的 .so',
    dir: join(ROOT, 'shadow-mobile', 'android', 'app', 'src', 'main', 'jniLibs', 'arm64-v8a'),
    accept: (n) => n.endsWith('.so'),
  },
  {
    group: 'desktop',
    desc: '桌面端可执行文件',
    files: [join(ROOT, 'shadow-desktop', 'src-tauri', 'target', 'debug', 'shadow-desktop.exe')],
  },
  {
    group: 'android-target',
    desc: '手机端 Rust cdylib（装进 APK 的那一份）',
    files: [join(IBLOC, 'encephalon', 'target-android', 'aarch64-linux-android', 'release', 'libencephalon.so')],
  },
];

/** 扫产物：每个文件里运行时痕迹的次数。 */
function collectArtifacts() {
  const artifacts = [];
  for (const g of ARTIFACT_GROUPS) {
    let files = [];
    if (g.dir) files = listFiles(g.dir, g.accept);
    if (g.files) {
      files = g.files
        .filter((p) => existsSync(p))
        .map((p) => ({ name: p.split(/[\\/]/).pop(), path: p }));
    }
    for (const f of files) {
      artifacts.push({
        group: g.group,
        path: f.path,
        role: classifyArtifactRole(f.name),
        counts: scanFileMarkers(f.path, RUNTIME_MARKERS),
      });
    }
  }
  return artifacts;
}

/**
 * 跑一次 cargo tree -e features -i pkg，解析出「那个包身上开了哪些 feature」。
 *
 * ⚠️ **三段式**（每一段都比上一段更「敢」）：
 * ① --offline --locked —— 本机 registry 缓存是热的，而且本机代理指向死代理
 *    ⇒ ⇒ 走网络会卡；--locked ⇒ ⇒ 绝不改工作树。
 * ② --locked（联网）—— CI 上缓存是冷的 ⇒ ⇒ --offline 必然失败。
 * ③ **锁过期时**：临时允许 cargo 最小更新锁（跑完逐字节还原）⇒ ⇒ 解析层不
 *    因为「某个仓的锁没跟上」而失效。⚠️ 实测正是这么发现的：某个仓的锁缺一个
 *    path 依赖 ⇒ ⇒ --locked 拒绝 ⇒ ⇒ 那个仓的 feature 图**判不了** ⇒ ⇒
 *    而判不了 ≠ 没问题 ⇒ ⇒ 那是一盏「没查却绿」的灯。
 */
function cargoTreeFeatures(manifestPath, pkg) {
  const tree = ['tree', '-e', 'features', '-i', pkg, '--manifest-path', manifestPath];
  // ⚠️ **必须把颜色关掉** ⇒ ⇒ CI 的 workflow 全局设了 CARGO_TERM_COLOR=always
  //    ⇒ ⇒ cargo tree 的树线会带 ANSI ⇒ ⇒ 解析器的正则一条都匹配不上 ⇒ ⇒
  //    ⇒ ⇒ 「解析成功但一个 feature 都没解析出来」⇒ ⇒ N9 假红 ＋ N7/N11 假绿。
  //    ⇒ ⇒ 这里关掉颜色（**输入确定化**），lib 里再剥一次（防御 ＋ 判据可测）。
  const env = { ...process.env, CARGO_TERM_COLOR: 'never' };
  const run = (args, timeout) => spawnSync('cargo', args, { encoding: 'utf8', timeout, cwd: ROOT, env });
  const interpret = (res) => {
    if (res.error) return { ok: false, reason: 'cargo 跑不起来：' + res.error.message, stderr: '' };
    // ⚠️ 判定的三态、以及「解析失败 ⇒ 判不了」都在 lib 的纯函数里 ⇒ ⇒ 自检能喂夹具
    return judgeFeatureParse({ status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', pkg });
  };

  let lastReason = '';
  let staleLock = false;
  for (const attempt of [
    { args: ['--offline', '--locked', ...tree], timeout: 60000 },
    { args: ['--locked', ...tree], timeout: 300000 },
  ]) {
    const parsed = interpret(run(attempt.args, attempt.timeout));
    if (parsed.ok) return parsed;
    lastReason = parsed.reason;
    // ⚠️ **任何一次**尝试被锁挡住 ⇒ ⇒ 都要走兜底 ⇒ ⇒ 不能被后一次尝试覆盖掉
    //    （真 CI 上就是这里：旧正则只认「cannot update」⇒ ⇒ 「cannot create」
    //      —— 也就是**压根没有锁**的那两个仓 —— 永远等不到兜底 ⇒ ⇒ 覆盖面 7/9）
    staleLock = staleLock || isStaleLockError(parsed.stderr || '');
  }
  if (!staleLock) return { ok: false, reason: lastReason };

  // 锁过期 / 压根没有锁 ⇒ ⇒ 临时允许 cargo 更新锁 ⇒ ⇒ 跑完立刻逐字节还原
  return withRestoredLock(manifestPath, () => {
    for (const attempt of [
      { args: ['--offline', ...tree], timeout: 120000 },
      { args: tree, timeout: 300000 },
    ]) {
      const parsed = interpret(run(attempt.args, attempt.timeout));
      if (parsed.ok) return parsed;
      lastReason = parsed.reason;
    }
    return { ok: false, reason: '放行锁之后仍然失败：' + lastReason };
  });
}

/**
 * 要解析哪些 feature 图。
 *
 * · brain-no-local-models —— 脑侧那条链的每个仓：图里不许有 local-models
 * · brain-candle —— 链顶（桌面端）：脑内嵌的 neuron 必须带 candle
 * · consumer-no-candle —— 消费者：自己的图里不许出现 candle
 */
function collectFeatureGraph(manifests) {
  const targets = [];
  const push = (label, manifestPath, pkg, kind) => {
    if (!existsSync(manifestPath)) return;
    targets.push({ label, manifestPath, pkg, kind });
  };
  // 脑侧那条链：每个仓的**已解析**图里都不许出现 local-models
  for (const repo of ['telencephalon', 'encephalon']) {
    const root = repoRoot(repo);
    if (!root) continue;
    push(repo, join(root, 'Cargo.toml'), 'hippocampus-server', 'brain-no-local-models');
  }
  push('shadow-desktop', join(ROOT, 'shadow-desktop', 'src-tauri', 'Cargo.toml'), 'hippocampus-server', 'brain-no-local-models');
  // 「脑内嵌的 neuron 必须带 candle」只在**链顶**判（端脑自己的默认构建里
  // candle 是可选的 ⇒ ⇒ 拿它当链顶会假红）⇒ ⇒ 链顶 = 大脑 与 桌面端。
  push('shadow-desktop', join(ROOT, 'shadow-desktop', 'src-tauri', 'Cargo.toml'), 'neuron', 'brain-candle');
  {
    const root = repoRoot('encephalon');
    if (root) push('encephalon', join(root, 'Cargo.toml'), 'neuron', 'brain-candle');
  }
  // 消费者：图里不许出现 candle ⇒ ⇒ 叶区不在自己体内拖一份推理后端
  // ⚠️ shadow-desktop 是**链顶宿主**（它持有脑内嵌的那一个 neuron）⇒ ⇒
  //    它的图里本来就该带 candle ⇒ ⇒ 这里**必须排除**（否则假红）。
  for (const [repo, raw] of manifests) {
    // ⚠️ 持有方判定按**crate 身份** ⇒ ⇒ 端脑副本（验证副本 / worktree）
    // 自动豁免 ⇒ ⇒ 否则副本的图里**本来就有 candle**（它是端脑那份）
    // ⇒ ⇒ ⇒ 判它「不许带 candle」⇒ ⇒ **假红**。
    if (isOwnerRepo(repo, manifests.get(repo))) continue;
    if (repo === 'shadow-desktop') continue;
    if (!/^neuron\s*=\s*\{/m.test(manifestCode(raw))) continue;
    const mp = manifestPathOf(repo);
    if (!mp) continue;
    push(repo, mp, 'neuron', 'consumer-no-candle');
  }
  // 叶区：解析后的依赖图里**不许出现 neuron** ⇒ ⇒ 防传递边
  // ⚠️ 目标**不许**按「manifest 里有没有 neuron 行」来挑 ⇒ ⇒ 否则
  //    「那条边被删了」＝「这一层判据自己死了」⇒ ⇒ 那正是假绿最隐蔽的形态。
  for (const repo of getLeafFace().repos) {
    const mp = manifestPathOf(repo);
    if (!mp) continue;
    push(repo, mp, 'neuron', 'leaf-no-neuron');
  }
  const out = [];
  for (const t of targets) {
    const r = cargoTreeFeatures(t.manifestPath, t.pkg);
    out.push({
      label: t.label + ' → ' + t.pkg,
      kind: t.kind,
      ok: r.ok,
      reason: r.reason,
      notInGraph: r.notInGraph,
      features: r.features || [],
    });
  }
  return out;
}

// ── 规则 ────────────────────────────────────────────────────────────────
//
// 每条规则都是「纯函数」：吃一份 ctx，吐一份 findings ⇒ ⇒ 自检可以用
// 合成夹具喂它 ⇒ ⇒ 「这条失败长什么样」必须能被造出来。

const RULES = [
  {
    id: 'N1',
    why: '消费者自己实例化了 neuron 的运行时 —— 那就是第二个 neuron（重复占用模型）',
    check(ctx) {
      const findings = [];
      // ⚠️ **必须匹配限定路径** —— 「run_embedded」这种**裸名字**别的仓也有
      // （prefrontal 自己的 embedded 入口就叫 run_embedded）⇒ ⇒ 裸名字匹配
      // ⇒ ⇒ **假阳性** ⇒ ⇒ 而假阳性会让闸变成「天天红 ⇒ ⇒ 没人看」。
      const BANNED = [
        { re: /neuron(?:_lib)?::run_embedded\s*\(/, what: 'neuron_lib::run_embedded —— 在自己体内起一个 neuron' },
        { re: /\bCandleLlmRuntime\b/, what: 'CandleLlmRuntime —— 进程内的 candle 推理运行时' },
        { re: /neuron(?:_lib)?::(?:server::)?create_router\s*\(/, what: 'neuron::create_router —— 会重建一份 ServerState' },
      ];
      for (const [file, text] of ctx.code) {
        const repo = repoOf(file);
        // ⚠️ 持有方判定按**crate 身份**（不是目录名）⇒ ⇒ 端脑的副本/worktree
        // 自动豁免 ⇒ ⇒ 而副本的目录名是随机的 ⇒ ⇒ 手写名单追不上。
        if (ownerInCtx(ctx, repo, ctx.manifests && ctx.manifests.get(repo))) continue;
        if (isNonProductFile(file)) continue;
        for (const b of BANNED) {
          if (!b.re.test(text)) continue;
          // ⚠️ **没有例外**（2026-11-08）：原来「海马体挂在 local-models 后
          // 就放过」的那处豁免被**收掉** —— 用户拍板「所有的本地推理任务都
          // 应该由大脑中的 neuron 提供」⇒ ⇒ 谁都不许自己起一个 neuron。
          findings.push({ id: 'N1', file, why: b.what + ' —— ' + repo + ' 不是 neuron 的 持有方' });
        }
      }
      return findings;
    },
  },
  {
    id: 'N2',
    why: '产品路径里出现了独立 neuron 的 可执行文件 —— 那就是第二个 neuron 进程',
    check(ctx) {
      const findings = [];
      for (const [file, text] of ctx.code) {
        if (isNonProductFile(file)) continue;
        if (text.includes('neuron_server')) {
          findings.push({ id: 'N2', file, why: '独立 neuron 可执行文件只许出现在 neuron 仓的 examples/tests/benches' });
        }
      }
      return findings;
    },
  },
  {
    id: 'N3',
    why: '桌面端必须把**脑内嵌的那一个** neuron 交给面 —— 不许自己重建一个',
    check(ctx) {
      const findings = [];
      const file = 'shadow-desktop/src-tauri/src/telencephalon_http.rs';
      const text = ctx.code.get(file);
      if (text === undefined) return findings; // 桌面端不在（别的仓单独 clone）⇒ 跳过
      if (!/stack\.neuron\(\)/.test(text)) {
        findings.push({ id: 'N3', file, why: '没找到 stack.neuron() —— 面没有拿到脑内嵌的那一个 neuron' });
      }
      if (/neuron(?:_lib)?::(?:server::)?(?:create_router|run_embedded)\s*\(/.test(text)) {
        findings.push({ id: 'N3', file, why: '不许自己重建一个 neuron（create_router / run_embedded）' });
      }
      return findings;
    },
  },
  {
    id: 'N4',
    why: '消费者对 neuron 的依赖必须 default-features = false —— 不许靠默认 feature 偷拉 candle',
    check(ctx) {
      const findings = [];
      for (const [repo, raw] of ctx.manifests) {
        // ⚠️ 键可能是「仓/成员」（见 collectManifests）⇒ ⇒ 持有方判定按**仓名**。
        // ⚠️ 判定按**crate 身份**（目录名 ＋ crate 名两条依据）⇒ ⇒ 端脑副本豁免。
        if (ownerInCtx(ctx, repoName(repo), ctx.manifests.get(repoName(repo)))) continue;
        for (const line of manifestCode(raw).split('\n')) {
          const m = line.trim().match(/^(neuron|neuron_lib)\s*=\s*\{(.*)$/);
          if (!m) continue;
          if (!/default-features\s*=\s*false/.test(m[2])) {
            findings.push({
              id: 'N4',
              file: manifestLabel(repo),
              why: 'neuron 依赖行没写 default-features = false ⇒ ⇒ 默认 feature 会把 candle 拉进来',
            });
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'N5',
    why: '任何仓都不许有 local-models —— 那个 feature 的全部内容就是「自己嵌一个 neuron」',
    check(ctx) {
      const findings = [];
      for (const [repo, raw] of ctx.manifests) {
        if (/local-models/.test(manifestCode(raw))) {
          findings.push({
            id: 'N5',
            file: manifestLabel(repo),
            why: '不许有 local-models ⇒ ⇒ 它就是「第二个 neuron」的入口（2026-11-08：本地推理只由大脑中的 neuron 提供）',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N6',
    why: '叶区必须被指向**脑面自己**（router-only 形态）—— 否则叶区会去打一个「自己的」neuron',
    check(ctx) {
      const findings = [];
      const file = 'encephalon/src/surface.rs';
      const text = ctx.code.get(file);
      if (text === undefined) return findings; // 大脑仓不在 ⇒ 跳过
      if (!/point_lobes_at_neuron\s*\(/.test(text)) {
        findings.push({ id: 'N6', file, why: '没找到 point_lobes_at_neuron —— 叶区没有被指向脑面自己' });
      }
      return findings;
    },
  },
  {
    id: 'N7',
    why: '脑侧**已解析**的 feature 图里不许有第二套运行时的来源；消费者的图里不许出现 candle',
    check(ctx) {
      const findings = [];
      for (const g of ctx.featureGraph || []) {
        // ⚠️ 解析失败 = **未覆盖**，不等于违规 ⇒ ⇒ 覆盖情况会在主流程里打印出来
        if (!g.ok) continue;
        const feats = new Set(g.features);
        if (g.kind === 'brain-no-local-models' && feats.has('local-models')) {
          findings.push({
            id: 'N7',
            file: g.label,
            why: '脑侧解析后的 feature 图里 hippocampus-server 带着 local-models ⇒ ⇒ 那就是第二套 neuron 运行时',
          });
        }
        if (g.kind === 'consumer-no-candle' && feats.has('candle')) {
          findings.push({
            id: 'N7',
            file: g.label,
            why: '消费者自己的 feature 图里 neuron 带着 candle ⇒ ⇒ 叶区在自己体内拖了一份推理后端',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N8',
    why: '产物级：neuron 运行时只许出现在**一个**产物里，且叶区产物里不许带',
    check(ctx) {
      return evaluateArtifacts(ctx.artifacts || [], RUNTIME_MARKERS);
    },
  },
  {
    id: 'N9',
    why: '脑内嵌的 neuron 必须带着推理后端（candle）—— 不然脑是空壳',
    check(ctx) {
      const findings = [];
      // ① **声明层**（到处都能判）：大脑链必须把 candle 一路转发到 neuron
      //    ⇒ ⇒ 转发那一行没了 ⇒ ⇒ 脑内嵌的 neuron 就没有后端 ⇒ ⇒ /v1/models 空。
      //    ⚠️ 必须用 manifestCode（去注释）⇒ ⇒ 否则**注释里**写一句转发
      //    就能把这道闸喂绿（假绿）。
      const tel = ctx.manifests.get('telencephalon');
      if (tel !== undefined && !/neuron\/candle/.test(manifestCode(tel))) {
        findings.push({
          id: 'N9',
          file: 'telencephalon/Cargo.toml',
          why: '端脑的 feature 里没有把 neuron/candle 转发出去 ⇒ ⇒ 脑内嵌的 neuron 没有推理后端',
        });
      }
      const enc = ctx.manifests.get('encephalon');
      if (enc !== undefined && !/telencephalon\/candle/.test(manifestCode(enc))) {
        findings.push({
          id: 'N9',
          file: 'encephalon/Cargo.toml',
          why: '大脑的 feature 里没有把 telencephalon/candle 转发出去 ⇒ ⇒ 脑内嵌的 neuron 没有推理后端',
        });
      }
      // ② **解析层**（feature 图能解析时才判）：链顶解析后的图里 neuron 必须带 candle
      for (const g of ctx.featureGraph || []) {
        if (!g.ok) continue;
        if (g.kind === 'brain-candle' && !new Set(g.features).has('candle')) {
          findings.push({
            id: 'N9',
            file: g.label,
            why: '脑侧解析后的 feature 图里 neuron 没有 candle ⇒ ⇒ 内嵌的 neuron 没有推理后端（/v1/models 会是空的）',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N10',
    why: '叶区的 manifest 里不许有 neuron 依赖行 —— 叶区是「叶」，推理能力归大脑',
    check(ctx) {
      const findings = [];
      for (const [key, raw] of ctx.manifests) {
        if (!getLeafFace().repos.includes(repoName(key))) continue;
        for (const line of manifestCode(raw).split('\n')) {
          // ⚠️ 只认**依赖行**（`neuron = { … }`），不认 feature 定义行
          // （`neuron = []`）⇒ ⇒ 后者不是一条依赖边。
          if (!/^(neuron|neuron_lib)\s*=\s*\{/.test(line.trim())) continue;
          findings.push({
            id: 'N10',
            file: manifestLabel(key),
            why: '叶区不许依赖 neuron ⇒ ⇒ 「叶区不推理」必须是结构事实（连依赖边都不许有），不是「默认关」',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N11',
    why: '叶区**解析后**的依赖图里不许有 neuron —— 认解析后的图，不认 manifest 的字面',
    check(ctx) {
      const findings = [];
      for (const g of ctx.featureGraph || []) {
        // ⚠️ 解析失败 = **未覆盖**，不等于违规 ⇒ ⇒ 覆盖情况会在主流程里打印
        if (!g.ok) continue;
        if (g.kind !== 'leaf-no-neuron') continue;
        if (g.notInGraph) continue;
        findings.push({
          id: 'N11',
          file: g.label,
          why: '叶区的解析后依赖图里出现了 neuron ⇒ ⇒ 叶区拖了一份推理运行时进来（可能是传递边，N10 看不见）',
        });
      }
      return findings;
    },
  },
  {
    id: 'N12',
    why: '叶区的 manifest 里不许出现**别的**推理运行时依赖（burn / voxcpm-rs）—— 叶区不推理，连依赖边都不许有',
    check(ctx) {
      const findings = [];
      for (const [key, raw] of ctx.manifests) {
        if (!getLeafFace().repos.includes(repoName(key))) continue;
        for (const line of manifestCode(raw).split('\n')) {
          // ⚠️ 只认**依赖行**（`burn = { … }`）⇒ ⇒ 注释里提到不算。
          if (!/^(burn|burn-core|burn-nn|burn-tensor|voxcpm-rs)\s*=\s*\{/.test(line.trim())) continue;
          findings.push({
            id: 'N12',
            file: manifestLabel(key),
            why: '叶区不许依赖推理运行时（burn / voxcpm-rs）⇒ ⇒ 「叶区不推理」必须是结构事实 —— 那条链会经 burn-store 把上游缺陷拖进每个宿主（真机实测：burn-store 0.20.1 的 pytorch 模块自相矛盾 ⇒ 桌面端 src-tauri 编不过）',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N13',
    why: '消费者不许有 neuron 依赖边（连 dev-dependencies 都不许）—— 推理能力归大脑必须是结构事实',
    check(ctx) {
      const findings = [];
      for (const [key, raw] of ctx.manifests) {
        // ⚠️ 持有方（实现方 + 大脑）例外 ⇒ ⇒ 判据是「**消费者**不许有」。
        // ⚠️ 判定按**crate 身份** ⇒ ⇒ 端脑副本/worktree 的 neuron 边**同源** ⇒ ⇒ 豁免。
        if (ownerInCtx(ctx, repoName(key), ctx.manifests.get(repoName(key)))) continue;
        for (const line of manifestCode(raw).split('\n')) {
          // ⚠️ 只认**依赖行**（`neuron = { … }` / `neuron_lib = { … }`）——
          // 不认 feature 定义行（`neuron = []`），也不认注释里的字面。
          if (!/^(neuron|neuron_lib)\s*=\s*\{/.test(line.trim())) continue;
          findings.push({
            id: 'N13',
            file: manifestLabel(key),
            why: '消费者不许依赖 neuron ⇒ ⇒ 「本地推理归大脑」必须是**结构事实**（连 dev-dependencies 都不许 —— 桌面端的测试曾经靠这条边自己起了第二个 neuron）',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N14',
    why: '海马体的脑面端点必须**在进程内递进**（地址由宿主给、钥匙由端脑自己那把 admin token 出）—— 否则进程内那份海马体的本地推理落到别处去了，或者钥匙摊在进程环境里',
    check(ctx) {
      const findings = [];
      // ⚠️ **再过一遍 codeLines** ⇒ ⇒ **注释里写一遍名字不算接线**
      // （认形状不认关键词）。
      const file = 'shadow-desktop/src-tauri/src/telencephalon_http.rs';
      const text = ctx.code.get(file);
      if (text === undefined) return findings; // 桌面端不在（别的仓单独 clone）⇒ 跳过
      const code = codeLines(text);
      // ⚠️⚠️ **判据一：桌面端必须把脑面**地址**递进端脑的 `BuildOptions`**
      // ⇒ ⇒ 这才是「海马体知道脑面在哪」的那一格。
      //
      // ⚠️ **为什么不再判 env 变量名**（2026-11-09 实测后改的形状）：
      // ⇒ ⇒ 桌面端此前把 **admin token** 用 `set_var` 塞进**进程环境**
      // ⇒ ⇒ 那条通道会把凭据摊给同用户进程 / 子进程 / 崩溃转储 / 日志采集
      // ⇒ ⇒ 明文密钥落盘闸盯的就是那一格 ⇒ ⇒ 形状已改成**程序化递进**。
      if (!/brain_face_base\s*:\s*Some\(/.test(code)) {
        findings.push({
          id: 'N14',
          file,
          why: '桌面端没有把脑面**地址**递进端脑的 BuildOptions（brain_face_base: Some(…)）⇒ ⇒ 进程内那份海马体的本地推理不会走大脑那张面',
        });
      }
      // ⚠️⚠️ **判据二：钥匙不许进进程环境** —— 这是本条不变式的**另一半**。
      // ⇒ ⇒ 「地址递了、但钥匙顺手塞进 env」那种形状**必须**红。
      // ⇒ ⇒ （`HIPPOCAMPUS_BRAIN_TOKEN` 那条 env 通道现在只服务**独立进程形态**
      // ⇒ ⇒  ⇒ 嵌入式那一份不许走它。）
      if (/set_var\s*\(\s*"[A-Z0-9_]*BRAIN[A-Z0-9_]*"/.test(code)) {
        findings.push({
          id: 'N14',
          file,
          why: '桌面端把脑面**钥匙**写进了**进程环境**（set_var）⇒ ⇒ 同用户进程 / 子进程 / 崩溃转储 / 日志采集都会把它带走 ⇒ ⇒ 那条通道只服务独立进程形态，嵌入式那一份不许走它',
        });
      }
      // ⚠️ **注入函数存在 ≠ 接上了** ⇒ ⇒ 还要看端脑那一侧真的接住了。
      // ⇒ ⇒ 端脑必须在**进程内**把它递给海马体（走 `…_and_brain` 那个入口）
      // ⇒ ⇒ 否则「地址递了」也只是递给了空气。
      const brainFile = 'telencephalon/src/boot.rs';
      const brain = ctx.code.get(brainFile);
      if (brain !== undefined) {
        const bcode = codeLines(brain);
        if (!/build_state_with_timeout_and_config_and_brain\s*\(/.test(bcode)) {
          findings.push({
            id: 'N14',
            file: brainFile,
            why: '端脑没有在**进程内**把脑面端点递给海马体（build_state_with_timeout_and_config_and_brain）⇒ ⇒ 地址递了也没人接（海马体照样不指脑面）',
          });
        }
        // ⚠️ **钥匙必须来自端脑自己那把 admin token** ⇒ ⇒ 不是从 env 另找一把。
        if (!/brain_endpoint\s*\([^)]*admin_token/.test(bcode)) {
          findings.push({
            id: 'N14',
            file: brainFile,
            why: '端脑递给海马体的脑面端点**没有**用自己那把 admin token ⇒ ⇒ 钥匙来源不明（可能是又一条秘密通道）',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'N16',
    why: '持有方豁免必须按**crate 身份**判 —— 端脑的副本（验证副本 / worktree）目录名是随机的⇒ ⇒ 按目录名豁免 ⇒ ⇒ 那个副本被 N13/N4 误指控（闸天天红 ⇒ ⇒ 没人看它）',
    check(ctx) {
      const findings = [];
      // ⚠️ **判据一：豁免名单里不许有「目录名式」的持有方** ⇒ ⇒ 那类条目
      // 迟早会漏（副本改名就失配）⇒ ⇒ 而身份判定已经覆盖了它们。
      //
      // ⚠️ **判据二：身份判定必须真的在用** ⇒ ⇒ 否则规则自己死了
      // （「豁免名单空了 ⇒ ⇒ 谁都不豁免」也会让闸恒红 ⇒ ⇒ 没人看它）。
      // ⚠️ **从 ctx 读名单** ⇒ ⇒ 自检才能造出「按名字的豁免」来验它
      // ⇒ ⇒ 否则这条判据自己**从没有被正控验过** ⇒ ⇒ 恒绿。
      const owners = ctx.owners || OWNERS;
      const ownerPackages = ctx.ownerPackages || OWNER_PACKAGES;
      for (const owner of owners) {
        // ⚠️ 目录名与 crate 名**重合**的那个（neuron / telencephalon /
        //    encephalon）⇒ ⇒ 那是真持有方 ⇒ ⇒ 不算「目录名式补丁」。
        if (ownerPackages.has(owner)) continue;
        findings.push({
          id: 'N16',
          file: 'OWNERS',
          why: '持有方名单里「' + owner + '」的目录名**不等于**它的 crate 名 ⇒ ⇒ 这是一条**按名字**的豁免 ⇒ ⇒ 副本一改名就失配 ⇒ ⇒ 必须由 crate 身份承重',
        });
      }
      // ⚠️⚠️ **判据二：冒充持有方**（2026-11-09 实测打脸后补齐）—— 「crate 名
      // ⇒ ⇒ 不可能各自独立」这句论证**只在同一个依赖图里成立** ⇒ ⇒ 两个**独立
      // 仓**可以各有各的 `name = "telencephalon"` ⇒ ⇒ ⇒ 任何仓把 package name
      // ⇒ ⇒ ⇒ 改成 `telencephalon` 就能骗过「只有 crate 名」那一半 ⇒ ⇒ ⇒ 而
      // ⇒ ⇒ ⇒ 豁免是**危险方向**（放走一条「自己起 neuron」的边）⇒ ⇒ ⇒ 真证据
      // ⇒ ⇒ ⇒ 是**上游同源**（同一份代码的另一个 checkout / worktree）⇒ ⇒ ⇒
      // ⇒ ⇒ ⇒ 实测端脑的三个副本上游**逐字相同** ⇒ ⇒ ⇒ 而冒充者的上游是**它
      // ⇒ ⇒ ⇒ 自己的**仓库** ⇒ ⇒ ⇒ 分得开。
      // ⚠️ **读不到上游 ⇒ ⇒ 不红**（判不了 ≠ 违规）⇒ ⇒ ⇒ 那一格在主流程读数
      // ⇒ ⇒ ⇒ 里单列「未验证的豁免」⇒ ⇒ **不许当成「已判无问题」**。
      const upstreams = ctx.upstreams || new Map();
      const ownerCrateInfo = ctx.ownerCrateInfo || new Map();
      for (const [repo, upstream] of upstreams) {
        if (!upstream) continue;
        if (owners.has(repo)) continue;
        const manifest = ctx.manifests && ctx.manifests.get(repo);
        const pkg = packageNameOf(manifest);
        if (!pkg || !ownerPackages.has(pkg)) continue;
        const canonical = ownerCrateInfo.get(pkg);
        if (!canonical || !canonical.upstream) continue;
        if (upstream === canonical.upstream) continue;
        findings.push({
          id: 'N16',
          file: repo,
          why: '这个仓自称持有方的 crate 名「' + pkg + '」，但它的上游是 ' + upstream + ' ≠ 持有方那份的 ' + canonical.upstream + ' ⇒ ⇒ 它**不是**那份代码的副本（crate 名跨仓可以重名 —— 只在同一个依赖图里唯一）⇒ ⇒ 豁免不成立',
        });
      }
      return findings;
    },
  },
  {
    id: 'N17',
    why: '叶区面必须按「大脑**实际装载**的兄弟仓」发现 —— 不许用手写名单 —— 名单既会漏（新增叶区不在名单 ⇒ ⇒ 解析层不覆盖 ⇒ ⇒ **假绿**）又会多（判了压根没被装载的仓 ⇒ ⇒ 白花解析时间，还让人以为「盖住了」）；实测端脑真装上的只有 prefrontal／diencephalon／hippocampus／synapse，而旧名单写的六仓里有四个端脑根本没有依赖行',
    check(ctx) {
      const findings = [];
      // ⚠️ **从 ctx 读** ⇒ ⇒ 自检才能造出「有人写了手写名单」来验它
      // ⇒ ⇒ 否则这条判据自己**从没有被正控验过** ⇒ ⇒ 恒绿。
      // ⚠️ **名单非空 ⇒ ⇒ 红**（不是「不在发现面里才红」）⇒ ⇒ 因为手写名单
      // ⇒ ⇒ 哪怕此刻**恰好**与发现面一致，也仍然是一份**会过期的**名单。
      const handwritten = ctx.leafRepos || [];
      for (const repo of handwritten) {
        findings.push({
          id: 'N17',
          file: 'LEAF_REPOS',
          why: '手写叶区名单里有「' + repo + '」⇒ ⇒ 叶区面必须按**端脑 Cargo.toml 的 path 依赖**发现 ⇒ ⇒ 手写名单**会过期**（新增叶区漏掉 ⇒ ⇒ 解析层不覆盖 ⇒ ⇒ **假绿**）⇒ ⇒ 请删掉这一条并改成端脑加 path 依赖',
        });
      }
      return findings;
    },
  },
  {
    id: 'N18',
    why: '叶区面**判不了** ⇒ ⇒ 闸不许绿 —— 「没查」不是「没问题」：端脑不在工作区时叶区面是空的 ⇒ ⇒ N10/N11/N12 一条都不判 ⇒ ⇒ ⇒ 闸照样绿 ⇒ ⇒ ⇒ 那是一盏「没查却绿」的灯',
    check(ctx) {
      const findings = [];
      // ⚠️ **从 ctx 读** ⇒ ⇒ 自检才能造出「判不了」来验它 ⇒ ⇒ 否则这条
      // ⇒ ⇒ ⇒ 判据自己**从没有被正控验过** ⇒ ⇒ 恒绿。
      const face = ctx.leafFace || null;
      // ⚠️ **ctx 里没有这个键 ⇒ ⇒ 不判**（自检的其它夹具不传它 ⇒ ⇒ 那些
      // ⇒ ⇒ ⇒ 夹具不该因为「没传叶区面」而全红 ⇒ ⇒ ⇒ 那是夹具的问题，
      // ⇒ ⇒ ⇒ 不是这条判据的问题）。
      if (!face) return findings;
      if (face.ok) return findings;
      findings.push({
        id: 'N18',
        file: '叶区面',
        why: '叶区面**判不了**（' + (face.reason || '原因未记录') + '）⇒ ⇒ N10（声明层）／N11（解析层）／N12（别的推理运行时）**一条都不会判** ⇒ ⇒ ⇒ 闸绿着，可那一格**从没被查过** ⇒ ⇒ ⇒ **判不了 ≠ 没问题** ⇒ ⇒ ⇒ 请把端脑（或它的同源副本）放进工作区',
      });
      return findings;
    },
  },
  {
    id: 'N15',
    why: '脑面地址必须来自**真在监听的那个 listener** —— 常量地址是「猜的」⇒ ⇒ 猜的那个口上坐的可能是**陌生进程**（另一台端脑 / 残留）⇒ ⇒ 海马体的记忆与推理落进**别人的大脑**（界面上看不出异常）',
    check(ctx) {
      const findings = [];
      // ⚠️ **认「谁在递地址」，不认「哪个文件」** ⇒ ⇒ 新增宿主（手机端 / 别的
      // 嵌入形态）自动进面 ⇒ ⇒ 不靠手写名单。
      //
      // ⚠️ **判据的形状**：凡是**把脑面地址递进端脑**的那一行 ⇒ ⇒ 它不许是
      // **常量字面量** ⇒ ⇒ 必须是**算出来的**（从 listener 来的）。
      for (const [file, text] of ctx.code) {
        const code = codeLines(text);
        // ⚠️ 只看**非测试段** —— 测试里写常量地址是**该有的**（那是断言用的
        // 固定值）⇒ ⇒ 把它算进来 ⇒ ⇒ 假红。
        const product = code.split(/\n\s*#\[cfg\(test\)\]/)[0];
        const m = /brain_face_base\s*:\s*Some\s*\(/.exec(product);
        if (m) {
          const arg = balancedArg(product, m.index + m[0].length - 1).trim();
          // ⚠️⚠️ **三档「不是从 listener 算出来的」形状** ⇒ ⇒ 都要红。
          //
          // ⚠️ **为什么不止「字面量」一档**（2026-11-09 实测打脸）：原先只查
          // 「实参含引号」⇒ ⇒ 于是**旧代码的形状** `Some(brain_face_base())`
          // —— 一个**零参调用**、地址是 `format!("http://{DEFAULT_ADDR}/v1")`
          // ⇒ ⇒ **命中 0** ⇒ ⇒ 判据在最可能的回归形状上**漏网** ⇒ ⇒
          // ⇒ ⇒ 「查引号」查的根本不是「地址从哪来」。
          //
          // ❶ **字面量** ⇒ ⇒ 直接把地址写死。
          if (/["']/.test(arg)) {
            findings.push({
              id: 'N15',
              file,
              why: '递进端脑的脑面地址是**常量字面量**（' + arg + '）⇒ ⇒ 那是「猜的」⇒ ⇒ 那个口上坐的可能是**陌生进程**⇒ ⇒ 海马体会把记忆与推理送进**别人的大脑**（界面上看不出异常）⇒ ⇒ 地址必须取自**真在监听的那个 listener**',
            });
          }
          // ❷ **零参调用** ⇒ ⇒ 没有 listener 可传 ⇒ ⇒ 地址只能来自常量。
          else if (/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*\(\s*\)$/.test(arg)) {
            findings.push({
              id: 'N15',
              file,
              why: '递进端脑的脑面地址来自**零参调用**（' + arg + '）⇒ ⇒ 零参 ⇒ ⇒ 没有 listener 可传 ⇒ ⇒ 地址只能来自常量 ⇒ ⇒ 那就是「猜的」⇒ ⇒ 那个口上坐的可能是**陌生进程**⇒ ⇒ 海马体会把记忆与推理送进**别人的大脑**⇒ ⇒ 必须用**带 listener 参数**的那个（brain_face_base_for(bound_addr)）',
            });
          }
          // ❸ **裸标识符**且本文件里定义了它 ⇒ ⇒ 把零参地址函数**当值**递了进去。
          else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg) && new RegExp('fn\\s+' + arg + '\\s*\\(').test(code)) {
            findings.push({
              id: 'N15',
              file,
              why: '递进端脑的脑面地址是**本文件里的零参函数**（' + arg + '）⇒ ⇒ 把它**当值**递进去 ⇒ ⇒ 调用时没有 listener ⇒ ⇒ 地址只能来自常量 ⇒ ⇒ 那就是「猜的」⇒ ⇒ 那个口上坐的可能是**陌生进程**⇒ ⇒ 必须用**带 listener 参数**的那个（brain_face_base_for(bound_addr)）',
            });
          }
          // ⚠️ **带参调用**（f(listener)）这一格**闸抓不到**：参数也可能是常量
          // ⇒ ⇒ 「f(DEFAULT_ADDR)」看着像带参，其实还是猜的 ⇒ ⇒ **那一格
          // 由桌面端单测承重**（端口换 61999 ⇒ 地址必须跟着换 ⇒ ⇒ 常量版
          // 立刻红）⇒ ⇒ 闸与单测**各盯一半**，谁都不许声称自己盯全了。
        }
        // ⚠️⚠️ **端脑那一半**：宿主没递地址 ⇒ ⇒ 端脑**不许自己兜底一个**
        // （那等于「猜的地址」又回来了）⇒ ⇒ 必须是 Option 直通（and_then）
        // ⇒ ⇒ 没有 ⇒ ⇒ 海马体**不指向任何脑面** ⇒ ⇒ 诚实失败。
        //
        // ⚠️ **判的是「消费点」**：`brain_face_base` 后面跟着取用方法
        // （as_deref / as_ref / clone）的那一处 ⇒ ⇒ 从那儿往后看一小段
        // ⇒ ⇒ 出现 unwrap_or / unwrap_or_else / expect ⇒ ⇒ 就是兜底。
        const use = /brain_face_base\s*\.\s*(?:as_deref|as_ref|clone)\s*\(/g;
        let hit;
        while ((hit = use.exec(product)) !== null) {
          const window = product.slice(hit.index, hit.index + 300);
          if (/\.\s*(?:unwrap_or|unwrap_or_else|expect)\s*\(/.test(window)) {
            findings.push({
              id: 'N15',
              file,
              why: '端脑消费 brain_face_base 时**兜底**了一个地址（unwrap_or / unwrap_or_else / expect）⇒ ⇒ 宿主没递地址时端脑会**自己造一个**⇒ ⇒ 那个口上坐的可能是**陌生进程**⇒ ⇒ 「延迟放行」被端脑这一侧破掉⇒ ⇒ 必须是 Option 直通（and_then）⇒ ⇒ 没有 ⇒ ⇒ 海马体不指向任何脑面',
            });
            break;
          }
        }
      }
      return findings;
    },
  },
];

export function evaluate(ctx) {
  const findings = [];
  // ⚠️ **ctx 默认值** ⇒ ⇒ 自检不传那一项时也走得通 ⇒ ⇒ 规则自己判「没有名单」。
  const c = { leafRepos: [], leafFace: null, owners: OWNERS, ownerPackages: OWNER_PACKAGES, ...ctx };
  for (const r of RULES) findings.push(...r.check(c));
  return findings;
}

// ── 夹具：cargo tree 的**真实输出**（生产者 = cargo 自己） ──────────────
//
// ⚠️ 为什么用夹具而不是真跑 cargo：自检必须**快**且**不依赖兄弟仓在位**。
// ⚠️ 为什么夹具必须是「真输出」：ANSI 那个坑只有真 cargo 才造得出来
// ⇒ ⇒ 手抄一份「带颜色的样子」极可能抄错 ⇒ ⇒ 抓真输出最省事。
// ⚠️ 两份夹具的差别**只有颜色** ⇒ ⇒ 剥掉 ANSI 之后必须逐字相同。
const FIXTURE_PLAIN = join(ROOT, 'scripts', 'cargo-tree-features.fixture.txt');
const FIXTURE_COLORED = join(ROOT, 'scripts', 'cargo-tree-features.colored.fixture.txt');
const fixturePlain = () => readFileSync(FIXTURE_PLAIN, 'utf8');
const fixtureColored = () => readFileSync(FIXTURE_COLORED, 'utf8');

// ⚠️ **两份 cargo 的错误输出**（同样是**真输出**，不是手抄）：
//   · 无锁夹具 —— 真 CI 上 temporal / occipital 那两条「未覆盖」的真实 stderr
//     （形状：进度行「Updating crates.io index」在**前**，真正的 error 行在**后**）
//   · 冷缓存夹具 —— 干净 CI runner 上第一次尝试（--offline --locked）的真实 stderr
const FIXTURE_LOCKLESS = join(ROOT, 'scripts', 'cargo-tree-lockless.fixture.txt');
const FIXTURE_OFFLINE_COLD = join(ROOT, 'scripts', 'cargo-tree-offline-cold.fixture.txt');
const fixtureLockless = () => readFileSync(FIXTURE_LOCKLESS, 'utf8');
const fixtureOfflineCold = () => readFileSync(FIXTURE_OFFLINE_COLD, 'utf8');

/** 把 feature 集压成可比对的形状（Map ⇒ 排序后的数组）。 */
const featureDigest = (pkgFeatures) =>
  JSON.stringify([...pkgFeatures].map(([k, v]) => [k, [...v].sort()]));

// ── 自检：每条规则都要能被造出来 ─────────────────────────────────────────

function selfTest() {
  const baseCode = new Map([
    ['prefrontal/src/lib.rs', 'fn main() { println!("ok"); }'],
    [
      'shadow-desktop/src-tauri/src/telencephalon_http.rs',
      // ⚠️ **夹具形状必须与真实数据面同形**（2026-11-09 纪律）——
      // ⇒ ⇒ 桌面端：**只**把脑面**地址**递进 BuildOptions ⇒ ⇒ 钥匙**不进**进程环境。
      'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some(brain_face_base_for(bound_addr)), ..Default::default() };',
    ],
    [
      'shadow-desktop/src-tauri/src/lib.rs',
      'let stack = tauri::async_runtime::block_on(encephalon::Embedded::boot(cfg));',
    ],
    [
      'telencephalon/src/boot.rs',
      // ⚠️ **端脑侧也要同形** —— 端脑在**进程内**把端点递进海马体。
      'let brain = options.brain_face_base.as_deref().and_then(|base| hippocampus_core::multimodal::brain_endpoint(base, &admin_token)); ' +
      'hippocampus_server::build_state_with_timeout_and_config_and_brain(Duration::from_secs(3), host_config, None, brain).await',
    ],
    ['encephalon/src/surface.rs', 'crate::point_lobes_at_neuron(&lobes, &base);'],
  ]);
  const baseManifests = new Map([
    ['prefrontal', '[dependencies]\nhippocampus-core = { path = "../hippocampus/hippocampus-core" }'],
  ]);
  const cases = [
    {
      name: '基线：干净的面 ⇒ 零违规',
      want: 0,
      run: () => evaluate({ code: new Map(baseCode), manifests: new Map(baseManifests) }),
    },
    {
      name: 'N1 正向：消费者自己 run_embedded ⇒ 红',
      id: 'N1',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('prefrontal/src/lib.rs', 'let h = neuron_lib::run_embedded(cfg).await;');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N1 孪生：实现方自己 run_embedded ⇒ 不红',
      want: 0,
      run: () => {
        const code = new Map(baseCode);
        code.set('neuron/src/embedded.rs', 'let h = neuron_lib::run_embedded(cfg).await;');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N1 正向：海马体挂在 local-models 后**也一样红**（那处豁免已收掉）',
      id: 'N1',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('hippocampus/hippocampus-server/src/lib.rs', '#[cfg(feature = "local-models")] let h = neuron_lib::run_embedded(cfg).await;');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N1 反向：海马体那处不挂 feature ⇒ 红',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('hippocampus/hippocampus-server/src/lib.rs', 'let h = neuron_lib::run_embedded(cfg).await;');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N2 正向：产品路径里跑独立 neuron_server ⇒ 红',
      id: 'N2',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('prefrontal/src/lib.rs', 'Command::new("neuron_server").spawn();');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N2 孪生：测试文件里提到 neuron_server ⇒ 不红',
      want: 0,
      run: () => {
        const code = new Map(baseCode);
        code.set('prefrontal/tests/live.rs', 'Command::new("neuron_server").spawn();');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N3 正向：桌面端自己重建 neuron ⇒ 红',
      id: 'N3',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('shadow-desktop/src-tauri/src/telencephalon_http.rs', 'let n = stack.neuron(); let r = neuron::create_router(cfg);');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N3 反向：桌面端不交出内嵌实例 ⇒ 红',
      // ⚠️ **必须按 id 计**（2026-11-08）：这条夹具把桌面的那份文件换成了
      // 「不交出内嵌实例」⇒ ⇒ 它同时也不再满足别的规则 ⇒ ⇒ 若数「总命中数」
      // ⇒ ⇒ 期望值会随规则实现漂移 ⇒ ⇒ ⇒ 只能数**这一条规则**命中几次。
      id: 'N3',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('shadow-desktop/src-tauri/src/telencephalon_http.rs', 'let n = something_else();');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N4 正向：消费者依赖 neuron 时没关默认 feature ⇒ 红',
      id: 'N4',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '[dependencies]\nneuron = { path = "../neuron" }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N10 正向：叶区 manifest 里有 neuron 依赖行 ⇒ 红',
      id: 'N10',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '[dependencies]\nneuron = { path = "../neuron", default-features = false }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N10 孪生：大脑仓（telencephalon）有 neuron 依赖行 ⇒ 不红',
      id: 'N10',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '[dependencies]\nneuron = { path = "../neuron", default-features = false }\n[features]\ncandle = ["neuron/candle"]');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N10 孪生：叶区 manifest 里只是注释提到 neuron ⇒ 不红',
      id: 'N10',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '# 以前是 neuron = { path = "../neuron" }\n[dependencies]\nhippocampus-core = { path = "../hippocampus/hippocampus-core" }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N11 正向：叶区的解析后依赖图里出现 neuron ⇒ 红',
      id: 'N11',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [{ label: 'prefrontal → neuron', ok: true, kind: 'leaf-no-neuron', features: ['candle'], notInGraph: false }],
          artifacts: [],
        }),
    },
    {
      name: 'N11 孪生：叶区的图里没有 neuron ⇒ 不红',
      id: 'N11',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [{ label: 'prefrontal → neuron', ok: true, kind: 'leaf-no-neuron', features: [], notInGraph: true }],
          artifacts: [],
        }),
    },
    {
      name: 'N11 未覆盖：图解析失败 ⇒ 不红（覆盖情况会打印）',
      id: 'N11',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [{ label: 'prefrontal → neuron', ok: false, reason: 'cargo 跑不起来', kind: 'leaf-no-neuron', features: [] }],
          artifacts: [],
        }),
    },
    {
      name: 'N12 正向：叶区 manifest 里有 burn 依赖行 ⇒ 红',
      id: 'N12',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '[dependencies]\nburn = { version = "0.20", default-features = false, features = ["ndarray"] }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N12 正向：叶区 manifest 里有 voxcpm-rs 依赖行 ⇒ 红',
      id: 'N12',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '[dependencies]\nvoxcpm-rs = { version = "0.5", default-features = false, features = ["wgpu"] }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N12 孪生：叶区 manifest 里只是注释提到 burn ⇒ 不红',
      id: 'N12',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '# 以前是 burn = { version = "0.20" }\n[dependencies]\nearshot = "1"');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N12 孪生：大脑仓有 burn 依赖行 ⇒ 不红（只有叶区受约束）',
      id: 'N12',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '[dependencies]\nburn = { version = "0.20" }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N4 孪生：feature 定义行（neuron = []）⇒ 不红',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('prefrontal', '[features]\nneuron = []');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N5 正向：大脑那条链开了 local-models ⇒ 红',
      id: 'N5',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '[features]\nhippocampus = ["dep:hippocampus-server", "hippocampus-server/local-models"]');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N5 正向：local-models 只剩 hippocampus 仓有 ⇒ **也红**（独立托管那形态已删）',
      id: 'N5',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('hippocampus', '[features]\nlocal-models = ["dep:neuron_lib"]');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N5 孪生：manifest 里只是注释提到 local-models ⇒ 不红',
      id: 'N5',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('hippocampus', '# local-models 已删\n[dependencies]\nfoo = "1"');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N13 正向：桌面端 manifest 里有 neuron 依赖行 ⇒ 红',
      id: 'N13',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('shadow-desktop', '[dev-dependencies]\nneuron = { path = "../../../neuron", default-features = false }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N13 正向：workspace **成员** manifest 里有 neuron 依赖行 ⇒ 红（成员也要看）',
      id: 'N13',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('hippocampus/hippocampus-server', '[dependencies]\nneuron_lib = { package = "neuron", path = "../../neuron" }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N13 孪生：大脑仓（telencephalon）有 neuron 依赖行 ⇒ 不红',
      id: 'N13',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '[dependencies]\nneuron = { path = "../neuron", default-features = false }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N13 孪生：消费者 manifest 里只是注释提到 neuron ⇒ 不红',
      id: 'N13',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('hippocampus', '# 我们不要 neuron 了\n[dependencies]\nfoo = "1"');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N14 正向：桌面端没把脑面**地址**递进端脑 ⇒ 红',
      id: 'N14',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'let n = stack.neuron(); let options = BuildOptions { ..Default::default() };',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N14 正向：端脑没在**进程内**递给海马体 ⇒ 红（地址递了也没人接）',
      id: 'N14',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'telencephalon/src/boot.rs',
          'let brain = options.brain_face_base.as_deref().and_then(|base| hippocampus_core::multimodal::brain_endpoint(base, &admin_token));',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N14 正向：端脑递的端点**不是**用自己那把 admin token ⇒ 红（钥匙来源不明）',
      id: 'N14',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'telencephalon/src/boot.rs',
          'let brain = options.brain_face_base.as_deref().and_then(|base| hippocampus_core::multimodal::brain_endpoint(base, &from_env)); ' +
          'hippocampus_server::build_state_with_timeout_and_config_and_brain(Duration::from_secs(3), host_config, None, brain).await',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N14 正向：桌面端把脑面**钥匙**写进进程环境 ⇒ 红',
      id: 'N14',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some(brain_face_base()), ..Default::default() }; std::env::set_var("HIPPOCAMPUS_BRAIN_TOKEN", &token);',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N14 正向：只是注释里写了那个字段名 ⇒ 红（认形状不认关键词）',
      id: 'N14',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          '// let options = BuildOptions { brain_face_base: Some(brain_face_base()), ..Default::default() };',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N14 孪生：地址递了 ＋ 端脑进程内接住（钥匙用自己那把）⇒ 不红',
      id: 'N14',
      want: 0,
      run: () => evaluate({ code: new Map(baseCode), manifests: new Map(baseManifests) }),
    },
    {
      name: 'N15 正向：递进端脑的脑面地址是**常量字面量** ⇒ 红（那是猜的地址）',
      id: 'N15',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some("http://127.0.0.1:60080/v1".to_string()), ..Default::default() };',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N15 正向：递进去的地址来自**零参调用**（旧代码的形状）⇒ 红',
      id: 'N15',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'pub fn brain_face_base() -> String { format!("http://127.0.0.1:60080/v1") }\n' +
          'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some(brain_face_base()), ..Default::default() };',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N15 正向：递进去的地址是**本文件的零参函数当值** ⇒ 红',
      id: 'N15',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'pub fn brain_face_base() -> String { format!("http://127.0.0.1:60080/v1") }\n' +
          'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some(brain_face_base), ..Default::default() };',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N15 孪生：地址是**配置里的变量**（不是本文件的函数）⇒ 不红',
      id: 'N15',
      want: 0,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some(configured_base), ..Default::default() };',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N15 正向：端脑消费 brain_face_base 时**兜底**了一个地址 ⇒ 红',
      id: 'N15',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'telencephalon/src/boot.rs',
          'let brain = options.brain_face_base.clone().unwrap_or_else(|| "http://127.0.0.1:60080/v1".to_string()); ' +
          'hippocampus_server::build_state_with_timeout_and_config_and_brain(Duration::from_secs(3), host_config, None, brain).await',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N15 孪生：地址来自 listener ＋ 端脑 Option 直通 ⇒ 不红',
      id: 'N15',
      want: 0,
      run: () => evaluate({ code: new Map(baseCode), manifests: new Map(baseManifests) }),
    },
    {
      name: 'N15 孪生：常量地址只出现在**测试段** ⇒ 不红（夹具里写固定值是该有的）',
      id: 'N15',
      want: 0,
      run: () => {
        const code = new Map(baseCode);
        code.set(
          'shadow-desktop/src-tauri/src/telencephalon_http.rs',
          'let n = stack.neuron(); let options = BuildOptions { brain_face_base: Some(brain_face_base_for(bound_addr)), ..Default::default() };\n#[cfg(test)]\nmod tests {\n  let x = BuildOptions { brain_face_base: Some("http://127.0.0.1:60080/v1".to_string()), ..Default::default() };\n}',
        );
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: '成员清单解析：workspace 的 members 被读出来（成员 manifest 也要判）',
      want: 0,
      run: () => {
        const members = workspaceMembers('[workspace]\nmembers = ["a", "b"]\n');
        return members.length === 2 && members[0] === 'a' && members[1] === 'b'
          ? []
          : [{ id: 'PARSE', file: 'workspaceMembers', why: '成员清单没解析出来 ⇒ ⇒ 成员 manifest 里的 neuron 依赖边看不见 ⇒ ⇒ 假绿' }];
      },
    },
    {
      name: 'N16 正向：持有方名单里出现「目录名 ≠ crate 名」的条目 ⇒ 红（按名字的豁免会漏）',
      id: 'N16',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          // ⚠️ 造一个「按名字」的持有方 ⇒ ⇒ 它的目录名不是任何持有方的 crate 名
          // ⇒ ⇒ 副本一改名就失配 ⇒ ⇒ 必须红。
          owners: new Set(['telencephalon-verify']),
        }),
    },
    {
      name: 'N16 孪生：当前 OWNERS 里**没有**目录名式豁免 ⇒ ⇒ 不红',
      id: 'N16',
      want: 0,
      run: () => evaluate({ code: new Map(baseCode), manifests: new Map(baseManifests) }),
    },
    {
      name: 'N17 正向：有人写了**手写叶区名单** ⇒ ⇒ 红（名单会过期 ⇒ ⇒ 漏 ⇒ ⇒ 假绿）',
      id: 'N17',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          // ⚠️ 造一份手写名单 ⇒ ⇒ 必须红 ⇒ ⇒ 否则这条判据自己恒绿。
          leafRepos: ['prefrontal'],
        }),
    },
    {
      name: 'N17 孪生：**没有**手写名单（叶区面按端脑装载关系发现）⇒ ⇒ 不红',
      id: 'N17',
      want: 0,
      run: () => evaluate({ code: new Map(baseCode), manifests: new Map(baseManifests), leafRepos: [] }),
    },
    {
      name: 'N18 正向：叶区面**判不了**（端脑不在位）⇒ ⇒ 红（判不了 ≠ 没问题）',
      id: 'N18',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          leafRepos: [],
          // ⚠️ 造一个「判不了」的叶区面 ⇒ ⇒ 必须红 ⇒ ⇒ 否则这条判据自己恒绿。
          leafFace: { repos: [], ok: false, reason: '端脑 manifest 读不到', source: '' },
        }),
    },
    {
      name: 'N18 孪生：叶区面判得出来（ok）⇒ ⇒ 不红',
      id: 'N18',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          leafRepos: [],
          leafFace: { repos: ['diencephalon'], ok: true, reason: '', source: 'telencephalon/Cargo.toml' },
        }),
    },
    {
      name: 'N18 孪生：**不传**叶区面 ⇒ ⇒ 不判（那是夹具的问题，不是这条判据的问题）',
      id: 'N18',
      want: 0,
      run: () => evaluate({ code: new Map(baseCode), manifests: new Map(baseManifests) }),
    },
    {
      name: '退出码三档：闸的源码里必须有**字面 exit(2)**（纪律 D5 —— 判不了与真有问题要分得开）',
      want: 0,
      run: () => {
        // ⚠️ **认源码形状** ⇒ ⇒ 「退出码 2 真的接得上吗」这件事必须能被看见。
        const src = readFileSync(new URL(import.meta.url), 'utf8');
        const problems = [];
        if (!/process\.exit\(2\)/.test(src)) {
          problems.push({ id: 'EXIT', file: 'main', why: '闸里没有字面的 process.exit(2) ⇒ ⇒ 「判不了」与「真有问题」分不开' });
        }
        // ⚠️ **判不了那一档必须由 N18 驱动** ⇒ ⇒ 否则 exit(2) 是个摆设。
        if (!/const cannotJudge = findings\.filter/.test(src)) {
          problems.push({ id: 'EXIT', file: 'main', why: '退出码 2 没有由「判不了」的 findings 驱动 ⇒ ⇒ 那个分支到不了' });
        }
        return problems;
      },
    },
    {
      name: '互证基准的身份筛：**上游仓名 == 持有方 crate 名**（否则冒充者自己就成了基准）',
      want: 0,
      run: () => {
        // ⚠️ 夹具要**同形**：上游地址里那个仓名要与 crate 名同名才算基准。
        const up = new Map([
          ['telencephalon-verify', 'github.com/ibloc/telencephalon'],
          ['telencephalon-impostor', 'github.com/ibloc/prefrontal'],
        ]);
        const cInfo = new Map([
          ['telencephalon', { upstream: 'github.com/ibloc/telencephalon', manifest: null }],
        ]);
        const manifest = '[package]\nname = "telencephalon"';
        const real = ownerEvidenceOf('telencephalon-verify', manifest, OWNERS, OWNER_PACKAGES, up, cInfo);
        const fake = ownerEvidenceOf('telencephalon-impostor', manifest, OWNERS, OWNER_PACKAGES, up, cInfo);
        const problems = [];
        if (!real.owner || real.evidence !== 'same-upstream') {
          problems.push({ id: 'BASE', file: 'ownerEvidenceOf', why: '真副本没被认成同源：' + JSON.stringify(real) });
        }
        if (fake.owner) {
          problems.push({ id: 'BASE', file: 'ownerEvidenceOf', why: '上游不同的冒充者竟被认成持有方：' + JSON.stringify(fake) });
        }
        return problems;
      },
    },
    {
      name: '叶区面发现：端脑 Cargo.toml 的 path 依赖 ⇒ ⇒ 那几个仓自动进面（不靠手写名单）',
      want: 0,
      run: () => {
        // ⚠️ 夹具用**真实端脑 manifest 的形状** ⇒ ⇒ 判据对着被测物。
        const brain = [
          '[dependencies]',
          'synapse = { path = "../synapse", features = ["ziti"] }',
          'prefrontal = { package = "prefrontal-core", path = "../prefrontal", default-features = false }',
          'neuron = { path = "../neuron", default-features = false }',
          'hippocampus-core = { path = "../hippocampus/hippocampus-core" }',
          'diencephalon = { path = "../diencephalon", default-features = false }',
          'tokio = { version = "1", features = ["full"] }',
        ].join('\n');
        const face = lobeReposLoadedBy(brain);
        const want = ['diencephalon', 'hippocampus', 'prefrontal', 'synapse'];
        const missing = want.filter((r) => !face.includes(r));
        const leaked = face.filter((r) => r === 'neuron');
        const problems = [];
        if (missing.length) {
          problems.push({ id: 'LEAF', file: 'lobeReposLoadedBy', why: '端脑真装上的仓没进叶区面：' + missing.join('、') });
        }
        if (leaked.length) {
          problems.push({ id: 'LEAF', file: 'lobeReposLoadedBy', why: '实现方 neuron 混进叶区面 ⇒ ⇒ 会假红' });
        }
        return problems;
      },
    },
    {
      name: '叶区面发现：**反向孪生** —— 没被端脑装载的仓（temporal/occipital/parietal/amygdala）⇒ ⇒ 不进面',
      want: 0,
      run: () => {
        const brain = [
          '[dependencies]',
          'prefrontal = { package = "prefrontal-core", path = "../prefrontal" }',
          'diencephalon = { path = "../diencephalon" }',
        ].join('\n');
        const face = lobeReposLoadedBy(brain);
        const leaked = face.filter((r) => ['temporal', 'occipital', 'parietal', 'amygdala'].includes(r));
        return leaked.length
          ? [{ id: 'LEAF', file: 'lobeReposLoadedBy', why: '没被端脑装载的仓混进叶区面：' + leaked.join('、') }]
          : [];
      },
    },
    {
      name: '持有方判定：**端脑的副本**（crate 名相同、目录名不同）⇒ ⇒ 豁免（误指控没了）',
      want: 0,
      run: () => {
        // ⚠️ 夹具要**同形**：端脑的 manifest 里 package 名就是 telencephalon。
        const manifests = new Map();
        manifests.set(
          'wt-tel-verify',
          '[package]\nname = "telencephalon"\nversion = "0.3.0"\n[dependencies]\nneuron = { path = "../neuron", default-features = false }'
        );
        const ok = isOwnerRepo('wt-tel-verify', manifests.get('wt-tel-verify'));
        return ok
          ? []
          : [{ id: 'OWNER', file: 'isOwnerRepo', why: '端脑的副本（crate 名相同、目录名随机）没被认成持有方 ⇒ ⇒ N13 会误指控它' }];
      },
    },
    {
      name: '持有方判定：**crate 名不同的仓** ⇒ ⇒ 不豁免（孪生：豁免只认身份，不认目录）',
      want: 0,
      run: () => {
        const manifests = new Map();
        manifests.set('prefrontal-copy', '[package]\nname = "prefrontal-core"\n[dependencies]\nneuron = { path = "../neuron" }');
        const ok = !isOwnerRepo('prefrontal-copy', manifests.get('prefrontal-copy'));
        return ok
          ? []
          : [{ id: 'OWNER', file: 'isOwnerRepo', why: '一个 crate 名不同的仓被豁免了 ⇒ ⇒ 豁免放走东西了' }];
      },
    },
    {
      name: '持有方判定：**crate 名相同 ⇒ ⇒ 不可能各自独立**（安全方向：豁免没放走东西）',
      want: 0,
      run: () => {
        // ⚠️ 一个仓想骗过闸 ⇒ ⇒ 把 crate 名改成 telencephalon ⇒ ⇒ 那它就
        // **与端脑同名** ⇒ ⇒ cargo 层面它**就是**端脑 ⇒ ⇒ 豁免没放走东西。
        const manifests = new Map();
        manifests.set('impostor', '[package]\nname = "telencephalon"\n[dependencies]\nneuron = { path = "../neuron" }');
        const pkg = packageNameOf(manifests.get('impostor'));
        const ok = pkg === 'telencephalon' && isOwnerRepo('impostor', manifests.get('impostor'));
        return ok
          ? []
          : [{ id: 'OWNER', file: 'isOwnerRepo', why: 'crate 名判据没按预期工作' }];
      },
    },
    {
      name: 'N13 正向：**端脑副本**的 neuron 依赖边 ⇒ ⇒ 不红（误指控没了）',
      id: 'N13',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set(
          'wt-tel-verify',
          '[package]\nname = "telencephalon"\n[dependencies]\nneuron = { path = "../neuron" }'
        );
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N13 正向：**crate 名不同的仓**里那条 neuron 边 ⇒ ⇒ 照红（孪生）',
      id: 'N13',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set(
          'prefrontal-copy',
          '[package]\nname = "prefrontal-core"\n[dependencies]\nneuron = { path = "../neuron" }'
        );
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: '发现面：新仓自动算消费者（分类只豁免持有方）',
      want: 0,
      run: () => {
        const r = classifyRepos(['neuron', 'telencephalon', 'hippocampus', 'brand-new-repo']);
        const ok =
          r.owners.includes('neuron') &&
          !r.owners.includes('brand-new-repo') &&
          r.consumers.includes('brand-new-repo') &&
          r.consumers.includes('hippocampus');
        return ok
          ? []
          : [{ id: 'DISCOVER', file: 'classifyRepos', why: '新仓没被算成消费者 ⇒ ⇒ 「手写名单漏判」那个洞又回来了' }];
      },
    },
    {
      name: '发现面：清单里**新出现**的目录（有 manifest）⇒ ⇒ 自动进面；无 manifest / 隐藏目录 / 本仓自己都不算',
      want: 0,
      run: () => {
        const r = reposFromListing(
          [
            { name: 'shadow', hasManifest: false },
            { name: 'neuron', hasManifest: true },
            { name: 'brand-new-repo', hasManifest: true },
            { name: 'not-a-repo', hasManifest: false },
            { name: '.hidden', hasManifest: true },
          ],
          'shadow',
        );
        const ok =
          r.includes('brand-new-repo') &&
          !r.includes('not-a-repo') &&
          !r.includes('.hidden') &&
          !r.includes('shadow');
        return ok
          ? []
          : [{ id: 'DISCOVER', file: 'reposFromListing', why: '新目录没进面 ⇒ ⇒ 发现面退化了' }];
      },
    },
    {
      name: '发现面 ≥ 旧手写名单（且多出新仓）—— 名单外的仓也进面',
      want: 0,
      run: () => {
        // ⚠️ 裸克隆里没有兄弟仓 ⇒ ⇒ 判不了 ⇒ ⇒ 不算红（不是「判过且没问题」）。
        if (DISCOVERED.length === 0) return [];
        const OLD_LIST = ['prefrontal', 'diencephalon', 'temporal', 'parietal', 'occipital', 'amygdala', 'hippocampus'];
        const present = (r) => existsSync(join(IBLOC, r)) || existsSync(join(ROOT, r));
        const missed = OLD_LIST.filter((r) => present(r) && !DISCOVERED.includes(r));
        const extra = DISCOVERED.filter((r) => !OLD_LIST.includes(r) && !OWNERS.has(r));
        const ok = missed.length === 0 && extra.length > 0;
        return ok
          ? []
          : [{ id: 'DISCOVER', file: 'discoverRepoNames', why: `发现面漏了旧名单里的仓（${missed.join('/')}）或多出新仓（${extra.join('/')}）⇒ ⇒ 覆盖面退化了` }];
      },
    },
    {
      name: 'N13 正向：名单外的**新仓**里有 neuron 依赖边 ⇒ 红',
      id: 'N13',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('brand-new-repo', '[dependencies]\nneuron = { path = "../neuron" }');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: 'N5 正向：名单外的**新仓**里有 local-models ⇒ 红',
      id: 'N5',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('brand-new-repo', '[features]\nlocal-models = ["dep:neuron"]');
        return evaluate({ code: new Map(baseCode), manifests });
      },
    },
    {
      name: '源码目录：hippocampus 走显式映射（两个成员目录都在面里）',
      want: 0,
      run: () => {
        const dirs = sourceDirsOf('hippocampus');
        return dirs.length === 2 && dirs.includes('hippocampus-core/src') && dirs.includes('hippocampus-server/src')
          ? []
          : [{ id: 'DIRS', file: 'sourceDirsOf', why: 'hippocampus 的源码目录没找对 ⇒ ⇒ 它的代码不在扫描面里' }];
      },
    },
    {
      name: 'N6 反向：大脑面不重指向叶区 ⇒ 红',
      id: 'N6',
      want: 1,
      run: () => {
        const code = new Map(baseCode);
        code.set('encephalon/src/surface.rs', 'fn build() {}');
        return evaluate({ code, manifests: new Map(baseManifests) });
      },
    },
    {
      name: 'N7 正向：脑侧 feature 图里 hippocampus-server 带着 local-models ⇒ 红',
      id: 'N7',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [
            { label: 'shadow-desktop → hippocampus-server', ok: true, kind: 'brain-no-local-models', features: ['default', 'local-models'] },
          ],
          artifacts: [],
        }),
    },
    {
      name: 'N7 孪生：脑侧只有 default ⇒ 不红',
      id: 'N7',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [
            { label: 'shadow-desktop → hippocampus-server', ok: true, kind: 'brain-no-local-models', features: ['default'] },
          ],
          artifacts: [],
        }),
    },
    {
      name: 'N7 正向：消费者 feature 图里 neuron 带着 candle ⇒ 红',
      id: 'N7',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [
            { label: 'prefrontal → neuron', ok: true, kind: 'consumer-no-candle', features: ['candle'] },
          ],
          artifacts: [],
        }),
    },
    {
      name: 'N7 孪生：消费者图里 neuron 没有 candle ⇒ 不红',
      id: 'N7',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [
            { label: 'prefrontal → neuron', ok: true, kind: 'consumer-no-candle', features: [] },
          ],
          artifacts: [],
        }),
    },
    {
      name: 'N7 未覆盖：feature 图解析失败 ⇒ 不红（覆盖情况会打印）',
      id: 'N7',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [
            { label: 'prefrontal → neuron', ok: false, reason: 'cargo 跑不起来', kind: 'consumer-no-candle', features: [] },
          ],
          artifacts: [],
        }),
    },
    {
      name: 'N8 正向：叶区产物里带运行时 ⇒ 红',
      id: 'N8',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [],
          artifacts: [{ group: 'g', path: 'lobe.so', role: 'lobe', counts: { run_embedded: 1, CandleLlmRuntime: 2 } }],
        }),
    },
    {
      name: 'N8 正向：同一组两个产物都带运行时 ⇒ 红',
      id: 'N8',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [],
          artifacts: [
            { group: 'g', path: 'brain.so', role: 'brain', counts: { run_embedded: 2, CandleLlmRuntime: 6 } },
            { group: 'g', path: 'other.so', role: 'other', counts: { run_embedded: 1, CandleLlmRuntime: 1 } },
          ],
        }),
    },
    {
      name: 'N8 孪生：一组里只有一个带运行时 ⇒ 不红',
      id: 'N8',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [],
          artifacts: [
            { group: 'g', path: 'brain.so', role: 'brain', counts: { run_embedded: 2, CandleLlmRuntime: 6 } },
            { group: 'g', path: 'lobe.so', role: 'lobe', counts: { run_embedded: 0, CandleLlmRuntime: 0 } },
          ],
        }),
    },
    {
      name: 'N9 正向：脑侧 neuron 没有 candle ⇒ 红',
      id: 'N9',
      want: 1,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [{ label: 'shadow-desktop → neuron', ok: true, kind: 'brain-candle', features: [] }],
          artifacts: [],
        }),
    },
    {
      name: 'N9 孪生：脑侧 neuron 带着 candle ⇒ 不红',
      id: 'N9',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [{ label: 'shadow-desktop → neuron', ok: true, kind: 'brain-candle', features: ['candle'] }],
          artifacts: [],
        }),
    },
    {
      name: 'N9 正向：端脑的 feature 不转发 neuron/candle ⇒ 红',
      id: 'N9',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '[features]\ncandle = ["flow"]');
        return evaluate({ code: new Map(baseCode), manifests, featureGraph: [], artifacts: [] });
      },
    },
    {
      name: 'N9 正向：转发只写在注释里 ⇒ 红（认形状不认关键词）',
      id: 'N9',
      want: 1,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '# 以前是 candle = ["neuron/candle"]\n[features]\ncandle = ["flow"]');
        return evaluate({ code: new Map(baseCode), manifests, featureGraph: [], artifacts: [] });
      },
    },
    {
      name: 'N9 孪生：端脑转发 neuron/candle ⇒ 不红',
      id: 'N9',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('telencephalon', '[features]\ncandle = ["neuron/candle"]');
        return evaluate({ code: new Map(baseCode), manifests, featureGraph: [], artifacts: [] });
      },
    },
    {
      // 机制自检（不是规则）：临时允许 cargo 更新锁 ⇒ ⇒ 跑完必须**逐字节还原**
      // ⇒ ⇒ 否则这道闸自己就把工作树改了 ⇒ ⇒ 那它比它要防的事更糟。
      name: '机制：临时更新锁之后必须逐字节还原（工作树不被改）',
      id: 'MECH',
      want: 0,
      run: () => {
        const dir = join(ROOT, '.local', 'lock-probe');
        mkdirSync(dir, { recursive: true });
        const lock = join(dir, 'Cargo.lock');
        const original = 'name = "demo"\nversion = "0.1.0"\n';
        writeFileSync(lock, original, 'utf8');
        withRestoredLock(join(dir, 'Cargo.toml'), () => {
          writeFileSync(lock, 'name = "demo"\nversion = "0.9.9"\n', 'utf8');
        });
        const after = readFileSync(lock, 'utf8');
        return after === original
          ? []
          : [{ id: 'MECH', file: lock, why: '锁文件没有被逐字节还原 ⇒ ⇒ 闸自己改了工作树' }];
      },
    },
    // ── 解析层（cargo tree 的输出形状） ──────────────────────────────
    // ⚠️ 这一层曾经**零自检覆盖** ⇒ ⇒ 于是「解析器对 ANSI 是瞎的」没人发现
    // ⇒ ⇒ 本机全绿、CI 假红 ＋ 假绿。现在每一层都有孪生。
    {
      name: '解析层孪生：剥掉 ANSI ⇒ 与无色输出逐字相同（颜色只是外观）',
      id: 'PARSE',
      want: 0,
      run: () =>
        stripAnsi(fixtureColored()) === fixturePlain()
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '剥掉 ANSI 之后与无色输出不逐字相同 ⇒ ⇒ 颜色不只改了外观' }],
    },
    {
      name: '解析层孪生：带 ANSI 的输出 ⇒ 判出与无色输出同一个结论',
      id: 'PARSE',
      want: 0,
      run: () =>
        featureDigest(parseFeatureTree(fixtureColored()).pkgFeatures) ===
        featureDigest(parseFeatureTree(fixturePlain()).pkgFeatures)
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '带色与无色输出判出了不同的结论 ⇒ ⇒ 解析器对 ANSI 是瞎的' }],
    },
    {
      name: '解析层孪生：无色夹具里 neuron 确实带着 candle（夹具本身没坏）',
      id: 'PARSE',
      want: 0,
      run: () => {
        const set = parseFeatureTree(fixturePlain()).pkgFeatures.get('neuron');
        return set && set.has('candle')
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '夹具里 neuron 没有 candle ⇒ ⇒ 夹具本身坏了' }];
      },
    },
    {
      name: '解析层孪生：输出形状变了（一个包都没解析出来）⇒ ⇒ 判不了，不许当成「没有 feature」',
      id: 'PARSE',
      want: 0,
      run: () => {
        // 树前缀换掉 ⇒ ⇒ 正则匹配不上 ⇒ ⇒ 但 feature 行还在 ⇒ ⇒ 这就是「形状变了」
        const broken = fixturePlain().replace(/[├└]── /g, '|-- ');
        const r = judgeFeatureParse({ status: 0, stdout: broken, stderr: '', pkg: 'neuron' });
        return r.ok === false
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '啥也没解析出来却报「判得了且没有 feature」⇒ ⇒ 那会变成假红／假绿' }];
      },
    },
    {
      name: '解析层孪生：正常输出 ⇒ 判得了，且 neuron 带着 candle',
      id: 'PARSE',
      want: 0,
      run: () => {
        const r = judgeFeatureParse({ status: 0, stdout: fixturePlain(), stderr: '', pkg: 'neuron' });
        return r.ok && r.features.includes('candle')
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '正常输出却判不出 candle' }];
      },
    },
    {
      name: '解析层孪生：包不在图里 ⇒ ⇒ notInGraph（不是「没有 feature」）',
      id: 'PARSE',
      want: 0,
      run: () => {
        const r = judgeFeatureParse({
          status: 101,
          stdout: '',
          stderr: 'error: package ID specification ' + "'neuron'" + ' did not match any packages',
          pkg: 'neuron',
        });
        return r.ok && r.notInGraph
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '「不在图里」没被认出来' }];
      },
    },
    {
      name: '解析层孪生：cargo 的 stderr 带进度行 ⇒ ⇒ 原因取真正的 error 行',
      id: 'PARSE',
      want: 0,
      run: () => {
        // ⚠️ 真 CI 上那两条「未覆盖」印的就是进度行（「Updating crates.io index」）
        // ⇒ ⇒ 报告里没有一句能让人行动的话 ⇒ ⇒ 「判不了」必须说得清为什么判不了。
        // ⚠️ 夹具 = **真 cargo 的 stderr**（生产者自己，不是手抄）⇒ ⇒ 手抄极可能
        //    把反引号抄成方括号 ⇒ ⇒ 那就变成「测夹具自己」而不是「测真链路」。
        const r = judgeFeatureParse({ status: 101, stdout: '', stderr: fixtureOfflineCold(), pkg: 'neuron' });
        return r.reason.includes('no matching package named')
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '「判不了」的原因不是真正的错误行 ⇒ ⇒ 报告里没一句能行动的话' }];
      },
    },
    {
      name: '解析层孪生：带 ANSI 的 error 行 ⇒ ⇒ 剥掉颜色再取',
      id: 'PARSE',
      want: 0,
      run: () => {
        const stderr =
          '\u001b[1m\u001b[91merror\u001b[0m: failed to load manifest for workspace member [x/.]\n';
        const r = judgeFeatureParse({ status: 101, stdout: '', stderr, pkg: 'neuron' });
        return r.reason.includes('failed to load manifest') && !r.reason.includes('\u001b')
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '带 ANSI 的错误行没被剥色 ⇒ ⇒ 报告里塞满了转义符' }];
      },
    },
    {
      name: '解析层孪生：进度行在前、error 行在后 ⇒ ⇒ 原因取真正的 error 行',
      id: 'PARSE',
      want: 0,
      run: () => {
        // ⚠️ 这就是真 CI 上那两条「未覆盖」的形状：stderr 第一行是进度行
        //    （「Updating crates.io index」）⇒ ⇒ 旧写法取第一行 ⇒ ⇒ 报告里
        //    只有一句「Updating crates.io index」⇒ ⇒ 没有一句能让人行动的话。
        const r = judgeFeatureParse({ status: 101, stdout: '', stderr: fixtureLockless(), pkg: 'neuron' });
        return r.reason.includes('cannot create the lock file') && !r.reason.includes('Updating crates.io index')
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '「判不了」的原因不是真正的错误行 ⇒ ⇒ 报告里没一句能行动的话' }];
      },
    },
    {
      name: '解析层孪生：压根没有锁（cannot create the lock file）⇒ ⇒ 兜底会被触发',
      id: 'PARSE',
      want: 0,
      run: () =>
        isStaleLockError(fixtureLockless())
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '认不出「没有锁 + --locked」⇒ ⇒ 兜底不触发 ⇒ ⇒ 那个仓压根判不了' }],
    },
    {
      name: '解析层孪生：锁过期（cannot update the lock file）⇒ ⇒ 兜底也会被触发',
      id: 'PARSE',
      want: 0,
      run: () =>
        isStaleLockError('error: cannot update the lock file /x/Cargo.lock because --locked was passed to prevent this')
          ? []
          : [{ id: 'PARSE', file: 'cargo tree', why: '认不出「锁过期」⇒ ⇒ 兜底不触发' }],
    },
    {
      name: '解析层孪生：不是锁的问题（缓存冷）⇒ ⇒ 不许触发兜底',
      id: 'PARSE',
      want: 0,
      run: () =>
        // ⚠️ 这里断言的是**否定命题** ⇒ ⇒ 极性要反过来：判成「锁挡住了」才算红
        isStaleLockError(fixtureOfflineCold())
          ? [{ id: 'PARSE', file: 'cargo tree', why: '把「缓存冷」误当成「锁挡住」⇒ ⇒ 会白跑一轮兜底' }]
          : [],
    },
    {
      name: 'N9 孪生：解析层判不了 ⇒ ⇒ 不红（未覆盖会打印）',
      id: 'N9',
      want: 0,
      run: () =>
        evaluate({
          code: new Map(baseCode),
          manifests: new Map(baseManifests),
          featureGraph: [
            {
              label: 'encephalon → neuron',
              ok: false,
              kind: 'brain-candle',
              reason: 'cargo tree 成功，但输出里的 feature 行一个都没解析出来',
            },
          ],
          artifacts: [],
        }),
    },
  ];

  let fails = 0;
  console.log('─'.repeat(72));
  console.log('neuron 归属闸 —— 自检');
  console.log('─'.repeat(72));
  for (const c of cases) {
    // ⚠️ **按规则 id 计数** —— 一条规则命中时别的规则也可能命中
    // （同一个夹具同时违反 N1 与 N3）⇒ ⇒ 若数「总命中数」⇒ ⇒ 自检的期望值
    // 就会随规则实现漂移 ⇒ ⇒ ⇒ 只能数**这一条规则**命中几次。
    const got = c.run().filter((f) => !c.id || f.id === c.id).length;
    const ok = got === c.want;
    if (!ok) fails++;
    console.log(`  ${ok ? '✓' : '✗'} ${c.name}（期望 ${c.want}，实得 ${got}）`);
  }
  console.log('─'.repeat(72));
  if (fails === 0) {
    // ⚠️ 必须印**可数读数**（N/N）⇒ ⇒ 否则治理闸判「读数不可比」（D3 那条债）
    console.log(`✓ 自检：${cases.length}/${cases.length} 条全绿`);
    process.exit(0);
  }
  console.error(`✗ 自检：${fails}/${cases.length} 条红`);
  process.exit(1);
}

// ── 主流程 ──────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const code = collectCode();
  const manifests = collectManifests();
  const skipCargo = process.argv.includes('--no-cargo');
  const featureGraph = skipCargo ? [] : collectFeatureGraph(manifests);
  const artifacts = collectArtifacts();
  // ⚠️ **同源证据进 ctx** ⇒ ⇒ 规则层判「持有方」时看得到上游 ⇒ ⇒ 端脑的
  // ⇒ ⇒ 副本自动豁免（目录名随机）⇒ ⇒ 而**冒充者**（同名但上游不同）⇒ ⇒
  // ⇒ ⇒ 被 N16 判据二点出来。
  const upstreams = getUpstreams();
  const ownerCrateInfo = getOwnerCrateInfo(upstreams);
  const findings = evaluate({ code, manifests, featureGraph, artifacts, upstreams, ownerCrateInfo, leafRepos: LEAF_REPOS, leafFace: getLeafFace() });

  console.log('─'.repeat(72));
  console.log('neuron 归属校验 —— 全局唯一 neuron，由大脑直接管理');
  console.log('─'.repeat(72));
  console.log(`  · 扫代码 ${code.size} 个文件 / 清单 ${manifests.size} 个仓`);
  // ⚠️ **覆盖面必须是读数** ⇒ ⇒ 「没扫到」与「扫到且没问题」长得一模一样
  // ⇒ ⇒ 而那正是假绿最常见的形态。⇒ ⇒ 尤其 CI 上检出的是**子集**（实测
  // ⇒ ⇒ 闸的 job 只检出 7 个兄弟仓，本机有 15 个）⇒ ⇒ 差异必须看得见。
  console.log(`  · 发现仓 ${DISCOVERED.length} 个：${DISCOVERED.join('、') || '（无）'}`);
  // ⚠️⚠️ **覆盖面读数：这一格是被 CI 的检出清单限着的**（2026-11-11 实测打脸）：
  //   归属闸的「发现面」是**工作区里凡是带 manifest 的目录** ⇒ ⇒ 本机有 18 个
  //   ⇒ ⇒ 而 CI 的检出清单（ibloc-siblings）当时只有 10 个 ⇒ ⇒ ⇒ 差的那几个
  //   ⇒ ⇒ ⇒ **在 CI 上压根没被检出** ⇒ ⇒ ⇒ 闸在 CI 上**只发现 10 个仓**
  //   ⇒ ⇒ ⇒ 它们若自己起了 neuron ⇒ ⇒ ⇒ CI **不红** ⇒ ⇒ ⇒ **假绿**。
  //   ⇒ ⇒ ⇒ 所以读数里必须打出「**判了几个**」⇒ ⇒ ⇒ 「没判的那些」才看得见。
  //   ⚠️ **检出清单本身不在本仓里**（它在 .github/actions/ibloc-siblings）⇒ ⇒
  //   ⇒ ⇒ 闸**读不到**它 ⇒ ⇒ ⇒ 这一格只能靠「发现面自己」说话 ⇒ ⇒ ⇒ 而补
  //   ⇒ ⇒ ⇒ 清单那一步是**人的动作** ⇒ ⇒ ⇒ 所以这里**只报数**，不假装能判。
  console.log(`  · 判据面覆盖：发现仓 ${DISCOVERED.length} 个（**CI 上的检出清单决定了这个数** —— 清单少一个 ⇒ ⇒ 那一个仓在 CI 上就没人判 ⇒ ⇒ ⇒ 假绿）`);
  // ⚠️⚠️⚠️ **与 CI 检出清单对账**（2026-11-11 实测打脸后补）：清单文件在**本仓**
  //   ⇒ ⇒ 闸读得到 ⇒ ⇒ ⇒ 所以「清单漏了哪个仓」这件事**可以机械判**。
  //   ⚠️ 清单里的每个仓 ⇒ ⇒ 都是「归属闸在 CI 上会判的仓」⇒ ⇒ ⇒ 而清单漏了
  //   ⇒ ⇒ ⇒ 那个仓在 CI 上**没人判** ⇒ ⇒ ⇒ 假绿。
  //   ⇒ ⇒ **清单与「本机发现面」对不上** ⇒ ⇒ ⇒ 说明清单**落后于**实际仓集
  //   ⇒ ⇒ ⇒ ⇒ 要么补检出（CI 才判得到）⇒ ⇒ ⇒ 要么明确它是「刻意排除」
  //   ⇒ ⇒ ⇒ ⇒ ⇒ 两种都得**显式**，不许默默少一个。
  const listed = listedCheckouts();
  if (!listed.ok) {
    console.log(`  · CI 检出清单：**判不了**（${listed.reason}）⇒ ⇒ 那一格**没有判据承重**`);
  } else {
    console.log(`  · CI 检出清单（ibloc-siblings）：${listed.repos.length} 个 —— ${listed.repos.join('、')}`);
    const missing = listed.repos.filter((r) => !DISCOVERED.includes(r));
    // ⚠️⚠️ **排除项必须按「结构事实」判，不许手写名单**（手写名单必过期 ⇒ ⇒
    // ⇒ ⇒ 那是「名单必错」那一族）：一个仓在 CI 上**检不出来**的**机制性**
    // ⇒ ⇒ ⇒ 原因是「它没有 GitHub 上游」⇒ ⇒ ⇒ `actions/checkout` 只能检
    // ⇒ ⇒ ⇒ GitHub 上的仓 ⇒ ⇒ ⇒ 实测：ibloc-hr-agent **没有任何 remote**
    // ⇒ ⇒ ⇒ （纯本地仓）、ibloc-hr-tools 的上游在 **gitee** ⇒ ⇒ ⇒ 两者都
    // ⇒ ⇒ ⇒ 客观上**检不出来** ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 这一格**不是假绿**（它真的判不了）
    // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 但要**显式说出来**，不许默默少一个。
    const upstreams = getUpstreams();
    // ⚠️⚠️⚠️ **「检不出来」必须读得到上游才成立**（2026-11-11 实测打脸后补）：
    //   第一版写的是「读不到上游 ⇒ ⇒ 排除」⇒ ⇒ ⇒ **实测打脸**：在隔离工作区里
    //   ⇒ ⇒ ⇒ 仓**没有 .git**（我为了快只拷了 Cargo.toml）⇒ ⇒ ⇒ 全部读不到
    //   ⇒ ⇒ ⇒ 上游 ⇒ ⇒ ⇒ 全被判成「客观检不出来」⇒ ⇒ ⇒ **那 4 个真缺口被吞掉**
    //   ⇒ ⇒ ⇒ ⇒ 闸照样绿 ⇒ ⇒ ⇒ **假绿**（而且是我自己造的）。
    //   ⇒ ⇒ ⇒ 正确的排除条件是「**读到了上游、且它不是 GitHub**」⇒ ⇒ ⇒
    //   ⇒ ⇒ ⇒ 「读不到上游」**不许排除** ⇒ ⇒ ⇒ 那一格是「**未知**」⇒ ⇒ ⇒
    //   ⇒ ⇒ ⇒ 必须单列（不是排除，也不是当绿）。
    // ⚠️ **两档「CI 上检不出来」**（都要显式，但**原因不同**）：
    //   ❶ **上游不是 GitHub**（实测：ibloc-hr-tools 在 gitee）⇒ ⇒
    //   ❷ **压根没有上游**（实测：ibloc-hr-agent 是纯本地仓 ⇒ ⇒ 没有任何 remote）
    //   ⇒ ⇒ 两档都是「CI 上客观检不出」⇒ ⇒ ⇒ **那一格未覆盖**，不是「已判无问题」。
    //   ⚠️ 而「上游读得到、且是 GitHub」⇒ ⇒ 那些仓**本该在清单里**⇒ ⇒ ⇒
    //   ⇒ ⇒ ⇒ 不在清单里 ⇒ ⇒ ⇒ 就是**真缺口** ⇒ ⇒ ⇒ 必须报出来。
    const notCheckableOtherHost = DISCOVERED.filter((r) => {
      const up = upstreams.get(r) || '';
      return !!up && !/^github\.com\//i.test(up);
    });
    // ⚠️⚠️ **「压根没有上游」这一档必须看「有没有 .git」**（2026-11-11 实测打脸
    //   后补）：判别法：
    //   · **有 .git 但没有 remote** ⇒ ⇒ **纯本地仓** ⇒ ⇒ CI 客观检不出
    //   ·   （实测：ibloc-hr-agent 是真 git 仓、master 分支、但**没有任何 remote**）
    //   · **没有 .git** ⇒ ⇒ **检出目录不完整**（我为了快只拷了 Cargo.toml）⇒ ⇒
    //   ·   ⇒ ⇒ 那一格是「**未知**」⇒ ⇒ ⇒ **不许排除** ⇒ ⇒ ⇒ 缺口必须报出来
    //   ⇒ ⇒ ⇒ 第一版没分这两档 ⇒ ⇒ ⇒ 结果隔离工作区里那 4 个真缺口**被吞**
    //   ⇒ ⇒ ⇒ ⇒ 闸照样绿 ⇒ ⇒ ⇒ **又是假绿**（我自己造的）。
    const hasGit = (r) => {
      const root = repoRoot(r);
      if (!root) return false;
      return existsSync(join(root, '.git'));
    };
    const noUpstream = DISCOVERED.filter((r) => !upstreams.get(r) && hasGit(r));
    const upstreamUnknown = DISCOVERED.filter((r) => !upstreams.get(r) && !hasGit(r));
    const notCheckable = [...notCheckableOtherHost, ...noUpstream];
    // ⚠️⚠️ **「上游读不到」的仓也必须计入缺口**（2026-11-11 实测打脸后补）：
    //   第一版把 upstreamUnknown 也排除了 ⇒ ⇒ ⇒ 实测打脸：隔离工作区里仓没有
    //   ⇒ ⇒ ⇒ .git ⇒ ⇒ ⇒ 全部「读不到上游」⇒ ⇒ ⇒ 那 4 个真缺口**被吞掉**
    //   ⇒ ⇒ ⇒ ⇒ 闸照样绿 ⇒ ⇒ ⇒ **又是假绿**。
    //   ⇒ ⇒ ⇒ 正确的处置：「读不到上游」**只影响「检不出来」那一档的判定**
    //   ⇒ ⇒ ⇒ ⇒ 它**仍然要计入「本机有但清单里没有」**⇒ ⇒ ⇒ ⇒ 缺口必须报出来
    //   ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 「未知」不是「可以忽略」。
    // ⚠️ **「未知」（无 .git）不排除** ⇒ ⇒ 缺口必须报出来 ⇒ ⇒ 「未知」不是
    // ⇒ ⇒ 「可以忽略」（第一版排除掉 ⇒ ⇒ ⇒ 真缺口被吞 ⇒ ⇒ ⇒ 假绿）。
    const extra = DISCOVERED.filter(
      (r) => !listed.repos.includes(r) && !notCheckable.includes(r) && !/^telencephalon-verify$|^wt-tel-verify$/.test(r)
    );
    if (missing.length) {
      console.log(`      ⚠ 清单里列了但**本机没发现**：${missing.join('、')} ⇒ ⇒ 那一格在本地**没被查过**（不判）`);
    }
    if (extra.length) {
      console.log(`      ⚠ **本机有但清单里没有**：${extra.join('、')} ⇒ ⇒ ⇒ 那些仓在 CI 上**没人判** ⇒ ⇒ ⇒ 假绿风险（要么补检出，要么明确排除）`);
    }
    if (notCheckableOtherHost.length) {
      console.log(`      · CI **客观检不出来**（上游**不是 GitHub** ⇒ ⇒ actions/checkout 无从下手）：${notCheckableOtherHost.join('、')} ⇒ ⇒ **那一格未覆盖**，不是「已判无问题」`);
    }
    if (noUpstream.length) {
      console.log(`      · CI **客观检不出来**（**压根没有上游** ⇒ ⇒ 纯本地仓 ⇒ ⇒ actions/checkout 无从下手）：${noUpstream.join('、')} ⇒ ⇒ **那一格未覆盖**，不是「已判无问题」`);
    }
    if (upstreamUnknown.length) {
      console.log(`      · 上游**读不到且没有 .git**（**未知**，既不算「检不出来」也不算「已判」）：${upstreamUnknown.join('、')}`);
    }
    if (!missing.length && !extra.length) {
      console.log(`      ✅ 清单与发现面**逐个对得上**（${listed.repos.length} 个）`);
    }
  }
  console.log(`  · 消费者 ${CONSUMER_REPOS.length} 个：${CONSUMER_REPOS.map((c) => c.repo).join('、') || '（无）'}`);
  console.log(`  · 持有方（按目录名）：${[...OWNERS].join('、')}（实现方 ＋ 大脑）`);
  // ⚠️⚠️ **身份面必须也是读数** ⇒ ⇒ 「端脑的副本（验证副本 / worktree）
  // 也被豁免」这件事**必须看得见** ⇒ ⇒ 否则「闸没红」会被读成「没人豁免」
  // ⇒ ⇒ 而它其实是**豁免**了 ⇒ ⇒ 「没红」与「豁免了」长得一模一样。
  const byIdentity = DISCOVERED.filter((r) => !OWNERS.has(r) && isOwnerRepo(r, ROOT_MANIFESTS.get(r)));
  console.log(`  · 持有方（按 crate 身份追加）：${byIdentity.join('、') || '（无）'}`);
  for (const o of OWNERS) {
    if (!DISCOVERED.includes(o)) {
      console.log(`      ⚠ 未覆盖 持有方「${o}」不在工作区 ⇒ ⇒ 依赖它的判据（N3/N6/N9）**没生效**（不是「判过且没问题」）`);
    }
  }
  if (DISCOVERED.length === 0) {
    console.log('      ⚠ **一个兄弟仓都没发现** ⇒ ⇒ 这次判定**几乎没覆盖任何仓**（不是「扫过且没问题」）');
  }

  // ⚠️ **覆盖面必须打印出来** ⇒ ⇒ 否则「没扫到」与「扫到且没问题」长得一模一样
  // ⇒ ⇒ 而那正是假绿最常见的形态（上一轮围栏判据就栽在这儿）。
  const fgOk = featureGraph.filter((g) => g.ok);
  const leafFace = getLeafFace();
  console.log(`  · 叶区面（被大脑**实际装载**的兄弟仓，${leafFace.ok ? '发现' : '**判不了**'}）：${leafFace.ok ? (leafFace.repos.join('、') || '（空）') + (leafFace.source ? '  ← 真相来源：' + leafFace.source : '') : leafFace.reason}`);
  console.log(`  · feature 图 ${fgOk.length}/${featureGraph.length} 解析成功${skipCargo ? '（--no-cargo：已跳过）' : ''}`);
  for (const g of featureGraph) {
    if (!g.ok) console.log(`      ⚠ 未覆盖 ${g.label} —— ${g.reason}`);
    else console.log(`      · ${g.label} ⇒ ${g.notInGraph ? '不在图里' : g.features.join('、') || '（无 feature）'}`);
  }
  console.log(`  · 产物 ${artifacts.length} 个（扫运行时字节痕迹）`);
  // ⚠️ **按组报覆盖** ⇒ ⇒ 一组里「没有可扫的产物」必须显式说出来
  // ⇒ ⇒ 否则「没产物可扫」与「扫过且这一组只有一个运行时」长得一样。
  const byGroup = new Map();
  for (const a of artifacts) {
    if (!byGroup.has(a.group)) byGroup.set(a.group, []);
    byGroup.get(a.group).push(a);
  }
  for (const g of ARTIFACT_GROUPS) {
    const list = byGroup.get(g.group) || [];
    const withRt = list.filter((a) => RUNTIME_MARKERS.some((m) => (a.counts || {})[m] > 0));
    console.log(`      · 组 ${g.group}：${list.length} 个产物 / 带运行时 ${withRt.length} 个 —— ${g.desc}`);
    if (list.length === 0) {
      console.log('          ⚠ 这一组没有可扫的产物 ⇒ ⇒ 判定**没生效**（不是「扫过且没问题」）');
    }
    for (const a of list) {
      const marks = RUNTIME_MARKERS.filter((m) => (a.counts || {})[m] > 0).map((m) => m + '×' + a.counts[m]);
      console.log(`          [${a.role}] ${a.path}${marks.length ? '  ← ' + marks.join(' ') : ''}`);
    }
  }

  // ⚠️⚠️ **退出码三档**（纪律 D5：no-cannot-judge-exit）：
  //   · **0** = 判过且没问题
  //   · **1** = 判了且**有真问题**（阻断）
  //   · **2** = **判不了**（源没读全 ⇒ ⇒ 那一格从没被查过 ⇒ ⇒ 不许当成绿）
  //   ⇒ ⇒ 「判不了」与「真有问题」必须**分得开** ⇒ ⇒ ⇒ 否则 CI 上两者长得一样
  //   ⇒ ⇒ ⇒ ⇒ 而「假绿」正是从这一层长出来的。
  const cannotJudge = findings.filter((f) => f.id === 'N18');
  const realProblems = findings.filter((f) => f.id !== 'N18');

  if (findings.length === 0) {
    console.log('  · 消费者不实例化 neuron ｜ 桌面端交出脑内嵌的那一个 ｜ 叶区指向脑面');
    console.log('  · 脑侧 feature 图里没有 local-models ｜ 产物里只有一套运行时');
    console.log('  · 叶区既没有 neuron 依赖行（N10）｜ 解析后的依赖图里也没有 neuron（N11）');
    console.log('  · 消费者没有 neuron 依赖边（N13）｜ 任何仓都没有 local-models（N5）');
    console.log('  · 桌面端把脑面注入给海马体（N14）｜ 叶区指着脑面（N6）');
    console.log('─'.repeat(72));
    console.log('阻断 0 项');
    process.exit(0);
  }

  console.log('─'.repeat(72));
  for (const f of findings) {
    console.log(`  ✗ [${f.id}] ${f.file}`);
    console.log(`      ${f.why}`);
  }
  console.log('─'.repeat(72));
  // ⚠️ **判不了 ⇒ ⇒ 退出码 2**（不是 1）⇒ ⇒ ⇒ 那是「没查」，不是「查了有问题」。
  if (cannotJudge.length && !realProblems.length) {
    console.log(`**判不了** ${cannotJudge.length} 项（源没读全 ⇒ ⇒ 那一格**从没被查过** ⇒ ⇒ 不许当成「已判无问题」）`);
    console.log('─'.repeat(72));
    process.exit(2);
  }
  console.log(`阻断 ${findings.length} 项` + (cannotJudge.length ? `（其中 **判不了** ${cannotJudge.length} 项）` : ''));
  process.exit(1);
}
