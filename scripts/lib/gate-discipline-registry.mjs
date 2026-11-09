/**
 * 闸的治理闸 —— **存量债清单**（数据）
 * ============================================================================
 *
 * ⚠️ 判据（算法）在 ./gate-discipline.mjs（唯一一份）⇒ ⇒ 这里只有**数据**。
 *
 * ── 为什么要有「债」这一层 ────────────────────────────────────────
 * 本仓 34 道闸里，**大部分是历史闸** ⇒ ⇒ 它们当年没按今天的纪律写
 * （没有自检 / 没接 CI / 不印可数读数 / 没有「判不了」这一档）
 * ⇒ ⇒ 但它们是**别人的那条线**、且**多数需要本机工具链**（cargo / Flutter /
 * Android SDK / 兄弟仓在位）⇒ ⇒ 贸然改动会踩到别的会话的工作面
 * ⇒ ⇒ 所以：**存量登记，增量纪律** ⇒ ⇒
 *   · 登记在册的缺口 ⇒ ⇒ 本闸**放行**（但仍然打印出来）；
 *   · **没登记的新缺口** ⇒ ⇒ 直接红（不许悄悄长出来）；
 *   · 登记了、但缺口已经没了 ⇒ ⇒ 红（**要销账** ⇒ ⇒ 清单不许过期）。
 *
 * ⚠️ 每条都写清「为什么还没修」＋「什么时候修」⇒ ⇒ 债不许变成坟场。
 */

/** 闸没有 --self-test ⇒ ⇒ 它证明不了自己会红。 */
export const NO_SELF_TEST = {
  reason:
    '历史闸（或别的工作线上的闸）⇒ ⇒ 当年就没写自检 ⇒ ⇒ 传了 --self-test ' +
    '也只是跑一次正常检查 ⇒ ⇒ **恒绿的自检**（看着有自检，其实证明不了任何事）' +
    '⇒ ⇒ 其中 auth-backdoors / msrv-floor 连「跑一次正常检查」' +
    '都做不到（自检退出码 2 ⇒ ⇒ 本机判不了）',
  when:
    '各自下次被改动时补上（增量纪律）⇒ ⇒ msrv-floor 先补' +
    '（它在 CI 上也缺工具链 ⇒ ⇒ 要先想清楚「判不了」那档怎么报）' +
    '⇒ ⇒ ⚠️ ziti-v2-wire 已于 2026-11-05 补上自检（13/13）⇒ ⇒ 已从本清单销账 ' +
    '⇒ ⇒ 2026-11-11：cross-client（真自检 6/6 —— 真子进程注入 0/1/2/崩/文件不在）与 jni-surface（真自检 4/4 —— 夹具注入缺兄弟仓 / 没编 .so / Java 替身少入口）已补上 ⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ 2026-11-11：msrv-floor 已补**真自检 7/7**（把判断逻辑抽成纯函数 judge() ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ **不需要 cargo 也不需要 Cargo.toml**）⇒ ⇒ 已从本清单销账',
  gates: [
    'agent-surface',
    'apk-surface',
    'auth-backdoors',
  ],
};

/** 闸没接进 .github/workflows/ci.yml ⇒ ⇒ 有闸但没人跑。 */
export const NOT_WIRED_INTO_CI = {
  reason:
    '多数要本机工具链或密钥（cargo / Flutter / Android SDK / 兄弟仓在位）' +
    '⇒ ⇒ 贸然接进 CI 只会让 CI 因**无关原因**变红 ⇒ ⇒ ' +
    '其中 endpoint-matrix 还要端脑仓在位（端脑是自有闸 ⇒ ⇒ 跨仓 job 不检出它）',
  when:
    '逐个评估工具链依赖后接：先接纯文本闸（client-tools / secret-plaintext / ' +
    'door-policy 这类几十毫秒的），再处理要工具链的 ⇒ ⇒ ' +
    '接的时候同时补可数读数（否则会从「没接 CI」变成「接了但读数不可比」）' +
    '⇒ ⇒ ⚠️ ziti-v2-wire 已于 2026-11-05 接进跨仓 stack job（当时叫 cortex-residue-stack，2026-11-06 改名后叫 legacy-residue-stack）' +
    '（那个 job 已检出 synapse ＋ ziti-rust ⇒ ⇒ 它才判得了）⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ ziti-face 已于 2026-11-06 接进同一 job' +
    '（纯文本闸、两个布局都判得了 ⇒ ⇒ 本地闸 EXIT=0 ＋ self-test 50/50 后推）⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ door-policy / door-policy-parity 已于 2026-11-09 接进**独立** workflow' +
    '（.github/workflows/door-policy.yml ⇒ ⇒ 不碰共享的 ci.yml ⇒ ⇒ 接线面零共享）' +
    '（纯文本闸 ⇒ ⇒ 检出端脑就能判 ⇒ ⇒ 两道闸都认**两种布局**（仓外/仓内）' +
    '⇒ ⇒ 只认一种 ⇒ ⇒ CI 上「读不到判据源」⇒ ⇒ 退出码 2 ⇒ ⇒ 恒红' +
    '⇒ ⇒ 本地 EXIT=0 ＋ self-test 11/11 与 14/14）⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ secret-plaintext 已于 2026-11-09 接进**独立** workflow' +
    '（.github/workflows/secret-plaintext.yml ⇒ ⇒ 不碰共享的 ci.yml ⇒ ⇒ 接线面零共享）' +
    '（它是**跨仓**闸 ⇒ ⇒ 必须检出四个兄弟仓（私有 ⇒ ⇒ 需 secrets.IBLOC_TOKEN）' +
    '⇒ ⇒ 闸本体认**两种布局**（仓外/仓内）⇒ ⇒ 只认一种 ⇒ ⇒ CI 上「读不到判据源」⇒ ⇒ 恒红）' +
    '⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ 14 道已于 2026-11-11 接进**独立** workflow' +
    '（.github/workflows/unwired-gates.yml ⇒ ⇒ 不碰共享的 ci.yml ⇒ ⇒ 接线面零共享）' +
    '⇒ ⇒ 2026-11-11 **逐条在本机量过**：14 道**真跑绿**、1 道（msrv-floor）**判不了**' +
    '⇒ ⇒ 判不了那一档由 scripts/run-gate-once.mjs 转成「**显眼但不阻断**」' +
    '⇒ ⇒ 且同刀补齐了 D3（11 道闸的自检补上**可数读数** N/N ⇒ ⇒ 读数才可比）' +
    '⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ cross-client 仍留在这儿：它**没有 --self-test** ⇒ ⇒ 接进 CI 会新增一条 D3 缺口' +
    '⇒ ⇒ ⇒ ⇒ 补一个**真正的**自检之后再接（别拿「恒绿的自检」充数） ' +
    '⇒ ⇒ 2026-11-11：cross-client 已补真自检（6/6）＋ 退出码 2 那一档 ⇒ ⇒ 并接进 .github/workflows/unwired-gates.yml ⇒ ⇒ 已从本清单销账（这张表现在空了）',
  gates: [],
};

