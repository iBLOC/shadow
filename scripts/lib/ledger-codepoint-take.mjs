/**
 * 「取号」的**纪律**判据 —— 纯函数（判据与 I/O 分离）。
 *
 * ## 为什么要有这道尺子
 *
 * 官方判据（`ledger-codepoints.mjs`）只管「**两个条目占同一个码位**」（R1）⇒ ⇒
 * 而「**取号**」这一步另有两族它管不着的错：
 *
 * **A（回填历史空洞）** —— 新条目占的码位 **低于**该**账本此刻**的最高已声明。
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
 * ## ⚠️ 否定窗口**两个方向都看**（2026-11-11 实测补）
 *
 * 兄弟会话（\`mvs_a2b64fca\`，台账 U+34D4 条 ⑭ 段 ❻）实测出一处盲区：
 * 原实现**只看关键词之前 6 个字符** ⇒ ⇒ 「**否定词在关键词之后**」的写法
 * （新措辞「**缓冲留一枚但不写具体号**」）会被认成**未否定的预留**。
 *
 * ⇒ ⇒ **实测复现**（本条自建探针 `.local/probe-neg-window.mjs`）：
 * 同句「码位 ＋ 关键词 ＋ **后置**否定词」⇒ ⇒ `reservedCodepoints()` 返回**一条预留**；
 * 否定词**在前** ⇒ ⇒ 返回 **[]** ⇒ ⇒ **同一族语料 ⇒ 两个读数** ⇒ ⇒ 尺子没跟上。
 *
 * ⚠️ **但「否定词在后」≠「这就是否定」** ⇒ ⇒ 规则必须照着**真语料**定，
 *   否则就是把**真预留**判成否定 ⇒ ⇒ **假绿**：
 *   · 真预留：「U+3480 是 U+3481 那条明写的**缓冲，同样不回收**」
 *     ⇒ ⇒ 否定词「不」在**逗号之后**、离关键词只有 3 个字
 *     ⇒ ⇒ 若允许逗号不断短语 ⇒ ⇒ **真预留被误判成否定** ⇒ ⇒ **假绿**；
 *   · 真预留：「**缓冲位**只提及、**不**声明」⇒ ⇒ 同理（「、」必须断）；
 *   · 真预留：「**U+34C0 让开**（虽**未**被声明，但被提及 8 次）⇒ ⇒ 「（」必须断。
 *
 * ⇒ ⇒ **⇒ ⇒ 规则＝前后两个方向都看，但**任何标点都断否定短语** ⇒ ⇒
 * ⇒ ⇒ **⇒ ⇒ 这不是拍的 ⇒ ⇒ 是被上面三句真语料逼出来的**（真语料里那 55 句
 * 「关键词 ＋ 否定词 ＋ 码位」的同现句逐句量过）。
 *
 * ⚠️ **窗口有界 ⇒ ⇒ 尺子仍能红**：「否定词离关键词 **> 6 字**」⇒ ⇒ 不算否定
 *   ⇒ ⇒ 那一枚仍算预留 ⇒ ⇒ B 族照样判红（自检里钉住了这一格 ⇒ ⇒ 反向验证）。
 *
 * ## ⚠️ A 族的阈值**逐账本**算（**不是**跨三本）
 *
 * 官方判据那句「父仓／移动端／桌面端**共用一条码位序列**」说的是
 * **查重**（R1 跨账本查撞号）⇒ ⇒ **不是**「A 族的阈值要跨账本取」。
 * ⇒ ⇒ 实测（2026-11-11）：用**全局**最高已声明当阈值 ⇒ ⇒ 历史里有
 * **615/890** 枚声明落在它下面 ⇒ ⇒ **全是噪声** —— 移动端取 U+331B 时
 * 父仓已到 U+34AF，但移动端**自己那一段**里 U+331B 就是下一个号
 * ⇒ ⇒ ⇒ ⇒ ⇒ **逐账本分段算**（每个 space 独立）⇒ ⇒ 噪声归零。
 * ⇒ ⇒ ⚠️ 这条是**实测推翻**了最初的设计假设 ⇒ ⇒ 注释必须跟着改
 * ⇒ ⇒ 否则注释就在说假话（⇒ ⇒ 而台账自己有那道「注解在说假话」的闸）。
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

/** 否定短语的**断裂符** —— 中间隔了它 ⇒ ⇒ 否定短语已断（**前后两个方向同一套**）。 */
const NEGATION_BREAKERS = /[，。；、（）「」『』《》]/;

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

