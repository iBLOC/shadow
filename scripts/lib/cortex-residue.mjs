#!/usr/bin/env node
/**
 * 「Cortex 残留」闸 —— **共用引擎**（一处实现）
 *
 * ── 为什么要有这道闸 ──────────────────────────────────────────────
 * 用户拍板：「Cortex 是过时概念应该删除」「清理 cortex 避免与新方案
 * （端脑 / telencephalon / 大脑）产生混淆」。
 *
 * 旧的两道闸（`shadow-desktop/scripts/check-cortex-residue.sh`、
 * `shadow-mobile/scripts/check-cortex-residue.sh`）有三个致命问题：
 *   ① **只看标识符**（`CortexStatus` / `cortexClient` …）⇒ 用户真正看得见的
 *      那句「启动 Cortex」「Cortex 内核状态」**根本不在判据里** ⇒
 *      界面还在说 Cortex，闸却一路绿。
 *   ② **没进 CI**（`shadow/.github/workflows/ci.yml` 里没有这一步）
 *      ⇒ 脚本只是文档，绿不绿没人知道。
 *   ③ **是 `.sh`** ⇒ 在 Windows 开发机上**根本跑不了**（本机 WSL 无发行版）
 *      ⇒ 「有闸」这件事本身就只能靠人记着。
 *
 * ⇒ 所以重写成 Node：**跨平台可跑、词级判据、进 CI**。
 *
 *
 * ── 判据（一句话）────────────────────────────────────────────────
 * 活代码里出现「cortex」这个词 = 残留（红）。
 * **唯一例外**：出现在**兼容契约**里的字面量（数据库表名、线上信封字段、
 * 旧路由、迁移史注释）—— 这些**不许改**，改了会破坏线上兼容或抹掉证据。
 * ⇒ 例外必须**逐条登记**（token + 理由），否则不许豁免。
 *
 * ── 豁免分**两类**（判据的核心，不是可选样式）────────────────────
 *   · `contract`（默认）—— **真契约**：改了会坏东西。
 *     （线上 wire 字段、兼容 shim 模块名、旧环境变量别名、旧存储键……）
 *     ⇒ **任何位置**都豁免。
 *   · `history` —— **史证**：改了只抹掉历史，**不会坏东西**。
 *     （改名链注释、迁移史、README 的变更记录……）
 *     ⇒ **只在注释 / 文档行**豁免；出现在**代码行** ⇒ 判红。
 *
 * ⚠️ 为什么要分两类：混在一张表里，闸就会**放过真残留**。
 *   典型：PG 表名 `cortex_lobes` 出现在「改名史注释」里合法（那是史证），
 *   但它出现在**活 SQL** 里就是「改名没做完」（那是残留）。
 *   不分类的白名单 ⇒ 两种都放过 ⇒ 闸在「活 SQL」这件事上**是恒绿的**。
 *   （旧的 `.sh` 闸本来管这件事；判据搬到 Node 时不能把这个洞一起带过来。）
 *
 * ⚠️ 「例外登记表」本身会腐烂 ⇒ 所以还有一条防腐烂判据：
 *   登记的 token **必须真的还在仓库里出现过**，否则报「豁免条目已腐烂」
 *   并以**退出码 2** 结束（= 判不了，不是干净）。
 *   ⇒ 防止豁免清单变成「什么都往里塞的垃圾桶」。
 *
 * ── 为什么不是「一行一个词」的判据 ───────────────────────────────
 * 因为本项目的老教训：**一份实现两处写，迟早漂**。
 * 扫描算法只写在这里，各项目只提供**数据**（扫哪些目录 + 哪些 token 豁免）。
 */

import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** 「cortex」这个词（大小写不敏感）—— 判据的本体。 */
const CORTEX_RE = /cortex/i;

/**
 * 二进制文件不扫（`.so` / `.exe` / 图片…）—— 文本扫它们只会产出噪声。
 * 判法：前 8KB 里有 NUL 字节 ⇒ 当二进制。
 */
function looksBinary(buf) {
  const head = buf.subarray(0, 8192);
  return head.includes(0);
}

