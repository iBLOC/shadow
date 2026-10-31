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
 *      ⇒ 这是**集成测试壳** ⇒ 装上去**白屏**（入口在等测试驱动）。
 *      反之若含 `package:shadow_mobile/main.dart` ⇒ 正牌入口。
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
 *
 * 退出码 0 = 通过；1 = 有阻断问题。
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
// 参数
// ---------------------------------------------------------------------------
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const APK = argValue('--apk') ?? DEFAULT_APK;

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
  warn(
    `${APK} 不存在 —— 还没构建（或在别的路径）。\n` +
      `    ⇒ 这一项在完整环境里是**阻断**的：` +
      `cd shadow-mobile && flutter build apk --debug --target=lib/main.dart`,
  );
  console.log('');
  console.log(line);
  console.log(`通过（${warned} 条提示）。`);
  console.log(line);
  process.exit(0);
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
  if (!entries.includes(KERNEL)) {
    warn(
      `APK 里没有 ${KERNEL} —— 这是 release APK（debug 才有 kernel blob）⇒ **判不了入口**。\n` +
        `    ⇒ 确认构建时**没有**带 --target=integration_test/… （带了就装上去白屏）。`,
    );
  } else {
    extractMembers(apkPath, [KERNEL], work);
    const blob = readFileSync(join(work, 'assets/flutter_assets/kernel_blob.bin'));
    const text = blob.toString('latin1');
    const isShell =
      text.includes('IntegrationTestWidgetsFlutterBinding') || text.includes('package:integration_test');
    const hasRealEntry = text.includes('package:shadow_mobile/main.dart');
    if (isShell) {
      fail(
        '这个 APK 是**集成测试壳**（`IntegrationTestWidgetsFlutterBinding` / `package:integration_test` 在里面）\n' +
          '    ⇒ 装上去是**纯白屏**：入口在等测试驱动，`main()` 根本没跑到起端脑那一步。\n' +
          '    ⇒ 修法：重新构建并指定正牌入口 ⇒ flutter build apk --debug --target=lib/main.dart\n' +
          '      （或直接 flutter run —— 它默认就是 lib/main.dart）。',
      );
    } else if (hasRealEntry) {
      pass(`正牌入口（kernel blob 里有 package:shadow_mobile/main.dart）`);
    } else {
      warn(
        'kernel blob 里既没有集成测试壳的痕迹，也没有 `package:shadow_mobile/main.dart` ⇒ 判不准，\n' +
          '    ⇒ 人工确认一下构建时用的 --target。',
      );
    }
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
      const missing = required.filter((sym) => !elf.dynstr.includes(sym));
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
    const missingDeps = needShipped.filter((n) => !shipped.includes(n));
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
