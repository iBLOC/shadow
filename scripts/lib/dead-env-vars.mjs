#!/usr/bin/env node
/**
 * 死环境变量判据库（纯函数 · 零依赖）
 * ============================================================================
 *
 * ## 这道判据在管什么
 *
 * **「设了没人读」的环境变量 = 改名链漏改的化石。**
 *
 * 实测（iBLOC shadow，2026-11-05）：CI 的 e2e step 设了
 * 两个变量（指向端脑二进制）
 * 但读取端（shadow-desktop/tests/e2e-ui/global-setup.ts）在改名链里
 * 已经改成了 SHADOW_TELENCEPHALON_BIN / SHADOW_TELENCEPHALON_CWD
 * 于是 CI 设的这两个变量**一个读者都没有**
 * 而**失败长得像成功**：CI 不报错，e2e 只是安静地走了
 * 「端脑起不来 => 规格自跳过」那条分支 => **绿灯但什么都没测**。
 * 而且这个洞**任何现有闸都看不见**：
 *   - 词级残留闸：只找**旧产品名那个词** => 新名字里没有它 => 不报；
 *   - 覆盖面对账：.github/ 压根不在扫描范围 => 连看都没看。
 *
 * ## 判据（三条）
 *
 *   D1  dead-env-var     某个环境变量被**设置**（CI env / 文档示例 / 脚本 export）
 *                         但全仓**没有任何读者** => 残留（红）。
 *                         读者 = process.env.X / env::var("X") / 美元 X / 百分号 X
 *                         / os.environ["X"]。
 *
 *   D2  env-name-drift  同一组变量（按**尾部段**归族）在设置端与
 *                         读取端**用了不同的名字** => 改名链漏改的化石（红）。
 *                         例：设置 SHADOW_OLDNAME_BIN / 读 SHADOW_TELENCEPHALON_BIN
 *                         => 尾部都是 BIN => 同族 => 名字不一致 => 红。
 *
 *   D3  env-set-no-read  设置了但没人读（且 D2 抓不到的那种：读的是完全另一个名）
 *                         => 与 D1 重叠，但独立可读。
 *
 * ## 为什么「没人读」就是问题
 *
 * 一个环境变量**必须**有读者才有意义 => 设了没人读 => 它要么是
 *   - **化石**（改名链漏改 => 它的本意已经由新名字接管了）=> 该删；
 *   - 或者 **拼错了**（读者拼的是另一个名字 => 本意根本没生效）。
 * 两种都不是「无害」=> 都该红。
 *
 * 但**不能一刀切**：有些变量是**给外部消费者**用的（别的仓 / 别的进程读它）
 * => 那属于**真契约** => 必须登记进 allowedEnvVars（写清谁读它）。
 */

import { readFileSync } from 'node:fs';

/**
 * 设置端：**只有环境变量特有的形状**才算。
 *
 * ⚠️ **形状必须够严**（2026-11-05 实测踩到，**两轮**）：
 *
 *   第一轮：宽松的「NAME = value」会把 Python 模块常量（STOP_TOKEN = "..."）、
 *     Kconfig 构建选项（CONFIG_SOC_ABC=y）、Xcode 构建变量（CLANG_*）
 *     全当成「设了没人读的环境变量」⇒ ⇒ 实测第一版噪声 300+ 条 ⇒ ⇒ 判据失去意义。
 *
 *   第二轮：「缩进 + 大写名 + 冒号 + 值」**还是太宽** —— 它把**任何语言的键值对**
 *     都当成环境变量设置：
 *       · Rust：const RUBRIC: &str = "..."       ⇒ ⇒ 被当成设置 RUBRIC
 *       · JS ：PINNED = { HELLO: 0 }             ⇒ ⇒ 被当成设置 HELLO
 *       · TS ：DEFAULT: '...'（tailwind 对象键） ⇒ ⇒ 被当成设置 DEFAULT
 *     ⇒ ⇒ 实测第二轮噪声 40+ 条，**全是常量** ⇒ ⇒ 真信号被淹掉。
 *
 *   ⇒ ⇒ **真解不是「把正则再收紧一点」，是「认出上下文」**：
 *     环境变量在 YAML / JS 里**总是挂在某个 env 键之下**（env: / environment:）
 *     ⇒ ⇒ 只认 **env 块里面的键** ⇒ ⇒ 常量对象自动出局。
 *
 *   ⚠️ 代价必须写清楚：env 块**外面**的大写键值对（有些配置文件直接拿大写键
 *     当环境变量清单）⇒ ⇒ **认不出来** ⇒ ⇒ 那是**覆盖缺口**，不是「没问题」
 *     ⇒ ⇒ 要记进债清单，别假装它被管住了。
 *
 * 认的五种形状：
 *   ① env 块（块式）：env: 单独一行 ⇒ ⇒ 下面**同缩进**的 NAME: value
 *   ② env 块（流式）：env: { … } ⇒ ⇒ 括号里的 NAME: value（一行或多行）
 *   ③ shell export：export NAME=...
 *   ④ .env 文件：NAME=非空值（**只对 .env 家族的文件**）
 *   ⑤ 代码赋值：process.env.NAME = ...（**不认 ===** —— 那是比较，不是赋值）
 */