/**
 * 关键词位置上有没有否定词 —— **前后两个方向都看**。
 *
 * ⚠️ **方向性**：否定词既可能在关键词**之前**（「不是让开」「不钉具体缓冲号」），
 *   也可能在**之后**（「缓冲留一枚但**不**写具体号」）⇒ ⇒ 只看一侧 ⇒ ⇒ 一半语料判错。
 * ⚠️ **窗口量法**：前向从关键词**起点**往回数 6 字；后向从关键词**末字**往后数 6 字
 *   ⇒ ⇒ 两个方向各自贴着自己那条边量 ⇒ ⇒ 对称。
 * ⚠️ **标点断短语**：两个方向都要求「否定词与关键词之间没有标点」
 *   ⇒ ⇒ 理由见文件头「否定窗口两个方向都看」那节（**真语料逼出来的**，不是拍的）。
 *
 * @param {string} text
 * @param {number} index 关键词**起点**
 * @param {number} len   关键词长度（默认 1）⇒ ⇒ 后向窗口从它**末字之后**起算
 */
export function isNegated(text, index, len = 1) {
  const back = text.slice(Math.max(0, index - NEGATION_WINDOW), index);
  for (const ch of NEGATION_CHARS) {
    const at = back.lastIndexOf(ch);
    if (at !== -1 && !NEGATION_BREAKERS.test(back.slice(at + 1))) return true;
  }
  const fwd = text.slice(index + len, index + len + NEGATION_WINDOW);
  for (const ch of NEGATION_CHARS) {
    const at = fwd.indexOf(ch);
    if (at !== -1 && !NEGATION_BREAKERS.test(fwd.slice(0, at))) return true;
  }
  return false;
}

