/**
 * 跨面 diff —— 让「两个面的清单**差在哪一条**」成为**机器可读**的读数
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * 地板对账闸（scripts/check-msrv-floor-drift.mjs）每个面只给**一个**汇总结论
 * ＋ **一份**逐边清单 ⇒ ⇒ 两个面的读数不同 ⇒ ⇒ 「差在哪一条」只能靠**人工逐行比对**
 * ⇒ ⇒ 那一格在历史里反复重做 ⇒ ⇒ 而人比对的结果**没法复核**（下次谁也不知道比的是什么）。
 *
 * ## 它判的是什么（**不是**「两个面一样吗」）
 *
 * ⚠️ **清单不同 ≠ 红** —— 对账闸自己就写着「**边数不是判据，单调性才是**」
 * ⇒ ⇒ 跨面 diff 的判据必须是**结论**（红边集合）⇒ ⇒ 而不是清单本身。
 * ⇒ ⇒ 三档：
 *   · 0 same       —— 两面的结论**不冲突**（红边集合逐字相同）
 *   · 1 conflict   —— 两面的结论**冲突**（汇总不同 ／ 红边集合不同）
 *   · 2 判不了      —— 形状认不出 ／ 有一面自己的结论就是「判不了」
 *
 * ⚠️ **为什么「有一面判不了」⇒ ⇒ 判不了（而不是「相同」）**：
 *   一面说「判不了」＝「那一格我没验」⇒ ⇒ 不能读成「与另一面相同」
 *   ⇒ ⇒ 那是**最坏的一类假绿** ⇒ ⇒ 宁可判不了。
 *
 * ## 差异要**逐条点名**（不是「有 N 处不同」）
 *
 * · 边集合差异（只在 A ／ 只在 B）⇒ ⇒ 逐条列；
 * · 同一条边的**状态**差异（OK ↔ DRIFT ↔ UNDECIDABLE）⇒ ⇒ 逐条列；
 * · 仓的**面指纹**差异 ⇒ ⇒ 逐个列（**成因**：内容不同 ⇒ ⇒ 清单差异从这儿来）；
 * · 仓的 **rev** 差异（内容相同、提交不同）⇒ ⇒ 逐个列。
 *
 * ## 纯函数
 *
 * 零 I/O ⇒ ⇒ 自检喂**合成面**⇒ ⇒ 判读逻辑天天能验。
 */

import { listDigest } from './msrv-floor-drift.mjs';

/** 汇总结论的三个取值 —— 认不出 ⇒ ⇒ 判不了（绝不默认成某个值）。 */
export const VERDICTS = ['consistent', 'drift', 'cannot-judge'];

/** 逐边清单里一行的三个状态取值。 */
export const ROW_STATUSES = ['ok', 'drift', 'unresolved'];

/**
 * **认一个面**（对账闸 --json 的输出）⇒ ⇒ 认不出 ⇒ ⇒ 判不了（**绝不绿**）。
 *
 * ⚠️ **分母自检**：清单行数必须 ＝ 声明的「边数 ＋ 边外依赖数」
 *   ⇒ ⇒ 少一行就看得出来 ⇒ ⇒ 「形状变了」不会被读成「两个面相同」。
 *
 * @param {object} input 对账闸 --json 的输出
 * @param {string} label 这一面的名字（人读的）
 * @returns {{ok:boolean, face?:object, reason?:string}}
 */
