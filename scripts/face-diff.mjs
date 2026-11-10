#!/usr/bin/env node
/**
 * 跨面 diff —— **工具**（不是闸）—— 「两个面的清单差在哪一条」的机器读数
 * ============================================================================
 *
 * ## 它是什么
 *
 * 两个「面」（face）＝ 两组读数的来源。本仓里同一个尺可以量两面：
 *   · **工作树面**（--face=worktree）＝ 各仓当前文件；
 *   · **提交面**（--face=commit）＝ 各仓 HEAD ⇒ ⇒ **与 CI 量的同一面**。
 *
 * ⇒ ⇒ 两面的读数天然可以不同 ⇒ ⇒ 「差在哪一条」必须**逐条点名**
 * ⇒ ⇒ 本工具就是那把点名尺。
 *
 * ## 为什么它**不叫** check-*.mjs
 *
 * ⚠️ 它**不是闸**（不判本仓的合规，只比两个面的读数）⇒ ⇒ 闸的治理闸只认
 *   check-*.mjs ⇒ ⇒ 把它伪装成闸 ⇒ ⇒ 就是「一把没人接线的尺子」。
 *
 * ## 用法
 *
 *   node scripts/face-diff.mjs --self-test
 *   node scripts/face-diff.mjs --face-a <A.json> --face-b <B.json> [--label-a 名字] [--label-b 名字]
 *
 * ⚠️ 输入是**对账闸 --json 的输出**：
 *   node scripts/check-msrv-floor-drift.mjs --json --face=worktree > face-worktree.json
 *   node scripts/check-msrv-floor-drift.mjs --json --face=commit   > face-commit.json
 *
 * ## 退出码
 *
 * · 0 两面的**结论不冲突**（红边集合逐字相同）—— ⚠️ 清单不同**不是红**
 * · 1 两面的**结论冲突**（汇总不同 ／ 红边集合不同）
 * · 2 **判不了**（形状认不出 ／ 有一面自己的结论就是「判不了」）
 *
 * ⚠️ 退出码跟「清单一样吗」**无关** —— 判据是**结论**（承 U+34EC 条那句
 *   「**边数不是判据，单调性才是**」）。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffFaces, parseFace, renderFaceDiff } from './lib/face-diff.mjs';

/** 造一个合成面（自检用）—— 边数组与清单行数**对齐**（分母不许缩）。 */
function synthFace(verdict, rows, repos, extra) {
  return Object.assign({
    verdict,
    edgeRows: rows,
    repos: repos || [],
    edges: rows.map((r) => ({ from: r.from, to: r.to })),
    edgesOut: [],
  }, extra || {});
}

/** 一条合成边。 */
function row(from, to, status, owner, fromFloor, toFloor) {
  return {
    from,
    to,
    status: status || 'ok',
    owner: owner || 'sibling',
    fromFloor: fromFloor === undefined ? '1.94' : fromFloor,
    toFloor: toFloor === undefined ? '1.94' : toFloor,
  };
}

