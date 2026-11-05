/**
 * 闸的治理闸 —— 判据库（纯函数 · 零依赖）
 * ============================================================================
 *
 * ## 病（2026-11-05 真机实测）
 *
 * 本仓有 **34 道闸**（scripts/check-*.mjs）⇒ ⇒ 但实测：
 *   · 只有 **14 道接进了 CI** ⇒ ⇒ 另外 **20 道「有闸但没人跑」**
 *     ⇒ ⇒ CI 一盏绿灯，什么都没证明；
 *   · 只有 **7 道**的自检印出**可数读数**（N/N）⇒ ⇒ 其余 27 道的读数
 *     **不可比**（看不出跑了多少条、过了多少条）；
 *   · **7 道根本没有 --self-test** ⇒ ⇒ 传了 --self-test 也只是跑一次
 *     正常检查 ⇒ ⇒ **恒绿的自检**（看着有自检，其实证明不了任何事）；
 *   · **3 道的自检退出码是 2**（判不了）⇒ ⇒ 它们在本机缺环境
 *     （cargo 工具链 / 兄弟仓在位）；
 *   · 只有 **24 道**有「退出码 2」这一档 ⇒ ⇒ 其余 10 道分不开
 *     「源没读全」与「真有问题」。
 *
 * ⇒ ⇒ 于是写这道闸：**闸也必须守纪律** ⇒ ⇒ 且纪律要**可执行**。
 *
 * ## 纪律（每条都有「正向会红」的孪生用例）
 *
 *   D1  no-self-test           闸必须支持 --self-test
 *   D2  self-test-broken       闸的 --self-test 必须绿（红 = 闸自己坏了）
 *   D3  no-reading-in-wired    接进 CI 的闸，自检必须印出可数读数（N/N）
 *   D4  not-wired-into-ci      闸必须接进 .github/workflows/ci.yml
 *   D5  no-cannot-judge-exit   闸必须能以退出码 2 表达「判不了」
 *
 * ⚠️ **D2 的退出码 2 不判红**：那是「本机判不了」（环境缺），不是纪律违规
 * ⇒ ⇒ 它会被**显式报出来**（⚠ 行）⇒ ⇒ 但不进退出码 ⇒ ⇒
 * 这样同一份债清单在**本机与 CI 两边都对得上**（不因环境漂移）。
 *
 * ## 为什么 D3 只管「接进 CI 的那些」
 *
 * 行为类判据（跑别的闸 ⇒ 看它的输出）**依赖环境** ⇒ ⇒ 若对全部 34 道
 * 都硬判 ⇒ ⇒ 本机与 CI 的结论会不一致 ⇒ ⇒ 债清单就没法对账
 * ⇒ ⇒ 所以：**行为类只对「CI 已经在跑的那些闸」生效**（CI 跑它们 ⇒
 * 它们的工具链必然在位 ⇒ ⇒ 自检必须绿、必须有可数读数）。
 */

import { scanYamlText } from './yaml-valid.mjs';

export const RULES = {
  'no-self-test': '闸必须支持 --self-test ⇒ ⇒ 否则它证明不了自己会红',
  'self-test-broken': '闸的 --self-test 必须绿 ⇒ ⇒ 红了就是「闸自己坏了」',
  'no-reading-in-wired': '接进 CI 的闸，其自检必须印出可数读数（N/N）⇒ ⇒ 否则「读数不可比」',
  'not-wired-into-ci': '闸必须接进 .github/workflows/ci.yml ⇒ ⇒ 否则「有闸但没人跑」',
  'no-cannot-judge-exit': '闸必须能以退出码 2 表达「判不了」⇒ ⇒ 否则「源没读全」与「真有问题」分不开',
};

/** 闸名：check-foo-bar.mjs ⇒ foo-bar */
export function gateNameFromFile(file) {
  return String(file).replace(/^check-/, '').replace(/\.mjs$/, '');
}

/**
 * 源码形状（认形状不认关键词）：
 *  · 有没有 --self-test 这个开关；
 *  · 有没有「退出码 2」的调用点（exit(2)）。
 */
export function sourceShape(source) {
  const text = String(source || '');
  return {
    hasSelfTestFlag: text.includes('--self-test'),
    hasCannotJudgeExit: /exit\(2\)/.test(text) || exitCanReachTwo(text),
  };
}

