#!/usr/bin/env node
/**
 * CORS 白名单静态闸 —— 抓「谁都能读这台大脑」
 *
 * ## 为什么要有这个闸
 *
 * 2026-11-01 之前，端脑面（桌面 sidecar 的 `build_full_app`、独立端脑服务器的
 * `a2a_server.rs`）挂的是 `CorsLayer::permissive()` ⇒ `allow_origin(Any)`
 * ⇒ ⇒ **浏览器里任意一个网站**都能跨域 `fetch` 这台大脑**并且读到响应**
 * ⇒ ⇒ 而它跑在**用户的机器上**（`127.0.0.1:60080`）。
 *
 * ⇒ 2026-10-31 那笔把 `/models/providers` 的明文 LLM key 换成掩码
 * （关掉了「响应体泄密」那一半）⇒ 但「浏览器能读」那一半还开着
 * ⇒ ⇒ 其它读接口（会话 / agent 清单 / 任务 / trace / logs）仍然是敞着的。
 *
 * ⇒ 修法是**白名单**（`telencephalon/src/api/cors.rs`）⇒ ⇒ 这道闸守着
 * **那个白名单不许被改回 permissive，也不许「定义了却没挂上」**。
 *
 * ## 闸门抓什么
 *
 * - **A**：代码里出现 `CorsLayer::permissive()` ⇒ 那就是那个洞本身。
 * - **B**：`allow_origin(` 的实参是 `Any` / `AllowOrigin::any()`
 *   ⇒ 同一个洞的另一种写法。
 * - **C**：**白名单定义了却没挂上** —— 两处**最外层**的 CORS 层必须是
 *   白名单层（`cors_layer(`）：
 *   * `telencephalon/src/api/mod.rs`（桌面 sidecar 走的那张面）
 *   * `encephalon/src/a2a_server.rs`（独立端脑服务器）
 *
 *   ⚠️ **C 这一条是承 ㋉ 条那条教训**（「门定义了却没挂上」）：
 *   ⚠️ **最外层那一层才是闸** ⇒ ⇒ 内层留着 permissive 也不影响
 *   ⇒ ⇒ 但只要**最外层**不是白名单 ⇒ ⇒ 整张面重新敞开。
 *
 * ## 防假绿（这条最重要）
 *
 * - **一个文件都没读到 ⇒ 退出码 2，不是 0**（路径写错 / 仓库挪了家）。
 * - **判据源（C 的两个文件）读不到 ⇒ 退出码 2** —— 「不知道」绝不能被
 *   说成「没问题」。
 * - **探测器自己**先跑一遍 `--self-test` ⇒ 探测器坏了 ⇒ 退出码 2。
 *
 * ## 逃生阀
 *
 * 同一行（或上一行）写 `cors-allowlist: <理由>` ⇒ 放行。
 * ⚠️ 逃生阀是逃生阀，不是「修好了」的证明 ⇒ 理由要留在源码里。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-cors-allowlist.mjs
 * node scripts/check-cors-allowlist.mjs --json
 * node scripts/check-cors-allowlist.mjs --self-test
 * ```
 *
 * 退出码：0 = 没有 permissive CORS；1 = 抓到了（每条带 file:line）；2 = 闸门自己坏了。
 *
 * ⚠️ **范围**：只扫**端脑面**这条线上的三个仓（端脑 / 大脑 / 桌面端 sidecar）。
 * ⚠️ **neuron 自己那个独立服务器**（`neuron/src/server/mod.rs` 的
 * `create_router`）**仍是 permissive**（照 ollama 的做法）⇒ ⇒ 那是
 * **另一个产品**（neuron 单跑）的设计 ⇒ ⇒ 不归这道闸 ⇒ ⇒ 别把它
 * 悄悄算进这一笔。
 */

