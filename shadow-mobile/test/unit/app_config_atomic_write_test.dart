import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/app_config_service.dart';

/// 落盘**必须原子**：目标文件**永远**不以「残缺态」出现。
///
/// ⚠️ **为什么这条要单独钉**（2026-11-09 实测）：主 CI 的
/// `backend_shadow_key_entry_test.dart` **偶发**红
/// （`FormatException: Unexpected end of input (at character 1)`）⇒ ⇒ 根因是
/// 落盘那一步用 `file.writeAsString(...)` ⇒ ⇒ **先截断再写** ⇒ ⇒ 读面在写的
/// 瞬间可能拿到**空文件 / 半个文件**。
///
/// ⇒ ⇒ 而那**不只是测试的偶发**：`AppConfigService._reloadFromDisk()` 的
/// `json.decode` 遇到半个文件会抛错 ⇒ ⇒ catch 里**静默回落默认值**
/// ⇒ ⇒ **用户的全部配置被清空**（界面什么也不说）⇒ ⇒ 「失败长得像成功」。
///
/// ⇒ ⇒ 修法＝**临时文件 ＋ rename 原子替换**（目标文件要么是旧的完整值，
/// 要么是新的完整值，**永远不会是半个**）。
///
/// ⚠️ **注入只能走路径级**：Dart 的 `File` 是**工厂类**、**不可继承**
/// ⇒ ⇒ 「写到一半被杀」这类故障**没法**用子类注入 ⇒ ⇒ 只能把落盘路径上的
/// 某个位置**占成目录** ⇒ ⇒ 让那一步必然失败 ⇒ ⇒ 落盘整体必须失败。
void main() {
  late Directory tmpDir;
  late String cfgPath;
  late File cfg;

  /// 大 payload ⇒ ⇒ 把「截断 → 写完」那个窗口**放大到可观测**（配置本身很小，
  /// 那个窗口是微秒级 ⇒ ⇒ 偶发 ⇒ ⇒ 光靠小 payload 测不出来）。
  /// ⚠️ `p0`…`p9` 长度**全等** ⇒ ⇒ 落盘后的完整长度只有一个 ⇒ ⇒ 采样面可以
  ///   拿它当「唯一合法长度」。
  String bigPad(int i) => 'p$i' * (4 * 1024 * 1024);

  setUp(() async {
    tmpDir = await Directory.systemTemp.createTemp('app_config_atomic_test');
    cfgPath = '${tmpDir.path}/app_config.json';
    cfg = File(cfgPath);
    await cfg.writeAsString(json.encode({'marker': 'old'}));
    AppConfigService.configFileOverride = null;
    AppConfigService().clearSaveError();
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (tmpDir.existsSync()) {
      try {
        await tmpDir.delete(recursive: true);
      } catch (_) {
        // Windows 上刚写过的文件可能还被句柄占着 ⇒ ⇒ 删不掉就留着（在 TEMP 里）。
      }
    }
  });

  test('落盘期间目标文件永远不以「残缺长度」出现（截断窗口不可观测）', () async {
    AppConfigService.configFileOverride = () async => cfg;
    final svc = AppConfigService();

    // ❶ 先落一次盘（**不在采样窗口里**）⇒ ⇒ 拿到「完整长度」这个基准。
    await svc.setTtsExternalUrl(bigPad(0));
    final completeLen = await cfg.length();

    final anomalies = <String>[];
    var samples = 0;
    var locks = 0;
    var stop = false;

    // ❷ 采样面：**只查长度**（廉价 ⇒ ⇒ 句柄占用极短）。
    //   ⚠️ 为什么不用「整读 ＋ json.decode」当采样面（第一版就是这么写的）：
    //   Windows 上**长读**会挡住写面的 rename（实测 errno 5「拒绝访问」）
    //   ⇒ ⇒ 写面反复撞共享冲突 ⇒ ⇒ 判据自己把被测物逼成失败（**假红**）。
    //   ⚠️ 而「查长度」**不会**挡 rename（实测：采样 189 次，rename 一次成功）
    //   ⇒ ⇒ 采样面**不会**干扰被测物 ⇒ ⇒ 判据量的是被测物，不是自己。
    final sampler =
        Future<void>.delayed(const Duration(milliseconds: 1), () async {
      while (!stop) {
        try {
          final len = await cfg.length();
          samples++;
          if (len != completeLen) {
            anomalies.add('残缺长度 $len（完整应为 $completeLen）');
          }
        } on PathAccessException {
          locks++;
        } catch (e) {
          anomalies.add('长度查询失败：$e');
        }
      }
    });

    final last = bigPad(9);
    for (var i = 1; i < 9; i++) {
      await svc.setTtsExternalUrl(bigPad(i));
    }
    await svc.setTtsExternalUrl(last);
    stop = true;
    await sampler;

    expect(samples, greaterThan(0),
        reason: '采样面必须真的采到了（否则下面那条是空转）');
    expect(anomalies, isEmpty,
        reason: '落盘期间目标文件出现过**残缺态** ⇒ ⇒ 落盘不是原子的（用户配置会被写坏）');
    // ⚠️ **不许恒绿**：必须证明**写真的成功了**（否则「一个字节都没写进去」也能绿）。
    final raw = json.decode(await cfg.readAsString()) as Map<String, dynamic>;
    expect(raw['ttsExternalUrl'], last, reason: '落盘必须真的落盘（否则上面那条是空转）');
    // ℹ️ 读数：采样次数 ＋ Windows 上的共享冲突次数（不是缺陷，只是记录）。
    // ignore: avoid_print
    print('ℹ️ 采样 $samples 次，锁冲突 $locks 次');
  });

  test('落盘失败不许毁掉旧值 ⇒ 且失败必须被报告（不许长得像成功）', () async {
    // ⚠️ **路径级注入**：把落盘用的**临时路径**占成**目录**
    //   ⇒ ⇒ 临时文件写不进去 ⇒ ⇒ 整次落盘必然**失败**
    //   ⇒ ⇒ 失败时**磁盘上的旧值必须原样**、**内存不许停留在没存上的新值**、
    //   **失败必须被报告**（`lastSaveError` ＋ `saveFailures`）。
    await Directory('$cfgPath.tmp').create(recursive: true);

    AppConfigService.configFileOverride = () async => cfg;
    final svc = AppConfigService();

    final failures = <String>[];
    final sub = svc.saveFailures.listen(failures.add);

    await svc.setTtsExternalUrl('https://tts.example/should-not-apply');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await sub.cancel();

    expect(failures, isNotEmpty,
        reason: '落盘失败必须被报告（界面得说「没存上」⇒ ⇒ 不许长得像成功）');
    expect(svc.lastSaveError, isNotNull, reason: '落盘失败必须留下真因（不许只广播不留痕）');

    final onDisk = await File(cfgPath).readAsString();
    final decoded = json.decode(onDisk) as Map<String, dynamic>;
    expect(decoded['marker'], 'old',
        reason: '落盘失败 ⇒ ⇒ 磁盘上的旧值**必须原样**（不许被截断毁掉）');
    expect(decoded['ttsExternalUrl'], isNull,
        reason: '半次写入不许变成「已落盘」的样子');
    expect(svc.ttsExternalUrl, isNot('https://tts.example/should-not-apply'),
        reason: '落盘失败 ⇒ ⇒ 内存必须回滚（不许停留在没存上的新值上）');
  });

  test('落盘成功后配置目录里不留半成品（临时文件已消失）', () async {
    AppConfigService.configFileOverride = () async => cfg;
    final svc = AppConfigService();
    await svc.setTtsExternalUrl('https://tts.example/x');
    final leftovers =
        tmpDir.listSync().map((e) => e.path).where((p) => p.endsWith('.tmp'));
    expect(leftovers, isEmpty, reason: '配置目录里不许留半成品（那是残片，不是真值）');
    final raw = json.decode(await cfg.readAsString()) as Map<String, dynamic>;
    expect(raw['ttsExternalUrl'], 'https://tts.example/x');
  });
}
