// 「提交前：暂存面里有没有文件被写成零字节」—— **纯判定**（不碰 git，好测）。

/**
 * 空 blob 的哈希 —— git 不会给空文件发新哈希 ⇒ ⇒ 它永远是这两个常量之一
 * （按仓的对象格式选）⇒ ⇒ 判「这个文件是不是被写成零字节」**不需要**多打一次 git。
 */
export const EMPTY_BLOB_SHA1 = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
export const EMPTY_BLOB_SHA256 = '473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813';

export function emptyBlobHash(objectFormat) {
  return objectFormat === 'sha256' ? EMPTY_BLOB_SHA256 : EMPTY_BLOB_SHA1;
}

/**
 * **判定：暂存面里有没有「非空文件被写成零字节」。**
 *
 * entries 的每一项 = { path, headBlob, indexBlob }（**blob 哈希**，不是字节数）：
 *   · headBlob   ＝ 该路径在 HEAD 里的 blob（null ＝ HEAD 里**没有**这个路径）
 *   · indexBlob  ＝ 该路径在暂存区（index）里的 blob
 *
 * ⚠️ **只判这一种形态**：
 *   · HEAD 里**没有**（新增文件）⇒ ⇒ 不判（新增一个空文件是合法动作）
 *   · HEAD 里**本来就是空的**（它的 blob 就是空 blob 的哈希）⇒ ⇒ 不判
 *   · HEAD 里非空 ＋ 暂存面里是**空 blob** ⇒ ⇒ **抹空** ⇒ ⇒ 判红
 *
 * ⚠️⚠️ **为什么比「长度」而不是「长度」—— 一个实测出来的坑**：
 *   空 blob 的**哈希**是常量（e69de29b…）⇒ ⇒ 判「零字节」**零次 git 调用**。
 *   但是——**那个空对象常常压根不在对象库里**（仓里从没存过空文件时，
 *   `git cat-file --batch-check` 对它回的是 **missing**，不是 "blob 0"）
 *   ⇒ ⇒ ⇒ **凡���去问 git「这个 blob 多长」，问到的可能是「没有这个东西」**
 *   ⇒ ⇒ ⇒ 而「拿不到长度」在代码里长得很像「长度不是 0」
 *   ⇒ ⇒ ⇒ ⇒ **⇒「零字节」只能靠哈希常量判，绝不能靠问长度。**
 *   （本条的第一版正是这么写的 ⇒ ⇒ 实测：自检第 ① 档**没抓到** ⇒ ⇒ 差点交上一把
 *     **永远不会红**的闸。）
 *
 * ⚠️ **为什么只判这一种**：这一族事故**真发生过** —— 2026-11-11 本会话把父仓
 *   台账 AGENTS.md 提交成了零字节（2.45 MB ⇒ ⇒ 0）⇒ ⇒ master 上的台账整本消失
 *   ⇒ ⇒ 而提交**提交之后**才发现（两分钟后）⇒ ⇒ ⇒ 「提交前」这一格必须有人管。
 */
export function checkStagedWipes(entries, emptyHash) {
  const empty = emptyHash || EMPTY_BLOB_SHA1;
  const bad = [];
  for (const e of entries || []) {
    if (!e || e.headBlob == null) continue;   // 新增文件 —— 没有「被抹掉」可言
    if (e.headBlob === empty) continue;       // 本来就是空的 —— 它一直是空的
    if (e.indexBlob === empty) bad.push(e);   // ⇒ ⇒ 抹空
  }
  return bad;
}
