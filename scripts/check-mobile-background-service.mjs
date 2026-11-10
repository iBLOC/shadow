#!/usr/bin/env node
/**
 * 「移动端后台常驻面」判定闸 —— 「支持后台运行」这条线是不是**真的**接上了。
 * ============================================================================
 *
 * ## 守什么
 *
 * 三处一处都不能少（判据细节见 `scripts/lib/mobile-background-service.mjs`）：
 *   R1  manifest  FGS 权限 ×3 ＋ 插件服务（dataSync 类型）；
 *   R2  pubspec   flutter_foreground_task 依赖；
 *   R3  Dart 面   startService / stopService / setTaskHandler / dataSync 类型。
 *
 * ## 为什么需要它（v2.9 落地时的真实风险）
 *
 * 这三处的失败模式都**静默**：manifest 少权限 ⇒ 真机一点开关就
 * SecurityException；pubspec 漏提交 ⇒ 本地有 pub 缓存的人看不见；
 * Dart 缺 stop ⇒「关了开关服务还活着」。⇒ ⇒ 判形状，让它们在文本层就红。
 *
 * ## 退出码
 *
 * · `0` —— 全绿；`1` —— 有红；`2` —— 判不了（目标文件不在 / 读不出来）。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-mobile-background-service.mjs             # 判定
 * node scripts/check-mobile-background-service.mjs --self-test # 自检（含事故夹具 ＋ 孪生）
 * node scripts/check-mobile-background-service.mjs --drill     # 副本演练（绿→红→绿）
 * ```
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { findBackgroundServiceIssues } from './lib/mobile-background-service.mjs';
import { injectedDelta, sameMultiset, selfTest as relativeSelfTest } from './lib/relative-assert.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MANIFEST = join(REPO, 'shadow-mobile', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const PUBSPEC = join(REPO, 'shadow-mobile', 'pubspec.yaml');
const DART_SERVICE = join(REPO, 'shadow-mobile', 'lib', 'services', 'background', 'background_run_service.dart');

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** 三个源文件 ⇒ 判据。 */
export function checkSources(inputs) {
  const v = findBackgroundServiceIssues(inputs);
  const out = v.issues.map((i) => `❌ [${i.kind}] ${describeKind(i.kind)}`);
  return { v, out };
}

function describeKind(kind) {
  switch (kind) {
    case 'missing-fgs-permission':
      return 'manifest 缺 `FOREGROUND_SERVICE` 权限 ⇒ 前台服务起不来（SecurityException）';
    case 'missing-fgs-permission-data-sync':
      return 'manifest 缺 `FOREGROUND_SERVICE_DATA_SYNC` ⇒ targetSdk 34+ 带 dataSync 类型的服务启动即炸';
    case 'missing-post-notifications':
      return 'manifest 缺 `POST_NOTIFICATIONS` ⇒ Android 13+ 常驻通知显示不出来';
    case 'missing-fgs-service':
      return 'manifest 没声明插件的前台服务（com.pravera.flutter_foreground_task.service.ForegroundService）⇒ startService 找不到组件';
    case 'service-without-datatype':
      return '前台服务没带 `foregroundServiceType`（或类型里没有 dataSync）⇒ targetSdk 34+ 启动即抛 MissingForegroundServiceTypeException';
    case 'missing-pubspec-dep':
      return 'pubspec.yaml 没有 `flutter_foreground_task` 依赖 ⇒ Dart 侧 import 直接编译红（半截提交）';
    case 'missing-dart-start':
      return 'Dart 侧没有 `FlutterForegroundTask.startService(` 调用点 ⇒ 常驻根本起不来';
    case 'missing-dart-stop':
      return 'Dart 侧没有 `FlutterForegroundTask.stopService(` 调用点 ⇒「关了开关服务还活着」';
    case 'missing-dart-handler':
      return 'Dart 侧没有 `FlutterForegroundTask.setTaskHandler(` ⇒ 后台 isolate 没有入口';
    case 'missing-dart-datatype':
      return 'Dart 侧 startService 没传 `ForegroundServiceTypes.dataSync` ⇒ 与 manifest 的类型对不上';
    default:
      return '未知违规';
  }
}