/** 句里的全部关键词命中（含被否定的）。 */
export function keywordHits(sentence) {
  const hits = [];
  for (const kw of RESERVE_KEYWORDS) {
    let i = sentence.indexOf(kw);
    while (i !== -1) {
      hits.push({ kw, index: i, negated: isNegated(sentence, i, kw.length) });
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
            // ⚠️ 语义豁免层要用这两项 ⇒ ⇒ **不带**它们就没法判断「这一条自己写了理由」。
            sha: ev.sha || ev.id, entryBody: d.body,
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
            sha: ev.sha || ev.id, entryBody: d.body,
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

/* ------------------------------ 语义豁免层 ------------------------------ */

/**
 * 「A 族只认『低于水位就是回填』」⇒ ⇒ 而**台账自己**写明了两种**合法**的例外：
 *
 *   ❶ **有据的保留位，兑现预留** —— 台账原文（U+3472 条）：
 *      「本条取它（**有据的保留位**，兑现预留；**不是空洞回填**）」
 *      ＝ **那一枚先前被明写留给某条线** ⇒ ⇒ 兑现它**不是**回填；
 *   ❷ **自陈理由** —— 台账原文（移动端 U+32AD 条）：
 *      「**避开 U+3300–U+33FF**（NFKC 会变形 ⇒ ⇒ 闸明说不能拿 NFKC 判重）」
 *      ＝ **这一条自己写清了为什么落在水位之下**。
 *
 * ⚠️ 这两种例外**以前只由「冻结的存量基线」兜着** ⇒ ⇒ 例外再来一次 ⇒ ⇒ **假红**
 *   （实测：基线里 **7 处**真实例外（U+3470／U+3472／U+34BE／U+32AD／U+32AE／
 *   U+32AF／U+32D8）**全部**被 A 族判成回填 ⇒ ⇒ 只靠基线豁免）。
 *
 * ⚠️ **豁免要「写出来」才算数** ⇒ ⇒ 纪律词 ＋ **证据令牌**（自己码位之外的
 *   码位／号段／区间）**必须同在一条** ⇒ ⇒ 「顺手写个『缓冲』二字就洗白」
 *   这条路被堵住。
 *
 * ⚠️ **明写的空洞**（不填／空着／继续空／不复用）⇒ ⇒ 是**否决项**，不是豁免项
 *   ⇒ ⇒ 兑现它**不是**豁免 ⇒ ⇒ 是**更重**的一类。
 *
 * ⚠️ 这一层**只管 A 族** ⇒ ⇒ B 族（「撞上别人明写留过的让开位／缓冲」）**不豁免**
 *   ⇒ ⇒ 因为台账原文：「按惯例**再留一枚缓冲（U+3499）**」＝ 那一枚是**让给别人**的。
 */

/** 纪律词 —— 「这一条自己写了理由」的措辞（形状取自台账原文）。 */
export const JUSTIFY_WORDS = [
  '有据', '兑现', '预留', '保留位', '认领', '留给', '留作',
  '避开', '让开', '缓冲', '空位', '唯一', '只有', 'NFKC', '段内', '范围',
];

/** 明写的空洞 —— 「这一位空着、别填」（**否决项**）。 */
export const NEVER_FILL_WORDS = [
  '不填', '空着', '继续空', '不复用', '保持空', '不要占', '不占', '不回收', '不许回填',
];

/**
 * 保留位方向的措辞 —— 「这一位是**留给某条线**的」⇒ ⇒ 与「空洞」**互斥**。
 *
 * ⚠️ 作用范围＝**同一条枚举项**（实测真句：「⚠️ **不填历史空洞**（U+3476／U+3479／
 *   U+347B 继续空 **＋** U+3472 留给真机腿那条线）」⇒ ⇒ 「不填」管**前半串**，
 *   U+3472 在**后半串**、是**保留位** ⇒ ⇒ 按整句判 ⇒ ⇒ **误判成空洞**）。
 */
export const RESERVED_TARGET_WORDS = [
  '留给', '留作', '口头留给', '预留', '兑现预留', '让开', '缓冲',
];

/**
 * 台账的子句分隔符 —— 方向判定必须在这一层做。
 *
 * ⚠️ **分号（；）也要切** —— 台账原文：「⚠️ **不填历史空洞**（U+3463／U+3465／
 *   U+3467／U+3469／**U+346E** 继续空；**U+3472 已口头留给真机腿那条线**）」
 *   ⇒ ⇒ 「不填」管的是**分号前**那一串，U+3472 在**分号之后**、是**保留位**
 *   ⇒ ⇒ 不切分号 ⇒ ⇒ 「不填」会**跨到**U+3472 ⇒ ⇒ ⇒ **误判成空洞**（实测真红）。
 *   ⇒ ⇒ 而**不切「／」** ⇒ ⇒ 那一串枚举要**留在一起**（「继续空」在串尾 ⇒ ⇒ 管住整串）。
 */
const CLAUSE_SPLIT = /[\u21d2\u3002\uff1b]/;

/** 把文本切成**子句**（逐行，再按「⇒」「。」切）。 */
export function clauses(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    for (const part of line.split(CLAUSE_SPLIT)) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** 码位写法（十六进制）：`U+XXXX` / `0xXXXX`。 */
const HEX_TOKEN = /(?:U\+|0x)([0-9A-Fa-f]{4,6})/g;
/** 号段写法：`U+32xx`。 */
const SEGMENT_TOKEN = /(?:U\+|0x)([0-9A-Fa-f]{2})xx\b/g;
/** 区间写法：`U+3300\u2013U+33FF`。 */
const RANGE_TOKEN = /(?:U\+|0x)[0-9A-Fa-f]{4,6}\s*[\u2013\u2014\u2212~-]\s*(?:U\+|0x)?[0-9A-Fa-f]{4,6}/;

/**
 * 某一位在**先前状态**里是不是被**明写为空洞** ⇒ ⇒ 那是**否决项**。
 *
 * ⚠️ 粒度＝**子句** ⇒ ⇒ 台账一行里常同时写着好几个码位 ⇒ ⇒ 按行判会串
 *   （实测：台账原文「⚠️ 不填历史空洞（U+3463／U+3465／…）继续空」与本条自己的
 *   码位**同在一行** ⇒ ⇒ 按行判 ⇒ ⇒ 会把自己的码位也判成「明写的空洞」）。
 *
 * @param {string} prevText 先前状态全文
 * @param {string} hex 四位十六进制（大小写不敏感）
 */
export function isDeclaredHole(prevText, hex) {
  const re = new RegExp('(?:U\\+|0x)' + hex + '(?![0-9A-Fa-f])', 'i');
  for (const cl of clauses(prevText)) {
    // ⚠️ 先按「＋」**分组** ⇒ ⇒ 再在组内按「／」**拆项**
    //   ⇒ ⇒ 「不填历史空洞（A／B 继续空 ＋ C 留给某条线）」⇒ ⇒ 「不填」只管前半组。
    for (const group of cl.split('＋')) {
      if (!re.test(group)) continue;
      const items = group.split('／');
      const cpItems = items.filter((it) => re.test(it));
      const reserved = cpItems.some((it) => RESERVED_TARGET_WORDS.some((w) => it.includes(w)));
      if (reserved) continue;              // 那一位在这一组里是**保留位** ⇒ ⇒ 不是空洞
      if (NEVER_FILL_WORDS.some((w) => group.includes(w))) return true;
    }
  }
  return false;
}

/** 同一行里有没有**证据令牌**（自己码位之外的码位／号段／区间）。 */
export function hasEvidenceToken(line, ownHex) {
  HEX_TOKEN.lastIndex = 0;
  let m;
  while ((m = HEX_TOKEN.exec(line)) !== null) {
    if (m[1].toUpperCase() !== String(ownHex).toUpperCase()) return true;
  }
  SEGMENT_TOKEN.lastIndex = 0;
  if (SEGMENT_TOKEN.test(line)) return true;
  SEGMENT_TOKEN.lastIndex = 0;
  if (RANGE_TOKEN.test(line)) return true;
  RANGE_TOKEN.lastIndex = 0;
  return false;
}

/**
 * 这一条**自己写了理由**吗 —— 判据：**自己的码位** ＋ **纪律词** ＋ **证据令牌**
 * 同在一条里。
 *
 * ⚠️ 粒度＝**行**（台账把「本条占 U+XXXX」与「为什么落在水位之下」写在**同一行**
 *   ⇒ ⇒ 实测 7 处真实例外全部如此）。
 */
export function isJustifiedEntry(entryText, hex) {
  const re = new RegExp('(?:U\\+|0x)' + hex + '(?![0-9A-Fa-f])', 'i');
  for (const line of String(entryText || '').split(/\r?\n/)) {
    if (!re.test(line)) continue;
    if (!JUSTIFY_WORDS.some((w) => line.includes(w))) continue;
    if (!hasEvidenceToken(line, hex)) continue;
    return true;
  }
  return false;
}

/**
 * **语义豁免**（A 族专用）—— 返回 {exempt, kind, reason}。
 *
 * @param {{prevText?: string, entryText?: string, hex: string}} o
 *        `prevText` ＝ 那一笔**之前**的账本全文（方向判定的依据）
 *        `entryText` ＝ 那一笔里**新条目自己的文本**（自陈理由的依据）
 */
export function semanticExemption(o) {
  const hex = String(o.hex || '').toUpperCase();
  if (isDeclaredHole(o.prevText || '', hex)) {
    return {
      exempt: false,
      kind: 'declared-hole',
      reason: '那一位在**先前状态**里被**明写为空洞**（不填／空着／继续空／不复用）⇒ ⇒ 兑现它**不是**豁免 ⇒ ⇒ 是**更重**的一类',
    };
  }
  if (isJustifiedEntry(o.entryText || '', hex)) {
    return {
      exempt: true,
      kind: 'self-declared',
      reason: '这一条**自己写了理由**（纪律词 ＋ 证据令牌同在一条）⇒ ⇒ 属**有据的例外**（台账原文：「避开 U+3300\u2013U+33FF」「有据的保留位，兑现预留」）',
    };
  }
  return {
    exempt: false,
    kind: 'none',
    reason: '这一条**没有**自陈理由（纪律词 ＋ 证据令牌）⇒ ⇒ 不是有据的例外',
  };
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
      '否定词在关键词**之后**（「缓冲留一枚但不写具体号」）⇒ ⇒ 零违例（后向窗口）',
      [ev('p', '33C1', ['❷ **U+33C4 缓冲留一枚但不写具体号** ⇒ ⇒ 前例。']), ev('p', '33C4')],
      [],
    ],
    [
      '否定词在关键词**之前**（同句带码位）⇒ ⇒ 零违例（前向窗口 · 与上一格**孪生**）',
      [ev('p', '33C1', ['❷ **U+33C4 不是缓冲** ⇒ ⇒ 前例。']), ev('p', '33C4')],
      [],
    ],
    [
      '否定词**紧跟关键词**（「缓冲不是占位」）⇒ ⇒ 零违例',
      [ev('p', '33C1', ['❷ **U+33C4 缓冲不是占位** ⇒ ⇒ 前例。']), ev('p', '33C4')],
      [],
    ],
    [
      '否定词**超出窗口**（离关键词 > 6 字）⇒ ⇒ 仍算预留 ⇒ ⇒ 恰 1 红（B）· 尺子仍能红',
      [ev('p', '33C1', ['❷ **U+33C4 缓冲留一枚备用但是不写具体号** ⇒ ⇒ 前例。']), ev('p', '33C4')],
      ['B-hit-reserved'],
    ],
    [
      '否定词隔**逗号**（「那条明写的缓冲，同样不回收」）⇒ ⇒ 仍算预留 ⇒ ⇒ 恰 1 红（B）· 真语料逼出来的',
      [ev('p', '33C1', ['❷ **U+33C4 是上一条明写的缓冲，同样不回收** ⇒ ⇒ 前例。']), ev('p', '33C4')],
      ['B-hit-reserved'],
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
  // ── 语义豁免层的用例（纯函数，不依赖 git）─────────────────────────
  // ⚠️ 这一层是「A 族只认低于水位」的对冲 ⇒ ⇒ 必须**逐条**钉住：
  //   ❶ 盲回填（无理由）⇒ ⇒ **不豁免**（尺子咬得住）；
  //   ❷ 自陈理由 ＋ 证据令牌 ⇒ ⇒ **豁免**（合法例外不再假红）；
  //   ❸ 只写纪律词、没有证据令牌 ⇒ ⇒ **不豁免**（「顺手写个缓冲就洗白」被堵住）；
  //   ❹ 明写的空洞 ＋ 自陈理由 ⇒ ⇒ **不豁免**（更重的一类）。
  const PREV = ['# \u524d\u4e00\u72b6\u6001'].join('');
  const OWN = '**Updated**: 2026-01-02 (\u3403 **\u4f8b\u5b50** \u2014\u2014 \u672c\u6761\u5360 U+33C1\u3002';
  const JUSTIFIED = OWN + ' \u2014\u2014 \u907f\u5f00 U+3300\u2013U+33FF\uff08NFKC \u4f1a\u53d8\u5f62\uff09\u3002';
  const semCases = [
    ['\u76f2\u56de\u586b\uff08\u65e0\u7406\u7531\uff09\u21d2 \u21d2 **\u4e0d\u8c41\u514d**', PREV, OWN, false],
    ['\u81ea\u9648\u7406\u7531 \uFF0B \u8bc1\u636e\u4ee4\u724c \u21d2 \u21d2 **\u8c41\u514d**', PREV, JUSTIFIED, true],
    ['\u53ea\u5199\u7eaa\u5f8b\u8bcd\u3001\u6ca1\u6709\u8bc1\u636e\u4ee4\u724c \u21d2 \u21d2 **\u4e0d\u8c41\u514d**', PREV, OWN + ' \u2014\u2014 \u987a\u624b\u7559\u4e2a\u7f13\u51b2\u3002', false],
    ['\u660e\u5199\u7684\u7a7a\u6d1e \uFF0B \u81ea\u9648\u7406\u7531 \u21d2 \u21d2 **\u4e0d\u8c41\u514d**\uff08\u66f4\u91cd\u7684\u4e00\u7c7b\uff09', PREV + '\nU+33C1 \u7a7a\u7740\u4e0d\u586b\u3002', JUSTIFIED, false],
    ['\u540c\u4e00\u53e5\u91cc\u300c\u4e0d\u586b\u5386\u53f2\u7a7a\u6d1e\u300d\u4e0e\u300c\u7559\u7ed9\u300d\u5e76\u5b58 \u21d2 \u21d2 \u90a3\u4e00\u4f4d\u662f**\u4fdd\u7559\u4f4d**\u21d2 \u21d2 **\u4e0d\u5426\u51b3**\uff08\u5b9e\u6d4b\u771f\u53e5\uff09', PREV + '\n\u26a0 **\u4e0d\u586b\u5386\u53f2\u7a7a\u6d1e**\uff08U+3306\uff0fU+3309 \u7ee7\u7eed\u7a7a \uff0b U+33C1 \u7559\u7ed9\u771f\u673a\u817f\u90a3\u6761\u7ebf\uff09', JUSTIFIED, true],
    ['\u540c\u4e00\u53e5\u91cc\u300c\u4e0d\u586b\u5386\u53f2\u7a7a\u6d1e\u300d\u4e0e\u300c\u7559\u7ed9\u300d\u5e76\u5b58 \u21d2 \u21d2 **\u4e32\u91cc**\u90a3\u51e0\u4f4d\u4ecd\u662f\u7a7a\u6d1e \u21d2 \u21d2 **\u5426\u51b3**\uff08\u5b9e\u6d4b\u771f\u53e5\uff09', PREV + '\n\u26a0 **\u4e0d\u586b\u5386\u53f2\u7a7a\u6d1e**\uff08U+33C1\uff0fU+3309 \u7ee7\u7eed\u7a7a \uff0b U+330A \u7559\u7ed9\u771f\u673a\u817f\u90a3\u6761\u7ebf\uff09', JUSTIFIED, false],
  ];
  let semBad = 0;
  for (const [name, prev, entry, expectExempt] of semCases) {
    const ex = semanticExemption({ prevText: prev, entryText: entry, hex: '33C1' });
    const ok = ex.exempt === expectExempt;
    if (!ok) semBad++;
    console.log((ok ? '  \u2713 ' : '  \u2717 ') + name + ' \u21d2 \u21d2 \u8c41\u514d=' + ex.exempt + '\uff08\u671f\u671b ' + expectExempt + '\uff09\u3002kind=' + ex.kind);
  }
  if (semBad) { console.error('\u8bed\u4e49\u8c41\u514d\u5c42\u81ea\u68c0\u5931\u8d25\uff1a' + semBad + ' \u6761\u4e0d\u7b26'); return 2; }

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
  console.log('自检全过（' + (cases.length + semCases.length) + '/' + (cases.length + semCases.length) + '）');
  return 0;
}

export { run as selfTest };