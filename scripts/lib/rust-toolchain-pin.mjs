/**
 * Rust 工具链**钉住**的判据 —— 纯函数（零依赖 · 零 I/O）。
 * ============================================================================
 *
 * ## 守什么
 *
 * CI 跑 cargo 的 job ⇒ ⇒ **必须显式钉一个精确版本**（`RUST_TOOLCHAIN: '1.99.0'`
 * ＋ `rustup toolchain install`）⇒ ⇒ 否则尺子会随 Rust 发版漂移。
 *
 * ⚠️ **漂移的后果不是「变红」那么简单** —— 2026-11-05 真机实测（真 CI
 * run 42009927423）：CI 的 clippy 是 **1.99.0**，本地是 **1.96.0** ⇒ ⇒ 同一份
 * 代码本地 `-D warnings` 零 lint，CI 那把尺子报了 **15 条**
 * `clippy::double_must_use` ⇒ ⇒ 而 1.96 上那条 lint **还在 pedantic**
 * ⇒ ⇒ **本地量不出来** ⇒ ⇒ 「本地全绿」根本不构成「CI 会绿」的证据。
 *
 * ⇒ ⇒ 判据是**结构**的：凡是有 cargo 步骤的 job ⇒ ⇒ 必须能看见
 * 「钉住了哪个版本」⇒ ⇒ 钉住的位置有两个（env 与 install 步骤）⇒ ⇒
 * 两者**必须一致**（env 写 A、装 B ⇒ ⇒ 装的那把根本没被用上 ⇒ ⇒
 * **钉了等于没钉**）⇒ ⇒ 那是**假钉** ⇒ ⇒ 红。
 *
 * ## 防假绿
 *
 * · **注释是噪声** —— 判据前先剥注释（复用 `strip-comments.mjs`）⇒ ⇒ 注释里
 *   提到 `RUST_TOOLCHAIN` 不误报；
 * · **版本必须精确** —— `stable` / `nightly` / `beta` **不算钉住**
 *   （那正是漂移的来源）⇒ ⇒ 红；
 * · **跨 workflow 必须同版本** —— 两处用不同刻度 ⇒ ⇒ 「这里编过、那里编不过」
 *   ⇒ ⇒ 红；
 * · **不许只钉一半** —— 有 `RUST_TOOLCHAIN` 但**没有** install 步骤
 *   ⇒ ⇒ runner 上大概率没那个版本 ⇒ ⇒ cargo 直接报
 *   "toolchain '1.99.0' is not installed" ⇒ ⇒ 红。
 */

/** 精确版本号：`1.99.0` 这种；**不接受** channel 词。 */
export const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** 会被判成「没钉」的 channel 词。 */
export const CHANNEL_WORDS = ['stable', 'nightly', 'beta', 'master', 'main'];

/** 一个 job 里「跑 cargo」的证据。 */
export const CARGO_MARKERS = ['cargo '];

function lineOf(text, index) {
  return String(text).slice(0, Math.max(0, index)).split('\n').length;
}

/**
 * 从 workflow 文本里抽出「钉住的版本」与「装工具链的步骤」。
 * @param {string} text **已剥注释**的 workflow 正文
 * @returns {{versions: Array<string>, installs: number, cargoJobs: number}}
 */
export function scanToolchainPinning(text) {
  const body = String(text || '');
  const versions = [];
  const installs = [];

  const envRe = /RUST_TOOLCHAIN\s*:\s*['"]?([^'"\s#]+)['"]?/g;
  let m;
  while ((m = envRe.exec(body)) !== null) versions.push(m[1]);

  const installRe = /rustup\s+toolchain\s+install/g;
  while ((m = installRe.exec(body)) !== null) installs.push(m[0]);

  const jobRe = /^ {2}([A-Za-z0-9_-]+):\s*$/gm;
  const jobs = [];
  while ((m = jobRe.exec(body)) !== null) jobs.push({ name: m[1], start: m.index });
  let cargoJobs = 0;
  for (let i = 0; i < jobs.length; i += 1) {
    const end = i + 1 < jobs.length ? jobs[i + 1].start : body.length;
    const block = body.slice(jobs[i].start, end);
    if (CARGO_MARKERS.some((c) => block.includes(c))) cargoJobs += 1;
  }

  return { versions, installs: installs.length, cargoJobs };
}

/**
 * 判「这个 workflow 钉住了没有」。
 * @param {string} text **已剥注释**的 workflow 正文
 * @param {string} label 文件名（进消息用）
 * @returns {Array<object>} issues（空数组＝绿）
 */
export function findToolchainPinIssues(text, label) {
  const body = String(text || '');
  const issues = [];
  const scan = scanToolchainPinning(body);

  if (scan.cargoJobs === 0) return issues; // 根本不跑 cargo ⇒ 不归这道闸管

  if (scan.versions.length === 0) {
    issues.push({ kind: 'not-pinned', file: label, detail: '有 cargo 步骤，却没有 RUST_TOOLCHAIN' });
    return issues;
  }

  for (const v of scan.versions) {
    if (CHANNEL_WORDS.includes(v)) {
      issues.push({ kind: 'channel-not-version', file: label, detail: "RUST_TOOLCHAIN: '" + v + "' 是 channel 词，不是精确版本" });
    } else if (!EXACT_VERSION.test(v)) {
      issues.push({ kind: 'not-exact-version', file: label, detail: "RUST_TOOLCHAIN: '" + v + "' 不是精确版本号" });
    }
  }

  if (scan.installs === 0) {
    issues.push({ kind: 'no-install-step', file: label, detail: '钉了版本却没有 `rustup toolchain install` 步骤 ⇒ ⇒ runner 上未必有那个版本' });
  }

  return issues;
}

/**
 * 跨 workflow 的一致性：所有 workflow 钉的版本必须**同一个**。
 * @param {Array<{file: string, text: string}>} files
 * @returns {Array<object>} issues（空数组＝绿）
 */
export function findCrossWorkflowIssues(files) {
  const issues = [];
  const seen = new Map();
  for (const f of files || []) {
    const scan = scanToolchainPinning(String(f.text || ''));
    if (scan.cargoJobs === 0) continue;
    for (const v of scan.versions) {
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v).push(f.file);
    }
  }
  if (seen.size > 1) {
    const desc = Array.from(seen.entries()).map(([v, files2]) => v + ' (' + files2.join(', ') + ')').join('  ｜  ');
    issues.push({ kind: 'version-drift-between-workflows', file: '(跨 workflow)', detail: '不同 workflow 钉了不同版本 ⇒ ⇒ 同一套依赖用两把尺子：' + desc });
  }
  return issues;
}

/**
 * 本仓应该钉的版本（唯一真相源）—— 由调用方从仓里读出来传进来。
 */
export function expectedVersionFrom(files) {
  const all = new Set();
  for (const f of files || []) {
    const scan = scanToolchainPinning(String(f.text || ''));
    for (const v of scan.versions) if (EXACT_VERSION.test(v)) all.add(v);
  }
  if (all.size === 0) return null;
  return Array.from(all).sort()[0];
}
