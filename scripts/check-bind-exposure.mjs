#!/usr/bin/env node
/**
 * 暴露面静态闸 —— 抓「默认绑到所有网卡」
 *
 * ## 为什么要有这个闸
 *
 * 端脑面（telencephalon 的 router 合集）上还有**约 30 张没上锁**的 router
 * （见 `docs/superpowers/architecture/2026-10-31-agent-surface-endpoint-lock-matrix.md`）。
 * ⇒ 「这张面绑在哪儿」和「这张面锁没锁」是**乘积关系**：
 * **门锁上了但门对着局域网开着 = 没锁。**
 *
 * 2026-10-31 实测到的那条：独立端脑服务器（`encephalon-server`）把监听地址
 * **写死**成 `0.0.0.0` ⇒ 「随手起一台端脑」= 把那约 30 张敞开的 router
 * 放到**局域网**上 ⇒ 威胁模型从「本机的另一个进程」放大成「同网段的任何设备」。
 *
 * ⇒ 默认姿态必须是**回环**，宽绑定必须是**显式**决定。
 *
 * ## 闸门抓什么
 *
 * 在**代码**（注释已剥）里出现：
 *
 * - `0.0.0.0` —— IPv4 通配地址的字面量；
 * - `Ipv4Addr::UNSPECIFIED` / `Ipv6Addr::UNSPECIFIED` —— 通配地址的惯用写法。
 *
 * ⇒ 宽绑定只能通过**配置/命令行**显式表达（`--bind 0.0.0.0`、
 * `TELENCEPHALON_BIND=0.0.0.0`），不能藏在源码里当默认。
 *
 * ## 逃生阀
 *
 * 同一行写 `bind-exposure: <理由>` ⇒ 放行。
 * ⚠️ 逃生阀是**逃生阀**，不是「修好了」的证明 ⇒ 理由要写清楚，
 * 且它会留在源码里给下一个人看。
 *
 * ## 防假绿（这条最重要）
 *
 * **一个文件都没读到 ⇒ 退出码 2，不是 0。**
 * 路径写错、仓库挪了家 ⇒ 「没找到东西」绝不能被说成「没发现问题」。
 * 同理：**探测器自己**先跑一遍 `--self-test`（三只样本：真绑定 / 注释 /
 * 通配常量）⇒ 探测器坏了 ⇒ 退出码 2。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-bind-exposure.mjs
 * node scripts/check-bind-exposure.mjs --json
 * node scripts/check-bind-exposure.mjs --self-test
 * ```
 *
 * 退出码：0 = 没有源码级宽绑定；1 = 抓到了（每条带 file:line）；2 = 闸门自己坏了。
 *
 * ⚠️ **范围**：默认只扫**端脑面**这条线上的三个仓（端脑 / 大脑 / 桌面端 sidecar）。
 * 兄弟仓（amygdala / temporal 等）各有各的暴露面决策，**默认不归这道闸** ——
 * 跨仓报警只会让闸门被当成噪音关掉。
 *
 * ⚠️ **`--lobes` 是显式加进来的那一档**（2026-10-31）：**叶区服务**
 * （杏仁核 / 颞叶 / 枕叶 / 顶叶）+ `synapse` 的**库级默认**
 * （`LobeAppBuilder::new` 的兜底 ⇒ 每一个用 `LobeApp::builder()` 的叶区都继承它）。
 *
 * 为什么叶区值得单独一档、而不是并进端脑面那一档 —— **理由不同**：
 *
 * * 端脑面**还有一道锁当第二层**（那约 30 张 router 正在上锁，见判定表）
 *   ⇒ 绑定地址只是「锁的乘数」；
 * * **叶区面没有任何凭据层** —— 2026-10-31 实测：杏仁核的
 *   `GET /emotion/state` **不带任何凭据**就回用户的情绪状态
 *   ⇒ ⇒ 对叶区来说，**绑定地址就是唯一的访问控制**。
 *
 * ⇒ 这一档因此**默认关、显式开**：默认只扫端脑面（不替兄弟仓表态），
 * 要查叶区就显式 `--lobes` ⇒ 「谁该报警」留给跨仓协作去谈；
 * 而**判据**（只有「默认绑定位置上的通配地址」才算）两边是同一份
 * ⇒ 不需要两套探测器，也不会出现两套标准。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, makeLineIndex, stripTestModules } from './lib/strip-comments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(
    [
      '用法: node scripts/check-bind-exposure.mjs [选项]',
      '',
      '  --source <dir>   端脑仓根目录（默认 <repo>/../telencephalon）',
      '  --brain <dir>    大脑仓根目录（默认 <repo>/../encephalon）',
      '  --desktop <dir>  桌面端仓根目录（默认 <repo>/shadow-desktop）',
      '  --lobes         额外扫**叶区**那一档（杏仁核/颞叶/枕叶/顶叶 + synapse 库默认）',
      '  --lobes-root <dir>  叶区各仓的父目录（默认 <repo>/..）',
      '  --json           输出 JSON',
      '  --self-test      只跑探测器自检',
      '  -h, --help       这段话',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const opts = {
    source: join(REPO, '..', 'telencephalon'),
    brain: join(REPO, '..', 'encephalon'),
    desktop: join(REPO, 'shadow-desktop'),
    lobes: false,
    lobesRoot: join(REPO, '..'),
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
      case '--lobes':
        opts.lobes = true;
        break;
      case '--lobes-root':
        opts.lobesRoot = resolve(argv[++i]);
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

/**
 * 通配地址的几种写法。
 *
 * ⚠️ 只认**明确的**通配地址 —— 不认 `::`（Rust 路径分隔符，`"::"` 太常见）
 * ⇒ IPv6 的通配只认 `Ipv6Addr::UNSPECIFIED` 这一个惯用写法。
 */
