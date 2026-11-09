
/**
 * 「状态面治理」判据 —— **纯函数**（零 IO ⇒ ⇒ 自检可以喂退化副本）。
 *
 * ## 它回答的问题
 *
 * 「这份持久状态**能不能被治理**？」—— 具体是五问：
 *   ① 每条状态**有没有信封**（授权 epoch / 授权来源 / 适用范围 / 状态 / 取代链）；
 *   ② 「继承」指向的那一条**还在不在**（来源指针可解析）；
 *   ③ 「取代」指向的那一条**还在不在**（取代链可解析）；
 *   ④ **标记有没有被两条占用**（占用 ⇒ ⇒ 引用是歧义的）；
 *   ⑤ 存量债务**有没有变多 / 该不该销账**。
 *
 * ## 为什么是「信封」而不是「字段」
 *
 * 状态面是**给人读也给人写**的 Markdown ⇒ ⇒ 判据必须认**行形状**
 * （行首引用块里的「信封：k=v | k=v」）而不是关键词 ⇒ ⇒ 否则正文里提一句
 * 「来源」就会把一条没信封的条目喂绿（**假绿**）⇒ ⇒ 与本仓既有判据同源：
 * **认形状不认关键词**。
 *
 * ## 依据
 *
 * arXiv:2606.30306《Always-On Agents》§9.6 的 required ablation —— 给状态
 * 加「permission epoch ＋ deletion ledger ＋ provenance trust tier」三件套
 * 再重跑；我们把它落成**六字段信封**（多一个 authority 与 scope）。
 * 同一篇 §2.5 点名的「authority lapse」（用户撤回偏好后 agent 仍照做）
 * 正是 user 记忆层今天的样子：只有一条、没有撤销通道。
 */

/** 信封必须带的六个字段（论文那个 required ablation 的落法）。 */
export const ENVELOPE_KEYS = ['epoch', 'authority', 'scope', 'source', 'status', 'supersedes'];

/** authority 的允许值 —— 谁授权的。 */
export const AUTHORITIES = ['user', 'measured', 'paper', 'inherited', 'runtime'];

/** scope 的允许值 —— 这一条管到哪一层。 */
export const SCOPES = ['project', 'agent', 'user', 'session'];

/** status 的允许值 —— 这条状态现在算不算数。 */
export const STATUSES = ['active', 'superseded', 'retired'];

/** 信封行：**行首**的引用块 + 「信封：」+ k=v 串。 */
const RE_ENVELOPE_LINE = /^\s*>\s*\*{0,2}\s*信封\s*\*{0,2}\s*[:：]/;

/** CJK 带圈符号（①②…㋰㌂㎀）—— 本仓用来给条目编号的那一族。 */
const RE_ENCLOSED = /[\u3200-\u33FF]/g;

/** 继承指针：「承㋰」这种**可解析**的指向。 */
const RE_INHERIT_REF = /承\s*([\u3200-\u33FF]+)/g;

/**
 * 「承 U+XXXX」这种**码位指针** —— 指向**一个编号**，不是一个带圈符号。
 *
 * ⚠️⚠️ **为什么要单独一条规则**（2026-11-09 实测）：带圈符号（3200–33FF）那套
 * 判据认的是「**符号**」⇒ ⇒ 而本仓的账本条目**大多用 34xx 段的方块字**
 * ⇒ ⇒ 「承 U+34xx 条」那些指针**根本不在**带圈符号的判据面里
 * ⇒ ⇒ 「承 U+3351 条」这种**指向不存在的编号**，旧判据**看不见**
 * ⇒ ⇒ ⇒ 那是一条**盲区**，不是「没有债」。
 */
export const RE_CODEPOINT_POINTER = /承\s*U\+([0-9A-Fa-f]{4,6})/g;

/**
 * 这本账本**定义**了哪些编号 —— 条目标题里那个方块字的**原始码位**。
 *
 * ⚠️ **只认原始码位** —— 与码位闸同一纪律（NFKC 会把不同的条目判成同一个）。
 * ⚠️ **不限段** —— 带圈段（3200–33FF）之外的那些（34xx…）才是账本的主力。
 */