/**
 * 真自检 —— 合成面喂进 diffFaces() ⇒ ⇒ 证明这三档判得住。
 *
 * ⚠️ 夹具照抄**真实形状**：面指纹 ／ rev ／ dirty ／ 责任方 ／ 地板取值。
 */
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const repoA = { repo: 'hippocampus', floor: '1.94', face: 'aaaaaaaaaaaa', rev: 'ae6b73a', dirty: 9 };
  const repoB = { repo: 'hippocampus', floor: '1.94', face: 'bbbbbbbbbbbb', rev: 'ae6b73a', dirty: 0 };

  add('同一面跟自己 ⇒ ⇒ 结论不冲突、零差异', () => {
    const f = synthFace('consistent', [row('a', 'b')], [repoA]);
    const p = parseFace(f, 'A');
    const d = diffFaces(p.face, p.face);
    return d.verdict === 'same' && d.edgeSet.onlyA.length === 0 && d.edgeSet.onlyB.length === 0
      && d.repos.faceChanged.length === 0;
  });

  add('**清单不同 ≠ 红**：B 多一条边、结论相同 ⇒ ⇒ 不冲突，**且那条边被点名**', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b'), row('hippocampus', 'neuron')], [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.verdict === 'same' && d.edgeSet.onlyB.length === 1
      && d.edgeSet.onlyB[0] === 'hippocampus -> neuron' && d.edgeSet.onlyA.length === 0;
  });

  add('汇总结论不同（一致 vs 漂移）⇒ ⇒ **冲突**（红）', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'A').face;
    const b = parseFace(synthFace('drift', [row('a', 'b', 'drift')], [repoA]), 'B').face;
    return diffFaces(a, b).verdict === 'conflict';
  });

  add('**汇总相同（都漂移）但红的那几条不同** ⇒ ⇒ 仍然**冲突**（汇总一个数不够）', () => {
    const a = parseFace(synthFace('drift', [row('a', 'b', 'drift')], [repoA]), 'A').face;
    const b = parseFace(synthFace('drift', [row('x', 'y', 'drift')], [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.verdict === 'conflict' && d.redA.length === 1 && d.redB.length === 1 && d.redA[0] !== d.redB[0];
  });

  add('**有一面自己的结论是「判不了」⇒ ⇒ 判不了（不是「相同」）**', () => {
    const a = parseFace(synthFace('cannot-judge', [row('a', 'b', 'unresolved')], [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.verdict === 'cannot-judge' && d.verdict !== 'same';
  });

  add('两面**都**说「判不了」⇒ ⇒ 仍然是判不了（不是「相同」）', () => {
    const a = parseFace(synthFace('cannot-judge', [row('a', 'b', 'unresolved')], [repoA]), 'A').face;
    const b = parseFace(synthFace('cannot-judge', [row('a', 'b', 'unresolved')], [repoA]), 'B').face;
    return diffFaces(a, b).verdict === 'cannot-judge';
  });

  add('形状认不出（没有 edgeRows）⇒ ⇒ 判不了（**绝不绿**）', () => {
    const p = parseFace({ verdict: 'consistent', repos: [] }, 'A');
    return p.ok === false && String(p.reason).includes('判不了');
  });

  add('**分母自检**：清单行数 ≠ 声明的边数 ⇒ ⇒ 判不了（形状变了）', () => {
    const f = synthFace('consistent', [row('a', 'b')], [repoA]);
    f.edges = [];
    const p = parseFace(f, 'A');
    return p.ok === false && String(p.reason).includes('形状变了');
  });

  add('认不出的结论取值 ⇒ ⇒ 判不了（绝不默认成「一致」）', () => {
    const f = synthFace('consistent', [row('a', 'b')], [repoA]);
    f.verdict = 'green-ish';
    return parseFace(f, 'A').ok === false;
  });

  add('认不出的边状态 ⇒ ⇒ 判不了', () => {
    const f = synthFace('consistent', [row('a', 'b')], [repoA]);
    f.edgeRows[0].status = 'maybe';
    return parseFace(f, 'A').ok === false;
  });

  add('**面指纹不同** ⇒ ⇒ 被点名（**成因**：内容不同）', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b')], [repoB]), 'B').face;
    const d = diffFaces(a, b);
    return d.repos.faceChanged.length === 1 && d.repos.faceChanged[0].name === 'hippocampus';
  });

  add('**内容相同、rev 不同** ⇒ ⇒ 报 REPO-REV（**不是**面指纹不同）', () => {
    const r2 = { repo: 'x', floor: '1.94', face: 'cccccccccccc', rev: '9999999', dirty: 0 };
    const r1 = { repo: 'x', floor: '1.94', face: 'cccccccccccc', rev: '1111111', dirty: 0 };
    const a = parseFace(synthFace('consistent', [row('a', 'b')], [r1]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b')], [r2]), 'B').face;
    const d = diffFaces(a, b);
    return d.repos.faceChanged.length === 0 && d.repos.revChanged.length === 1;
  });

  add('**顺序无关**：清单行序打乱 ⇒ ⇒ 差异集合逐字相同', () => {
    const rows = [row('a', 'b'), row('c', 'd'), row('e', 'f')];
    const a = parseFace(synthFace('consistent', rows, [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', rows.slice().reverse(), [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.verdict === 'same' && d.edgeSet.onlyA.length === 0 && d.edgeSet.onlyB.length === 0;
  });

  add('同一条边**状态**不同（OK ↔ DRIFT）⇒ ⇒ 被点名，**且**判冲突', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b', 'ok')], [repoA]), 'A').face;
    const b = parseFace(synthFace('drift', [row('a', 'b', 'drift')], [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.statusDiffs.length === 1 && d.statusDiffs[0].key === 'a -> b' && d.verdict === 'conflict';
  });

  add('**地板取值**不同但状态相同 ⇒ ⇒ 被点名，**但**不冲突（不是红）', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b', 'ok', 'sibling', '1.94', '1.94')], [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b', 'ok', 'sibling', '1.94', '1.95')], [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.floorDiffs.length === 1 && d.verdict === 'same';
  });

  add('**清单指纹同源**：同一个面 ⇒ ⇒ 同一个数（与闸印的那个数同源）', () => {
    const p = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'A');
    return p.face.list === parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'A').face.list;
  });

  add('**对称**：A 多一条边 ⇒ ⇒ 反过来就是 B 多一条边（方向不串）', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b'), row('c', 'd')], [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'B').face;
    const ab = diffFaces(a, b);
    const ba = diffFaces(b, a);
    return ab.edgeSet.onlyA.length === 1 && ba.edgeSet.onlyB.length === 1
      && ab.edgeSet.onlyA[0] === ba.edgeSet.onlyB[0];
  });

  add('**两面验过的格子不一样** ⇒ ⇒ 被点名（不许当成「没问题」）', () => {
    const a = parseFace(synthFace('consistent', [row('a', 'b')], [repoA]), 'A').face;
    const b = parseFace(synthFace('consistent', [row('a', 'b'), row('c', 'd', 'unresolved')], [repoA]), 'B').face;
    const d = diffFaces(a, b);
    return d.coverageDiffers === true && d.undecidableB.length === 1;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try { ok = c.run() === true; } catch { ok = false; }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ ⇒ 这把尺子证明不了自己会红');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

/** 读一个面文件（JSON）⇒ ⇒ 读不出／形状不对 ⇒ ⇒ 判不了。 */
function readFaceFile(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, reason: label + '：读不到文件 ' + path + ' ⇒ ⇒ 判不了' };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: label + '：不是合法 JSON ⇒ ⇒ 形状认不出 ⇒ ⇒ 判不了' };
  }
  return parseFace(json, label);
}

/** 取一个命令行参数的值（--x 值 ／ --x=值 两种都认）。 */
function argValue(argv, name) {
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1] === undefined ? '' : argv[i + 1];
  const m = argv.find((a) => a.startsWith(name + '='));
  return m === undefined ? null : m.slice(name.length + 1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();

  const pathA = argValue(argv, '--face-a');
  const pathB = argValue(argv, '--face-b');
  const labelA = argValue(argv, '--label-a') || pathA || 'A';
  const labelB = argValue(argv, '--label-b') || pathB || 'B';

  if (!pathA || !pathB) {
    console.error('❌ 用法：node scripts/face-diff.mjs --face-a <A.json> --face-b <B.json>');
    process.exit(2);
  }

  const a = readFaceFile(pathA, labelA);
  const b = readFaceFile(pathB, labelB);
  for (const p of [a, b]) {
    if (!p.ok) {
      console.error('❌ ' + p.reason);
      process.exit(2);
    }
  }

  const diff = diffFaces(a.face, b.face);
  for (const line of renderFaceDiff(diff)) console.log(line);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      verdict: diff.verdict,
      reason: diff.reason,
      listA: a.face.list,
      listB: b.face.list,
      edgeSet: diff.edgeSet,
      statusDiffs: diff.statusDiffs,
      floorDiffs: diff.floorDiffs,
      repos: diff.repos,
      redA: diff.redA,
      redB: diff.redB,
      coverageDiffers: diff.coverageDiffers,
    }, null, 2));
  }
  if (diff.verdict === 'conflict') process.exit(1);
  if (diff.verdict === 'cannot-judge') process.exit(2);
  process.exit(0);
}

main();
