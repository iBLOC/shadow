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
import { detectSecretPersistence, detectPlaintextSecretReads, stripStringLiterals } from './lib/secret-persistence.mjs';
import { stripComments, matchBrace } from './lib/strip-comments.mjs';

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
    // ⚠️⚠️ **盲区登记**（2026-11-04）—— 探测器**追不到**它：
    //    读的那一行是 `std::fs::read_to_string(path)` ⇒ ⇒ 值链里只有
    //    一个 `&Path` 参数 ⇒ ⇒ 没有密钥名 ⇒ ⇒ 追踪断在这里。
    //    ⇒ ⇒ **债是真的**（私钥明文在盘上且被读）⇒ ⇒ **不能销账**。
    //    ⇒ ⇒ 它**不是**销账；一旦探测器能抓到，闸会照常提示销账。
    //    ⇒ ⇒ 前面那条 `file`（写）**仍然被抓到** ⇒ ⇒ 债没被放过。
    blind: true,
    why: '从盘上读那份私钥 PEM（写的对面）—— ⚠️ 探测器追不到（追踪断在 &Path 参数）⇒ ⇒ 登记为盲区',
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
    file: 'src-tauri/src/admin_token.rs',
    kind: 'file-read',
    count: 1,
    why: '从**明文落盘**里读回 admin token（写的对面）—— ⚠️ 2026-11-09 实测才露出来：探测器此前把「**凡是被调用过的名字**」都豁免 ⇒ ⇒ 连**取值函数**（`desktop_admin_token()`）也被放过 ⇒ ⇒ 这一族整体隐形 ⇒ ⇒ 豁免收窄成「只豁免**谓词**」后才看得见 ⇒ ⇒ 债是真的（盘上确实有一把明文钥匙）⇒ ⇒ 不能销账',
    when: 'P2c（同上）—— ⚠️ 它是「写」那一面的**对面**：写面已登记 ⇒ ⇒ 这一条是**读面** ⇒ ⇒ 两者必须**一起**销（换钥匙环 ⇒ ⇒ 写与读同时不再碰明文文件）',
  },
  {
    repo: 'desktop',
    file: 'src-tauri/src/config_manager.rs',
    kind: 'file',
    count: 1,
    why: '桌面配置整份落盘（含 provider api_key ＋ 数据库 password）',
    when: 'P2（同 provider 那条）',
  },
  // ⚠️⚠️ **ziti 身份文件那条**（2026-11-09 实测露出来 ⇒ ⇒ 接 CI 前的最后一刀）。
  // ⇒ ⇒ **这是真债**（ziti 身份证书的**私钥 PEM 落盘**：ca.pem / cert.pem / key.pem
  //    三份都写进 app 私有目录）⇒ ⇒ 但**探测器的形状**只咬住了 id.json 那次写入
  //    （它的值是**文件名**（'key.pem' 等）⇒ ⇒ 严格说是**形状上的假红**）
  // ⇒ ⇒ 而**真正的材料落盘**（pems['key'] 写进 key.pem）**探测器追不到**
  //    （追踪断在**动态下标** `pems['key']` 上 ⇒ ⇒ 索引不静态 ⇒ ⇒ 追不动）
  // ⇒ ⇒ 所以这一条**按「真债」登记**（不许因为「形状像假红」就放过它）
  // ⇒ ⇒ 同时这条登记**顺手把那个盲区也记下来**（探测器看不见 ≠ 没有）。
  {
    repo: 'mobile',
    file: 'lib/services/ziti_config_service.dart',
    kind: 'file',
    count: 1,
    why: 'ziti 身份**私钥 PEM 明文落盘**（ca.pem / cert.pem / key.pem 写进 app 私有目录）—— ⚠️ 探测器咬住的是 id.json 那次写入（值是**文件名**）⇒ ⇒ 形状上偏假红；但**同一次调用**把**真材料**（pems 里那个 key 下标的值）写进了 key.pem ⇒ ⇒ 那处探测器**追不到**（动态下标 ⇒ ⇒ 盲区）⇒ ⇒ 所以这是**真债**，不是噪音',
    when: 'P2d（ziti 身份材料搬进 android-native-keyring-store / 或改成只落**引用**）—— ⚠️ 归属**并行会话的 ziti 线**（commit 2461ac6）⇒ ⇒ 那条线动了这个文件之后，本条会变 stale ⇒ ⇒ 闸会红 ⇒ ⇒ 那时要**按实测重算 count** 再决定销账还是改数（不许静默放过）',
    onStale: '⚠️ 这条是**真债**（ziti 私钥落盘）⇒ ⇒ 若它变 stale ⇒ ⇒ 请确认是真的搬走了，**不是**把形状改成「看不见」⇒ ⇒ ziti 身份材料确实不再落盘才算还',
  },
  {
    repo: 'mobile',
    file: 'lib/services/app_config_service.dart',
    kind: 'file',
    count: 1,
    // ⚠️⚠️ **盲区登记**（2026-11-09 实测）—— 债**是真的**，但探测器追不到：
    //    写入仍在（`_saveConfig()` 把 `telencephalonAdminToken` ＋ `telencephalonShadowKey`
    //    明文塞进 `config` ⇒ ⇒ `json.encode(config)` ⇒ ⇒ 写进 app 私有目录的 app_config.json）
    //    但 2026-11-09 的**原子落盘重构**把落盘改成了 `_writeAtomically(file, json.encode(config))`
    //    ⇒ ⇒ 探测器的 Dart 写规则只认**调用点**上的 `writeAsString(`
    //    ⇒ ⇒ 那次写调用现在藏在 helper 里（形参名是 `content`，不含密钥成分）
    //    ⇒ ⇒ 追踪断在这里 ⇒ ⇒ 命中数 0。
    //    ⇒ ⇒ **不许销账**（债还在）⇒ ⇒ 登记为盲区；探测器一旦能抓到，闸会照常提示销账。
    blind: true,
    why: 'app 私有目录的 JSON 里存着 admin token ＋ shadow key（**Android 无安全存储**）—— ⚠️ 债仍然是真的（`_saveConfig()` 明文写进 app_config.json）；探测器追不到，是因为 2026-11-09 的原子落盘重构把写入藏进了 `_writeAtomically(file, …)` helper（Dart 写规则只认调用点上的 `writeAsString(`）⇒ ⇒ 登记为盲区（**不是销账**）',
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
    file: 'src/providers/import/mod.rs',
    kind: 'file',
    count: 1,
    why: '**导出**：把凭据写进**另一个工具的凭据文件**（opencode 的 auth.json / Claude Code 的 settings.json / Codex 的 auth.json）⇒ ⇒ 那份文件**本来就是明文凭据文件**（对方自己的格式）⇒ ⇒ 目标正确 ⇒ ⇒ **故意保留**；⚠️ 参数名 `credential_doc` **必须写实** —— 闸是**名字级**追踪 ⇒ ⇒ 叫 `value` 的话 ⇒ ⇒ 这条路径对闸**隐形** ⇒ ⇒ ⇒ 改名前先想清楚它在写什么',
    when: '等对方的凭据文件支持 OS 钥匙环 / 或导出改成写**引用式**（`{"$secret":…}`）⇒ ⇒ 那时这条就能销账',
    onStale: '⚠️ 这条是**导出** —— 现在**看不见**它了 ⇒ ⇒ 请确认是**真的**移除了导出，而不是**把参数名改回 `value` 让它对闸隐形**了（闸靠名字级追踪 ⇒ ⇒ 隐形 ⇒ ⇒ 登记条目过期 ⇒ ⇒ 闸会红）',
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
  // ⚠️⚠️ **两种布局都要认**（2026-11-09 接 CI 时实测）——
  //   · A（本机）：兄弟仓在 shadow 仓**之外**（`../<name>`）
  //   · B（CI）：兄弟仓被 checkout 到 shadow 仓根**之下**（`<name>` 子目录）
  // ⚠️ 只认 A ⇒ ⇒ CI 上五个兄弟仓**一个都读不到** ⇒ ⇒ 覆盖面读数只剩
  //   desktop/mobile ⇒ ⇒ 那些债全成「没判」⇒ ⇒ 退出码 2 ⇒ ⇒ **CI 恒红**
  //   ⇒ ⇒ 那不是「闸抓到了泄漏」，那是**布局层**的问题（同 check-ziti-face.mjs）。
  const sibling = (name) => {
    const outside = resolve(REPO, '..', name);
    if (existsSync(outside)) return outside;
    return join(REPO, name);
  };
  const endbrain = sourceArg ?? sibling('telencephalon');
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
  // ⚠️⚠️ **在面内的仓**（2026-11-09 加）—— 覆盖面**是读数**，不是假设。
  // ⇒ ⇒ 「哪个仓压根没被扫到」必须**说得出来**⇒ ⇒ 否则「没红」会被当成「没问题」。
  const covered = new Set();
  for (const { repo, root, sub } of scanRoots(sourceArg, extraRoots)) {
    const base = join(root, sub);
    if (!existsSync(base)) {
      missing.push(base);
      continue;
    }
    covered.add(repo);
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
  // ⚠️⚠️ **「该在面内的仓」也得交出去**（2026-11-09 修）—— 覆盖面是**读数**，
  // ⇒ ⇒ 「在面内 / 没在面内」两段必须来自**同一份根清单**⇒ ⇒ 否则两段会互相矛盾。
  const scopeRepos = [...new Set(scanRoots(sourceArg, extraRoots).map((r) => r.repo))].filter((r) => r !== 'probe');
  return { findings, filesRead, missing, covered, scopeRepos };
}

const keyOf = (f) => `${f.repo}|${f.file}|${f.kind}`;

/**
 * 拿实测命中去对债务清单 ⇒ ⇒ 分成「新增」与「清单过期」两类。
 *
 * ⚠️ **纯函数** ⇒ ⇒ 自检可以直接喂合成数据。
 *
 * ⚠️⚠️⚠️ **2026-11-09 加的第三格：`covered`** —— 「那个仓**在不在面内**」。
 *
 * ⇒ ⇒ 此前只用「命中数」对账 ⇒ ⇒ **仓没被检出**（CI 只 checkout 了一部分）
 * ⇒ ⇒ ⇒ 命中数 0 ⇒ ⇒ 报「**债还了**」⇒ ⇒ **逼你销掉一条真债**
 * ⇒ ⇒ ⇒ 而真相是「**那一条根本没被看**」⇒ ⇒ 「没红」被说成「没问题」。
 * ⇒ ⇒ 修法：**债条目所在的仓不在覆盖面内 ⇒ ⇒ 那一条算「没判」**，
 * ⇒ ⇒ **不是「还了」** ⇒ ⇒ 更不是「没问题」。
 *
 * ⚠️ **形状**：`covered` 是一个**仓名集合**（`telencephalon` / `encephalon` /
 * `prefrontal` / `synapse` / `desktop` / `mobile`）⇒ ⇒ 不传 ⇒ ⇒ **按老口径**
 * ⇒ ⇒ （调用方若不提供，就当「全在面内」⇒ ⇒ 自检的老用例不受影响）。
 */
export function evaluate(findings, debt, covered = null) {
  const counts = new Map();
  for (const f of findings) counts.set(keyOf(f), (counts.get(keyOf(f)) ?? 0) + 1);

  const debtKeys = new Set(debt.map((d) => `${d.repo}|${d.file}|${d.kind}`));
  const fresh = [];
  for (const [k, n] of counts) {
    if (!debtKeys.has(k)) fresh.push({ key: k, count: n });
  }
  const stale = [];
  const blind = [];
  // ⚠️⚠️ **没判**（覆盖不全 ⇒ 那一条压根没被看）—— 与「过期」**分开**。
  // ⇒ ⇒ 「过期」＝债**确实还了**（要销账）⇒ ⇒ 「没判」＝**没看**（要补覆盖面）。
  const uncovered = [];
  for (const d of debt) {
    const k = `${d.repo}|${d.file}|${d.kind}`;
    const actual = counts.get(k) ?? 0;
    // ⚠️⚠️ **仓不在覆盖面内 ⇒ ⇒ 这一条「没判」** ⇒ ⇒ **不许**报「债还了」。
    // ⇒ ⇒ 否则 CI 只 checkout 了一部分仓时 ⇒ ⇒ 闸会**逼你销掉真债**。
    if (covered && !covered.has(d.repo)) {
      uncovered.push({ key: k, expected: d.count, repo: d.repo });
      continue;
    }
    // ⚠️⚠️ **盲区登记** —— 探测器**追不到**这条债（追踪断在某个参数上，
    //    例如「从盘上读一个 `&Path` 指向的私钥」⇒ ⇒ 值链里没有密钥名）
    // ⇒ ⇒ 它**确实存在**，只是当前判据看不见 ⇒ ⇒ **不能**因为「抓不到」
    // ⇒ ⇒ 就报「债还了」⇒ ⇒ 那会让闸**逼你销掉一条真债**。
    // ⚠️⚠️ **但只要探测器一旦能抓到了 ⇒ ⇒ 照常报过期** ⇒ ⇒
    // ⇒ ⇒ 「盲区」**不是永久免检** ⇒ ⇒ 它只是「现在看不见」。
    if (d.blind && actual === 0) {
      blind.push(k);
      continue;
    }
    if (actual !== d.count) stale.push({ key: k, expected: d.count, actual });
  }
  // ⚠️ **判不了** ⇒ ⇒ 整体不算绿（覆盖不全 ⇒ 「没红」不等于「没问题」）。
  return {
    fresh,
    stale,
    blind,
    uncovered,
    ok: fresh.length === 0 && stale.length === 0 && uncovered.length === 0,
  };
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function report(findings, verdict, filesRead, missing, covered = null, scopeRepos = null) {
  const lines = [];
  lines.push('── 明文密钥落盘闸 ──');
  lines.push(`扫了 ${filesRead} 个源文件；命中 ${findings.length} 处（债务清单 ${KNOWN_DEBT.length} 条）`);
  // ⚠️⚠️ **覆盖面是读数**（2026-11-09 加）—— 「哪些仓在面内」必须说得出来。
  // ⇒ ⇒ 否则「某个仓压根没扫到」会被说成「那个仓没问题」。
  if (covered) {
    // ⚠️⚠️ **「该在面内的仓」只能来自同一份根清单**（2026-11-09 修）——
    // ⇒ ⇒ 此前这里**另调一次无参 scanRoots()** ⇒ ⇒ `--source` 模式下那份清单
    // ⇒ ⇒ 与实际扫的面**不是同一份** ⇒ ⇒ 「覆盖仓」与「没在面内的仓」两段
    // ⇒ ⇒ 会**互相矛盾**（前者说在面内、后者说不在）⇒ ⇒ 读数不可信。
    const all = scopeRepos ?? [...new Set(scanRoots().map((r) => r.repo))].filter((r) => r !== 'probe');
    const inScope = all.filter((r) => covered.has(r));
    const outScope = all.filter((r) => !covered.has(r));
    lines.push('覆盖仓：' + (inScope.length ? inScope.join('、') : '（无）'));
    if (outScope.length) {
      lines.push('⚠️ **没在面内的仓**（它们的债「没判」，不是「还了」）：' + outScope.join('、'));
    }
  }
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
    lines.push('   （新落盘点要么是**真泄漏**（⇒ ⇒ 修掉），要么是**导出**（写进另一个工具的凭据文件）⇒ ⇒ 那就登记进 KNOWN_DEBT（写清 why / when）⇒ ⇒ **别让它隐形**。）');
  }
  if (verdict.stale.length) {
    lines.push('');
    lines.push('🟡 **债务清单过期**（还了债要销账 / 新增了一处同类的）');
    for (const s of verdict.stale) {
      lines.push(`   · ${s.key}：清单记 ${s.expected} 处，现在 ${s.actual} 处`);
      const entry = KNOWN_DEBT.find((d) => `${d.repo}|${d.file}|${d.kind}` === s.key);
      if (entry?.onStale) lines.push(`     ${entry.onStale}`);
    }
  }
  if (verdict.uncovered?.length) {
    lines.push('');
    lines.push(`⚠️ **有 ${verdict.uncovered.length} 条债「没判」**（它们所在的仓不在覆盖面内）——`);
    for (const u of verdict.uncovered) {
      lines.push(`   · ${u.key}（仓 ${u.repo} 不在面内 ⇒ ⇒ 清单记 ${u.expected} 处，但**没被看**）`);
    }
    lines.push('   （「没判」≠「还了」⇒ ⇒ **不许**销账 ⇒ ⇒ 要补覆盖面（或明确声明「本次不判这几个仓」。）');
  }
  if (verdict.blind?.length) {
    lines.push('');
    lines.push(`ℹ️ **探测器盲区登记**（${verdict.blind.length} 条）—— 债确实在，但当前判据追不到：`);
    for (const k of verdict.blind) lines.push(`   · ${k}`);
    lines.push('   （它们**不是**销账；一旦探测器能抓到，闸会照常提示销账。）');
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

  // ⚠️⚠️⚠️ **取值函数不许被豁免**（2026-11-09 实测抓到的真漏洞）。
  //
  // ⇒ ⇒ 原来的豁免是「凡是被调用过的名字都豁免」⇒ ⇒ `desktop_admin_token()`
  // ⇒ ⇒ （它**返回的就是那把钥匙**）也被放过 ⇒ ⇒
  // ⇒ ⇒ `std::env::set_var("HIPPOCAMPUS_BRAIN_TOKEN", &desktop_admin_token())`
  // ⇒ ⇒ **闸看不见** ⇒ ⇒ **假绿**。
  const getterSrc = [
    'fn desktop_admin_token() -> String { String::new() }',
    'fn main() {',
    '    std::env::set_var("HIPPOCAMPUS_BRAIN_TOKEN", &desktop_admin_token());',
    '}',
  ].join('\n');
  const dGetter = detectSecretPersistence(getterSrc, { path: 'x.rs' }).findings;
  check(
    '探测器：把钥匙塞进进程环境的**取值函数** ⇒ 抓得到（豁免不许放过它）',
    dGetter.length === 1 && dGetter[0].kind === 'process-env',
    '抓 ' + dGetter.length + ' 处：' + JSON.stringify(dGetter.map((x) => x.kind + ':' + x.detail)),
  );

  // ⚠️ **孪生**：**谓词**调用（`is_secret_key(...)`）**必须**仍被豁免 ——
  // ⇒ ⇒ 它返回的是「判断」，不是材料 ⇒ ⇒ 判红就是假红。
  const predicateSrc = [
    'fn is_secret_key(x: &str) -> bool { true }',
    'fn main() {',
    '    std::env::set_var("HIPPOCAMPUS_BRAIN_TOKEN", &is_secret_key(k));',
    '}',
  ].join('\n');
  const dPredicate = detectSecretPersistence(predicateSrc, { path: 'x.rs' }).findings;
  check(
    '孪生：谓词调用（is_secret_key）⇒ 不报（豁免只收窄到谓词，不是一刀切）',
    dPredicate.length === 0,
    '报 ' + dPredicate.length + ' 处',
  );

  // ⚠️ **孪生**：**非密钥形状**的 env 名 ⇒ ⇒ 不报（不能把闸变成噪音）。
  const baseOnlySrc = [
    'fn main() { std::env::set_var("HIPPOCAMPUS_BRAIN_BASE", &v); }',
  ].join('\n');
  const dBaseOnly = detectSecretPersistence(baseOnlySrc, { path: 'x.rs' }).findings;
  check(
    '孪生：非密钥形状的 env 名（HIPPOCAMPUS_BRAIN_BASE）⇒ 不报',
    dBaseOnly.length === 0,
    '报 ' + dBaseOnly.length + ' 处',
  );

  // ⚠️⚠️ **导出路径必须「可见」**（2026-11-04 实证）——
  // ⇒ ⇒ 密钥材料被塞进 `serde_json::Value` 之后 ⇒ ⇒ **名字级的追踪就断了**
  // ⇒ ⇒ 那条落盘点对闸是**隐形的** ⇒ ⇒ ⇒ 「写回外部工具的凭据文件」漏报。
  // ⇒ ⇒ 解法**不是**加一条宽规则（实测会命中 10 处 ⇒ ⇒ 全是噪音 ⇒ ⇒
  // ⇒ ⇒ 登记清单会越滚越大）⇒ ⇒ 而是**让参数名写实**（`credential_doc`）
  // ⇒ ⇒ ⇒ 闸现有的追踪就能看见它。
  const exportSrc = [
    'fn write_json_atomic(path: &Path, credential_doc: &serde_json::Value) {',
    '    let content = serde_json::to_string_pretty(credential_doc).unwrap();',
    '    std::fs::write(path, content).unwrap();',
    '}',
  ].join('\n');
  const dExport = detectSecretPersistence(exportSrc, { path: 'x.rs' }).findings;
  check(
    '导出：凭据文档落盘 ⇒ 闸看得见（不是隐形）',
    dExport.length === 1 && dExport[0].kind === 'file',
    '抓 ' + dExport.length + ' 处：' + JSON.stringify(dExport.map((x) => x.kind + ':' + x.detail)),
  );

  // ⚠️ **孪生 1**：写一份**普通** JSON 文档（不是凭据文档）⇒ ⇒ 不报。
  // ⇒ ⇒ 仓库里有一堆天然孪生（会话存储 / A2A 存储 / wasm 注册表）⇒ ⇒
  // ⇒ ⇒ 它们写的是普通文档 ⇒ ⇒ 不该被「导出」这条判据扫到。
  // ⚠️ **同时也是「命名是契约」的证据** —— 参数叫 `value` ⇒ ⇒ 隐形 ⇒ ⇒
  // ⇒ ⇒ 所以**改名 ⇒ ⇒ 闸的登记条目过期 ⇒ ⇒ 闸会红**（不是默默放过）。
  const plainDocSrc = [
    'fn write_json_atomic(path: &Path, value: &serde_json::Value) {',
    '    let content = serde_json::to_string_pretty(value).unwrap();',
    '    std::fs::write(path, content).unwrap();',
    '}',
  ].join('\n');
  const dPlainDoc = detectSecretPersistence(plainDocSrc, { path: 'x.rs' }).findings;
  check(
    '孪生 1：写**普通** JSON 文档 ⇒ 不报（命名是契约 ⇒ 改名 ⇒ 闸红）',
    dPlainDoc.length === 0,
    '报 ' + dPlainDoc.length + ' 处',
  );

  // ⚠️ **孪生 2**：写**引用式**密钥 ⇒ ⇒ 不报（那是安全形状）。
  const exportRefSrc = [
    'fn write_json_atomic(path: &Path, secret_ref: &str) {',
    '    std::fs::write(path, secret_ref).unwrap();',
    '}',
  ].join('\n');
  const dExportRef = detectSecretPersistence(exportRefSrc, { path: 'x.rs' }).findings;
  check('孪生 2：导出**引用式**密钥 ⇒ 不报', dExportRef.length === 0, '报 ' + dExportRef.length + ' 处');

  // ⚠️ **孪生 3**：写**掩码** ⇒ ⇒ 不报（掩码不是材料）。
  const exportMaskSrc = [
    'fn write_json_atomic(path: &Path, api_key: &str) {',
    '    std::fs::write(path, MASKED_API_KEY).unwrap();',
    '}',
  ].join('\n');
  const dExportMask = detectSecretPersistence(exportMaskSrc, { path: 'x.rs' }).findings;
  check('孪生 3：写**掩码** ⇒ 不报', dExportMask.length === 0, '报 ' + dExportMask.length + ' 处');

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

  // ⚠️⚠️ **Rust raw string 的三处修复 —— 逐处钉桩**（2026-11-04 实证）
  // ⇒ ⇒ 「raw string」不是普通字符串：它的引号**不配对**，里面还可以有
  // ⇒ ⇒ 「//」与「{」「}」⇒ ⇒ 不认它 ⇒ ⇒ 后面所有引号/括号全部错位 ⇒ ⇒
  // ⇒ ⇒ ① 注释误判 ② 字符串误判 ③ **测试模块的抹除范围错** ⇒ ⇒
  // ⇒ ⇒ 第 ③ 条最狠：它让**测试夹具里的假密钥**被当成真落盘点（假红）。
  // ⚠️ **三处各钉一条** —— 每条都有**自己专属的失效形态** ⇒ ⇒ 少一处，
  //    那一条就红（已用「只关掉那一处」的退化副本逐条实测过）。
  const rawSlash = 'let t = r#"url = "http://x" // note"#;\n';
  const keptRaw = stripComments(rawSlash, { nested: true, rust: true });
  check(
    '修复①（stripComments）：raw string 里的「//」不是行注释 ⇒ 内容原样保留',
    keptRaw.includes('http://x'),
    JSON.stringify(keptRaw),
  );

  // ⚠️⚠️ **引号数必须是「奇数」** —— 这是这条钉桩**能不能算数**的关键
  //    （2026-11-04 实测）：**偶数**个引号时 ⇒ ⇒ 退化版把 raw string 里的
  //    引号**两两配对** ⇒ ⇒ 括号配平**仍然正确** ⇒ ⇒ **钉桩会假绿**
  //    ⇒ ⇒ 这里放 **3 个**（奇数）⇒ ⇒ 少一处修复 ⇒ ⇒ 配平直接崩（返回 -1）。
  const braceSrc = 'fn f() {\n    let t = r#"{"a":"b"#;\n}\n';
  const closeIdx = matchBrace(braceSrc, braceSrc.indexOf('{'));
  check(
    '修复②（skipString）：raw string 里的「{」不参与配平 ⇒ 配到函数末尾',
    closeIdx >= 0 && closeIdx === braceSrc.lastIndexOf('}'),
    'close=' + closeIdx + ' last=' + braceSrc.lastIndexOf('}'),
  );

  const litSrc = 'let t = r#"{"api_key":"sk-x"}"#;';
  const blanked = stripStringLiterals(litSrc);
  check(
    '修复③（stripStringLiterals）：raw string 整段抹掉 ⇒ 里面的 api_key 不是代码名',
    !blanked.includes('api_key'),
    JSON.stringify(blanked),
  );

  // ⚠️⚠️ **端到端那一条** —— 三处修复**合起来**才守得住的路（2026-11-04 实证）。
  // ⇒ ⇒ 形状取自真实文件：**telencephalon/src/config/loader.rs** 的测试里有一段
  // ⇒ ⇒ 带 URL 的多行 YAML raw string（里面有 api_key: "secret"）⇒ ⇒
  // ⇒ ⇒ 退化后 ⇒ ⇒ ① raw string 里的「//」被当行注释 ⇒ ⇒ 引号全错位
  // ⇒ ⇒ ② 测试模块抹不干净 ⇒ ⇒ ③ 夹具里的假密钥被当成真落盘点 ⇒ ⇒ **假红**。
  const yamlFixture = [
    'fn main() {}',
    '#[cfg(test)]',
    'mod tests {',
    '    #[test]',
    '    fn loads_minimal_config() {',
    '        let yaml = r#"',
    '  neon_url: "postgres://test"',
    '"#;',
    '        let api_key = "sk-not-real";',
    '        std::fs::write(&auth, &api_key).unwrap();',
    '    }',
    '}',
  ].join('\n');
  const yamlFindings = detectSecretPersistence(yamlFixture, { path: 'x.rs' }).findings.concat(
    detectPlaintextSecretReads(yamlFixture, { path: 'x.rs' }).findings,
  );
  check(
    '端到端：测试夹具里 raw string 的假密钥 ⇒ 不判红（真实文件形状）',
    yamlFindings.length === 0,
    '报 ' + yamlFindings.length + ' 处：' + JSON.stringify(yamlFindings.map((x) => x.line + ':' + x.kind + ':' + x.detail)),
  );

  // ⚠️⚠️ **盲区登记**（2026-11-04）—— 探测器**追不到**的那条债。
  // ⇒ ⇒ 「追不到」**不等于**「债还了」⇒ ⇒ 闸不能逼人销掉一条真债。
  const e6 = evaluate([], [
    { repo: 'r', file: 'a.rs', kind: 'file-read', count: 1, blind: true },
  ]);
  check(
    '闸门：盲区登记且探测器追不到 ⇒ 绿（**不是**销账）',
    e6.ok === true && e6.blind.length === 1 && e6.stale.length === 0,
    JSON.stringify(e6),
  );

  const e7 = evaluate(
    [f('r', 'a.rs', 'file-read')],
    [{ repo: 'r', file: 'a.rs', kind: 'file-read', count: 2, blind: true }],
  );
  check(
    '闸门：盲区登记但**数量对不上** ⇒ 仍红（盲区只豁免「追不到」）',
    e7.ok === false && e7.stale.length === 1 && e7.stale[0].actual === 1,
    JSON.stringify(e7),
  );

  const e8 = evaluate(
    [f('r', 'a.rs', 'file-read')],
    [{ repo: 'r', file: 'a.rs', kind: 'file-read', count: 1, blind: true }],
  );
  check(
    '闸门：盲区登记但探测器**抓到了**且数量对得上 ⇒ 绿',
    e8.ok === true && e8.stale.length === 0,
    JSON.stringify(e8),
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

  // ⚠️⚠️ **覆盖不全 ⇒ ⇒ 「没判」**（2026-11-09 加）—— 与「过期」**分开**。
  // ⇒ ⇒ 「仓压根没被检出」⇒ ⇒ 命中数 0 ⇒ ⇒ 报「债还了」⇒ ⇒ **逼你销掉一条真债**。
  const e9 = evaluate([], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 1 }], new Set(['r']));
  check(
    '闸门：仓**在面内**但没命中 ⇒ 报「过期」（债真还了 ⇒ 要销账）',
    e9.stale.length === 1 && e9.uncovered.length === 0 && e9.ok === false,
    'stale=' + e9.stale.length + ' uncovered=' + e9.uncovered.length,
  );
  const e10 = evaluate([], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 1 }], new Set(['other']));
  check(
    '闸门：仓**不在面内** ⇒ 报「没判」（**不许**销账）且整体红',
    e10.uncovered.length === 1 && e10.stale.length === 0 && e10.ok === false,
    'uncovered=' + e10.uncovered.length + ' stale=' + e10.stale.length,
  );
  const e11 = evaluate([f('r', 'a.rs', 'file')], [{ repo: 'r', file: 'a.rs', kind: 'file', count: 1 }], new Set(['r']));
  check(
    '孪生：仓在面内且命中对得上 ⇒ 绿（覆盖完整时不误报「没判」）',
    e11.ok === true && e11.uncovered.length === 0 && e11.stale.length === 0,
    JSON.stringify(e11),
  );
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
  const { findings, filesRead, missing, covered, scopeRepos } = scanAll(sourceArg, extraRoots);
  if (filesRead === 0) {
    console.error('❌ 一个源文件都没读到 ⇒ ⇒ 「没红」不等于「没问题」（退出码 2）');
    for (const m of missing) console.error('   读不到：' + m);
    process.exit(2);
  }
  const verdict = evaluate(findings, KNOWN_DEBT, covered);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ filesRead, findings, verdict, covered: [...covered] }, null, 2));
  } else {
    console.log(report(findings, verdict, filesRead, missing, covered, scopeRepos));
  }
  // ⚠️⚠️ **覆盖不全 ⇒ ⇒ 退出码 2**（2026-11-09 加）—— 「判不了」≠「没问题」。
  // ⇒ ⇒ **部分**仓缺位时那几条债是「没判」⇒ ⇒ 不许当「绿」放过去。
  if (verdict.uncovered?.length) {
    console.error('');
    console.error(`❌ 覆盖不全：${verdict.uncovered.length} 条债所在的仓不在面内 ⇒ ⇒ 那些债「没判」（退出码 2）`);
    for (const u of verdict.uncovered) console.error(`   · ${u.key}（仓 ${u.repo}）`);
    process.exit(2);
  }
  process.exit(verdict.ok ? 0 : 1);
}

main(process.argv.slice(2));
