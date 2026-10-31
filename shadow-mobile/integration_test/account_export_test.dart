import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

/// 端脑那两份派生的域分隔符 —— 与
/// `telencephalon::security::identity` 里的常量**逐字节一致**。
///
/// ⚠️ 这里**重写一遍**是有意的：它是一份**独立实现**。端脑用 Rust 算
/// 人格，这里用 Dart 算 —— 两边算出**同一个人格**，才说明「导出的那串码」
/// 真的是「端脑说的那个人」。同一份代码算两遍只能证明代码没坏，证明不了
/// 身份对得上。
const String _principalDomain = 'shadow/principal/v1';
const String _personaDomain = 'shadow/persona/v1';

/// 把导出的账号码解成账号密钥（32 字节）。
List<int> _decodeAccountKey(String exported) {
  // 端脑用的是 base64url 无填充；Dart 的解码器要标准字母表 + 补齐。
  final normalized = exported.trim().replaceAll('-', '+').replaceAll('_', '/');
  final padded = normalized.padRight((normalized.length + 3) ~/ 4 * 4, '=');
  final bytes = base64.decode(padded);
  expect(bytes.length, 32, reason: '账号密钥必须是 32 字节');
  return bytes;
}

/// 与端脑一致的派生：`SHA256(domain || 0x00 || key)` 取前 N 个 hex。
String _derive(List<int> key, String domain, int hexChars, String prefix) {
  final digest = sha256.convert(<int>[...utf8.encode(domain), 0, ...key]).bytes;
  final hex = digest.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '$prefix${hex.substring(0, hexChars)}';
}

/// 端脑写记忆时读的那份账号密钥文件。
Future<File> _accountKeyFile() async {
  // `getApplicationSupportDirectory()` 在 Android 上就是 `context.filesDir`
  // —— 端脑的身份目录挂在它下面（`<filesDir>/identity`）。
  final support = await getApplicationSupportDirectory();
  return File('${support.path}/identity/account.key');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  test('导出的码就是端脑自己用的那个账号', () async {
    // 1) 起端脑。`start` 返回前端脑面已经拉起来了 ⇒ 进程级账号也就位
    //    ⇒ 导出走的是「端脑正在用的那一份」，不是目录里现造的一个。
    Map<dynamic, dynamic>? started;
    for (var attempt = 0; attempt < 30; attempt++) {
      started = await channel.invokeMethod<Map<dynamic, dynamic>>(
        'start',
        {'port': 0},
      );
      final port = started?['agentPort'] as int?;
      if (started?['success'] == true && (port ?? 0) > 0) break;
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    final agentPort = started?['agentPort'] as int?;
    expect(started?['success'], isTrue, reason: '端脑没起来');
    expect(
      agentPort ?? 0,
      greaterThan(0),
      reason: '端脑面没起来 —— 进程级账号也就没就位',
    );

    // 2) 问端脑「你是谁」—— 它**自己**的答案。
    final response = await http.get(
      Uri.parse('http://127.0.0.1:$agentPort/shadow/v1/identity'),
    );
    expect(
      response.statusCode,
      200,
      reason: '端脑的身份端点答了 ${response.statusCode}',
    );
    final identity = jsonDecode(response.body) as Map<String, dynamic>;
    expect(identity['identified'], isTrue, reason: '端脑没有身份');
    final persona = identity['persona'] as String;
    final principal = identity['principal'] as String;

    // 3) 走**真实的 JNI 导出通道**（MethodChannel → JNI → Rust）。
    final exported = await channel.invokeMethod<String>('exportAccount');
    expect(exported, isNotNull, reason: '导出失败');
    final code = exported!.trim();
    expect(code, isNotEmpty);

    // 4) 端脑写记忆时读的那份密钥文件 —— 导出必须与它**逐字节**一致。
    //    不一致 ⇒ 导出了另一个账号 ⇒ 导入之后是**另一个人**，而端脑还在
    //    按原来那个人写记忆 ⇒ 两边人格对不上、记忆分叉（而且不报错）。
    final keyFile = await _accountKeyFile();
    expect(keyFile.existsSync(), isTrue, reason: '端脑没在身份目录里建账号');
    expect(code, (await keyFile.readAsString()).trim());

    // 5) 这串码派生出**端脑说的那个人** ⇒ 它真的是「这个人」。
    final key = _decodeAccountKey(code);
    expect(_derive(key, _personaDomain, 16, 'persona-'), persona);
    expect(_derive(key, _principalDomain, 32, 'principal:'), principal);

    // 6) 把导出的码落到 cache 目录 —— 开发机用 `run-as` 取走，在**另一台
    //    机器**上导入一次（那边跑的是同一个 Rust 函数）⇒ 验「同一个人」。
    final cache = await getTemporaryDirectory();
    await File('${cache.path}/exported_account.txt').writeAsString(code);
  });
}
