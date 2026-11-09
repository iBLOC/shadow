#!/usr/bin/env node
/**
 * APK 产物级一致性守卫 —— 查**真正装进手机**的那份东西。
 *
 * ## 为什么要有这个（`check-jni-surface.mjs` 之外的那一层）
 *
 * `check-jni-surface.mjs` 查的是 `jniLibs/` 里那份 `.so` —— 那是**源码目录**。
 * 而**装到手机上的是 APK 里那份**。两者可以不同步：
 *
 *   - APK 是几小时前构建的 ⇒ 里面躺着一份**旧二进制**（jniLibs 已经更新了）；
 *   - `jniLibs/` 里甚至已经删掉了某个 ABI，而 APK 里还带着它。
 *
 * ⚠️ 2026-10-31 真机上两份都撞到了：装上去的 APK **是用
 * `--target=integration_test/…` 编的测试壳** ⇒ 启动后**纯白屏**；
 * 而它 arm64 里那份 `.so` 缺 `nativeSetAdminToken` ⇒ admin token 送不到端脑
 * ⇒ 手机上的 admin 面**仍然是敞开的**（而 App 完全正常、零报错）。
 *
 * ⇒ **装机之前**应当能一眼看出这两件事。
 *
 * ## 它查什么
 *
 *   1. **入口是不是正牌 App**：`assets/flutter_assets/kernel_blob.bin` 里
 *      若含 `IntegrationTestWidgetsFlutterBinding` / `package:integration_test`
 *      ⇒ 这是**集成测试壳** ⇒ **当 App 手动启动会白屏**（入口在等测试驱动）。
 *      ⚠️ 但**测试壳在测试驱动下是能起端脑的**（测试入口不走 `main.dart`，
 *      直接走 MethodChannel）⇒ ⇒ 端脑面的真机复验**在测试壳上成立**。
 *      ⇒ 所以「是不是测试壳」不是缺陷，「**把测试壳当 App 装**」才是 ⇒
 *      ⇒ 用 `--expect test-shell` 显式声明用途 ⇒ 那就不判它错。
 *      ⚠️ release APK 没有 `kernel_blob.bin` ⇒ 判不了 ⇒ 报 warning 并说清怎么查。
 *   2. **APK 里每一份 `libencephalon.so`**（逐 ABI）：是否含全部 JNI 符号
 *      （清单取自 `encephalon/src/mobile/jni.rs`，**不是手抄常量**）。
 *   3. **APK 里那份 `.so` 的 `DT_NEEDED`**：非系统库必须**在同一个 ABI 目录**里
 *      （缺一个 ⇒ `System.loadLibrary` 直接失败 ⇒ 那个 ABI 启动即崩）。
 *   4. **APK 里那份 ↔ `jniLibs` 那份**：逐字节比对（sha256）。
 *      不一致 ⇒ 你装的是**旧 APK**（或新编了 `.so` 却没重打 APK）。
 *
 * ## 用法
 *
 *   node scripts/check-apk-surface.mjs
 *   node scripts/check-apk-surface.mjs --apk path/to/app-debug.apk
 *   node scripts/check-apk-surface.mjs --expect test-shell   # 这份就是要当集成测试壳用
 *
 * 退出码 0 = 通过；1 = 有阻断问题；2 = 参数错。
 *
 * ## 怎么证明它**有分辨力**（不是恒红）
 *
 * 守卫的每一项都要能被单独证伪 ⇒ 用 `scripts/make-fake-apk.mjs` 造两份
 * **只差入口标记**的对照包（里面的 `libencephalon.so` 是**同一份真二进制**）：
 *
 *   - `apk_fake_good.zip`（`package:shadow_mobile/main.dart`）⇒ 第 1 项应**绿**
 *   - `apk_fake_shell.zip`（`IntegrationTestWidgetsFlutterBinding`）⇒ 第 1 项应**红**
 *
 * ⇒ 第 1 项**一绿一红**；第 2/3 项两份**必须一致**
 *   （第 2 项若红，那是 `.so` 本身的**真缺口**，与入口无关 —— 那不是假绿）。
 *
 * ## 依赖
 *
 *   - `tar`（Windows 10+ 自带 bsdtar，可读 zip ⇒ 可直接读 APK）
 *   - 兄弟仓 `encephalon/`（拿 JNI 符号清单；找不到 ⇒ 只报 warning）
 */