const WILDCARDS = [
  { id: 'ipv4-literal', re: /0\.0\.0\.0/g, what: '"0.0.0.0"（IPv4 通配地址）' },
  { id: 'ipv4-unspecified', re: /Ipv4Addr::UNSPECIFIED/g, what: 'Ipv4Addr::UNSPECIFIED（IPv4 通配）' },
  { id: 'ipv6-unspecified', re: /Ipv6Addr::UNSPECIFIED/g, what: 'Ipv6Addr::UNSPECIFIED（IPv6 通配）' },
];

/** 逃生阀标记（同一行或上一行）。 */
const MARKER = 'bind-exposure:';

/** 「这名字像不像一个绑定目标」。 */
const BINDISH = /(bind|listen|host|addr|address|interface|endpoint|target)/i;

/**
 * 这个通配地址出现在**绑定位置**吗？
 *
 * ⚠️ **第一版判据太粗**：只找「出现过字面量」⇒ 把
 *   - **比较**（`if bind_host == "0.0.0.0"`）
 *   - **提示文案**（`eprintln!("… --bind 0.0.0.0 …")`）
 *   - **测试断言**（`assert_eq!(t.host, "0.0.0.0")`）
 * 全抓成「宽绑定」⇒ 一堆误报 ⇒ 闸门会被当噪音关掉。
 *
 * ⇒ 收紧成「**它在决定绑哪儿**」才报：
 *   - **A** 在 `bind(` 的实参里（`TcpListener::bind(("0.0.0.0", port))`）；
 *   - **B** 赋给一个「像绑定目标」的变量/字段（`let addr = "0.0.0.0:80"`）；
 *   - **C** 当**兜底值**（`unwrap_or_else(|| "0.0.0.0:80")`）；
 *   - **D** 通配**常量**本身（`Ipv4Addr::UNSPECIFIED`）—— 那没有第二种含义。
 */
