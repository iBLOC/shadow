#!/usr/bin/env node
/**
 * MSRV 地板的**跨仓普查** —— 让「哪个仓的地板是假的」这件事在 CI 上**显形**
 * ============================================================================
 *
 * ## 它补的是哪一格
 *
 * ⚠️ **现状（2026-11-11 实测）**：
 *   · 既有地板闸（scripts/check-msrv-floor.mjs）在 CI 上**判不了**（没带 --manifest-path
 *     ⇒ ⇒ 在 shadow 仓根向上找 Cargo.toml ⇒ ⇒ 仓根没有 ⇒ ⇒ 退出码 2）；
 *   · 而**本仓内的桌面端**（shadow-desktop/src-tauri）图级就是「VERDICT: FAIL (7 项)」
 *     （generator 0.8.12 / sysinfo 0.39.6 / windows-* 0.100.0 全要 1.95）
 *     ⇒ ⇒ **那盏红灯在 CI 上被整盏绿灯吞掉了**。
 *
 * ⇒ ⇒ 所以这一格要的是**普查**：把每个仓逐个喂进地板闸，**把结论列出来**
 *   ⇒ ⇒ 口径（抬到 1.94.1 / 1.95 / 钉回 / 分仓自报）**待主人拍板**
 *   ⇒ ⇒ ⇒ 但**事实不该等口径** ⇒ ⇒ 先让事实显形。
 *
 * ## 为什么**默认不判红**
 *
 * · 口径未定的红灯若直接阻断 CI ⇒ ⇒ 会让 CI 因**口径未定**而红 ⇒ ⇒ 那不是「判据更严了」
 *   ⇒ ⇒ 是「尺子先于主人拍板」。
 * · ⇒ ⇒ **默认只报（report-only）**；`--strict` 留给「口径定完之后」再打开。
 *   ⇒ ⇒ ⚠️ 「只报」不等于「看不见」：它逐仓打印结论 ＋ 打一行机器可读的汇总。
 *
 * ## 它**不做**什么
 *
 * · **不重新实现**地板判定 ⇒ ⇒ 真正的判定仍然只有地板闸一把尺子
 *   ⇒ ⇒ 本脚本只**读它的结论**（退出码 ＋ 两行计数 ＋ VERDICT 行）⇒ ⇒ 口径改动只改一处。
 * · **不代改**任何仓的 rust-version ⇒ ⇒ 那是跨仓口径决定。
 *
 * ## 用法
 *
 *   node scripts/census-msrv-floor.mjs            # 普查（默认不判红）
 *   node scripts/census-msrv-floor.mjs --strict   # 有**线级**真红灯 ⇒ 退出码 1
 *   node scripts/census-msrv-floor.mjs --self-test
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * 判读一道闸的输出 ⇒ ⇒ **纯函数**（不跑闸、不碰文件系统）⇒ ⇒ 自检能喂合成夹具。
 *
 * ⚠️ **认不出 ⇒ ⇒ 判不了，绝不是绿**：地板闸的输出形状若变了（改标签／改措辞），
 *   ⇒ ⇒ 本脚本必须报「判不了」⇒ ⇒ 否则「格式变了」会被读成「全绿」⇒ ⇒ 那是最坏的一类假绿。
 *
 * @param {{code:number, output:string}} res
 * @returns {{verdict:string, line:number, patch:number, maxMsrv:string, reason:string}}
 */
export function parseGateOutput(res) {
  const code = Number((res && res.code) || 0);
  const out = String((res && res.output) || '');
  const verdictMatch = out.match(/VERDICT: (PASS|FAIL)/);
  const lineMatch = out.match(/\u4f9d\u8d56\u8981\u6c42\u8d85\u51fa\u5730\u677f\u7684\u7ebf[ \t]*::[ \t]*(\d+)/);
  const patchMatch = out.match(/\u8865\u4e01\u7ea7\u8d8a\u7ebf[^\n]*::[ \t]*(\d+)/);
  const maxMatch = out.match(/\u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV[ \t]*::[ \t]*([^\n]+)/);
  const maxMsrv = maxMatch ? maxMatch[1].trim() : '';
  // ⚠️ **「判不了」必须带原因** —— 否则它变成一个**永远的黑洞**（谁都不知道该去找谁）。
  //   本例：门的错误行本身就写着原因（例如「锁文件不同步」）⇒ ⇒ 先把它摸出来。
  const reasonMatch = out.match(/check-msrv-floor:[^\n]*/);
  const firstLine = out.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  const reason = (reasonMatch ? reasonMatch[0] : firstLine).slice(0, 200);

  if (code === 2) return { verdict: 'cannot-judge', line: 0, patch: 0, maxMsrv, reason };
  if (!verdictMatch || !lineMatch) {
    return { verdict: 'cannot-judge', line: 0, patch: 0, maxMsrv, reason };
  }
  const line = Number(lineMatch[1]);
  const patch = patchMatch ? Number(patchMatch[1]) : 0;
  if (code === 1 || verdictMatch[1] === 'FAIL') {
    return { verdict: 'line-violation', line, patch, maxMsrv, reason };
  }
  if (line > 0) return { verdict: 'line-violation', line, patch, maxMsrv, reason };
  if (patch > 0) return { verdict: 'patch-only', line: 0, patch, maxMsrv, reason };
  return { verdict: 'clean', line: 0, patch: 0, maxMsrv, reason };
}

