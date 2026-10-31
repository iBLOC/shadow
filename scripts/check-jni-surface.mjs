#!/usr/bin/env node
/**
 * JNI 面的**产物级**一致性守卫。
 *
 * ## 为什么要有这个
 *
 * 2026-10-31 真机上抓到过一次**静默失效**：
 *
 *   - `shadow-mobile/android/app/src/main/jniLibs/arm64-v8a/libencephalon.so`
 *     被换成了一份**旧构建**（少三个 JNI 符号）。
 *   - Kotlin 侧 `setShadowApiKey()` 把 `UnsatisfiedLinkError` **catch 掉
 *     并只打一行日志** ⇒ 端脑照常起来、但**没设上钥匙**。
 *   - ⇒ 手机上的端脑面**上锁静默失效**：同一台设备上任何别的 App 都能
 *     `POST /shadow/v1/identity` **换掉「这台机器是谁」**（记忆改写进
 *     另一个人格，旧人格的记忆「看起来消失了」），而且**不报任何错**。
 *
 * 根因不是安全设计错了，是**「装进去的是不是对的那份二进制」没人查**。
 * 这一脚本守的就是这件事。
 *
 * ## 它查什么
 *
 *   1. **Kotlin ↔ Java 替身**：宿主 JVM 直测用的 Java 替身
 *      （`encephalon/scripts/jni-host-test/.../EncephalonRuntime.java`）
 *      必须与 Android 上真正用的 Kotlin 侧**逐字对齐**（方法名 + 参数个数）。
 *      少声明一个 ⇒ 那个入口**没人验**（不是「测试红」，是「根本没有测试」）。
 *   2. **打包进 APK 的每一份 `.so`**（**逐个 ABI**，不是只看 arm64-v8a）：
 *      - 它必须真的含有全部 JNI 符号；
 *      - 它的 **ELF `DT_NEEDED`** 指向的随包动态库，必须**在同一个 ABI 目录里**
 *        （缺一个 ⇒ `System.loadLibrary` 直接失败 ⇒ 那个 ABI 装上去就崩）。
 *   3. **各 ABI 随包动态库的一致性**：一个 ABI 目录比别的 ABI 少随包库
 *      ⇒ 那个 ABI 是个**半成品**（能装、不能跑），必须补齐或整个删掉。
 *
 * ⚠️ **为什么要逐个 ABI 查**（2026-10-31 加）：
 *   这一版之前 `SO_RELPATH` **硬编码 arm64-v8a** ⇒ 别的 ABI 目录里那份
 *   `.so` **无人守**。真机上恰好就有一份：`x86_64/libencephalon.so` 是
 *   10/29 的旧产物（缺 `nativeSetShadowApiKey` ⇒ 影子锁会静默失效），
 *   而且那个目录里**没有 `libc++_shared.so`** ⇒ 装到 x86_64 设备上直接崩。
 *   ⇒ **只查一份就等于没查**：APK 里带着几份 `.so`，就要查几份。
 *
 * ## 用法
 *
 *   node scripts/check-jni-surface.mjs
 *
 * 退出码 0 = 通过；1 = 有阻断问题。
 *
 * ## 缺兄弟仓时怎么办
 *
 * `encephalon/` 是**兄弟仓**（不在这个仓库里）。找不到时：
 *   - 第 1 项（Kotlin ↔ Java 替身）**跳不过** —— 它需要 Java 替身 ⇒
 *     找不到就按 **warning** 报出（不阻断），但**明确告诉人缺了什么**。
 *   - 第 2 项同理。
 *
 * ⚠️ 之所以不硬失败：CI 上可能只 checkout 了 shadow 一个仓。但**本机**
 * （三仓同在 `C:\Projects\iBLOC\`）必须能查出来 —— 所以 warning 里写清
 * 「在完整环境里这一项是阻断的」。
 */

import {
  readFileSync,
  existsSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readElfInfo, rustExportedMethods, SYSTEM_LIBS } from './lib/jni.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 兄弟仓（Rust 侧大脑）—— 与 `build-android.ps1` 里的相对布局一致。 */
const SIBLING = resolve(ROOT, '..', 'encephalon');

const KOTLIN_RT =
  'shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/EncephalonRuntime.kt';
const JAVA_STUB =
  'scripts/jni-host-test/src/com/ibloc/shadow/EncephalonRuntime.java';
