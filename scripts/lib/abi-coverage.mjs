#!/usr/bin/env node
/**
 * ABI 覆盖判据 —— 「宣称支持」与「端脑运行时在位」之间的差集。
 * ============================================================================
 *
 * ## 为什么要有这个（2026-11-11 真机实测逼出来的）
 *
 * 真机 LX04（小米小爱同学 / Android 8.1.0 / SDK 27 / armeabi-v7a）上实测：
 *   - 无原生库的探针包 ⇒ Success ⇒ ⇒ **这台机上没有设备策略墙**
 *     （MIUI 的「USB 安装要插 SIM」那堵墙不存在）；
 *   - 声明 arm64 的探针包 ⇒ Failure [INSTALL_FAILED_NO_MATCHING_ABIS: ...]
 *     ⇒ ⇒ **ABI 墙是真机级存在的**。
 *
 * ⇒ ⇒ 而产物级那一读数更要紧：现行 app-debug.apk 逐字声明
 * native-code: 'arm64-v8a' 'x86_64' ⇒ ⇒ **x86_64 设备装得上**，
 * 但 APK 的 lib/x86_64/ 里**没有 libencephalon.so**
 * （只有引擎/插件/CMake 带来的 9 个库）⇒ ⇒ **端脑面在那个 ABI 上整个消失**
 * ⇒ ⇒ 而 Kotlin 侧把 UnsatisfiedLinkError catch 掉只打一行日志
 * ⇒ ⇒ ⇒ **失败长得像成功**（App 正常起来、零报错、端脑面静默缺席）。
 *
 * ⚠️ **而两道产物闸当时全绿** —— 因为它们的 ABI 枚举源是
 * 「**哪些 ABI 目录里有 libencephalon.so**」⇒ ⇒ **半成品 ABI
 * 永远不进那个列表**⇒ ⇒ ⇒ **判据的枚举源被它自己要抓的那个洞喂饱了**。
 *
 * ## 通用形态（这一条比任何一处实现都重要）
 *
 * **判据的枚举源必须来自「宣称的东西」，不能来自「已经对了的东西」。**
 * 后者会让「缺的那一份」永远不可见 ⇒ ⇒ 而那恰恰是危害最大的一档
 * （另两档已经被覆盖 ⇒ ⇒ 读起来像被管住了）。
 *
 * ## 这一层是纯函数（零 I/O）⇒ ⇒ 两个闸共用同一份实现
 *
 * ⚠️ 为什么不各写一份：两个闸各判各的 ⇒ ⇒ 迟早在同一族上分叉
 * ⇒ ⇒ 而「分叉」在这里意味着「一处说绿、另一处说红」。
 * ⇒ ⇒ 判据住在这里，**两边都调它**（同 scripts/lib/jni.mjs 的做法）。
 *
 * ## 三个集合的分工
 *
 *   - **宣称（declared）** —— 构建配置（Gradle supportedAbis）或
 *     产物（APK 的 lib/<abi>/ 目录）说「我支持这个 ABI」。
 *   - **目录（dirs）** —— 实际存在的 ABI 目录。
 *   - **在位（brain）** —— 端脑运行时（libencephalon.so）真的在那个 ABI 里。
 *
 * ⇒ ⇒ **宣称 ⊆ 目录 ⊆ 在位** ⇒ ⇒ 任何一档差集都是「半成品 ABI」。
 */

/** 从 build.gradle.kts 里读出 val supportedAbis = listOf(...) 的内容。 */
export function parseGradleSupportedAbis(text) {
  const src = String(text || '');
  const m = /val\s+supportedAbis\s*=\s*listOf\s*\(([^)]*)\)/.exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/**
 * 判据 —— 宣称支持的 ABI，端脑运行时必须在位。
 *
 * @param {{declaredAbis: string[], dirAbis: string[], brainAbis: string[]|null}} input
 *        brainAbis === null ⇒ **端脑运行时这一格读不到**（本地没编）
 *        ⇒ ⇒ 那一格是**判不了**，不是红（缺输入 ≠ 有问题）。
 * @returns {{verdict: 'pass'|'fail'|'cannot-judge', reason: string, message: string,
 *          declared: string[], withoutDir: string[], withoutBrain: string[]}}
 */
