/**
 * **桌面端 E2E「真跑承重」的判据库**（纯函数 · 零依赖 · 不碰文件系统）
 * ============================================================================
 *
 * ## 它守什么
 *
 * 「仓里有这个测试文件」**不等于**「它被跑过」⇒ ⇒ 覆盖率故事里那一片是**空头**。
 *
 * ⚠️ **2026-11-11 真跑级实测（本仓 iBLOC/shadow）**：
 *   · Playwright 族 **26 个规格**，CI 的 `playwright test` 命令**只点名 4 个**
 *     ⇒ ⇒ **22 个规格一次都没在 CI 里跑过**（它们的断言从未被执行）；
 *   · wdio 族 **4 个文件** ＋ tauri-e2e 族 **6 个文件** ＋ 旧 e2e-tests 族 **3 个文件**
 *     ⇒ ⇒ CI 里**一次都没跑过**（只有 E2E Typecheck 给它们做**类型**检查
 *     ⇒ ⇒ 「类型对了」≠「跑过了」）。
 *
 * ⇒ ⇒ 所以本库只做一件事：**把「谁真被跑过」从一句口号变成一份可核对的清单**。
 *
 * ## 三层读数（**不判红**，但要看得见）
 *
 *   · 每个家族：文件数 ｜ CI 覆盖数 ｜ 未覆盖数（其中 已登记 ｜ 未登记）
 *   ⇒ ⇒ 只给一个总数 ⇒ ⇒ 读者无法分辨「哪些是真的」⇒ ⇒ 要分层。
 *
 * ## 红线（**判红**，在闸那一层）
 *
 *   **C1 · 未登记的漏跑** —— 一个 E2E 文件既没被 CI 跑到、也没登记进债清单
 *     ⇒ ⇒ 隐形债悄悄长出来了 ⇒ ⇒ 判红。
 *   **C2 · 过期登记** —— 债清单里的文件**已经不存在**（被删 / 被改名）
 *     ⇒ ⇒ 清单不许过期 ⇒ ⇒ 判红（要销账）。
 *   **C3 · 已销账却没销** —— 债清单里的文件**现在被 CI 跑到了**
 *     ⇒ ⇒ 债已经还了 ⇒ ⇒ 判红（清单要销账）。
 *   **C4 · CI 点名了不存在的规格** —— CI 的过滤参数**对不上任何规格文件**
 *     ⇒ ⇒ 「跑过了」这句话**判不了** ⇒ ⇒ 退出码 2（不许伪装成绿）。
 *   **C5 · 尺子与被测物不一致** —— 静态算出来的覆盖集与 Playwright 自己
 *     `--list` 的读数**对不上** ⇒ ⇒ 尺子漂了 ⇒ ⇒ 判红。
 *
 * ## ⚠️ 覆盖集是**怎么算出来的**（不是猜的）
 *
 *   · Playwright 族：CI 的 `playwright test` 命令行里**位置参数**（不带 `-` 的那些）
 *     就是**文件名主干**（`e2e-conversation-flow` ⇒ `e2e-conversation-flow.spec.ts`）
 *     ⇒ ⇒ 本库按「主干 ⇒ 文件」映射，**对不上就是判不了**（C4），绝不猜。
 *   · 其余家族：CI 里**有没有调用该家族的 runner**（`wdio run` / `test:wdio` /
 *     `test:tauri` / `test:e2e`）⇒ ⇒ 调了 ⇒ ⇒ 整族算覆盖；
 *     若那次调用**用 `--spec` 收窄了** ⇒ ⇒ 只能覆盖一部分 ⇒ ⇒ **判不了**（C4）。
 *
 * ## 防假绿
 *
 *   · 判据自检（**孪生成对**）⇒ ⇒ 证明尺子**有牙**且**不恒红**；
 *   · 一个家族目录都没读到 ⇒ ⇒ 退出码 2（不是 0）。
 */

/** 四个 E2E 家族（**相对 `shadow-desktop/`** 的路径）。 */
export const FAMILIES = [
  {
    id: 'playwright',
    label: 'Playwright 规格',
    dir: 'tests/e2e-ui',
    ext: '.spec.ts',
    runner: 'playwright',
  },
  {
    id: 'wdio',
    label: 'wdio 套件',
    dir: 'tests/wdio',
    ext: '.test.ts',
    runner: 'wdio',
  },
  {
    id: 'tauri-e2e',
    label: 'tauri-e2e 套件',
    dir: 'tests/tauri-e2e',
    ext: '.test.ts',
    runner: 'wdio',
  },
  {
    id: 'e2e-tests',
    label: '旧 e2e-tests 套件',
    dir: 'e2e-tests/specs',
    ext: '.e2e.js',
    runner: 'wdio',
  },
];

/** Playwright / wdio 的 CLI 里**会带值**的开关（值不能被当成文件名）。 */
const VALUE_FLAGS = new Set([
  '--reporter',
  '--project',
  '--grep',
  '--grep-invert',
  '--config',
  '--output',
  '--timeout',
  '--workers',
  '--retries',
  '--shard',
  '--max-failures',
  '--repeat-each',
  '--update-snapshots',
  '--last-failed',
  '--ui',
]);