const RUST_JNI_SRC = 'src/mobile/jni.rs';

/** jniLibs 根目录 —— 下面**每个 ABI 子目录**都要查。 */
const JNI_LIBS_DIR = 'shadow-mobile/android/app/src/main/jniLibs';
const SO_NAME = 'libencephalon.so';

const line = '═'.repeat(72);
console.log(line);
console.log('JNI 面一致性校验 —— 产物级');
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

/**
 * Kotlin 侧的 native 声明：`external fun <名字>(...)`。
 * 只认**声明**形态 —— 注释里提到的名字不算。
 */
function kotlinNativeMethods(src) {
  const out = [];
  const re = /^\s*(?:private\s+)?external\s+fun\s+([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/**
 * Java 替身的 native 声明：`public static native <返回类型> <名字>(...)`。
 */
function javaNativeMethods(src) {
  const out = [];
  for (const raw of src.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t.startsWith('public static native ')) continue;
    const rest = t.slice('public static native '.length);
    const open = rest.indexOf('(');
    if (open < 0) continue;
    const head = rest.slice(0, open).trim().split(/\s+/);
    const name = head[head.length - 1];
    if (name) out.push(name);
  }
  return out;
}


function diff(a, b) {
  const setB = new Set(b);
  return a.filter((x) => !setB.has(x));
}

// ---------------------------------------------------------------------------
// 1. Kotlin ↔ Java 替身
// ---------------------------------------------------------------------------
console.log('');
console.log('▶ 1. Kotlin ↔ 宿主直测的 Java 替身');

const kotlinPath = join(ROOT, KOTLIN_RT);
const javaPath = join(SIBLING, JAVA_STUB);

if (!existsSync(kotlinPath)) {
  fail(`${KOTLIN_RT} 不存在`);
} else if (!existsSync(javaPath)) {
  warn(
    `找不到兄弟仓里的 Java 替身（${javaPath}）—— 这一项在完整环境里是**阻断**的。` +
      `本机三仓同在时它必须查得出来。`,
  );
} else {
  const kotlin = kotlinNativeMethods(readFileSync(kotlinPath, 'utf8'));
  const java = javaNativeMethods(readFileSync(javaPath, 'utf8'));

  const missingInJava = diff(kotlin, java);
  const missingInKotlin = diff(java, kotlin);

  if (missingInJava.length || missingInKotlin.length) {
    if (missingInJava.length) {
      fail(
        `Kotlin 有、Java 替身**没声明**（⇒ 这些入口没人验）：${missingInJava.join(', ')}`,
      );
    }
    if (missingInKotlin.length) {
      fail(
        `Java 替身声明了、Kotlin **没有**（⇒ 替身在撒谎）：${missingInKotlin.join(', ')}`,
      );
    }
  } else {
    pass(`${kotlin.length} 个 native 入口两边逐字对齐`);
  }
}

// ---------------------------------------------------------------------------
// 2. 打包进 APK 的每一份 .so（逐个 ABI）
// ---------------------------------------------------------------------------
console.log('');
console.log(`▶ 2. 打包进 APK 的每一份 ${SO_NAME}（逐个 ABI）`);

const rustPath = join(SIBLING, RUST_JNI_SRC);
const jniLibsRoot = join(ROOT, JNI_LIBS_DIR);

/** 每个 ABI 目录 → 该目录里随包带上的动态库（不含 .so 本体）。 */
const abiShipped = new Map();

if (!existsSync(rustPath)) {
  warn(
    `找不到兄弟仓里的 ${RUST_JNI_SRC} —— 符号清单没法定出来。` +
      `本机三仓同在时它必须查得出来。`,
  );
} else if (!existsSync(jniLibsRoot)) {
  warn(`${JNI_LIBS_DIR} 不存在 —— 还没编过 .so（跑 encephalon/scripts/build-android.ps1）。`);
} else {
  const required = rustExportedMethods(readFileSync(rustPath, 'utf8'));
  if (required.length === 0) {
    fail(`在 ${RUST_JNI_SRC} 里一个 JNI 符号都没解析出来 —— 核验会变成假绿。`);
  } else {
    const abis = readdirSync(jniLibsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    if (abis.length === 0) {
      warn(`${JNI_LIBS_DIR} 下一个 ABI 目录都没有。`);
    }

    for (const abi of abis) {
      const abiDir = join(jniLibsRoot, abi);
      const soPath = join(abiDir, SO_NAME);

      // 该 ABI 目录里随包带上的动态库（`.so` 本体除外）
      const shipped = readdirSync(abiDir)
        .filter((f) => f.endsWith('.so') && f !== SO_NAME)
        .sort();
      abiShipped.set(abi, shipped);

      if (!existsSync(soPath)) {
        warn(`ABI ${abi}：目录里有 ${shipped.length} 个随包库，但**没有** ${SO_NAME} —— 这个 ABI 是半成品。`);
        continue;
      }

      const mtime = statSync(soPath).mtime.toLocaleString('sv-SE').replace('T', ' ');
      const sizeMB = (statSync(soPath).size / 1048576).toFixed(1);
      const elf = readElfInfo(soPath);

      if (elf.error) {
        fail(
          `ABI ${abi}：解析 ${SO_NAME} 失败（${elf.error}）—— ` +
            `**不能跳过**：跳过了这份守卫就变成假绿。`,
        );
        continue;
      }

      // --- 2a. JNI 符号 ---
      const missing = required.filter((sym) => !elf.dynstr.includes(sym));
      if (missing.length) {
        fail(
          `ABI ${abi}：这份 ${SO_NAME} 缺 ${missing.length} 个 JNI 符号：${missing.join(', ')}\n` +
            `    ⇒ 它不是当前源码编译出来的（多半是拷了旧的/别的 worktree 的产物）。\n` +
            `    ⇒ 装上去的话，Kotlin 会把 UnsatisfiedLinkError catch 掉 ⇒ 相关功能**静默失效**\n` +
            `      （端脑面上锁失效 = 同设备任意 App 能换掉「这台机器是谁」）。\n` +
            `    ⇒ 修法：跑 encephalon/scripts/build-android.ps1 -Target <该 ABI 的 rust target> 重编。`,
        );
      } else {
        pass(`ABI ${abi}：${required.length} 个 JNI 符号全部在位（${mtime}，${sizeMB} MB）`);
      }

      // --- 2b. 运行时动态依赖 ---
      const needShipped = elf.needed.filter((n) => !SYSTEM_LIBS.has(n));
      const missingDeps = needShipped.filter((n) => !shipped.includes(n));
      if (missingDeps.length) {
        fail(
          `ABI ${abi}：这份 ${SO_NAME} 运行时**必须**加载 ${missingDeps.join(', ')}，` +
            `但该 ABI 目录里**没有** ⇒ 装到 ${abi} 设备上 System.loadLibrary 直接失败（**启动即崩**）。\n` +
            `    ⇒ 修法：把随包动态库也放进这个 ABI 目录，或把这个 ABI 目录整个删掉（不装就不坏）。`,
        );
      } else if (needShipped.length) {
        pass(
          `ABI ${abi}：运行时依赖 ${needShipped.join(', ')} ⇒ 同目录已提供`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. 各 ABI 随包动态库的一致性
// ---------------------------------------------------------------------------
console.log('');
console.log('▶ 3. 各 ABI 随包动态库的一致性');

if (abiShipped.size >= 2) {
  // 参照集合 = 所有 ABI 随包库的并集
  const union = new Set();
  for (const libs of abiShipped.values()) for (const l of libs) union.add(l);

  for (const [abi, libs] of abiShipped) {
    const missing = [...union].filter((l) => !libs.includes(l)).sort();
    if (missing.length) {
      fail(
        `ABI ${abi} 比别的 ABI **少了这些随包库**：${missing.join(', ')}\n` +
          `    ⇒ 这个 ABI 是个**半成品**（能装、不能跑：缺的那部分是运行时才去 dlopen 的）。\n` +
          `    ⇒ 修法二选一：① 补齐该 ABI 的随包库（⇒ 还得编对应 ABI 的 .so）；\n` +
          `      ② **把这个 ABI 目录整个删掉** —— APK 不带它 ⇒ 那个 ABI 装不上，而不是装了才崩。`,
      );
    }
  }
  if (failed === 0) {
    pass(`各 ABI 随包库集合一致（${union.size} 个）`);
  }
} else {
  console.log(`  · 只发现 ${abiShipped.size} 个 ABI 目录 —— 跨 ABI 一致性这一项跳过`);
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