function selfTest() {
  // ⚠️ **相对断言那一族的自检**（判据只有**一处实现** ⇒ ⇒ 这里只转个手 ⇒ ⇒ 不许各写一份）
  if (relativeSelfTest() !== 0) return false;
  let pass = 0, fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass += 1; console.log(`  [PASS] ${name}`); }
    else { fail += 1; console.log(`  [FAIL] ${name} ${detail}`); }
  };

  const perm = (name) =>
    `    <uses-permission android:name="${name}"/>`;
  const serviceTag = (type) =>
    type === null
      ? '    <service android:name="com.pravera.flutter_foreground_task.service.ForegroundService" android:exported="false"/>'
      : `    <service android:name="com.pravera.flutter_foreground_task.service.ForegroundService" android:foregroundServiceType="${type}" android:exported="false"/>`;
  const manifest = ({ perms = true, service = 'dataSync' } = {}) =>
    [
      '<manifest>',
      '    <application>',
      ...(perms
        ? [
            perm('android.permission.FOREGROUND_SERVICE'),
            perm('android.permission.FOREGROUND_SERVICE_DATA_SYNC'),
            perm('android.permission.POST_NOTIFICATIONS'),
          ]
        : []),
      ...(service === null ? [] : [serviceTag(service)]),
      '    </application>',
      '</manifest>',
    ].join('\n');
  const pubspec = (dep = true) =>
    [
      'dependencies:',
      '  flutter:',
      '    sdk: flutter',
      ...(dep ? ['  flutter_foreground_task: ^11.0.3'] : []),
    ].join('\n');
  const dart = ({ start = true, stop = true, handler = true, type = true } = {}) =>
    [
      'import \'package:flutter_foreground_task/flutter_foreground_task.dart\';',
      'class S {',
      `  Future<bool> go() async {`,
      ...(start
        ? ['    final r = await FlutterForegroundTask.startService(',
           `      serviceTypes: [${type ? 'ForegroundServiceTypes.dataSync' : 'ForegroundServiceTypes.camera'}],`,
           '    );']
        : []),
      ...(stop ? ['    await FlutterForegroundTask.stopService();'] : []),
      '  }',
      ...(handler ? ['  void wire() { FlutterForegroundTask.setTaskHandler(H()); }'] : []),
      '}',
    ].join('\n');

  // 正控：三处全在 ⇒ 零违规。
  const good = checkSources({
    manifest: manifest(),
    pubspec: pubspec(),
    dartService: dart(),
  });
  check('正控（三处全在）⇒ 零违规', good.out.length === 0, JSON.stringify(good.out));

  // 事故夹具 ①：manifest 既没权限也没服务（复原「光装插件不改 manifest」
  // 的半截接入）⇒ 恰好 4 条红（3 权限 ＋ 服务没声明）。
  const noPerms = checkSources({
    manifest: manifest({ perms: false, service: null }),
    pubspec: pubspec(),
    dartService: dart(),
  });
  check(
    '事故夹具（manifest 无 FGS 权限/服务）⇒ 恰好 4 条红',
    noPerms.out.length === 4 &&
      noPerms.v.issues.some((i) => i.kind === 'missing-fgs-permission') &&
      noPerms.v.issues.some((i) => i.kind === 'missing-fgs-service'),
    JSON.stringify(noPerms.out),
  );

  // 事故夹具 ②：服务在、但类型不是 dataSync（targetSdk 34+ 启动即炸）。
  const wrongType = checkSources({
    manifest: manifest({ service: 'camera' }),
    pubspec: pubspec(),
    dartService: dart(),
  });
  check(
    '事故夹具（服务类型不是 dataSync）⇒ 恰好 1 条红',
    wrongType.out.length === 1 && wrongType.v.issues[0].kind === 'service-without-datatype',
    JSON.stringify(wrongType.out),
  );

  // 事故夹具 ③：pubspec 漏依赖（半截提交）。
  const noDep = checkSources({
    manifest: manifest(),
    pubspec: pubspec(false),
    dartService: dart(),
  });
  check(
    '事故夹具（pubspec 漏依赖）⇒ 恰好 1 条红',
    noDep.out.length === 1 && noDep.v.issues[0].kind === 'missing-pubspec-dep',
    JSON.stringify(noDep.out),
  );

  // 事故夹具 ④：Dart 缺 stop ⇒「关了开关服务还活着」。
  const noStop = checkSources({
    manifest: manifest(),
    pubspec: pubspec(),
    dartService: dart({ stop: false }),
  });
  check(
    '事故夹具（Dart 缺 stop）⇒ 恰好 1 条红',
    noStop.out.length === 1 && noStop.v.issues[0].kind === 'missing-dart-stop',
    JSON.stringify(noStop.out),
  );

  // 孪生（不许误报）：注释里提到权限/API 名 ⇒ 不算声明/调用。
  const commented = checkSources({
    manifest:
      '<manifest><!-- <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/> --></manifest>',
    pubspec: pubspec(false).replace(
      'dependencies:',
      'dependencies:\n  # flutter_foreground_task: ^11.0.3',
    ),
    dartService:
      '// FlutterForegroundTask.stopService() 曾在这里\n// FlutterForegroundTask.setTaskHandler(H())\nclass S {}',
  });
  check(
    '孪生：注释里提到权限/依赖/API ⇒ 不误报',
    commented.out.length ===
      3 /* 权限×3 确实没声明 */ + 1 /* 服务没声明 */ + 1 /* pubspec */ + 4 /* Dart 锚点全缺 */,
    JSON.stringify(commented.out),
  );

  // 孪生：别的 service / 别的权限在 ⇒ 不误报。
  const unrelated = checkSources({
    manifest: [
      '<manifest>',
      '    <uses-permission android:name="android.permission.INTERNET"/>',
      '    <application>',
      '        <service android:name="com.ibloc.shadow.call.CallRoutingService" android:exported="true"/>',
      '    </application>',
      '</manifest>',
    ].join('\n'),
    pubspec: pubspec(),
    dartService: dart(),
  });
  check(
    '孪生：别家 service/权限在场 ⇒ 不误报（只判自家那三个）',
    unrelated.out.length === 4 &&
      unrelated.v.issues.every((i) => i.kind.startsWith('missing-') && i.kind !== 'missing-pubspec-dep' && !i.kind.startsWith('missing-dart')),
    JSON.stringify(unrelated.out),
  );

  // 真文件 ⇒ 零违规（三处全读得到才判；读不到算 fail —— 自检不该在缺文件的环境里假绿）。
  if (!existsSync(MANIFEST) || !existsSync(PUBSPEC) || !existsSync(DART_SERVICE)) {
    check('真文件三处都在', false);
  } else {
    const r = checkSources({
      manifest: readFileSync(MANIFEST, 'utf8'),
      pubspec: readFileSync(PUBSPEC, 'utf8'),
      dartService: readFileSync(DART_SERVICE, 'utf8'),
    });
    check('真文件 ⇒ 零违规', r.out.length === 0, r.out.join(' | '));
  }

  console.log(`  判据自检：${pass}/${pass + fail}`);
  return fail === 0;
}