import {
  existsSync,
  statSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  createReadStream,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readElfInfo, rustExportedMethods, SYSTEM_LIBS } from './lib/jni.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 兄弟仓（Rust 侧大脑）—— 与 `build-android.ps1` 里的相对布局一致。 */
const SIBLING = resolve(ROOT, '..', 'encephalon');
const RUST_JNI_SRC = 'src/mobile/jni.rs';

const APK_DIR = 'shadow-mobile/build/app/outputs/flutter-apk';
const DEFAULT_APK = `${APK_DIR}/app-debug.apk`;
const JNI_LIBS_DIR = 'shadow-mobile/android/app/src/main/jniLibs';
const SO_NAME = 'libencephalon.so';

// ---------------------------------------------------------------------------
// 判据纯函数（零 I/O）⇒ ⇒ 自检能喂合成夹具证伪它们
// ---------------------------------------------------------------------------

/**
 * 入口判定 —— 「kernel blob 里有什么」＋「本次声明的用途是什么」⇒ ⇒ 一个结论。
 *
 * ⚠️ 为什么要抽成纯函数：这一项以前**长在主流程里**（读 APK → 抽文件 → 判字样）
 * ⇒ ⇒ 自检根本够不着它 ⇒ ⇒ 要证伪它就得先造一个 APK ⇒ ⇒ 于是没有自检。
 * ⇒ ⇒ 抽成纯函数后 ⇒ ⇒ 自检直接喂几段**假的 kernel blob 文本**就够。
 *
 * @param {{hasKernel: boolean, text: string, expect: string}} input
 * @returns {{verdict: 'pass'|'fail'|'warn', reason: string, message: string}}
 */
function judgeEntry({ hasKernel, text, expect }) {
  if (!hasKernel) {
    return {
      verdict: 'warn',
      reason: 'no-kernel',
      message: 'APK 里没有 kernel_blob.bin（release APK）⇒ 判不了入口',
    };
  }
  const body = String(text || '');
  const isShell =
    body.includes('IntegrationTestWidgetsFlutterBinding') || body.includes('package:integration_test');
  const hasRealEntry = body.includes('package:shadow_mobile/main.dart');
  if (isShell) {
    if (expect === 'test-shell') {
      return {
        verdict: 'pass',
        reason: 'declared-test-shell',
        message: '这是集成测试壳，而本次声明的用途就是 --expect test-shell ⇒ 不判错',
      };
    }
    return {
      verdict: 'fail',
      reason: 'test-shell-as-app',
      message: '这个 APK 是集成测试壳 ⇒ 当 App 装会纯白屏',
    };
  }
  if (hasRealEntry) {
    return {
      verdict: 'pass',
      reason: 'real-entry',
      message: '正牌入口（kernel blob 里有 package:shadow_mobile/main.dart）',
    };
  }
  return {
    verdict: 'warn',
    reason: 'unknown-entry',
    message: 'kernel blob 里既没有集成测试壳的痕迹，也没有正牌入口 ⇒ 判不准',
  };
}

/** JNI 符号是否齐 —— 纯函数。 */
function judgeSymbols(required, dynstr) {
  const need = required || [];
  const have = String(dynstr || '');
  return { total: need.length, missing: need.filter((sym) => !have.includes(sym)) };
}

/** 运行时依赖是否在同一个 ABI 目录里 —— 纯函数。 */
function judgeDeps(needShipped, shipped) {
  const need = needShipped || [];
  const have = shipped || [];
  return { total: need.length, missing: need.filter((n) => !have.includes(n)) };
}

/** APK 在不在位 —— 「不在」是**判不了**，不是「没问题」。 */
function judgeApkPresence(exists) {
  return { verdict: exists ? 'ok' : 'cannot-judge' };
}

