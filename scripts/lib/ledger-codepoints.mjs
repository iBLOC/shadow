/**
 * 「账本圈码」的自洽性 —— **纯函数**判据（判据与 I/O 分离，脚本层只管跑）。
 *
 * ## 判据四条
 *
 * **R1（不撞号）**：每个条目标题里那个**方块字**的**原始码位**必须两两不同。
 * ⇒ ⇒ 这一条挡的是「两个条目占同一个码位」⇒ ⇒ 那正是 2026-11-05 那次
 *    撞号事故（两条都写 U+33A0 ⇒ 引用变歧义 ⇒ 连累两条闸红）。
 *
 * **R2（注解自洽）**：一个条目若在正文里声明了「本条占 **U+XXXX**」（**真账本**
 * 的写法是 `本条占 U+XXXX（㐋）`，**不加粗**），那么这个 U+XXXX **必须等于**它
 * 自己标题里那个字的**原始码位**。
 * ⇒ ⇒ 2026-11-05 实测：五条条目的注解写的是 U+340x（CJK 扩展 A 的汉字），
 *    而落盘的字符是 U+334x（CJK 兼容表意文字）⇒ ⇒ 差 0xC0 ⇒ ⇒ 注解在说假话。
 * ⚠️ **2026-11-08 实测：这条规则曾经一直是暗的** —— 正则要求数字**带内层加粗**，
 *    而真账本**不加粗** ⇒ ⇒ 形状对不上 ⇒ ⇒ 真账本上 R2 从没红过 ⇒ ⇒ 连本人
 *    2026-11-08 那次「注解写 U+340B、字形落成 U+334B」都漏了过去 ⇒ ⇒ 见 R5。
 *
 * **R3（缝合残迹）**：任何一行只要**不是**以「**Updated**」开头、却嵌着
 * 「**Updated**: 日期」的标题形状 ⇒ ⇒ 行首锚被吞（插入工具的换行符变成了
 * 字面文本，把上一条与此条粘成一行）⇒ ⇒ 前一条与这一条**并体**。
 * ⇒ ⇒ 2026-11-06 ㌳ 插入事故实证：node -e 的 \r\n 转义经 pwsh 层加倍，
 *    缝合处出现 8 个可见字符，㎲ 条整个并进 ㌳ 条体 ⇒ ⇒ 当时闸**假绿**，
 *    唯一报警是条目计数 102≠应 103。R3 把那次形状变成**会红的读数**。
 *
 * **R6（悬空引用）**：正文里「承 ㋛ 条」这种**交叉引用**指向的码位，
 *    必须**有条目占着** ⇒ ⇒ 否则那处引用**悬空**（读者点不动、机器判不出真假）。
 *    ⚠️ 2026-11-09 实测入库：真账本里**当场逮到 15 处**幻影引用（其中 10 处是
 *    **差 0x80 的错码位**：U+3331 写成 U+33B1、U+3332 写成 U+33B2、U+3333 写成
 *    U+33B3 —— 「3」与「B」混淆）⇒ ⇒ 那 6 个目标码位在**全部 410 个历史提交**里
 *    **从未当过条目标记** ⇒ ⇒ 它们不是「死条目」，是**从未存在过的幻影**。
 *    ⇒ ⇒ 判据形状必须是「**方块字 + 条**」（只凭方块字会把「❶ ② ③」这类
 *    **列表序号**当成引用 ⇒ ⇒ 那是最大的假阳性源）。
 *
 * **R4（异体声明）**：一个条目体里 OWN_CLAIM（「本条占 **U+十六进制**」）
 * 命中的码位若**不等于**它自己标题字的码位 ⇒ ⇒ 体里躺着**别条**的声明
 * ⇒ ⇒ 又是「并体」的签名（R3 挡得住带日期的锚残迹；R4 挡的是锚没了
 * 日期形态的残余）。
 * ⇒ ⇒ 为什么不会误报：真账本上的规则**引文**要么写占位符「U+XXXX」
 *    （非十六进制 ⇒ OWN_CLAIM 不命中），要么「本条占」后面不跟 **U+
 *    ⇒ 同样不命中（㎝ 条实测：3 处「本条占」只有自己那条真声明命中）。
 *
 * ⚠️ **为什么不能用 NFKC 判重**：`㍀`（U+3340）的 NFKC 是**磅**（片假名）
 * ⇒ ⇒ 拿 NFKC 去重会把几个**不同**的条目全判成重复 ⇒ ⇒ **只认原始码位**。
 *
 * ⚠️ **为什么 R2/R4 只看「本条占」**：正文里大量出现**别条的引用**
 * （「承 U+33A0 那笔…」）与**反例**（「U+FFFD 是损坏字符」）
 * ⇒ ⇒ 若把正文里**所有** `U+XXXX` 都当声明 ⇒ ⇒ 必然误报。
 */