/** 汇总判定：**只有**线级**真红灯判红**；补丁级与判不了都不阻断（口径未定）。 */
export function censusVerdict(rows) {
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const reds = rows.filter((r) => r.verdict === 'line-violation');
  return {
    clean: count('clean'),
    patchOnly: count('patch-only'),
    line: count('line-violation'),
    cannot: count('cannot-judge'),
    reds,
    strictFail: reds.length > 0,
  };
}

/** 仓的发现面：兄弟仓（与本机同构：../<name>）＋ 本仓内的桌面端 ＋ benchmark。 */
export function discoverManifests(repoRoot) {
  const siblings = [
    'telencephalon', 'encephalon', 'synapse', 'prefrontal', 'hippocampus', 'neuron',
    'diencephalon', 'temporal', 'occipital', 'ziti-rust', 'amygdala', 'parietal',
    'hengjian', 'lance-graph',
  ];
  const out = [];
  for (const name of siblings) {
    const p = resolve(dirname(repoRoot), name, 'Cargo.toml');
    if (existsSync(p)) out.push({ repo: name, manifest: p, kind: 'sibling' });
  }
  const own = [
    { repo: 'shadow-desktop', manifest: resolve(repoRoot, 'shadow-desktop', 'src-tauri', 'Cargo.toml'), kind: 'own' },
    { repo: 'benchmark', manifest: resolve(repoRoot, 'benchmark', 'Cargo.toml'), kind: 'own' },
  ];
  for (const o of own) if (existsSync(o.manifest)) out.push(o);
  return out;
}

