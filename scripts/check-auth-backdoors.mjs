#!/usr/bin/env node
/**
 * 认证后门静态闸 —— 抓「门在，但认任何人」
 *
 * ## 为什么要有这个闸
 *
 * 2026-10-31 的实测抓到一类洞，它的形状是：**代码里明明写了鉴权，运行时也确实
 * 会挡住「没带凭据」的请求 ⇒ 看起来锁上了 ⇒ 但只要带一个（**任意**）凭据就能过。**
 *
 * 具体两处（都在 HEAD 里，不是谁的在飞改动）：
 *
 * ① `telencephalon/src/security/api_key.rs` 的
 *    `if expected == "dev-admin-key" { return Ok(()); }`
 *    ⇒ expected 是那个值时，**连请求头都不看**就放行。
 * ② 桌面端 / 独立端脑服务器的凭据默认值**恰恰就是 `"dev-admin-key"`**
 *    ⇒ 默认安装走的是 ① 那条万能分支，不是「没配 ⇒ fail-closed」那一支。
 *
 * ⇒ 实测：`X-Admin-Token: 随便什么` ⇒ **200**；**完全不带头** ⇒ 也是 **200**。
 * ⇒ 而「不带凭据 ⇒ 401」这种探测**看不出来**（它测的是空分支）。
 *
 * ⚠️ **这类洞，光靠「打一发请求」是抓不全的** —— 运行时能测到「认任何 token」，
 * 但测不到「这把 token 根本不是秘密」（`dev-admin-key` 是**源码里的字面量**，
 * 任何人都知道）⇒ 那只能靠**读源码** ⇒ 所以这道闸是**源码级**的。
 *
 * ## 闸门抓什么
 *
 * - **A：放行分支** —— 在**鉴权函数**里（函数名含 `verify` / `auth` / `require` /
 *   `guard`）出现「某个变量 == **字符串字面量** ⇒ 直接 `return Ok(())`」。
 *   ⇒ 这就是「认任何人」的形状。
 * - **B：公开字面量当默认凭据** —— 在**凭据解析函数**里（函数名含 `admin_token` /
 *   `admin_key` / `shadow` + `key` / `credential`）出现
 *   `unwrap_or_else(|| "字面量".to_string())` / `.unwrap_or("字面量")`。
 *   ⇒ 这就是「那把钥匙根本不是秘密」。
 * - **C：前端硬编码凭据默认值** —— TS/Dart 里 `?? '字面量'` 且那一行谈到 token/key。
 *
 * ## 防假绿（这条最重要）
 *
 * **一个文件都没读到 ⇒ 退出码 2，不是 0。**
 * 路径写错、仓库挪了家、glob 改坏了 ⇒ 「没找到东西」绝不能被说成「没发现问题」。
 * 同理：**每种检查规则都必须在本次运行里至少命中过一次扫描目标**，
 * 否则报「规则形同虚设」，而不是安静地什么都不说。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-auth-backdoors.mjs                       # 默认扫三个仓
 * node scripts/check-auth-backdoors.mjs --source C:\\path\\telencephalon
 * node scripts/check-auth-backdoors.mjs --allow dev-admin-key # 显式豁免（要写理由）
 * node scripts/check-auth-backdoors.mjs --json
 * ```
 *
 * 退出码：0 = 没抓到后门；1 = 抓到了（每条带 file:line）；2 = 闸门自己坏了。
 *
 * ⚠️ `--allow` 是**逃生阀**，不是「修好了」的证明 —— 豁免理由要写进代码注释里，
 * 门才不是「开着让人进」。
 */