/** 闸没有「退出码 2」这一档 ⇒ ⇒ 分不开「源没读全」与「真有问题」。 */
export const NO_CANNOT_JUDGE_EXIT = {
  reason:
    '历史闸写的时候没有「判不了」这个概念 ⇒ ⇒ 源没读全时它只能报绿' +
    '⇒ ⇒ 「没查到」与「查过且没问题」长得一模一样',
  when:
    '各自下次被改动时补：凡是「可能读不全」的闸（要 cargo / 要兄弟仓 / ' +
    '要外网的）⇒ ⇒ 必须有退出码 2 那一档' +
    '⇒ ⇒ ⚠️ legacy-residue / legacy-residue-all（时名 cortex-residue / cortex-residue-all）已于 2026-11-05 补上那一档' +
    '（引擎的「判不了」现在会一路传出来：豁免条目腐烂 / 扫描目标指不到文件' +
    '⇒ ⇒ 退出码 2，不再伪装成「有问题」）⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ client-dialect / provider-admin-headers 同日销账：逐条量过 ——' +
    '它们的 process.exit(main()) 里 main() **确实 return 2** ⇒ ⇒ 那一档本来就有' +
    '⇒ ⇒ 是治理闸的**源码形状启发**（只认字面 exit(2)）把它误判成没有' +
    '⇒ ⇒ 治理闸已补「2 能到达 exit」的形状（exit 的参数是某个函数、且那个函数 return 2）' +
    '⇒ ⇒ 剩下 6 条是**真债**（实测：它们的 exit 只能取 0 / 1）⇒ ⇒ 本清单不装假债 ' +
    '⇒ ⇒ 2026-11-11：brain-chain / jni-surface / cross-client 已补退出码 2 那一档 ⇒ ⇒ 已从本清单销账（剩 3 条：agent-surface / client-tools / neuron-ownership，后两条是并行会话在飞件 ⇒ ⇒ 不代改）',
  gates: [
    'agent-surface',
    'client-tools',
    'neuron-ownership',
  ],
};

/** 已接进 CI、但自检不印可数读数 ⇒ ⇒ 读数不可比。 */
export const NO_READING_IN_WIRED = {
  reason:
    '这些闸 CI 已经在跑了（工具链必然在位）⇒ ⇒ 自检必须绿、必须有可数读数' +
    '⇒ ⇒ 但它们当年只打印逐条 PASS/FAIL ⇒ ⇒ 看不出「跑了多少条」',
  when:
    '各自下次被改动时补一行 N/N 读数（改动最小的做法：自检末尾打印 ' +
    '「自检：N/N」）' +
    '⇒ ⇒ ⚠️ legacy-residue / legacy-residue-all（时名 cortex-residue / cortex-residue-all）已于 2026-11-05 补上读数' +
    '（实测两个闸的自检都印「自检：5/5 条全绿」）⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ neuron-ownership 已于 2026-11-05 补上读数' +
    '（自检末尾印「自检：N/N 条全绿」）⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ ⚠️ ps1-portability 已于 2026-11-05 补上读数' +
    '（自检末尾印「自检：4/4」）⇒ ⇒ 已从本清单销账 ' +
    '⇒ ⇒ 2026-11-11：brain-chain（11 / 11）与 jni-surface（4 / 4）已印可数读数 ⇒ ⇒ 已从本清单销账' +
    '⇒ ⇒ 2026-11-11：mobile-a11y-contract（并行会话已补「样本 10/10」⇒ ⇒ 读数可比）⇒ ⇒ 已从本清单销账',
  gates: [
    'agent-surface',
    'apk-surface',
  ],
};

/** 债清单（唯一一份）⇒ ⇒ 闸按它对账。 */
export const KNOWN_DEBT = {
  'no-self-test': NO_SELF_TEST,
  'not-wired-into-ci': NOT_WIRED_INTO_CI,
  'no-cannot-judge-exit': NO_CANNOT_JUDGE_EXIT,
  'no-reading-in-wired': NO_READING_IN_WIRED,
};