export function ledgerCodepoints(text) {
  const out = new Set();
  const re = /^\*\*Updated(?::)?\*\*:?\s*[12]\d{3}-\d{2}-\d{2}\s+\((.)\s\*\*/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1].codePointAt(0));
  return out;
}

/**
 * 码位指针 ⇒ ⇒ **解析不到**的那些（allowed = 这个面**能看见**的编号集合）。
 *
 * ⚠️ 这是一个**纯函数** —— 判据要能脱离文件、脱离 git 单独跑。
 */
export function unresolvedCodePointPointers(text, allowed) {
  const out = [];
  const re = new RegExp(RE_CODEPOINT_POINTER.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const cp = parseInt(m[1], 16);
    if (!allowed.has(cp)) out.push({ ref: 'U+' + m[1].toUpperCase(), codepoint: cp });
  }
  return out;
}

/**
 * **R10：码位指针必须解析得到**（跨面）。
 *
 * ⚠️ **为什么旧判据看不见它**（2026-11-09 实测）：带圈符号那套判据认的是
 * 「**符号**」（3200–33FF）⇒ ⇒ 而账本条目**大多用 34xx 段的方块字**
 * ⇒ ⇒ 「承 U+34xx 条」不在它的判据面里 ⇒ ⇒ 指向**不存在的编号**也照样通过
 * ⇒ ⇒ ⇒ 那是一条**盲区**。
 *
 * ⚠️ **解析域＝自己面 ∪ domainIds 指向的面** —— 子仓账本**合法**引用父仓编号
 * （父仓面有 symbolDomain）⇒ ⇒ 不能只按「自己面」判（那是假红）。
 *
 * ⚠️ **存量债＝0** —— 实测三账本当前**没有**解析不到的指针 ⇒ ⇒ 所以这条规则
 * **不需要基线豁免**（没有要豁免的东西）⇒ ⇒ 也不用「基线 commit ＋ 指纹封条」。
 */
/**
 * 账本的**编号空间** —— 三个面里真正被用过的码位，落在哪几个 256 块上。
 *
 * ⚠️ **为什么需要它**（2026-11-09 实测）：R10 认的是「承 U+XXXX 条」这个**形状**
 * ⇒ ⇒ 而账本正文里**也会拿这个形状举例子**（实测：并行会话那条 U+3429 条里写着
 * 「在副本上注入「承 U+9999 条」」）⇒ ⇒ 那种**示例占位**会被当成**真引用**
 * ⇒ ⇒ 闸**恒红**（实测：主 CI 的「State surface governance check」与
 * 「Gate discipline check」两条红，根因都在这一条）⇒ ⇒ ⇒ 判据必须分清
 * 「**引用**」与「**示例**」。
 *
 * ⚠️ **口径＝块**（不是区间）⇒ ⇒ 账本真用的那些块（0x32 带圈段 ／ 0x34 方块段…）
 * ⇒ ⇒ 落在**同一块**里的悬空指针**照样红**（尺子的牙还在）
 * ⇒ ⇒ 落在**空间外**的（U+9999 这种占位）⇒ ⇒ **不判红，但出声**（进读数）。
 */
export function ledgerCodepointSpace(surfaces) {
  const blocks = new Set();
  for (const s of surfaces) {
    for (const cp of ledgerCodepoints(s.text)) blocks.add(Math.floor(cp / 256));
  }
  return blocks;
}

/**
 * R10 的**分类**版 —— 分两堆：**违规**（编号空间内的悬空指针）＋ **示例**
 * （空间外的占位指针 ⇒ ⇒ 不判红，但**要出声**）。
 *
 * ⚠️ 「示例」这一堆**不许静默吞掉** —— 静默＝「我没看见」冒充「没有问题」。
 */
export function classifyCodePointPointers(surfaces) {
  const defined = new Map();
  for (const s of surfaces) defined.set(s.id, ledgerCodepoints(s.text));
  const space = ledgerCodepointSpace(surfaces);
  const violations = [];
  const examples = [];
  for (const s of surfaces) {
    const allowed = new Set(defined.get(s.id) || []);
    for (const d of s.domainIds || []) {
      for (const cp of defined.get(d) || []) allowed.add(cp);
    }
    for (const p of unresolvedCodePointPointers(s.text, allowed)) {
      if (!space.has(Math.floor(p.codepoint / 256))) {
        examples.push({ surface: s.id, ref: p.ref, codepoint: p.codepoint });
        continue;
      }
      violations.push({
        rule: 'R10',
        msg:
          '状态面 ' + s.id + '：指针「承 ' + p.ref + ' 条」指向的编号**在它能看见的账本里不存在**'
          + ' ⇒ ⇒ **悬空指针**（读者点不过去 ⇒ ⇒ 这条引用等于没写）',
      });
    }
  }
  return { violations, examples };
}