import { createHash } from 'node:crypto';

export const HEADER_PREFIX = '**Updated**';
/**
 * 「本条占 **U+XXXX**」的**声明**形状 —— ⚠️ **必须与真账本同形**。
 *
 * ⚠️⚠️ **2026-11-08 实测踩出来的假绿**：旧正则要求数字**带内层加粗**
 * （`本条占 **U+32FF**`）⇒ ⇒ 而**真账本**写的是 `本条占 U+340B（㐋）`
 * （**不加粗**，且带一个括号里的方块字）⇒ ⇒ 真账本上 **R2 从来没红过**
 * ⇒ ⇒ 本人当场把注解写成 `U+340B`、而落盘的字形是 **U+334B** 的那个字
 * ⇒ ⇒ 闸报「零违规」⇒ ⇒ **尺子钝了没人知道**。
 *
 * ⇒ ⇒ 现在两种形状都认（`**` 可选）⇒ ⇒ 并且**顺带把括号里那个字也抓出来**
 * ⇒ ⇒ R5 能判「注解里的括号字形与注解写的数字是不是同一个码位」。
 */
export const OWN_CLAIM =
  /本条占\s*\*{0,2}U\+([0-9A-Fa-f]{4,6})\*{0,2}(?:\s*[（(]([^\s（()）])[）)])?/g;

