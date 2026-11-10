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
 * ⇒ ⇒ 所以这一格要的是**普查**：把每个仓逐个喂进地板闸，**把结论列出来**。
 *
 * ## 口径：**分仓地板**（2026-11-11 主人以「机械」拍板）
 *
 * ⚠️ 旧口径里有一个**人挑的数**（地板 1.94）⇒ ⇒ 「地板是多少」没有机械答案 ⇒ ⇒ 只能靠人拍板。
 * ⇒ ⇒ 新口径：**地板 ＝ 该仓自己 manifest 里声明的 `rust-version`**（自报）⇒ ⇒
 *   · 尺子**不再需要任何人拍板**；
 *   · **承诺按 cargo 的原意读**（"1.94" 就是 ">= 1.94.0"）⇒ ⇒ 「线内 PASS」那种假绿消失；
 *   · **零跨仓改动** ⇒ ⇒ 谁的仓谁自己报 ⇒ ⇒ **不代改任何兄弟仓的声明**。
 * ⇒ ⇒ 本脚本**不传 `--floor`** ⇒ ⇒ 地板闸走它自己的默认口径（auto ＝ 自报）⇒ ⇒
 *   ⇒ ⇒ 每仓的地板**就是那个仓自己声明的那个数**。
 *
 * ## 为什么**默认不判红**
 *
 * · 「谁的仓谁自己改」是**主人的决定**，不是尺子的 ⇒ ⇒ 本普查**默认只报（report-only）**；
 *   ⇒ ⇒ `--strict` 留给「各仓都改完之后」再打开。
 *   ⇒ ⇒ ⚠️ 「只报」不等于「看不见」：它逐仓打印结论 ＋ 打一行机器可读的汇总。
 *
 * ## 它**不做**什么
 *
 * · **不重新实现**地板判定 ⇒ ⇒ 真正的判定仍然只有地板闸一把尺子
 *   ⇒ ⇒ 本脚本只**读它的结论**（退出码 ＋ 机器可读行 ＋ VERDICT 行）⇒ ⇒ 口径改动只改一处。
 * · **不代改**任何仓的 rust-version ⇒ ⇒ 那是**那个仓自己**的动作。
 *
 * ## 用法
 *
 *   node scripts/census-msrv-floor.mjs            # 普查（默认不判红）
 *   node scripts/census-msrv-floor.mjs --strict   # 有越线 ⇒ 退出码 1
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
 * ⚠️ **机器可读行优先**（2026-11-11 新形状）：
 *   `MSRV :: mode=auto floor=1.94 violations=20 line=0 patch=20 missing=0 max=1.94.1`
 *   ⇒ ⇒ 不靠人眼扫日志 ⇒ ⇒ 「只报」也能被对账。
 *   ⇒ ⇒ 旧形状（`依赖要求超出地板的线 :: N`）**仍能解析** ⇒ ⇒ 取证面不丢。
 *
 * @param {{code:number, output:string}} res
 * @returns {{verdict:string, line:number, patch:number, violations:number, floor:string, mode:string, maxMsrv:string, reason:string}}
 */
