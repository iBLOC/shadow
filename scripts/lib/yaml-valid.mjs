/**
 * YAML 合法性判据库（纯函数 · 零依赖）
 * ============================================================================
 *
 * ## 为什么自己写，不直接用现成解析器
 *
 * 仓内闸的约定是「纯 Node、零依赖」⇒ ⇒ CI runner 不保证有 pip / npm 包在位。
 * 所以这里实现一套**保守**的扫描器：只报**确定**是错的地方，不猜语义
 * （能还原「键 → 值 → 嵌套结构」，但不做类型推断、不做锚点 / 别名 / 多文档解析）。
 *
 * 真正的**交叉验证**在 CLI 层：若环境里正好有真解析器（PyYAML / npm yaml），
 * 就把同一批文件再喂给它 ⇒ ⇒ 两边结论必须一致（差分测试）⇒ ⇒
 * 扫描器不许自说自话 ⇒ ⇒ **判据自己假绿的那条路被堵死**。
 *
 * ## 判据（每条都有「正向会红」的自检用例）
 *
 *   Y1  plain-scalar-colon   纯量里出现「冒号 + 空格」⇒ ⇒ YAML 解析直接报错
 *                             「mapping values are not allowed here」
 *                             ⇒ ⇒ **2026-11-05 真实事故就是这个形状**：
 *                             step 名里带冒号却没加引号 ⇒ ⇒ 整个 workflow 起不来
 *   Y2  tab-indent            用 Tab 缩进 ⇒ ⇒ YAML 不允许
 *   Y3  duplicate-key         同一个映射里同名键重复（GitHub 直接报错）
 *   Y4  unbalanced-expression 表达式开合标记不配对
 *   Y5  unclosed-quote        引号不闭合
 *   Y6  no-key-separator      映射层出现没有「键:」的行
 *   Y7  unexpected-indent     缩进比同级多出来一截（错位）
 *   Y8  missing-on            workflow 顶层没有 on（GitHub 必报错）
 *   Y9  missing-jobs          workflow 顶层没有 jobs
 *   Y10 job-missing-runs-on   job 既没有 runs-on 也没有 uses
 *   Y11 job-missing-steps     job 有 runs-on 却没有 steps
 *   Y12 step-missing-action   step 既没有 uses 也没有 run
 *   Y13 step-both-actions     step 同时有 uses 和 run（GitHub 不允许）
 *
 * ## 为什么 Y1 只在「纯量」上报
 *
 * 冒号 + 空格在 YAML 里只有三种合法去处：
 *   · 键与值之间的分隔（已被 findKeySeparator 消费掉）
 *   · 引号里面（quote-aware 扫描会跳过）
 *   · 流式集合 {a: b} / [a: b] 里面（flow，不在纯量路径上）
 * 其余任何位置出现 ⇒ ⇒ 就是「mapping values are not allowed here」。
 */

export const EXPR_OPEN = '$' + '{{';
export const EXPR_CLOSE = '}}';

/** 判「这是不是语法级错误」的一组（要与外部解析器的结论对齐 ⇒ 差分测试用）。 */
export const SYNTAX_KINDS = new Set([
  'plain-scalar-colon',
  'tab-indent',
  'unclosed-quote',
  'no-key-separator',
  'unexpected-indent',
]);

export function isBlankLine(line) {
  return line.trim().length === 0;
}

export function isCommentLine(line) {
  return line.trimStart().startsWith('#');
}

/** 前导缩进：空格数 + 有没有 Tab（Tab 出现在缩进里 ⇒ YAML 硬错）。 */
export function leadingIndent(line) {
  let spaces = 0;
  let tab = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') {
      spaces += 1;
      continue;
    }
    if (ch === '\t') {
      tab = true;
      continue;
    }
    break;
  }
  return { indent: spaces, tab };
}

/**
 * 找出这一行的「键 : 值」分隔位置（quote-aware · flow-aware）。
 * 返回 -1 表示这一行没有键（整行是注释 / 是纯量 / 是序列项的标量）。
 */
export function findKeySeparator(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t')) return -1;
    if (ch === '[' || ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === ']' || ch === '}') {
      depth -= 1;
      continue;
    }
    if (ch === ':' && depth === 0) {
      const next = text[i + 1];
      if (next === undefined || next === ' ' || next === '\t') return i;
    }
  }
  return -1;
}

/** 去掉行尾注释（quote-aware：引号里的 # 不算注释）。 */
export function stripInlineComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t')) {
      return text.slice(0, i);
    }
  }
  return text;
}

/** 纯量里第一个「冒号 + 空格」的位置；-1 表示没有。 */
export function findPlainScalarColon(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':') {
      const next = value[i + 1];
      if (next === undefined || next === ' ' || next === '\t') return i;
    }
  }
  return -1;
}

