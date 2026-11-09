// 「提交面回退」判据内核 —— 纯函数（不含 git 调用，便于自检）。

/**
 * 一个「回退事件」的描述。
 * kind:
 *   'full'     —— **完全回退**：提交 B 把文件 F 整个还原到了 A 改动之前。
 *   'partial'  —— **部分回退**：B 的 diff 删掉了 A 的 diff 刚加上的那几行。
 * A/B 是两个提交；A 是 B 的父链上**最近一次**改过 F 的提交。
 */

/** 取 diff 里新增/删除的行集合（不含 +++ / --- 头），逐行 trimEnd。 */
export function diffChangedLines(diffText, sign) {
  const out = new Set();
  for (const raw of diffText.split('\n')) {
    if (!raw.startsWith(sign)) continue;
    if (raw.startsWith(sign + sign + sign)) continue;
    const line = raw.slice(1).trimEnd();
    if (line.trim() === '') continue;
    out.add(line);
  }
  return out;
}

/**
 * 判「B 的改动是否把 A 的增量退掉了」。
 *
 * blobs: { aBefore, aAfter, bBefore, bAfter } —— 四个版本的文件内容（可为 null = 文件不存在）。
 * aDiff / bDiff：对应的 diff 文本（'A' 与 'B' 各自的增量）。
 */
export function classifyRevert({ blobs, aDiff, bDiff }) {
  const { aBefore, aAfter, bBefore, bAfter } = blobs;
  if (aBefore == null || aAfter == null) return null; // A 是新增文件 —— 不在本闸的射程内
  if (bAfter == null) return null; // B 删掉了这个文件 —— 「新增即删」不算悄悄回退

  // ① 完全回退：B 的结果 == A 改动之前的内容，且 A 确实改过它。
  if (aAfter !== aBefore && bAfter === aBefore && bBefore === aAfter) {
    return { kind: 'full', lines: [] };
  }

  // ② 部分回退：B 删掉的行里，有 A 刚加上的行。
  const added = diffChangedLines(aDiff, '+');
  if (added.size === 0) return null;
  const removedByB = diffChangedLines(bDiff, '-');
  const hit = [];
  for (const line of removedByB) {
    if (added.has(line)) hit.push(line);
  }
  if (hit.length === 0) return null;
  return { kind: 'partial', lines: hit };
}

/**
 * 「这次提交**声明了**自己要回退别人」—— 认三种形状：
 *   ① git revert 生成的（This reverts commit … / 首行 Revert …）；
 *   ② 中文明写「撤销」「回退」「退回」。
 *
 * ⚠️ **为什么要有这一层**：回退本身是合法动作 ⇒ ⇒ 判据要问的不是「有没有回退」，
 *   而是「**有没有人说**」⇒ ⇒ 静悄悄的回退才是病。
 *   ⇒ ⇒ 而「声明」就留在 git 历史里（提交信息）⇒ ⇒ 它本身就是审计痕迹。
 */
export function declaresRevert(message) {
  if (!message) return false;
  const first = (message.split('\n')[0] || '').trim();
  // ① git revert 生成的提交：首行就是 Revert "…"；正文有 This reverts commit …
  if (/^Revert\b/.test(first)) return true;
  if (/This reverts commit [0-9a-f]{7,40}/i.test(message)) return true;
  // ② 中文明写「撤销 / 回退 / 退回」—— ⚠️ **只看标题行**
  //   ⇒ ⇒ 正文里随口一句「不会把它退回旧版」不该算声明
  //   ⇒ ⇒ 那是**实测出来的**：afb7814 的正文里就有一句类似的话 ⇒ ⇒ 差点把
  //   ⇒ ⇒ 那次**静悄悄的完全回退**放过去 ⇒ ⇒ 闸就没有牙了。
  if (/撤销|回退|退回/.test(first)) return true;
  return false;
}

/**
 * **判红的唯一条件**：完全回退 ＋ 提交信息**没有**声明这次回退。
 *
 * ⚠️ **为什么部分回退不判红**（2026-11-09 实测出来的）：「B 删掉了 A 加上的那几行」
 *   在**正常演进**里极常见 —— 改一行代码、改一行断言、重排一份词表、下线一个入口
 *   ⇒ ⇒ 全都会命中 ⇒ ⇒ 判红 ⇒ ⇒ 闸就恒红了 ⇒ ⇒ 没人看。
 *   ⇒ ⇒ 它降为**提示层**（读数里点名，人工判读），判红只留给「整个文件回到 A 之前」。
 */
export function shouldFail(event, registry) {
  if (!event) return false;
  if (event.kind !== 'full') return false;
  if (declaresRevert(event.message)) return false;
  if (isRegistered(registry, event.commit, event.file)) return false;
  return true;
}

/**
 * 显式登记（白名单）：文件里登记的 [提交, 文件] 组合放行。
 * 登记的必须是**具体的一笔**，不许登记一个目录或前缀 —— 「刀」要么真就真。
 */
export function isRegistered(registry, commit, file) {
  return (registry || []).some((e) => e && e.commit === commit && e.file === file);
}