/**
 * 把一段 `run:` 正文切成**逻辑命令**（行尾 `\` 是续行）。
 *
 * ⚠️ 为什么必须做：CI 那条命令是跨三行的
 *   （`pnpm exec playwright test --reporter=github \` ＋ 三个名字 ＋ `> "$OUT"`）
 *   ⇒ ⇒ 不接续行 ⇒ ⇒ 只能看到第一个名字 ⇒ ⇒ **漏判 3 个规格**（假绿）。
 */
export function logicalCommands(runText) {
  const lines = String(runText || '').split(/\r?\n/);
  const out = [];
  let buf = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    const continued = line.endsWith('\\');
    const piece = continued ? line.slice(0, -1).trim() : line;
    buf = buf ? buf + ' ' + piece : piece;
    if (!continued) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * 从 `run:` 正文里取出 `playwright test` 的**位置参数**。
 *
 * ⚠️ 只取**位置参数**（不带 `-` 的）⇒ ⇒ `--reporter=github` 这类开关不算。
 * ⚠️ 遇到 shell 重定向 / 变量就**停** ⇒ ⇒ `> "$OUT" 2>&1` 不该被当成文件名。
 */
export function parsePlaywrightArgs(runText) {
  const args = [];
  for (const cmd of logicalCommands(runText)) {
    const m = /playwright\s+test\b(.*)$/.exec(cmd);
    if (!m) continue;
    const tokens = m[1].split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok) continue;
      if (tok === '>' || tok === '>>' || tok === '|' || tok === '&&' || tok === ';' || tok === '2>&1') break;
      if (tok.startsWith('-')) {
        if (!tok.includes('=') && VALUE_FLAGS.has(tok)) i += 1;
        continue;
      }
      if (tok.includes('$')) break;
      args.push(tok.replace(/^["']/, '').replace(/["']$/, ''));
    }
  }
  return args;
}

/**
 * 判定 CI 里**有没有跑某个家族**，以及那次调用**是不是收窄过的**。
 *
 * @param {string[]} runTexts 全部 workflow 的 `run:` 正文
 * @returns {{families: Set<string>, narrowed: Set<string>}}
 */
export function detectRunnerFamilies(runTexts) {
  const families = new Set();
  const narrowed = new Set();
  const all = Array.isArray(runTexts) ? runTexts.join('\n') : String(runTexts || '');

  const note = (family, isNarrowed) => {
    families.add(family);
    if (isNarrowed) narrowed.add(family);
  };

  if (/\bwdio\s+run\b/.test(all)) {
    // `wdio run <config>` —— 按 config 路径判它跑的是哪一族。
    if (/wdio\.conf\.tauri\.ts/.test(all)) note('tauri-e2e', /--spec\b/.test(all));
    if (/tests\/wdio\/|wdio\.conf\.ts/.test(all)) note('wdio', /--spec\b/.test(all));
    if (/e2e-tests|wdio\.conf\.js/.test(all)) note('e2e-tests', /--spec\b/.test(all));
  }
  if (/\btest:wdio\b/.test(all)) note('wdio', /test:wdio:[a-z-]+\b/.test(all));
  if (/\btest:tauri\b/.test(all)) note('tauri-e2e', /test:tauri:(spec|headed|reuse)\b/.test(all));
  if (/\btest:e2e\b/.test(all)) note('e2e-tests', false);

  return { families, narrowed };
}

/**
 * 由「CI 点名的规格主干」算出 Playwright 族的覆盖集。
 *
 * @param {string[]} stems CI 点名的规格主干
 * @param {string[]} inventory 该族在盘上的文件（相对 `shadow-desktop/`）
 * @returns {{covered: string[], unresolved: string[]}}
 */
export function resolvePlaywrightCoverage(stems, inventory) {
  const covered = [];
  const unresolved = [];
  for (const stem of stems) {
    const hit = inventory.filter((f) => f.endsWith('/' + stem + '.spec.ts'));
    if (hit.length === 1) covered.push(hit[0]);
    else if (hit.length === 0) unresolved.push(stem);
    else covered.push(...hit);
  }
  return { covered, unresolved };
}

/**
 * 比对「静态推导」与「被测物自己（playwright --list）」的覆盖集。
 *
 * 为什么要这一格（2026-11-11 实测）：Playwright 的 CLI 过滤参数是
 * 正则（实测：conversation 会同时命中 conversation-chat.spec.ts 与
 * conversation.spec.ts）⇒ ⇒ 而本库静态推导走「主干 ⇒ 唯一文件」
 * ⇒ ⇒ 两者会漂移 ⇒ ⇒ 谁对谁错判不了 ⇒ ⇒ 只能拿被测物自己的读数校。
 *
 * @param {string[]} staticFiles 静态推导出的文件（相对 shadow-desktop/）
 * @param {string[]} liveFiles   playwright --list 报出的文件（basename）
 * @returns {string[]} 漂移的文件名（空数组 ⇒ ⇒ 两把尺子一致）
 */
export function compareScale(staticFiles, liveFiles) {
  const staticSet = new Set((staticFiles || []).map((f) => String(f).split('/').pop()));
  const liveSet = new Set(liveFiles || []);
  const drift = [];
  for (const f of staticSet) if (!liveSet.has(f)) drift.push(f);
  for (const f of liveSet) if (!staticSet.has(f)) drift.push(f);
  return drift;
}

/**
 * 债清单的一条登记能不能覆盖某个文件。
 *
 * 只认逐文件的 entry.file —— 不许支持整族 pattern（那会让新加的文件
 * 自动被盖住 => 新增即红失效 => 债在悄悄长大而没人看见）。
 */
export function ledgerMatches(entry, file) {
  if (!entry || typeof entry.file !== 'string') return false;
  return entry.file === file;
}

/**
 * 对账：**覆盖集** × **债清单** × **在盘文件** ⇒ ⇒ 违例 + 分层读数。
 *
 * @param {object} input
 *   { inventory: Map<string, string[]>, covered: Map<string, string[]>,
 *     ledger: Array, unresolvedStems: string[] }
 */
export function evaluateLedger(input) {
  const inventory = input.inventory || new Map();
  const covered = input.covered || new Map();
  const ledger = Array.isArray(input.ledger) ? input.ledger : [];
  const unresolvedStems = input.unresolvedStems || [];

  const violations = [];
  const readings = [];

  // C6 · 重复登记 —— 同一个文件登记了两遍 ⇒ ⇒ 清单不可信（且会掩盖「多写一遍」的笔误）
  const seenLedger = new Set();
  for (const entry of ledger) {
    const key = String(entry && entry.file);
    if (seenLedger.has(key)) {
      violations.push({
        kind: 'duplicate-ledger',
        family: (entry && entry.family) || '',
        file: key,
        message: '债清单里「' + key + '」登记了不止一次 ⇒ ⇒ 清单不可信 ⇒ ⇒ 要销掉重复的那条',
      });
    }
    seenLedger.add(key);
  }
  let coveredTotal = 0;
  let uncoveredTotal = 0;

  for (const family of FAMILIES) {
    const files = (inventory.get(family.id) || []).slice().sort();
    const cov = new Set(covered.get(family.id) || []);
    const uncovered = files.filter((f) => !cov.has(f));

    let registered = 0;
    let unregistered = 0;
    for (const file of uncovered) {
      const entries = ledger.filter((e) => ledgerMatches(e, file));
      if (entries.length > 0) registered += 1;
      else {
        unregistered += 1;
        violations.push({
          kind: 'unregistered-uncovered',
          family: family.id,
          file,
          message:
            '「' + family.label + '」的文件 ' + file +
            ' 既没被 CI 跑到、也没登记进债清单 ⇒ ⇒ **隐形债**（仓里有 ≠ 跑过）⇒ ⇒ 要么接进 CI，要么显式登记',
        });
      }
    }

    // 债清单里登记了、但现在**被 CI 跑到了** ⇒ ⇒ 债已还 ⇒ ⇒ 要销账。
    for (const entry of ledger) {
      const matched = files.filter((f) => ledgerMatches(entry, f));
      if (entry.family && entry.family !== family.id) continue;
      if (matched.length === 0) {
        violations.push({
          kind: 'stale-ledger',
          family: family.id,
          file: entry.file || entry.pattern,
          message:
            '债清单登记的「' + (entry.file || entry.pattern) + '」在盘上**对不上任何文件**了' +
            ' ⇒ ⇒ 登记过期 ⇒ ⇒ 要销账（清单不许过期）',
        });
        continue;
      }
      const nowCovered = matched.filter((f) => cov.has(f));
      if (nowCovered.length === matched.length) {
        violations.push({
          kind: 'covered-but-registered',
          family: family.id,
          file: entry.file || entry.pattern,
          message:
            '债清单登记的「' + (entry.file || entry.pattern) + '」**现在被 CI 跑到了**' +
            ' ⇒ ⇒ 债已经还了 ⇒ ⇒ 要销账',
        });
      }
    }

    coveredTotal += cov.size;
    uncoveredTotal += uncovered.length;
    readings.push({
      family: family.id,
      label: family.label,
      files: files.length,
      covered: cov.size,
      uncovered: uncovered.length,
      registered,
      unregistered,
    });
  }

  for (const stem of unresolvedStems) {
    violations.push({
      kind: 'unresolved-filter',
      family: 'playwright',
      file: stem,
      message:
        'CI 的 `playwright test` 点名了「' + stem + '」⇒ ⇒ 仓里**对不上任何规格文件**' +
        ' ⇒ ⇒ 「跑过了」这句话判不了 ⇒ ⇒ 改命令或改文件名',
    });
  }

  return { violations, readings, coveredTotal, uncoveredTotal };
}