// ---------------------------------------------------------------------------
// 判据自检 —— 喂合成夹具 ⇒ ⇒ **不需要 APK、不需要兄弟仓**
// ---------------------------------------------------------------------------
function runSelfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('正牌入口 ＋ 声明用途是 app ⇒ ⇒ 绿', () => {
    const r = judgeEntry({
      hasKernel: true,
      text: 'xx package:shadow_mobile/main.dart xx',
      expect: 'app',
    });
    return r.verdict === 'pass' && r.reason === 'real-entry';
  });

  add('孪生：集成测试壳 ＋ 声明用途是 app ⇒ ⇒ 红（当 App 装会白屏）', () => {
    const r = judgeEntry({
      hasKernel: true,
      text: 'xx IntegrationTestWidgetsFlutterBinding xx',
      expect: 'app',
    });
    return r.verdict === 'fail' && r.reason === 'test-shell-as-app';
  });

  add('孪生：同一个测试壳 ＋ 声明用途是 test-shell ⇒ ⇒ 绿（用途已声明）', () => {
    const r = judgeEntry({
      hasKernel: true,
      text: 'xx IntegrationTestWidgetsFlutterBinding xx',
      expect: 'test-shell',
    });
    return r.verdict === 'pass' && r.reason === 'declared-test-shell';
  });

  add('孪生：既不是测试壳也不是正牌入口 ⇒ ⇒ 判不准（warn，不是绿）', () => {
    const r = judgeEntry({ hasKernel: true, text: 'xx 什么痕迹都没有 xx', expect: 'app' });
    return r.verdict === 'warn' && r.reason === 'unknown-entry';
  });

  add('孪生：release APK（没有 kernel blob）⇒ ⇒ 判不了入口（warn）', () => {
    const r = judgeEntry({ hasKernel: false, text: '', expect: 'app' });
    return r.verdict === 'warn' && r.reason === 'no-kernel';
  });

  add('JNI 符号齐 ⇒ ⇒ 一个不缺', () => {
    const r = judgeSymbols(['nativeSetAdminToken', 'nativeGetState'], 'nativeSetAdminToken nativeGetState');
    return r.total === 2 && r.missing.length === 0;
  });

  add('孪生：少一个 JNI 符号 ⇒ ⇒ 恰好缺 1 个且点名', () => {
    const r = judgeSymbols(['nativeSetAdminToken', 'nativeGetState'], 'nativeSetAdminToken');
    return r.missing.length === 1 && r.missing[0] === 'nativeGetState';
  });

  add('运行时依赖齐 ⇒ ⇒ 一个不缺', () => {
    const r = judgeDeps(['libfoo.so'], ['libfoo.so', 'libbar.so']);
    return r.total === 1 && r.missing.length === 0;
  });

  add('孪生：缺一个运行时依赖 ⇒ ⇒ 恰好缺 1 个且点名（装上就崩）', () => {
    const r = judgeDeps(['libfoo.so', 'libbaz.so'], ['libfoo.so']);
    return r.missing.length === 1 && r.missing[0] === 'libbaz.so';
  });

  add('APK 不在位 ⇒ ⇒ 判不了（不是「没问题」）', () => {
    return judgeApkPresence(false).verdict === 'cannot-judge';
  });

  add('孪生：APK 在位 ⇒ ⇒ 判得了', () => {
    return judgeApkPresence(true).verdict === 'ok';
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

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const APK = argValue('--apk') ?? DEFAULT_APK;

/**
 * 这份 APK 是**拿来当 App 装**的（默认），还是**拿来当集成测试壳**的？
 *
 * ⚠️ 这两种用法**不是一回事**（2026-10-31 真机上分别验过）：
 *   - **测试壳 + 测试驱动**（`flutter test integration_test/…` 或
 *     `flutter run --target=integration_test/…`）⇒ 测试入口**不走 `main.dart`**，
 *     直接走 MethodChannel 起端脑 ⇒ **端脑照样起来、钥匙照样递进去**
 *     ⇒ 端脑面的真机复验**在测试壳上是成立的**；
 *   - **测试壳 + 手动启动**（`am start` / 装给用户当 App 用）⇒ 入口在**等测试
 *     驱动** ⇒ 没有驱动 ⇒ **`main()` 根本没跑到起端脑那一步** ⇒ **纯白屏**。
 *
 * ⇒ 所以「是不是测试壳」本身**不是缺陷**；缺陷是「**把测试壳当 App 装**」。
 * ⇒ 用 `--expect test-shell` 显式声明用途 ⇒ 那就不判它错。
 */
const EXPECT = argValue('--expect') ?? 'app';
if (!['app', 'test-shell'].includes(EXPECT)) {
  console.error(`--expect 只能是 app 或 test-shell（收到：${EXPECT}）`);
  process.exit(2);
}

// ⚠️ 自检**必须抢在「依赖环境的分支」之前** ⇒ ⇒ 否则它在 CI 上永远轮不到。
if (process.argv.includes('--self-test')) {
  runSelfTest();
}

const line = '═'.repeat(72);
console.log(line);
console.log('APK 产物级一致性校验 —— 查「真正装进手机的那份」');
console.log(line);

let failed = 0;
let warned = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed++;
}
function warn(msg) {
  console.warn(`  ! ${msg}`);
  warned++;
}
function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 列 APK 里的所有条目。 */
function apkEntries(apkPath) {
  const res = spawnSync('tar', ['-tf', apkPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`tar -tf 失败：${res.stderr || res.stdout || res.status}`);
  }
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/** 把 APK 里的若干条目抽到临时目录。 */
function extractMembers(apkPath, members, destDir) {
  if (members.length === 0) return;
  const res = spawnSync('tar', ['-xf', apkPath, '-C', destDir, ...members], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`tar -xf 失败：${res.stderr || res.stdout || res.status}`);
  }
}

function sha256(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const h = createHash('sha256');
    const s = createReadStream(path);
    s.on('error', rejectPromise);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolvePromise(h.digest('hex')));
  });
}