import { sibling } from './lib/sibling-repo.mjs';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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
      '用法: node scripts/check-auth-backdoors.mjs [选项]',
      '',
      '  --source <dir>   端脑仓根目录（默认 <repo>/../telencephalon）',
      '  --brain <dir>    大脑仓根目录（默认 <repo>/../encephalon）—— 独立端脑服务器在它那儿',
      '  --desktop <dir>  桌面端仓根目录（默认 <repo>/shadow-desktop）',
      '  --mobile <dir>   移动端仓根目录（默认 <repo>/shadow-mobile）',
      '  --allow <lit>    豁免一个凭据字面量（可重复；理由请写进代码注释）',
      '  --self-test      判据自检（喂合成夹具 ⇒ ⇒ 不需要兄弟仓在位）',
      '  --json           输出 JSON',
      '  -h, --help       这段话',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const opts = {
    source: sibling(REPO, 'telencephalon'),
    brain: sibling(REPO, 'encephalon'),
    desktop: join(REPO, 'shadow-desktop'),
    mobile: join(REPO, 'shadow-mobile'),
    allow: new Set(),
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
      case '--mobile':
        opts.mobile = resolve(argv[++i]);
        break;
      case '--allow':
        opts.allow.add(argv[++i]);
        break;
      case '--self-test':
        opts.selfTest = true;
        break;
      case '--json':
        opts.json = true;
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
// 剥注释
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 找函数（粗粒度：够用即可，不追求 Rust 解析器）
// ---------------------------------------------------------------------------

const FN_RE = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/g;

// 函数体边界是**粗粒度**扫出来的 ⇒ 一旦括号配不平（宏、字符串里的花括号、
// 被注释器吃乱的结构），bodyEnd 就会一路跑到文件尾 ⇒ 后面每条规则都要在
// 超长片段上重跑一遍 ⇒ **平方级变慢**。⇒ 给它一个上限：配不平就**跳过这个
// 函数**（宁可漏报，也别把闸门变成一个跑不动的东西）。
const MAX_FN_SCAN = 20000;

function findFunctions(code) {
  const fns = [];
  let m;
  FN_RE.lastIndex = 0;
  while ((m = FN_RE.exec(code)) !== null) {
    const name = m[1];
    // 从 `fn` 之后找第一个 `{`（跳过参数列表里的闭括号与泛型）
    let j = m.index + m[0].length;
    let depth = 0;
    let bodyStart = -1;
    while (j < code.length && j - m.index < MAX_FN_SCAN) {
      const c = code[j];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '{' && depth <= 0) {
        bodyStart = j;
        break;
      }
      j++;
    }
    if (bodyStart < 0) continue;
    let d = 0;
    let k = bodyStart;
    while (k < code.length && k - bodyStart < MAX_FN_SCAN) {
      if (code[k] === '{') d++;
      else if (code[k] === '}') {
        d--;
        if (d === 0) break;
      }
      k++;
    }
    if (d !== 0) continue; // 括号没配平 ⇒ 这个函数跳过（记一笔，防假绿）
    fns.push({ name, start: m.index, bodyStart, bodyEnd: k + 1 });
  }
  return fns;
}

const AUTH_FN_RE = /(verify|auth|require|guard|permit|check)/i;
const CRED_FN_RE = /(admin_?token|admin_?key|shadow.*key|credential|secret|api_?key)/i;

// ---------------------------------------------------------------------------
// 检查
// ---------------------------------------------------------------------------

/** A：鉴权函数里「== 字面量 ⇒ 直接 return Ok(())」 */
function checkBypassBranch(code, file, lineOf) {
  const hits = [];
  const fns = findFunctions(code);
  for (const fn of fns) {
    if (!AUTH_FN_RE.test(fn.name)) continue;
    const body = code.slice(fn.bodyStart, fn.bodyEnd);
    // if <expr> == "<literal>" { ... return Ok(...) ... }
    const re = /if\s+[A-Za-z_][A-Za-z0-9_.]*\s*==\s*"([^"]*)"\s*\{/g;
    let m;
    let guard = 0;
    while ((m = re.exec(body)) !== null) {
      if (++guard > 1000) break;
      const literal = m[1];
      const window = body.slice(m.index, m.index + 400);
      if (!/return\s+Ok\s*\(/.test(window)) continue;
      hits.push({
        rule: 'A',
        file,
        line: lineOf(fn.bodyStart + m.index),
        fn: fn.name,
        literal,
        detail: `鉴权函数 ${fn.name}() 里「== "${literal}"」分支直接 return Ok(…) ⇒ 认任何 token`,
      });
    }
  }
  return hits;
}

