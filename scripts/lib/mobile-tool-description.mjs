//
// 「工具描述的口径」判据 —— **纯函数**（判据与 I/O 分离）。
//
// ## 为什么要有这道判据（2026-11-11 真机实测取证）
//
// ⚠️ **工具描述是模型唯一看到的口径说明** ⇒ ⇒ 它说错 ⇒ ⇒ 模型按错的口径选动作
// ⇒ ⇒ 而工具**返回值是对的** ⇒ ⇒ **失败长得像成功**。
//
// ## 取证：描述把「哪棵树」说成了「谁的屏」
//
// ① 真机读数（odin ee6b4832 · MIUI 14）：自家 app 在前台时读屏走的是
//    **原生那棵树** ⇒ ⇒ 逐字 `source=android-a11y`（**不是** flutter-semantics）
//    ⇒ ⇒ 「自家窗口读不到 ⇒ ⇒ 原生树在自家窗口上**必然是空的**」在 odin 上不成立。
// ② 而当时的工具描述写的是：
//    「android-a11y for another app … or flutter-semantics for this app own screen」
//    ⇒ ⇒ **把 source 说成了「谁的屏」** ⇒ ⇒ 模型照着它推理 ⇒ ⇒ 推理错。
// ③ 真正的「谁的屏」是**另一格**：`foregroundPackage`。
//
// ## 为什么按「性质」判，而不是按「某次真机读数」判
//
// ⇒ ⇒ 「自家 app 在前台时走哪棵树」是**平台行为**（odin 上是原生那棵，别的机型
// 可能不同）⇒ ⇒ 钉死某个值 = 钉死某个环境下的事实 ⇒ ⇒ 那是另一种脆。
// ⇒ ⇒ ⇒ 判据钉的是**性质**：「描述不许把 source 说成『谁的屏』」。
//
// ## 判别形状
//
// ⚠️ **按「归属措辞紧挨着 source 取值」判，不按全文搜**：
// ⇒ ⇒ 全文搜会误伤「foregroundPackage tells you whose screen it is」
// ⇒ ⇒ 那句是**归属的正确出处** ⇒ ⇒ 不该红。

/// 一条工具描述里的**归属措辞** —— 「这棵树是**谁家**的」。
const OWNER_WORDS = [
  'another app',
  'other app',
  'a different app',
  'someone else',
  'some other app',
];

///
/// 抽出「紧挨着某个 source 取值」的那一小段（到下一个句号/分号为止）。
///
/// ⚠️ 为什么截到句号：归属措辞写在紧后面 ⇒ ⇒ 而「另一格归属的正解」在更远的
/// 后面 ⇒ ⇒ 截断才不误伤它。
///
/// @param {string} desc  工具描述全文
/// @param {string} value source 取值（例如 android-a11y）
/// @returns {string} 该取值后面那一小段（找不到则空串）
export function clauseAfter(desc, value) {
  const at = desc.indexOf(value);
  if (at < 0) return '';
  const tail = desc.slice(at, at + Math.min(desc.length - at, 160));
  const stop = tail.search(/[.;]/);
  return stop > 0 ? tail.slice(0, stop) : tail;
}

///
/// 判一条工具描述的**口径**。
///
/// @param {{description: string, sourceValues: string[]}} input
/// @returns {{level: string, msg: string}[]}
export function checkToolDescription(input) {
  const problems = [];
  const add = (level, msg) => problems.push({ level, msg });
  const desc = input.description || '';
  const sourceValues = input.sourceValues || [];

  if (!desc) {
    add('block', '工具描述是空的 ⇒ ⇒ 模型看不到任何口径说明');
    return problems;
  }
  if (sourceValues.length < 2) {
    add('block', '取到的 source 取值不足两个 ⇒ ⇒ 判不了');
    return problems;
  }

  // ① 描述必须提到**每一个** source 取值 ⇒ ⇒ 否则模型有一棵树认不出来。
  for (const v of sourceValues) {
    if (!desc.includes(v)) {
      add('block', '工具描述里没有提到 source 取值「' + v + '」⇒ ⇒ 模型认不出这一棵树');
    }
  }

  // ② ⚠️ **承重的那一条**：不许把 source 说成「谁的屏」。
  for (const v of sourceValues) {
    const clause = clauseAfter(desc, v);
    const lower = clause.toLowerCase();
    for (const w of OWNER_WORDS) {
      if (lower.includes(w)) {
        add(
          'block',
          '工具描述把 source「' +
            v +
            '」说成了「谁的屏」（紧跟着「' +
            w +
            '」）⇒ ⇒ source 答的是「哪棵树」，「谁的屏」是 foregroundPackage 那一格' +
            ' ⇒ ⇒ 模型会按错的归属选动作 ⇒ ⇒ 失败长得像成功'
        );
        break;
      }
    }
  }

  // ③ 描述必须点名「这是谁的屏」那一格 ⇒ ⇒ 否则模型不知道去读哪一格。
  if (!desc.includes('foregroundPackage')) {
    add('block', '工具描述里没有提到 foregroundPackage ⇒ ⇒ 模型不知道「这是谁的屏」读哪一格');
  }

  return problems;
}