/** R10 判据（只要违规那堆）—— 老接口保持不变。 */
export function judgeCodePointPointers(surfaces) {
  return classifyCodePointPointers(surfaces).violations;
}

/** 位置型指针：「承上一条」「承用户那句」—— 插入/删除就会指错。 */
const RE_POSITIONAL_REF =
  /承\s*(上一条|上一轮|前一条|上面那条|用户那句|上一[^\s，。、；：)）]{0,6}那条)/g;

/**
 * **跨面限定词** —— 「承**父仓**㋱条」这种写法说明指的是**别的面**。
 *
 * ⚠️ 没有限定词 ⇒ ⇒ 当两个面**同名**时，读者无法判定指的是哪一条
 *    ⇒ ⇒ **歧义引用**（不是悬空 —— 它能解析，但解析出两条）。
 */
const RE_QUALIFIER = /父仓|跨仓|主仓|本仓|另一面|对面/;

/**
 * 代码围栏（三反引号）⇒ ⇒ 围栏里的「### 」不是条目。
 *
 * ⚠️⚠️ **判据必须认「整行只有围栏标记」** —— 2026-11-05 实测踩到：记忆层第 2164 行
 *    是一句**以 ``` 开头的散文**（「``` ⇒ ⇒ 没有结论 ⇒ 判失败」）⇒ ⇒ 旧判据
 *    （只看「行首有没有 ```」）把它当成**围栏开头** ⇒ ⇒ 后面所有围栏的**奇偶性
 *    整体错位** ⇒ ⇒ 第 2208/2215 那对本来配对的围栏被算成「没闭合」⇒ ⇒
 *    **221 行连同它们之间的条目被整段吞掉** ⇒ ⇒ 闸少算条目、少算悬空指针，
 *    却报「零违规」⇒ ⇒ 典型的**假绿**。
 *
 * ⇒ ⇒ 所以：围栏行 = 三个反引号 ＋ 可选的**无空格**信息串（bash / rust / powershell）
 *    ＋ 可选行尾空白。带空格、带散文 ⇒ ⇒ 一律是正文，不是围栏。
 */
const RE_FENCE = /^\s*\x60\x60\x60[ \t]*[A-Za-z0-9_+.-]*[ \t]*$/;

/**
 * 扫代码围栏的状态。
 *
 * ⚠️⚠️ **为什么要单独扫**：围栏**不配对**时 ⇒ ⇒ 后面所有 `### ` 都会被当成围栏内容
 *    ⇒ ⇒ **条目被静默吞掉** ⇒ ⇒ 计数少了、悬空指针少了 ⇒ ⇒ 闸会报「零违规」
 *    ⇒ ⇒ 那是**假绿**（2026-11-05 实测踩到：记忆层里一个没闭合的 ``` 把后面
 *    两条新记忆整条吞掉了 ⇒ ⇒ 闸少算了它们的悬空引用）。
 *
 * @param {string[]} lines
 * @returns {{total:number, unclosed:boolean, openedAt:number|null}}
 */
export function scanFenceState(lines) {
  // ⚠️ **逐行掩码** ⇒ ⇒ 切条目与判据共用**同一份**实现 ⇒ ⇒ 两处不许漂移
  //    （两个实现漂移过一次：切条目按自己的开关算、判据按另一份算）。
  const inFenceAt = [];
  let inFence = false;
  let openedAt = null;
  let openedText = null;
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    inFenceAt.push(inFence);
    if (!RE_FENCE.test(lines[i])) continue;
    total++;
    inFence = !inFence;
    openedAt = inFence ? i + 1 : null;
    if (inFence) openedText = String(lines[i]).trim();
  }
  return { total: total, unclosed: inFence, openedAt: openedAt, openedText: openedText, inFenceAt: inFenceAt };
}

