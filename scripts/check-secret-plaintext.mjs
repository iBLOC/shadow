#!/usr/bin/env node
/**
 * **「密钥不许明文落盘」闸** —— 明文密钥存储的守卫。
 *
 * ## 为什么要有这个闸
 *
 * 大脑的密钥仓库（设计稿：`docs/superpowers/architecture/2026-11-02-brain-secret-store-keyring.md`）
 * 要把「云端供应商 API key ＋ 其它密钥」从**明文**搬进 OS 凭据仓库
 * （Windows Credential Manager / macOS Keychain / Android Keystore）。
 *
 * ⚠️⚠️ **搬迁这件事本身会漏** —— 闸管的是**代码**：
 * 「不许**新增**一处明文密钥落盘点」⇒ ⇒ 存量搬完了，债务清零，
 * ⇒ ⇒ **新的明文不许再进来**。
 *
 * ⚠️⚠️ **为什么不能只有「搬」没有「守」** —— 搬完就收工 ⇒ ⇒ 下一个人
 * 写了个 `fs::write(path, &provider)` ⇒ ⇒ 密码又回去了 ⇒ ⇒ 而没人会注意到
 * （**明文落盘不报错**，它只是「正常地工作」）⇒ ⇒ 这条路必须**有闸**。
 *
 * ## 闸门抓什么
 *
 * ① **明文密钥落盘点** —— 把**密钥材料**写进文件 / 数据库 / 浏览器存储 / KV。
 * ② **从明文存储里读密钥** —— 读面证明**那张明文表是活的**（web 版的
 *    `localStorage['shadow-admin-token']` 没有任何代码写它 ⇒ ⇒ 写盘点抓不到
 *    ⇒ ⇒ 读盘点才抓得到）。
 * ②' **另外三个「不是落盘、但同样摊开」的面** —— **进程环境变量**（子进程继承 /
 *    `/proc/<pid>/environ` / 崩溃转储）、**命令行参数**（`ps` 同用户可见）、
 *    **日志**（设计稿 §5 写着「任何日志不落 key」，但**规矩没有闸** ⇒ ⇒ 这里补上）。
 * ③ **债务不许变多** —— 下面那张**债务清单**是今天的实测盘点；
 *    清单之外的新落盘点 ⇒ ⇒ **闸红**。
 * ④ **债务还了要销账** —— 清单里的某一处被修好之后 ⇒ ⇒ 那个文件不再有
 *    对应命中 ⇒ ⇒ **闸红**（提示把清单条目删掉）⇒ ⇒ 清单会**自己变短**。
 *
 * ## ⚠️ 债务清单不是「已知问题」的黑洞
 *
 * 每一条都写清楚「**为什么还没搬**」＋「**什么时候搬**」⇒ ⇒ 否则它会变成
 * 一张永远没人还的清单。清单的条目数**只会变少**（④ 就是逼它变少的机制）。
 *
 * ## 覆盖边界（**如实标注，别装作全覆盖**）
 *
 * - 查得出：源码里能看出来的明文落盘（文件 / DB / localStorage / SharedPreferences）。
 * - 查不出：① 经过中间层**隐式**落盘；② **运行时拼出来**的路径/键名；
 *   ③ 日志、崩溃转储里的泄漏；④ **已经写出去的历史数据**（闸管代码，不管盘上已有的）。
 * - 判据是**静态数据流**（最多 3 跳）⇒ ⇒ 超过 3 跳的间接流可能漏。
 *
 * ## 退出码
 *
 * - 0：绿（没有新的明文落盘点，债务清单也准）；
 * - 1：**红**（有新的落盘点，或债务清单过期）；
 * - 2：**读不到源**（一个文件都没扫到）⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-secret-plaintext.mjs
 * node scripts/check-secret-plaintext.mjs --self-test
 * node scripts/check-secret-plaintext.mjs --json
 * node scripts/check-secret-plaintext.mjs --source C:/Projects/iBLOC/telencephalon
 * ```
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectSecretPersistence, detectPlaintextSecretReads } from './lib/secret-persistence.mjs';

const HERE = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
const REPO = resolve(HERE, '..');

/**
 * **债务清单** —— 今天的实测盘点（2026-11-03）。
 *
 * ⚠️ 身份是「仓库 ＋ 文件 ＋ 命中种类 ＋ **命中条数**」⇒ ⇒
 *    **不依赖行号**（行号会被人挪）⇒ ⇒ 只在**数量变了**时才报过期。
 */
