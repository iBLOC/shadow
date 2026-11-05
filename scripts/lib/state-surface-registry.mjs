
/**
 * 「状态面」注册表 + 债务清单 —— **数据**（判据在 ./state-surface.mjs）。
 *
 * ## 什么是「状态面」
 *
 * **会被注入到未来会话、并且能授权未来行动**的持久状态。
 * 按 arXiv:2606.30306 的定义（durable state + 可授权未来行动），本仓有这些面：
 *   · project-ledger（父仓 AGENTS.md）—— **每次会话都被注入**的项目指令；
 *   · desktop-ledger / mobile-ledger（两个子仓的 AGENTS.md）—— 各自的项目指令；
 *   · agent-memory（MEMORY.md）—— 跨会话注入的教训层；
 *   · user-memory（user.md）—— 用户级偏好；
 *   · session-archive（会话档案）—— 原始层（**只登记不判**）；
 *   · 四个目录导览 AGENTS.md —— 是**文档**不是账本（**只登记不判**）。
 *
 * ## 为什么 cutoff 从今天开始
 *
 * 存量条目（cutoff 之前）**不许被追溯判红** ⇒ ⇒ 它们走**债务清单**
 * （登记 + 计数比对，抄本仓「密钥落盘闸」那套：多了要销账，少了要登记）。
 * ⇒ ⇒ 但 **cutoff 之后的新条目必须带信封** ⇒ ⇒ 新债无处可躲。
 *
 * ## 覆盖边界（如实标注，别装作全覆盖）
 *
 * - 判得了：条目有没有信封、来源指针能不能解析、取代链断没断、债务有没有变多、
 *   以及**仓里有没有未登记的状态面**。
 * - 判不了：① 记忆**内容**本身对不对（那是模型的事）；② 会话档案里的派生副本
 *   （会话是原始层，不注入决策 ⇒ ⇒ 只登记）；③ **跨设备**同步来的状态
 *   （本机闸看不见别的设备写进来的那一份）；④ **跨面**引用（子仓账本指向父仓符号）
 *   —— 本版**按面内解析**算 ⇒ ⇒ 子仓指向父仓的引用会记成悬空 ⇒ ⇒ 登记为债务。
 */

/** 新条目必须带信封的起始日期（今天起）。 */
export const CUTOFF = '2026-11-05';

/**
 * 面清单。
 *
 * ⚠️ scope='repo' 的面**必须存在**（读不到 ⇒ ⇒ 退出码 2 ⇒ ⇒ 「没红」不等于「没问题」）。
 * ⚠️ scope='local' 的面**只在本机存在**（CI 里没有）⇒ ⇒ 默认**不读**
 *    （要读得显式 --include-local）⇒ ⇒ 但闸会**明确报「本轮未覆盖」**。
 * ⚠️ judge=false 的面**只登记不判** ⇒ ⇒ 理由必须写清（否则它就是没交代）。
 */
