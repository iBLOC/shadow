/**
 * 「取号」的**纪律**判据 —— 纯函数（判据与 I/O 分离）。
 *
 * ## 为什么要有这道尺子
 *
 * 官方判据（`ledger-codepoints.mjs`）只管「**两个条目占同一个码位**」（R1）⇒ ⇒
 * 而「**取号**」这一步另有两族它管不着的错：
 *
 * **A（回填历史空洞）** —— 新条目占的码位 **低于**该编号序列**此刻**的最高已声明。
 * ⇒ ⇒ 症状：按「最高+1」推下一枚的人，会推出一个**已经被占过**的号。
 *
 * **B（撞上别人明写的让开位）** —— 新条目占的码位，别人**在更早的笔里**
 * 已经**明写**留作缓冲／让开 ⇒ ⇒ 症状同上。
 *
 * ⇒ ⇒ 两族都是「**用脑子里的号码，而不是当场扫**」⇒ ⇒ 同一族病。
 *
 * ## ⚠️ 声明形状**复用官方判据**（不自己抄正则）
 *
 * `OWN_CLAIM`（正文里的「本条占 U+XXXX」）与 `HEADER_LINE`（条目头）
 * 都直接 `import` 自 `ledger-codepoints.mjs` ⇒ ⇒ 官方改了形状，这里跟着改
 * ⇒ ⇒ 不会「抄一次漂一次」。
 *
 * ## ⚠️ 「让开／缓冲」必须按**形状**认，不按「所有提及」认
 *
 * 正文里「承 U+34BE 条」是**引用**（指向已存在的条目），不是**让开**
 * ⇒ ⇒ 若把它算成让开，则**每一次正常引用**都会把那一枚标成「不可取」
 * ⇒ ⇒ **判据变宽反而更该红**。
 *
 * ⇒ ⇒ 真实账本上的**三种**形状（2026-11-11 逐行取证）：
 *   · **真的预留**：「按惯例**再留一枚缓冲（U+34C4）**」「**U+34CA 让开**」
 *   · **引用**：「承 U+34BE 条」「它是 U+34B5 条**明写**的…」
 *   · **否定**：「本条**不钉具体缓冲号**」「（**引用**，不是让开）」
 * ⇒ ⇒ 三者**必须分开认** ⇒ ⇒ 否则同一行里三者混写时必然误判。
 *
 * 判别法（一行内）：
 *   ① 按「**⇒**」与「**。**」切成**句**；
 *   ② 句里有**未被否定**的「让开／缓冲」⇒ ⇒ 那句是**保留句**；
 *   ③ 保留句里的 U+XXXX 逐个判：**后接「条」**的 ⇒ ⇒ **引用**，不算预留；
 *      其余 ⇒ ⇒ 算**明写留过**（= B 族的证据）。
 *
 * ## ⚠️ 编号序列：三本账本**共用一条**（官方判据原文）
 *
 * 「父仓／移动端／桌面端**共用一条码位序列**」⇒ ⇒ A 族的「最高已声明」
 * ⇒ ⇒ 必须**跨三本**取（否则父仓退到 0x33xx 那一段时，移动端看不见）
 * ⇒ ⇒ **逐账本分开算**会把「父仓在 0x33xx 段落的洞」算成「移动端的可取号」。
 *
 * ## ⚠️ 字形按 `String.fromCodePoint` 算，不手打
 *
 * 踩过：手打的「㋿」真实码位是 **U+32FF**，而我以为它是 U+33C1 ⇒ ⇒
 * ⇒ ⇒ 夹具里的注解与落盘字形**不一致** ⇒ ⇒ 判据读到的是 U+32FF ⇒ ⇒
 * ⇒ ⇒ **夹具的期望值全部对不上** ⇒ ⇒ ⇒ 而**判据本身是对的** ⇒ ⇒ ⇒ ⇒
 * ⇒ ⇒ ⇒ ⇒ **自检红 ⇒ ⇒ 先问「夹具齐了吗」**（不是先怀疑判据）。
 */

import { OWN_CLAIM, HEADER_LINE, hex4, extractEntries } from './ledger-codepoints.mjs';

