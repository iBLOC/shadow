// `flutter drive` 的**主机侧**驱动脚本 —— 滑动正路径那一族。
//
// ## 为什么**不用**官方的 `integrationDriver()`
//
// 官方那个按 `response.allTestsPassed` 判成败 ⇒ ⇒ 而那个值来自
// `integration_test` 的 `failureMethodsDetails` ⇒ ⇒ **它只收 `testWidgets`
// 的失败** ⇒ ⇒ 我们这些**普通 `test()`** 的失败它**看不见**
// ⇒ ⇒ **实测过**：真机上明明有一条用例红了（日志里有 `[E]`），官方驱动仍然
// 打印「All tests passed.」并 `exit(0)` ⇒ ⇒ **退出码在撒谎**。
//
// ⇒ ⇒ 这里改成：**退出码只看 app 侧自己报的结论**
// （`reportData['shadow_verdict']`）⇒ ⇒ 没有结论 ⇒ ⇒ 一律判失败
// （fail-closed）⇒ ⇒ 「失败长得像成功」这条路被堵死。
//
// ## 为什么不用 `flutter test -d`
//
// ⚠️ `flutter test -d` 的 host 端（flutter_tools 的
// `FlutterPlatform._listenToVmServiceForGoldens`）在 app 起来之后会**无条件**
// `streamListen('integration_test.VmServiceProxyGoldenFileComparator')`
// ⇒ ⇒ 那是一条**自定义事件流**，只有 app 侧真的 `dev.postEvent(..., stream: …)`
// 过一次才会存在 ⇒ ⇒ **不比对 golden 图时它从来不存在** ⇒ ⇒ VM 直接拒：
// `streamListen: invalid 'streamId' parameter` ⇒ ⇒ 而 flutter_tools 里那个
// 调用**既没 await 也没 try/catch** ⇒ ⇒ 变成**未捕获的异步错误**
// ⇒ ⇒ 被记成「loading 那个伪用例失败」⇒ ⇒ **整次退出码非 0**，哪怕真用例全过。
//
// ⇒ ⇒ `flutter drive` 走的是另一条路（主机侧驱动脚本 + app 侧
// ext.integration_test 回调）⇒ ⇒ **压根不碰那条 golden 监听**
// ⇒ ⇒ 退出码由**这个脚本**自己判 ⇒ ⇒ **退出码即结论**。
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:flutter_driver/flutter_driver.dart';
import 'package:integration_test/common.dart';

Future<void> main() async {
  final FlutterDriver driver = await FlutterDriver.connect();
  final String jsonResult = await driver.requestData(
    null,
    timeout: const Duration(minutes: 20),
  );
  await driver.close();

  final Response response = Response.fromJson(jsonResult);
  final Map<String, dynamic>? data = response.data;
  final Object? verdict = data?['shadow_verdict'];
  final List<dynamic>? failed = data?['shadow_failures'] as List<dynamic>?;

  // ⚠️ **退出码只看 app 侧自己报的结论** —— `response.allTestsPassed`
  // 对普通 `test()` 的失败是**瞎的** ⇒ ⇒ 只信它 ⇒ ⇒ 否则会出现
  // 「用例红了、驱动说全过、退出码 0」。
  final bool ok =
      verdict == 'PASS' && (failed == null || failed.isEmpty);
  if (ok) {
    print('All tests passed.');
    exit(0);
  }

  final List<dynamic> failedList = failed ?? const <dynamic>[];
  print('Failure Details:');
  print('verdict=$verdict');
  print('failures=$failedList');
  try {
    print(response.formattedFailureDetails);
  } catch (_) {
    // 框架那边没有细节也无所谓 —— 我们自己有清单。
  }
  exit(1);
}
