/**
 * 「密钥不许明文落盘」探测器 —— **纯函数**（零 IO ⇒ ⇒ 可以单测）。
 *
 * ## 它回答的问题
 *
 * 「这段代码里，有没有把**密钥材料**写进一个**持久化**的地方？」
 *
 * ⚠️⚠️ **不是「有没有提到密钥」** —— 端脑每天都在**读**密钥
 * （`provider.api_key.clone()` 去打上游）⇒ ⇒ 那是**必须的** ⇒ ⇒ 判红就是坑人。
 * ⇒ ⇒ 本探测器只认**「写」**：写进文件 / 写进数据库 / 写进浏览器存储 / 写进 KV。
 *
 * ## 三层判据
 *
 * ① **落盘点（sink）** —— 写进哪儿算落盘：文件、DB、localStorage、SharedPreferences。
 * ② **密钥名** —— `api_key` / `secret` / `password` / `token` / `pem` / `credential` ……
 * ③ **值的来路（trace）** —— ⚠️ **这一层最难，也最容易做错**：
 *    写出盘子的那个值，往往不是密钥本身，而是**它的一份拷贝**：
 *
 *    ```rust
 *    let content = serde_json::to_string_pretty(&*providers)?;  // ← 这里没有 "api_key" 字样
 *    std::fs::write(path, &content)?;                            // ← 但盘上是明文
 *    ```
 *
 *    ⇒ ⇒ 只看「落盘点那一行的文本」⇒ ⇒ **看不见** ⇒ ⇒ 闸会变成假绿。
 *    ⇒ ⇒ 所以这里做**局部数据流追踪**（最多 3 跳）：
 *    赋值 → 参数类型 → 字段类型 → 类型里嵌的密钥型结构体（**传递闭包**）。
 *
 * ## 三条不能省的豁免 / 边界
 *
 * - **引用式密钥不算违规** —— 写 `{"$secret":{…}}` 是**设计好的形状**
 *   （数据库只存引用，材料在 OS 凭据仓库）⇒ ⇒ 判红会把正确实现说成缺陷。
 * - **写「有多少个」不算违规** —— 写掩码（`********`）、写 hint（末 4 位）都不是材料。
 * - **注释里的字样不算** ⇒ ⇒ 先剥注释（`stripComments`）再找。
 *
 * ## 查不出来的（**如实标注，别装作全覆盖**）
 *
 * ① 经过中间层/序列化框架**隐式**落盘（`#[derive(Serialize)]` 落到某个 HTTP body 里再被别处存盘）；
 * ② **运行时拼出来**的路径 / 键名；
 * ③ 日志、崩溃转储、core dump 里的泄漏；
 * ④ **已经写出去的历史数据**（闸只管代码，不管盘上已有的）。
 */
import {
  stripComments,
  stripTestModules,
  matchDelim,
  makeLineIndex,
  rawStringEnd,
} from './strip-comments.mjs';

// ---------------------------------------------------------------------------
// 判据表
// ---------------------------------------------------------------------------

/**
 * 密钥材料的**名字**。
 *
 * ⚠️ 词边界用「非字母数字」⇒ ⇒ `token` 不会命中 `tokenize`，
 * 但 `secret_store` / `admin_token` 会命中（`_` 不是字母数字）⇒ ⇒ 这是**故意的**。
 *
 * ⚠️ 名字命中**不等于**有密钥（`password_hash` 是哈希、`token` 可能是会话令牌）
 * ⇒ ⇒ 它只是**第一层筛子** ⇒ ⇒ 真判据是「这个名字**流到**了落盘点」。
 */
