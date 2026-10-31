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
 *   2. **打包进 APK 的那份 `.so`**：它必须真的含有全部 JNI 符号。
 *      符号清单的来源是 `encephalon/src/mobile/jni.rs`（Rust 侧导出），
 *      **不是手抄的常量** ⇒ 端脑新增入口时这里自动跟着变。
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

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 兄弟仓（Rust 侧大脑）—— 与 `build-android.ps1` 里的相对布局一致。 */
const SIBLING = resolve(ROOT, '..', 'encephalon');

const KOTLIN_RT =
  'shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/EncephalonRuntime.kt';
const JAVA_STUB =
  'scripts/jni-host-test/src/com/ibloc/shadow/EncephalonRuntime.java';
const RUST_JNI_SRC = 'src/mobile/jni.rs';
const SO_RELPATH = 'shadow-mobile/android/app/src/main/jniLibs/arm64-v8a/libencephalon.so';

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

/** Rust 侧导出的 JNI 方法名（去掉固定前缀）。 */
function rustExportedMethods(src) {
  const out = new Set();
  const re = /fn\s+Java_com_ibloc_shadow_EncephalonRuntime_([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return [...out].sort();
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
// 2. 打包进 APK 的那份 .so
// ---------------------------------------------------------------------------
console.log('');
console.log('▶ 2. 打包进 APK 的那份 libencephalon.so');

const rustPath = join(SIBLING, RUST_JNI_SRC);
const soPath = join(ROOT, SO_RELPATH);

if (!existsSync(rustPath)) {
  warn(
    `找不到兄弟仓里的 ${RUST_JNI_SRC} —— 符号清单没法定出来。` +
      `本机三仓同在时它必须查得出来。`,
  );
} else if (!existsSync(soPath)) {
  warn(`${SO_RELPATH} 不存在 —— 还没编过 .so（跑 encephalon/scripts/build-android.ps1）。`);
} else {
  const required = rustExportedMethods(readFileSync(rustPath, 'utf8'));
  if (required.length === 0) {
    fail(`在 ${RUST_JNI_SRC} 里一个 JNI 符号都没解析出来 —— 核验会变成假绿。`);
  } else {
    const so = readFileSync(soPath);
    const soText = so.toString('latin1');
    const missing = required.filter((sym) => !soText.includes(sym));
    const mtime = statSync(soPath).mtime.toLocaleString('sv-SE').replace('T', ' ');
    if (missing.length) {
      fail(
        `这份 .so 缺 ${missing.length} 个 JNI 符号：${missing.join(', ')}\n` +
          `    ⇒ 它不是当前源码编译出来的（多半是拷了旧的/别的 worktree 的产物）。\n` +
          `    ⇒ 装上去的话，Kotlin 会把 UnsatisfiedLinkError catch 掉 ⇒ 相关功能**静默失效**\n` +
          `      （端脑面上锁失效 = 同设备任意 App 能换掉「这台机器是谁」）。`,
      );
    } else {
      pass(`${required.length} 个 JNI 符号全部在位（${mtime}，${(so.length / 1048576).toFixed(1)} MB）`);
    }
  }
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
