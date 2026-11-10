// 「提交面回退」判据内核 —— 纯函数（不含 git 调用，便于自检）。

// ⚠️ **台账「条目正文」那一层住在共享文件里** ⇒ ⇒ 两把尺子（提交面／暂存面）
//   判的是**同一族** ⇒ ⇒ **判据不许各判各的** ⇒ ⇒ 「台账一条怎么切」只有一份。
import { ledgerEntries, LEDGER_PATHS } from './ledger-entries.mjs';

/**
 * 一个「回退事件」的描述。
 * kind:
 *   'full'     —— **完全回退**：提交 B 把文件 F 整个还原到了 A 改动之前。
 *   'wiped'    —— **抹空**：提交 B 把文件 F 写成零字节。
 *   'inverted' —— **倒回**：B 把 A 的**整个增量**原样倒回（A 加的行全被删、A 删的行原字加回），
 *                 而 B **夹带自己的改动** ⇒ ⇒ 文件因此**没有**回到 A 之前 ⇒ ⇒ 'full' 抓不到它。
 *   'partial'  —— **部分回退**：B 的 diff 删掉了 A 的 diff 刚加上的那几行（**只提示不判红**）。
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
/**
 * 空 blob 的哈希 —— git **不会**给「空文件」发新哈希 ⇒ ⇒ 它永远是这两个常量之一
 * （按仓的对象格式选）⇒ ⇒ 判「这个文件是不是被写成零字节」**不需要**多打一次 git。
 */
export const EMPTY_BLOB_SHA1 = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
export const EMPTY_BLOB_SHA256 = '473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813';

export function emptyBlobHash(objectFormat) {
  return objectFormat === 'sha256' ? EMPTY_BLOB_SHA256 : EMPTY_BLOB_SHA1;
}

/**
 * **不用 diff 就能判的两类**（⇒ ⇒ 扫描层先用它分流，省掉大量 diff 调用）：
 *   ① 'full'  —— 完全回退：B 的结果 == A 改动之前的内容。
 *   ② 'wiped' —— **抹空**：B 把一个**非空**文件写成**零字节**。
 *
 * ⚠️⚠️ **「抹空」这一类是 2026-11-11 补上的，而且是补在**自己**身上**：
 *   本会话自己制造过一次事故 —— git hash-object --stdin 的 input 被误当环境变量
 *   ⇒ ⇒ stdin 为空 ⇒ ⇒ **台账 AGENTS.md 被提交成零字节**（5537 行删除）。
 *   ⇒ ⇒ 闸当时把它判成「**部分回退**」（只提示、不判红）⇒ ⇒ ⇒ **闸没抓住**
 *   ⇒ ⇒ 因为「完全回退」的判红条件是「B == A^」⇒ ⇒ 而「变成空」**不等于** A^
 *   ⇒ ⇒ ⇒ **通用形态：判红条件写窄了，就有一类事故从缝里掉过去**
 *   ⇒ ⇒ ⇒ 而这一类的破坏力**比完全回退更大**（整个文件没了）。
 */
export function quickKind({ aBefore, aAfter, bBefore, bAfter, empty }) {
  if (aBefore == null || aAfter == null) return null; // A 是新增文件 —— 不在本闸的射程内
  if (bAfter == null) return null; // B 删掉了这个文件 —— 「新增即删」不算悄悄回退
  // ① 完全回退
  if (aAfter !== aBefore && bAfter === aBefore && bBefore === aAfter) return 'full';
  // ② 抹空
  if (empty && bAfter === empty && aAfter !== empty) return 'wiped';
  return null;
}