import { sibling } from './lib/sibling-repo.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, makeLineIndex } from './lib/strip-comments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(
    [
      '用法: node scripts/check-cors-allowlist.mjs [选项]',
      '',
      '  --source <dir>   端脑仓根目录（默认 <repo>/../telencephalon）',
      '  --brain <dir>    大脑仓根目录（默认 <repo>/../encephalon）',
      '  --desktop <dir>  桌面端仓根目录（默认 <repo>/shadow-desktop）',
      '  --json           输出 JSON',
      '  --self-test      只跑探测器自检',
      '  -h, --help       这段话',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const opts = {
    source: sibling(REPO, 'telencephalon'),
    brain: sibling(REPO, 'encephalon'),
    desktop: join(REPO, 'shadow-desktop'),
    json: false,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--source':
        opts.source = resolve(argv[++i]);
        break;
      case '--brain':
        opts.brain = resolve(argv[++i]);
        break;
      case '--desktop':
        opts.desktop = resolve(argv[++i]);
        break;
      case '--json':
        opts.json = true;
        break;
      case '--self-test':
        opts.selfTest = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`不认识的参数: ${a}`);
        printHelp();
        process.exit(2);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 探测器
// ---------------------------------------------------------------------------

/** 逃生阀标记（同一行或上一行）。 */
const MARKER = 'cors-allowlist:';

/**
 * 规则 A / B —— 「洞」的两种写法。
 *
 * ⚠️ 只在**代码**里判（注释已剥）⇒ ⇒ 文档里写一遍「原来是 permissive()」
 * 不会被当成洞（承 ㋉ 条那条纪律的同款：判定表闸扫的是原始文本，
 * 注释里也别写那个形状）。
 */
const HOLE_PATTERNS = [
  {
    id: 'A',
    re: /CorsLayer\s*::\s*permissive\s*\(/g,
    what: 'CorsLayer::permissive()（allow_origin(Any) ⇒ 浏览器里任意网站都能读这台大脑）',
  },
  {
    id: 'B',
    re: /\.\s*allow_origin\s*\(\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*::\s*)*?(?:Any|AllowOrigin\s*::\s*any\s*\(\s*\))/g,
    what: 'allow_origin(Any) / allow_origin(AllowOrigin::any())（同一个洞的另一种写法）',
  },
];

/**
 * 在一段**代码**里找「CORS 的洞」。
 *
 * @param {string} code 已剥注释的代码
 * @param {(off:number)=>number} lineOf 行号换算
 * @param {string[]} origLines 原文件行数组（读逃生阀标记）
 */
function findCorsHoles(code, lineOf, origLines) {
  const hits = [];
  for (const p of HOLE_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = p.re.exec(code)) !== null) {
      if (++guard > 1000) break;
      const line = lineOf(m.index);
      const orig = origLines[line - 1] ?? '';
      const prev = origLines[line - 2] ?? '';
      if (orig.includes(MARKER) || prev.includes(MARKER)) continue;
      hits.push({
        rule: p.id,
        what: p.what,
        line,
        text: orig.trim().slice(0, 160),
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 规则 C ——「白名单定义了却没挂上」
// ---------------------------------------------------------------------------

/**
 * 两处**最外层**的 CORS 层必须是白名单层。
 *
 * ⚠️ 为什么是「最外层」：tower-http 写响应头用的是 `extend`（后写的赢）
 * ⇒ ⇒ 外层最后写 ⇒ ⇒ **外层才是闸** ⇒ ⇒ 内层就算留着 permissive
 * 也不影响 ⇒ ⇒ 但外层一旦不是白名单 ⇒ ⇒ 整张面重新敞开。
 */
const WIRING_TARGETS = [
  {
    label: 'telencephalon',
    file: 'src/api/mod.rs',
    need: 'cors_layer(',
    why: '桌面 sidecar 走的那张面（build_full_app）',
  },
  {
    label: 'encephalon',
    file: 'src/a2a_server.rs',
    need: 'cors_layer(',
    why: '独立端脑服务器（整张面最外层那一层）',
  },
];

// ---------------------------------------------------------------------------
// 扫盘
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  'out',
  '.dart_tool',
  '.verify-wt',
  'Pods',
  'DerivedData',
  '__pycache__',
]);

function isSkippedDir(name) {
  return SKIP_DIRS.has(name) || name === 'target' || name.startsWith('target-');
}

function walkRust(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (isSkippedDir(e.name)) continue;
        stack.push(p);
      } else if (e.isFile() && p.endsWith('.rs')) {
        out.push(p);
      }
    }
  }
  return out;
}

function scanFile(absPath, label, displayRoot) {
  let raw;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch {
    return { scanned: 0, hits: [] };
  }
  const code = stripComments(raw, { nested: true, rust: true });
  const lineOf = makeLineIndex(code);
  const origLines = raw.split(/\r?\n/);
  const hits = findCorsHoles(code, lineOf, origLines).map((h) => ({
    ...h,
    file: `${label}/${relative(displayRoot, absPath).replace(/\\/g, '/')}`,
  }));
  return { scanned: 1, hits };
}

// ---------------------------------------------------------------------------
// 自检（防假绿）
// ---------------------------------------------------------------------------

function selfTest() {
  const cases = [
    {
      name: 'permissive（该抓到）',
      src: 'let cors = tower_http::cors::CorsLayer::permissive();',
      expect: 1,
    },
    {
      name: '注释里的 permissive（不该抓）',
      src: '// 原来这里写的是 CorsLayer::permissive()\nlet x = 1;',
      expect: 0,
    },
    {
      name: '块注释里的 permissive（不该抓）',
      src: '/* CorsLayer::permissive() */\nlet y = 2;',
      expect: 0,
    },
    {
      name: 'allow_origin(Any)（该抓到）',
      src: 'let cors = CorsLayer::new().allow_origin(tower_http::cors::Any);',
      expect: 1,
    },
    {
      name: 'allow_origin(AllowOrigin::any())（该抓到）',
      src: 'let cors = CorsLayer::new().allow_origin(AllowOrigin::any());',
      expect: 1,
    },
    {
      name: 'allow_origin(AllowOrigin::list(..))（不该抓）',
      src: 'let cors = CorsLayer::new().allow_origin(AllowOrigin::list(origins));',
      expect: 0,
    },
    {
      name: '白名单层（不该抓）',
      src: 'let app = app.layer(cors::cors_layer(&state.cors_allowed_origins));',
      expect: 0,
    },
    {
      name: '逃生阀（该放行）',
      src: 'let cors = CorsLayer::permissive(); // cors-allowlist: 临时理由',
      expect: 0,
    },
  ];

  const failures = [];
  for (const c of cases) {
    const code = stripComments(c.src, { nested: true, rust: true });
    const lineOf = makeLineIndex(code);
    const hits = findCorsHoles(code, lineOf, c.src.split(/\r?\n/));
    if (hits.length !== c.expect) {
      failures.push(`自检用例「${c.name}」：期望 ${c.expect} 条，实际 ${hits.length} 条`);
    }
  }
  return { failures, total: cases.length };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.selfTest) {
    const { failures, total } = selfTest();
    if (failures.length) {
      console.error('❌ 探测器自检失败：');
      for (const f of failures) console.error(`   - ${f}`);
      process.exit(2);
    }
    console.log(`✅ 探测器自检全过（${total}/${total} 只样本）`);
    process.exit(0);
  }

  // 探测器先自检 —— 探测器坏了 ⇒ 后面的一切结论都不成立。
  const { failures: stFailures } = selfTest();
  if (stFailures.length) {
    console.error('❌ 探测器自检失败 ⇒ 闸门自己坏了（退出码 2）');
    for (const f of stFailures) console.error(`   - ${f}`);
    process.exit(2);
  }

  const targets = [
    { label: 'telencephalon', root: join(opts.source, 'src'), display: opts.source },
    { label: 'encephalon', root: join(opts.brain, 'src'), display: opts.brain },
    {
      label: 'shadow-desktop',
      root: join(opts.desktop, 'src-tauri', 'src'),
      display: join(opts.desktop, 'src-tauri', 'src'),
    },
  ];

  const hits = [];
  let scanned = 0;
  const missing = [];

  for (const t of targets) {
    if (!existsSync(t.root)) {
      missing.push(t.root);
      continue;
    }
    for (const f of walkRust(t.root)) {
      const r = scanFile(f, t.label, t.display);
      scanned += r.scanned;
      hits.push(...r.hits);
    }
  }

  // 防假绿：一个文件都没读到 ⇒ 不是「没问题」，是「闸门瞎了」。
  if (scanned === 0) {
    console.error('❌ 一个文件都没读到 ⇒ 闸门自己坏了（路径写错 / 仓库挪了家）');
    for (const m of missing) console.error(`   缺失: ${m}`);
    process.exit(2);
  }

  // 规则 C：两处「最外层」的 CORS 层必须挂着白名单。
  // ⚠️ 判据源读不到 ⇒ 退出码 2（「不知道」≠「没问题」）。
  const wiringRoots = { telencephalon: opts.source, encephalon: opts.brain };
  for (const w of WIRING_TARGETS) {
    const abs = join(wiringRoots[w.label], w.file);
    if (!existsSync(abs)) {
      console.error(`❌ 判据源读不到：${w.label}/${w.file} ⇒ 闸门自己坏了（退出码 2）`);
      process.exit(2);
    }
    let raw = '';
    try {
      raw = readFileSync(abs, 'utf8');
    } catch {
      console.error(`❌ 判据源读不到：${w.label}/${w.file} ⇒ 闸门自己坏了（退出码 2）`);
      process.exit(2);
    }
    const code = stripComments(raw, { nested: true, rust: true });
    if (!code.includes(w.need)) {
      hits.push({
        rule: 'C',
        file: `${w.label}/${w.file}`,
        line: 0,
        what: `${w.why}的最外层 CORS 层**没有**挂白名单（找不到 \`${w.need}\`）`,
        text: '',
      });
    }
  }

  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (opts.json) {
    console.log(JSON.stringify({ scanned, count: hits.length, hits }, null, 2));
    process.exit(hits.length ? 1 : 0);
  }

  if (hits.length === 0) {
    console.log(`✅ CORS 白名单闸全绿：扫了 ${scanned} 个源文件，没有 permissive CORS，两处最外层的白名单层都挂着`);
    process.exit(0);
  }

  console.error(`❌ CORS 白名单闸抓到 ${hits.length} 条：`);
  for (const h of hits) {
    console.error(`   [${h.rule}] ${h.file}${h.line ? `:${h.line}` : ''} —— ${h.what}`);
    if (h.text) console.error(`        ${h.text}`);
  }
  console.error('');
  console.error('   ⇒ 浏览器里任意一个网站都能跨域**读**这台大脑 ⇒ 收成 origin 白名单：');
  console.error('     telencephalon/src/api/cors.rs（名单的唯一来源）');
  process.exit(1);
}

main();