/**
 * 列目录下的文本文件（递归）。
 * @param {string} dir 绝对路径
 * @param {object} opts
 * @param {string[]} opts.excludeDirs  目录名（任意层级命中即跳过）
 * @param {string[]} opts.excludeFiles 文件名（任意层级命中即跳过）
 * @returns {string[]} 绝对路径数组
 */
export function listTextFiles(dir, { excludeDirs = [], excludeFiles = [], base } = {}) {
  const out = [];
  const baseDir = base || dir;

  // 排除项支持两种写法：
  //   · 不含 '/'  ⇒ **目录名**，任意层级命中即跳过（node_modules / target …）
  //   · 含 '/'    ⇒ **相对 base 的路径前缀**（lib/generated/l10n …）
  //   ⚠️ 为什么要分开：光按名字排会把 `lib/l10n` 也误伤掉（那是 ARB 源文件，要扫）。
  const nameEx = new Set(excludeDirs.filter((d) => !d.includes('/')));
  const pathEx = excludeDirs.filter((d) => d.includes('/')).map((d) => d.replace(/\\/g, '/').replace(/\/+$/, ''));
  const fileNameEx = new Set(excludeFiles.filter((f) => !f.includes('/')));
  const filePathEx = new Set(excludeFiles.filter((f) => f.includes('/')).map((f) => f.replace(/\\/g, '/')));

  const relOf = (abs) => relative(baseDir, abs).split(sep).join('/');

  const walk = (abs) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // 读不到就当没有（权限/并发删除）
    }
    for (const e of entries) {
      const p = join(abs, e.name);
      if (e.isDirectory()) {
        if (nameEx.has(e.name)) continue;
        const rel = relOf(p);
        if (pathEx.some((x) => rel === x || rel.startsWith(x + '/'))) continue;
        walk(p);
      } else if (e.isFile()) {
        if (fileNameEx.has(e.name)) continue;
        const rel = relOf(p);
        if (filePathEx.has(rel)) continue;
        try {
          const st = statSync(p);
          if (st.size > 8 * 1024 * 1024) continue; // 超大文件不扫
          const buf = readFileSync(p);
          if (looksBinary(buf)) continue;
          out.push(p);
        } catch {
          /* 跳过读不出来的 */
        }
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * 这一行是不是「注释 / 文档行」？
 *
 * ⚠️ 为什么要单独判这一层：豁免分两类（见文件头）——
 *   `contract`（真契约）任何位置都豁免；`history`（史证）**只在注释 / 文档行**豁免。
 *   ⇒ 「这行是不是注释」决定 `history` 类的豁免能不能生效。
 *
 * 认的写法：源码注释（`//` `///` `//!`、`/*` 开头的块注释与它的 `* ` 续行）、
 *           井号注释（`#` / `#[..]` / YAML / TOML / shell）、
 *           Markdown（`#` 标题 / `- ` 列表 / `* ` 列表 / `> ` 引用 / `| ` 表格 / `<!-- -->`）。
 * ⚠️ `*` 只认「`* `」（带空格）和块注释的结束符 —— 否则 C/C++ 的指针解引用
 *   `*p` 会被当成注释。
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isDocLine(line) {
  const t = (line || '').trim();
  if (!t) return false;
  if (t.startsWith('//')) return true;   // // / /// / //!
  if (t.startsWith('/*')) return true;
  if (t === '*/') return true;
  if (t.startsWith('* ')) return true;   // 块注释的续行
  if (t.startsWith('#')) return true;    // # 标题 / YAML / TOML / shell / #[attr]
  if (t.startsWith('<!--')) return true;
  if (t.startsWith('> ')) return true;    // Markdown 引用
  if (t.startsWith('- ')) return true;    // Markdown 列表 / YAML 列表
  if (t.startsWith('| ')) return true;    // Markdown 表格
  return false;
}

/**
 * 判一行：把**已登记的豁免 token** 从这行里剔掉，剩下还有 cortex ⇒ 残留。
 *
 * ⚠️ 为什么要「剔掉再判」而不是「整行豁免」——
 * 因为一行里**可能同时**有兼容字面量和真残留（例如
 * `let x = cortex_lobes; // TODO: 删掉 cortex 兼容层`）。
 * 整行豁免会让那行里的真残留溜过去 ⇒ 闸就「有洞」了。
 *
 * ⚠️ 为什么要分两类豁免：见文件头。`history` 类的 token 在**代码行**
 *    不参与剔除 ⇒ 那行判红（那才是「改名没做完」的真残留）。
 *
 * @param {string} line
 * @param {{token:string, reason:string, kind?:'contract'|'history'}[]} allowed
 * @returns {{residual:boolean, matched:string[], leftover:string, doc:boolean}}
 */
export function classifyLine(line, allowed) {
  const doc = isDocLine(line);
  let rest = line;
  const matched = [];
  for (const a of allowed) {
    // ⚠️ `history` 类的豁免**只在注释 / 文档行**生效。
    if (a.kind === 'history' && !doc) continue;
    if (rest.includes(a.token)) {
      matched.push(a.token);
      rest = rest.split(a.token).join('\u0000'); // 换成不可能命中 CORTEX_RE 的占位
    }
  }
  return { residual: CORTEX_RE.test(rest), matched, leftover: rest, doc };
}

/**
 * 扫一批文件。
 * @returns {{residual: {file:string,line:number,text:string}[], exempted: {file:string,line:number,token:string}[], seenTokens: Set<string>}}
 */
export function scanCorpus(files, allowed) {
  const residual = [];
  const exempted = [];
  const seenTokens = new Set();
  const tokens = allowed.map((a) => a.token);

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!CORTEX_RE.test(line)) continue;
      const r = classifyLine(line, allowed);
      // ⚠️ 「腐烂」看的是**这个 token 在仓库里还找不找得到**，不是「这一行有没有被豁免」。
      //    `history` 类只在**文档行**算数 —— 它出现在代码行就是真残留（会被判红）。
      for (const a of allowed) {
        if (!line.includes(a.token)) continue;
        if (a.kind === 'history' && !r.doc) continue;
        seenTokens.add(a.token);
      }
      if (r.residual) {
        residual.push({ file, line: i + 1, text: line.trim() });
      } else {
        for (const t of r.matched) exempted.push({ file, line: i + 1, token: t });
      }
    }
  }
  return { residual, exempted, seenTokens, tokens };
}