// ---------------------------------------------------------------------------
// 0. APK 在不在
// ---------------------------------------------------------------------------
const apkPath = resolve(ROOT, APK);
console.log('');
console.log(`▶ 0. APK 本身（${APK}）`);

if (!existsSync(apkPath)) {
  // ⚠️ **「还没构建」不是「没问题」** —— 它是**判不了**。
  //    以前这里 exit 0（绿）⇒ ⇒ 「没构建 APK」被读成「APK 没问题」
  //    ⇒ ⇒ 失败长得像成功 ⇒ ⇒ 现在改成退出码 2（判不了）。
  warn(
    `${APK} 不存在 —— 还没构建（或在别的路径）⇒ ⇒ **判不了**（不是「没问题」）。\n` +
      `    ⇒ 在完整环境里这一项是**阻断**的：` +
      `cd shadow-mobile && flutter build apk --debug --target=lib/main.dart`,
  );
  console.log('');
  console.log(line);
  console.log(`判不了（${warned} 条提示）—— APK 不在位，本闸给不出结论。`);
  console.log(line);
  process.exit(2);
}

const apkStat = statSync(apkPath);
pass(`存在（${apkStat.mtime.toLocaleString('sv-SE').replace('T', ' ')}，${(apkStat.size / 1048576).toFixed(1)} MB）`);

// 同一个目录下还有别的 APK？提醒一下（split-per-abi / release 各一份）
try {
  const apkDir = dirname(apkPath);
  const siblings = readdirSync(apkDir)
    .filter((f) => f.endsWith('.apk') && join(apkDir, f) !== apkPath);
  if (siblings.length) {
    warn(`同一个目录里还有别的 APK：${siblings.join(', ')} —— 它们**各自**要查（用 --apk 指定）。`);
  }
} catch {
  /* 目录不存在：无所谓 */
}

// ---------------------------------------------------------------------------
// 准备：列条目 + 解出要看的几个文件
// ---------------------------------------------------------------------------
let entries;
try {
  entries = apkEntries(apkPath);
} catch (err) {
  fail(`读不了这个 APK（${err.message}）—— 它可能不是有效的 zip。`);
  entries = [];
}

const work = mkdtempSync(join(tmpdir(), 'apk-surface-'));

const abiOf = (entry) => {
  const m = /^lib\/([^/]+)\//.exec(entry);
  return m ? m[1] : null;
};

/** APK 里带了 `libencephalon.so` 的那些 ABI。 */
const apkAbis = [...new Set(entries.filter((e) => e.endsWith(`/${SO_NAME}`)).map(abiOf))].sort();