export const SECRET_NAME_RE =
  /(^|[^A-Za-z0-9])(api[_-]?key|secret|password|passwd|private[_-]?key|admin[_-]?token|shadow[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|credential|pem|token)([^A-Za-z0-9]|$)/i;

/**
 * **引用式密钥**的形状 ⇒ ⇒ 写它不是违规（那是迁移后的目标形状）。
 *
 * ⚠️ 必须在 `SECRET_NAME_RE` **之前**判 —— 因为 `secret_ref` 里也有 "secret"，
 * 先判名字就会把**正确的**引用式实现判成违规 ⇒ ⇒ 假红比漏报更坑。
 */
export const SECRET_REF_RE =
  /\$secret|secret_?ref|SecretRef|SecretEnvelope|secret_store|secretStore|store_secret_as|seal_api_key|secret_envelope_json/i;

/**
 * **密钥仓库**（`Secrets` / `SecretStore`）—— 它装的是**引用**，不是材料。
 *
 * ⚠️⚠️ **为什么必须豁免**（2026-11-03 实测）：端脑的配置中心把凭据
 * **密封**成引用再入库 ⇒ ⇒ 写库那个值的来路是「`self.secrets`（仓库）」
 * ⇒ ⇒ 名字级判定会看到 "secret" ⇒ ⇒ **判红** ⇒ ⇒ 但库里存的是
 * ⇒ ⇒ **引用** ⇒ ⇒ ⇒ **假红** ⇒ ⇒ 而假红比漏报更坑（闸会被当噪音关掉）。
 *
 * ⚠️ **豁免要窄**：只豁免「**仓库**」这个词形 ⇒ ⇒ `secret_store` /
 * `secrets` / `SecretStore` / `Secrets` ⇒ ⇒ 而 `api_key` / `admin_token`
 * ⇒ ⇒ **照旧判红**（那才是材料）。
 */
export const SECRET_STORE_RE =
  /(?:^|[^A-Za-z0-9])(?:secret_?store|secretStore|SecretStore|Secrets|secrets)(?:[^A-Za-z0-9]|$)/;

/**
 * **掩码** —— 写掩码不是写材料。
 *
 * ⚠️ 这一条很重要：迁移后「读面只给掩码」这条规矩**一直都在**
 * ⇒ ⇒ 如果闸把「写掩码」判成违规 ⇒ ⇒ 会逼着人把掩码去掉 ⇒ ⇒ 反而更危险。
 */
export const MASK_RE = /\*{3,}|MASKED|REDACTED|REDACT/i;

/**
 * 「密钥形状」的环境变量名（`OPENAI_API_KEY` / `*_SECRET` / `*_TOKEN` …）。
 *
 * ⚠️ 必须是**全大写**的形状 ⇒ ⇒ `apiKey` / `api_key` 这类**字段名**不算
 *    （字段名在类型规则里管）⇒ ⇒ 两套判据不打架。
 */
const ENV_NAME_SRC = '[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*';

/** 落盘点：写进哪儿算「落盘」。 */
export const SINKS = [
  // Rust：文件
  { kind: 'file', langs: ['rust'], re: /\b(?:std::fs::|tokio::fs::|fs::)write\s*\(/g, valueArg: 1 },
  { kind: 'file', langs: ['rust'], re: /\bwrite_all\s*\(/g, valueArg: 0 },
  // Rust：数据库（libsql / sqlx 的 execute ⇒ 参数里带的是**值**）
  // ⚠️ `execute(` 的**第一个参数是 SQL 语句**，不是值 ⇒ ⇒ 只追第二个（参数数组）。
  //    否则表名里的 `secret` / `credential`（列名）会把每个 INSERT 都判红。
  { kind: 'db', langs: ['rust'], re: /\bexecute\s*\(/g, valueArg: 1 },
  // TS：浏览器存储 + Tauri 文件
  { kind: 'web-storage', langs: ['ts'], re: /\b(?:window\.)?(?:local|session)Storage\s*\.\s*setItem\s*\(/g, valueArg: 1 },
  { kind: 'file', langs: ['ts'], re: /\bwriteTextFile\s*\(/g, valueArg: 1 },
  // Dart：文件 + KV
  { kind: 'file', langs: ['dart'], re: /\bwriteAsString\s*\(/g, valueArg: 0 },
  { kind: 'kv', langs: ['dart'], re: /\bsetString\s*\(/g, valueArg: 1 },
  // Kotlin：SharedPreferences
  { kind: 'kv', langs: ['kotlin'], re: /\bputString\s*\(/g, valueArg: 1 },
  // ---- 三个「不是落盘、但同样会把密钥摊开」的面 ------------------
  // ⚠️ **进程环境变量** —— Linux 的 `/proc/<pid>/environ`、子进程继承、
  //    崩溃转储都读得到 ⇒ ⇒ 端脑今天就在往 `OPENAI_API_KEY` 里塞真 key。
  { kind: 'process-env', langs: ['rust'], re: new RegExp('\\bset_var\\s*\\(\\s*"' + ENV_NAME_SRC + '"\\s*,\\s*', 'g'), valueFrom: 'afterMatch' },
  { kind: 'process-env', langs: ['rust'], re: new RegExp('\\bpush\\s*\\(\\s*\\(\\s*"' + ENV_NAME_SRC + '"\\s*\\.into\\(\\)\\s*,\\s*', 'g'), valueFrom: 'afterMatch' },
  { kind: 'process-env', langs: ['rust'], re: new RegExp('\\.envs?\\s*\\(\\s*"' + ENV_NAME_SRC + '"\\s*,\\s*', 'g'), valueFrom: 'afterMatch' },
  // ⚠️ **命令行参数** —— 同用户的进程列表直接可见（`ps aux`）。
  { kind: 'process-args', langs: ['rust'], re: /\.(?:arg|args)\s*\(/g, valueArg: 0 },
  // ⚠️ **日志/标准输出** —— 设计稿 §5 说「任何日志不落 key（今天有规矩）」，
  //    但**规矩没有闸** ⇒ ⇒ 这里补上。
  //    ⚠️ 日志这一族用**名字级**判定（不看类型）⇒ ⇒ 因为
  //    `tracing::info!(count = providers.len())` 里的 `providers` 是**密钥型**
  //    ⇒ ⇒ 若按类型判 ⇒ ⇒ 每条计数日志都会误报 ⇒ ⇒ 闸会被当噪音关掉。
  { kind: 'log', langs: ['rust'], re: /\b(?:tracing::)?(?:trace|debug|info|warn|error)!\s*\(/g, valueArg: 0, nameOnly: true },
  { kind: 'log', langs: ['rust'], re: /\b(?:e?println|dbg)!\s*\(/g, valueArg: 0, nameOnly: true },
  // ---- 「广播」面 ---------------------------------------------------
  // ⚠️⚠️ **为什么这一族单独算「摊开」**：落盘 ⇒ 只有拿到盘的人能读；
  //    广播 ⇒ **同网段谁都读得到**（mDNS TXT 是**明文组播**）⇒ ⇒
  //    一把 admin token 进了 TXT ⇒ ⇒ **局域网里任何一台机器都拿到了它**。
  //
  // ⚠️⚠️ **判据只认 TXT 记录，不认 HTTP 头**（2026-11-03 实测踩出来的）：
  //    「把凭据放进发往**已知对端**的 HTTP 头」是**正常的鉴权写法**
  //    （端脑的 test_harness、前额叶打 Anthropic 上游都这样）⇒ ⇒
  //    若一并判红 ⇒ ⇒ **每个客户端都会变成红** ⇒ ⇒ ⇒ **闸被当噪音关掉**
  //    ⇒ ⇒ **那比漏报更坑**（这是本闸的第一纪律）。
  //    ⇒ ⇒ 所以「跨机传播」只抓**广播容器**（TXT 记录）——
  //    它是**明文组播**给同网段所有人的 ⇒ ⇒ 与「发给一个已知对端」不是一回事。
  { kind: 'broadcast', langs: ['rust'], re: /\b(?:txt|txt_records|properties|props)\s*(?:\.|\b)\s*(?:insert|extend)\s*\(/g, valueArg: 1 },
];

/** 「这个函数**有能力**写密钥」的判据 —— 参数里带 secret 标记 ⇒ 写入的就是材料。 */
export const SECRET_CAPABLE_PARAM_RE =
  /(^|[^A-Za-z0-9])(is_?secret|secret|secret_?value|secret_?key)([^A-Za-z0-9]|$)/i;

// ---------------------------------------------------------------------------
// 语法骨架
// ---------------------------------------------------------------------------

/** 按扩展名猜语言。 */
export function guessLang(p = '') {
  if (p.endsWith('.rs')) return 'rust';
  if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) return 'ts';
  if (p.endsWith('.dart')) return 'dart';
  if (p.endsWith('.kt')) return 'kotlin';
  return 'unknown';
}

/** 顶层块：`struct` / `interface` / `class`（含它们的 body）。 */
function extractBlocks(code) {
  const out = [];
  const re = /\b(?:struct|interface|class)\s+([A-Za-z_][\w]*)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const braceStart = code.indexOf('{', m.index + m[0].length);
    if (braceStart < 0) continue;
    const end = matchDelim(code, braceStart);
    if (end < 0) continue;
    out.push({
      name: m[1],
      body: code.slice(braceStart + 1, end),
      start: m.index,
      bodyStart: braceStart,
      bodyEnd: end,
    });
    re.lastIndex = end;
  }
  return out;
}

/**
 * 取类型文本 —— **在尖括号配平处**才停。
 *
 * ⚠️ 为什么不能按第一个逗号切：`RwLock<HashMap<String, ProviderEntry>>`
 *    会被切成 `RwLock<HashMap<String` ⇒ ⇒ **`ProviderEntry` 整个丢掉**
 *    ⇒ ⇒ 类型传递闭包断了 ⇒ ⇒ providers.json 的明文看不见。
 */
function takeTypeText(text, from) {
  let i = from;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '<') depth++;
    else if (ch === '>') {
      if (depth > 0) depth--;
    } else if ((ch === ',' || ch === ';' || ch === '\n') && depth === 0) break;
    i++;
  }
  return text.slice(from, i).trim();
}

/**
 * 字段名 + 字段类型。
 *
 * ⚠️ Rust/TS 是 `名: 类型`，Dart/Kotlin 是 `类型 名` ⇒ ⇒ 两种形状都要认。
 */
function parseFields(body) {
  const fields = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    // Rust / TS：`pub api_key: Option<String>,` / `apiKey?: string;`
    const named = /(?:pub\s+|pub\([^)]*\)\s+)?([A-Za-z_][\w]*)\s*\??\s*:\s*/.exec(line);
    if (named && !/^(?:return|else|if|match|for|while|use|pub\s+fn)$/.test(named[1])) {
      fields.push({ name: named[1], type: takeTypeText(line, named.index + named[0].length) });
      continue;
    }
    // Dart / Kotlin：`final String? apiKey;` / `String? apiKey = null;`
    const typed = /(?:final\s+|const\s+|late\s+|var\s+|val\s+)?([A-Za-z_][\w<>,?\[\]\.]*)\s+([A-Za-z_]\w*)\s*[;=]/.exec(line);
    if (typed) fields.push({ name: typed[2], type: typed[1].trim() });
  }
  return fields;
}

/** 类型文本里挑出**类型名**（`RwLock<HashMap<String, ProviderEntry>>` ⇒ 三到四个）。 */
export function typeIdents(typeText) {
  if (!typeText) return [];
  const out = [];
  const re = /[A-Za-z_][\w]*/g;
  let m;
  while ((m = re.exec(typeText)) !== null) out.push(m[0]);
  return out;
}

/**
 * 密钥型结构体的**传递闭包**。
 *
 * `AppConfig` 自己没有 `api_key` 字段，但它有 `provider_config: ProviderConfig`
 * ⇒ ⇒ 而 `ProviderConfig` 有 `api_key` ⇒ ⇒ **`AppConfig` 整体是密钥型**。
 */
function computeSecretTypes(blocks) {
  const fields = new Map();
  for (const b of blocks) fields.set(b.name, parseFields(b.body));

  const secret = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, fs] of fields) {
      if (secret.has(name)) continue;
      for (const f of fs) {
        if (SECRET_NAME_RE.test(f.name)) {
          secret.add(name);
          changed = true;
          break;
        }
        for (const t of typeIdents(f.type)) {
          if (secret.has(t)) {
            secret.add(name);
            changed = true;
            break;
          }
        }
      }
    }
  }
  return { fields, secret };
}

/** 函数骨架：名字、参数、body 范围、所属 impl/class。 */
function extractFunctions(code, lang) {
  const re =
    lang === 'rust'
      ? /\bfn\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/g
      : lang === 'ts'
        ? /\b(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:async\s*)?\()/g
        : lang === 'dart'
          ? /(?:^|\n)\s*(?:static\s+)?(?:Future<[^>]*>|Future<void>|Stream<[^>]*>|void|bool|int|String|[\w<>,?\[\]\.]+)\s+([A-Za-z_]\w*)\s*\(/g
          : /\bfun\s+([A-Za-z_]\w*)\s*\(/g;

  const fns = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1] || m[2];
    const open = code.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    const close = matchDelim(code, open);
    if (close < 0) continue;
    const paramsText = code.slice(open + 1, close);
    // body：从参数表之后找第一个 `{`
    let bodyStart = code.indexOf('{', close);
    let bodyEnd = -1;
    if (bodyStart >= 0 && bodyStart - close < 400) {
      bodyEnd = matchDelim(code, bodyStart);
      if (bodyEnd < 0) bodyEnd = code.length;
    } else {
      bodyStart = close;
      bodyEnd = Math.min(code.length, close + 400);
    }
    fns.push({
      name,
      start: m.index,
      paramText: paramsText,
      bodyStart,
      bodyEnd,
      scope: code.slice(bodyStart, bodyEnd),
    });
    re.lastIndex = Math.max(re.lastIndex, close + 1);
  }
  return fns;
}

/** 参数 ⇒ `[{name, type}]`。 */
function parseParams(paramText, lang) {
  const out = [];
  for (const raw of splitTopLevel(paramText)) {
    const p = raw.trim();
    if (!p) continue;
    if (lang === 'rust' || lang === 'ts') {
      // ⚠️ axum 的**解构提取器**：`Json(req): Json<LlmConfigureRequest>`
      //    ⇒ ⇒ 参数名在括号里，类型在冒号后面 ⇒ ⇒ 不认它 ⇒ ⇒ 参数类型追不到
      //    ⇒ ⇒ 那一条写盘（llm_configure.rs）就**看不见**。
      const ext = /^\s*[A-Za-z_][\w]*\s*\(\s*([A-Za-z_][\w]*)\s*\)\s*:\s*(.+)$/.exec(p);
      if (ext) {
        out.push({ name: ext[1], type: ext[2].trim() });
        continue;
      }
      const m = /([A-Za-z_][\w$]*)/.exec(p);
      if (!m) continue;
      const colon = p.indexOf(':', m.index + m[0].length - 1);
      out.push({ name: m[1], type: colon >= 0 ? takeTypeText(p, colon + 1) : '' });
    } else {
      const m = /([A-Za-z_][\w<>,?\[\]\.]*)\s+([A-Za-z_]\w*)\s*(?:=.*)?$/.exec(p);
      if (m) out.push({ name: m[2], type: m[1].trim() });
    }
  }
  return out;
}

/** 按顶层逗号切参数/实参。 */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  let inStr = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\') {
        cur += text[++i] ?? '';
      } else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') depth--;
    if (ch === ',' && depth <= 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** 赋值右值：`let x = …` / `const x = …` / `final x = …` / `x := …`。 */
function findAssignment(scope, ident) {
  const esc = ident.replace(/\$/g, '\\$');
  const patterns = [
    new RegExp('\\b(?:let\\s+mut|let|const|final|var|val)\\s+' + esc + '\\s*(?::\\s*[^=;\\n]+)?=\\s*'),
    new RegExp('\\b' + esc + '\\s*:=\\s*'),
  ];
  for (const re of patterns) {
    const m = re.exec(scope);
    if (!m) continue;
    const from = m.index + m[0].length;
    // 右值取到**下一个** `;` / 换行 / 400 字符 ⇒ ⇒ 够用了。
    let depth = 0;
    let inStr = null;
    let i = from;
    for (; i < scope.length && i - from < 400; i++) {
      const ch = scope[i];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if ((ch === ';' || ch === '\n') && depth <= 0) break;
    }
    const rhs = scope.slice(from, i);
    if (rhs.trim()) return rhs;
  }
  return null;
}

/**
 * match 分支绑定 ⇒ ⇒ 这个标识符的**值**来自「被匹配的那个表达式」。
 *
 * ⚠️ 没有它就漏掉**最典型**的那一格：
 * ```rust
 * match serde_json::to_string_pretty(&*providers) {
 *     Ok(content) => { std::fs::write(path, &content)?; }   // ← content 不是 let 绑定的
 * }
 * ```
 * ⇒ ⇒ `content` 查不到赋值 ⇒ ⇒ 追踪断在这里 ⇒ ⇒ 闸看不见 providers.json 的明文。
 */
function findMatchScrutinee(scope, ident) {
  const re = /\bmatch\s+/g;
  let m;
  while ((m = re.exec(scope)) !== null) {
    const braceStart = scope.indexOf('{', m.index + m[0].length);
    if (braceStart < 0) continue;
    const end = matchDelim(scope, braceStart);
    if (end < 0) continue;
    const scrutinee = scope.slice(m.index + m[0].length, braceStart);
    const arms = scope.slice(braceStart, end);
    const binds = new RegExp(
      '\\b(?:Ok|Err|Some|None)\\s*\\(\\s*' + ident + '\\s*\\)|(^|[^\\w])' + ident + '\\s*=>',
    );
    if (binds.test(arms)) return scrutinee;
    re.lastIndex = end;
  }
  return null;
}

/**
 * 把**字符串字面量**抹成空格（长度不变）⇒ ⇒ 只在「代码」上找东西。
 *
 * ⚠️ 为什么日志这一族必须先剥：日志**文案**里出现的 "token" 是给人看的字，
 *    不是「被记下来的值」⇒ ⇒ 不剥 ⇒ ⇒ 每条提到密钥的文案都会被判成泄漏
 *    ⇒ ⇒ 闸会被当噪音关掉。
 */
export function stripStringLiterals(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // ⚠️⚠️ **Rust 的 raw string 也是字符串字面量** ⇒ ⇒ 一样要抹成空格。
    // ⇒ ⇒ 不认识它 ⇒ ⇒ 它里面的 `"api_key"` 会被当成**代码里的名字**
    // ⇒ ⇒ ⇒ 假红（那只是一段 JSON 文本，不是落盘的材料）。
    if (ch === 'r') {
      const end = rawStringEnd(text, i);
      if (end >= 0) {
        out += text.slice(i, end).replace(/[^\n]/g, ' ');
        i = end;
        continue;
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ' ';
      i++;
      while (i < text.length) {
        if (text[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          out += ' ';
          i++;
          break;
        }
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 这个标识符是不是**只被取了个元数据**（长度 / 计数 / 空不空）？
 *
 * ⚠️ 「记长度」不是泄漏 ⇒ ⇒ 不该报。
 */
const METADATA_METHODS = ['len', 'count', 'is_empty', 'chars', 'iter', 'into_iter', 'keys', 'values'];

/** 名字里的「计数/用量」成分 ⇒ ⇒ `token_count` / `prompt_len` 不是密钥。 */
const METADATA_WORDS = new Set(['count', 'len', 'size', 'usage', 'num', 'number', 'total', 'prompt', 'completion']);

function isMetadataUse(text, ident) {
  const re = new RegExp(
    '\\b' + ident.replace(/\$/g, '\\$') + '\\s*\\.\\s*(?:' + METADATA_METHODS.join('|') + ')\\s*\\(',
  );
  return re.test(text);
}

/** 标识符（跳过方法名与关键字）。 */
function identifiers(text) {
  const out = [];
  const re = /([A-Za-z_][\w]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text[m.index - 1];
    if (before === '.') continue; // 方法名/字段访问 ⇒ 单独处理
    if (['fn', 'let', 'const', 'final', 'var', 'val', 'struct', 'impl', 'pub', 'self', 'Some', 'Ok', 'Err', 'match', 'if', 'else', 'return', 'true', 'false', 'null', 'undefined'].includes(m[1]))
      continue;
    out.push(m[1]);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// 上下文
// ---------------------------------------------------------------------------

function buildContext(code, lang) {
  const blocks = extractBlocks(code);
  const { fields, secret } = computeSecretTypes(blocks);
  const fns = extractFunctions(code, lang);

  /** 最近的 impl/class（Rust 的 `impl X {`、TS/Dart 的 `class X {`）。 */
  function implTypeBefore(offset) {
    const re = lang === 'rust' ? /\bimpl\s+(?:<[^>]*>\s*)?([A-Za-z_][\w]*)/g : /\bclass\s+([A-Za-z_][\w]*)/g;
    let best = null;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (m.index > offset) break;
      best = m[1];
    }
    return best;
  }

  function enclosingFn(offset) {
    let best = null;
    for (const f of fns) {
      if (f.bodyStart <= offset && offset <= f.bodyEnd) {
        if (!best || f.bodyStart > best.bodyStart) best = f;
      }
    }
    if (best) return best;
    // 兜底：取**最近的前置**函数（代码在顶层的情况）。
    for (const f of fns) {
      if (f.start <= offset && (!best || f.start > best.start)) best = f;
    }
    return best;
  }

  /** 类型文本里有没有密钥型类型（传递闭包已在 `secret` 里算好了）。 */
  function isSecretTypeChain(typeText) {
    if (!typeText) return false;
    for (const t of typeIdents(typeText)) {
      if (secret.has(t)) return true;
    }
    return false;
  }

  return {
    code,
    lang,
    blocks,
    fields,
    blockNames: new Set(blocks.map((b) => b.name)),
    secretTypes: secret,
    fns,
    implTypeBefore,
    enclosingFn,
    isSecretTypeChain,

    /** 参数类型（按名字）。 */
    findParamType(ident, fn) {
      if (!fn) return null;
      for (const p of parseParams(fn.paramText, lang)) {
        if (p.name === ident) return p.type;
      }
      return null;
    },

    /**
     * 字段类型（`self.x` / `this.x`）⇒ ⇒ 返回 `{name, type}`。
     *
     * ⚠️ 字段名本身也要判（`api_key: Option<String>` 的类型是 `Option<String>`，
     * 看类型看不出是密钥 ⇒ ⇒ **必须连名字一起看**）。
     */
    findField(ident, fn) {
      const scope = fn ? fn.scope : code;
      const re = new RegExp('\\b(?:self|this)\\s*\\.\\s*' + ident.replace(/\$/g, '\\$') + '\\b');
      if (!re.test(scope)) return null;
      const owner = implTypeBefore(fn ? fn.start : 0);
      if (!owner) return null;
      const fs = fields.get(owner);
      if (!fs) return null;
      for (const f of fs) if (f.name === ident) return f;
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// 追踪
// ---------------------------------------------------------------------------

/**
 * 追一个值表达式 ⇒ ⇒ 看它是不是密钥材料。
 *
 * @returns {{kind:'secret'|'ref', via:string, detail:string}|null}
 *   `kind:'ref'` = 追到的是**引用**（安全）；`kind:'secret'` = 材料。
 */
function traceValue(text, ctx, fn, depth, visited, chain = []) {
  if (depth > 3) return null;
  if (!text) return null;

  // 引用式 ⇒ 安全（**先判** ⇒ ⇒ 否则 `secret_ref` 会被 "secret" 误判）。
  if (SECRET_REF_RE.test(text)) return { kind: 'ref', via: 'ref', detail: '引用式密钥' };

  // 掩码不是材料（写 `********` / `REDACTED` ⇒ ⇒ 那不是密钥）。
  if (MASK_RE.test(text)) return null;

  const scope = fn ? fn.scope : ctx.code;

  // ①a **成分级**判定（camelCase 也要认 ⇒ ⇒ `telencephalonAdminToken` 算）。
  //
  // ⚠️ 两条排除，否则会误报：
  //   ① **已知的干净类型** ⇒ ⇒ `IssuedCredential`（存的是 jti/principal/kid，
  //      不是材料）不该因为名字里有 "Credential" 就判红 ⇒ ⇒ 类型规则说了算。
  //   ② **函数调用** ⇒ ⇒ `is_secret_key(...)` 是「判断这个键是不是凭据」的函数，
  //      不是材料本身。
  const called = new Set();
  const cre = /([A-Za-z_]\w*)\s*\(/g;
  let cm;
  while ((cm = cre.exec(text)) !== null) called.add(cm[1]);
  const exempt = (ident) =>
    isBoolFlag(ident, fn, ctx) ||
    called.has(ident) ||
    (ctx.blockNames.has(ident) && !ctx.secretTypes.has(ident));
  for (const ident of identifiers(text)) {
    if (!isSecretIdentifier(ident)) continue;
    if (exempt(ident)) continue;
    // ⚠️ **类型名（大写开头且含小写）不由名字判** —— 一个类型是不是密钥，
    //    由它的**字段**决定，不由它叫什么决定。
    //    ⇒ `IssuedCredential`（存的是 jti/principal/kid，**不是材料**）不判红；
    //    ⇒ 而它若真的带密钥字段 ⇒ ⇒ **类型规则**会抓（字段闭包）⇒ ⇒ 不漏。
    if (/^[A-Z]/.test(ident) && /[a-z]/.test(ident)) continue;
    // ⚠️⚠️ **密钥仓库本身不是材料**（2026-11-03）—— 它装的是**引用**。
    // ⇒ ⇒ 不豁免 ⇒ ⇒ 端脑配置中心那条「密封后入库」会被判成明文落盘
    // ⇒ ⇒ ⇒ **假红** ⇒ ⇒ 而假红比漏报更坑（闸会被当噪音关掉）。
    if (SECRET_STORE_RE.test(ident)) continue;
    chain.push(`名字 ${ident}`);
    return { kind: 'secret', via: 'name', detail: ident };
  }

  // ①b 文本级判定（**逐个匹配** ⇒ ⇒ 好把「布尔标志位」剔掉）。
  //
  // ⚠️ 为什么标志位要剔：配置中心的 `params![…, secret, …]` 里那个 `secret`
  //    是**标志位**（bool），材料是另一个参数 ⇒ ⇒ 不剔 ⇒ 每个 INSERT 都判红。
  const nameRe = new RegExp(SECRET_NAME_RE.source, 'gi');
  let nm;
  while ((nm = nameRe.exec(text)) !== null) {
    const ident = identAt(text, nm.index);
    if (ident && exempt(ident)) continue;
    // ⚠️⚠️ **密钥仓库本身不是材料**（2026-11-03）—— 见 `SECRET_STORE_RE`。
    // ⇒ ⇒ 「`secrets`（仓库）」不该判红 ⇒ ⇒ 否则端脑那条「密封后入库」
    // ⇒ ⇒ ⇒ 变成**假红** ⇒ ⇒ 而假红比漏报更坑。
    if (ident && SECRET_STORE_RE.test(ident)) continue;
    chain.push(`名字 ${nm[0].trim()}`);
    return { kind: 'secret', via: 'name', detail: nm[0].trim() };
  }

  // ② 类型
  for (const t of typeIdents(text)) {
    if (ctx.secretTypes.has(t)) {
      chain.push(`类型 ${t}`);
      return { kind: 'secret', via: 'type', detail: t };
    }
  }

  // ③ 逐个目标追
  for (const t of targets(text)) {
    // ③a 字段类型（`self.x` / `this.x`）—— ⚠️ **不受 visited 约束**：
    //    同一个标识符可能先走「值」再走「类型」，两者不是同一条链。
    if (t.isField) {
      const field = ctx.findField(t.name, fn);
      if (field) {
        // ⚠️⚠️ **密钥仓库本身不是材料**（2026-11-03）—— 它装的是**引用**。
        // ⇒ ⇒ 「`self.secrets`（仓库）」不该判红 ⇒ ⇒ 否则端脑那条
        // ⇒ ⇒ 「密封后入库」会变成**假红** ⇒ ⇒ 而假红比漏报更坑。
        if (SECRET_STORE_RE.test(field.name)) continue;
        if (SECRET_NAME_RE.test(field.name)) {
          chain.push(`字段名 ${field.name}`);
          return { kind: 'secret', via: 'field-name', detail: `${field.name}: ${field.type}` };
        }
        if (ctx.isSecretTypeChain(field.type)) {
          chain.push(`字段类型 ${field.name}: ${field.type}`);
          return { kind: 'secret', via: 'field-type', detail: `${field.name}: ${field.type}` };
        }
      }
    }

    // ③b 参数类型
    const ptype = ctx.findParamType(t.name, fn);
    if (ptype && ctx.isSecretTypeChain(ptype)) {
      chain.push(`参数类型 ${t.name}: ${ptype}`);
      return { kind: 'secret', via: 'param', detail: `${t.name}: ${ptype}` };
    }

    // ③c 值的一跳（这里才防环）
    if (visited.has(t.name)) continue;
    visited.add(t.name);
    // ⚠️ **模块级**的常量不在函数作用域里 ⇒ ⇒ 找不到就退到**文件级**再找一次
    //    （web 版 `const STORAGE_KEY = 'shadow-admin-token'` 就在模块顶层）。
    const rhs =
      findAssignment(scope, t.name) ??
      findAssignment(ctx.code, t.name) ??
      findMatchScrutinee(scope, t.name) ??
      findMatchScrutinee(ctx.code, t.name);
    if (rhs) {
      chain.push(`值 ${t.name}`);
      const r = traceValue(rhs, ctx, fn, depth + 1, visited, chain);
      if (r && r.kind === 'secret') return r;
      if (r && r.kind === 'ref') return r;
    }
  }
  return null;
}

/**
 * 这个标识符是不是**布尔标志位**（`secret: bool` / `is_secret: bool`）？
 * ⇒ ⇒ 标志位**不是材料** ⇒ ⇒ 不能拿它当「密钥流到落盘点」的证据。
 */
function isBoolFlag(ident, fn, ctx) {
  const ptype = ctx.findParamType(ident, fn);
  return !!ptype && /\bbool\b/.test(ptype);
}

/**
 * **camelCase 感知的**「这个标识符是不是密钥名」。
 *
 * ⚠️ 为什么不能只靠 `SECRET_NAME_RE`：那个正则的词边界要求「非字母数字」，
 *    而 camelCase 的**词首是大写字母**（前面是字母）⇒ ⇒
 *    `telencephalonAdminToken` 里的 "AdminToken" **没有左边界** ⇒ ⇒ 漏。
 *    ⇒ ⇒ 移动端那份「admin token ＋ shadow key 写进 app 私有目录」就抓不到。
 *
 * ⇒ ⇒ 这里按**成分**切（snake_case 与 camelCase 都切）再逐个判。
 */
export function splitComponents(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

const SECRET_COMPONENTS = new Set([
  'apikey', 'secret', 'secrets', 'password', 'passwd', 'passphrase',
  'token', 'credential', 'credentials', 'pem', 'privatekey', 'signingkey',
]);

/** 「修饰词 ＋ key/token」才算（`apiKey` ✓ / `apiUrl` ✗ / `storageKey` ✗）。 */
const SECRET_KEY_MODIFIERS = new Set([
  'api', 'shadow', 'secret', 'private', 'access', 'encryption', 'refresh',
  'bearer', 'signing', 'master', 'admin',
]);

export function isSecretIdentifier(name) {
  const comps = splitComponents(name).map((c) => c.toLowerCase());
  for (const c of comps) if (SECRET_COMPONENTS.has(c)) return true;
  for (let i = 1; i < comps.length; i++) {
    if (SECRET_KEY_MODIFIERS.has(comps[i - 1]) && (comps[i] === 'key' || comps[i] === 'token')) return true;
  }
  return false;
}

/** 命中位置所在的**标识符**（把 `CREDENTIAL_FILE_ENV` 这种整段取出来）。 */
function identAt(text, index) {
  // ⚠️ 匹配位置带的是**前导边界** ⇒ ⇒ 边界可能是空白（那就向前找词首），
  //    也可能是下划线（那就**连着往左扩** ⇒ ⇒ `is_secret_key` 里的
  //    `_secret_` 要还原成**整段** `is_secret_key`，否则「函数名」豁免不生效）。
  let s = index;
  let e = index;
  while (s > 0 && /[A-Za-z0-9_]/.test(text[s - 1])) s--;
  while (e < text.length && /[A-Za-z0-9_]/.test(text[e])) e++;
  if (e > s) return text.slice(s, e);
  let i = index;
  while (i < text.length && !/[A-Za-z0-9_]/.test(text[i])) i++;
  let j = i;
  while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
  return text.slice(i, j) || null;
}

/**
 * 追踪的**目标**列表：普通标识符 ＋ `self.x` / `this.x` 字段访问。
 *
 * ⚠️ 字段访问要**单独**列出来：`identifiers()` 会跳过「前面是 `.` 的词」
 *    （那是方法名）⇒ ⇒ `self.providers` 里的 `providers` 就被跳过了
 *    ⇒ ⇒ 字段类型这一跳永远走不到 ⇒ ⇒ providers.json 的明文就看不见。
 */
function targets(text) {
  const out = [];
  const seen = new Set();
  const fre = /\b(?:self|this)\s*\.\s*([A-Za-z_]\w*)/g;
  let fm;
  while ((fm = fre.exec(text)) !== null) {
    if (!seen.has(fm[1])) {
      seen.add(fm[1]);
      out.push({ name: fm[1], isField: true });
    }
  }
  for (const ident of identifiers(text)) {
    if (!seen.has(ident)) {
      seen.add(ident);
      out.push({ name: ident, isField: false });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 扫一个源文件 ⇒ ⇒ 找出「密钥材料落盘」的点。
 *
 * @param {string} code 源文件全文
 * @param {{path?: string, lang?: string}} opts
 */
export function detectSecretPersistence(code, opts = {}) {
  const lang = opts.lang || guessLang(opts.path || '');
  let src = stripComments(code, { nested: lang === 'rust', rust: lang === 'rust' });
  if (lang === 'rust') src = stripTestModules(src);

  const lineOf = makeLineIndex(src);
  const ctx = buildContext(src, lang);
  const findings = [];

  for (const sink of SINKS) {
    if (sink.langs && !sink.langs.includes(lang)) continue;
    const re = new RegExp(sink.re.source, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      // ⚠️ **回找**最后一个 '(' ⇒ ⇒ 兼容「正则不以 '(' 结尾」的那几族
      //    （进程环境变量那族的匹配到**逗号**为止 ⇒ ⇒ 向前 indexOf 会找到
      //    **下一个** '('（甚至找不到 ⇒ ⇒ 整条被跳过 ⇒ ⇒ 假绿））。
      const open = src.lastIndexOf('(', m.index + m[0].length);
      let valueText;
      if (sink.valueFrom === 'afterMatch') {
        // ⚠️ 这一族的「值」在**匹配之后**（名字字面量已被吃掉）⇒ ⇒ **不能靠括号配平**
        //    （括号在匹配**之前** ⇒ ⇒ 配平切出来是空的 ⇒ ⇒ 假绿）⇒ ⇒ 按**语句结束**切。
        const from = m.index + m[0].length;
        let to = from;
        while (to < src.length && src[to] !== ';' && src[to] !== '\n') to++;
        valueText = src.slice(from, to);
      } else {
        if (open < 0 || open < m.index) continue;
        const close = matchDelim(src, open);
        if (close < 0) continue;
        const args = splitTopLevel(src.slice(open + 1, close));
        if (sink.kind === 'db') {
        // ⚠️ SQL 语句里有逗号 ⇒ ⇒ 按逗号切参数会切碎 ⇒ ⇒ **只认 `params![…]`**。
          const paramsArg = args.find((a) => /^\s*params!/.test(a));
          valueText = paramsArg ?? args.slice(1).join(', ');
        } else {
          valueText = args.slice(sink.valueArg ?? 0).join(', ');
        }
      }
      if (!valueText.trim()) continue;

      const fn = ctx.enclosingFn(m.index);
      const chain = [];
      let hit;
      if (sink.nameOnly) {
        // ⚠️ **名字级**判定：只看「这个表达式里有没有**密钥名**」。
        //    （不看类型 ⇒ ⇒ 计数类日志里的 providers 是密钥型但**不是密钥材料**）
        // ⚠️ 先剥**字符串字面量** ⇒ ⇒ 日志**文案**里的 token 字样不算值。
        const codeOnly = stripStringLiterals(valueText);
        // ⚠️ 日志这一族要**连字段名一起看**（`?e.api_key` 的 `api_key` 前面有 `.`
        //    ⇒ ⇒ 普通的 identifiers() 会跳过它 ⇒ ⇒ 看不见 ⇒ ⇒ 用「全部词」）。
        const allWords = codeOnly.match(/[A-Za-z_][\w]*/g) ?? [];
        const hitIdent = allWords.find(
          (id) =>
            isSecretIdentifier(id) &&
            !isMetadataUse(codeOnly, id) &&
            // ⚠️ `token_count` / `prompt_len` 这类**计数名**不是密钥
            !splitComponents(id).some((c) => METADATA_WORDS.has(c.toLowerCase())),
        );
        if (hitIdent) {
          chain.push(`名字 ${hitIdent}`);
          hit = { kind: 'secret', via: 'name', detail: hitIdent };
        }
      } else {
        hit = traceValue(valueText, ctx, fn, 0, new Set(), chain);
      }
      if (!hit || hit.kind !== 'secret') continue;

      findings.push({
        line: lineOf(m.index),
        kind: sink.kind,
        via: hit.via,
        detail: hit.detail,
        call: m[0].trim(),
        value: valueText.replace(/\s+/g, ' ').trim().slice(0, 120),
        chain,
      });
    }
  }

  // ④ 「这个函数**有能力**写密钥」—— 参数里带 secret 标记 ⇒ 写进去的就是材料。
  for (const fn of ctx.fns) {
    const params = parseParams(fn.paramText, lang);
    if (!params.some((p) => SECRET_CAPABLE_PARAM_RE.test(p.name))) continue;
    const scope = fn.scope;
    const hasDbWrite = /\bexecute\s*\(|\bINSERT\s+INTO\b/i.test(scope);
    if (!hasDbWrite) continue;
    findings.push({
      line: lineOf(fn.start),
      kind: 'db-secret-capable',
      via: 'secret-capable-param',
      detail: params.filter((p) => SECRET_CAPABLE_PARAM_RE.test(p.name)).map((p) => p.name).join(','),
      call: `fn ${fn.name}`,
    });
  }

  return { findings, lang };
}

/**
 * 扫一个源文件 ⇒ ⇒ 找出「**从明文存储里读密钥**」的点。
 *
 * ⚠️ 这是**另一种**风险：web 版的 admin token 由运维**手工**放进 localStorage
 * ⇒ ⇒ 代码里**没有写盘点**（闸抓不到）⇒ ⇒ 但「读」的那一行证明**那张明文表是活的**。
 */
export function detectPlaintextSecretReads(code, opts = {}) {
  const lang = opts.lang || guessLang(opts.path || '');
  let src = stripComments(code, { nested: lang === 'rust', rust: lang === 'rust' });
  // ⚠️⚠️ **测试模块要抹掉** —— 测试夹具里的 read_to_string
  // ⇒ ⇒ 会被判成「从明文存储里读密钥」⇒ ⇒ **假红**。
  // ⚠️ **写面那一族（detectSecretPersistence）早就抹了** ⇒ ⇒
  // ⇒ ⇒ **两族口径必须一致** ⇒ ⇒ 否则「写面不报、读面报」⇒ ⇒
  // ⇒ ⇒ 同一个文件一半绿一半红 ⇒ ⇒ 看着像「真问题」⇒ ⇒ 其实不是。
  if (lang === 'rust') src = stripTestModules(src);
  const lineOf = makeLineIndex(src);
  const ctx = buildContext(src, lang);
  const findings = [];

  const reads = [
    { kind: 'web-storage-read', langs: ['ts'], re: /\b(?:window\.)?(?:local|session)Storage\s*\.\s*getItem\s*\(/g, keyArg: 0 },
    { kind: 'file-read', langs: ['rust'], re: /\bread_to_string\s*\(/g, keyArg: 0 },
  ];

  for (const sink of reads) {
    if (sink.langs && !sink.langs.includes(lang)) continue;
    const re = new RegExp(sink.re.source, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const open = src.lastIndexOf('(', m.index + m[0].length);
      if (open < 0 || open < m.index) continue;
      const close = matchDelim(src, open);
      if (close < 0) continue;
      const args = splitTopLevel(src.slice(open + 1, close));
      const keyText = args[sink.keyArg] ?? '';
      if (!keyText.trim()) continue;
      const fn = ctx.enclosingFn(m.index);
      const hit = traceValue(keyText, ctx, fn, 0, new Set());
      if (!hit || hit.kind !== 'secret') continue;
      findings.push({
        line: lineOf(m.index),
        kind: sink.kind,
        via: hit.via,
        detail: hit.detail,
        call: m[0].trim(),
      });
    }
  }
  return { findings, lang };
}