export const SURFACES = [
  {
    id: 'project-ledger',
    label: '项目账本（父仓 AGENTS.md）',
    scope: 'repo',
    rel: 'AGENTS.md',
    kind: 'md-updated',
    judge: true,
    cutoff: CUTOFF,
    why: '它是每次会话都被注入的项目指令 ⇒ ⇒ 直接授权未来行动 ⇒ ⇒ 它就是持久状态本体',
  },
  {
    id: 'desktop-ledger',
    label: '桌面端账本（shadow-desktop/AGENTS.md）',
    scope: 'repo',
    rel: 'shadow-desktop/AGENTS.md',
    kind: 'md-updated',
    judge: true,
    cutoff: CUTOFF,
    symbolDomain: ['project-ledger'],
    why: '桌面端 agent 的项目指令 ⇒ ⇒ 同样是注入面 ⇒ ⇒ 同样要能被撤销 ⇒ ⇒ 它可以合法引用父仓编号 ⇒ ⇒ 跨面符号域 = project-ledger',
  },
  {
    id: 'mobile-ledger',
    label: '移动端账本（shadow-mobile/AGENTS.md）',
    scope: 'repo',
    rel: 'shadow-mobile/AGENTS.md',
    kind: 'md-updated',
    judge: true,
    cutoff: CUTOFF,
    symbolDomain: ['project-ledger'],
    why: '移动端 agent 的项目指令 ⇒ ⇒ 同上 ⇒ ⇒ 它也引用父仓编号（「承父仓㋱条」）⇒ ⇒ 跨面符号域 = project-ledger',
  },
  {
    id: 'agent-memory',
    label: 'agent 记忆（MEMORY.md）',
    scope: 'local',
    kind: 'md-heading',
    judge: true,
    cutoff: CUTOFF,
    dataRel: 'agents/<agent>/memory/MEMORY.md',
    why: '跨会话注入的教训层 ⇒ ⇒ 同一族病（无信封、来源被压缩掉）在这里重演',
  },
  {
    id: 'user-memory',
    label: '用户记忆（user.md）',
    scope: 'local',
    kind: 'md-heading',
    judge: true,
    cutoff: CUTOFF,
    dataRel: 'memory/user.md',
    runtimeProvenance: true,
    why: '用户级偏好 ⇒ ⇒ 论文点名的 authority lapse（撤回后仍被执行）就发生在这里 ⇒ ⇒ 今天只有一条，且**没有撤销通道**。⚠️ runtimeProvenance=true ⇒ ⇒ 这个面的**写入器是运行时的记忆工具**（实测只支持 read/search/append）⇒ ⇒ 它给每条条目盖 `<!-- mem-append-reason: … -->` 注释（机器生成、不会忘）⇒ ⇒ 那个注释**就是**这个面的来源记录 ⇒ ⇒ 判据认「信封 **或** runtime 注释」⇒ ⇒ 两者都没有才红（2026-11-05 加：硬套信封会让这条规则**在该面上做不到**）',
  },
  {
    id: 'revocation-ledger',
    label: '撤销账本（state/revocation-ledger.json）',
    scope: 'repo',
    rel: 'state/revocation-ledger.json',
    kind: 'json-ledger',
    judge: false,
    why: '用户偏好的撤销记录（论文 §9.6 的 deletion ledger）⇒ ⇒ **由 check-preference-revocation.mjs 专判**（信封 / 权限 / 目标 / 防 lapse / 传播）⇒ ⇒ 本闸只登记',
  },
  {
    id: 'session-archive',
    label: '会话档案',
    scope: 'local',
    kind: 'opaque',
    judge: false,
    cutoff: CUTOFF,
    dataRel: 'v2/sessions',
    why: '原始层（可审计）⇒ ⇒ 不直接注入决策 ⇒ ⇒ 只登记不判；派生副本问题靠 source 字段解决',
  },
  {
    id: 'doc-desktop-src',
    label: '目录导览（shadow-desktop/src/AGENTS.md）',
    scope: 'repo',
    rel: 'shadow-desktop/src/AGENTS.md',
    kind: 'doc',
    judge: false,
    why: '目录导览文档（OVERVIEW/约定），**没有带圈编号的账目** ⇒ ⇒ 不是状态面 ⇒ ⇒ 只登记',
  },
  {
    id: 'doc-desktop-tauri',
    label: '目录导览（shadow-desktop/src-tauri/AGENTS.md）',
    scope: 'repo',
    rel: 'shadow-desktop/src-tauri/AGENTS.md',
    kind: 'doc',
    judge: false,
    why: '同上（Rust 后端目录导览）',
  },
  {
    id: 'doc-mobile-lib',
    label: '目录导览（shadow-mobile/lib/AGENTS.md）',
    scope: 'repo',
    rel: 'shadow-mobile/lib/AGENTS.md',
    kind: 'doc',
    judge: false,
    why: '同上（Flutter UI 目录导览）',
  },
  {
    id: 'doc-mobile-kotlin',
    label: '目录导览（shadow-mobile/android/.../shadow/AGENTS.md）',
    scope: 'repo',
    rel: 'shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/AGENTS.md',
    kind: 'doc',
    judge: false,
    why: '同上（Kotlin 原生层目录导览）',
  },
];

/**
 * 存量债务清单。
 *
 * ⚠️ 身份是「面 ＋ 种类 ＋ **条数**」⇒ ⇒ **不依赖行号**（行号会被人挪）
 *    ⇒ ⇒ 只在数量变了时判红。
 * ⚠️ 每条写清楚「**为什么还没修**」＋「**什么时候修**」⇒ ⇒ 否则它会变成
 *    一张永远没人还的清单（与本仓密钥落盘闸同一条纪律）。
 */