const SET_PATTERNS = [
  // ③ shell export：  export NAME=...
  { kind: 'shell-export', re: /\bexport\s+([A-Z][A-Z0-9_]{2,})\s*=/g },
  // ④ .env：  NAME=非空值（**仅 .env 家族文件**；空值是占位 ⇒ ⇒ 不是「设置」）
  { kind: 'dotenv', re: /^([A-Z][A-Z0-9_]{2,})=(\S+)\s*$/gm, dotenvOnly: true },
  // ⑤ 代码赋值：  process.env.NAME = ...
  //    ⚠️ === 是**比较**不是赋值 ⇒ ⇒ 负向断言必须挡住它（(?![=])）。
  { kind: 'process-env-assign', re: /process\.env\.([A-Z][A-Z0-9_]{2,})(?![A-Z0-9_])[ ]*=(?![=])/g },
];

/** env 块的键（块式）：env: / environment: 单独一行。 */
const ENV_BLOCK_KEY_RE = /^[ ]*(?:env|environment)[ ]*:[ ]*$/;
/** env 块里的变量行：缩进 + 大写名 + 冒号 + 非空值。 */
const ENV_VAR_LINE_RE = /^[ ]+([A-Z][A-Z0-9_]{2,})[ ]*:[ ]*(\S.*)$/;
/** env 块（流式）：env: { … } ⇒ ⇒ 括号里的内容（可跨行）。 */
const ENV_FLOW_RE = /(?:^|[^\w.])(?:env|environment)[ ]*:[ ]*\{([^}]*)\}/g;

/**
 * .env 家族的文件（`.env` / `.env.test` / `.env.local` …）。
 * ⚠️ 只有这些文件里的 `NAME=value` 才是**环境变量**设置。
 */
export const DOTENV_FILE_RE = /(^|\/)\.env(\.\w+)?$/;

/**
 * 这个文件里的 `NAME=value` 算不算「设置环境变量」？
 * @param {string} file 相对路径
 * @returns {boolean}
 */
export function isDotenvFile(file) {
  return DOTENV_FILE_RE.test(String(file).replace(/\\/g, '/'));
}

/** 读者：代码里取这个环境变量的地方。 */
const READ_PATTERNS = [
  // ⚠️ 必须排除**赋值**（process.env.X = ...）：那是设置端，不是读者
  //    ⇒ ⇒ 否则「自己设自己读」会把一个真正的死变量伪装成有读者。
  //    ⇒ ⇒ 但 === 是**比较**，仍然是读者 ⇒ ⇒ 负向断言只挡单等号。
  { kind: 'node-process-env', re: /process\.env\.([A-Z][A-Z0-9_]{2,})(?![A-Z0-9_])(?![ ]*=[^=])/g },
  { kind: 'node-process-env-bracket', re: /process\.env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g },
  // Vite 前端读构建期变量（import.meta.env.VITE_…）
  { kind: 'vite-import-meta-env', re: /import\.meta\.env\.([A-Z][A-Z0-9_]{2,})(?![A-Z0-9_])/g },
  { kind: 'rust-env-var', re: /env::var\(\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\)/g },  // ⚠️ **`env::var_os` 也是读者**（2026-11-09 实测踩到）：Rust 读环境变量有**两个** API ——
  //    `env::var`（String）**与** `env::var_os`（OsString）⇒ ⇒ 后者是**路径型变量的正确读法**
  //    （路径不保证是 UTF-8 ⇒ ⇒ `var` 会直接失败 ⇒ ⇒ 桌面的落点就用了它）。
  //    ⇒ ⇒ 只认 `env::var` ⇒ ⇒ `TELENCEPHALON_TASKS_FILE` 的读者被**看不见**
  //    ⇒ ⇒ 闸把它判成「死变量」⇒ ⇒ **误报**（⇒ ⇒ CI 因此红 ⇒ ⇒ 后面 5 步被传染跳过）。
  { kind: 'rust-env-var-os', re: /env::var_os\(\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\)/g },
  { kind: 'python-environ', re: /os\.environ\[\s*["']([A-Z][A-Z0-9_]{2,})['"]\s*\]/g },
  // ⚠️ 这两个形状**只在 shell 语义的文件里**才算「读环境变量」：
  //    $NAME / ${NAME} 在 shell 里是变量引用，在 Dart/TS/JS 里是**字符串插值**。
  //    ⇒ ⇒ 不按文件角色区分 ⇒ ⇒ Dart 的 $TELE_ULR 会被当成「有人读 TELE_ULR」
  //    ⇒ ⇒ 于是一条**真的死条目**（文档里的拼错的环境变量）被伪装成活的。
  { kind: 'shell-dollar', re: /\$\{?([A-Z][A-Z0-9_]{2,})\}?/g, shellOnly: true },
  { kind: 'windows-percent', re: /%([A-Z][A-Z0-9_]{2,})%/g, shellOnly: true },
  // ⚠️⚠️ **GitHub Actions 的表达式形状**（2026-11-11 真 CI 实测踩到）：
  //    workflow 里读环境变量的方式就是 `${{ env.NAME }}` ⇒ ⇒ 而上面那个 `$NAME`
  //    形状**认不出它**（`$` 后面紧跟的是 `{`）⇒ ⇒ 于是一个**真有人读**的变量
  //    被判成「死变量」⇒ ⇒ 闸报「设了但全仓没有任何读者」⇒ ⇒ **CI 的 Desktop Build 红**
  //    ⇒ ⇒ 而且它**在第 28 步**⇒ ⇒ 后面 5 步（TypeScript check / Build web frontend /
  //    Build web…）被**传染跳过**⇒ ⇒ 连「web 前端构建」这一格都没测。
  //    ⇒ ⇒ 与 `env::var_os` 那条**完全同形**：不是变量死，是**尺子认不出读者的形状**。
  { kind: 'gha-expression-env', re: /\$\{\{\s*env\.([A-Z][A-Z0-9_]{2,})\s*\}\}/g, shellOnly: true },
  { kind: 'gha-expression-env-bracket', re: /\$\{\{\s*env\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]\s*\}\}/g, shellOnly: true },
];