export function parseFace(input, label) {
  const name = String(label || '面');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: name + '：不是一个 JSON 对象 ⇒ ⇒ 形状认不出 ⇒ ⇒ 判不了' };
  }
  const verdict = input.verdict;
  if (typeof verdict !== 'string' || VERDICTS.indexOf(verdict) < 0) {
    return { ok: false, reason: name + '：认不出结论「' + String(verdict) + '」（只认 ' + VERDICTS.join(' ／ ') + '）⇒ ⇒ 判不了' };
  }
  if (!Array.isArray(input.edgeRows)) {
    return { ok: false, reason: name + '：没有 edgeRows（逐边清单）⇒ ⇒ 形状认不出 ⇒ ⇒ 判不了' };
  }
  const rows = [];
  for (const r of input.edgeRows) {
    if (!r || typeof r.from !== 'string' || typeof r.to !== 'string' || typeof r.status !== 'string') {
      return { ok: false, reason: name + '：清单里有一行形状不对 ⇒ ⇒ 判不了' };
    }
    if (ROW_STATUSES.indexOf(r.status) < 0) {
      return { ok: false, reason: name + '：认不出边的状态「' + r.status + '」⇒ ⇒ 判不了' };
    }
    rows.push({
      key: r.from + ' -> ' + r.to,
      from: r.from,
      to: r.to,
      status: r.status,
      fromFloor: r.fromFloor == null ? null : String(r.fromFloor),
      toFloor: r.toFloor == null ? null : String(r.toFloor),
      owner: r.owner == null ? null : String(r.owner),
      inFace: r.inFace !== false,
    });
  }
  if (!Array.isArray(input.repos)) {
    return { ok: false, reason: name + '：没有 repos ⇒ ⇒ 形状认不出 ⇒ ⇒ 判不了' };
  }
  const repos = [];
  for (const r of input.repos) {
    if (!r || typeof r.repo !== 'string') {
      return { ok: false, reason: name + '：repos 里有形状不对的条目 ⇒ ⇒ 判不了' };
    }
    repos.push({
      name: r.repo,
      floor: r.floor == null ? null : String(r.floor),
      face: typeof r.face === 'string' ? r.face : '',
      rev: typeof r.rev === 'string' ? r.rev : '',
      dirty: typeof r.dirty === 'number' ? r.dirty : null,
    });
  }
  if (Array.isArray(input.edges) && Array.isArray(input.edgesOut)) {
    const expect = input.edges.length + input.edgesOut.length;
    if (expect !== rows.length) {
      return { ok: false, reason: name + '：清单行数 ' + rows.length + ' ≠ 声明的边数 ' + expect + '（边 ' + input.edges.length + ' ＋ 边外 ' + input.edgesOut.length + '）⇒ ⇒ 形状变了 ⇒ ⇒ 判不了' };
    }
  }
  return {
    ok: true,
    face: {
      label: name,
      verdict,
      rows,
      repos,
      list: listDigest(rows),
      note: input.faceNote && typeof input.faceNote === 'object' ? input.faceNote : null,
      mode: typeof input.faceMode === 'string' ? input.faceMode : '',
      missing: Array.isArray(input.missing) ? input.missing.slice() : [],
    },
  };
}