export const KNOWN_DEBT = [
  {
    repo: 'telencephalon',
    file: 'src/api/providers.rs',
    kind: 'file',
    count: 1,
    why: '供应商表整份落盘（含 api_key 明文）—— 读面只给掩码，落盘不掩码',
    when: 'P2（provider 改写成引用式：盘上只留 {"$secret":…}）',
  },
  // ✅ **已销账（2026-11-03）**：`src/api/llm_configure.rs` 那条 `file`
  //    ⇒ ⇒ 端脑把落盘那份改成「**不含任何材料**的记录」（材料进密钥仓库，
  //    盘上只留一个引用）⇒ ⇒ 命中归零 ⇒ ⇒ ⇒ **这条债真的还掉了**
  //    ⇒ ⇒ （不是「探测器报得少了」⇒ ⇒ 端脑那条 `file` 命中确实没了）。
  //    ⇒ ⇒ 顺带发现：那份文件**从来没有人读**（全工作区 grep 过）⇒ ⇒
  //    ⇒ ⇒ 里面的明文一直是**纯粹的泄漏** ⇒ ⇒ 现在那份记录只剩「配置成什么样」。
  {
    repo: 'telencephalon',
    file: 'src/api/llm_configure.rs',
    kind: 'process-env',
    count: 4,
    why: 'api_key 被塞进**进程环境变量**（OPENAI / ANTHROPIC / MIMO / DEEPSEEK_API_KEY）—— 子进程继承、/proc/<pid>/environ、崩溃转储都读得到',
    when: 'P2/P4（子进程改由大脑解析密钥后注入，不再走环境变量）—— ⚠️ 2026-11-03 实测：它的**唯一**消费者是 `api/llm_description.rs`（调用时读）⇒ ⇒ 所以不是死路；但环境变量**活不过进程**（重启反而带走这把 key）⇒ ⇒ 且 `neuron_embed.rs` 的模块文档写明「环境变量那条路在手机上走不通」（Android 10+ 连 /proc/<pid>/environ 都读不到）⇒ ⇒ ⇒ 真正让叶区跑起来的是 **provider → register_remote_llm** 那条程序化通道',
  },
  {
    repo: 'telencephalon',
    file: 'src/config_center/store.rs',
    kind: 'db-secret-capable',
    count: 1,
    why: '配置中心的写入函数**能**写凭据（secret 标志位只管读面脱敏，材料原样入库）',
    when: 'P2（凭据进密钥仓库，表里只留引用）',
  },
  {
    repo: 'telencephalon',
    file: 'src/security/credential_signer.rs',
    kind: 'file',
    count: 1,
    why: '签名私钥 PEM 明文落盘（Unix 下 0600）',
    when: 'P2b（私钥进密钥仓库 / 平台密钥库）',
  },
  {
    repo: 'telencephalon',
    file: 'src/security/credential_signer.rs',
    kind: 'file-read',
    count: 1,
    why: '从盘上读那份私钥 PEM（写的对面）',
    when: 'P2b（同上）',
  },
  {
    repo: 'telencephalon',
    file: 'src/security/hippo_credential.rs',
    kind: 'file-read',
    count: 1,
    why: '从文件读海马体凭据（HIPPOCAMPUS_CREDENTIAL_FILE）',
    when: 'P2b（同上）',
  },
  {
    repo: 'desktop',
    file: 'src/lib/adminToken.ts',
    kind: 'web-storage-read',
    count: 1,
    why: 'web 版从 localStorage 取 admin token（**没有任何代码写它** ⇒ ⇒ 运维手工放 ⇒ ⇒ 明文浏览器存储）',
    when: 'P2c（web 版走密钥仓库 / 服务端代理）',
  },
  {
    repo: 'desktop',
    file: 'src-tauri/src/admin_token.rs',
    kind: 'file',
    count: 1,
    why: 'admin token 明文落盘（Unix 0600）',
    when: 'P2c（同上）',
  },
  {
    repo: 'desktop',
    file: 'src-tauri/src/config_manager.rs',
    kind: 'file',
    count: 1,
    why: '桌面配置整份落盘（含 provider api_key ＋ 数据库 password）',
    when: 'P2（同 provider 那条）',
  },
  {
    repo: 'mobile',
    file: 'lib/services/app_config_service.dart',
    kind: 'file',
    count: 1,
    why: 'app 私有目录的 JSON 里存着 admin token ＋ shadow key（**Android 无安全存储**）',
    when: 'P2d（android-native-keyring-store）',
  },
  // ---- synapse（2026-11-03 补进覆盖面）-------------------------------
  // ⚠️⚠️ **为什么补它**：端脑的 `Cargo.toml` 里是 `synapse = { path = "../synapse" }`
  // ⇒ ⇒ **它被编译进端脑** ⇒ ⇒ 而闸只扫 `telencephalon/src` ⇒ ⇒
  // ⇒ ⇒ **它那两套 provider 存储**（明文 / 加密）**一个都看不见** ⇒ ⇒
  // ⇒ ⇒ 这跟「库仓 ≠ 宿主仓」是**同一个病**：**编译进去的仓也要扫**。
  {
    repo: 'synapse',
    file: 'src/providers/config/store.rs',
    kind: 'file',
    count: 1,
    why: '**明文**那套 FileStore 把整份 ProviderConfig（含 api_key）写盘',
    when: 'P2（改成引用式 / 或者干脆删掉这套明文存储）—— ⚠️ 2026-11-03 实测：端脑今天用 `ProviderManager::builder()` ⇒ ⇒ 默认是 **InMemoryStore** ⇒ ⇒ **这条今天没有活路径**；但它是**公开 API**，谁调谁中招',
  },
  {
    repo: 'synapse',
    file: 'src/providers/config/encrypted_store.rs',
    kind: 'file',
    count: 1,
    why: '⚠️ **已知假红**：写出去的是**密文**（`encryptor.encrypt(&json)`）⇒ ⇒ 不是材料；但探测器的链追到了「password」⇒ ⇒ 它证明不了 ⇒ ⇒ 登记在册',
    when: '—— ⚠️⚠️ **另有一笔真问题，闸抓不到**：`with_data_dir` 用的默认密码是 `sha256("synapse-default-key")`（**源码里的常量**）⇒ ⇒ ⇒ 「加密」可被任何人还原 ⇒ ⇒ ⇒ 那条路要么换成真钥匙环，要么别用',
  },
];