/** 值的形态：empty / block / quoted / flow / anchor / plain。 */
export function classifyValue(rawValue) {
  const v = rawValue.trim();
  if (v === '') return { kind: 'empty' };
  if (v.startsWith('|') || v.startsWith('>')) return { kind: 'block' };
  if (v.startsWith('"') || v.startsWith("'")) return { kind: 'quoted' };
  if (v.startsWith('[') || v.startsWith('{')) return { kind: 'flow' };
  if (v.startsWith('&') || v.startsWith('*') || v.startsWith('!')) return { kind: 'anchor' };
  return { kind: 'plain' };
}

/** 引号闭合了吗（只看这一行的值部分）。 */
export function quoteBalanced(value) {
  const first = value[0];
  if (first !== '"' && first !== "'") return true;
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
        if (i === value.length - 1) return true;
      }
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
  }
  return quote === null;
}

/** 去掉键外面的引号。 */
export function unquoteKey(key) {
  const k = key.trim();
  if (k.length >= 2 && (k[0] === '"' || k[0] === "'") && k[k.length - 1] === k[0]) {
    return k.slice(1, -1);
  }
  return k;
}

/**
 * 数 GitHub 表达式的开合。
 * ⚠️ **只有「美元 + 双花括号」才算开标记** ⇒ ⇒ 别的模板语法
 * （docker metadata-action 的 {{is_default_branch}} 之类）里的双花括号
 * **不算** ⇒ ⇒ 否则会把「多了两个闭标记」误判成「表达式不配对」
 * （2026-11-05 实测踩到：hengjian/docker.yml 因此假红）。
 */
export function scanExpressions(text) {
  let pending = 0;
  let matched = 0;
  let pos = 0;
  for (;;) {
    const openAt = text.indexOf(EXPR_OPEN, pos);
    const closeAt = text.indexOf(EXPR_CLOSE, pos);
    if (openAt === -1 && closeAt === -1) break;
    if (openAt !== -1 && (closeAt === -1 || openAt < closeAt)) {
      pending += 1;
      pos = openAt + EXPR_OPEN.length;
      continue;
    }
    if (pending > 0) {
      pending -= 1;
      matched += 1;
    }
    pos = closeAt + EXPR_CLOSE.length;
  }
  return { matched, unclosed: pending };
}

function countOccurrences(text, needle) {
  let count = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return count;
}

function mkFinding(kind, line, message, extra) {
  const f = { kind, line, message };
  if (extra) Object.assign(f, extra);
  return f;
}

/** 跳过块标量（竖线 / 大于号）的内容行。 */
function skipBlockContent(lines, i, parentIndent) {
  while (i < lines.length) {
    if (isBlankLine(lines[i])) {
      i += 1;
      continue;
    }
    const ind = leadingIndent(lines[i]);
    if (ind.indent <= parentIndent) break;
    i += 1;
  }
  return i;
}

function nextSignificantLine(lines, i) {
  let j = i;
  while (j < lines.length && (isBlankLine(lines[j]) || isCommentLine(lines[j]))) j += 1;
  return j;
}

/**
 * 解析一个子块：可能是更深的映射、可能是与父键同缩进的序列（YAML 允许）。
 */
function parseChildBlock(lines, i, parentIndent, path, ctx) {
  const j = nextSignificantLine(lines, i);
  if (j >= lines.length) return null;
  const ind = leadingIndent(lines[j]);
  if (ind.tab) ctx.findings.push(mkFinding('tab-indent', j + 1, '缩进里出现 Tab（YAML 不允许）'));
  const content = lines[j].trimStart();
  const isSeqItem = content.startsWith('- ') || content === '-';
  if (ind.indent > parentIndent) {
    return parseNode(lines, j, parentIndent + 1, path, ctx);
  }
  if (ind.indent === parentIndent && isSeqItem) {
    return parseSequence(lines, j, parentIndent, path, ctx);
  }
  return null;
}

/**
 * 解析一个映射块。
 * pending：序列项本身就是一个映射（形如「- name: x」）⇒ ⇒ 第一个条目来自
 * 虚拟文本，不占源文件的一行（源行就是那一行「- name: x」）。
 */