export function parseGateOutput(res) {
  const code = Number((res && res.code) || 0);
  const out = String((res && res.output) || '');

  const machine = out.match(
    /MSRV\s*::\s*mode=(\S+)\s+floor=(\S+)\s+violations=(\d+)\s+line=(\d+)\s+patch=(\d+)\s+missing=(\d+)\s+max=(\S+)/,
  );
  const verdictMatch = out.match(/VERDICT: (PASS|FAIL)/);
  const maxMatch = out.match(/\u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV[ \t]*::[ \t]*([^\n]+)/);
  const maxMsrv = maxMatch ? maxMatch[1].trim() : '';
  // ⚠️ **「判不了」必须带原因** —— 否则它变成一个**永远的黑洞**（谁都不知道该去找谁）。
  //   本例：门的错误行本身就写着原因（例如「锁文件不同步」）⇒ ⇒ 先把它摸出来。
  const reasonMatch = out.match(/check-msrv-floor:[^\n]*/);
  const firstLine = out.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  const reason = (reasonMatch ? reasonMatch[0] : firstLine).slice(0, 200);

  if (code === 2) return { verdict: 'cannot-judge', line: 0, patch: 0, violations: 0, floor: '', mode: '', maxMsrv, reason };

  if (machine) {
    const mode = machine[1];
    const floor = machine[2];
    const violations = Number(machine[3]);
    const line = Number(machine[4]);
    const patch = Number(machine[5]);
    if (violations > 0 || code === 1) {
      return { verdict: 'violation', line, patch, violations, floor, mode, maxMsrv, reason };
    }
    return { verdict: 'clean', line: 0, patch: 0, violations: 0, floor, mode, maxMsrv, reason };
  }

  // ── 旧形状（global 口径）—— 取证面保留 ──────────────────────────────
  const lineMatch = out.match(/\u4f9d\u8d56\u8981\u6c42\u8d85\u51fa\u5730\u677f\u7684\u7ebf[ \t]*::[ \t]*(\d+)/);
  const patchMatch = out.match(/\u8865\u4e01\u7ea7\u8d8a\u7ebf[^\n]*::[ \t]*(\d+)/);
  if (!verdictMatch || !lineMatch) {
    return { verdict: 'cannot-judge', line: 0, patch: 0, violations: 0, floor: '', mode: 'global', maxMsrv, reason };
  }
  const line = Number(lineMatch[1]);
  const patch = patchMatch ? Number(patchMatch[1]) : 0;
  if (code === 1 || verdictMatch[1] === 'FAIL') {
    return { verdict: 'line-violation', line, patch, violations: line, floor: '', mode: 'global', maxMsrv, reason };
  }
  if (line > 0) return { verdict: 'line-violation', line, patch, violations: line, floor: '', mode: 'global', maxMsrv, reason };
  if (patch > 0) return { verdict: 'patch-only', line: 0, patch, violations: 0, floor: '', mode: 'global', maxMsrv, reason };
  return { verdict: 'clean', line: 0, patch: 0, violations: 0, floor: '', mode: 'global', maxMsrv, reason };
}

/**
 * 汇总判定：**只有「越了自报承诺」的真红灯判红**；判不了不阻断。
 * ⚠️ 新口径下「补丁级」不再单独存在（补丁级也是**越了承诺**）⇒ ⇒ 它只作**分档报数**。
 */
