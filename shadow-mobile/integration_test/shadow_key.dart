import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// 端脑面的 shadow key —— **可能存在，也可能不存在**。
///
/// ## 它是什么
///
/// 手机上的端脑面**可能**要求 `X-Shadow-Key`（端脑仓 `BuildOptions` 的
/// `shadow_api_key` 为 `Some` 时；宿主把 key 生成在 `<filesDir>/shadow.key`，
/// 并把它同时交给端脑与客户端）。
///
/// ## 为什么测试要读它
///
/// 端脑那侧**上锁之前**，这个文件不存在 ⇒ 返回 null ⇒ 测试按「不带 key」
/// 跑（那时的端脑面是敞开的，不带 key 也能过）。
///
/// 端脑那侧**上锁之后**，这个文件出现 ⇒ helper 自动把 key 捡起来 ⇒
/// 测试**不用改**就能继续跑，而且从那一刻起，它顺带证明了两件事：
///
/// - **不带 key ⇒ 被拒**（端脑面真的锁上了）；
/// - **带 key ⇒ 通过**（App 自己那条路仍然通）。
///
/// ⚠️ 这个文件**不是**账号密钥（`identity/account.key`）—— 两者用途不同、
/// 轮换节奏也不同：账号密钥是「身份本身」，shadow key 只是「本机 App 与
/// 自己端脑之间的门锁」。
Future<String?> readShadowKey() async {
  // `getApplicationSupportDirectory()` 在 Android 上就是 `context.getFilesDir()`
  // —— 端脑的身份目录与 shadow key 都挂在它下面。
  final support = await getApplicationSupportDirectory();
  final file = File('${support.path}/shadow.key');
  if (!file.existsSync()) return null;
  final key = (await file.readAsString()).trim();
  return key.isEmpty ? null : key;
}

/// 带 shadow key 的请求头。
///
/// ⚠️ key 不在的时候**不发**这个头（而不是发空串）—— 空串在端脑那边是
/// 「提供了一个空 key」⇒ 与「没提供」不是一回事。
Map<String, String> shadowKeyHeaders(String? key) {
  if (key == null || key.isEmpty) return const {};
  return {'X-Shadow-Key': key};
}