/**
 * shell 语义的文件（$NAME 在这里才是「读环境变量」）。
 *
 * ⚠️ 判据按**文件角色**走，不按扩展名单名单 —— YAML 也在内：
 *    GitHub Actions 的 run: 块里的 "$IBLOC_TOKEN" 就是读环境变量。
 */
export const SHELLISH_FILE_RE = /(^|\/)(Makefile|Dockerfile|[^/]*\.dockerfile)$|\.(sh|bash|zsh|ksh|fish|ps1|bat|cmd|yml|yaml|mk)$/i;

/**
 * 这个文件里的 $NAME / %NAME% 算不算「读环境变量」？
 * @param {string} file 相对路径
 * @returns {boolean}
 */
export function isShellishFile(file) {
  return SHELLISH_FILE_RE.test(String(file).replace(/\\/g, '/'));
}

/**
 * Rust 里「环境变量名放在常量里」的形状：
 *   pub const PORT_ENV_VAR: &str = "TAURI_WEBDRIVER_PORT";
 *   std::env::var(PORT_ENV_VAR)
 * ⇒ ⇒ 只认**字面量**的读取端会**看不见这个读者** ⇒ ⇒ 真契约被误报成死变量
 * ⇒ ⇒ 所以要把「常量 ⇒ 变量名」这一跳补上。
 */
const RUST_CONST_STR_RE = /(?:pub\s+)?(?:const|static)\s+([A-Z][A-Z0-9_]{2,})\s*:\s*&(?:'static\s+)?str\s*=\s*"([A-Z][A-Z0-9_]{2,})"/g;

/**
 * env 块（**块式**）：env: 单独一行 ⇒ ⇒ 下面**同缩进**的大写键值对。
 *
 * ⚠️ 为什么只认「同缩进」：env 块里可能嵌一个子映射
 *    （FOO: 下面再缩进一层 ⇒ ⇒ 那层不是环境变量）
 *    ⇒ ⇒ 用**第一个变量行的缩进**当基准 ⇒ ⇒ 更深的一层自动出局。
 *
 * @param {string} text 文件内容
 * @param {string} file 相对路径（用于定位）
 * @returns {Array<{name:string,kind:string,file:string,line:number}>}
 */
export function findEnvBlockSets(text, file) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!ENV_BLOCK_KEY_RE.test(lines[i])) continue;
    const keyIndent = lines[i].length - lines[i].trimStart().length;
    let varIndent = null;
    for (let j = i + 1; j < lines.length; j++) {
      const ln = lines[j];
      if (ln.trim() === '') continue;
      const ind = ln.length - ln.trimStart().length;
      if (ind <= keyIndent) break;          // 出了 env 块
      const vm = ENV_VAR_LINE_RE.exec(ln);
      if (!vm) continue;                   // 注释 / 小写键 / 子映射的键
      if (varIndent === null) varIndent = ind;
      if (ind !== varIndent) continue;     // 更深的一层 ⇒ ⇒ 不是兄弟变量
      out.push({ name: vm[1], kind: 'env-block', file, line: j + 1 });
    }
  }
  return out;
}