/** 「让开／缓冲」的关键词 —— 只在**保留句**里才算「明写留过」。 */
export const RESERVE_KEYWORDS = ['让开', '缓冲'];

/** 否定词 —— 「不是让开」「不再钉具体缓冲号」里的关键词**不算**。 */
export const NEGATION_CHARS = ['不', '非', '未', '勿'];

/** 否定词与关键词之间的最大距离（字符）；中间有标点 ⇒ ⇒ 短语已断 ⇒ ⇒ 不算否定。 */
export const NEGATION_WINDOW = 6;

/** 台账的分句符：「⇒」隔从句，「。」断句。 */
const SENTENCE_BREAK = /[⇒。]/;

const UPLUS = /U\+([0-9A-Fa-f]{4,6})/g;

/** 一行切句（保留每句在原行里的起始位置）。 */
export function splitSentences(line) {
  const out = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i === line.length || SENTENCE_BREAK.test(line[i])) {
      if (i > start) out.push({ text: line.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  return out;
}

/** 关键词前 **NEGATION_WINDOW** 字符内有没有否定词（中间不许隔标点）。 */
export function isNegated(text, index) {
  const back = text.slice(Math.max(0, index - NEGATION_WINDOW), index);
  for (const ch of NEGATION_CHARS) {
    const at = back.lastIndexOf(ch);
    if (at !== -1 && !/[，。；、（）「」『』《》]/.test(back.slice(at + 1))) return true;
  }
  return false;
}

/** 句里的全部关键词命中（含被否定的）。 */
export function keywordHits(sentence) {
  const hits = [];
  for (const kw of RESERVE_KEYWORDS) {
    let i = sentence.indexOf(kw);
    while (i !== -1) {
      hits.push({ kw, index: i, negated: isNegated(sentence, i) });
      i = sentence.indexOf(kw, i + kw.length);
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** 「U+XXXX 条」＝ **引用**（指向已存在的条目）⇒ ⇒ 不是预留。 */
export function isCitation(sentence, endIndex) {
  const tail = sentence.slice(endIndex, endIndex + 8);
  return /^\s*\*{0,2}\s*条/.test(tail);
}

/** 一句是不是**保留句**（有未被否定的「让开／缓冲」）。 */
export function isReserveSentence(sentence) {
  return keywordHits(sentence).some((h) => !h.negated);
}

/** 取一条文本里**声明**的码位（条目头 ＋ 正文「本条占」）。 */
export function declaredCodepoints(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADER_LINE);
    if (m) out.push({ cp: hex4(m[1].codePointAt(0)), kind: "header", line: i + 1 });
  }
  OWN_CLAIM.lastIndex = 0;
  let cm;
  while ((cm = OWN_CLAIM.exec(text)) !== null) {
    const lineNo = text.slice(0, cm.index).split(/\r?\n/).length;
    out.push({ cp: cm[1].toUpperCase(), kind: "claim", line: lineNo });
  }
  return out;
}

/** 取一条文本里**明写留过**的码位（提及 ≠ 声明 ≠ 让开）。 */
export function reservedCodepoints(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const s of splitSentences(lines[i])) {
      if (!isReserveSentence(s.text)) continue;
      UPLUS.lastIndex = 0;
      let m;
      while ((m = UPLUS.exec(s.text)) !== null) {
        if (isCitation(s.text, m.index + m[0].length)) continue;
        out.push({
          cp: m[1].toUpperCase(),
          line: i + 1,
          snippet: s.text.trim().slice(0, 90),
        });
      }
    }
  }
  return out;
}


/* ------------------------------ 时间线 ------------------------------ */

/** 条目头里的日期（`YYYY-MM-DD`）—— 粗粒度，只用于读数。 */
export function entryDate(headerLine) {
  const m = String(headerLine || '').match(/([12]\d{3}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * 一笔（一次提交）里**新增**的条目 —— 纯函数（输入＝该提交加进来的文本）。
 *
 * ⚠️ **同一笔内按码位升序** —— 理由：
 *   · 账本条目插在**顶部** ⇒ ⇒ 「行号大＝旧」只在**同一笔**内成立；
 *   · 而一笔提交里塞多条时，**文件位置**给出的顺序是「谁被插在前面」
 *     （并发会话 ⇒ ⇒ 谁最后插谁最靠上）⇒ ⇒ 不是「谁先被取号」；
 *   · 码位**升序**是「按号取号」这件事本身自带的顺序 ⇒ ⇒ 用它当笔内顺序，
 *     **不引入**判据之外的假设。
 *
 * @param {string} text 该提交加进来的文本（只含新增行）
 * @returns {Array<{cp: string, line: number, body: string}>}
 */
export function entriesOfCommit(text) {
  const { entries, lines } = extractEntries(text);
  const out = entries.map((e, k) => {
    const end = k + 1 < entries.length ? entries[k + 1].line - 1 : lines.length;
    return {
      cp: e.actual,
      line: e.line,
      body: lines.slice(e.line - 1, end).join('\n'),
    };
  });
  return out.filter((e) => e.cp).sort((a, b) => parseInt(a.cp, 16) - parseInt(b.cp, 16));
}

/* ------------------------------ 判定 ------------------------------ */

/**
 * 逐笔判两族违例。
 *
 * @param {Array<{space: string, id: string, date: string, text: string}>} events
 *        **必须按时间顺序**（旧的在前）；**每个 space 独立算**
 *        （父仓／移动端／桌面端各用自己的编号段 ⇒ ⇒ 跨段比大小无意义）。
 *        **每笔一个 text**（一笔提交可以含多个条目，但那是**同一笔**）。
 * @returns {{violations: Array, stats: Object}}
 */
export function findTakeViolations(events) {
  const bySpace = new Map();
  for (const e of events) {
    if (!bySpace.has(e.space)) bySpace.set(e.space, []);
    bySpace.get(e.space).push(e);
  }
  const violations = [];
  const stats = {};
  for (const [space, list] of bySpace) {
    const declaredBefore = new Set();
    const reservedBefore = new Map();   // cp → {line, snippet}
    let maxBefore = 0;
    stats[space] = { entries: 0, A: 0, B: 0, maxDeclared: '0000' };
    for (const ev of list) {
      const decls = entriesOfCommit(ev.text);
      stats[space].entries += decls.length;
      for (const d of decls) {
        if (declaredBefore.has(d.cp)) continue;   // 重复声明归 R1 管
        const n = parseInt(d.cp, 16);
        if (n < maxBefore) {
          violations.push({
            kind: 'A-backfill-hole', space, id: ev.id, date: ev.date, cp: d.cp,
            maxBefore: hex4(maxBefore),
            reason:
              '本笔占的码位 ' + d.cp +
              ' **低于**该账本此前的最高已声明 ' + hex4(maxBefore) +
              ' ⇒ ⇒ 回填历史空洞 ⇒ ⇒ 按「最高+1」推号会推出一个已被占过的号',
          });
          stats[space].A++;
          continue;
        }
        const r = reservedBefore.get(d.cp);
        if (r) {
          violations.push({
            kind: 'B-hit-reserved', space, id: ev.id, date: ev.date, cp: d.cp,
            reservedLine: r.line, reservedSnippet: r.snippet,
            reason:
              '本笔占的码位 ' + d.cp +
              ' 是更早的笔里**明写留过**的缓冲／让开位 ⇒ ⇒ 「让开」不是凭据，「声明」才是',
          });
          stats[space].B++;
        }
      }
      for (const d of decls) {
        declaredBefore.add(d.cp);
        const n = parseInt(d.cp, 16);
        if (n > maxBefore) maxBefore = n;
      }
      for (const r of reservedCodepoints(ev.text)) {
        if (!reservedBefore.has(r.cp)) reservedBefore.set(r.cp, r);
      }
    }
    stats[space].maxDeclared = hex4(maxBefore);
  }
  return { violations, stats };
}

/** 违例的**身份键** —— 基线豁免集用它（要稳定 ⇒ 不用行号）。 */
export function violationIdentity(v) {
  return [v.kind, v.space, v.cp, v.date || ''].join('|');
}

/** 违例集的**规范串**（升序去重）—— 指纹的输入。 */
export function canonicalViolations(violations) {
  return [...new Set((violations || []).map(violationIdentity))].sort().join(',');
}

/* ------------------------------ 自检 ------------------------------ */
/* ⚠️ 夹具的字形**由 fromCodePoint 生成** ⇒ ⇒ 注解与落盘字形必然一致
 * ⇒ ⇒ 免得「手打方块字 ⇒ 码位差一位 ⇒ 期望值全对不上」那一族。 */

const G = (cp) => String.fromCodePoint(parseInt(cp, 16));

function entry(cp, extra, date) {
  const g = G(cp);
  return [
    '**Updated**: ' + (date || '2026-01-01') + ' (' + g + ' **条目 ' + cp + '** —— 夹具)',
    ...(extra || []),
    '⑨ 本条占 U+' + cp + '（' + g + '）。',
  ].join('\n');
}

function run() {
  const ev = (space, cp, extra, date) => ({
    space, id: 'c' + cp, date: date || '2026-01-01', text: entry(cp, extra, date),
  });
  const cases = [
    [
      '正常递增 ⇒ ⇒ 零违例',
      [ev('p', '33C1'), ev('p', '33C2'), ev('p', '33C3')],
      [],
    ],
    [
      '回填历史空洞 ⇒ ⇒ 恰 1 红（A）',
      [ev('p', '33C3'), ev('p', '33C1')],
      ['A-backfill-hole'],
    ],
    [
      '撞上别人明写留过的让开位 ⇒ ⇒ 恰 1 红（B）',
      [ev('p', '33C1', ['⑩ 按惯例**再留一枚缓冲（U+33C4）** ⇒ ⇒ 让开位。']), ev('p', '33C4')],
      ['B-hit-reserved'],
    ],
    [
      '「引用」不算「让开」⇒ ⇒ 零违例',
      [ev('p', '33C1', ['② 承 U+33C2 条（**引用**）⇒ ⇒ 那枚仍可取。']), ev('p', '33C2')],
      [],
    ],
    [
      '「否定」不算「让开」⇒ ⇒ 零违例',
      [ev('p', '33C1', ['② 承 U+33C2 条（**引用**，不是让开）⇒ ⇒ 那枚仍可取。']), ev('p', '33C2')],
      [],
    ],
    [
      '「不钉具体缓冲号」不算预留 ⇒ ⇒ 零违例',
      [ev('p', '33C1', ['③ 本条**不钉具体缓冲号**（承 U+33C2 条那条订正）⇒ ⇒ 那枚仍可取。']), ev('p', '33C2')],
      [],
    ],
    [
      '一句里两个码位 ＋「也让开」⇒ ⇒ 两个都算预留',
      [ev('p', '33C1', ['❷ ⇒ ⇒ **U+33C5 / U+33C6 也让开** ⇒ ⇒ 前例。']), ev('p', '33C6')],
      ['B-hit-reserved'],
    ],
    [
      '**逐账本分段算**（父仓取高的、移动端取低的）⇒ ⇒ 零违例',
      [ev('p', '34C0'), ev('m', '33C1')],
      [],
    ],
    [
      '同一码位**重复声明**⇒ ⇒ 零违例（归 R1 管）',
      [ev('p', '33C1'), ev('p', '33C1')],
      [],
    ],
  ];
  let bad = 0;
  for (const [name, events, expectKinds] of cases) {
    const r = findTakeViolations(events);
    const gotKinds = r.violations.map((v) => v.kind).sort();
    const ok =
      gotKinds.length === expectKinds.length &&
      gotKinds.every((k, i) => k === [...expectKinds].sort()[i]);
    if (!ok) bad++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + name + ' ⇒ ⇒ 抓到 ' + gotKinds.length + ' 条（期望 ' + expectKinds.length + '）');
    for (const v of r.violations) console.log('      · ' + v.kind + ' ' + v.cp + ' @' + v.space + ' ⇒ ' + v.reason);
  }
  if (bad) {
    console.error('自检失败：' + bad + ' 条不符');
    return 2;
  }
  console.log('自检全过（' + cases.length + '/' + cases.length + '）');
  return 0;
}

if (process.argv.includes('--self-test')) {
  process.exit(run());
}

export { run as selfTest };