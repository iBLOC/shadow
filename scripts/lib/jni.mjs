/**
 * JNI 产物核验的**共享工具**。
 *
 * 两个守卫都要用到同一套底层事实：
 *   - `scripts/check-jni-surface.mjs` —— 查 `jniLibs/` 里那份 `.so`
 *   - `scripts/check-apk-surface.mjs`  —— 查**真正装进 APK** 的那份 `.so`
 *
 * ⚠️ 为什么不能只查一层（2026-10-31 真机踩出来的）：
 *   `jniLibs/` 是**源码目录**，`APK` 里那份是**装机产物**。两者可以不同步
 *   （APK 是几小时前构建的 ⇒ 里面躺着一份旧二进制）⇒ **只查 jniLibs 不算数**。
 *
 * ## 这里为什么用「真 ELF 解析」而不是手抄清单
 *
 * 需要的两件事：
 *   1. **导出的 JNI 符号名** ⇒ 只在 `.dynstr` 里（不是整份 `.so`）
 *   2. **运行时必须能加载到的动态库** ⇒ `DT_NEEDED`（ELF 动态段）
 *
 * 手抄清单会过期 ⇒ **解析不出来时当阻断处理**，不让这一项退化成假绿。
 */

import { openSync, readSync, closeSync } from 'node:fs';

/**
 * Android **系统自带**的动态库：不随 APK 打包也能加载 ⇒ 不要求同目录提供。
 * ⚠️ `libc++_shared.so` **不在**这个名单里 —— 它是 NDK 的 C++ 运行时，
 * **必须**随 APK 打包（仓库里 `arm64-v8a/` 那份就是 git 入库的）。
 */
export const SYSTEM_LIBS = new Set([
  'libc.so',
  'libm.so',
  'libdl.so',
  'liblog.so',
  'libandroid.so',
  'libz.so',
  'libstdc++.so',
  'libgcc_s.so',
  'libGLESv2.so',
  'libEGL.so',
  'libOpenSLES.so',
  'libjnigraphics.so',
  'libaaudio.so',
  'libmediandk.so',
]);

/**
 * 读一份 ELF64（little-endian，Android 通用）里的：
 *   - `.dynstr` 的字节（**导出的 JNI 符号名都在这里** ⇒ 不用整份 151 MB 扫）
 *   - `DT_NEEDED` 列表（这份 `.so` 运行时**必须**能加载到的动态库）
 *
 * 解析不出来时返回 `{ error }`（调用方**必须**当阻断处理 —— 不能静默放行，
 * 否则这份守卫又会变成「假绿」）。
 */
export function readElfInfo(soPath) {
  let fd;
  try {
    fd = openSync(soPath, 'r');
    const hdr = Buffer.alloc(64);
    readSync(fd, hdr, 0, 64, 0);

    if (hdr[0] !== 0x7f || hdr[1] !== 0x45 || hdr[2] !== 0x4c || hdr[3] !== 0x46) {
      return { error: '不是 ELF 文件' };
    }
    const cls = hdr[4];
    if (cls !== 2) {
      return { error: `只支持 ELF64（这份是 ELF${cls === 1 ? 32 : '?'}）` };
    }
    if (hdr[5] !== 1) {
      return { error: '只支持 little-endian（这份不是）' };
    }

    const eShoff = Number(hdr.readBigUInt64LE(40));
    const eShentsize = hdr.readUInt16LE(58);
    const eShnum = hdr.readUInt16LE(60);
    const eShstrndx = hdr.readUInt16LE(62);
    if (!eShoff || !eShnum) {
      return { error: '没有 section header（被 strip 过头？）' };
    }

    const shdrs = Buffer.alloc(eShentsize * eShnum);
    readSync(fd, shdrs, 0, shdrs.length, eShoff);

    const sections = [];
    for (let i = 0; i < eShnum; i++) {
      const off = i * eShentsize;
      sections.push({
        nameOff: shdrs.readUInt32LE(off),
        type: shdrs.readUInt32LE(off + 4),
        offset: Number(shdrs.readBigUInt64LE(off + 24)),
        size: Number(shdrs.readBigUInt64LE(off + 32)),
        link: shdrs.readUInt32LE(off + 40),
      });
    }

    // 节名表（.shstrtab）
    const shstr = sections[eShstrndx];
    if (!shstr) return { error: 'section header 里的节名表下标越界' };
    const shstrBuf = Buffer.alloc(shstr.size);
    readSync(fd, shstrBuf, 0, shstr.size, shstr.offset);
    const nameOf = (sec) => {
      const end = shstrBuf.indexOf(0, sec.nameOff);
      return shstrBuf.toString('latin1', sec.nameOff, end < 0 ? sec.nameOff : end);
    };

    const dynstr = sections.find((s) => nameOf(s) === '.dynstr');
    if (!dynstr) return { error: '找不到 .dynstr（被 strip 过头？）' };
    const dynstrBuf = Buffer.alloc(dynstr.size);
    readSync(fd, dynstrBuf, 0, dynstr.size, dynstr.offset);

    // 动态段（.dynamic，sh_type == 6）⇒ DT_NEEDED
    const needed = [];
    const dyn = sections.find((s) => s.type === 6);
    if (dyn) {
      const strtab = sections[dyn.link];
      if (strtab) {
        const strBuf = Buffer.alloc(strtab.size);
        readSync(fd, strBuf, 0, strtab.size, strtab.offset);
        const entries = Math.floor(dyn.size / 16);
        const dynBuf = Buffer.alloc(entries * 16);
        readSync(fd, dynBuf, 0, dynBuf.length, dyn.offset);
        for (let i = 0; i < entries; i++) {
          const tag = dynBuf.readBigInt64LE(i * 16);
          if (tag === 0n) break; // DT_NULL
          if (tag === 1n) {
            // DT_NEEDED ⇒ d_val 是 .dynstr 里的偏移
            const nameOff = Number(dynBuf.readBigUInt64LE(i * 16 + 8));
            const end = strBuf.indexOf(0, nameOff);
            needed.push(strBuf.toString('latin1', nameOff, end < 0 ? nameOff : end));
          }
        }
      }
    }

    return { dynstr: dynstrBuf.toString('latin1'), needed };
  } catch (err) {
    return { error: `读不出来：${err.message}` };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Rust 侧导出的 JNI 方法名（去掉固定前缀）。
 * 符号清单的来源是 `encephalon/src/mobile/jni.rs`（**不是手抄的常量**）⇒
 * 端脑新增入口时这里自动跟着变。
 */
export function rustExportedMethods(src) {
  const out = new Set();
  const re = /fn\s+Java_com_ibloc_shadow_EncephalonRuntime_([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return [...out].sort();
}