function parseMapping(lines, i, indent, path, ctx, pending) {
  const map = { type: 'map', path, entries: [] };
  const seen = new Map();
  let first = pending || null;

  for (;;) {
    let text;
    let lineNo;

    if (first) {
      text = first.text;
      lineNo = first.lineNo;
      first = null;
    } else {
      const j = nextSignificantLine(lines, i);
      if (j >= lines.length) {
        i = j;
        break;
      }
      const ind = leadingIndent(lines[j]);
      if (ind.tab) {
        ctx.findings.push(mkFinding('tab-indent', j + 1, '缩进里出现 Tab（YAML 不允许）'));
      }
      if (ind.indent < indent) {
        i = j;
        break;
      }
      if (ind.indent > indent) {
        ctx.findings.push(
          mkFinding('unexpected-indent', j + 1, '缩进比同级多出来一截（结构错位）', {
            indent: ind.indent,
            expected: indent,
          }),
        );
        let k = j;
        while (k < lines.length) {
          if (isBlankLine(lines[k]) || isCommentLine(lines[k])) {
            k += 1;
            continue;
          }
          const ki = leadingIndent(lines[k]);
          if (ki.indent > indent) {
            k += 1;
            continue;
          }
          break;
        }
        i = k;
        continue;
      }
      const content = lines[j].trimStart();
      if (content.startsWith('- ') || content === '-') {
        i = j;
        break;
      }
      text = content;
      lineNo = j + 1;
      i = j + 1;
    }

    const sep = findKeySeparator(text);
    if (sep < 0) {
      ctx.findings.push(
        mkFinding('no-key-separator', lineNo, '这一行在映射层却没有「键:」', { text }),
      );
      continue;
    }

    const key = unquoteKey(text.slice(0, sep));
    const rawValue = text.slice(sep + 1);
    const valueText = stripInlineComment(rawValue).trim();

    if (seen.has(key)) {
      ctx.findings.push(
        mkFinding('duplicate-key', lineNo, '同一个映射里同名键重复：' + key, {
          key,
          firstLine: seen.get(key),
        }),
      );
    } else {
      seen.set(key, lineNo);
    }

    const value = classifyValue(valueText);
    if (value.kind === 'plain') {
      const at = findPlainScalarColon(valueText);
      if (at >= 0) {
        ctx.findings.push(
          mkFinding(
            'plain-scalar-colon',
            lineNo,
            '纯量里出现「冒号 + 空格」⇒ YAML 解析报错「mapping values are not allowed here」',
            { key, value: valueText },
          ),
        );
      }
    } else if (value.kind === 'quoted') {
      if (!quoteBalanced(valueText)) {
        ctx.findings.push(mkFinding('unclosed-quote', lineNo, '引号不闭合', { key }));
      }
    }

    const entry = { key, line: lineNo, value: null };
    map.entries.push(entry);

    if (value.kind === 'empty') {
      const child = parseChildBlock(lines, i, indent, path.concat([key]), ctx);
      if (child) {
        entry.value = child.node;
        i = child.next;
      }
    } else if (value.kind === 'block') {
      i = skipBlockContent(lines, i, indent);
    }
  }

  return { node: map, next: i };
}

/** 解析一个序列块。 */
function parseSequence(lines, i, indent, path, ctx) {
  const seq = { type: 'seq', path, items: [] };
  let idx = 0;

  for (;;) {
    const j = nextSignificantLine(lines, i);
    if (j >= lines.length) {
      i = j;
      break;
    }
    const ind = leadingIndent(lines[j]);
    if (ind.tab) {
      ctx.findings.push(mkFinding('tab-indent', j + 1, '缩进里出现 Tab（YAML 不允许）'));
    }
    if (ind.indent < indent) {
      i = j;
      break;
    }
    if (ind.indent > indent) {
      ctx.findings.push(
        mkFinding('unexpected-indent', j + 1, '缩进比同级多出来一截（结构错位）', {
          indent: ind.indent,
          expected: indent,
        }),
      );
      let k = j;
      while (k < lines.length) {
        if (isBlankLine(lines[k]) || isCommentLine(lines[k])) {
          k += 1;
          continue;
        }
        const ki = leadingIndent(lines[k]);
        if (ki.indent > indent) {
          k += 1;
          continue;
        }
        break;
      }
      i = k;
      continue;
    }
    const content = lines[j].trimStart();
    if (!(content.startsWith('- ') || content === '-')) {
      i = j;
      break;
    }

    const dashLine = j + 1;
    const afterDash = content.slice(1);
    const rest = afterDash.trimStart();
    const spaces = afterDash.length - rest.length;
    const contentIndent = indent + 1 + spaces;

    if (rest === '') {
      i = j + 1;
      const child = parseChildBlock(lines, i, indent, path.concat(['#' + idx]), ctx);
      seq.items.push({ index: idx, line: dashLine, node: child ? child.node : null });
      if (child) i = child.next;
    } else if (findKeySeparator(rest) >= 0) {
      const child = parseMapping(
        lines,
        j + 1,
        contentIndent,
        path.concat(['#' + idx]),
        ctx,
        { text: rest, lineNo: dashLine },
      );
      seq.items.push({ index: idx, line: dashLine, node: child.node });
      i = child.next;
    } else {
      seq.items.push({
        index: idx,
        line: dashLine,
        node: { type: 'scalar', value: stripInlineComment(rest).trim() },
      });
      i = j + 1;
    }
    idx += 1;
  }

  return { node: seq, next: i };
}