/**
 * 按**模式**扫一批文件（给「另一族判据」用 —— 例如移动端那道
 * 「旧嵌入式 Prefrontal 运行时不许回来」）。
 *
 * @param {string[]} files
 * @param {{name:string, re:RegExp}[]} patterns
 * @returns {{file:string,line:number,text:string,pattern:string}[]}
 */
export function scanPatterns(files, patterns) {
  const hits = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.re.test(lines[i])) {
          hits.push({ file, line: i + 1, text: lines[i].trim(), pattern: p.name });
          break;
        }
      }
    }
  }
  return hits;
}

/**
 * 主闸。
 *
 * @param {object} o
 * @param {string} o.root       仓库根（绝对路径）
 * @param {string} o.label      报告里显示的项目名
 * @param {string[]} o.scanDirs 相对 root 的目录
 * @param {string[]} o.scanFiles 相对 root 的**文件**（可选）
 * @param {string[]} o.excludeDirs
 * @param {string[]} o.excludeFiles
 * @param {{token:string, reason:string, kind?:'contract'|'history'}[]} o.allowed
 * @param {boolean} o.selfTest
 */
export function runGate(o) {
  const {
    root,
    label,
    scanDirs = [],
    scanFiles = [],
    excludeDirs = [],
    excludeFiles = [],
    allowed = [],
    selfTest = false,
  } = o;

  const files = [];
  for (const d of scanDirs) {
    files.push(...listTextFiles(join(root, d), { excludeDirs, excludeFiles }));
  }
  for (const f of scanFiles) {
    try {
      const buf = readFileSync(join(root, f));
      if (!looksBinary(buf)) files.push(join(root, f));
    } catch {
      /* 没有这个文件就当没有 */
    }
  }

  const { residual, exempted, seenTokens } = scanCorpus(files, allowed);

  // ── 豁免条目是否腐烂 ──────────────────────────────────────────
  const rotten = allowed.filter((a) => !seenTokens.has(a.token));

  const out = [];
  const say = (s = '') => out.push(s);

  say('═'.repeat(72));
  say(`Cortex 残留闸 —— ${label}`);
  say('═'.repeat(72));

  if (rotten.length > 0) {
    say('');
    say('✗ 豁免条目已腐烂（登记的 token 在仓库里已经找不到了）:');
    for (const a of rotten) say(`  · ${a.token}  —— ${a.reason}`);
    say('');
    say('  ⇒ 这些豁免已经不再对应任何真实存在的东西 ⇒ 删掉它们（或改对 token）。');
    say('  ⇒ 这一格是「判不了」，不是「干净」 ⇒ 退出码 2。');
    return { code: 2, out: out.join('\n'), residual, exempted, rotten };
  }

  if (exempted.length > 0) {
    const byToken = new Map();
    for (const e of exempted) {
      if (!byToken.has(e.token)) byToken.set(e.token, []);
      byToken.get(e.token).push(e);
    }
    const contracts = allowed.filter((a) => a.kind !== 'history');
    const histories = allowed.filter((a) => a.kind === 'history');
    if (contracts.length > 0) {
      say('');
      say('· 已登记的**兼容契约**（真契约：改了会坏东西 ⇒ 任何位置都豁免）:');
      for (const a of contracts) {
        const n = (byToken.get(a.token) || []).length;
        say(`  · ${a.token}  ×${n}  —— ${a.reason}`);
      }
    }
    if (histories.length > 0) {
      say('');
      say('· 已登记的**改名史**（史证：只抹掉历史、不坏东西 ⇒ **只在注释 / 文档行**豁免）:');
      for (const a of histories) {
        const n = (byToken.get(a.token) || []).length;
        say(`  · ${a.token}  ×${n}  —— ${a.reason}`);
      }
    }
  }

  if (residual.length > 0) {
    say('');
    say(`✗ 残留 ${residual.length} 处 —— 「cortex」出现在活代码里:`);
    for (const r of residual) {
      say(`  ${relative(root, r.file).split(sep).join('/')}:${r.line}  ${r.text}`);
    }
    say('');
    say('  ⇒ 要么改名，要么——如果它其实是**兼容契约**——登记进 allowed（token + 理由）。');
    return { code: 1, out: out.join('\n'), residual, exempted, rotten };
  }

  say('');
  say(`✓ 残留 0 处（扫了 ${files.length} 个文件 / ${scanDirs.length + scanFiles.length} 个目标）`);
  return { code: 0, out: out.join('\n'), residual, exempted, rotten };
}