export function classifyRevert({ blobs, aDiff, bDiff }) {
  const { aBefore, aAfter, bBefore, bAfter } = blobs;
  const q = quickKind({ aBefore, aAfter, bBefore, bAfter, empty: blobs.empty });
  if (q === 'full') return { kind: 'full', lines: [] };
  if (q === 'wiped') return { kind: 'wiped', lines: [] };
  if (aBefore == null || aAfter == null) return null; // A 是新增文件 —— 不在本闸的射程内
  if (bAfter == null) return null; // B 删掉了这个文件 —— 「新增即删」不算悄悄回退

  // ② 部分回退：B 删掉的行里，有 A 刚加上的行。
  const added = diffChangedLines(aDiff, '+');
  if (added.size === 0) return null;
  const removedByA = diffChangedLines(aDiff, '-');
  const addedByB = diffChangedLines(bDiff, '+');
  const removedByB = diffChangedLines(bDiff, '-');
  const hit = [];
  for (const line of removedByB) {
    if (added.has(line)) hit.push(line);
  }
  if (hit.length === 0) return null;

  // ③ ⚠️⚠️ **倒回（inverted）** —— 「整个增量被原样倒回，而 B 还夹带了自己的改动」。
  //
  //   ⚠️ **它为什么从缝里掉过去了**（2026-11-11 真历史实测）：
  //     'full' 的判据是「**整文件**回到 A 之前」（bAfter === aBefore）⇒ ⇒ 只要 B **多带一行**
  //     自己的改动 ⇒ ⇒ bAfter 就 ≠ aBefore ⇒ ⇒ 'full' **不成立** ⇒ ⇒ 这一族掉到 'partial'
  //     ⇒ ⇒ 而 'partial' **只提示不判红** ⇒ ⇒ ⇒ **A 的整个增量被悄悄丢弃，闸却看不见**。
  //     真样本：`c62f500` 把 `639a556` 的 5 行原样倒回（且夹带自己的 5 行）—— 事件**真发生过**。
  //
  //   ⚠️ **判据形状**（逐字量出来的，不是拍的）：
  //     hit  ＝ B 删掉的行 ∩ A 加上的行 ⇒ ⇒ 落 hit.length === added.size ⇒ ⇒ **A 加的每一行都被删了**
  //     back ＝ A 删掉的行 ∩ B 加上的行 ⇒ ⇒ 落 back.length === removedByA.size ⇒ ⇒ **A 删的每一行都被原字加回**
  //     两条**同时**成立 ⇒ ⇒ B 的 diff 就是 A 的 diff 的**逐行逆** ⇒ ⇒ 「倒回」**不容误认**。
  //
  //   ⚠️⚠️ **为什么要求 removedByA.size > 0**（这一条是**收窄**，写清楚免得日后被当成漏网）：
  //     若 A **只加不删**（A 没删过任何行），那么「B 把 A 加的行全删了」**与「B 改写重写」不可区分**
  //     —— 改写是**正常演进**里最常见的一类 ⇒ ⇒ 那一族**刻意留在 'partial'**（只提示）。
  //     ⇒ ⇒ 「原样倒回」要**有东西可原样加回**才成立 ⇒ ⇒ 这一族**不是漏网，是划界**。
  const back = [];
  for (const line of removedByA) {
    if (addedByB.has(line)) back.push(line);
  }
  if (hit.length === added.size && back.length === removedByA.size && removedByA.size > 0) {
    return { kind: 'inverted', lines: hit };
  }
  return { kind: 'partial', lines: hit };
}

/**
 * **条目级回退（entry-reverted）** —— 「B 把 A 改过的那一条台账条目，退回成 A 之前的那个版本」。
 *
 * ⚠️ **为什么要有这一档**（承「尺子要能照住自己的射程」）：
 *   · 'full' 判的是**整文件**回到 A 之前 ⇒ ⇒ B 夹带自己的改动 ⇒ ⇒ 它看不见；
 *   · 'inverted' 判的是 **A 的整个增量**被逐行倒回 ⇒ ⇒ **只退了一部分** ⇒ ⇒ 它也看不见；
 *   · ⇒ ⇒ 「**把某一条条目退回旧版、其余照旧**」那一族 ⇒ ⇒ 落进 'partial'（只提示不判红）
 *     ⇒ ⇒ ⇒ **一条台账条目的正文被静悄悄丢掉，闸却只提示**。
 *   · 而台账条目是**判据的来源**（谁在什么面上说了什么）⇒ ⇒ 丢一条比丢一行代码更贵。
 *
 * ⚠️ **分界线取「逐字等于 A 之前的那个版本」** ⇒ ⇒ 合法演进产生的是**全新**内容 ⇒ ⇒ 不命中
 *   ⇒ ⇒ 零噪声（与暂存面那把的 R5 同一形状 ⇒ ⇒ **共用同一份切分**）。
 *
 * ⚠️ **划界（这一档刻意不覆盖的三件事，写清楚免得日后被当成漏网）**：
 *   ① **B 把这一条删掉** ⇒ ⇒ 那是「**条目退役**」，是正常演进 ⇒ ⇒ 不判红（否则闸恒红）；
 *   ② **A 新增的条目**被 B 删掉 ⇒ ⇒ 「新增即删」⇒ ⇒ 本来就不在本闸射程内；
 *   ③ **A 根本没改这一条** ⇒ ⇒ 与本档无关。
 *
 * @param {{file:string, aBeforeText:string|null, aAfterText:string|null, bAfterText:string|null}} input
 * @returns {{kind:'entry-reverted', symbols:string[]}|null}
 */