/**
 * 扫描的根。
 *
 * ⚠️⚠️ **「端脑」不止一个仓**（2026-11-03 补）：端脑在 2026-10 的重构后
 * 变成了 **pure library**（`dc53fcb refactor: pure library — standalone binary
 * removed, boot moves to encephalon`）⇒ ⇒ **真正把它跑起来的是 `encephalon`**
 * （那里 spawn 了广播循环、递了 admin token）⇒ ⇒ 只扫 `telencephalon/src`
 * ＝ **只扫了库，没扫宿主** ⇒ ⇒ 宿主里的落盘点一个都看不见。
 *
 * ⇒ ⇒ 现在扫 **5 个仓**：端脑库 + 端脑宿主 + 前额叶 + 桌面端 + 移动端。
 * ⚠️ 这三个新仓在 2026-11-03 加入时实测**零命中** ⇒ ⇒ 覆盖面扩大而**不引入假红**。
 */
export function scanRoots(sourceArg, extraRoots = []) {
  const endbrain = sourceArg ?? resolve(REPO, '..', 'telencephalon');
  const sibling = (name) => resolve(REPO, '..', name);
  return [
    { repo: 'telencephalon', root: endbrain, sub: 'src' },
    // ⚠️ **端脑的宿主**（端脑改成 pure library 之后，它才是真正跑起来的那一个）。
    { repo: 'encephalon', root: sibling('encephalon'), sub: 'src' },
    // ⚠️ 前额叶：叶区侧的那一半（它自己也有存储面）。
    { repo: 'prefrontal', root: sibling('prefrontal'), sub: 'src' },
    // ⚠️⚠️ **synapse 是被编译进端脑的那一个**（`synapse = { path = "../synapse" }`）
    //    ⇒ ⇒ 它那两套 provider 存储（明文 / 加密）也必须进覆盖面
    //    ⇒ ⇒ 否则「编译进去的仓」就是**扫不到的洞**。
    { repo: 'synapse', root: sibling('synapse'), sub: 'src' },
    { repo: 'desktop', root: join(REPO, 'shadow-desktop'), sub: 'src' },
    { repo: 'desktop', root: join(REPO, 'shadow-desktop'), sub: 'src-tauri/src' },
    { repo: 'mobile', root: join(REPO, 'shadow-mobile'), sub: 'lib' },
    // ⚠️ `--root` 追加的根：**只用于反向验证**（在隔离目录里注入缺陷 ⇒ ⇒ 不碰同伴在飞的文件）。
    ...extraRoots.map((p) => ({ repo: 'probe', root: p, sub: '.' })),
  ];
}

