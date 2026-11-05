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
 * ② 海马体有**两种形态**：独立托管（自己嵌一个 neuron）与脑侧托管
 *    （走大脑那张面）⇒ ⇒ 后者绝不能开前者的那个 feature
 *    ⇒ ⇒ 本闸用 N1 + N5 两条一起钉住这个组合。
 *
 * # 规则
 *
 *   N1 消费者不得实例化 neuron 的 运行时（run_embedded / CandleLlmRuntime /
 *      neuron::create_router）—— 实现方与大脑除外。
 *   N2 独立 neuron 的 可执行文件（neuron_server）只许出现在 neuron 仓的
 *      examples / tests / benches 与各仓的测试文件里。
 *   N3 桌面端必须把**脑内嵌的那一个** neuron 交给面（不许自己重建）。
 *   N4 消费者对 neuron 的依赖必须 `default-features = false` ——
 *      不许靠默认 feature 偷偷把 candle 拉进来。
 *   N5 `local-models`（海马体自己嵌 neuron 的那个 feature）只许存在于
 *      hippocampus 仓 ⇒ ⇒ ⇒ 大脑那条链永远开不到它。
 *   N6 叶区必须被指向**脑面自己**（router-only 形态）—— 否则叶区会去打
 *      一个「自己的」neuron。
 *
 * 用法：node scripts/check-neuron-ownership.mjs
 *       node scripts/check-neuron-ownership.mjs --self-test
 * 退出码 0 = 通过；1 = 有阻断问题。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

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

/** 可以持有 / 实例化 neuron 的仓 —— 实现方 ＋ 大脑。 */
const OWNERS = new Set(['neuron', 'telencephalon', 'encephalon']);

/**
 * **消费者** —— 与大脑同进程跑的那些仓。
 *
 * ⚠️ hippocampus **不在**这个名单里：它有两种形态 ——
 * ① 独立托管（没有大脑在场）⇒ ⇒ 那侧**允许**自己嵌一个 neuron；
 * ② 脑侧托管（桌面端 / 大脑进程内）⇒ ⇒ 那侧**绝不能**开 ① 的 feature。
 * ⇒ ⇒ ① 由 N1 的「必须挂在 local-models feature 后面」限定，
 * ⇒ ⇒ ② 由 N5（没人能在大脑那条链上开 local-models）保证。
 */
const CONSUMER_REPOS = [
  { repo: 'prefrontal', dirs: ['src'] },
  { repo: 'diencephalon', dirs: ['src'] },
  { repo: 'temporal', dirs: ['src'] },
  { repo: 'parietal', dirs: ['src'] },
  { repo: 'occipital', dirs: ['src'] },
  { repo: 'amygdala', dirs: ['src'] },
  { repo: 'hippocampus', dirs: ['hippocampus-core/src', 'hippocampus-server/src'] },
];

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

/** 收集要判的代码（键 = 仓内相对路径，跨仓统一以仓名开头）。 */
function collectCode() {
  const code = new Map();
  for (const { repo, dirs } of [...CONSUMER_REPOS, ...OWNER_SCAN]) {
    const root = join(IBLOC, repo);
    if (!existsSync(root)) continue;
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

/** 收集各仓的 Cargo.toml（键 = 仓名）。 */
function collectManifests() {
  const manifests = new Map();
  const repos = [...CONSUMER_REPOS, ...OWNER_SCAN].map((r) => r.repo);
  for (const repo of repos) {
    const p = join(IBLOC, repo, 'Cargo.toml');
    if (existsSync(p)) manifests.set(repo, readFileSync(p, 'utf8'));
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
        if (OWNERS.has(repo)) continue;
        if (isNonProductFile(file)) continue;
        for (const b of BANNED) {
          if (!b.re.test(text)) continue;
          // hippocampus 的**独立托管**形态：必须挂在 local-models feature 后面
          // ⇒ ⇒ 而「脑侧托管」那侧开不到它（N5）⇒ ⇒ ⇒ 组合起来唯一。
          if (repo === 'hippocampus' && text.includes('local-models')) continue;
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
        if (OWNERS.has(repo)) continue;
        for (const line of manifestCode(raw).split('\n')) {
          const m = line.trim().match(/^(neuron|neuron_lib)\s*=\s*\{(.*)$/);
          if (!m) continue;
          if (!/default-features\s*=\s*false/.test(m[2])) {
            findings.push({
              id: 'N4',
              file: repo + '/Cargo.toml',
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
    why: 'local-models（海马体自己嵌 neuron 的 feature）只许存在于 hippocampus 仓 —— 大脑那条链永远开不到它',
    check(ctx) {
      const findings = [];
      for (const [repo, raw] of ctx.manifests) {
        if (repo === 'hippocampus') continue;
        if (/local-models/.test(manifestCode(raw))) {
          findings.push({
            id: 'N5',
            file: repo + '/Cargo.toml',
            why: '大脑那条链不许开 local-models ⇒ ⇒ 同进程里就只能有一个 neuron',
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
];

export function evaluate(ctx) {
  const findings = [];
  for (const r of RULES) findings.push(...r.check(ctx));
  return findings;
}

// ── 自检：每条规则都要能被造出来 ─────────────────────────────────────────

function selfTest() {
  const baseCode = new Map([
    ['prefrontal/src/lib.rs', 'fn main() { println!("ok"); }'],
    ['shadow-desktop/src-tauri/src/telencephalon_http.rs', 'let n = stack.neuron();'],
    ['encephalon/src/surface.rs', 'crate::point_lobes_at_neuron(&lobes, &base);'],
  ]);
  const baseManifests = new Map([
    ['prefrontal', '[dependencies]\nneuron = { path = "../neuron", default-features = false }'],
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
      name: 'N1 孪生：海马体独立托管形态（挂在 local-models 后）⇒ 不红',
      want: 0,
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
      name: 'N5 孪生：local-models 只在 hippocampus 仓 ⇒ 不红',
      want: 0,
      run: () => {
        const manifests = new Map(baseManifests);
        manifests.set('hippocampus', '[features]\nlocal-models = ["dep:neuron_lib"]');
        return evaluate({ code: new Map(baseCode), manifests });
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
    console.log(`✓ 自检全绿（${cases.length} 条）`);
    process.exit(0);
  }
  console.error(`✗ 自检 ${fails} / ${cases.length} 条红`);
  process.exit(1);
}

// ── 主流程 ──────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const code = collectCode();
  const manifests = collectManifests();
  const findings = evaluate({ code, manifests });

  console.log('─'.repeat(72));
  console.log('neuron 归属校验 —— 全局唯一 neuron，由大脑直接管理');
  console.log('─'.repeat(72));
  console.log(`  · 扫代码 ${code.size} 个文件 / 清单 ${manifests.size} 个仓`);
  console.log(`  · 持有方：${[...OWNERS].join('、')}（实现方 ＋ 大脑）`);

  if (findings.length === 0) {
    console.log('  · 消费者不实例化 neuron ｜ 桌面端交出脑内嵌的那一个 ｜ 叶区指向脑面');
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
  console.log(`阻断 ${findings.length} 项`);
  process.exit(1);
}