/** APK 里每个 ABI 目录下的库清单。 */
const apkLibsOf = (abi) =>
  entries.filter((e) => e.startsWith(`lib/${abi}/`) && e.endsWith('.so')).map((e) => e.split('/').pop());

try {
  // -----------------------------------------------------------------------
  // 1. 入口是不是正牌 App
  // -----------------------------------------------------------------------
  console.log('');
  console.log('▶ 1. 入口是不是正牌 App（不是集成测试壳）');

  const KERNEL = 'assets/flutter_assets/kernel_blob.bin';
  const hasKernel = entries.includes(KERNEL);
  let kernelText = '';
  if (hasKernel) {
    extractMembers(apkPath, [KERNEL], work);
    const blob = readFileSync(join(work, 'assets/flutter_assets/kernel_blob.bin'));
    kernelText = blob.toString('latin1');
  }
  // 判定走纯函数 ⇒ ⇒ 自检喂夹具就能证伪它（以前它长在主流程里 ⇒ ⇒ 够不着）。
  const entry = judgeEntry({ hasKernel, text: kernelText, expect: EXPECT });
  if (entry.reason === 'no-kernel') {
    warn(
      `APK 里没有 ${KERNEL} —— 这是 release APK（debug 才有 kernel blob）⇒ **判不了入口**。\n` +
        `    ⇒ 确认构建时**没有**带 --target=integration_test/… （带了就装上去白屏）。`,
    );
  } else if (entry.reason === 'unknown-entry') {
    warn(
      'kernel blob 里既没有集成测试壳的痕迹，也没有 `package:shadow_mobile/main.dart` ⇒ 判不准，\n' +
        '    ⇒ 人工确认一下构建时用的 --target。',
    );
  } else if (entry.verdict === 'fail') {
    fail(
      '这个 APK 是**集成测试壳**（`IntegrationTestWidgetsFlutterBinding` / `package:integration_test` 在里面）\n' +
        '    ⇒ **当 App 装会纯白屏**：入口在等测试驱动，`main()` 根本没跑到起端脑那一步。\n' +
        '    ⇒ 修法：重新构建并指定正牌入口 ⇒ flutter build apk --debug --target=lib/main.dart\n' +
        '      （或直接 flutter run —— 它默认就是 lib/main.dart）。\n' +
        '    ⇒ 若这份**就是要当集成测试壳用**，加 `--expect test-shell` 显式声明用途即可。',
    );
  } else if (entry.reason === 'declared-test-shell') {
    pass(
      '这是**集成测试壳**，而本次声明的用途就是 `--expect test-shell` ⇒ 不判错。\n' +
        '      ⇒ ⚠️ 它**只能**配 `flutter test integration_test/…`（或 `flutter run --target=integration_test/…`）用；\n' +
        '        **手动 am start / 装给用户当 App 用 ⇒ 纯白屏**（入口在等测试驱动，main() 没跑到起端脑）。',
    );
  } else {
    pass(`正牌入口（kernel blob 里有 package:shadow_mobile/main.dart）`);
  }

  // -----------------------------------------------------------------------
  // 2 + 3. APK 里那份 .so 的符号与运行时依赖
  // -----------------------------------------------------------------------
  console.log('');
  console.log(`▶ 2. APK 里每一份 ${SO_NAME}（逐 ABI）`);

  const rustPath = join(SIBLING, RUST_JNI_SRC);
  let required = [];
  if (!existsSync(rustPath)) {
    warn(
      `找不到兄弟仓里的 ${RUST_JNI_SRC} —— 符号清单没法定出来。\n` +
        `    ⇒ 本机三仓同在时它必须查得出来。`,
    );
  } else {
    required = rustExportedMethods(readFileSync(rustPath, 'utf8'));
    if (required.length === 0) {
      fail(`在 ${RUST_JNI_SRC} 里一个 JNI 符号都没解析出来 —— 核验会变成假绿。`);
      required = [];
    }
  }

  if (apkAbis.length === 0) {
    fail(
      `APK 里**一个** ${SO_NAME} 都没有（lib/ 下只有插件自带的库）⇒ 端脑根本没进包 ⇒ 装了也不能用。\n` +
        `    ⇒ 修法：把编好的 .so 放进 shadow-mobile/android/app/src/main/jniLibs/<abi>/ 再重打 APK。`,
    );
  }

  const extracted = [];
  for (const abi of apkAbis) {
    const member = `lib/${abi}/${SO_NAME}`;
    try {
      extractMembers(apkPath, [member], work);
    } catch (err) {
      fail(`ABI ${abi}：从 APK 里抽出 ${SO_NAME} 失败（${err.message}）`);
      continue;
    }
    const p = join(work, 'lib', abi, SO_NAME);
    const elf = readElfInfo(p);
    if (elf.error) {
      fail(`ABI ${abi}：解析 ${SO_NAME} 失败（${elf.error}）—— **不能跳过**，跳过就变成假绿。`);
      continue;
    }
    extracted.push({ abi, path: p });

    if (required.length) {
      const { missing } = judgeSymbols(required, elf.dynstr);
      if (missing.length) {
        fail(
          `ABI ${abi}：APK 里这份 ${SO_NAME} 缺 ${missing.length} 个 JNI 符号：${missing.join(', ')}\n` +
            `    ⇒ **装到手机上就是这份** ⇒ Kotlin 会把 UnsatisfiedLinkError catch 掉 ⇒ 相关功能**静默失效**\n` +
            `      （端脑面上锁失效 = 同设备任意 App 能换掉「这台机器是谁」）。\n` +
            `    ⇒ 修法：重编 .so（encephalon/scripts/build-android.ps1）→ **重打 APK** → 再查一遍。`,
        );
      } else {
        pass(`ABI ${abi}：${required.length} 个 JNI 符号全部在位`);
      }
    }

    const shipped = apkLibsOf(abi);
    const needShipped = elf.needed.filter((n) => !SYSTEM_LIBS.has(n));
    const { missing: missingDeps } = judgeDeps(needShipped, shipped);
    if (missingDeps.length) {
      fail(
        `ABI ${abi}：APK 里这份 ${SO_NAME} 运行时**必须**加载 ${missingDeps.join(', ')}，\n` +
          `    但 APK 的 lib/${abi}/ 里没有 ⇒ 装到 ${abi} 设备上 System.loadLibrary 直接失败（**启动即崩**）。`,
      );
    } else if (needShipped.length) {
      pass(`ABI ${abi}：运行时依赖 ${needShipped.join(', ')} ⇒ 同一个 ABI 目录里已提供`);
    }
  }

  // -----------------------------------------------------------------------
  // 4. APK 里那份 ↔ jniLibs 那份
  // -----------------------------------------------------------------------
  console.log('');
  console.log('▶ 3. APK 里那份 ↔ jniLibs 那份（逐字节）');

  const jniLibsRoot = resolve(ROOT, JNI_LIBS_DIR);
  for (const { abi, path } of extracted) {
    const src = join(jniLibsRoot, abi, SO_NAME);
    if (!existsSync(src)) {
      fail(
        `ABI ${abi}：jniLibs 里已经没有这份 ${SO_NAME} 了，但 APK 里还带着 ⇒ **你装的是旧 APK**。\n` +
          `    ⇒ 修法：重打 APK（flutter build apk --debug --target=lib/main.dart）。`,
      );
      continue;
    }
    const [hApk, hSrc] = [await sha256(path), await sha256(src)];
    if (hApk !== hSrc) {
      fail(
        `ABI ${abi}：APK 里那份与 jniLibs 里那份**不是同一份**（sha256 不同）⇒ **你装的是旧 APK**。\n` +
          `    ⇒ 修法：重打 APK（flutter build apk --debug --target=lib/main.dart）。`,
      );
    } else {
      pass(`ABI ${abi}：APK 里那份 = jniLibs 那份（sha256 ${hSrc.slice(0, 12)}…）`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('');
console.log(line);
if (failed === 0) {
  console.log(`通过（${warned} 条提示）。`);
  console.log(line);
  process.exit(0);
} else {
  console.error(`${failed} 项阻断问题。`);
  console.log(line);
  process.exit(1);
}