export const KNOWN_DEBT = [
  {
    surface: 'project-ledger',
    kind: 'positional-ref',
    count: 28,
    why: '「承上一条」「承用户那句」这类**位置型**指针 ⇒ ⇒ 账本是**只追加**的 ⇒ ⇒ 插入/删除一条就指错 ⇒ ⇒ 而且用户原话已经不在文件里 ⇒ ⇒ 等于**来源凭空**（论文说的那个 provenance failure）',
    when: 'P1（改成带圈编号的引用；用户原话要**原文引用**而不是转述）—— ⚠️ 本轮**不追溯改**：改 28 处历史条目会污染只追加的账本 ⇒ ⇒ 只堵增量（cutoff 之后的新条目不许用位置型指针）',
  },
  {
    surface: 'agent-memory',
    kind: 'positional-ref',
    count: 2,
    why: '两条记忆（「数一数有多少条」＋「Flutter 真机集成测试：退出码会撒谎」）用「承上一条」定位 ⇒ ⇒ 同上',
    when: 'P1（改成带条目标题/编号的引用）',
  },
  {
    surface: 'project-ledger',
    kind: 'duplicate-marker',
    count: 5,
    why: '5 个带圈标记**被两条条目同时占用**（㋱/㋰/㋛/㋕/㊻）⇒ ⇒ 「承㋱」**能解析但解析出两条** ⇒ ⇒ 比悬空更隐蔽（悬空会红，歧义不会）⇒ ⇒ 成因：历史上父仓与子仓的编号序列各自分配，撞车了',
    when: 'P1（给重复占用的一方改号；或给引用加「父仓/本仓」限定词消歧）—— ⚠️ 改号会让已有引用失配 ⇒ ⇒ 必须与引用一起改',
  },
  {
    surface: 'mobile-ledger',
    kind: 'duplicate-marker',
    count: 1,
    why: '㊸ 被两条占用（同上）',
    when: 'P1（同上）',
  },
  {
    surface: 'mobile-ledger',
    kind: 'ambiguous-cross-ref',
    count: 25,
    why: '移动端账本有 **46 个标记与父仓同名**（㋰…㋓ 等）⇒ ⇒ 于是「承㋤」**在本面与父仓各有一条** ⇒ ⇒ 不带限定词就分不清指的是哪一条 ⇒ ⇒ **25 处**这样的引用',
    when: 'P1（给跨面引用加「父仓」限定词 —— 判据认「父仓/跨仓/主仓/对面」这几个词）',
  },
  {
    surface: 'agent-memory',
    kind: 'dangling-symbol-ref',
    count: 4,
    why: '同一条记忆（「Flutter 真机集成测试：退出码会撒谎」）里出现「承㋱」×3 ＋「承㋤」×1 ⇒ ⇒ 但记忆层**没有带圈编号体系** ⇒ ⇒ 这些符号在本面解析不到 ⇒ ⇒ 它们是**从账本那边抄过来的编号**⇒ ⇒ 读者无法定位。⚠️ **2026-11-05 实测：计数从 1 涨到 4** ⇒ ⇒ 成因是**记忆层每次提到账本条目就顺手抄它的带圈编号** ⇒ ⇒ 这个计数会**单调增长** ⇒ ⇒ 靠「登记」堵不住 ⇒ ⇒ 真解是**禁止在记忆层用带圈引用**（或给记忆层也建编号体系）',
    when: 'P1（两条路：① 记忆层改用**条目标题**引用，不再抄带圈编号 ⇒ ⇒ 一条判据根治；② 给记忆层也建编号体系 ⇒ ⇒ 但记忆是跨项目的、账本编号是项目内的 ⇒ ⇒ 跨层抄编号本身就是错的 ⇒ ⇒ 走 ①）—— ⚠️ 本轮**只登记不追溯改**：这 4 处里有「承㋱」，而 ㋱ 在父仓**被两条条目占用**（历史撞号）⇒ ⇒ 要改成标题引用得先解开那个歧义 ⇒ ⇒ 与「duplicate-marker」那笔债一起还',
  },
  {
    surface: 'agent-memory',
    kind: 'entry-without-date',
    count: 12,
    why: '12 条记忆**标题里没有日期** ⇒ ⇒ 「这条什么时候写的」不可判定 ⇒ ⇒ **过期无法判定**（论文 §8.2.3 的 stale commitment）',
    when: 'P2（补日期；补不了的标成历史条目）',
  },
];