/**
 * env 块（**流式**）：env: { … } ⇒ ⇒ 括号里的键值对。
 *
 * 为什么要认流式：JS 里 spawn 的 env 对象就是流式
 * （env: { ...process.env, TELENCEPHALON_CONFIG: '...' }）
 * ⇒ ⇒ 而那正是**改名链漏改**最容易发生的地方（2026-11-05 修的那条）。
 *
 * @param {string} text 文件内容
 * @param {string} file 相对路径（用于定位）
 * @returns {Array<{name:string,kind:string,file:string}>}
 */
export function findEnvFlowSets(text, file) {
  const out = [];
  const re = new RegExp(ENV_FLOW_RE.source, ENV_FLOW_RE.flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    const content = m[1];
    const vr = /(?:^|[^\w$.])([A-Z][A-Z0-9_]{2,})[ ]*:[ ]*[^,}]+/g;
    let v;
    while ((v = vr.exec(content)) !== null) {
      out.push({ name: v[1], kind: 'env-flow', file });
    }
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * 从一段文本里抽出「被设置的环境变量」。
 */
export function findEnvSets(text, file) {
  const out = [];
  for (const p of SET_PATTERNS) {
    // 按文件角色过滤 => .env 家族之外的 NAME=value 不是环境变量设置
    if (p.dotenvOnly && !isDotenvFile(file)) continue;
    const re = new RegExp(p.re.source, p.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      if (name) out.push({ name, kind: p.kind });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  out.push(...findEnvBlockSets(text, file));
  out.push(...findEnvFlowSets(text, file));
  return out;
}

/**
 * 从一段文本里抽出「被读取的环境变量」。
 */
export function findEnvReads(text, file) {
  const out = [];
  for (const p of READ_PATTERNS) {
    if (p.shellOnly && !isShellishFile(file)) continue;
    const re = new RegExp(p.re.source, p.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      // ⚠️ **可能有两个捕获组**（`env.X` 与 `env['X']` 两种写法）⇒ ⇒ 取第一个非空的。
      const name = m[1] || m[2];
      if (name) out.push({ name, kind: p.kind });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // Rust 常量表：CONST_NAME ⇒ 它指向的环境变量名（**按文件** ⇒ Rust 常量是文件作用域）
  const constMap = new Map();
  const cr = new RegExp(RUST_CONST_STR_RE.source, RUST_CONST_STR_RE.flags);
  let cm;
  while ((cm = cr.exec(text)) !== null) {
    if (cm[1] && cm[2]) constMap.set(cm[1], cm[2]);
    if (cm.index === cr.lastIndex) cr.lastIndex++;
  }
  // env::var(CONST) ⇒ 解析成常量指向的那个环境变量名
  const rr = /env::var\(\s*([A-Z][A-Z0-9_]{2,})\s*\)/g;
  let rm;
  while ((rm = rr.exec(text)) !== null) {
    const resolved = constMap.get(rm[1]);
    if (resolved) out.push({ name: resolved, kind: 'rust-env-var-const' });
    if (rm.index === rr.lastIndex) rr.lastIndex++;
  }
  return out;
}

/**
 * 归一化：把「同一个变量改过名」的两个名字归成同一族。
 *
 * 规则：取**最后一段**（下划线分隔）⇒ 同尾 ⇒ 同族。
 *   例：SHADOW_OLDNAME_BIN 与 SHADOW_TELENCEPHALON_BIN 尾部都是 BIN ⇒ 同族。
 *
 * ⚠️ **为什么放弃「已知前缀表」**（2026-11-05 实测踩到）：
 *   前缀表里必须列出**每一个旧产品名** ⇒ ⇒ 于是这道闸的源码里就永远带着
 *   那个旧词 ⇒ ⇒ 而「旧词残留闸」会把源码里的旧词判红 ⇒ ⇒ **两道闸互咬**
 *   （2026-11-05 实测：真咬上了 ⇒ ⇒ 残留闸报「残留 21 处」）。
 *   ⇒ ⇒ 改成「取最后一段」⇒ ⇒ **不依赖任何旧名字** ⇒ ⇒ 这道闸是**通用的**
 *   （它抓的是**改名链漂移**，不是某一个产品的残留）。
 *
 * ⚠️ **泛用尾段不归族**（PORT / HOST / KEY …）：
 *   这些尾段**分不清**「同一个变量改过名」与「两个不同的变量碰巧同名尾」
 *   ⇒ ⇒ 一个分不清的启发式**不该假装分得清** ⇒ ⇒ 泛用尾段**不归族**
 *   ⇒ ⇒ 代价：PORT / HOST 这一族的改名漂移**抓不到**（它们落进「死变量」
 *   那一档 ⇒ ⇒ **仍然会报** ⇒ ⇒ 只是报法不同）。
 */
export const GENERIC_TAILS = new Set([
  'PORT', 'HOST', 'HOSTS', 'URL', 'URI', 'KEY', 'KEYS', 'TOKEN',
  'SECRET', 'PATH', 'DIR', 'FILE', 'NAME', 'ID', 'TIME', 'TIMEOUT',
  'MODE', 'TYPE', 'SIZE', 'LEVEL', 'COUNT', 'LOG', 'DEBUG', 'TRACE',
  'ENV', 'HOME', 'ROOT', 'BASE', 'END', 'START', 'SRC', 'DST',
  'IN', 'OUT', 'ADDR', 'USER', 'PASS', 'PW',
]);

/**
 * 取「族名」：最后一段（泛用尾段不归族）。
 * @param {string} name
 * @returns {string}
 */
export function envFamily(name) {
  const parts = String(name).split('_');
  if (parts.length < 2) return String(name);
  const tail = parts[parts.length - 1];
  if (GENERIC_TAILS.has(tail)) return String(name);
  return tail;
}

/**
 * 这两个名字像不像「同一个变量改过名」？
 *
 * 判据（**形状**，不认具体产品名）：
 *   ① 段数相同 ⇒ ⇒ 恰好**一个**位置的段不同（换了产品名那一段）；
 *   ② 段数差一个 ⇒ ⇒ 短的那个是长的那个的**子序列**（前缀段被删了）。
 *
 * ⚠️ 为什么要有这一步：只按「尾部相同」归族 ⇒ ⇒ `MY_CONFIG` 与 `OTHER_CONFIG`
 *   也会被归成一族 ⇒ ⇒ 报出来的漂移有一半是噪声 ⇒ ⇒ 判据必须再紧一档。
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function isRenameCandidate(a, b) {
  const x = String(a).split('_');
  const y = String(b).split('_');
  if (x.length === y.length) {
    let diff = 0;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++;
    return diff === 1;
  }
  if (Math.abs(x.length - y.length) !== 1) return false;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  let i = 0;
  for (const seg of long) {
    if (i < short.length && seg === short[i]) i++;
  }
  return i === short.length;
}

/**
 * 死环境变量 / 改名漂移判据（纯函数）。
 */
export function checkDeadEnvVars(o) {
  const { sets = [], reads = [], allowed = [] } = o;
  const allowedNames = new Map(allowed.map((a) => [a.name, a]));

  const readNames = new Set(reads.map((r) => r.name));

  const readFamilies = new Map();
  for (const r of reads) {
    const f = envFamily(r.name);
    if (!readFamilies.has(f)) readFamilies.set(f, new Set());
    readFamilies.get(f).add(r.name);
  }

  const dead = [];
  const drift = [];
  const legacy = [];
  const seenDrift = new Set();

  for (const s of sets) {
    if (readNames.has(s.name)) continue;
    // ⚠️ **登记优先于族名启发式**（2026-11-05 实测踩到）：
    //    族名规则是**启发式**（尾部相同就当同一个变量改过名）
    //    ⇒ ⇒ 而登记是**人的显式决定**（这个名字是故意的）
    //    ⇒ ⇒ 显式决定必须压过启发式 ⇒ ⇒ 否则「已登记的真契约」被误报成漂移。
    const reg = allowedNames.get(s.name);
    if (reg && reg.kind === 'legacy') {
      // 存量债：放行，但**要打印**（登记不是认可 => 得看得见）。
      legacy.push({ name: s.name, file: s.file, reason: reg.reason });
      continue;
    }
    if (reg) continue;
    const fam = envFamily(s.name);
    const famAll = readFamilies.get(fam);
    // ⚠️ 同族**不等于**改名 ⇒ ⇒ 还要过「改名候选」这一关（只差一段 / 少一段前缀）
    //    ⇒ ⇒ 否则「碰巧同名尾」的两个变量会被报成漂移 ⇒ ⇒ 噪声。
    const famReaders = famAll
      ? [...famAll].filter((rn) => isRenameCandidate(s.name, rn))
      : [];
    if (famReaders.length > 0) {
      const key = s.name + '->' + famReaders.join(',');
      if (!seenDrift.has(key)) {
        seenDrift.add(key);
        drift.push({
          set: s.name,
          read: famReaders.join(', '),
          family: fam,
          file: s.file,
        });
      }
      continue;
    }
    dead.push({ name: s.name, file: s.file });
  }

  return { dead, drift, legacy, readNames: [...readNames] };
}

export function deadEnvSelfTest() {
  const lines = [];
  let fails = 0;
  let total = 0;

  const T = (name, ok, detail) => {
    total++;
    lines.push((ok ? '✓' : '✗') + ' ' + name + (detail && !ok ? '  => ' + detail : ''));
    if (!ok) fails++;
  };

  {
    const sets = [{ name: 'SHADOW_OLDNAME_BIN', kind: 'yaml-env', file: 'ci.yml' }];
    const r = checkDeadEnvVars({ sets, reads: [] });
    T('① 设了没人读 => 报死变量',
      r.dead.length === 1 && r.dead[0].name === 'SHADOW_OLDNAME_BIN',
      JSON.stringify(r));
  }

  {
    const sets = [{ name: 'SHADOW_FULL_STACK', kind: 'yaml-env', file: 'ci.yml' }];
    const reads = [{ name: 'SHADOW_FULL_STACK', kind: 'node-process-env', file: 'spec.ts' }];
    const r = checkDeadEnvVars({ sets, reads });
    T('② 设了有人读 => 不报',
      r.dead.length === 0 && r.drift.length === 0,
      JSON.stringify(r));
  }

  {
    const sets = [{ name: 'SHADOW_OLDNAME_BIN', kind: 'yaml-env', file: 'ci.yml' }];
    const reads = [{ name: 'SHADOW_TELENCEPHALON_BIN', kind: 'node-process-env', file: 'setup.ts' }];
    const r = checkDeadEnvVars({ sets, reads });
    T('③ 同族不同名 => 报改名漂移',
      r.drift.length === 1 && r.dead.length === 0
        && r.drift[0].set === 'SHADOW_OLDNAME_BIN'
        && r.drift[0].read.indexOf('SHADOW_TELENCEPHALON_BIN') >= 0,
      JSON.stringify(r));
  }

  {
    const sets = [{ name: 'SHADOW_OLDNAME_BIN', kind: 'yaml-env', file: 'ci.yml' }];
    const r = checkDeadEnvVars({
      sets, reads: [],
      allowed: [{ name: 'SHADOW_OLDNAME_BIN', reason: '给外部消费者用' }],
    });
    T('④ 登记成真契约 => 不报',
      r.dead.length === 0 && r.drift.length === 0,
      JSON.stringify(r));
  }

  {
    const a = envFamily('SHADOW_OLDNAME_BIN');
    const b = envFamily('SHADOW_TELENCEPHALON_BIN');
    T('⑤ SHADOW_OLDNAME_BIN 与 SHADOW_TELENCEPHALON_BIN 同族',
      a === b && a === 'BIN',
      'a=' + a + ' b=' + b);
  }

  {
    // ⑥ env 块（块式）：块**里面**的变量算设置端，块**外面**的同名不算
    const yaml = [
      'jobs:',
      '  build:',
      '    env:',
      '      SHADOW_TELENCEPHALON_BIN: /tmp/bin',
      '    steps:',
      '      - run: echo hi',
    ].join('\n');
    const sets = findEnvSets(yaml, 'ci.yml');
    T('⑥ env 块里的变量算设置端，块外的同名不算',
      sets.length === 1 && sets[0].name === 'SHADOW_TELENCEPHALON_BIN',
      JSON.stringify(sets));
  }

  {
    // ⑦ JS 对象里的常量键**不是**环境变量设置（PINNED = { HELLO: 0 }）
    const js = [
      'export const PINNED = {',
      '  content_type: {',
      '    HELLO: 0,',
      '    RESULT: 2,',
      '  },',
    '};',
    ].join('\n');
    const sets = findEnvSets(js, 'scripts/x.mjs');
    T('⑦ JS 对象常量键不算设置端',
      sets.length === 0,
      JSON.stringify(sets));
  }

  {
    // ⑧ Rust 常量**不是**环境变量设置
    const rs = 'const RUBRIC: &str = "score>0.8";';
    const sets = findEnvSets(rs, 'benchmark/src/scorer.rs');
    T('⑧ Rust 常量不算设置端',
      sets.length === 0,
      JSON.stringify(sets));
  }

  {
    // ⑨ env 流式（spawn 的 env 对象）算设置端
    const js = [
      'const child = spawn("pnpm", ["tauri", "dev"], {',
      '  env: {',
      '    ...process.env,',
      '    TELENCEPHALON_CONFIG: join(TEST_DIR, "telencephalon.yaml"),',
      '  },',
      '});',
    ].join('\n');
    const sets = findEnvSets(js, 'shadow-desktop/tests/tauri-e2e/global-setup.ts');
    T('⑨ env 流式（spawn 的 env 对象）算设置端',
      sets.length === 1 && sets[0].name === 'TELENCEPHALON_CONFIG',
      JSON.stringify(sets));
  }

  {
    // ⑩ process.env.X = 是**设置端**；且**不是**读者（自己设自己读不算有读者）
    const js = 'process.env.SHADOW_TEST_ADMIN_TOKEN = "test-token";';
    const sets = findEnvSets(js, 'a.ts');
    const reads = findEnvReads(js, 'a.ts');
    T('⑩ process.env 赋值算设置端、且不算读者',
      sets.length === 1 && sets[0].name === 'SHADOW_TEST_ADMIN_TOKEN' && reads.length === 0,
      JSON.stringify({ sets, reads }));
  }

  {
    // ⑪ $NAME 在 Dart 里是插值，不是读环境变量；只有 shell 语义的文件才算
    const dart = 'const String TELE_ULR = "http://x"; print("$TELE_ULR/health");';
    const readsDart = findEnvReads(dart, 'shadow-mobile/integration_test/x.dart');
    const readsShell = findEnvReads(dart, 'scripts/startup-check.sh');
    T('⑪ $NAME 只在 shell 语义的文件里算读环境变量',
      readsDart.length === 0 && readsShell.length === 1,
      JSON.stringify({ readsDart, readsShell }));
  }

  {
    // ⑫ Rust 常量名里藏着环境变量名 ⇒ ⇒ 读者要能解析出来
    const rs = [
      'pub const PORT_ENV_VAR: &str = "TAURI_WEBDRIVER_PORT";',
      'let port = std::env::var(PORT_ENV_VAR).ok();',
    ].join('\n');
    const reads = findEnvReads(rs, 'src/lib.rs');
    T('⑫ Rust 常量里的环境变量名能被解析成读者',
      reads.length === 1 && reads[0].name === 'TAURI_WEBDRIVER_PORT',
      JSON.stringify(reads));
  }

  {
    // ⑬ 登记**压过**族名启发式（登记 = 人的显式决定）
    const sets = [{ name: 'SHADOW_OLDNAME_BIN', kind: 'env-block', file: 'ci.yml' }];
    const reads = [{ name: 'SHADOW_TELENCEPHALON_BIN', kind: 'node-process-env', file: 'setup.ts' }];
    const r = checkDeadEnvVars({
      sets, reads,
      allowed: [{ name: 'SHADOW_OLDNAME_BIN', reason: '桌面端读它' }],
    });
    T('⑬ 登记压过族名启发式（不报漂移）',
      r.drift.length === 0 && r.dead.length === 0,
      JSON.stringify(r));
  }

  {
    // ⑭ 泛用尾段（PORT / HOST / KEY…）**不归族** —— 分不清就别假装分得清
    T('⑭ 泛用尾段不归族（PORT/HOST/KEY）',
      envFamily('TELE_PORT') === 'TELE_PORT'
        && envFamily('PREFRONTAL_HOST') === 'PREFRONTAL_HOST'
        && envFamily('APP_API_KEY') === 'APP_API_KEY',
      JSON.stringify([envFamily('TELE_PORT'), envFamily('PREFRONTAL_HOST')]));
  }

  {
    // ⑮ 改名候选：只差一段 / 少一段前缀 ⇒ 才算「同一个变量改过名」
    T('⑮ 改名候选判定（只差一段 / 少一段前缀）',
      isRenameCandidate('SHADOW_OLDNAME_BIN', 'SHADOW_TELENCEPHALON_BIN')
        && isRenameCandidate('SHADOW_TELENCEPHALON_CONFIG', 'TELENCEPHALON_CONFIG')
        && !isRenameCandidate('A_B_C', 'X_Y_Z')
        && !isRenameCandidate('PREFIX_ONE', 'PREFIX_TWO_THREE'),
      JSON.stringify([
        isRenameCandidate('SHADOW_OLDNAME_BIN', 'SHADOW_TELENCEPHALON_BIN'),
        isRenameCandidate('SHADOW_TELENCEPHALON_CONFIG', 'TELENCEPHALON_CONFIG'),
        isRenameCandidate('A_B_C', 'X_Y_Z'),
        isRenameCandidate('PREFIX_ONE', 'PREFIX_TWO_THREE'),
      ]));
  }

  {
    // ⑯ Rust 的**两个**读取 API 都算读者：`env::var`（String）与 `env::var_os`（OsString）。
    //    ⇒ ⇒ 路径型变量（路径不保证是 UTF-8 ⇒ ⇒ `var` 会直接失败）**只能**用 `var_os`
    //    ⇒ ⇒ 只认 `var` ⇒ ⇒ 那类变量的读者被**看不见** ⇒ ⇒ 闸把它误报成「死变量」
    //    ⇒ ⇒ 实测（2026-11-09）：`TELENCEPHALON_TASKS_FILE` 就栽在这上面 ⇒ ⇒ CI 因此红。
    const rs = [
      'let p = std::env::var("SHADOW_TASKS_PATH");',
      'let q = std::env::var_os("SHADOW_OS_PATH");',
    ].join('\n');
    const reads = findEnvReads(rs, 'src/main.rs');
    T('⑯ Rust 的两个读取 API（var / var_os）都算读者',
      reads.length === 2
        && reads.some((r) => r.name === 'SHADOW_TASKS_PATH')
        && reads.some((r) => r.name === 'SHADOW_OS_PATH'),
      JSON.stringify(reads));
  }

  {
    // ⑰ **孪生负控**：`var_os` 是**读者**，`set_var` 是**设置端** ⇒ ⇒ 两者必须分得开
    //    ⇒ ⇒ 否则「自己设自己读」会把一个真正的死变量伪装成有读者。
    //    ⚠️ 形状上：`set_var("X", v)` 与 `var_os("X")` **参数个数不同**
    //    ⇒ ⇒ 正则要求 `var_os(` 后面**紧跟** `)`（无逗号）⇒ ⇒ 才不会把 set_var 吃进来。
    const rs = [
      'std::env::set_var("SHADOW_SET_ONLY", path);',
      'std::env::var_os("SHADOW_OS_PATH");',
    ].join('\n');
    const reads = findEnvReads(rs, 'src/main.rs');
    T('⑰ set_var 不是读者（孪生负控）⇒ ⇒ 只有 var_os 那个算',
      reads.length === 1 && reads[0].name === 'SHADOW_OS_PATH',
      JSON.stringify(reads));
  }

  {
    // ⑱ GitHub Actions 的**表达式**是 workflow 里读环境变量的方式 ⇒ ⇒ 算读者
    //    ⇒ ⇒ 否则一个**真有人读**的变量会被判成「死变量」⇒ ⇒ CI 红（2026-11-11 实测）。
    const yml = [
      '      VITE_PREFRONTAL_URL: ${{ env.SHADOW_E2E_ENDBRAIN_URL }}',
      '      SHADOW_TELENCEPHALON_URL: ${{ env.SHADOW_E2E_ENDBRAIN_URL }}',
    ].join('\n');
    const reads = findEnvReads(yml, '.github/workflows/desktop-e2e.yml');
    T('⑱ workflow 里的 `${{ env.X }}` ⇒ ⇒ 算读者',
      reads.length === 2
        && reads.every((r) => r.name === 'SHADOW_E2E_ENDBRAIN_URL')
        && reads.every((r) => r.kind === 'gha-expression-env'),
      JSON.stringify(reads));
  }

  {
    // ⑲ **孪生负控**：`${{ env.X }}` 只在 **shell 语义的文件**（workflow / 脚本）里算读者
    //    ⇒ ⇒ 在 .ts / .dart 里它只是**字符串** ⇒ ⇒ 不能让它把死变量伪装成活的。
    const expr = 'const u = "${{ env.SHADOW_E2E_ENDBRAIN_URL }}";';
    const readsTs = findEnvReads(expr, 'shadow-desktop/src/x.ts');
    const readsYml = findEnvReads(expr, '.github/workflows/x.yml');
    T('⑲ 孪生负控：非 shell 语义的文件里 `${{ env.X }}` 不算读者',
      readsTs.length === 0 && readsYml.length === 1,
      JSON.stringify({ readsTs, readsYml }));
  }

  {
    // ⑳ **反向验证**：加了新形状**之后**，真正没人读的变量**仍然**被判死
    //    ⇒ ⇒ 证明这次补的是「读者的形状」，不是「把闸放松了」。
    const sets = [{ name: 'SHADOW_TRULY_DEAD', kind: 'yaml-env', file: 'ci.yml' }];
    const reads = findEnvReads('      OTHER: ${{ env.SOME_OTHER_NAME }}', 'ci.yml');
    const r = checkDeadEnvVars({ sets, reads });
    T('⑳ 孪生：真正没人读的变量仍然被判死（不是把闸放松了）',
      r.dead.length === 1 && r.dead[0].name === 'SHADOW_TRULY_DEAD',
      JSON.stringify(r));
  }
  return { code: fails === 0 ? 0 : 1, out: lines.join('\n'), total, fails };
}