export function censusVerdict(rows) {
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const reds = rows.filter((r) => r.verdict === 'violation' || r.verdict === 'line-violation');
  // ⚠️ 旧形状的行**只有 verdict 没有计数** ⇒ ⇒ 「线级越线」这个 verdict 本身就算跨线档。
  const lineRows = reds.filter((r) => (r.line || 0) > 0 || r.verdict === 'line-violation');
  const patchRows = reds.filter((r) => r.verdict !== 'line-violation' && (r.line || 0) === 0 && (r.patch || 0) > 0);
  return {
    clean: count('clean'),
    patchOnly: count('patch-only'),
    violation: reds.length,
    line: lineRows.length,
    patch: patchRows.length,
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
  // ⚠️ **不传 --floor** ⇒ ⇒ 地板闸走它自己的默认口径（auto ＝ **该仓自报**）⇒ ⇒
  //   ⇒ 这就是「分仓地板」的接线点 ⇒ ⇒ **普查器里没有任何人挑的数**。
  const r = spawnSync(process.execPath, [gatePath, '--manifest-path', manifest], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const code = r.status === null || r.status === undefined ? 2 : r.status;
  return parseGateOutput({ code, output: String(r.stdout || '') + String(r.stderr || '') });
}

function selfTest() {
  // ── 新形状（auto：机器可读行）────────────────────────────────────────
  const PASS_AUTO = [
    'MSRV floor check :: hippocampus/Cargo.toml :: floor=auto \u21d2 \u81ea\u62a5 1.94',
    '  \u4f9d\u8d56\u8d8a\u7ebf\uff08\u8d85\u51fa**\u81ea\u62a5\u5730\u677f** 1.94.0 \u21d2 \u21d2 \u5728\u8be5\u5730\u677f\u4e0a\u7f16\u4e0d\u8fc7\uff09 :: 0',
    '  \u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV :: aws-config 1.9.0 -> 1.94.0',
    '  MSRV :: mode=auto floor=1.94 violations=0 line=0 patch=0 missing=0 max=1.94.0',
    'VERDICT: PASS',
  ].join('\n');
  const FAIL_AUTO = [
    'MSRV floor check :: src-tauri/Cargo.toml :: floor=auto \u21d2 \u81ea\u62a5 1.94',
    '  \u4f9d\u8d56\u8d8a\u7ebf\uff08\u8d85\u51fa**\u81ea\u62a5\u5730\u677f** 1.94.0 \u21d2 \u21d2 \u5728\u8be5\u5730\u677f\u4e0a\u7f16\u4e0d\u8fc7\uff09 :: 7',
    '  \u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV :: generator 0.8.12 -> 1.95',
    '  MSRV :: mode=auto floor=1.94 violations=7 line=7 patch=0 missing=0 max=1.95',
    'VERDICT: FAIL (7 \u9879)',
  ].join('\n');
  const FAIL_AUTO_PATCH = [
    'MSRV floor check :: hippocampus/Cargo.toml :: floor=auto \u21d2 \u81ea\u62a5 1.94',
    '  \u4f9d\u8d56\u8d8a\u7ebf\uff08\u8d85\u51fa**\u81ea\u62a5\u5730\u677f** 1.94.0 \u21d2 \u21d2 \u5728\u8be5\u5730\u677f\u4e0a\u7f16\u4e0d\u8fc7\uff09 :: 20',
    '  \u4f9d\u8d56\u56fe\u6700\u9ad8 MSRV :: aws-config 1.9.0 -> 1.94.1',
    '  MSRV :: mode=auto floor=1.94 violations=20 line=0 patch=20 missing=0 max=1.94.1',
    'VERDICT: FAIL (20 \u9879)',
  ].join('\n');

  // ── 旧形状（global 口径）—— 取证面保留 ──────────────────────────────
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

  add('\u65b0\u5f62\u72b6\uff1aauto \u7eff\uff08\u81ea\u62a5\u5730\u677f 1.94 \u4e14\u4f9d\u8d56\u5747\u22641.94.0\uff09\u21d2 \u21d2 \u5224\u300c\u5e72\u51c0\u300d', () => {
    const r = parseGateOutput({ code: 0, output: PASS_AUTO });
    return r.verdict === 'clean' && r.violations === 0 && r.floor === '1.94' && r.mode === 'auto';
  });

  add('\u65b0\u5f62\u72b6\uff1aauto \u8d8a\u7ebf\uff08\u8de8\u7ebf 7 \u9879\uff09\u21d2 \u21d2 \u5224\u300c\u8d8a\u7ebf\u300d\uff08\u771f\u7ea2\u706f\uff09', () => {
    const r = parseGateOutput({ code: 1, output: FAIL_AUTO });
    return r.verdict === 'violation' && r.violations === 7 && r.line === 7 && r.patch === 0;
  });

  add('\u65b0\u5f62\u72b6\uff1aauto \u8d8a\u7ebf\uff08\u8865\u4e01\u7ea7 20 \u9879\uff09\u21d2 \u21d2 **\u4e5f\u662f\u8d8a\u7ebf**\uff08\u627f\u8bfa\u6309 cargo \u7684\u539f\u610f\u8bfb\uff09', () => {
    const r = parseGateOutput({ code: 1, output: FAIL_AUTO_PATCH });
    return r.verdict === 'violation' && r.violations === 20 && r.line === 0 && r.patch === 20;
  });

  add('\u65b0\u5f62\u72b6\uff1a\u8bfb\u4e0d\u51fa\u673a\u5668\u53ef\u8bfb\u884c\u21d2 \u21d2 \u4e5f\u662f\u300c\u5224\u4e0d\u4e86\u300d\uff08**\u7edd\u4e0d\u662f\u7eff**\uff09', () => {
    const r = parseGateOutput({ code: 0, output: '\u4e00\u4e2a\u5168\u7136\u4e0d\u540c\u7684\u5f62\u72b6' });
    return r.verdict === 'cannot-judge';
  });

  add('\u56fe\u7ea7 PASS \u4f46\u6709\u8865\u4e01\u7ea7\u8d8a\u7ebf \u21d2 \u21d2 \u5224\u300c\u8865\u4e01\u7ea7\u300d\uff08\u4e0d\u662f\u7ea2\uff09\uff08\u65e7\u5f62\u72b6\uff09', () => {
    const r = parseGateOutput({ code: 0, output: PASS_PATCH });
    return r.verdict === 'patch-only' && r.line === 0 && r.patch === 20 && r.maxMsrv.indexOf('1.94.1') >= 0;
  });

  add('\u56fe\u7ea7 FAIL\uff08\u7ebf\u7ea7\uff09\u21d2 \u21d2 \u5224\u300c\u7ebf\u7ea7\u8d8a\u7ebf\u300d\uff08\u771f\u7ea2\u706f\uff09\uff08\u65e7\u5f62\u72b6\uff09', () => {
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

  add('\u5224\u4e0d\u4e86\u5fc5\u987b\u5e26\u539f\u56e0\uff08\u5426\u5219\u5b83\u662f\u4e00\u4e2a\u6c38\u8fdc\u7684\u9ed1\u6d1e\uff09', () => {
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

  add('strict \u6a21\u5f0f\uff1a\u53ea\u6709\u8865\u4e01\u7ea7\u2192 \u21d2 \u4e0d\u5224\u7ea2\uff08\u65e7\u5f62\u72b6\uff09', () => {
    const s = censusVerdict([{ repo: 'a', verdict: 'patch-only' }, { repo: 'b', verdict: 'clean' }]);
    return s.strictFail === false && s.patchOnly === 1 && s.clean === 1;
  });

  add('\u65b0\u53e3\u5f84\uff1a**\u8d8a\u4e86\u81ea\u62a5\u627f\u8bfa** \u21d2 \u21d2 \u5224\u7ea2\uff08\u65b0\u5f62\u72b6\uff09\uff1b\u5224\u4e0d\u4e86\u4e0d\u5224\u7ea2', () => {
    const rows = [
      { repo: 'a', verdict: 'violation', line: 0, patch: 20 },
      { repo: 'b', verdict: 'cannot-judge' },
      { repo: 'c', verdict: 'clean' },
    ];
    const s = censusVerdict(rows);
    return s.strictFail === true && s.violation === 1 && s.patch === 1 && s.cannot === 1 && s.clean === 1;
  });

  add('\u65b0\u53e3\u5f84\uff1a**\u5168\u90e8\u5e72\u51c0** \u21d2 \u21d2 \u4e0d\u5224\u7ea2', () => {
    const s = censusVerdict([{ repo: 'a', verdict: 'clean' }, { repo: 'b', verdict: 'clean' }]);
    return s.strictFail === false && s.clean === 2 && s.violation === 0;
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
  console.log('  \u5224\u636e\u81ea\u68c0\uff1a' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('\u274c \u81ea\u68c0\u6ca1\u8fc7 \u21d2 \u672c\u811a\u672c\u7684\u5224\u8bfb\u4e0d\u53ef\u4fe1');
    process.exit(1);
  }
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
  console.log('\u21d2 \u21d2 MSRV \u5730\u677f\u8de8\u4ed3\u666e\u67e5\uff08**\u5206\u4ed3\u5730\u677f**\uff1a\u6bcf\u4ed3\u81ea\u62a5 \u21d2 \u53ea\u62a5\u4e0d\u5224\u7ea2\uff09');
  const rows = manifests.map((m) => {
    const r = runGate(gatePath, m.manifest);
    return { repo: m.repo, kind: m.kind, ...r };
  });
  const LABEL = {
    clean: '\u5e72\u51c0',
    violation: '\u8d8a\u7ebf\uff08\u8d8a\u4e86\u81ea\u62a5\u627f\u8bfa\uff09',
    'line-violation': '\u7ebf\u7ea7\u8d8a\u7ebf\uff08\u771f\u7ea2\u706f\uff09',
    'patch-only': '\u8865\u4e01\u7ea7\u8d8a\u7ebf',
    'cannot-judge': '\u5224\u4e0d\u4e86',
  };
  for (const r of rows) {
    const floor = r.floor ? '\u81ea\u62a5 ' + r.floor : '\u81ea\u62a5 \u2014';
    console.log(
      '  ' + (r.repo + ' (' + r.kind + ')').padEnd(28) + ' :: ' + (LABEL[r.verdict] || r.verdict) + ' :: ' + floor +
        ' \uff5c \u8d8a\u7ebf ' + r.violations + '\uff08\u8de8\u7ebf ' + r.line + ' \uff5c \u8865\u4e01\u7ea7 ' + r.patch + '\uff09' +
        (r.maxMsrv ? ' :: ' + r.maxMsrv : '') +
        (r.verdict === 'cannot-judge' && r.reason ? '\n      \u21d2 \u539f\u56e0 :: ' + r.reason : ''),
    );
  }
  const s = censusVerdict(rows);
  console.log(
    'CENSUS :: \u5e72\u51c0 ' + s.clean + ' \uff5c \u8d8a\u7ebf ' + s.violation + '\uff08\u8de8\u7ebf ' + s.line + ' \uff5c \u8865\u4e01\u7ea7 ' + s.patch + '\uff09' +
      ' \uff5c \u5224\u4e0d\u4e86 ' + s.cannot + ' \uff5c \u4ed3\u6570 ' + rows.length,
  );
  // ⚠️ **把结论落到 step summary** —— 否则「只报」只存在日志里。
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      const lines = [];
      lines.push('## MSRV 地板跨仓普查（**分仓地板**：每仓自报｜只报不判红）');
      lines.push('');
      lines.push('| 仓 | 类型 | 结论 | 自报地板 | 越线 | 跨线 | 补丁级 | 依赖图最高 MSRV |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const r of rows) {
        lines.push(
          '| ' + r.repo + ' | ' + r.kind + ' | ' + (LABEL[r.verdict] || r.verdict) + ' | ' + (r.floor || '-') + ' | ' +
            r.violations + ' | ' + r.line + ' | ' + r.patch + ' | ' + (r.maxMsrv || '-') + ' |' +
            (r.verdict === 'cannot-judge' && r.reason ? ' ' + r.reason : '') + ' |',
        );
      }
      lines.push('');
      lines.push('CENSUS :: 干净 ' + s.clean + ' ｜ 越线 ' + s.violation + '（跨线 ' + s.line + ' ｜ 补丁级 ' + s.patch + '）｜ 判不了 ' + s.cannot + ' ｜ 仓数 ' + rows.length);
      if (s.reds.length > 0) {
        lines.push('');
        lines.push('⚠️ **越线（该仓自报的地板被自己的依赖打破 —— 谁的仓谁自己改）**：');
        for (const r of s.reds) lines.push('- ' + r.repo + ' :: 自报 ' + (r.floor || '?') + ' ｜ 越线 ' + r.violations + ' 项（' + (r.maxMsrv || '?') + '）');
      }
      writeFileSync(summaryPath, lines.join('\n') + '\n', { flag: 'a' });
    } catch (err) {
      console.log('\u26a0\ufe0f step summary \u5199\u4e0d\u8fdb\uff1a' + String(err));
    }
  }
  if (s.reds.length > 0) {
    console.log('\u26a0\ufe0f \u8d8a\u7ebf\uff08**\u8be5\u4ed3\u81ea\u62a5\u7684\u5730\u677f\u88ab\u81ea\u5df1\u7684\u4f9d\u8d56\u6253\u7834** \u21d2 \u21d2 \u9ed8\u8ba4\u53ea\u62a5\u4e0d\u5224\u7ea2\uff09\uff1a');
    for (const r of s.reds) console.log('     \u00b7 ' + r.repo + ' :: \u81ea\u62a5 ' + (r.floor || '?') + ' \uff5c \u8d8a\u7ebf ' + r.violations + ' \u9879\uff08' + (r.maxMsrv || '?') + '\uff09');
  }
  if (strict && s.strictFail) {
    console.error('\u274c strict \u6a21\u5f0f\uff1a\u6709\u8d8a\u7ebf\u21d2 \u21d2 \u5224\u7ea2');
    process.exit(1);
  }
  process.exit(0);
}

main();
