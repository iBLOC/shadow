/**
 * Rust 工具链**钉住**的判据 —— 纯函数（零依赖 · 零 I/O）。
 * ============================================================================
 *
 * ## 守什么
 *
 * CI 跑 cargo 的 job ⇒ ⇒ **必须显式钉一个精确版本**，而且**钉的那把必须真的被用上**。
 *
 * ⚠️⚠️ **「装了」不等于「用了」** —— 2026-11-05 真机实测（真 CI run 42038977857）：
 * workflow 写着 `rustup toolchain install "$RUST_TOOLCHAIN"` ⇒ ⇒ 安装步骤逐字报
 * `1.99.0-x86_64-unknown-linux-gnu installed` ⇒ ⇒ **但同一段日志里**
 * `rustc --version` 打的是 **`1.99.1`**（runner 的 stable）⇒ ⇒ **钉的那把从没被用过**。
 * ⇒ ⇒ 根因：**变量名写错** —— rustup 认的是 **`RUSTUP_TOOLCHAIN`**（带 `UP`），
 * 而 `RUST_TOOLCHAIN`（少个 `UP`）**rustup 完全无视** ⇒ ⇒ 本机三段对照逐字：
 * 只设 `RUSTUP_TOOLCHAIN` ⇒ ⇒ `rustc 1.99.0` ＋ `rustup show active-toolchain` 报
 * 「overridden by environment variable RUSTUP_TOOLCHAIN」；只设 `RUST_TOOLCHAIN` ⇒ ⇒
 * 回到 stable；两个都设 ⇒ ⇒ `RUSTUP_TOOLCHAIN` 赢。
 *
 * ⚠️ **而那一轮 CI 是全绿的** ⇒ ⇒ **「绿」并不证明「钉住了」** ⇒ ⇒ 所以判据不能只看
 * 「有没有写版本号」，还要看 ❶ **变量名对不对** ❷ **有没有断言 active toolchain**。
 *
 * ## 三种坏法（都要红）
 *
 * · **变量名错**（`RUST_TOOLCHAIN` 少了 `UP`）⇒ ⇒ 装而不�� ⇒ ⇒ 红；
 * · **没装**（钉了版本却没 `rustup toolchain install`）⇒ ⇒ runner 上未必有那个版本
 *   ⇒ ⇒ cargo 直接报 "toolchain '1.99.0' is not installed" ⇒ ⇒ 红；
 * · **没断言**（没有 `rustup show active-toolchain` 的核对）⇒ ⇒ 假钉查不出来 ⇒ ⇒ 红；
 *   ⇒ ⇒ 这是**上一轮那个洞**：闸说绿、CI 说绿、而尺子压根没被换。
 *
 * ## 防假绿
 *
 * · **注释是噪声** —— 判据前先剥 YAML 注释 ⇒ ⇒ 注释里提到变量名不误报；
 * · **版本必须精确** —— `stable` / `nightly` / `beta` **不算钉住**（那正是漂移的来源）；
 * · **跨 workflow 必须同版本** —— 两处用不同刻度 ⇒ ⇒ 「这里编过、那里编不过」⇒ ⇒ 红。
 */

/** 精确版本号：`1.99.0` 这种；**不接受** channel 词。 */
export const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** 会被判成「没钉」的 channel 词。 */
export const CHANNEL_WORDS = ['stable', 'nightly', 'beta', 'master', 'main'];

/** rustup **真正认**的环境变量名（带 `UP`）。 */
export const RUSTUP_ENV = 'RUSTUP_TOOLCHAIN';

/** **错的名字** —— rustup 会完全无视它 ⇒ ⇒ 装了等于没装。 */
export const WRONG_ENV_NAMES = ['RUST_TOOLCHAIN'];

/** 一个 job 里「跑 cargo」的证据。 */
export const CARGO_MARKERS = ['cargo '];

function lineOf(text, index) {
  return String(text).slice(0, Math.max(0, index)).split('\n').length;
}

/**
 * 从 workflow 文本里抽出「钉住的版本」与「装/断言的证据」。
 * @param {string} text **已剥注释**的 workflow 正文
 * @returns {{versions: Array<string>, wrongEnv: Array<string>, installs: number,
 *          asserts: number, cargoJobs: number}}
 */
export function scanToolchainPinning(text) {
  const body = String(text || '');
  const versions = [];
  const wrongEnv = [];
  let m;

  const envRe = new RegExp(RUSTUP_ENV + "\\s*:\\s*['\"]?([^'\"\\s#]+)['\"]?", 'g');
  while ((m = envRe.exec(body)) !== null) versions.push(m[1]);

  for (const wrong of WRONG_ENV_NAMES) {
    const re = new RegExp(wrong + "\\s*:", 'g');
    while ((m = re.exec(body)) !== null) wrongEnv.push(wrong);
  }

  const installRe = /rustup\s+toolchain\s+install/g;
  let installs = 0;
  while ((m = installRe.exec(body)) !== null) installs += 1;

  const assertRe = /rustup\s+show\s+active-toolchain/g;
  let asserts = 0;
  while ((m = assertRe.exec(body)) !== null) asserts += 1;

  const jobRe = /^ {2}([A-Za-z0-9_-]+):\s*$/gm;
  const jobs = [];
  while ((m = jobRe.exec(body)) !== null) jobs.push({ name: m[1], start: m.index });
  let cargoJobs = 0;
  for (let i = 0; i < jobs.length; i += 1) {
    const end = i + 1 < jobs.length ? jobs[i + 1].start : body.length;
    const block = body.slice(jobs[i].start, end);
    if (CARGO_MARKERS.some((c) => block.includes(c))) cargoJobs += 1;
  }

  return { versions, wrongEnv, installs, asserts, cargoJobs };
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

  if (scan.wrongEnv.length > 0) {
    issues.push({
      kind: 'wrong-env-name',
      file: label,
      detail: '用了变量 `' + scan.wrongEnv[0] + '` —— rustup 认的是 `' + RUSTUP_ENV + '`（带 UP）⇒ ⇒ 装了等于没装',
    });
    // ⇒ ⇒ **直接返回**：错名字已经足够说明「钉住了是假的」⇒ ⇒ 不再叠加别的理由
    //     （否则同一个洞会报两条 ⇒ ⇒ 报数虚高 ⇒ ⇒ 读数不可比）。
    return issues;
  }

  if (scan.versions.length === 0) {
    issues.push({ kind: 'not-pinned', file: label, detail: '有 cargo 步骤，却没有 `' + RUSTUP_ENV + '`' });
    return issues;
  }

  for (const v of scan.versions) {
    if (CHANNEL_WORDS.includes(v)) {
      issues.push({ kind: 'channel-not-version', file: label, detail: RUSTUP_ENV + ': ' + v + ' 是 channel 词，不是精确版本' });
    } else if (!EXACT_VERSION.test(v)) {
      issues.push({ kind: 'not-exact-version', file: label, detail: RUSTUP_ENV + ': ' + v + ' 不是精确版本号' });
    }
  }

  if (scan.installs === 0) {
    issues.push({ kind: 'no-install-step', file: label, detail: '钉了版本却没有 `rustup toolchain install` 步骤 ⇒ ⇒ runner 上未必有那个版本' });
  }

  if (scan.asserts === 0) {
    issues.push({ kind: 'no-active-assertion', file: label, detail: '没有 `rustup show active-toolchain` 的核对 ⇒ ⇒ **假钉查不出来**（装了不等于用了）' });
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
    const desc = Array.from(seen.entries()).map(([v, f2]) => v + ' (' + f2.join(', ') + ')').join('  ｜  ');
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
