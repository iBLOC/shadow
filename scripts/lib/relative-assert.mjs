/**
 * 「**相对断言**」的两把纯函数 —— 演练判绿**只用**它们。
 *
 * ## 为什么要有这一族
 *
 * ⚠️ **绝对断言在「被测物带伤」时恒假**：断言形如「原始读数必须 0 条」
 *   ⇒ ⇒ 被测物一旦有存量违规，演练就**恒红** ⇒ ⇒ 红的是尺子、不是被测物
 *   ⇒ ⇒ 而 CI 的步骤顺序是「演练先跑、主判定后跑」⇒ ⇒ 主判定被 skipped
 *   ⇒ ⇒ ⇒ **真缺陷从未被判**（2026-11-11 的两次活例：账本闸的演练、码位闸的演练）。
 *
 * ⚠️ **绝对下限会假绿**：断言形如「判红条数 ≥ 2」⇒ ⇒ 存量把计数**抬高**
 *   ⇒ ⇒ 就算尺子根本没咬住，那条断言也成立 ⇒ ⇒ 「尺子咬住了：是」是假的。
 *
 * ⇒ ⇒ 修法只有一条：**判绿只由「注入腿」决定**，且断言的是**注入带来的增量**：
 *   · 注入后**多出了**违规（尺子咬住了）；
 *   · 注入后**一条都没少**（没有靠「修好别的」来凑数）。
 *
 * ## 为什么比**多重集**而不是「长度」或「逐位」
 *
 * · 比长度 ⇒ ⇒ 一红一换照样绿（**假绿**）；
 * · 逐位比 ⇒ ⇒ 顺序一变就红（**假红**）；
 * · 多重集差 ⇒ ⇒ 顺序无关，且「多出来的」与「少掉的」**分别可见**。
 *
 * ## 键取「**语义身份**」不是「位置」
 *
 * 键里**不许**带行号 ⇒ ⇒ 同一件事在两次读数里行号不同 ⇒ ⇒ 逐字比必假红。
 */

/** 多重集计数（键 ⇒ 次数）。 */
function counts(keys) {
  const m = new Map();
  for (const k of keys || []) m.set(k, (m.get(k) || 0) + 1);
  return m;
}

/**
 * 多重集差 ＝ b \ a（b 里比 a 多出来的键，**含重复次数**）。
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {string[]}
 */
export function multisetDiff(a, b) {
  const ca = counts(a);
  const cb = counts(b);
  const out = [];
  for (const [k, n] of cb) {
    const d = n - (ca.get(k) || 0);
    for (let i = 0; i < d; i++) out.push(k);
  }
  return out;
}

/**
 * 两个多重集是否**逐键同数**（顺序无关）。
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
export function sameMultiset(a, b) {
  const ca = counts(a);
  const cb = counts(b);
  if (ca.size !== cb.size) return false;
  for (const [k, n] of ca) if ((cb.get(k) || 0) !== n) return false;
  return true;
}

/**
 * 「**注入腿**」的相对判据 —— 返回 { added, lost, ok, reason }。
 *
 * ⚠️ `added`（多出来的）**不许**为空 ⇒ ⇒ 否则尺子根本没咬住（假绿）；
 * ⚠️ `lost`（少掉的）**必须**为空 ⇒ ⇒ 否则注入把别的违规「顺手修好」来凑数。
 *
 * @param {string[]} baselineKeys 原始读数的语义键
 * @param {string[]} injectedKeys 注入后的语义键
 */