/**
 * 「2 能不能到达 exit」—— 比「字面 exit(2)」更准的形状。
 *
 * ⚠️ 为什么需要它（2026-11-05 逐条实测）：有的闸写成 `process.exit(main())`
 *    ⇒ ⇒ 而 main() 里 `return 2` ⇒ ⇒ **它确实能以退出码 2 表达「判不了」**
 *    ⇒ ⇒ 而只看字面 `exit(2)` 会把它误判成「没有那一档」
 *    ⇒ ⇒ 债清单里就多了一条**假债**（实测 8 条 D5 债里有 2 条是这种）。
 *
 * ⚠️ 判法是**保守**的：只在「exit 的参数是某个**函数名**」且
 *    「那个函数在本文件里确实 `return 2`」时才认 ⇒ ⇒ 认不准就继续报
 *    ⇒ ⇒ **宁可多报一条债，也不假绿**。
 */
function exitCanReachTwo(text) {
  const re = /exit\(\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = functionBody(text, m[1]);
    if (body && /\breturn\s+2\b/.test(body)) return true;
  }
  return false;
}

/**
 * 取某个具名函数的函数体 ⇒ ⇒ 找不到就返回 null。
 *
 * ⚠️ **必须跳过字符串与注释再配平花括号**（2026-11-05 实测踩到）：
 *    朴素的计数会被**字符串里的花括号**带偏 ⇒ ⇒ 函数体提前截断 ⇒ ⇒
 *    里面的 `return 2` 看不见 ⇒ ⇒ 把「有那一档」误判成「没有」⇒ ⇒ 假债。
 */
function functionBody(text, name) {
  const at = text.search(new RegExp('function\\s+' + name + '\\s*\\('));
  if (at < 0) return null;
  const open = text.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      if (nl < 0) break;
      i = nl;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** 从 ci.yml 里取出所有 step 的 run 正文（用自家 YAML 闸的解析器 ⇒ 狗粮）。 */
export function extractCiRunTexts(ciText) {
  const doc = scanYamlText(String(ciText || ''), { workflow: true }).doc;
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'map') {
      for (const entry of node.entries) {
        if (entry.key === 'run' && entry.value && entry.value.type === 'scalar') {
          out.push(String(entry.value.value));
        } else if (entry.key === 'run' && entry.value && entry.value.type === 'block-scalar') {
          out.push(String(entry.value.value));
        }
        walk(entry.value);
      }
      return;
    }
    if (node.type === 'seq') {
      for (const item of node.items) walk(item.node);
    }
  };
  walk(doc);
  return out;
}

/** ci.yml 里被调用的闸名集合（认「scripts/check-<name>.mjs」这个形状）。 */
export function wiredGateNames(ciText) {
  const texts = extractCiRunTexts(ciText).join('\n');
  const names = new Set();
  const re = /scripts\/check-([a-z0-9][a-z0-9-]*)\.mjs/g;
  let m = re.exec(texts);
  while (m) {
    names.add(m[1]);
    m = re.exec(texts);
  }
  return names;
}