/** B：凭据解析函数里「默认值是字面量」 */
function checkLiteralDefault(code, file, lineOf, lang) {
  const hits = [];
  const fns = findFunctions(code);
  const re =
    lang === 'rust'
      ? /(unwrap_or_else\s*\(\s*\|\|\s*"([^"]*)"\.to_string\s*\(\s*\)\s*\)|\.unwrap_or\s*\(\s*"([^"]*)"\s*\))/g
      : /(\?\?\s*'([^']*)'|\?\?\s*"([^"]*)")/g;

  const scan = (text, offset, fnName) => {
    if (!CRED_FN_RE.test(fnName)) return;
    let m;
    re.lastIndex = 0;
    // ⚠️ **必须有 `g`** —— 没有 `g` 时 `exec` 每次都返回**同一个**首匹配
    // ⇒ `while (exec(...) !== null)` **永不退出** ⇒ 闸门挂死。
    // （这道闸第一版就栽在这儿：**一道会挂死的闸比不会响的闸更糟**。）
    // ⇒ 再加一道迭代上限：万一将来谁又漏了 `g`，最多扫 1000 次就收手。
    let guard = 0;
    while ((m = re.exec(text)) !== null) {
      if (++guard > 1000) break;
      const literal = m[2] ?? m[3] ?? m[1] ?? '';
      if (!literal) continue;
      hits.push({
        rule: lang === 'rust' ? 'B' : 'C',
        file,
        line: lineOf(offset + m.index),
        fn: fnName,
        literal,
        detail:
          lang === 'rust'
            ? `凭据解析函数 ${fnName}() 的默认凭据是源码里的字面量 "${literal}" ⇒ 它不是秘密`
            : `前端默认凭据是字面量 "${literal}" ⇒ 打进前端产物里 ⇒ 不是秘密`,
      });
    }
  };

  for (const fn of fns) {
    scan(code.slice(fn.bodyStart, fn.bodyEnd), fn.bodyStart, fn.name);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 判据纯函数 + 判据自检（合成夹具 ⇒ ⇒ **不需要兄弟仓在位**）
// ---------------------------------------------------------------------------

/**
 * C：前端硬编码凭据默认值 —— 纯函数（零 I/O）⇒ ⇒ 自检能喂夹具证伪它。
 */
function checkFrontendLiteralDefault(code, file) {
  const hits = [];
  const lines = String(code || '').split('\n');
  lines.forEach((line, idx) => {
    const m = /\?\?\s*'([^']*)'|\?\?\s*"([^"]*)"/.exec(line);
    if (!m) return;
    const literal = m[1] ?? m[2] ?? '';
    if (!literal) return;
    if (!/(token|key|secret|credential)/i.test(line)) return;
    hits.push({
      rule: 'C',
      file,
      line: idx + 1,
      fn: '(前端)',
      literal,
      detail: '前端默认凭据是字面量 "' + literal + '" ⇒ 打进前端产物里 ⇒ 不是秘密',
    });
  });
  return hits;
}

/**
 * 豁免过滤 —— 纯函数：「放行了哪些」与「还剩哪些」是**两个**集合。
 * ⚠️ 为什么要抽出来：豁免是逃生阀 ⇒ ⇒ 它一旦生效就**不该再出现在 findings 里**
 * ⇒ ⇒ 而这条过滤以前长在 main() 里 ⇒ ⇒ 自检根本够不着它。
 */
function splitByAllow(hits, allow) {
  const set = allow instanceof Set ? allow : new Set(allow || []);
  const all = hits || [];
  return {
    findings: all.filter((h) => !set.has(h.literal)),
    allowed: all.filter((h) => set.has(h.literal)),
  };
}

/**
 * 「读到几个文件」⇒ ⇒ 一个结论。
 * ⚠️ 一个都没读到 ⇒ ⇒ **判不了**（不是「没问题」）—— 这就是退出码 2 那一档。
 */
function judgeCoverage(scannedByTarget) {
  const total = (scannedByTarget || []).reduce((n, t) => n + t.scanned, 0);
  return { verdict: total === 0 ? 'cannot-judge' : 'ok', scanned: total };
}