export function judgeAbiCoverage({ declaredAbis, dirAbis, brainAbis }) {
  const declared = [...new Set(declaredAbis || [])].filter(Boolean).sort();
  const base = {
    declared,
    dirs: dirAbis === null || dirAbis === undefined ? [] : [...new Set(dirAbis)].sort(),
    withoutDir: [],
    withoutBrain: [],
  };

  // ---- ABI 目录这一格读不到（整个 jniLibs 不在位）⇒ ⇒ 判不了，不是红 ----
  if (dirAbis === null || dirAbis === undefined) {
    return {
      ...base,
      verdict: 'cannot-judge',
      reason: 'dirs-not-read',
      message:
        `ABI 目录这一格 **读不到**（jniLibs 不在位）⇒ ⇒ 这一格 **判不了**` +
        `（不是「没问题」）。\n    ⇒ 宣称支持的是 ${declared.join(', ') || '—'}；` +
        `目录与运行时在位与否要等编完再判。`,
    };
  }

  const dirs = new Set(dirAbis);

  // ---- 档一：宣称支持、连 ABI 目录都没有 ----
  const withoutDir = declared.filter((a) => !dirs.has(a));
  if (withoutDir.length) {
    return {
      ...base,
      verdict: 'fail',
      reason: 'declared-without-dir',
      withoutDir,
      message:
        `宣称支持 ${withoutDir.join(', ')}，但那个 ABI **连目录都没有** ⇒ ⇒ ` +
        `它要么在产物里被漏掉（声明与产物不符），要么以「只有引擎/插件的库、` +
        `没有端脑运行时」的半成品形态进包 ⇒ ⇒ **装得上、端脑面却整个消失** ` +
        `⇒ ⇒ **失败长得像成功**。\n` +
        `    ⇒ 修法二选一：① 把那个 ABI 的端脑运行时编出来并放进它自己的目录` +
        `（源码面是 jniLibs/<abi>/，连带同目录的随包库）；\n` +
        `      ② **别宣称支持它** —— 从构建配置的 supportedAbis 里去掉 ⇒ ⇒ ` +
        `那个 ABI 直接 INSTALL_FAILED_NO_MATCHING_ABIS（**失败长得像失败**）。`,
    };
  }

  // ---- 端脑运行时这一格读不到 ⇒ ⇒ 判不了，不是红 ----
  if (brainAbis === null || brainAbis === undefined) {
    return {
      ...base,
      verdict: 'cannot-judge',
      reason: 'brain-not-built',
      message:
        `端脑运行时这一格 **读不到**（本机没编出 libencephalon.so）⇒ ⇒ ` +
        `这一格 **判不了**（不是「没问题」）。\n` +
        `    ⇒ 宣称与 ABI 目录的对应关系已核过；运行时在位与否要等编完再判。`,
    };
  }

  // ---- 档二：目录在、端脑运行时不在 ----
  const brain = new Set(brainAbis);
  const withoutBrain = declared.filter((a) => !brain.has(a));
  if (withoutBrain.length) {
    return {
      ...base,
      verdict: 'fail',
      reason: 'declared-without-brain',
      withoutBrain,
      message:
        `宣称支持 ${withoutBrain.join(', ')}，但那个 ABI 里 **没有**端脑运行时` +
        `（libencephalon.so）⇒ ⇒ **装得上、端脑面却整个消失** ⇒ ⇒ ` +
        `**失败长得像成功**。\n` +
        `（连带同目录的随包库）；\n` +
        `（连带同目录的随包库）；\n` +
        `      ② **别宣称支持它** —— 从 supportedAbis 里去掉 ⇒ ⇒ 那个 ABI 直接` +
        `装不上（**失败长得像失败**）。`,
    };
  }

  return {
    ...base,
    verdict: 'pass',
    reason: 'all-declared-have-brain',
    message:
      `宣称支持的 ${declared.length} 个 ABI` +
      `（${declared.join(', ') || '—'}）端脑运行时全部在位`,
  };
}