/**
 * 账本条目的两种开头形状（**父仓与子仓写法不一样** ⇒ ⇒ 两种都要认）：
 *   「**Updated**: 2026-11-04」  与  「**Updated:** 2026-11-02」
 *
 * ⚠️⚠️ **只认一种 ⇒ ⇒ 会漏掉一半条目**（2026-11-05 实测：父仓账本里
 *    「**Updated**:」47 条 ＋ 「**Updated:**」104 条 ⇒ ⇒ 只认前者会漏 104 条
 *    ⇒ ⇒ 而漏掉的那些**正是带圈编号的旧条目** ⇒ ⇒ 符号域缩水 ⇒ ⇒
 *    悬空指针被**假绿**掉 ⇒ ⇒ 我第一版量出「82 条悬空指针」就是这么来的，
 *    真实数字是 **0**（父仓内全部可解析）⇒ ⇒ **教训：量「悬空」之前先量
 *    「总数」，两者口径必须一致**。
 */
const RE_UPDATED = /^\*\*Updated:?\*{1,2}:?\s*(\d{4}-\d{2}-\d{2})/;

/** 允许被登记成存量债务的种类（**新条目不许豁免** ⇒ 只有存量可登记）。 */
export const DEBT_KINDS = [
  'dangling-symbol-ref',
  'positional-ref',
  'entry-without-date',
  'duplicate-marker',
  'ambiguous-cross-ref',
];

export function parseEnvelopeLine(line) {
  if (!RE_ENVELOPE_LINE.test(line)) return null;
  const rest = line.replace(RE_ENVELOPE_LINE, '');
  const env = {};
  for (const part of rest.split('|')) {
    const s = part.trim();
    if (!s) continue;
    const eq = s.indexOf('=');
    if (eq < 0) continue;
    const k = s.slice(0, eq).trim().toLowerCase();
    if (!k) continue;
    env[k] = s.slice(eq + 1).trim();
  }
  return env;
}

/** 找一条目里的信封行（可能多条 ⇒ 多条本身是违规）。 */
export function findEnvelope(body) {
  const lines = String(body || '').split(/\r?\n/);
  const found = [];
  for (const line of lines) {
    if (!RE_ENVELOPE_LINE.test(line)) continue;
    found.push({ raw: line, env: parseEnvelopeLine(line) });
  }
  return {
    count: found.length,
    env: found.length ? found[found.length - 1].env : null,
    raws: found.map((x) => x.raw),
  };
}

/**
 * 标题 —— 优先取「」里的那句话（那才是条目的名字）⇒ ⇒ 报错信息才读得懂。
 */
export function titleOf(head) {
  const quoted = head.match(/「([^」]{1,80})」/);
  if (quoted) return quoted[1];
  const cleaned = head.replace(/^#+\s*/, '').replace(/^\*\*Updated:?\*{1,2}:?\s*/, '');
  return cleaned.slice(0, 60);
}

/**
 * 切条目 —— 两种面：
 *   'md-updated' —— 项目账本（每条以「**Updated**」开头，带圈编号）；
 *   'md-heading' —— 记忆层（每条以「### 」开头，标题里带日期）。
 *
 * ⚠️ 代码块里的「### 」不算条目（那是文档示例）⇒ ⇒ 围栏要跟踪。
 */
export function splitEntries(text, kind) {
  const lines = String(text || '').split(/\r?\n/);
  const starts = [];
  const fenceState = scanFenceState(lines);
  for (let i = 0; i < lines.length; i++) {
    if (RE_FENCE.test(lines[i])) continue;
    if (fenceState.inFenceAt[i]) continue;
    if (kind === 'md-updated') {
      const m = lines[i].match(RE_UPDATED);
      if (m) starts.push({ line: i, date: m[1], head: lines[i] });
    } else if (kind === 'md-heading') {
      const m = lines[i].match(/^###\s+(.*)$/);
      if (m) {
        const dm = m[1].match(/(\d{4}-\d{2}-\d{2})/);
        starts.push({ line: i, date: dm ? dm[1] : null, head: lines[i] });
      }
    }
  }
  const entries = [];
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k].line;
    const to = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    const body = lines.slice(from, to).join('\n');
    const paren = starts[k].head.match(/\(([^)]*)/);
    // ⚠️⚠️ **只取紧跟左括号的那串带圈符号** ⇒ ⇒ 否则正文里出现的符号
    //    （例如「承㋱那条」里的㋱）会被当成「这个条目定义了㋱」
    //    ⇒ ⇒ 符号域被撑大 ⇒ ⇒ 悬空指针被**假绿**掉（2026-11-05 实测踩到）。
    const own = paren ? paren[1].match(/^\s*([\u3200-\u33FF]+)/) : null;
    const symbols = own ? own[1].split('') : [];
    entries.push({
      index: k,
      line: from + 1,
      date: starts[k].date,
      // ⛔⛔ **head 是加法字段**（2026-11-05）⇒ ⇒ 撤销通道的判据要读**标题行原文**
      //    （判撤销形态的尾部锚点）⇒ ⇒ 下面的判据只认标题的**形状**
      //    ⇒ ⇒ 不认关键词（正文里提一句「已撤回」不算撤回）。
      head: starts[k].head,
      title: titleOf(starts[k].head),
      symbols,
      body,
    });
  }
  return entries;
}