/** 两组字符串集合是否逐字相同（排序后比）。 */
function sameSet(x, y) {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * **两个面的 diff** —— 纯函数。
 *
 * @param {object} a parseFace 认出来的面 A
 * @param {object} b parseFace 认出来的面 B
 * @returns {object} diff
 */
export function diffFaces(a, b) {
  const rowsA = new Map(a.rows.map((r) => [r.key, r]));
  const rowsB = new Map(b.rows.map((r) => [r.key, r]));
  const keys = [...new Set([...rowsA.keys(), ...rowsB.keys()])].sort();
  const onlyA = [];
  const onlyB = [];
  const statusDiffs = [];
  const floorDiffs = [];
  const ownerDiffs = [];
  for (const k of keys) {
    const ra = rowsA.get(k);
    const rb = rowsB.get(k);
    if (!ra) { onlyB.push(k); continue; }
    if (!rb) { onlyA.push(k); continue; }
    if (ra.status !== rb.status) statusDiffs.push({ key: k, a: ra.status, b: rb.status });
    if ((ra.fromFloor || '') !== (rb.fromFloor || '') || (ra.toFloor || '') !== (rb.toFloor || '')) {
      floorDiffs.push({
        key: k,
        a: (ra.fromFloor || '<读不出>') + ' vs ' + (ra.toFloor || '<读不出>'),
        b: (rb.fromFloor || '<读不出>') + ' vs ' + (rb.toFloor || '<读不出>'),
      });
    }
    if ((ra.owner || '') !== (rb.owner || '')) ownerDiffs.push({ key: k, a: ra.owner, b: rb.owner });
  }
  const reposA = new Map(a.repos.map((r) => [r.name, r]));
  const reposB = new Map(b.repos.map((r) => [r.name, r]));
  const repoNames = [...new Set([...reposA.keys(), ...reposB.keys()])].sort();
  const repoOnlyA = [];
  const repoOnlyB = [];
  const faceChanged = [];
  const revChanged = [];
  const repoFloorChanged = [];
  for (const n of repoNames) {
    const ra = reposA.get(n);
    const rb = reposB.get(n);
    if (!ra) { repoOnlyB.push(n); continue; }
    if (!rb) { repoOnlyA.push(n); continue; }
    if (ra.face !== rb.face) {
      faceChanged.push({ name: n, aFace: ra.face, bFace: rb.face, aRev: ra.rev, bRev: rb.rev, aDirty: ra.dirty, bDirty: rb.dirty });
    } else if (ra.rev !== rb.rev) {
      revChanged.push({ name: n, aRev: ra.rev, bRev: rb.rev });
    }
    if ((ra.floor || '') !== (rb.floor || '')) repoFloorChanged.push({ name: n, a: ra.floor, b: rb.floor });
  }
  const redA = a.rows.filter((r) => r.status === 'drift').map((r) => r.key).sort();
  const redB = b.rows.filter((r) => r.status === 'drift').map((r) => r.key).sort();
  const undA = a.rows.filter((r) => r.status === 'unresolved').map((r) => r.key).sort();
  const undB = b.rows.filter((r) => r.status === 'unresolved').map((r) => r.key).sort();

  let verdict;
  let reason;
  if (a.verdict === 'cannot-judge' || b.verdict === 'cannot-judge') {
    verdict = 'cannot-judge';
    reason = '有一面自己的结论就是「判不了」（A＝' + a.verdict + ' ｜ B＝' + b.verdict + '）⇒ ⇒ 两面的结论**没法比** ⇒ ⇒ 那一格判不了（**不是「相同」**）';
  } else if (a.verdict !== b.verdict) {
    verdict = 'conflict';
    reason = '两面的汇总结论不同（A＝' + a.verdict + ' ｜ B＝' + b.verdict + '）⇒ ⇒ 结论冲突';
  } else if (!sameSet(redA, redB)) {
    verdict = 'conflict';
    reason = '两面的汇总结论相同（都是 ' + a.verdict + '），但**红边集合**不同 ⇒ ⇒ 结论仍然冲突（汇总一个数不够 ⇒ ⇒ 还要比红的那几条）';
  } else {
    verdict = 'same';
    reason = '两面的**红边集合**逐字相同（' + (redA.length ? redA.join('、') : '（无红边）') + '）⇒ ⇒ 结论不冲突';
  }
  return {
    verdict,
    reason,
    a,
    b,
    edgeSet: { onlyA, onlyB, common: keys.length - onlyA.length - onlyB.length },
    statusDiffs,
    floorDiffs,
    ownerDiffs,
    repos: { onlyA: repoOnlyA, onlyB: repoOnlyB, faceChanged, revChanged, floorChanged: repoFloorChanged },
    redA,
    redB,
    undecidableA: undA,
    undecidableB: undB,
    coverageDiffers: !sameSet(undA, undB),
  };
}

/**
 * **把 diff 说成人读的读数**（机器可读的行 ＋ ⇒ ⇒ 解释）。
 *
 * ⚠️ **判据自己要说那句话**（台账是给后来人读的，读数是给当班人读的）
 *   ⇒ ⇒ 「清单不同不是红」这句话必须由**这把尺自己**印出来。
 *
 * @param {object} diff diffFaces 的输出
 * @returns {string[]}
 */
export function renderFaceDiff(diff) {
  const a = diff.a;
  const b = diff.b;
  const lines = [];
  lines.push('FACE :: A :: ' + a.label + ' :: verdict=' + a.verdict + ' :: repos=' + a.repos.length + ' :: edges=' + a.rows.length + ' :: list=' + a.list);
  lines.push('FACE :: B :: ' + b.label + ' :: verdict=' + b.verdict + ' :: repos=' + b.repos.length + ' :: edges=' + b.rows.length + ' :: list=' + b.list);
  lines.push('FACE-DIFF :: verdict=' + diff.verdict
    + ' :: edge-set-diff=' + (diff.edgeSet.onlyA.length + diff.edgeSet.onlyB.length)
    + '（只在 A ' + diff.edgeSet.onlyA.length + ' ｜ 只在 B ' + diff.edgeSet.onlyB.length + '）'
    + ' :: status-diff=' + diff.statusDiffs.length
    + ' :: floor-diff=' + diff.floorDiffs.length
    + ' :: repo-face-diff=' + diff.repos.faceChanged.length
    + ' :: repo-rev-diff=' + diff.repos.revChanged.length);
  for (const k of diff.edgeSet.onlyA) lines.push('  DIFF :: EDGE-ONLY-A :: ' + k + ' :: 只在 A 有');
  for (const k of diff.edgeSet.onlyB) lines.push('  DIFF :: EDGE-ONLY-B :: ' + k + ' :: 只在 B 有');
  for (const d of diff.statusDiffs) lines.push('  DIFF :: EDGE-STATUS :: ' + d.key + ' :: A=' + d.a + ' :: B=' + d.b);
  for (const d of diff.floorDiffs) lines.push('  DIFF :: EDGE-FLOOR :: ' + d.key + ' :: A=' + d.a + ' :: B=' + d.b);
  for (const d of diff.ownerDiffs) lines.push('  DIFF :: EDGE-OWNER :: ' + d.key + ' :: A=' + d.a + ' :: B=' + d.b);
  for (const n of diff.repos.onlyA) lines.push('  DIFF :: REPO-ONLY-A :: ' + n + ' :: 只在 A 这一面');
  for (const n of diff.repos.onlyB) lines.push('  DIFF :: REPO-ONLY-B :: ' + n + ' :: 只在 B 这一面');
  for (const d of diff.repos.faceChanged) {
    lines.push('  DIFF :: REPO-FACE :: ' + d.name + ' :: A face=' + d.aFace + ' @' + d.aRev + ' :: B face=' + d.bFace + ' @' + d.bRev);
  }
  for (const d of diff.repos.revChanged) {
    lines.push('  DIFF :: REPO-REV :: ' + d.name + ' :: A @' + d.aRev + ' :: B @' + d.bRev + ' （内容相同、提交不同）');
  }
  for (const d of diff.repos.floorChanged) {
    lines.push('  DIFF :: REPO-FLOOR :: ' + d.name + ' :: A=' + d.a + ' :: B=' + d.b);
  }
  lines.push('  ⇒ ⇒ ' + diff.reason);
  lines.push('  ⇒ ⇒ 两面的清单不同**不是红**（⇒ ⇒ 边数不是判据，单调性才是）');
  if (diff.repos.faceChanged.length) {
    lines.push('  ⇒ ⇒ 差异的**成因**：' + diff.repos.faceChanged.map((d) => d.name).join('、')
      + ' 的**内容**在两面不同（面指纹不同）⇒ ⇒ 清单差异从这儿来 ⇒ ⇒ 逐条 diff 在上面');
  }
  if (diff.coverageDiffers) {
    lines.push('  ⇒ ⇒ ⚠️ 两面**验过的格子不一样**（A 的判不了 ' + diff.undecidableA.length + ' 条 ｜ B 的判不了 ' + diff.undecidableB.length + ' 条）'
      + ' ⇒ ⇒ 少的那几格**从没被查过** ⇒ ⇒ 不许当成「没问题」');
  }
  if (a.note && a.note.text) lines.push('  ⇒ ⇒ A 的面说明：' + a.note.text);
  if (b.note && b.note.text) lines.push('  ⇒ ⇒ B 的面说明：' + b.note.text);
  return lines;
}
