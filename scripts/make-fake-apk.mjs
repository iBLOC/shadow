#!/usr/bin/env node
/**
 * 造两份**只差入口标记**的对照 APK —— 用来证明 `check-apk-surface.mjs`
 * 的第 1 项（入口是不是正牌 App）**有分辨力**，不是恒红。
 *
 * ## 为什么需要它
 *
 * 守卫的每一项都要能被单独证伪。若第 1 项对**任何** APK 都判「测试壳」，
 * 那它就只是一句永远成立的话（假绿）。
 * ⇒ 造两份**只差一处**的包：
 *   - `apk_fake_good.zip`：`kernel_blob.bin` 里放 `package:shadow_mobile/main.dart`
 *     ⇒ 守卫应判「**正牌入口**」
 *   - `apk_fake_shell.zip`：放 `IntegrationTestWidgetsFlutterBinding` +
 *     `package:integration_test` ⇒ 守卫应判「**集成测试壳**」
 *
 * 两份包里的 `libencephalon.so` 是**同一份真二进制**（逐字节拷贝）
 * ⇒ 第 2/3 项在两份上结论**必须一致**（否则说明判别逻辑串了项）。
 *
 * ## 用法
 *
 *   node scripts/make-fake-apk.mjs              # 输出到 .verify-wt/
 *   node scripts/make-fake-apk.mjs --out <dir>
 *
 * 造完自己跑一遍：
 *
 *   node scripts/check-apk-surface.mjs --apk <dir>/apk_fake_good.zip
 *   node scripts/check-apk-surface.mjs --apk <dir>/apk_fake_shell.zip
 *
 * ⇒ 期望：第 1 项一绿一红；第 2/3 项两份**一样**
 *   （第 2 项若红，那是 `.so` 本身的**真缺口**，与入口无关 —— 不是假绿）。
 *
 * ⚠️ 每个包 ~160 MB（因为要装真的 `libencephalon.so`）⇒ 用完记得删。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JNI_DIR = 'shadow-mobile/android/app/src/main/jniLibs/arm64-v8a';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const OUT = resolve(ROOT, argValue('--out') ?? '.verify-wt');

/**
 * 最小 zip 写入器（method 0 = store，不压缩）。
 * APK 本来就是 zip ⇒ `tar`（bsdtar）能直接读它。
 */
function zip(members) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of members) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method 0 = store
    local.writeUInt16LE(0x21, 10); // last mod time
    local.writeUInt16LE(0x5721, 12); // last mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // 中央目录头签名
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0x21, 12);
    cd.writeUInt16LE(0x5721, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

const soPath = join(ROOT, JNI_DIR, 'libencephalon.so');
const cxxPath = join(ROOT, JNI_DIR, 'libc++_shared.so');
for (const p of [soPath, cxxPath]) {
  if (!existsSync(p)) {
    console.error(`找不到 ${p} —— 先跑 encephalon/scripts/build-android.ps1 编一份。`);
    process.exit(1);
  }
}

const so = readFileSync(soPath);
const cxx = readFileSync(cxxPath);
console.log('libencephalon.so sha256 =', createHash('sha256').update(so).digest('hex'));

mkdirSync(OUT, { recursive: true });

const mk = (marker, outName) => {
  const data = Buffer.concat([Buffer.from(marker, 'utf8'), Buffer.alloc(4096, 0)]);
  const buf = zip([
    { name: 'assets/flutter_assets/kernel_blob.bin', data },
    { name: 'lib/arm64-v8a/libencephalon.so', data: so },
    { name: 'lib/arm64-v8a/libc++_shared.so', data: cxx },
  ]);
  const out = join(OUT, outName);
  writeFileSync(out, buf);
  console.log(`${out}  ${(buf.length / 1048576).toFixed(1)} MB`);
};

mk('package:shadow_mobile/main.dart', 'apk_fake_good.zip');
mk('IntegrationTestWidgetsFlutterBinding package:integration_test', 'apk_fake_shell.zip');

console.log('');
console.log('反向验证（期望第 1 项一绿一红，第 2/3 项两份一致）：');
console.log(`  node scripts/check-apk-surface.mjs --apk ${join(OUT, 'apk_fake_good.zip')}`);
console.log(`  node scripts/check-apk-surface.mjs --apk ${join(OUT, 'apk_fake_shell.zip')}`);
