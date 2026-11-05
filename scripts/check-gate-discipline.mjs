#!/usr/bin/env node
/**
 * 闸的治理闸 —— 「**闸也必须守纪律**」
 * ============================================================================
 *
 * ## 病（2026-11-05 真机实测，34 道闸）
 *
 * 本仓有 **34 道闸**（scripts/check-*.mjs）⇒ ⇒ 实测：
 *   · 只有 **14 道接进了 CI** ⇒ ⇒ **20 道「有闸但没人跑」**；
 *   · 只有 **7 道**的自检印出**可数读数**（N/N）⇒ ⇒ 其余 27 道读数不可比；
 *   · **7 道根本没有 --self-test** ⇒ ⇒ 传了也只是跑一次正常检查
 *     ⇒ ⇒ **恒绿的自检**；
 *   · 只有 **24 道**有「退出码 2」这一档 ⇒ ⇒ 其余 10 道分不开
 *     「源没读全」与「真有问题」。
 *
 * ⇒ ⇒ 一盏绿的 CI，在**这 34 道闸**里只覆盖了 14 道 ⇒ ⇒ 绿灯说明不了什么。
 *
 * ## 纪律（五条）
 *
 *   D1 no-self-test          闸必须支持 --self-test
 *   D2 self-test-broken      闸的 --self-test 必须绿（红 = 闸自己坏了）
 *   D3 no-reading-in-wired   接进 CI 的闸，自检必须印出可数读数（N/N）
 *   D4 not-wired-into-ci     闸必须接进 .github/workflows/ci.yml
 *   D5 no-cannot-judge-exit  闸必须能以退出码 2 表达「判不了」
 *
 * ## 两条设计决定（都写清楚，免得后来人以为是漏洞）
 *
 * ① **自检退出码 2 不判红**：那是「本机判不了」（环境缺），不是纪律违规
 *    ⇒ ⇒ 它被**显式打印**（⚠ 行）⇒ ⇒ 但不进退出码 ⇒ ⇒
 *    这样同一份债清单在**本机与 CI 两边都对得上**。
 * ② **行为类判据只对「CI 已经在跑的那些闸」生效**（D2 / D3）：
 *    行为类要跑别的闸 ⇒ ⇒ 依赖环境 ⇒ ⇒ 若对全部 34 道都硬判 ⇒ ⇒
 *    本机与 CI 的结论会不一致 ⇒ ⇒ 债清单就没法对账。
 *
 * ## 存量债
 *
 * 历史闸大多不按今天的纪律写 ⇒ ⇒ 它们是**别的工作线**的、且多数需要
 * 本机工具链 ⇒ ⇒ 登记在 **scripts/lib/gate-discipline-registry.mjs**：
 *   · 登记在册 ⇒ ⇒ 放行（但仍然打印）；
 *   · **没登记的新缺口** ⇒ ⇒ 直接红（不许悄悄长出来）；
 *   · 登记了但缺口已不在 ⇒ ⇒ 红（**要销账** ⇒ ⇒ 清单不许过期）。
 *
 * 用法：
 *   node scripts/check-gate-discipline.mjs                # 全量（本地）
 *   node scripts/check-gate-discipline.mjs --self-test    # 判据自检
 *   node scripts/check-gate-discipline.mjs --audit        # 现状清单
 *   node scripts/check-gate-discipline.mjs --json         # 机器可读
 *   node scripts/check-gate-discipline.mjs --scope=wired  # 只量 CI 在跑的闸
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（判不了 ≠ 没问题）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RULES,
  classifyGate,
  compareDebt,
  countReading,
  gateNameFromFile,
  sourceShape,
  splitDebt,
  unjudgedGates,
  wiredGateNames,
} from './lib/gate-discipline.mjs';
import { KNOWN_DEBT } from './lib/gate-discipline-registry.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');

/**
 * 仓里**所有** workflow 的正文（**不止 ci.yml**）⇒ ⇒ 「闸接进 CI」＝
 * 接进**任何一个** workflow。
 * ⚠️ 2026-11-05：为了「长任务不被 push 取消」而新加了一个独立 workflow
 *    （desktop-e2e.yml）⇒ ⇒ 若这里只认 ci.yml ⇒ ⇒ 那些只接在新 workflow
 *    里的闸会被判成「有闸但没人跑」⇒ ⇒ **假红**。
 */