function isBindPosition(code, idx) {
  // 找这一行之前最近的代码片段（最多回看 200 字符，够覆盖一个调用）。
  const lineStart = code.lastIndexOf('\n', idx - 1) + 1;
  const rawBefore = code.slice(Math.max(lineStart, idx - 200), idx);
  // ⚠️ **要掐掉尾部那个开引号** —— 通配地址通常**在字符串字面量里**
  // （`"0.0.0.0:60080"`）⇒ 不掐掉的话 `before` 结尾是 `= "` ⇒
  // 赋值判据（要求结尾是 `=`）**永远匹配不上** ⇒ 闸门漏报。
  const before = rawBefore.replace(/[\s"']+$/, '');

  // A: 在 bind(...) 的实参里。
  // ⚠️⚠️ **只认「真叫 bind 的那个函数」** —— `parse_bind(` 是**解析器**，
  // 不是绑定 ⇒ 早先的 `/bind\s*\($/` 会把 `parse_bind("0.0.0.0:…")`
  // 算成宽绑定 ⇒ ⇒ 假红（本仓已踩：synapse `src/net/bind.rs` 的测试
  // 让闸多报 5 条 ⇒ 「9 条红」一度被说成「14 条红」）。
  // ⇒ 判据：bind 前面**不能**紧跟标识符字符（`_`/字母/数字）
  // ⇒ ⇒ `parse_bind(`/`parse_bind_http(` 不算、`::bind(`/`.bind(` 算。
  if (/(?:^|[^A-Za-z0-9_])bind\s*\($/.test(before)) return true;
  if (/\bbind\s*\([^)]*$/.test(before)) return true;

  // C: 兜底值。
  if (/unwrap_or|or_else\s*\(|unwrap_or_default/.test(before)) return true;

  // B: 赋值 / 结构体字段 ⇒ 看左边那个名字像不像绑定目标。
  //    ⚠️ `==`（比较）**不算**赋值 ⇒ `[^=!<>]` 把前一个 `=` 挡掉。
  const assign = /(?:^|[^=!<>])=$/.exec(before);
  if (assign) {
    const lhs = before.slice(0, before.length - assign[0].length);
    const name = /([A-Za-z_][A-Za-z0-9_.]*)\s*$/.exec(lhs);
    if (name && BINDISH.test(name[1])) return true;
  }
  // 结构体字段：`bind: "0.0.0.0:80"`。
  const field = /([A-Za-z_][A-Za-z0-9_]*)\s*:$/.exec(before);
  if (field && BINDISH.test(field[1])) return true;

  return false;
}

/**
 * 在一段**代码**里找「处在绑定位置的通配地址」。
 *
 * @param {string} code 已剥注释的代码
 * @param {number} offset 这段代码在原文件里的起始偏移
 * @param {(off:number)=>number} lineOf 原文件行号换算
 * @param {string[]} origLines 原文件行数组（用来读逃生阀标记）
 */
function findWildcards(code, offset, lineOf, origLines) {
  const hits = [];
  for (const w of WILDCARDS) {
    w.re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = w.re.exec(code)) !== null) {
      if (++guard > 1000) break;
      const abs = offset + m.index;
      const line = lineOf(abs);
      const orig = origLines[line - 1] ?? '';
      // 逃生阀：同一行（**或上一行**）写了理由 ⇒ 放行。
      const prev = origLines[line - 2] ?? '';
      if (orig.includes(MARKER) || prev.includes(MARKER)) continue;
      // 通配常量没有第二种含义 ⇒ 总是报。
      const isConst = w.id !== 'ipv4-literal';
      if (!isConst && !isBindPosition(code, abs - offset)) continue;
      hits.push({
        kind: w.id,
        what: w.what,
        line,
        text: orig.trim().slice(0, 160),
      });
    }
  }
  return hits;
}

// （行号换算 `makeLineIndex` 与剥注释 `stripComments` 来自
//   `./lib/strip-comments.mjs` —— 与认证后门闸共用同一份实现。）

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
  // ⚠️ **测试模块不进产物** ⇒ 它里面的字面量不是「源码默认值」⇒ 抹掉再扫。
  const code = stripTestModules(stripComments(raw, { nested: true, rust: true }));
  const lineOf = makeLineIndex(code);
  const origLines = raw.split(/\r?\n/);
  const hits = findWildcards(code, 0, lineOf, origLines).map((h) => ({
    ...h,
    // ⚠️ 基准是**那个仓的根目录**，不是标签名 ⇒ 否则路径会渲染成
    //    `amygdala/../../amygdala/src/...` 这种没法看的东西。
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
      name: '真绑定（该抓到）',
      src: 'let l = tokio::net::TcpListener::bind(("0.0.0.0", 8080)).await?;',
      expect: 1,
    },
    {
      name: '注释里的（不该抓）',
      src: '// 以前写的是 0.0.0.0:60080\nlet x = 1;',
      expect: 0,
    },
    {
      name: '块注释里的（不该抓）',
      src: '/* 0.0.0.0 */\nlet y = 2;',
      expect: 0,
    },
    {
      name: '通配常量（该抓到）',
      src: 'let a = Ipv4Addr::UNSPECIFIED;',
      expect: 1,
    },
    {
      name: '逃生阀（该放行）',
      src: 'let b = "0.0.0.0"; // bind-exposure: 只是给用户看的提示文字',
      expect: 0,
    },
    {
      name: '比较（不该抓）',
      src: 'if bind_host == "0.0.0.0" { warn(); }',
      expect: 0,
    },
    {
      name: '提示文案（不该抓）',
      src: 'eprintln!("  监听所有网卡（--bind 0.0.0.0）");',
      expect: 0,
    },
    {
      name: '测试断言（不该抓）',
      src: 'assert_eq!(t.host, "0.0.0.0");',
      expect: 0,
    },
    {
      name: '赋给绑定目标（该抓到）',
      src: 'let listen_addr = "0.0.0.0:60080".to_string();',
      expect: 1,
    },
    {
      name: '兜底值（该抓到）',
      src: 'let a = x.unwrap_or_else(|| "0.0.0.0:60080".to_string());',
      expect: 1,
    },
    {
      // ⚠️ **解析器调用 ≠ 绑定调用** —— 这条样本钉的就是「9 条 vs 14 条」那个坑。
      name: '解析器调用 parse_bind（不该抓）',
      src: 'let t = parse_bind("0.0.0.0:60080", 60080);',
      expect: 0,
    },
    {
      // ⚠️ **测试代码不进产物** ⇒ 它里面的真绑定也不是「源码默认值」。
      name: 'cfg(test) 模块里的真绑定（不该抓）',
      src: '#[cfg(test)]\nmod tests {\n    #[test]\n    fn wide() {\n        let l = TcpListener::bind(("0.0.0.0", 0)).unwrap();\n    }\n}\nlet x = 1;',
      expect: 0,
    },
    {
      name: 'cfg(test) 之外的真绑定（该抓到）',
      src: '#[cfg(not(test))]\nfn serve() {\n    let l = TcpListener::bind(("0.0.0.0", 8080)).unwrap();\n}\nlet x = 1;',
      expect: 1,
    },
  ];

  const failures = [];
  for (const c of cases) {
    const code = stripTestModules(stripComments(c.src, { nested: true, rust: true }));
    const lineOf = makeLineIndex(code);
    const hits = findWildcards(code, 0, lineOf, c.src.split(/\r?\n/));
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

  // 叶区那一档：**默认不扫**（兄弟仓各有各的暴露面决策 ⇒ 不替他们表态）。
  // 显式 `--lobes` 才加进来 —— 而**判据与端脑面是同一份**（同一个探测器）。
  const LOBE_REPOS = ['amygdala', 'temporal', 'occipital', 'parietal', 'synapse'];
  if (opts.lobes) {
    for (const name of LOBE_REPOS) {
      const repo = join(opts.lobesRoot, name);
      targets.push({ label: name, root: join(repo, 'src'), display: repo });
    }
  }

  const hits = [];
  let scanned = 0;
  let lobeScanned = 0;
  const missing = [];

  for (const t of targets) {
    if (!existsSync(t.root)) {
      missing.push(t.root);
      continue;
    }
    const isLobe = LOBE_REPOS.includes(t.label);
    for (const f of walkRust(t.root)) {
      const r = scanFile(f, t.label, t.display);
      scanned += r.scanned;
      if (isLobe) lobeScanned += r.scanned;
      hits.push(...r.hits);
    }
  }

  // 防假绿：一个文件都没读到 ⇒ 不是「没问题」，是「闸门瞎了」。
  if (scanned === 0) {
    console.error('❌ 一个文件都没读到 ⇒ 闸门自己坏了（路径写错 / 仓库挪了家）');
    for (const m of missing) console.error(`   缺失: ${m}`);
    process.exit(2);
  }

  // 防假绿（叶区那一档）：**端脑面读到了，不代表叶区读到了** ⇒ 分开算。
  if (opts.lobes && lobeScanned === 0) {
    console.error('❌ 显式要了 `--lobes`，却一个叶区文件都没读到 ⇒ 那一档闸门自己坏了');
    for (const m of missing) console.error(`   缺失: ${m}`);
    console.error('   （叶区各仓的父目录用 `--lobes-root` 指定，默认 <repo>/..）');
    process.exit(2);
  }

  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (opts.json) {
    console.log(
      JSON.stringify(
        { scanned, count: hits.length, hits },
        null,
        2,
      ),
    );
    process.exit(hits.length ? 1 : 0);
  }

  if (hits.length === 0) {
    console.log(`✅ 源码级宽绑定：0 条（扫了 ${scanned} 个 .rs 文件）`);
    console.log('   端脑面的默认暴露面是**回环**；要暴露到局域网必须显式（--bind / 环境变量）。');
    if (opts.lobes) {
      console.log('   叶区那一档也在内（--lobes）：默认绑定同样是回环。');
    }
    process.exit(0);
  }

  console.error(`❌ 源码里有 ${hits.length} 处宽绑定（扫了 ${scanned} 个 .rs 文件）：`);
  for (const h of hits) {
    console.error(`   ${h.file}:${h.line}  ${h.what}`);
    console.error(`      ${h.text}`);
  }
  console.error('');
  console.error('   要暴露到局域网 ⇒ 走配置/命令行（--bind / TELENCEPHALON_BIND），');
  console.error('   不要把通配地址写进源码当默认。');
  if (!opts.lobes) {
    console.error('   （叶区那一档默认不扫 ⇒ 要一起查请显式加 `--lobes`。）');
  }
  console.error(`   确实需要留在源码里 ⇒ 同一行写 \`${MARKER} <理由>\`。`);
  process.exit(1);
}

main();