/** 输出里有没有可数读数（N/N）⇒ ⇒ 返回 {passed, total} 或 null。 */
export function countReading(output) {
  const m = String(output || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { passed: Number(m[1]), total: Number(m[2]) };
}

/**
 * 判一道闸。
 * @param {object} facts
 *   { name, hasSelfTestFlag, hasCannotJudgeExit, wired, selfTestExit, selfTestOutput }
 * @param {{behaviorScope?: 'wired'|'all'}} [options]
 * @returns {{findings: object[], statuses: object[]}}
 */
export function classifyGate(facts, options) {
  const opts = options || {};
  const scope = opts.behaviorScope || 'wired';
  const findings = [];
  const statuses = [];
  const name = facts.name;

  const push = (kind, message, extra) => {
    const f = { kind, gate: name, message };
    if (extra) Object.assign(f, extra);
    findings.push(f);
  };

  if (!facts.hasSelfTestFlag) {
    push('no-self-test', '闸「' + name + '」没有 --self-test ⇒ ⇒ 它证明不了自己会红');
  }
  if (!facts.wired) {
    push(
      'not-wired-into-ci',
      '闸「' + name + '」没有接进 .github/workflows/ci.yml ⇒ ⇒ 有闸但没人跑',
    );
  }
  if (!facts.hasCannotJudgeExit) {
    push(
      'no-cannot-judge-exit',
      '闸「' + name + '」没有退出码 2 的调用点 ⇒ ⇒ 分不开「源没读全」与「真有问题」',
    );
  }

  const inBehaviorScope = scope === 'all' || facts.wired;
  if (inBehaviorScope && facts.selfTestExit !== null && facts.selfTestExit !== undefined) {
    if (facts.selfTestExit === 0) {
      const reading = countReading(facts.selfTestOutput);
      if (!reading) {
        push(
          'no-reading-in-wired',
          '闸「' + name + '」的自检没印可数读数（N/N）⇒ ⇒ 读数不可比',
        );
      }
    } else if (facts.selfTestExit === 2) {
      statuses.push({
        gate: name,
        status: 'cannot-judge',
        message: '闸「' + name + '」的自检退出码 2 ⇒ ⇒ 本机判不了（环境缺）⇒ ⇒ 不算纪律违规',
      });
    } else {
      push(
        'self-test-broken',
        '闸「' + name + '」的 --self-test 退出码 ' + facts.selfTestExit + ' ⇒ ⇒ 闸自己坏了',
        { exitCode: facts.selfTestExit },
      );
    }
  }

  return { findings, statuses };
}

/**
 * 债对账：实测的缺口集合必须与登记的**精确一致**。
 *   · 实测有、登记没有 ⇒ ⇒ **新增即错**（不许登记成存量债 ⇒ ⇒ 直接红）
 *   · 登记有、实测没有 ⇒ ⇒ **过期**（那条已经修好 ⇒ ⇒ 要销账 ⇒ ⇒ 红）
 */
/**
 * 把实测缺口分成「登记在册（放行，但仍然打印）」与「没登记（红）」。
 * ⚠️ 这就是「存量债」纪律的落点：**放行 ≠ 看不见** ⇒ ⇒ 存量缺口照样打印，
 *    只是不把闸判红 ⇒ ⇒ 而**没登记的新缺口**直接红（不许悄悄长出来）。
 */
/**
 * 闸的自检**判不了**的那些闸 ⇒ ⇒ 它们的缺口「这轮没出现」**不能**当成
 * 「缺口已修好」⇒ ⇒ **不许据此销账**。
 *
 * ⚠️ 为什么（2026-11-05 真 CI 实测 run 42002098658）：ps1-portability 在
 *    ubuntu runner 上自检退出码 2（没有 powershell.exe ⇒ ⇒ 判不了）⇒ ⇒ 按
 *    D2 规则它**不产生**「自检不印可数读数」那个缺口 ⇒ ⇒ 而本机（Windows）
 *    它退出 0 且确实不印 ⇒ ⇒ 那个缺口**本机存在、CI 上不存在**⇒ ⇒
 *    「清单不许过期」的销账判据把它判成 stale ⇒ ⇒ **真 CI 上元闸红**。
 * ⇒ ⇒ 根因不是「债清单过期」，而是**销账判据没有尊重「判不了」**
 *    ⇒ ⇒ 「判不了 ≠ 没问题」这条原则必须**同时**用在**判定**与**销账**两处。
 *
 * @param {Array<{gate:string, measured?:boolean, selfTestExit?:number|string}>} inventory
 * @returns {string[]} 判不了的闸名
 */
export function unjudgedGates(inventory) {
  const out = [];
  for (const row of inventory || []) {
    if (!row || !row.measured) continue;
    if (row.selfTestExit === 2 || row.selfTestExit === 'TIMEOUT') out.push(row.gate);
  }
  return out;
}

export function splitDebt(findings, registered, opts) {
  const reg = registered || {};
  const tolerated = [];
  const unregistered = [];
  for (const f of findings) {
    const entry = reg[f.kind];
    if (entry && Array.isArray(entry.gates) && entry.gates.includes(f.gate)) {
      tolerated.push(f);
    } else {
      unregistered.push(f);
    }
  }
  const cmp = compareDebt(findings, reg, opts);
  return {
    tolerated,
    unregistered,
    stale: cmp.stale,
    missing: cmp.missing,
    skippedStale: cmp.skippedStale,
  };
}

export function compareDebt(findings, registered, opts) {
  const actual = new Map();
  for (const f of findings) {
    if (!actual.has(f.kind)) actual.set(f.kind, new Set());
    actual.get(f.kind).add(f.gate);
  }
  const stale = [];
  const missing = [];
  const skippedStale = [];
  const unjudged = new Set((opts && opts.unjudgedGates) || []);
  const kinds = new Set([...actual.keys(), ...Object.keys(registered || {})]);
  for (const kind of kinds) {
    const got = actual.get(kind) || new Set();
    const want = new Set((registered && registered[kind] && registered[kind].gates) || []);
    for (const gate of want) {
      if (got.has(gate)) continue;
      // ⚠️「判不了 ≠ 没问题」必须**同时**用在判定与销账两处 ⇒ ⇒
      //    闸的自检**判不了**（退出码 2 / 超时）⇒ ⇒ 它的缺口这轮「没出现」
      //    **不能**当成「缺口已修好」⇒ ⇒ 不销账（只记 skippedStale 并打印）。
      if (unjudged.has(gate)) {
        skippedStale.push({ kind, gate });
        continue;
      }
      stale.push({ kind, gate });
    }
    for (const gate of got) {
      if (!want.has(gate)) missing.push({ kind, gate });
    }
  }
  return { stale, missing, skippedStale };
}