function readWorkflowTexts() {
  if (!existsSync(WORKFLOWS_DIR)) return [];
  const out = [];
  for (const f of readdirSync(WORKFLOWS_DIR).sort()) {
    if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
    out.push(readFileSync(join(WORKFLOWS_DIR, f), 'utf8'));
  }
  return out;
}

function parseArgs(argv) {
  const opts = { selfTest: false, audit: false, json: false, scope: 'all', timeout: 120000 };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--audit') opts.audit = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--scope=')) opts.scope = arg.slice('--scope='.length);
    else if (arg.startsWith('--timeout=')) opts.timeout = Number(arg.slice('--timeout='.length));
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

/** 一个合规的闸的样子（自检夹具的基线）。 */
function compliantFacts(overrides) {
  return Object.assign(
    {
      name: 'demo',
      hasSelfTestFlag: true,
      hasCannotJudgeExit: true,
      wired: true,
      selfTestExit: 0,
      selfTestOutput: '判据自检：3/3 通过',
    },
    overrides || {},
  );
}

function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('基线：一个完全合规的闸 ⇒ ⇒ 零违规', () => {
    const res = classifyGate(compliantFacts(), { behaviorScope: 'wired' });
    return res.findings.length === 0;
  });
  add('缺 --self-test ⇒ ⇒ 恰好红这一条', () => {
    const res = classifyGate(compliantFacts({ hasSelfTestFlag: false }), {
      behaviorScope: 'wired',
    });
    return res.findings.length === 1 && res.findings[0].kind === 'no-self-test';
  });
  add('自检退出 1 ⇒ ⇒ 恰好红「闸自己坏了」', () => {
    const res = classifyGate(compliantFacts({ selfTestExit: 1 }), { behaviorScope: 'wired' });
    return res.findings.length === 1 && res.findings[0].kind === 'self-test-broken';
  });
  add('自检退出 2 ⇒ ⇒ **不判红**（判不了，不是纪律违规）', () => {
    const res = classifyGate(compliantFacts({ selfTestExit: 2 }), { behaviorScope: 'wired' });
    return res.findings.length === 0 && res.statuses.length === 1;
  });
  add('自检没印可数读数 ⇒ ⇒ 恰好红这一条', () => {
    const res = classifyGate(
      compliantFacts({ selfTestOutput: '全部通过' }),
      { behaviorScope: 'wired' },
    );
    return res.findings.length === 1 && res.findings[0].kind === 'no-reading-in-wired';
  });
  add('没接进 CI ⇒ ⇒ 恰好红这一条', () => {
    const res = classifyGate(compliantFacts({ wired: false }), { behaviorScope: 'wired' });
    return res.findings.length === 1 && res.findings[0].kind === 'not-wired-into-ci';
  });
  add('没有退出码 2 那一档 ⇒ ⇒ 恰好红这一条', () => {
    const res = classifyGate(compliantFacts({ hasCannotJudgeExit: false }), {
      behaviorScope: 'wired',
    });
    return res.findings.length === 1 && res.findings[0].kind === 'no-cannot-judge-exit';
  });
  add('孪生：没接进 CI **且** 没自检 ⇒ ⇒ 恰好红两条', () => {
    const res = classifyGate(
      compliantFacts({ wired: false, hasSelfTestFlag: false }),
      { behaviorScope: 'wired' },
    );
    return res.findings.length === 2;
  });
  add('债对账：登记了、但缺口已修好 ⇒ ⇒ 红（要销账）', () => {
    const cmp = splitDebt([], { 'no-self-test': { gates: ['demo'] } });
    return cmp.stale.length === 1 && cmp.stale[0].kind === 'no-self-test';
  });
  add('债对账：新缺口没登记 ⇒ ⇒ 红（新增即错）', () => {
    const cmp = splitDebt(
      [{ kind: 'no-self-test', gate: 'brand-new', message: 'x' }],
      { 'no-self-test': { gates: [] } },
    );
    return cmp.missing.length === 1 && cmp.missing[0].gate === 'brand-new';
  });
  add('存量债：登记在册的缺口 ⇒ ⇒ **不红**（只报 ⚠，放行 ≠ 看不见）', () => {
    const res = splitDebt(
      [{ kind: 'no-self-test', gate: 'demo', message: 'x' }],
      { 'no-self-test': { gates: ['demo'] } },
    );
    return res.unregistered.length === 0 && res.tolerated.length === 1;
  });
  add('孪生：没登记的缺口 ⇒ ⇒ 红（新增即错）', () => {
    const res = splitDebt(
      [{ kind: 'no-self-test', gate: 'demo', message: 'x' }],
      { 'no-self-test': { gates: [] } },
    );
    return res.unregistered.length === 1 && res.missing.length === 1;
  });
  add('孪生：债清单与实测一致 ⇒ ⇒ 不红', () => {
    const cmp = splitDebt(
      [{ kind: 'no-self-test', gate: 'demo', message: 'x' }],
      { 'no-self-test': { gates: ['demo'] } },
    );
    return cmp.stale.length === 0 && cmp.missing.length === 0;
  });

  add(
    '退出码经 main() 传递、且 main() 能返回 2 ⇒ ⇒ 不许误判成「没有那一档」',
    () => {
      const src = 'function main() {\n  if (!ok) return 2;\n  return 0;\n}\nprocess.exit(main());';
      return sourceShape(src).hasCannotJudgeExit === true;
    },
  );
  add(
    '孪生：main() 只能返回 0/1 ⇒ ⇒ 仍然要报「没有那一档」',
    () => {
      const src = 'function main() {\n  return failed > 0 ? 1 : 0;\n}\nprocess.exit(main());';
      return sourceShape(src).hasCannotJudgeExit === false;
    },
  );
  add(
    '孪生：字面 exit(2) ⇒ ⇒ 认得出来',
    () => sourceShape("process.exit(2);").hasCannotJudgeExit === true,
  );
  add(
    '函数体里有字符串花括号 ⇒ ⇒ 仍要认得出 return 2（朴素配平会被带偏）',
    () => {
      const src = 'function main() {\n  const s = "{ not a brace }";\n  if (!ok) return 2;\n  return 0;\n}\nprocess.exit(main());';
      return sourceShape(src).hasCannotJudgeExit === true;
    },
  );

  add('判不了的闸 ⇒ ⇒ 登记在册的缺口**不许**判 stale（判不了 ≠ 没问题）', () => {
    const cmp = compareDebt([], { 'no-reading-in-wired': { gates: ['x'] } }, {
      unjudgedGates: ['x'],
    });
    return cmp.stale.length === 0 && cmp.skippedStale.length === 1;
  });
  add('孪生：判得了的闸 ⇒ ⇒ 登记在册却已修好的缺口**仍然**判 stale（要销账）', () => {
    const cmp = compareDebt([], { 'no-reading-in-wired': { gates: ['x'] } });
    return cmp.stale.length === 1 && cmp.skippedStale.length === 0;
  });
  add('判不了的闸 ⇒ ⇒ 不产生 missing（新增即错不该被环境触发）', () => {
    const cmp = compareDebt([], {}, { unjudgedGates: ['x'] });
    return cmp.missing.length === 0 && cmp.stale.length === 0;
  });
  add('unjudgedGates：退出码 2 与超时都算判不了；没量的闸不算', () => {
    const got = unjudgedGates([
      { gate: 'a', measured: true, selfTestExit: 2 },
      { gate: 'b', measured: true, selfTestExit: 'TIMEOUT' },
      { gate: 'c', measured: true, selfTestExit: 0 },
      { gate: 'd', measured: false, selfTestExit: 2 },
    ]);
    return got.length === 2 && got[0] === 'a' && got[1] === 'b';
  });
  add('孪生：判得了的闸 ⇒ ⇒ 它的缺口消失仍然要销账（不许被「跳过」吞掉）', () => {
    const cmp = splitDebt([], { 'no-reading-in-wired': { gates: ['x'] } }, {
      unjudgedGates: ['other'],
    });
    return cmp.stale.length === 1 && (cmp.skippedStale || []).length === 0;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

/** 列出仓里的闸。 */
function listGateFiles() {
  if (!existsSync(SCRIPTS_DIR)) return [];
  return readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith('check-') && f.endsWith('.mjs'))
    .sort();
}

/** 跑一道闸的自检 ⇒ ⇒ 量它的退出码与输出。 */
function measureSelfTest(file, timeout) {
  const res = spawnSync(process.execPath, [join(SCRIPTS_DIR, file), '--self-test'], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = String(res.stdout || '') + String(res.stderr || '');
  let exit = res.status;
  if (res.error && res.error.code === 'ETIMEDOUT') exit = 'TIMEOUT';
  return { exit, output };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) selfTest();

  const workflowTexts = readWorkflowTexts();
  if (!existsSync(SCRIPTS_DIR) || workflowTexts.length === 0) {
    console.error('❌ 读不到 scripts/ 或 .github/workflows/ 下的 workflow ⇒ ⇒ 判不了 ≠ 没问题');
    process.exit(2);
  }

  const gateFiles = listGateFiles();
  if (gateFiles.length === 0) {
    console.error('❌ 一个闸都没找到 ⇒ ⇒ 判不了 ≠ 没问题');
    process.exit(2);
  }

  const wired = wiredGateNames(workflowTexts.join('\n'));

  const findings = [];
  const statuses = [];
  const inventory = [];
  let measured = 0;

  for (const file of gateFiles) {
    const name = gateNameFromFile(file);
    const source = readFileSync(join(SCRIPTS_DIR, file), 'utf8');
    const shape = sourceShape(source);
    const isWired = wired.has(name);
    const facts = {
      name,
      hasSelfTestFlag: shape.hasSelfTestFlag,
      hasCannotJudgeExit: shape.hasCannotJudgeExit,
      wired: isWired,
      selfTestExit: null,
      selfTestOutput: '',
    };
    const needMeasure = opts.scope === 'all' || isWired;
    if (needMeasure) {
      const m = measureSelfTest(file, opts.timeout);
      facts.selfTestExit = m.exit;
      facts.selfTestOutput = m.output;
      measured += 1;
    }
    // ⚠️ 行为类判据（D2 自检必须绿 / D3 印不印读数）**只对「CI 已经在跑的
    //    那些闸」生效** ⇒ ⇒ 否则本机与 CI 的结论会不一致 ⇒ ⇒ 债清单对不上账。
    //    `--scope` 只决定**量多少道**（工作量），不决定**判多少条**。
    const res = classifyGate(facts, { behaviorScope: 'wired' });
    for (const f of res.findings) findings.push(f);
    for (const s of res.statuses) statuses.push(s);
    inventory.push({
      gate: name,
      wired: isWired,
      hasSelfTestFlag: shape.hasSelfTestFlag,
      hasCannotJudgeExit: shape.hasCannotJudgeExit,
      selfTestExit: facts.selfTestExit,
      reading: countReading(facts.selfTestOutput),
      measured: needMeasure,
    });
  }

  // 债对账（只对**与环境无关**的缺口 ⇒ ⇒ 本机与 CI 结论一致）
  // ⚠️ **登记在册 ⇒ ⇒ 放行（但仍然打印）**；**没登记 ⇒ ⇒ 红**。
  //
  // ⚠️⚠️ 2026-11-05 真 CI 实测（run 42002098658）：这一步原本**红**了 ⇒ ⇒
  //    根因不是「债清单过期」，而是**销账判据没尊重「判不了」**：
  //    ps1-portability 在 ubuntu runner 上自检退出 2（没有 powershell.exe）
  //    ⇒ ⇒ 按 D2 不产生「自检不印可数读数」那个缺口 ⇒ ⇒ 而本机（Windows）
  //    它退出 0 且确实不印 ⇒ ⇒ 那个缺口**本机有、CI 上没有**
  //    ⇒ ⇒ 销账判据把它判成 stale ⇒ ⇒ 真 CI 上元闸红（只红这一条）。
  // ⇒ ⇒ 修法：**判不了的闸，它的缺口不许据此销账**（只记 skippedStale 并打印）。
  const unjudged = unjudgedGates(inventory);
  const debt = splitDebt(findings, KNOWN_DEBT, { unjudgedGates: unjudged });
  for (const s of debt.stale) {
    findings.push({
      kind: 'debt-stale',
      gate: s.gate,
      message:
        '债清单里登记了「' + s.gate + '」的「' + s.kind + '」缺口 ⇒ ⇒ 但它已经不存在了 ' +
        '⇒ ⇒ **要销账**（清单不许过期）',
    });
  }
  for (const m of debt.missing) {
    findings.push({
      kind: 'debt-missing',
      gate: m.gate,
      message:
        '闸「' + m.gate + '」有新的「' + m.kind + '」缺口 ⇒ ⇒ **没登记** ⇒ ⇒ ' +
        '新增即错（要么补上，要么显式登记成存量债）',
    });
  }
  const hardFailures = findings.filter((f) => !debt.tolerated.includes(f));

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          gates: gateFiles.length,
          measured,
          wired: [...wired],
          findings,
          statuses,
          skippedStale: debt.skippedStale || [],
          unjudgedGates: unjudged,
          inventory,
        },
        null,
        2,
      ),
    );
  } else if (opts.audit) {
    console.log('闸总数：' + gateFiles.length + ' ｜ 已接进 CI：' + wired.size + ' ｜ 本轮量了：' + measured);
    console.log('');
    for (const row of inventory) {
      console.log(
        '  ' +
          row.gate.padEnd(26) +
          ' 自检:' +
          (row.hasSelfTestFlag ? '有' : '无') +
          '  接CI:' +
          (row.wired ? '是' : '否') +
          '  判不了档:' +
          (row.hasCannotJudgeExit ? '有' : '无') +
          '  自检退出:' +
          (row.measured ? String(row.selfTestExit) : '未量') +
          '  读数:' +
          (row.reading ? row.reading.passed + '/' + row.reading.total : '—'),
      );
    }
    console.log('');
    console.log('违规：' + findings.length + ' ｜ 判不了（已显式报出）：' + statuses.length);
  } else {
    console.log(
      '闸的治理闸：' + gateFiles.length + ' 道闸 ｜ 已接进 CI：' + wired.size +
        ' ｜ 本轮量了 ' + measured + ' 道',
    );
    for (const s of statuses) {
      console.log('⚠ ' + s.message);
    }
    for (const s of debt.skippedStale || []) {
      console.log(
        '⚠ [销账跳过] 闸「' + s.gate + '」登记在册的「' + s.kind + '」缺口这轮**没出现**' +
          '⇒ ⇒ 但它的自检**判不了**（退出码 2 / 超时）⇒ ⇒ 「判不了 ≠ 没问题」' +
          '⇒ ⇒ **不销账**（等判得了的那天再销）',
      );
    }
    for (const f of debt.tolerated) {
      console.log('⚠ [存量债] [' + f.kind + '] ' + f.message);
    }
    for (const f of hardFailures) {
      console.log('❌ [' + f.kind + '] ' + f.message);
      console.log('   规则：' + (RULES[f.kind] || '（债对账）'));
    }
    if (hardFailures.length === 0) {
      console.log(
        '✅ 零违规（' +
          gateFiles.length +
          ' 道闸都守纪律；存量债 ' +
          debt.tolerated.length +
          ' 条已登记）',
      );
    } else {
      console.log('❌ 共 ' + hardFailures.length + ' 条违规（另有存量债 ' + debt.tolerated.length + ' 条）');
    }
  }

  process.exit(hardFailures.length > 0 ? 1 : 0);
}

main();