export function injectedDelta(baselineKeys, injectedKeys, opts = {}) {
  const added = multisetDiff(baselineKeys, injectedKeys);
  const lost = multisetDiff(injectedKeys, baselineKeys);
  // ⚠️ **requireNoLoss** —— 有些注入会**改解析**（YAML 那道改表达式 ⇒ ⇒ 读数本来就可能变）
  //   ⇒ ⇒ 那类注入只要求「多出了期望的那一种」⇒ ⇒ 不许拿「一条不少」当判据。
  const requireNoLoss = opts.requireNoLoss !== false;
  // ⚠️ **expectKind** —— 「多出来的」里**必须**含这一种 ⇒ ⇒ 否则注入没被抓到也算绿。
  const expectKind = opts.expectKind || null;
  const kindOk = expectKind ? added.includes(expectKind) : true;
  const ok = added.length > 0 && kindOk && (!requireNoLoss || lost.length === 0);
  const reason =
    '多出来 ' + added.length + ' 条' + (added.length ? '（' + added.join(' ／ ') + '）' : '') +
    ' ／ 少掉 ' + lost.length + ' 条' + (lost.length ? '（' + lost.join(' ／ ') + '）' : '') +
    (expectKind ? ' ／ 期望含 ' + expectKind + '：' + (kindOk ? '是' : '否') : '') +
    ' ⇒ ⇒ ' + (ok ? '尺子咬住了（相对原始读数）' : (!kindOk ? '没抓到期望的那一种 ⇒ ⇒ 尺子没咬住' : (added.length ? '少掉了违规 ⇒ ⇒ 凑数' : '没多出违规 ⇒ ⇒ 尺子没咬住')));
  return { added, lost, ok, reason, kindOk };
}

/* ------------------------------ 自检 ------------------------------ */

/**
 * 这一族的自检 —— **纯函数** ⇒ ⇒ 能喂合成夹具。
 *
 * @returns {number} 0 全过；2 判不了／没过
 */
export function selfTest() {
  let fail = 0;
  const t = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? '  ✓ ' : '  ✗ ') + name + ' ⇒ 输出 ' + JSON.stringify(got) + '（期望 ' + JSON.stringify(want) + '）');
    if (!ok) fail += 1;
  };

  // ❶ 无存量 ⇒ 注入多出违规 ⇒ 判绿。
  t('无存量 ＋ 注入多出 1 条 ⇒ 相对判绿',
    injectedDelta([], ['missing-fgs-service']).ok, true);
  // ❷ **带存量**（被测物带伤）⇒ 注入仍多出 ⇒ 判绿 ⇒ ⇒ 演练不再被存量拖红。
  t('带存量（被测物带伤）＋ 注入多出 1 条 ⇒ 仍判绿（相对原始读数）',
    injectedDelta(['missing-dart-handler'], ['missing-dart-handler', 'missing-fgs-service']).ok, true);
  // ❸ 注入没带来任何新违规 ⇒ 判红（尺子没咬住）。
  t('注入没带来新违规 ⇒ 判红（尺子没咬住）',
    injectedDelta(['missing-fgs-service'], ['missing-fgs-service']).ok, false);
  // ❹ 注入「顺手修好」了别的违规 ⇒ 判红（凑数）。
  t('注入顺手修好了别的违规 ⇒ 判红（不许凑数）',
    injectedDelta(['a', 'b'], ['b']).ok, false);
  // ❺ 多重集差：重复次数也要算进去。
  t('多重集差（重复次数计入）',
    multisetDiff(['x'], ['x', 'x', 'y']), ['x', 'y']);
  // ❻ 多重集相等：顺序无关。
  t('多重集相等（顺序无关）',
    [sameMultiset(['a', 'b'], ['b', 'a']), sameMultiset(['a', 'a'], ['a', 'b'])], [true, false]);
  // ❼ 空基线 ＋ 空注入 ⇒ 判红（没咬住）⇒ ⇒ **恒真**的断言不许存在。
  t('空基线 ＋ 空注入 ⇒ 判红（不许恒真）',
    injectedDelta([], []).ok, false);

  // ❽ expectKind：注入带来的「多出来的」里**必须**含期望的那一种。
  t('expectKind：多出来的里含期望种类 ⇒ 判绿',
    injectedDelta([], ['plain-scalar-colon'], { expectKind: 'plain-scalar-colon' }).ok, true);
  // ❾ expectKind：多出来了但**不含**期望种类 ⇒ 判红（尺子抓错了东西）。
  t('expectKind：多出来的里不含期望种类 ⇒ 判红',
    injectedDelta([], ['tab-indent'], { expectKind: 'plain-scalar-colon' }).ok, false);
  // ❿ requireNoLoss=false：注入改了解析（少掉违规）⇒ ⇒ 那类注入只要求「多出来」。
  t('requireNoLoss=false：注入改了解析（少掉违规）⇒ ⇒ 仍按「多出来」判',
    injectedDelta(['a'], ['b'], { requireNoLoss: false }).ok, true);

  console.log('自检全过（相对断言 ' + (10 - fail) + '/10）');
  return fail === 0 ? 0 : 2;
}
