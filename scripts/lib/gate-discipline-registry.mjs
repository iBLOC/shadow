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
    '⇒ ⇒ ⚠️ ziti-v2-wire 已于 2026-11-05 补上自检（13/13）⇒ ⇒ 已从本清单销账',
  gates: [
    'agent-surface',
    'apk-surface',
    'auth-backdoors',
    'cross-client',
    'jni-surface',
    'msrv-floor',
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
    '⇒ ⇒ ⚠️ ziti-v2-wire 已于 2026-11-05 接进 cortex-residue-stack job' +
    '（那个 job 已检出 synapse ＋ ziti-rust ⇒ ⇒ 它才判得了）⇒ ⇒ 已从本清单销账',
  gates: [
    'a2ui-session-identity',
    'agent-surface-credentials',
    'auth-backdoors',
    'bind-exposure',
    'client-dialect',
    'client-endpoint-map',
    'client-tools',
    'conversation-prefix',
    'cors-allowlist',
    'cross-client',
    'door-policy',
    'door-policy-parity',
    'endpoint-matrix',
    'msrv-floor',
    'provider-admin-headers',
    'publish-address',
    'secret-plaintext',
    'tool-interception',
    'ziti-face',
  ],
};

/** 闸没有「退出码 2」这一档 ⇒ ⇒ 分不开「源没读全」与「真有问题」。 */
export const NO_CANNOT_JUDGE_EXIT = {
  reason:
    '历史闸写的时候没有「判不了」这个概念 ⇒ ⇒ 源没读全时它只能报绿' +
    '⇒ ⇒ 「没查到」与「查过且没问题」长得一模一样',
  when:
    '各自下次被改动时补：凡是「可能读不全」的闸（要 cargo / 要兄弟仓 / ' +
    '要外网的）⇒ ⇒ 必须有退出码 2 那一档',
  gates: [
    'agent-surface',
    'brain-chain',
    'client-dialect',
    'client-tools',
    'cortex-residue-all',
    'cortex-residue',
    'cross-client',
    'jni-surface',
    'neuron-ownership',
    'provider-admin-headers',
  ],
};

/** 已接进 CI、但自检不印可数读数 ⇒ ⇒ 读数不可比。 */
export const NO_READING_IN_WIRED = {
  reason:
    '这些闸 CI 已经在跑了（工具链必然在位）⇒ ⇒ 自检必须绿、必须有可数读数' +
    '⇒ ⇒ 但它们当年只打印逐条 PASS/FAIL ⇒ ⇒ 看不出「跑了多少条」',
  when:
    '各自下次被改动时补一行 N/N 读数（改动最小的做法：自检末尾打印 ' +
    '「自检：N/N」）',
  gates: [
    'agent-surface',
    'apk-surface',
    'brain-chain',
    'cortex-residue-all',
    'cortex-residue',
    'jni-surface',
    'mobile-a11y-contract',
    'neuron-ownership',
    'ps1-portability',
  ],
};

/** 债清单（唯一一份）⇒ ⇒ 闸按它对账。 */
export const KNOWN_DEBT = {
  'no-self-test': NO_SELF_TEST,
  'not-wired-into-ci': NOT_WIRED_INTO_CI,
  'no-cannot-judge-exit': NO_CANNOT_JUDGE_EXIT,
  'no-reading-in-wired': NO_READING_IN_WIRED,
};