// ⚠⚠️ **两种头形状**（2026-11-08 实测踩出来的假绿）——
//   * 父仓：`\*\*Updated\*\*: 2026-11-08 (㐃 **…`（冒号在加粗**外**）
//   * 移动端／桌面端：`\*\*Updated:\*\* 2026-11-08 (㐃 **…`（冒号在加粗**内**）
// ⇒ ⇒ 旧判据用 `startsWith('**Updated**')` ⇒ ⇒ **父仓那 104 条**（用的是
// ⇒ ⇒ 移动端那种形状）**一条都不被看见** ⇒ ⇒ 父仓 236 条只判了 132 条 ⇒ ⇒
// ⇒ 而那 104 条里**躺着 5 对真撞号** ⇒ ⇒ 闸报「零违规」⇒ ⇒ **假绿**。
//
// ⇒ ⇒ 现在**两种形状都认**（`(?::)?` 可选），并且要求**标记字后面跟着
// ⇒ ⇒ ` **`** —— 否则 `(某某旧模块 …`／`(移动端 agent 面切到 …` 这类
// ⇒ ⇒ **不是条目的行**会被误当成条目（它们的首字是普通汉字，不是方块字）。
export const HEADER_LINE =
  /^\*\*Updated(?::)?\*\*:?\s*[12]\d{3}-\d{2}-\d{2}\s+\(([^\s(]) \*\*/;

// 标题形状：前缀 + 日期（R3 只认带日期的完整形状，免得把正文里
// 对插入锚点的工具性引用误伤——那些引用不带冒号日期）。
// ⚠️ R3 用的是**带标记字**的形状（`X **`）—— 不是只到日期为止。
// ⇒ ⇒ 否则「(某某旧模块 …」这种**没圈码的行**会被误判成「缝合残迹」
// ⇒ ⇒ ⇒ 而它其实只是「一条没圈码的条目」⇒ ⇒ 归 R5，不归 R3。
const HEADER_SHAPE = /\*\*Updated(?::)?\*\*:?\s*[12]\d{3}-\d{2}-\d{2}\s+\([^\s(] \*\*/;

export function hex4(cp) {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

/** 切出每个条目：标题行、标题里那个字、它的原始码位、正文里的全部「本条占」声明。 */
export function extractEntries(text) {
  const lines = text.split(/\r?\n/);
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    // ⚠️ 两种头形状都认（见 HEADER_LINE 的注释）——旧判据只认父仓那一种。
    const m = lines[i].match(HEADER_LINE);
    if (!m) continue;
    heads.push({ line: i + 1, ch: m[1], cp: m[1].codePointAt(0) });
  }
  const entries = [];
  for (let k = 0; k < heads.length; k++) {
    const start = heads[k].line - 1;
    const end = k + 1 < heads.length ? heads[k + 1].line - 1 : lines.length;
    const bodyLines = lines.slice(start, end);
    const body = bodyLines.join('\n');
    const claims = [];
    let m;
    OWN_CLAIM.lastIndex = 0;
    while ((m = OWN_CLAIM.exec(body)) !== null) {
      const glyph = m[2] || null;
      claims.push({
        claimed: m[1].toUpperCase(),
        offset: m.index,
        glyph,
        // ⚠️ 括号里那个字的**真实码位**（null = 注解没带括号字形）。
        glyphCp: glyph ? hex4(glyph.codePointAt(0)) : null,
      });
    }
    entries.push({
      line: heads[k].line,
      ch: heads[k].ch,
      cp: heads[k].cp,
      actual: heads[k].cp == null ? null : hex4(heads[k].cp),
      claimed: claims.length > 0 ? claims[0].claimed : null,
      claims,
    });
  }
  return { entries, lines };
}

/**
 * **跨账本**的撞号判定 —— 父仓／移动端／桌面端**共用一条码位序列**
 * （移动端账本自己的条目 ❸ 写明：「**查重必须跨账本**」）。
 *
 * ⚠️ 为什么不能靠标题判断「是不是同一条目」：本仓三本账本里**没有**镜像条目
 * ⇒ ⇒ 同一个码位被两条**不同**的条目占 ⇒ ⇒ 引用变歧义 ⇒ ⇒ 那正是 R1 要挡的。
 *
 * @param {{name: string, text: string}[]} ledgers
 * @returns {{cp: number, uses: {name: string, line: number}[]}[]}
 */
export function findCollisions(ledgers) {
  const byCp = new Map();
  for (const l of ledgers) {
    const { entries } = extractEntries(l.text);
    for (const e of entries) {
      if (e.actual == null) continue;
      if (!byCp.has(e.actual)) byCp.set(e.actual, []);
      byCp.get(e.actual).push({ name: l.name, line: e.line });
    }
  }
  return [...byCp.entries()]
    .filter(([, uses]) => uses.length > 1)
    .map(([cp, uses]) => ({ cp, uses }))
    .sort((a, b) => a.cp - b.cp);
}

/** 判据本体：返回 { dups, mismatched, swallowed, foreign, entries }。 */
export function findViolations(text) {
  const { entries, lines } = extractEntries(text);
  const byCp = new Map();
  for (const e of entries) {
    if (e.actual == null) continue;
    if (!byCp.has(e.actual)) byCp.set(e.actual, []);
    byCp.get(e.actual).push(e.line);
  }
  const dups = [...byCp.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([cp, ls]) => ({ cp, lines: ls }));
  const mismatched = entries
    .filter((e) => e.claimed && e.actual != null && e.claimed !== e.actual)
    .map((e) => ({ line: e.line, ch: e.ch, actual: e.actual, claimed: e.claimed }));
  // R3：非标题行里嵌着「**Updated**: 日期」⇒ 缝合残迹（行首锚被吞）。
  const swallowed = [];
  for (let i = 0; i < lines.length; i++) {
    // ⚠️ 「是不是标题行」必须跟 extractEntries **用同一个判据** ——
    // ⇒ ⇒ 否则移动端那种形状的**真条目**会被当成「非标题行里嵌着标题形状」
    // ⇒ ⇒ ⇒ 一次改形状就凭空多出几十条假红（2026-11-08 实测踩过）。
    if (HEADER_LINE.test(lines[i])) continue;
    if (HEADER_SHAPE.test(lines[i])) {
      swallowed.push({ line: i + 1, snippet: lines[i].slice(0, 60) });
    }
  }
  // R4：条目体里 OWN_CLAIM 命中的码位 ≠ 自己标题码位 ⇒ 别条的声明躺在体里。
  //
  // ⚠️⚠️ **2026-11-08 实测收紧**：旧判据只要「声明的码位 ≠ 自己的」就报 R4
  // ⇒ ⇒ **自己注解写错**（R2 那一条）会被 R4 **重复报一遍** ⇒ ⇒ 两条红说同一件事
  // ⇒ ⇒ 而且 R4 的措辞是「**条目并体**」⇒ ⇒ 那是在**误指控**：注解写错时
  // ⇒ ⇒ 根本没有并体 ⇒ ⇒ **误指控比漏报更坏**。
  //
  // ⇒ ⇒ 现在按「**声明的位置**」分：条目体里的**第一条**声明是**自己的**
  // ⇒ ⇒ 它的码位与标题不符 ⇒ ⇒ 那是 **R2（注解写错）**；**其后的**声明 ⇒ ⇒
  // ⇒ ⇒ 那是**别条**的声明躺在这儿 ⇒ ⇒ **R4（并体残余）**。
  // ⇒ ⇒ 旧判据把两者混在一起 ⇒ ⇒ 注解写错会被**报两遍**，而且 R4 的措辞
  // ⇒ ⇒ 「条目并体」在那种情形下是**误指控** ⇒ ⇒ 误指控比漏报更坏。
  // ⚠️ 边界：一个**自己没有声明**的条目若吞了别条的声明 ⇒ ⇒ 那条声明是「第一条」
  // ⇒ ⇒ R4 看不见它 ⇒ ⇒ 那种情形靠 R3（缝合残迹）兜底（并体必然留下残迹）。
  const foreign = [];
  for (const e of entries) {
    if (e.actual == null) continue;
    const others = e.claims.slice(1).filter((c) => c.claimed !== e.actual);
    if (others.length > 0) {
      foreign.push({ line: e.line, actual: e.actual, claimed: others.map((c) => c.claimed) });
    }
  }
  // ⚠️ **R5（注解里的括号字形）** —— 「本条占 U+340B（㐋）」⇒ ⇒ 括号里
  // 那个字的**真实码位**必须等于注解写的那个数字 ⇒ ⇒ 否则**注解在说假话**
  // （标题说 U+340B、括号里却画着 U+334B 的字 —— 两者**不同形**，肉眼几乎看不出来）。
  // ⚠️ 2026-11-08 实测：本人正是这么栽的 ⇒ ⇒ 旧 R2 因为形状不匹配而**一直是暗的**。
  const glyphMismatch = [];
  for (const e of entries) {
    for (const c of e.claims) {
      if (c.glyphCp && c.glyphCp !== c.claimed) {
        glyphMismatch.push({
          line: e.line,
          claimed: c.claimed,
          glyphCp: c.glyphCp,
          glyph: c.glyph,
        });
      }
    }
  }
  // ⚠️⚠️ **R7（孤儿声明）** —— 「本条占 U+XXXX」**必须挂在自己那条的体内**。
  //   ⇒ ⇒ 不挂在任何条目里的声明 ⇒ ⇒ 要么那条的**标题行被吞了**（正文浮在文件里），
  //   要么这是一条**重复**的声明 ⇒ ⇒ 两种都不是「正常的账本形状」。
  //   ⚠️ **2026-11-09 实测入库**：真账本里**当场逮到 1 处** —— 并行会话插入条目时
  //   **漏了标题行** ⇒ ⇒ 那段正文（连同它的圈码声明）浮在文件顶部、**不归属任何条目**
  //   ⇒ ⇒ R2/R4 **都看不见它**（它们只看条目体）⇒ ⇒ 演练的「破坏声明」腿也因此
  //   **咬不到**（它改的正是那处无主声明）⇒ ⇒ **尺子失灵** ⇒ ⇒ CI 红。
  //   ⚠️ **量过的零假阳**：三本账本 × 两个面 ⇒ ⇒ 除那 1 处外 **0 命中**。
  const orphanClaims = [];
  {
    const owned = new Set();
    for (let k = 0; k < entries.length; k++) {
      const end = k + 1 < entries.length ? entries[k + 1].line - 1 : lines.length;
      for (let i = entries[k].line; i <= end; i++) owned.add(i);
    }
    for (let i = 0; i < lines.length; i++) {
      let m;
      OWN_CLAIM.lastIndex = 0;
      while ((m = OWN_CLAIM.exec(lines[i])) !== null) {
        if (!owned.has(i + 1)) {
          orphanClaims.push({
            line: i + 1,
            claimed: m[1].toUpperCase(),
            glyph: m[2] || null,
            snippet: lines[i].slice(0, 60),
          });
        }
      }
    }
  }
  return { entries, dups, mismatched, swallowed, foreign, glyphMismatch, orphanClaims };
}

/**
 * **码位集的规范串** —— 升序、去重、大写、逗号连接。
 *
 * ⚠️ 为什么要有「规范串」：豁免集（基线 commit 的撞号集）要有一个**稳定的指纹**
 * ⇒ ⇒ 否则「豁免集被改过」这件事**没法被看见** ⇒ ⇒ 指纹就是那把尺子的封条。
 */
export function canonicalSet(cps) {
  return [...new Set((cps || []).map((c) => String(c).toUpperCase()))].sort().join(',');
}

/**
 * **码位集的指纹**（sha256 of 规范串）—— 豁免集的**封条**。
 *
 * ⚠️ 2026-11-08 实测：上一版的豁免权是「债表里的一行」⇒ ⇒ 往债表里加一行
 * ⇒ ⇒ 一个**今天才出现**的撞号立刻「已登记」⇒ ⇒ 不再红 ⇒ ⇒ **那是一台洗白机**。
 * ⇒ ⇒ 现在豁免集的出处是**基线 commit 的历史事实**⇒ ⇒ 指纹**钉在闸脚本里**
 * ⇒ ⇒ 改基线就要改指纹 ⇒ ⇒ 那是**代码改动** ⇒ ⇒ review 看得见。
 */
export function setDigest(cps) {
  return createHash('sha256').update(canonicalSet(cps)).digest('hex');
}

/**
 * **身份键的前缀长度** —— 豁免的「码位级」升级成「身份级」时用它。
 *
 * ⚠️ 为什么是**前缀**而不是整行（2026-11-08 实测）：
 *   · 整行身份 ⇒ ⇒ 实测 48 对历史撞号里有 **1 对漂移**（U+32E3）
 *   · 漂移的根因：**标题尾部的引用被重编号**（「承 ㋢ 条」→「承 ㋽ 条」）
 *   · ⇒ ⇒ 用整行判身份 ⇒ ⇒ **同一个历史撞号被误判成「新增」**（假红）
 *   · ⇒ ⇒ 用前缀（K=60）⇒ ⇒ 实测**零漂移** ⇒ ⇒ 既容忍「引用重编号」
 *   · ⇒ ⇒ 又能抓住「**另一个条目**占了这个码位」（新条目的主题在开头就不同）
 */
export const IDENTITY_PREFIX_LENGTH = 60;

/** 标题行归一（空白折叠＋去首尾）⇒ ⇒ 身份键与行尾空白无关。 */
export function normalizeHeaderLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

/**
 * 某一条占号条目的**身份键** ＝ 「账本名 ｜ 标题行前 K 字符」。
 *
 * @param {{name: string, text: string}[]} ledgerTexts
 * @param {{name: string, line: number}} use
 */
export function identityKey(ledgerTexts, use, prefixLength = IDENTITY_PREFIX_LENGTH) {
  const l = ledgerTexts.find((x) => x.name === use.name);
  if (!l) return use.name + '|?';
  const lines = l.text.split(/\r?\n/);
  const line = lines[use.line - 1] || '';
  return use.name + '|' + normalizeHeaderLine(line).slice(0, prefixLength);
}

/**
 * **身份指纹** —— 身份键的单向指纹（基线快照存的是**它**，不是历史标题原文）。
 *
 * ⚠️ **为什么存指纹而不存原文**（2026-11-09 实测）：基线快照若逐字存历史标题
 * ⇒ ⇒ 那份文件里就有**旧产品名** ⇒ ⇒ 它落进 legacy residue 闸的扫描面
 * ⇒ ⇒ 闸红（2026-11-09 CI 实测：4 处）⇒ ⇒ 而身份级分辨力一点没丢
 * （指纹 = f(身份键)，同身份 ⇔ 同指纹）⇒ ⇒ 可用 `git show` 复算。
 *
 * ⇒ ⇒ 算法：sha256(账本名｜标题前 60 字符) 的前 16 位十六进制。
 */
export function identityFingerprint(key) {
  return createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
}

/** 一组身份键 ⇒ ⇒ 一组身份指纹（升序）—— 基线里存的就是这个。 */
export function fingerprintIdentities(keys) {
  return (keys || []).map(identityFingerprint).sort();
}
/** 一个撞号的**身份集合**（各占用者的身份键，升序）⇒ ⇒ 顺序无关。 */
export function collisionIdentities(ledgerTexts, collision, prefixLength = IDENTITY_PREFIX_LENGTH) {
  return collision.uses.map((u) => identityKey(ledgerTexts, u, prefixLength)).sort();
}

/** 身份映射的**规范串**（码位升序，每码位下身份键升序）⇒ ⇒ 指纹的输入。 */
export function canonicalIdentities(identities) {
  return Object.keys(identities || {})
    .map((cp) => String(cp).toUpperCase())
    .sort()
    .map((cp) => cp + '=' + [...(identities[cp] || [])].map((k) => String(k)).sort().join(';'))
    .join('|');
}

/** 身份映射的**指纹** —— 第二把封条（第一把是码位集的）。 */
export function identityDigest(identities) {
  return createHash('sha256').update(canonicalIdentities(identities)).digest('hex');
}

export  const LEDGER_REF = /([\u2460-\u24FF\u3200-\u4DBF])[ \t]*条/g;

/** 圈码字形可能落在哪几个区段（带圈数字段 ＋ CJK 兼容/扩展 A 段）。 */
export  const MARKER_RANGES = [[0x2460, 0x24ff], [0x3200, 0x4dbf]];

export  function isMarkerShaped(cp) {
  for (const [a, b] of MARKER_RANGES) if (cp >= a && cp <= b) return true;
  return false;
}

/** 三账本合计的**占用表**（码位 → 占用者列表）。 */
export  function occupiedMap(ledgers) {
  const m = new Map();
  for (const l of ledgers) {
    for (const e of extractEntries(l.text).entries) {
      if (!e.actual) continue;
      if (!m.has(e.actual)) m.set(e.actual, []);
      m.get(e.actual).push({ name: l.name, line: e.line });
    }
  }
  return m;
}

/** 某账本里**条目自己的圈码字形**所在位置（行号|列号）—— 那是声明，不是引用。 */
function ownMarkerPositions(text) {
  const lines = text.split(/\r?\n/);
  const pos = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADER_LINE);
    if (!m) continue;
    const idx = lines[i].indexOf(m[1]);
    if (idx >= 0) pos.add(i + '|' + idx);
  }
  return pos;
}

/**
 * 找出**悬空引用**（指向不存在的条目）与**歧义引用**（指向多个条目）。
 *
 * ⚠️⚠️ **R6（2026-11-09 实测入库）**：账本里到处是「承 ㋛ 条」这种**交叉引用**
 * ⇒ ⇒ 而「㋛」这个码位**必须**有条目占着 ⇒ ⇒ 否则那处引用**悬空**（读者点不动、
 * 事后无从对账、机器判不出真假）。
 * ⇒ ⇒ 实测三账本：**15 处**引用指向**当前没有任何条目占用**的码位 ⇒ ⇒ 而那 6 个
 * 目标码位（U+3331／3332／3333／334B／33F0／33FA）在**全部 410 个历史提交**里
 * **从未当过条目标记** ⇒ ⇒ 它们不是「死条目」，是**幻影**（写错的码位）。
 * ⇒ ⇒ 根因两类：① **差 0x80 的错码位**（U+3331↔U+33B1、U+3332↔U+33B2、
 * U+3333↔U+33B3 —— **「3」与「B」混淆**，这一族一处吃掉 10 处引用）；
 * ② **笔误／张冠李戴**（㏰ 写成 ㏈、㍋ 写成 㐋、㏺ 写成 ㎺）。
 *
 * 三条硬约束：
 * · 引用形状＝「**方块字 + 条**」（承 ㋛ 条／㋛ 条③／㋛ 条「…」）——
 *   ⚠️ **必须带「条」**：只凭方块字会把「❶ ② ③」这类**列表序号**当成引用
 *   ⇒ ⇒ 那是最大的假阳性源（真账本里 ② 出现几百次）。
 * · 目标码位**必须**在三账本里被**某个条目占用**（**跨账本**算）⇒ ⇒ 否则悬空 ⇒ 红。
 * · **歧义引用**（目标码位被**多个**条目占用）⇒ ⇒ 只**警告**：那是 R1 撞号那笔债
 *   （由基线豁免挡着）⇒ ⇒ 本条**不重复红**。
 * · 条目**自己**标题里那个圈码字形是**声明**（不是引用）⇒ ⇒ 必须扣掉。
 *
 * @param {{name:string,text:string}[]} ledgers 三账本
 * @param {Set<string>} markerUniverse 「当过条目标记」的码位集合 ——
 *        用来把「②」这种**表项序号**从引用里排除掉（⚠️ 只对 0x2460–0x24FF 段生效：
 *        那一段既当过条目标记（⑲⑳），也当过列表序号（①②③））。
 */
export  function findReferenceIssues(ledgers, markerUniverse) {
  const occupied = occupiedMap(ledgers);
  const dangling = [];
  const ambiguous = [];
  for (const l of ledgers) {
    const lines = l.text.split(/\r?\n/);
    const own = ownMarkerPositions(l.text);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      LEDGER_REF.lastIndex = 0;
      while ((m = LEDGER_REF.exec(line)) !== null) {
        const cp = m[1].codePointAt(0);
        const hex = hex4(cp);
        if (own.has(i + '|' + m.index)) continue; // 自己的圈码＝声明
        if (cp >= 0x2460 && cp <= 0x24ff && !(markerUniverse && markerUniverse.has(hex))) continue; // 列表序号
        const users = occupied.get(hex) || [];
        const rec = {
          ledger: l.name, line: i + 1, cp: hex, glyph: m[1], users: users.length,
          snippet: line.slice(Math.max(0, m.index - 24), m.index + 26).replace(/\r/g, ''),
        };
        if (users.length === 0) dangling.push(rec);
        else if (users.length > 1) ambiguous.push(rec);
      }
    }
  }
  return { dangling, ambiguous, occupied };
}