/**
 * 量一个状态面 —— **纯函数**（吃文本 ⇒ ⇒ 自检可以喂退化副本）。
 *
 * @param {object} surface {id, kind, text, cutoff, extraSymbols?, domainSymbols?}
 *   extraSymbols  —— 跨面符号域（**并集**，用于「能不能解析」）
 *   domainSymbols —— 跨面**自己的**符号集合（用于「歧义」判定）
 * @returns {{entries:object[], symbols:string[], counts:object, details:object}}
 */
export function analyzeSurface(surface) {
  const text = surface.text || '';
  const cutoff = surface.cutoff || null;
  const entries = splitEntries(text, surface.kind);
  // ⚠️⚠️ **runtime 来源注释是「上一行」而不是「本条目体内」** —— 运行时的记忆工具
  //    把 `<!-- mem-append-reason: … -->` 写在**标题行的前一行** ⇒ ⇒ 而条目是从
  //    标题行开始的 ⇒ ⇒ 那条注释落在**上一条**的 body 末尾 ⇒ ⇒ 必须按「标题行
  //    的前一行」去找，否则会**张冠李戴**（把上一条的理由算成这一条的）。
  const allLines = text.split(/\r?\n/);
  for (const e of entries) {
    const prev = e.line >= 2 ? allLines[e.line - 2] : '';
    e.ownComment = /^\s*<!--\s*mem-append-reason:/.test(prev) ? prev.trim() : '';
  }
  const own = new Set();
  for (const e of entries) for (const s of e.symbols) own.add(s);
  const domain = new Set(surface.domainSymbols || []);
  const symbols = new Set(own);
  // ⚠️ **跨面符号域** —— 子仓账本可以引用父仓的编号 ⇒ ⇒ 那不是悬空指针。
  for (const s of surface.extraSymbols || []) symbols.add(s);

  const counts = {
    'dangling-symbol-ref': 0,
    'banded-pointer': 0,
    'positional-ref': 0,
    'entry-without-date': 0,
    'no-envelope-new': 0,
    'missing-envelope-key': 0,
    'unresolved-supersedes': 0,
    'bad-envelope-value': 0,
    'entry-without-envelope': 0,
    'entry-without-source': 0,
    'duplicate-marker': 0,
    'duplicate-marker-new': 0,
    'ambiguous-cross-ref': 0,
  };
  const details = {
    dangling: [],
    bandedPointer: [],
    positional: [],
    noDate: [],
    noEnvelope: [],
    missingKey: [],
    unresolvedSupersedes: [],
    badValue: [],
    withoutEnvelope: [],
    withoutSource: [],
    duplicateMarkers: [],
    duplicateMarkersNew: [],
    ambiguousRefs: [],
  };

  // ── 标记占用表（一个标记被几条占用？）──
  const byMarker = new Map();
  for (const e of entries) {
    const sym = e.symbols.join('');
    if (!sym) continue;
    if (!byMarker.has(sym)) byMarker.set(sym, []);
    byMarker.get(sym).push(e);
  }
  for (const [sym, list] of byMarker) {
    if (list.length < 2) continue;
    const isNew = list.some((e) => e.date && cutoff && e.date >= cutoff);
    const item = {
      sym,
      code: 'U+' + sym.codePointAt(0).toString(16).toUpperCase(),
      items: list.map((e) => ({ date: e.date, title: e.title, line: e.line })),
    };
    // ⚠️ **两档分开** —— 「含新条目」的那档是**新增即错**（直接红，不许豁免）；
    //    「纯存量」的那档走债务清单（历史撞号，改号会打断已有引用 ⇒ ⇒ 只能慢慢还）。
    if (isNew) {
      counts['duplicate-marker-new']++;
      details.duplicateMarkersNew.push(item);
    } else {
      counts['duplicate-marker']++;
      details.duplicateMarkers.push(item);
    }
  }

  for (const e of entries) {
    if (!e.date) {
      counts['entry-without-date']++;
      details.noDate.push(e.title);
    }

    const envAll = findEnvelope(e.body);
    const hasEnvelope = envAll.count > 0;
    if (!hasEnvelope) {
      counts['entry-without-envelope']++;
      details.withoutEnvelope.push(e.title);
    }
    const map = envAll.env || {};
    // ⚠️ **runtime 的 mem-append-reason 注释本身就是来源记录** ⇒ ⇒ 它在哪个面
    //    出现都算来源 ⇒ ⇒ 不必「只有信封里的 source 才算来源」。
    if (!map.source && !e.ownComment) {
      counts['entry-without-source']++;
      details.withoutSource.push(e.title);
    }

    RE_INHERIT_REF.lastIndex = 0;
    let m;
    while ((m = RE_INHERIT_REF.exec(e.body)) !== null) {
      const sym = m[1];
      if (!symbols.has(sym)) {
        // ⚠️⚠️ **两档分开** —— 在**没有编号体系**的面（记忆层 / 用户偏好面），
        //    「承+带圈符号」不是「可能指错」，而是**永远解析不到** ⇒ ⇒ 它不是
        //    「存量债」而是**形状本身不该出现** ⇒ ⇒ 单列一档（R9，直接红）。
        //    ⇒ ⇒ 顺带堵住一个自指的坑：**写教训时拿真的带圈符号当反面例子**，
        //    会让记忆层的悬空引用**每写一条教训就多几处**（实测 1 → 4）。
        if (surface.noSymbolSystem) {
          counts['banded-pointer']++;
          details.bandedPointer.push({ from: e.title, sym: sym, date: e.date });
        } else {
          counts['dangling-symbol-ref']++;
          // ⚠️ **带上日期** —— 判据必须分清「存量债」与「新增即错」（cutoff 前后）
          details.dangling.push({ from: e.title, sym: sym, date: e.date });
        }
        continue;
      }
      // ⚠️⚠️ **歧义引用** —— 这个标记**自己面有、跨面也有** ⇒ ⇒ 不带限定词
      //    就分不清指的是哪一条 ⇒ ⇒ 它「能解析」但**解析出两条**。
      //    ⇒ ⇒ 这比悬空更隐蔽（悬空会红，歧义不会）。
      if (own.has(sym) && domain.has(sym)) {
        const around = e.body.slice(Math.max(0, m.index - 12), m.index + 40);
        if (!RE_QUALIFIER.test(around)) {
          counts['ambiguous-cross-ref']++;
          details.ambiguousRefs.push({ from: e.title, sym });
        }
      }
    }

    RE_POSITIONAL_REF.lastIndex = 0;
    while ((m = RE_POSITIONAL_REF.exec(e.body)) !== null) {
      counts['positional-ref']++;
      details.positional.push({ from: e.title, text: m[1] });
    }

    // 信封：**只对 cutoff 之后的条目**要求（存量走债务清单，新条目不许豁免）。
    const isNew = !!(e.date && cutoff && e.date >= cutoff);
    if (!isNew) continue;

    if (!hasEnvelope) {
      // ⚠️⚠️ **有些面的写入器根本不产信封** —— 2026-11-05 实测：运行时的记忆工具
      //    对 user 面只有 read/search/append ⇒ ⇒ 它给每条条目盖的是
      //    `<!-- mem-append-reason: … -->` 注释（**机器生成**、不会忘）⇒ ⇒
      //    那种面认「信封 **或** runtime 注释」⇒ ⇒ **两者都没有才红**。
      //    ⇒ ⇒ 这不是放松，是**按每个写入器自己的来源形状**判（同一纪律的另一面）。
      const okByRuntime = !!(surface.runtimeProvenance && e.ownComment);
      if (!okByRuntime) {
        counts['no-envelope-new']++;
        details.noEnvelope.push(e.title);
      }
      continue;
    }
    if (envAll.count > 1) {
      counts['bad-envelope-value']++;
      details.badValue.push(e.title + '：信封行出现 ' + envAll.count + ' 次 ⇒ ⇒ 取哪一条是歧义');
    }
    for (const k of ENVELOPE_KEYS) {
      if (!(k in map) || map[k] === '') {
        counts['missing-envelope-key']++;
        details.missingKey.push({ title: e.title, key: k });
      }
    }
    if (map.epoch && !/^\d{4}-\d{2}-\d{2}$/.test(map.epoch) && !/^v\d/.test(map.epoch)) {
      counts['bad-envelope-value']++;
      details.badValue.push(e.title + '：epoch「' + map.epoch + '」不是日期也不是 vN');
    }
    if (map.authority && AUTHORITIES.indexOf(map.authority) < 0) {
      counts['bad-envelope-value']++;
      details.badValue.push(e.title + '：authority「' + map.authority + '」不在允许集合');
    }
    if (map.scope && SCOPES.indexOf(map.scope) < 0) {
      counts['bad-envelope-value']++;
      details.badValue.push(e.title + '：scope「' + map.scope + '」不在允许集合');
    }
    if (map.status && STATUSES.indexOf(map.status) < 0) {
      counts['bad-envelope-value']++;
      details.badValue.push(e.title + '：status「' + map.status + '」不在允许集合');
    }
    if (map.supersedes && map.supersedes !== 'none') {
      const syms = map.supersedes.match(/[\u3200-\u33FF]/g);
      const ok = syms && syms.length > 0 && syms.every((x) => symbols.has(x));
      if (!ok) {
        counts['unresolved-supersedes']++;
        details.unresolvedSupersedes.push({ title: e.title, target: map.supersedes });
      }
    }
  }

  // ⚠️ 围栏状态**必须一起带出来** ⇒ ⇒ 不配对时要在判据里红（否则是假绿）
  const fenceLines = String(text).split(/\r?\n/);
  const fences = scanFenceState(fenceLines);
  // ⚠️ **被吞掉的第一条** —— 报错要能指到「哪一条没被看见」，否则修不了
  let swallowedFirst = null;
  if (fences.unclosed && fences.openedAt) {
    for (let i = fences.openedAt; i < fenceLines.length; i++) {
      const m = fenceLines[i].match(/^\s*(#{1,6}\s+.+|\*\*Updated:?\*{1,2}:?\s*\d{4}-\d{2}-\d{2}.*)$/);
      if (m) {
        swallowedFirst = { line: i + 1, head: m[1].trim().slice(0, 60) };
        break;
      }
    }
  }
  fences.swallowedFirst = swallowedFirst;
  fences.swallowedLines = fences.openedAt ? fenceLines.length - fences.openedAt : 0;
  return { entries, symbols: Array.from(symbols), ownSymbols: Array.from(own), counts, details, fences };
}

/**
 * 判据 —— 吃**一个面** + **债务登记** ⇒ ⇒ 返回违规清单（空 ＝ 绿）。
 *
 * @param {object} surface {id, kind, text, cutoff, extraSymbols?, domainSymbols?}
 * @param {object} debt    {kind: count} —— 只对 DEBT_KINDS 生效
 */
export function judgeSurface(surface, debt) {
  const v = [];
  const a = analyzeSurface(surface);
  const id = surface.id;

  // ⚠️⚠️ **R8 围栏不配对** —— 2026-11-05 实测踩到：一个没闭合的代码围栏把后面
  //    两条新记忆**整条吞掉** ⇒ ⇒ 闸少算了它们的悬空引用 ⇒ ⇒ 却报「零违规」
  //    ⇒ ⇒ 典型的**假绿** ⇒ ⇒ 现在它必须红。
  if (a.fences.unclosed) {
    v.push({
      rule: 'R8',
      msg:
        '状态面 ' +
        id +
        '：代码围栏不配对（第 ' +
        a.fences.openedAt +
        ' 行「' +
        (a.fences.openedText || '?') +
        '」没有闭合，后面还有 ' +
        a.fences.swallowedLines +
        ' 行被当成围栏内容 ⇒ ⇒ **所有条目都被吞掉** ⇒ ⇒ 计数不可信（条目少了、悬空指针也少了）⇒ ⇒ 闸红' +
        (a.fences.swallowedFirst
          ? ' ⇒ ⇒ 第一条被吞掉的是第 ' +
            a.fences.swallowedFirst.line +
            ' 行「' +
            a.fences.swallowedFirst.head +
            '」'
          : ''),
    });
  }

  for (const t of a.details.noEnvelope) {
    v.push({
      rule: 'R1',
      msg: '状态面 ' + id + '：条目「' + t + '」没有信封行 ⇒ ⇒ 它没有授权/来源/取代链 ⇒ ⇒ 没人能撤销它',
    });
  }
  for (const x of a.details.missingKey) {
    v.push({
      rule: 'R1',
      msg: '状态面 ' + id + '：条目「' + x.title + '」的信封缺字段 ' + x.key,
    });
  }
  for (const x of a.details.badValue) {
    v.push({ rule: 'R2', msg: '状态面 ' + id + '：' + x });
  }
  for (const x of a.details.unresolvedSupersedes) {
    v.push({
      rule: 'R3',
      msg:
        '状态面 ' + id + '：条目「' + x.title + '」的取代链指向「' + x.target + '」⇒ ⇒ 解析不到 ⇒ ⇒ 取代链是断的',
    });
  }
  for (const x of a.details.duplicateMarkersNew) {
    v.push({
      rule: 'R4',
      msg:
        '状态面 ' + id + '：标记 ' + x.sym + '（' + x.code + '）被 **' +
        x.items.length + ' 条**占用（' +
        x.items.map((i) => i.date + '「' + i.title + '」').join(' ＋ ') +
        '）⇒ ⇒ 「承' + x.sym + '」解析出**多条** ⇒ ⇒ 引用是歧义的',
    });
  }
  // ⚠️⚠️ **R9 带圈指针** —— 「没有编号体系」的面里，这个指针形状**永远解析不到**
  //    ⇒ ⇒ 不许出现 ⇒ ⇒ 写反面例子要用**带圈范围之外**的占位符（例如 承〈某符号〉）。
  for (const x of a.details.bandedPointer) {
    v.push({
      rule: 'R9',
      msg:
        '状态面 ' +
        id +
        '：条目「' +
        x.from +
        '」里出现「承' +
        x.sym +
        '」⇒ ⇒ 这个面**没有编号体系** ⇒ ⇒ 这个指针**永远解析不到** ⇒ ⇒ 写反面例子请用**带圈范围之外**的占位符（例如 承〈某符号〉）⇒ ⇒ 闸红',
    });
  }

  const d = debt || {};
  for (const kind of DEBT_KINDS) {
    const actual = a.counts[kind] || 0;
    const declared = d[kind];
    if (declared === undefined) {
      if (actual > 0) {
        v.push({
          rule: 'R5',
          msg: '状态面 ' + id + '：未登记的存量债务 ' + kind + '（' + actual + ' 处）⇒ ⇒ 请登记或修掉',
        });
      }
      continue;
    }
    if (actual > declared) {
      v.push({
        rule: 'R5',
        msg:
          '状态面 ' + id + '：' + kind + ' 登记 ' + declared + ' 处，实测 ' + actual + ' 处 ⇒ ⇒ 新增了 ⇒ ⇒ 闸红',
      });
    } else if (actual < declared) {
      v.push({
        rule: 'R5',
        msg:
          '状态面 ' + id + '：' + kind + ' 登记 ' + declared + ' 处，实测 ' + actual + ' 处 ⇒ ⇒ 清单过期 ⇒ ⇒ 请销账',
      });
    }
  }

  return { violations: v, analysis: a };
}