function drill() {
  if (!existsSync(MANIFEST)) { console.log('❌ manifest 不在 ⇒ ⇒ 判不了'); return false; }
  const before = sha256(MANIFEST);
  const dir = join(tmpdir(), 'shadow-mobile-background-service-drill');
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, 'AndroidManifest.xml');
  const original = readFileSync(MANIFEST, 'utf8');
  writeFileSync(copy, original);
  // 破坏：把三条 FGS 权限整行删掉（复原「光装插件不改 manifest」的事故形状）。
  const broken = original
    .split('\n')
    .filter((l) => !l.includes('android.permission.FOREGROUND_SERVICE'))
    .join('\n');
  writeFileSync(copy, broken);
  const red = checkSources({
    manifest: readFileSync(copy, 'utf8'),
    pubspec: readFileSync(PUBSPEC, 'utf8'),
    dartService: readFileSync(DART_SERVICE, 'utf8'),
  });
  writeFileSync(copy, original);
  const green = checkSources({
    manifest: readFileSync(copy, 'utf8'),
    pubspec: readFileSync(PUBSPEC, 'utf8'),
    dartService: readFileSync(DART_SERVICE, 'utf8'),
  });
  // ⚠️ **原始读数**（真文件内容）⇒ ⇒ 判绿**不**看它（被测物带伤时它可以非零）。
  const base = checkSources({
    manifest: original,
    pubspec: readFileSync(PUBSPEC, 'utf8'),
    dartService: readFileSync(DART_SERVICE, 'utf8'),
  });
  rmSync(dir, { recursive: true, force: true });
  const after = sha256(MANIFEST);
  // ⚠️ **相对断言**（2026-11-11 刀⑫）：判绿**只由注入腿**决定 ⇒ ⇒
  //   被测物带伤时演练**不再恒红** ⇒ ⇒ 演练红**不遮蔽**主判定（U+350B／U+350C 条那个机制）。
  const keysOf = (r) => r.v.issues.map((i) => i.kind);
  const baseKeys = keysOf(base);
  const delta = injectedDelta(baseKeys, keysOf(red));
  const restoredOk = sameMultiset(baseKeys, keysOf(green));
  const ok = delta.ok && restoredOk && before === after;
  console.log(`  原始读数（真文件内容）⇒ ${baseKeys.length} 条（**报告腿**：不参与判绿）`);
  console.log(`  副本破坏 ⇒ 判红：${keysOf(red).length} 条 ⇒ ⇒ 相对原始读数：${delta.reason}`);
  console.log(`  副本还原 ⇒ 与原始读数逐键同数：${restoredOk ? '是' : '否'}`);
  console.log(`  真文件 SHA256 前后一致：${before === after ? '是' : '否'} (${before.slice(0, 16)}…)`);
  console.log(`  演练判绿（**只看注入腿 ＋ 还原腿 ＋ 真文件未改动**）⇒ ${ok ? '是' : '否'}`);
  return ok;
}

function readInputs() {
  return {
    manifest: readFileSync(MANIFEST, 'utf8'),
    pubspec: readFileSync(PUBSPEC, 'utf8'),
    dartService: readFileSync(DART_SERVICE, 'utf8'),
  };
}

const arg = process.argv[2];
if (arg === '--self-test') { process.exit(selfTest() ? 0 : 1); }
if (arg === '--drill') { process.exit(drill() ? 0 : 1); }
if (!existsSync(MANIFEST) || !existsSync(PUBSPEC) || !existsSync(DART_SERVICE)) {
  console.error('❌ 目标文件不在（manifest / pubspec / dartService）⇒ ⇒ 判不了（退出码 2）');
  process.exit(2);
}
const result = checkSources(readInputs());
if (result.out.length === 0) {
  const c = result.v.counts;
  console.log(
    `✅ 零违规（后台常驻面：FGS 权限 ${c.fgsPermissions}/3、插件服务 ${c.fgsService}/1、pubspec 依赖 ${c.pubspecDep}/1、Dart 锚点 ${c.dartAnchors}/4）`,
  );
  process.exit(0);
}
for (const l of result.out) console.log(l);
process.exit(1);