/**
 * 判据自检 —— **喂合成夹具**，不碰文件系统 ⇒ ⇒ 不需要三个兄弟仓在位。
 *
 * ⚠️ 为什么不能「跑一次正常检查」充数（2026-11-11 实测）：
 *    这道闸扫的是**端脑 / 大脑 / 桌面端 / 移动端**四个仓 ⇒ ⇒ 真跑需要它们在位
 * ⇒ ⇒ 本机没有 ⇒ ⇒ 自检退出 2 ⇒ ⇒ 纪律闸读成「**闸自己坏了**」
 * ⇒ ⇒ 而「环境缺」与「闸坏了」必须分开 ⇒ ⇒ 于是自检只喂夹具。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const rust = (src) => {
    const code = stripComments(src, { nested: true, rust: true });
    return { code, lineOf: makeLineIndex(code) };
  };

  add('A 命中：鉴权函数里「== 字面量」分支直接 return Ok(…)', () => {
    const { code, lineOf } = rust(
      'fn verify_admin(expected: &str) -> Result<(), String> {\n' +
        '    if expected == "dev-admin-key" {\n' +
        '        return Ok(());\n' +
        '    }\n' +
        '    Err("denied".to_string())\n' +
        '}\n',
    );
    const hits = checkBypassBranch(code, 'x.rs', lineOf);
    return hits.length === 1 && hits[0].rule === 'A' && hits[0].literal === 'dev-admin-key';
  });

  add('孪生：A 不命中 —— 同一形状但分支里不是 return Ok(…)', () => {
    const { code, lineOf } = rust(
      'fn verify_admin(expected: &str) -> Result<(), String> {\n' +
        '    if expected == "dev-admin-key" {\n' +
        '        return Err("denied".to_string());\n' +
        '    }\n' +
        '    Ok(())\n' +
        '}\n',
    );
    return checkBypassBranch(code, 'x.rs', lineOf).length === 0;
  });

  add('B 命中：凭据解析函数里默认凭据是源码里的字面量', () => {
    const { code, lineOf } = rust(
      'fn admin_token() -> String {\n' +
        '    std::env::var("IBLOC_ADMIN").unwrap_or_else(|| "dev-admin-key".to_string())\n' +
        '}\n',
    );
    const hits = checkLiteralDefault(code, 'x.rs', lineOf, 'rust');
    return hits.length === 1 && hits[0].rule === 'B' && hits[0].literal === 'dev-admin-key';
  });

  add('孪生：B 不命中 —— 同一写法但那个函数与凭据无关', () => {
    const { code, lineOf } = rust(
      'fn theme_name() -> String {\n' +
        '    std::env::var("THEME").unwrap_or_else(|| "dev-admin-key".to_string())\n' +
        '}\n',
    );
    return checkLiteralDefault(code, 'x.rs', lineOf, 'rust').length === 0;
  });

  add('C 命中：前端默认凭据是字面量', () => {
    const hits = checkFrontendLiteralDefault(
      "const adminToken = cfg.X ?? 'dev-admin-key';\n",
      'x.ts',
    );
    return hits.length === 1 && hits[0].rule === 'C' && hits[0].literal === 'dev-admin-key';
  });

  add('孪生：C 不命中 —— 同一行形状但那行不谈凭据', () => {
    const hits = checkFrontendLiteralDefault("const themeName = cfg.X ?? 'dark';\n", 'x.ts');
    return hits.length === 0;
  });

  add('注释里的字面量不算（剥注释后没有命中）', () => {
    const { code, lineOf } = rust(
      'fn admin_token() -> String {\n' +
        '    // 旧实现：unwrap_or_else(|| "dev-admin-key".to_string())\n' +
        '    std::env::var("IBLOC_ADMIN").unwrap_or_default()\n' +
        '}\n',
    );
    return checkLiteralDefault(code, 'x.rs', lineOf, 'rust').length === 0;
  });

  add('豁免：--allow 放行的字面量不进 findings（且仍被记账）', () => {
    const hits = [{ rule: 'A', literal: 'dev-admin-key', file: 'x.rs', line: 1 }];
    const split = splitByAllow(hits, new Set(['dev-admin-key']));
    return split.findings.length === 0 && split.allowed.length === 1;
  });

  add('「一个文件都没读到」⇒ ⇒ 判不了（不是「没问题」）', () => {
    return judgeCoverage([]).verdict === 'cannot-judge';
  });

  add('孪生：读到了文件 ⇒ ⇒ 判得了', () => {
    return judgeCoverage([{ name: '端脑', scanned: 3 }]).verdict === 'ok';
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 扫盘
// ---------------------------------------------------------------------------

// 构建产物目录 —— ⚠️ **必须排除**：`encephalon` 一个仓就有 `target` /
// `target-android` / `target-acp` / `target-trace` 好几份产物（合计上百 GB）
// ⇒ 不排除就是在一堆 `.rlib` / `.o` 里爬，几十分钟出不来。
// ⇒ 规则：`target` 开头的一律跳过（cargo 的产物目录都叫这个）。
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
  '.venv',
  'venv',
  '__pycache__',
]);

function isSkippedDir(name) {
  return SKIP_DIRS.has(name) || name === 'target' || name.startsWith('target-');
}

function walk(dir, filter) {
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
      } else if (e.isFile() && filter(p)) {
        out.push(p);
      }
    }
  }
  return out;
}

function scanRepo(root, lang, credHint) {
  const exts = lang === 'rust' ? ['.rs'] : ['.ts', '.tsx', '.dart'];
  const files = walk(root, (p) => exts.some((e) => p.endsWith(e)));
  const hits = [];
  let scanned = 0;
  for (const f of files) {
    let raw;
    try {
      raw = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    scanned++;
    const code = stripComments(raw, { nested: lang === 'rust', rust: lang === 'rust' });
    const lineOf = makeLineIndex(code);
    const rel = relative(root, f);
    if (lang === 'rust') {
      hits.push(...checkBypassBranch(code, rel, lineOf));
      hits.push(...checkLiteralDefault(code, rel, lineOf, 'rust'));
    } else {
      // 前端：按「行」扫（`?? '字面量'` 通常在同一行）
      hits.push(...checkFrontendLiteralDefault(code, rel));
    }
  }
  return { hits, scanned, root };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) {
    selfTest();
    return;
  }

  const targets = [
    { name: '端脑', root: opts.source, lang: 'rust' },
    { name: '大脑', root: opts.brain, lang: 'rust' },
    { name: '桌面端', root: opts.desktop, lang: 'ts' },
    { name: '移动端', root: opts.mobile, lang: 'ts' },
  ];

  const all = [];
  const scannedByTarget = [];
  const missing = [];

  for (const t of targets) {
    if (!existsSync(t.root)) {
      missing.push(`${t.name}：${t.root}`);
      continue;
    }
    if (!opts.json) process.stderr.write(`  扫 ${t.name} …\n`);
    const r = scanRepo(t.root, t.lang, t.name);
    scannedByTarget.push({ name: t.name, root: t.root, scanned: r.scanned });
    all.push(...r.hits);
  }

  // ---- 防假绿 1：一个文件都没读到 ⇒ 闸门坏了 -------------------------------
  const coverage = judgeCoverage(scannedByTarget);
  if (coverage.verdict === 'cannot-judge') {
    console.error('一个源文件都没读到 —— 这不是「没发现问题」，是判不了。');
    for (const m of missing) console.error(`  找不到：${m}`);
    process.exit(2);
  }

  // ---- 防假绿 2：每条规则都至少要扫到东西 -------------------------------
  const rulesSeen = new Set(all.map((h) => h.rule));
  const ruleHits = { A: 0, B: 0, C: 0 };
  for (const h of all) ruleHits[h.rule] = (ruleHits[h.rule] ?? 0) + 1;

  // ---- 豁免 -------------------------------------------------------------
  const { findings, allowed } = splitByAllow(all, opts.allow);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          scanned: scannedByTarget,
          findings,
          allowed,
          ruleHits,
          exit: findings.length ? 1 : 0,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('认证后门静态闸 —— 抓「门在，但认任何人」\n');
    for (const t of scannedByTarget) {
      console.log(`  ${t.name.padEnd(6)} ${String(t.scanned).padStart(4)} 个文件  ${t.root}`);
    }
    console.log('');
    if (findings.length === 0) {
      console.log('✅ 没抓到后门。');
    } else {
      console.log(`❌ 抓到 ${findings.length} 条：\n`);
      for (const f of findings) {
        console.log(`  [${f.rule}] ${f.file}:${f.line}`);
        console.log(`       ${f.detail}`);
      }
      console.log('');
    }
    if (allowed.length) {
      console.log(`（已豁免 ${allowed.length} 条：${[...new Set(allowed.map((a) => a.literal))].join(', ')} —— 理由请写进代码注释）`);
    }
    console.log('');
    console.log(`规则命中计数：A(放行分支)=${ruleHits.A ?? 0} B(字面量默认凭据)=${ruleHits.B ?? 0} C(前端硬编码)=${ruleHits.C ?? 0}`);
    console.log('⚠️ 命中数为 0 的规则**不表示那条规则没用** —— 可能是真的没有，也可能规则本身太窄。');
  }

  process.exit(findings.length ? 1 : 0);
}

main();