function runGate(gatePath, manifest) {
  const r = spawnSync(process.execPath, [gatePath, '--manifest-path', manifest], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const code = r.status === null || r.status === undefined ? 2 : r.status;
  return parseGateOutput({ code, output: String(r.stdout || '') + String(r.stderr || '') });
}

function selfTest() {
  const PASS_PATCH = [
    'MSRV floor check :: hippocampus/Cargo.toml :: floor=1.94 (\u5141\u8bb8\u5230 1.94.99)',
    '  \u4f9d\u8d56\u8981\u6c42\u8d85\u51fa\u5730\u677f\u7684\u7ebf :: 0',
    '  \u8865\u4e01\u7ea7\u8d8a\u7ebf\uff08\u8d85\u51fa\u5730\u677f**\u7cbe\u786e\u503c** 1.94.0 \u21d2 \u21d2 \u5728\u8be5\u7cbe\u786e\u503c\u4e0a\u7f16\u4e0d\u8fc7\uff09 :: 20',
    '  \u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV :: aws-config 1.9.0 -> 1.94.1',
    'VERDICT: PASS',
  ].join('\n');
  const FAIL_LINE = [
    'MSRV floor check :: src-tauri/Cargo.toml :: floor=1.94 (\u5141\u8bb8\u5230 1.94.99)',
    '  \u4f9d\u8d56\u8981\u6c42\u8d85\u51fa\u5730\u677f\u7684\u7ebf :: 7',
    '  \u8865\u4e01\u7ea7\u8d8a\u7ebf\uff08\u8d85\u51fa\u5730\u677f**\u7cbe\u786e\u503c** 1.94.0 \u21d2 \u21d2 \u5728\u8be5\u7cbe\u786e\u503c\u4e0a\u7f16\u4e0d\u8fc7\uff09 :: 23',
    '  \u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV :: generator 0.8.12 -> 1.95',
    'VERDICT: FAIL (7 \u9879)',
  ].join('\n');

  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('\u56fe\u7ea7 PASS \u4f46\u6709\u8865\u4e01\u7ea7\u8d8a\u7ebf \u21d2 \u21d2 \u5224\u300c\u8865\u4e01\u7ea7\u300d\uff08\u4e0d\u662f\u7ea2\uff09', () => {
    const r = parseGateOutput({ code: 0, output: PASS_PATCH });
    return r.verdict === 'patch-only' && r.line === 0 && r.patch === 20 && r.maxMsrv.indexOf('1.94.1') >= 0;
  });

  add('\u56fe\u7ea7 FAIL\uff08\u7ebf\u7ea7\uff09\u21d2 \u21d2 \u5224\u300c\u7ebf\u7ea7\u8d8a\u7ebf\u300d\uff08\u771f\u7ea2\u706f\uff09', () => {
    const r = parseGateOutput({ code: 1, output: FAIL_LINE });
    return r.verdict === 'line-violation' && r.line === 7 && r.patch === 23;
  });

  add('\u9000\u51fa\u7801 2\uff08\u5224\u4e0d\u4e86\uff09\u21d2 \u21d2 \u4e0d\u7b97\u7eff\u4e5f\u4e0d\u7b97\u7ea2', () => {
    const r = parseGateOutput({ code: 2, output: 'cargo metadata --locked \u8dd1\u4e0d\u901a' });
    return r.verdict === 'cannot-judge';
  });

  add('\u8f93\u51fa\u5f62\u72b6\u53d8\u4e86\uff08\u8ba4\u4e0d\u51fa VERDICT\uff09\u21d2 \u21d2 \u4e5f\u662f\u300c\u5224\u4e0d\u4e86\u300d\uff08**\u7edd\u4e0d\u662f\u7eff**\uff09', () => {
    const r = parseGateOutput({ code: 0, output: '\u4e00\u4e2a\u5168\u7136\u4e0d\u540c\u7684\u5f62\u72b6' });
    return r.verdict === 'cannot-judge';
  });

  add('\u5224\u4e0d\u4e86\u5fc5\u987b\u5e26\u539f\u56e0\uff08否\u5219\u5b83是\u4e00\u4e2a\u6c38\u8fdc\u7684\u9ed1\u6d1e\uff09', () => {
    const r = parseGateOutput({
      code: 2,
      output: 'check-msrv-floor: cargo metadata --locked \u8dd1\u4e0d\u901a :: error: cannot update the lock file because --locked was passed',
    });
    return r.verdict === 'cannot-judge' && r.reason.indexOf('lock file') >= 0;
  });

  add('strict \u6a21\u5f0f\uff1a\u7ebf\u7ea7\u771f\u7ea2\u706f\u21d2 \u21d2 \u5224\u7ea2\uff1b\u8865\u4e01\u7ea7\u4e0e\u5224\u4e0d\u4e86\u21d2 \u21d2 \u4e0d\u5224\u7ea2', () => {
    const rows = [
      { repo: 'a', verdict: 'patch-only' },
      { repo: 'b', verdict: 'cannot-judge' },
      { repo: 'c', verdict: 'line-violation' },
    ];
    const s = censusVerdict(rows);
    return s.strictFail === true && s.line === 1 && s.patchOnly === 1 && s.cannot === 1;
  });

  add('strict \u6a21\u5f0f\uff1a\u53ea\u6709\u8865\u4e01\u7ea7\u2192 \u21d2 \u4e0d\u5224\u7ea2\uff08\u53e3\u5f84\u672a\u5b9a\u4e0d\u963b\u65ad\uff09', () => {
    const s = censusVerdict([{ repo: 'a', verdict: 'patch-only' }, { repo: 'b', verdict: 'clean' }]);
    return s.strictFail === false && s.patchOnly === 1 && s.clean === 1;
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try { ok = c.run() === true; } catch (err) { ok = false; }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  \u5224\u636e\u81ea\u68c0\uff1a' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) { console.error('\u274c \u81ea\u68c0\u6ca1\u8fc7 \u21d2 \u672c\u811a\u672c\u7684\u5224\u8bfb\u4e0d\u53ef\u4fe1'); process.exit(1); }
  console.log('\u2705 \u81ea\u68c0\u901a\u8fc7');
  process.exit(0);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) selfTest();
  const strict = argv.includes('--strict');
  const repoRoot = resolve(process.cwd());
  const gatePath = resolve(repoRoot, 'scripts', 'check-msrv-floor.mjs');
  if (!existsSync(gatePath)) {
    console.error('\u274c \u627e\u4e0d\u5230\u5730\u677f\u95e8\uff08scripts/check-msrv-floor.mjs\uff09\u21d2 \u21d2 \u5224\u4e0d\u4e86');
    process.exit(2);
  }
  const manifests = discoverManifests(repoRoot);
  if (manifests.length === 0) {
    console.error('\u274c \u4e00\u4e2a manifest \u90fd\u6ca1\u53d1\u73b0\u21d2 \u21d2 \u5224\u4e0d\u4e86');
    process.exit(2);
  }
  console.log('\u21d2 \u21d2 MSRV \u5730\u677f\u8de8\u4ed3\u666e\u67e5\uff08\u5730\u677f 1.94\uff5c\u53ea\u62a5\u4e0d\u5224\u7ea2\uff09');
  const rows = manifests.map((m) => {
    const r = runGate(gatePath, m.manifest);
    return { repo: m.repo, kind: m.kind, ...r };
  });
  const LABEL = { clean: '\u5e72\u51c0', 'patch-only': '\u8865\u4e01\u7ea7\u8d8a\u7ebf', 'line-violation': '\u7ebf\u7ea7\u8d8a\u7ebf\uff08\u771f\u7ea2\u706f\uff09', 'cannot-judge': '\u5224\u4e0d\u4e86' };
  for (const r of rows) {
    console.log('  ' + (r.repo + ' (' + r.kind + ')').padEnd(28) + ' :: ' + (LABEL[r.verdict] || r.verdict) + ' :: \u7ebf ' + r.line + ' \uff5c \u8865\u4e01 ' + r.patch + (r.maxMsrv ? ' :: ' + r.maxMsrv : '') + (r.verdict === 'cannot-judge' && r.reason ? '\n      \u21d2 \u539f\u56e0 :: ' + r.reason : ''));
  }
  const s = censusVerdict(rows);
  console.log('CENSUS :: \u5e72\u51c0 ' + s.clean + ' \uff5c \u8865\u4e01\u7ea7 ' + s.patchOnly + ' \uff5c \u7ebf\u7ea7\u771f\u7ea2\u706f ' + s.line + ' \uff5c \u5224\u4e0d\u4e86 ' + s.cannot + ' \uff5c \u4ed3\u6570 ' + rows.length);
  // ⚠️ **把结论落到 step summary** —— 否则「只报」只存在日志里。
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      const lines = [];
      lines.push('## MSRV 地板跨仓普查（地板 1.94｜只报不判红）');
      lines.push('');
      lines.push('| 仓 | 类型 | 结论 | 线级 | 补丁级 | 图最高 MSRV |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      for (const r of rows) lines.push('| ' + r.repo + ' | ' + r.kind + ' | ' + (LABEL[r.verdict] || r.verdict) + ' | ' + r.line + ' | ' + r.patch + ' | ' + (r.maxMsrv || '-') + ' |' + (r.verdict === 'cannot-judge' && r.reason ? ' ' + r.reason : '') + ' |');
      lines.push('');
      lines.push('CENSUS :: 干净 ' + s.clean + ' ｜ 补丁级 ' + s.patchOnly + ' ｜ 线级真红灯 ' + s.line + ' ｜ 判不了 ' + s.cannot + ' ｜ 仓数 ' + rows.length);
      if (s.reds.length > 0) {
        lines.push('');
        lines.push('⚠️ **线级真红灯（口径未定，本次只报不判红）**：');
        for (const r of s.reds) lines.push('- ' + r.repo + ' :: ' + r.line + ' 项要 1.95+ （' + r.maxMsrv + '）');
      }
      writeFileSync(summaryPath, lines.join('\n') + '\n', { flag: 'a' });
    } catch (err) {
      console.log('⚠️ step summary 写不进：' + String(err));
    }
  }
  if (s.reds.length > 0) {
    console.log('\u26a0\ufe0f \u7ebf\u7ea7\u771f\u7ea2\u706f\uff08\u53e3\u5f84\u672a\u5b9a\uff0c\u672c\u6b21**\u53ea\u62a5\u4e0d\u5224\u7ea2**\uff09\uff1a');
    for (const r of s.reds) console.log('     \u00b7 ' + r.repo + ' :: ' + r.line + ' \u9879\u8981 1.95+ \uff08' + r.maxMsrv + '\uff09');
  }
  if (strict && s.strictFail) {
    console.error('\u274c strict \u6a21\u5f0f\uff1a\u6709\u7ebf\u7ea7\u771f\u7ea2\u706f \u21d2 \u21d2 \u5224\u7ea2');
    process.exit(1);
  }
  process.exit(0);
}

main();