/** 解析任意一个节点（映射 / 序列）。 */
function parseNode(lines, i, minIndent, path, ctx) {
  const j = nextSignificantLine(lines, i);
  if (j >= lines.length) return { node: null, next: j };
  const ind = leadingIndent(lines[j]);
  if (ind.indent < minIndent) return { node: null, next: j };
  const content = lines[j].trimStart();
  if (content.startsWith('- ') || content === '-') {
    return parseSequence(lines, j, ind.indent, path, ctx);
  }
  return parseMapping(lines, j, ind.indent, path, ctx, null);
}

function mapKeys(node) {
  if (!node || node.type !== 'map') return new Set();
  return new Set(node.entries.map((e) => e.key));
}

/** workflow 形状检查（GH Actions 的硬性要求）。 */
export function checkWorkflowShape(doc, findings) {
  if (!doc || doc.type !== 'map') {
    findings.push(mkFinding('missing-jobs', 1, 'workflow 顶层不是映射（GitHub 无法识别）'));
    return;
  }
  const keys = mapKeys(doc);
  if (!keys.has('on')) {
    findings.push(mkFinding('missing-on', 1, 'workflow 顶层没有 on（GitHub 必报错）'));
  }
  if (!keys.has('jobs')) {
    findings.push(mkFinding('missing-jobs', 1, 'workflow 顶层没有 jobs（GitHub 必报错）'));
    return;
  }
  const jobsNode = doc.entries.find((e) => e.key === 'jobs');
  const jobs = jobsNode && jobsNode.value;
  if (!jobs || jobs.type !== 'map') return;
  for (const job of jobs.entries) {
    const jkeys = mapKeys(job.value);
    if (jkeys.has('uses')) continue; // 可复用 workflow 调用：不需要 runs-on / steps
    if (!jkeys.has('runs-on')) {
      findings.push(
        mkFinding('job-missing-runs-on', job.line, 'job「' + job.key + '」既没有 runs-on 也没有 uses', {
          job: job.key,
        }),
      );
    }
    if (!jkeys.has('steps')) {
      findings.push(
        mkFinding('job-missing-steps', job.line, 'job「' + job.key + '」有 runs-on 却没有 steps', {
          job: job.key,
        }),
      );
      continue;
    }
    const stepsEntry = job.value.entries.find((e) => e.key === 'steps');
    const steps = stepsEntry && stepsEntry.value;
    if (!steps || steps.type !== 'seq') continue;
    for (const item of steps.items) {
      const skeys = mapKeys(item.node);
      const hasUses = skeys.has('uses');
      const hasRun = skeys.has('run');
      if (!hasUses && !hasRun) {
        findings.push(
          mkFinding('step-missing-action', item.line, 'step 既没有 uses 也没有 run（GitHub 必报错）'),
        );
      }
      if (hasUses && hasRun) {
        findings.push(
          mkFinding('step-both-actions', item.line, 'step 同时有 uses 和 run（GitHub 不允许）'),
        );
      }
    }
  }
}

/**
 * 主入口：把一段 YAML 文本扫成「结构 + 违规清单」。
 * @param {string} text
 * @param {{workflow?: boolean}} [opts] workflow=true 时额外做 GH Actions 形状检查
 */
export function scanYamlText(text, opts) {
  const options = opts || {};
  const findings = [];
  const src = String(text);
  const lines = src.split(/\r?\n/);
  const ctx = { findings };

  const expr = scanExpressions(src);
  if (expr.unclosed > 0) {
    findings.push(
      mkFinding(
        'unbalanced-expression',
        0,
        '有 ' + expr.unclosed + ' 个表达式没有闭合（GitHub 会报 Unclosed expression）',
        { matched: expr.matched, unclosed: expr.unclosed },
      ),
    );
  }

  const parsed = parseNode(lines, 0, 0, [], ctx);
  const doc = parsed.node;

  if (options.workflow) {
    checkWorkflowShape(doc, findings);
  }

  return {
    findings,
    doc,
    stats: {
      lines: lines.length,
      expressions: expr.matched,
      maps: countNodes(doc, 'map'),
      sequences: countNodes(doc, 'seq'),
    },
  };
}

function countNodes(node, type) {
  if (!node) return 0;
  if (node.type === type) return 1;
  if (node.type === 'map') {
    return node.entries.reduce((acc, e) => acc + countNodes(e.value, type), 0);
  }
  if (node.type === 'seq') {
    return node.items.reduce((acc, it) => acc + countNodes(it.node, type), 0);
  }
  return 0;
}