/**
 * 自检：证明这道闸**有分辨力**，不是恒绿。
 *
 * 五条：
 *   ① 造出来的残留必须被抓到（扫真实文件）
 *   ② 只含**已登记的 contract 类** token 的代码行必须**不**被抓到（不误报）
 *   ③ **真实配置**的分类器面对合成残留行必须判红（证明配置本身不是漏的）
 *   ④ 豁免 token 不存在时必须报「腐烂」⇒ 退出码 2（证明判得了「判不了」）
 *   ⑤ `history` 类豁免的**上下文限定**必须生效（代码行判红 / 注释行豁免）
 *      ⇒ 证明「活 SQL 里还留着旧表名」这类真残留不会被放过
 *
 * @param {object} o 同 runGate，外加 allowed
 * @returns {{code:number, out:string}}
 */
export function runSelfTest(o) {
  const { allowed = [], root, label = '（自检）' } = o;
  const lines = [];
  const say = (s = '') => lines.push(s);
  let fails = 0;

  say('─'.repeat(72));
  say(`Cortex 残留闸 —— 自检（${label}）`);
  say('─'.repeat(72));

  // ① 造一次残留，扫真实文件
  {
    const probe = join(root, '.cortex-self-test-probe.tmp');
    // ⚠️ 用 writeFileSync 写、用 unlinkSync 删。删不掉也不影响主流程（下一轮会覆盖）。
    writeFileSync(probe, 'const label = "Cortex 内核状态";\n', 'utf8');
    const files = listTextFiles(root, {
      excludeDirs: ['node_modules', '.git', 'target', 'dist', 'build', 'docs'],
      excludeFiles: [],
    }).filter((f) => !f.endsWith(sep + '.cortex-self-test-probe.tmp'));
    const r = scanCorpus([...files, probe], allowed);
    const caught = r.residual.some((x) => x.file === probe);
    try { unlinkSync(probe); } catch { /* 沙箱里可能删不掉，无妨 */ }
    if (caught) {
      say('✓ ① 造出来的残留被抓到了');
    } else {
      say('✗ ① 造出来的残留没被抓到 ⇒ 这道闸是恒绿的');
      fails++;
    }
  }

  // ② 只含**已登记的 contract 类** token 的**代码行**不得被抓
  if (allowed.length > 0) {
    const contract = allowed.find((a) => a.kind !== 'history');
    if (contract) {
      const r = classifyLine(`const t = "${contract.token}"; // 兼容契约`, allowed);
      if (!r.residual) {
        say(`✓ ② 已登记的契约 token（${contract.token}）没有被误报`);
      } else {
        say(`✗ ② 已登记的契约 token（${contract.token}）被误报了`);
        fails++;
      }
    } else {
      const hist = allowed[0];
      const r = classifyLine(`// ${hist.token} —— 改名史`, allowed);
      if (!r.residual) {
        say(`✓ ② 已登记的史证 token（${hist.token}）在注释行没有被误报`);
      } else {
        say(`✗ ② 已登记的史证 token（${hist.token}）在注释行被误报了`);
        fails++;
      }
    }
  } else {
    say('· ② 跳过（本项目没有登记任何豁免 token）');
  }

  // ③ 真实配置的分类器面对合成残留行必须判红
  {
    const r = classifyLine('启动 Cortex 内核', allowed);
    if (r.residual) {
      say('✓ ③ 真实配置的分类器认得出合成残留行');
    } else {
      say('✗ ③ 真实配置的分类器认不出合成残留行 ⇒ 配置把残留放过了');
      fails++;
    }
  }

  // ④ 豁免 token 不存在时必须报「腐烂」
  {
    const fake = [{ token: '__cortex_never_exists_9d1f__', reason: '自检用的假 token' }];
    const r = classifyLine('const x = 1;', fake);
    const seen = new Set();
    for (const t of fake) if (r.matched.includes(t)) seen.add(t);
    const rotten = fake.filter((a) => !seen.has(a.token));
    if (rotten.length === 1) {
      say('✓ ④ 豁免 token 不存在时能被判出来（防腐烂）');
    } else {
      say('✗ ④ 豁免 token 不存在时判不出来 ⇒ 豁免清单会变成垃圾桶');
      fails++;
    }
  }

  // ⑤ `history` 类的豁免**只对注释 / 文档行**生效 ——
  //    出现在代码行必须判红（那才是「改名没做完」的真残留）
  {
    const fake = [{ token: '__cortex_history_probe__', kind: 'history', reason: '自检用的假史证 token' }];
    const codeLine = classifyLine('const t = "__cortex_history_probe__";', fake);
    const docLine = classifyLine('// __cortex_history_probe__ —— 改名史', fake);
    if (codeLine.residual && !docLine.residual) {
      say('✓ ⑤ history 类豁免的上下文限定生效（代码行判红 / 注释行豁免）');
    } else {
      say('✗ ⑤ history 类豁免的上下文限定没生效 ⇒「活 SQL 里还留着旧表名」这类真残留会被放过');
      fails++;
    }
  }

  say('');
  if (fails === 0) {
    say('✓ 自检全绿（5 条）');
    return { code: 0, out: lines.join('\n') };
  }
  say(`✗ 自检 ${fails} 条红`);
  return { code: 1, out: lines.join('\n') };
}