export function classifyEntryRevert({ file, aBeforeText, aAfterText, bAfterText }) {
  if (!LEDGER_PATHS.includes(file)) return null;
  if (aBeforeText == null || aAfterText == null || bAfterText == null) return null;
  const before = ledgerEntries(aBeforeText);
  const after = ledgerEntries(aAfterText);
  const now = ledgerEntries(bAfterText);
  const symbols = [];
  for (const [sym, tAfter] of after) {
    const tBefore = before.get(sym);
    if (tBefore == null) continue; // ② A 新增的条目 ⇒ 没有「可被退回的旧版」
    if (tAfter === tBefore) continue; // ③ A 根本没改这一条
    const tNow = now.get(sym);
    if (tNow == null) continue; // ① B 把这一条删了（退役）⇒ ⇒ 不判红
    if (tNow !== tBefore) continue; // B 的这一条不是旧版 ⇒ ⇒ 不是「退回旧版」
    // ⚠️⚠️ ④ **A 必须真的引入过新行** ⇒ ⇒ 这一条是**实测出来的**（不是推的）。
    //   真样本：`0ab9bec`（**合法去重**）—— A 把同一段**重复插了两份**，B 删掉一份
    //   ⇒ ⇒ 这一条的正文**逐字**变回 A 之前的版本 ⇒ ⇒ 「逐字等于旧版」这一条**单独**会误判红
    //   ⇒ ⇒ 而那一笔**一行新内容都没引入**（行集合一模一样，只是份数变了）
    //   ⇒ ⇒ ⇒ **判据要问「A 到底有没有引入新东西」，而不只是「B 是不是回到了旧版」**。
    if (entryIntroducedLines(tAfter, tBefore).length === 0) continue;
    symbols.push(sym);
  }
  if (!symbols.length) return null;
  return { kind: 'entry-reverted', symbols };
}

/**
 * 这一条在【A 之后】比【A 之前】**多出来的行**（行集合，去掉空白行）。
 *
 * ⚠️ **它为什么存在**（真历史实测，见 `classifyEntryRevert` 的 ④）：
 *   「B 的这一条逐字等于 A 之前的版本」**不足以**判红 ⇒ ⇒ 因为**去重**那一族
 *   （A 重复插入一段、B 删掉一份）会让正文**逐字**回到旧版 ⇒ ⇒ 而那一族是**合法的修复**。
 *   ⇒ ⇒ 分界线取「**A 真的引入过新行**」⇒ ⇒ 合法去重不误伤、真正的静悄悄回退照样抓到。
 */
function entryIntroducedLines(tAfter, tBefore) {
  const before = new Set(
    String(tBefore).split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
  );
  return String(tAfter)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !before.has(l));
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
 *   ⇒ ⇒ 它降为**提示层**（读数里点名，人工判读），判红只留给「整个文件回到 A 之前」那一族。
 *
 * ⚠️ **2026-11-11 补第三档**：'inverted'（**倒回**）也判红 —— 理由与 'full' **同源**：
 *   A 的增量**一条不剩**地没了（A 加的行全被删、A 删的行被原字加回），只是 B 多带了自己的改动
 *   ⇒ ⇒ 于是文件**没有**回到 A 之前 ⇒ ⇒ 'full' 的判据看不见它 ⇒ ⇒ 若不单独设档，它就掉进
 *   'partial' 的提示层 ⇒ ⇒ ⇒ **A 的整个增量被悄悄丢弃，闸却报「零静悄悄回退」**。
 */
export function shouldFail(event, registry) {
  if (!event) return false;
  // ⚠️ **四档都判红**：完全回退（回到 A 之前）＋ **抹空**（写成零字节）＋ **倒回**（整个增量被原样倒回）
  //   ＋ **条目退回旧版**（把某一条台账条目的正文退回成旧版）。
  //   ⇒ ⇒ 四者的破坏是**同一族**：**把别人写的东西整个抹掉了** ⇒ ⇒ 逃逸口也一样
  //   （标题行声明 ＋ 登记在册）⇒ ⇒ ⇒ ⇒ **回退本身合法，静悄悄的回退才是病**。
  if (
    event.kind !== 'full' &&
    event.kind !== 'wiped' &&
    event.kind !== 'inverted' &&
    event.kind !== 'entry-reverted'
  ) {
    return false;
  }
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