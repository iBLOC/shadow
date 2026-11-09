import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 「Linux 上的 SQLite 资产**不去下载**」这条链路的契约闸。
///
/// ## 守什么
///
/// 2026-11-09 取证：CI 上那条
/// `Hash of downloaded file libsqlite3.x64.linux.so is bef140a1…` 的红，
/// 根因是 **GitHub release CDN 的 504 网关超时页**（92 字节）被上游 hook
/// 当成资产喂进了哈希器 ⇒ ⇒ **不是**「资产被掉包」。
///
/// ⇒ ⇒ 修法不是「换个哈希」，而是 **Linux 干脆不去下载**：
/// `pubspec.yaml` 里 `hooks.user_defines.sqlite3.source` 按 OS 分岔 ⇒
/// `linux: system`（dlopen 系统那份 libsqlite3.so ⇒ ⇒ **CI 零网络**）
/// ＋ `default: sqlite3`（其余平台仍用包自带的预编译库）。
///
/// ⇒ ⇒ 本闸守住这条链路的四节：
/// ❶ 映射的**形状**（Linux 分支必须是 system ⇒ 不许回退成下载）；
/// ❷ **锁文件**里的 sqlite3 版本（≥ 3.9.1 —— 按 OS 分岔 `source` 是 3.9.1
///    才有的能力 ⇒ ⇒ 3.5.2 读到 Map 会直接抛 `Unknown source`）；
/// ❸ **这台机器实际装着的** sqlite3 版本（锁文件说的不算 ⇒ ⇒ 实际用的才算）；
/// ❹ CI 里**仍装** `libsqlite3-dev`（系统库是 Linux 分支的真正提供者 ⇒ ⇒
///    少了它 CI 必红）。
///
/// ⚠️ 为什么不查「下载成功没有」：那条**只能**在 CI 上验（Linux 分支），
/// 而本闸跑在**每一次** `flutter test` 里 ⇒ ⇒ 它守的是**让 CI 不必下载**的那几节。
void main() {
  group('SQLite 资产来源契约（Linux 不下载）', () {
    test('❶ source 是按 OS 的映射，且 Linux 走 system（不去下载）', () {
      final block = _hooksBlock(File('pubspec.yaml').readAsStringSync());
      final flat = block
          .where((l) => !l.trimLeft().startsWith('#'))
          .join(' ')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      expect(
        flat,
        contains('sqlite3: source: linux: system default: sqlite3'),
        reason: 'pubspec.yaml 的 hooks.user_defines 里必须声明 per-OS 映射：'
            'Linux ⇒ system（dlopen 系统那份 libsqlite3.so ⇒ ⇒ CI 零网络）、'
            '其余平台 ⇒ sqlite3（包自带的预编译库 ⇒ ⇒ 本地与 APK 行为不变）',
      );
    });

    test('❷ 锁文件里的 sqlite3 ≥ 3.9.1（按 OS 分岔 source 是 3.9.1 才有的能力）', () {
      final v = _lockedVersion('sqlite3');
      expect(v, isNotNull, reason: 'pubspec.lock 里必须锁着 sqlite3');
      expect(
        _atLeast(v!, 3, 9, 1),
        isTrue,
        reason: '锁定的 sqlite3 是 $v ⇒ ⇒ 低于 3.9.1 就不认 per-OS 映射'
            '（3.5.2 读到 Map 会抛 Unknown source）⇒ ⇒ 升级与 hooks 配置必须同刀',
      );
    });

    test('❸ 实际解析到的 sqlite3 ≥ 3.9.1（锁文件说的不算，实际用的才算）', () {
      final installed = _installedVersion('sqlite3');
      expect(installed, isNotNull, reason: '读不到 .dart_tool/package_config.json 里的 sqlite3');
      expect(
        _atLeast(installed!, 3, 9, 1),
        isTrue,
        reason: '这台机器实际装的是 sqlite3 $installed ⇒ ⇒ 低于 3.9.1 就没有 per-OS 映射',
      );
    });

    test('❹ CI 仍装 libsqlite3-dev（Linux 分支的真正提供者）', () {
      final ci = File('../.github/workflows/ci.yml');
      expect(ci.existsSync(), isTrue, reason: '读不到 .github/workflows/ci.yml');
      expect(
        ci.readAsStringSync(),
        contains('libsqlite3-dev'),
        reason: 'Linux 走 system ⇒ ⇒ CI 必须装系统那份 libsqlite3（-dev 才有那个软链）'
            '⇒ ⇒ 少了它，Mobile Test 的 native asset 阶段会红',
      );
    });
  });
}

/// 取 pubspec.yaml 里 `hooks:` 那一段（到下一个顶层键为止）的行。
List<String> _hooksBlock(String text) {
  final lines = text.split(RegExp(r'\r?\n'));
  final start = lines.indexWhere((l) => l.trim() == 'hooks:');
  if (start < 0) return const <String>[];
  final out = <String>[];
  for (var i = start + 1; i < lines.length; i++) {
    final l = lines[i];
    if (l.trim().isEmpty) continue;
    if (!l.startsWith(' ') && !l.startsWith('\t')) break; // 下一个顶层键
    out.add(l);
  }
  return out;
}

/// 读 pubspec.lock 里某个包的锁定版本（null ＝ 没锁住）。
String? _lockedVersion(String name) {
  final file = File('pubspec.lock');
  if (!file.existsSync()) return null;
  final lines = file.readAsStringSync().split(RegExp(r'\r?\n'));
  final key = '  $name:';
  final start = lines.indexOf(key);
  if (start < 0) return null;
  for (var i = start + 1; i < lines.length; i++) {
    final l = lines[i];
    if (l.trim().isEmpty) continue;
    if (!l.startsWith('    ')) break; // 下一个包
    final m = RegExp(r'^\s+version:\s*"?([^"\s]+)').firstMatch(l);
    if (m != null) return m.group(1);
  }
  return null;
}

/// 读**实际装着的**那个包的版本（从 .dart_tool/package_config.json 找它）。
String? _installedVersion(String name) {
  final cfgFile = File('.dart_tool/package_config.json');
  if (!cfgFile.existsSync()) return null;
  final cfg = jsonDecode(cfgFile.readAsStringSync()) as Map<String, dynamic>;
  final packages = (cfg['packages'] as List<dynamic>).cast<Map<String, dynamic>>();
  for (final p in packages) {
    if (p['name'] != name) continue;
    final root = Uri.parse(p['rootUri'] as String);
    final pub = File('${root.toFilePath()}${Platform.pathSeparator}pubspec.yaml');
    if (!pub.existsSync()) return null;
    for (final l in pub.readAsStringSync().split(RegExp(r'\r?\n'))) {
      final m = RegExp(r'^version:\s*([0-9][^\s]*)').firstMatch(l);
      if (m != null) return m.group(1);
    }
  }
  return null;
}

/// 版本比较：a ≥ b（按点分数字段逐段比）。
bool _atLeast(String a, int ma, int mi, int pa) {
  final p = a.split('.').map((e) => int.tryParse(e) ?? 0).toList();
  final want = [ma, mi, pa];
  for (var i = 0; i < want.length; i++) {
    final v = i < p.length ? p[i] : 0;
    if (v > want[i]) return true;
    if (v < want[i]) return false;
  }
  return true;
}