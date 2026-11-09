// 「提交面回退闸」的**登记在册**清单 —— 已知的历史事件，放行但必须打印。

/**
 * 每一项 = { commit, file, why }。
 *  · commit 与 file 都必须**逐字**对上 ⇒ ⇒ 登记不是「白名单目录」，
 *    是一笔**具体的**事件 ⇒ ⇒ 不能拿它当万能赦免。
 *  · why 是**为什么可以放行**（要能被后来人反证）。
 */
export const REGISTERED_REVERTS = [
  {
    commit: 'afb781461a1be8d9086dbef76ad17b98bdc53d8a',
    file: 'shadow-desktop/tests/e2e-ui/e2e-task-scheduling.spec.ts',
    why:
      '2026-11-09 并发提交：两个会话各自构造提交面 ⇒ 这一笔的基线落后于 21f56d4 ⇒ ⇒ ' +
      '它把 TS7006 的类型补法整段退回旧版 ⇒ ⇒ 事件**真发生过**（真 CI run 42646242924 红了）' +
      '⇒ ⇒ 已由 d36bb09 明确撤销（那一笔的提交信息里写了「撤销」）⇒ ⇒ 登记在册，放行。',
  },
];