const EXTS = new Set(['.rs', '.ts', '.tsx', '.js', '.dart', '.kt']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'target' || e === '.git' || e === 'build') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(p.slice(p.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

/** 测试代码不算落盘点（测试里会造假的明文）。 */
function isTestPath(p) {
  return /[\\/](__tests__|tests?|test)[\\/]/.test(p) || /\.test\.|_test\.dart$/.test(p);
}

/** 扫一遍 ⇒ ⇒ 每条命中带上「仓库 / 文件 / 行 / 种类 / 证据链」。 */
export function scanAll(sourceArg, extraRoots = []) {
  const findings = [];
  let filesRead = 0;
  const missing = [];
  for (const { repo, root, sub } of scanRoots(sourceArg, extraRoots)) {
    const base = join(root, sub);
    if (!existsSync(base)) {
      missing.push(base);
      continue;
    }
    for (const f of walk(base)) {
      if (isTestPath(f)) continue;
      const code = readFileSync(f, 'utf8');
      filesRead++;
      const rel = relative(root, f).replace(/\\/g, '/');
      for (const x of detectSecretPersistence(code, { path: f }).findings) {
        findings.push({ repo, file: rel, ...x });
      }
      for (const x of detectPlaintextSecretReads(code, { path: f }).findings) {
        findings.push({ repo, file: rel, ...x });
      }
    }
  }
  return { findings, filesRead, missing };
}

const keyOf = (f) => `${f.repo}|${f.file}|${f.kind}`;

/**
 * 拿实测命中去对债务清单 ⇒ ⇒ 分成「新增」与「清单过期」两类。
 *
 * ⚠️ **纯函数** ⇒ ⇒ 自检可以直接喂合成数据。
 */
export function evaluate(findings, debt) {
  const counts = new Map();
  for (const f of findings) counts.set(keyOf(f), (counts.get(keyOf(f)) ?? 0) + 1);

  const debtKeys = new Set(debt.map((d) => `${d.repo}|${d.file}|${d.kind}`));
  const fresh = [];
  for (const [k, n] of counts) {
    if (!debtKeys.has(k)) fresh.push({ key: k, count: n });
  }
  const stale = [];
  for (const d of debt) {
    const k = `${d.repo}|${d.file}|${d.kind}`;
    const actual = counts.get(k) ?? 0;
    if (actual !== d.count) stale.push({ key: k, expected: d.count, actual });
  }
  return { fresh, stale, ok: fresh.length === 0 && stale.length === 0 };
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function report(findings, verdict, filesRead, missing) {
  const lines = [];
  lines.push('── 明文密钥落盘闸 ──');
  lines.push(`扫了 ${filesRead} 个源文件；命中 ${findings.length} 处（债务清单 ${KNOWN_DEBT.length} 条）`);
  if (missing.length) {
    for (const m of missing) lines.push(`⚠️ 读不到：${m}`);
  }
  if (verdict.fresh.length) {
    lines.push('');
    lines.push('🔴 **新增的明文密钥落盘点（清单里没有）**：');
    for (const f of verdict.fresh) {
      lines.push(`   · ${f.key} —— 命中 ${f.count} 处`);
      for (const x of findings.filter((y) => keyOf(y) === f.key)) {
        lines.push(`       ${x.file}:${x.line}  [${x.kind}/${x.via}] ${x.detail}`);
        if (x.chain?.length) lines.push(`         链：${x.chain.join(' → ')}`);
      }
    }
  }
  if (verdict.stale.length) {
    lines.push('');
    lines.push('🟡 **债务清单过期**（还了债要销账 / 新增了一处同类的）');
    for (const s of verdict.stale) {
      lines.push(`   · ${s.key}：清单记 ${s.expected} 处，现在 ${s.actual} 处`);
    }
  }
  if (verdict.ok) {
    lines.push('');
    lines.push('✅ 绿：没有新的明文密钥落盘点，债务清单也对得上。');
  } else {
    lines.push('');
    lines.push('❌ 红：见上面两条。');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 自检（**负向样本必须因为被测缺陷而红**，且要有正向孪生样本）
// ---------------------------------------------------------------------------

function selfTest() {
  const results = [];
  const check = (name, ok, why) => results.push({ name, ok, why });

  // --- 探测器层 ---
  // ⚠️ 样本必须**包含探测器要的每一个对象**（结构体定义 ＋ 字段 ＋ 落盘点）——
  //    少一个 ⇒ ⇒ 探测器会因为「找不到对象」而红 ⇒ ⇒ 那是**假通过**，不是「抓到了」。
  const rustPlain = `
struct ProviderEntry {
    id: String,
    api_key: Option<String>,
}
struct ProviderStore {
    providers: Arc<RwLock<HashMap<String, ProviderEntry>>>,
}
impl ProviderStore {
    fn save(&self) {
        let content = serde_json::to_string_pretty(&self.providers).unwrap();
        std::fs::write(path, &content).unwrap();
    }
}
`;
  const rustRef = rustPlain.replace(
    'std::fs::write(path, &content).unwrap();',
    'std::fs::write(path, &serde_json::json!({"$secret": {"owner": "me", "handle": "h"}})).unwrap();',
  );
  const rustMask = rustPlain.replace(
    'std::fs::write(path, &content).unwrap();',
    'std::fs::write(path, &serde_json::json!({"api_key": MASKED_API_KEY})).unwrap();',
  );
  const dPlain = detectSecretPersistence(rustPlain, { path: 'x.rs' }).findings;
  const dRef = detectSecretPersistence(rustRef, { path: 'x.rs' }).findings;
  const dMask = detectSecretPersistence(rustMask, { path: 'x.rs' }).findings;

  check('探测器：明文 api_key 落盘 ⇒ 抓得到', dPlain.length === 1, '抓 ' + dPlain.length + ' 处');
  check('探测器：孪生（写引用式）⇒ 不报', dRef.length === 0, '报 ' + dRef.length + ' 处');
  check('探测器：孪生（写掩码）⇒ 不报', dMask.length === 0, '报 ' + dMask.length + ' 处');

  // --- 闸门层 ---
  const f = (repo, file, kind) => ({ repo, file, kind, line: 1, via: 'name', detail: 'x' });
  const e1 = evaluate([f('r', 'a.rs', 'file')], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 1 }]);
  check('闸门：清单里有 ⇒ 绿', e1.ok === true, JSON.stringify(e1.fresh) + JSON.stringify(e1.stale));

  const e2 = evaluate([f('r', 'b.rs', 'file')], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 1 }]);
  check(
    '闸门：清单外的新增 ⇒ 红（且理由是「新文件」）',
    e2.ok === false && e2.fresh.length === 1 && e2.fresh[0].key === 'r|b.rs|file',
    JSON.stringify(e2),
  );

  const e3 = evaluate([], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 1 }]);
  check(
    '闸门：债还了（文件里没有了）⇒ 红（且理由是「清单过期」）',
    e3.ok === false && e3.stale.length === 1 && e3.stale[0].actual === 0,
    JSON.stringify(e3),
  );

  const e4 = evaluate([f('r', 'a.rs', 'file')], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 2 }]);
  check(
    '闸门：同一文件多了一处同类 ⇒ 红（数量对不上）',
    e4.ok === false && e4.stale.length === 1 && e4.stale[0].expected === 2 && e4.stale[0].actual === 1,
    JSON.stringify(e4),
  );

  const e5 = evaluate([f('r', 'a.rs', 'file')], []);
  check(
    '闸门：空清单 ＋ 有命中 ⇒ 红',
    e5.ok === false && e5.fresh.length === 1,
    JSON.stringify(e5),
  );

  // --- 新增的三个面（进程环境变量 / 命令行 / 日志）---
  const rustEnv = `
struct LlmConfigureRequest { api_key: Option<String> }
fn derive(req: &LlmConfigureRequest) {
    let key = req.api_key.clone().unwrap_or_default();
    std::env::set_var("OPENAI_API_KEY", key);
}
`;
  const rustEnvTwin = `
fn derive2() { std::env::set_var("NEURON_LLM_RUNTIME", "openai"); }
`;
  const rustLog = `
struct ProviderEntry { api_key: Option<String> }
fn log_it(e: &ProviderEntry) { tracing::info!(?e.api_key, "saved"); }
`;
  const rustLogTwinLen = `
fn log_len(token: &str) { tracing::info!(len = token.len(), "desktop admin token: set by {source}"); }
`;
  const rustLogTwinMsg = `
fn log_msg() { tracing::info!("admin token set by the host"); }
`;

  const ePos = detectSecretPersistence(rustEnv, { path: 'x.rs' }).findings;
  const eTwin = detectSecretPersistence(rustEnvTwin, { path: 'x.rs' }).findings;
  const lPos = detectSecretPersistence(rustLog, { path: 'x.rs' }).findings;
  const lTwinLen = detectSecretPersistence(rustLogTwinLen, { path: 'x.rs' }).findings;
  const lTwinMsg = detectSecretPersistence(rustLogTwinMsg, { path: 'x.rs' }).findings;

  check('探测器：密钥进进程环境变量 ⇒ 抓得到', ePos.length === 1, '抓 ' + ePos.length + ' 处');
  check('探测器：孪生（环境变量名不是密钥形状）⇒ 不报', eTwin.length === 0, '报 ' + eTwin.length + ' 处');
  check('探测器：密钥进日志 ⇒ 抓得到', lPos.length === 1, '抓 ' + lPos.length + ' 处');
  check('探测器：孪生（日志只记长度）⇒ 不报', lTwinLen.length === 0, '报 ' + lTwinLen.length + ' 处');
  check('探测器：孪生（日志文案提到 token）⇒ 不报', lTwinMsg.length === 0, '报 ' + lTwinMsg.length + ' 处');

  // --- 广播面（TXT 记录）---
  // ⚠️ **样本必须自带结构体定义**（探测器要靠类型传递闭包认「这个值是密钥」）
  //    ⇒ ⇒ 少定义 ⇒ ⇒ 探测器因「找不到对象」而红 ⇒ ⇒ 那是**假通过**，不是「抓到了」。
  const rustBroadcast = `
struct DiscoveredPeer {
    name: String,
    admin_token: Option<String>,
}
fn advertise(txt_records: &mut HashMap<String, String>, peer: &DiscoveredPeer) {
    txt_records.insert("admin_token".to_string(), peer.admin_token.clone().unwrap_or_default());
}
fn advertise_version(txt_records: &mut HashMap<String, String>, version: &str) {
    txt_records.insert("version".to_string(), version.to_string());
}
`;
  const bPos = detectSecretPersistence(rustBroadcast, { path: 'x.rs' }).findings;
  const bTwin = detectSecretPersistence(
    rustBroadcast.replace(
      'txt_records.insert("admin_token".to_string(), peer.admin_token.clone().unwrap_or_default());',
      'txt_records.insert("instance_type".to_string(), "telencephalon".to_string());',
    ),
    { path: 'x.rs' },
  ).findings;
  check('探测器：密钥进 mDNS TXT 记录 ⇒ 抓得到（广播面）', bPos.length === 1, '抓 ' + bPos.length + ' 处');
  check('探测器：孪生（TXT 里放的是非密钥属性）⇒ 不报', bTwin.length === 0, '报 ' + bTwin.length + ' 处');

  // --- 密钥仓库豁免（2026-11-03）---
  // ⚠️ **豁免「仓库」这个概念** —— 它装的是**引用**不是材料。
  // ⇒ ⇒ 而**豁免太宽** ⇒ ⇒ 闸变瞎 ⇒ ⇒ 那比漏报更坑 ⇒ ⇒ 必须有孪生。
  //
  // ⚠️ **正样本取自真代码的形状**（`match (secret, &self.secrets)`）——
  // ⇒ ⇒ 值来自**仓库** ⇒ ⇒ 库里存的是**引用** ⇒ ⇒ 不该判红。
  // ⚠️ **正样本与真代码同形**（`match (secret, &self.secrets)`）——
  // ⇒ ⇒ 值来自**仓库** ⇒ ⇒ 库里存的是**引用** ⇒ ⇒ 不该判红。
  const rustStore = `
struct ConfigCenter {
    secrets: Option<Secrets>,
}
fn write_it() {
    // ⚠️ 值来自**仓库** ⇒ ⇒ 库里存的是**引用** ⇒ ⇒ 不该判红。
    let stored = match &self.secrets {
        Some(secrets) => {
            let reference = secrets.store_secret_as(b"s3cret", "k").await.unwrap();
            Json::Object(serde_json::to_value(reference.envelope()).unwrap().as_object().cloned().unwrap())
        }
        None => Json::Null,
    };
    conn.execute("INSERT INTO t (v) VALUES (?1)", params![stored]);
}
`;
  const sStore = detectSecretPersistence(rustStore, { path: 'x.rs' }).findings;
  // ⚠️ **孪生**：同样的形状，但值来自**真密钥** ⇒ ⇒ 必须**照旧判红**。
  const rustStoreTwin = `
struct ProviderEntry {
    id: String,
    api_key: Option<String>,
}
struct ConfigCenter {
    providers: HashMap<String, ProviderEntry>,
}
fn write_it(centre: &ConfigCenter) {
    let stored = centre.providers.get("x").map(|p| p.api_key.clone());
    conn.execute("INSERT INTO t (v) VALUES (?1)", params![stored]);
}
`;
  const sStoreTwin = detectSecretPersistence(rustStoreTwin, { path: 'x.rs' }).findings;
  check('探测器：值来自「密钥仓库」⇒ 不报（仓库装的是引用）', sStore.length === 0, '报 ' + sStore.length + ' 处');
  check('探测器：孪生（同样的形状，但值来自真密钥）⇒ 照旧报', sStoreTwin.length >= 1, '报 ' + sStoreTwin.length + ' 处');

  const ok = results.filter((r) => r.ok).length;
  const lines = results.map((r) => (r.ok ? '  ✔ ' : '  ✘ ') + r.name + '  —— ' + r.why);
  console.log(lines.join('\n'));
  console.log(`自检：${ok}/${results.length} 通过`);
  return ok === results.length;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const sourceArg = (() => {
    const i = argv.indexOf('--source');
    return i >= 0 ? argv[i + 1] : undefined;
  })();
  const extraRoots = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) extraRoots.push(resolve(argv[++i]));
  }
  const { findings, filesRead, missing } = scanAll(sourceArg, extraRoots);
  if (filesRead === 0) {
    console.error('❌ 一个源文件都没读到 ⇒ ⇒ 「没红」不等于「没问题」（退出码 2）');
    for (const m of missing) console.error('   读不到：' + m);
    process.exit(2);
  }
  const verdict = evaluate(findings, KNOWN_DEBT);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ filesRead, findings, verdict }, null, 2));
  } else {
    console.log(report(findings, verdict, filesRead, missing));
  }
  process.exit(verdict.ok ? 0 : 1);
}

main(process.argv.slice(2));
