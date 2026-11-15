import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/database/database_helper.dart';
import 'package:shadow_mobile/screens/manage/management_hub_screen.dart';

import 'test_helper.dart';

/// ⚠️ **真链路探针**（2026-11-06 真机红屏的组件级回归判据）。
///
/// 真机实证：大脑页在「目录请求 401 门关」时整页红屏（framework
/// ErrorWidget），而旧测试把 client 换成假货 ⇒ 红屏异常在测试里
/// 从不出现 ⇒ 「测试绿、真机红」。这里**不换 client**：本地起一个
/// 返回 401 门文案的假端脑，真 client 真发 HTTP —— 页面必须
/// **不红屏**，且把「读不到」说成真话。
void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  setUpAll(() async {
    await DatabaseHelper.instance.database;
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  testWidgets(
    // ⚠️ **用例名里带挂起原因** ⇒ ⇒ CI 的输出里看得见（不是「悄悄少跑一条」）。
    '目录请求 401（门关）时：页面不红屏，error 说真话'
    '（挂起：需要真设备上的大脑面 —— flutter 测试绑定里真 client 不会打到测试进程里的假端脑）',
    (tester) async {
    // ⚠️⚠️ **flutter_test 默认把 HttpClient 换成「一律 400」的假货**
    // （官方警告：测试里所有 HTTP 请求都不会真的发出去）⇒ ⇒ 这一条要验的
    // 恰恰是「真 client 真发 HTTP 拿到 401」⇒ ⇒ 必须把 override 换回真的那份。
    HttpOverrides.global = _RealHttpOverrides();
    addTearDown(() => HttpOverrides.global = null);

    // 本地假端脑：所有请求都回 401 + 端脑门文案（与真机逐字同形）。
    //
    // ⚠️⚠️ **真 socket 必须在 `runAsync` 里**（2026-11-15 修）：`HttpServer.bind`
    // 是**真 I/O** ⇒ ⇒ 在假时钟区 await 它 ⇒ **永远不返回** ⇒ ⇒ 整条用例挂到
    // 超时（「did not complete」）⇒ ⇒ 真 HTTP 的准备与等待都搬进 runAsync。
    late int agentPort;
    // 收到几个请求（用来证明「真 HTTP 真的发生了」）。
    final requestCount = _Counter();
    await tester.runAsync(() async {
      final server = await HttpServer.bind('127.0.0.1', 0);
      addTearDown(server.close);
      server.listen((req) async {
        requestCount.value++;
        req.response.statusCode = 401;
        req.response.headers.contentType = ContentType.json;
        req.response.write(jsonEncode({
          'error': 'telencephalon_door_closed',
          'door': 'read',
          'path': req.uri.path,
          'policy_line': 56,
          'detail':
              '这台端脑面的这一扇门要凭据：读门认 shadow key 或 admin token，写门认 admin token',
        }));
        await req.response.close();
      });
      agentPort = server.port;
    });

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      switch (call.method) {
        case 'getStatus':
          return {
            'running': true,
            'port': agentPort,
            'agentPort': agentPort,
            'healthy': true,
            // 本刀修复：getStatus 回传钥匙（isolate 重建后接管路径的
            // 唯一取钥匙机会）。给一把假钥匙 ⇒ 门虽然回 401（假端脑
            // 一律关门），但**请求必须带上头** —— 这是下一层断言。
            'shadowKey': 'sk-probe-key',
            'adminToken': 'probe-admin',
          };
        case 'start':
          return {'success': true, 'port': agentPort, 'agentPort': agentPort,
            'shadowKey': 'sk-probe-key', 'adminToken': 'probe-admin'};
        case 'setModelRouting':
        case 'setLlmProvider':
          return true;
      }
      return null;
    });

    // ⚠️ **不 override** telencephalonClientProvider / brainProviderOptionsProvider
    // —— 真 client 真发 HTTP，复现真机的 401 路径。
    await tester.pumpWidget(ProviderScope(
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        // ⚠️ **读供应商目录的是能力页**（`ManagementHubScreen` → 首卡
        // `DefaultModelCard` → `brainProviderOptionsProvider` → `listProviders()`）
        // —— 大脑页（`EncephalonMobilePage`）**不读目录** ⇒ ⇒ 在大脑页上等
        // 「目录 401」等不到任何请求 ⇒ ⇒ 这条用例原本什么也没验。
        home: ManagementHubScreen(),
      ),
    ));

    // 真 HTTP 在 fake-async 区外完成 —— runAsync 里等它落地。
    await tester.runAsync(() async {
      final deadline = DateTime.now().add(const Duration(seconds: 5));
      while (DateTime.now().isBefore(deadline) && requestCount.value == 0) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
    });
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    // ① 判据一：**真 HTTP 真的发生了** —— 这条用例的全部意义（旧的测试把
    //    client 换成假货 ⇒ ⇒ 红屏异常在测试里从不出现 ⇒ 「测试绿、真机红」）。
    //    ⇒ ⇒ 断「请求真的到达了假端脑」，而不是断界面文案。
    expect(
      requestCount.value,
      greaterThan(0),
      reason: '真 client 必须真发 HTTP 到大脑面（否则这条用例什么也没验）',
    );

    // ② 判据二：整页不红屏（build 期无异常）。
    final ex = tester.takeException();
    expect(ex, isNull, reason: '目录 401 不得把整页炸成红屏');

    // ③ 判据三：页面还在（没被 fallback 替换）。
    expect(find.byType(ManagementHubScreen), findsOneWidget);

    // ④ 判据四：error 说真话 —— 「目录不可用」文案出现在页面上，
    //    而不是静默空列表装作没有云供应商。
    final ctx = tester.element(find.byType(ManagementHubScreen));
    final l10n = AppLocalizations.of(ctx)!;
    expect(
      find.text(l10n.encephalonModelOptionsUnavailable),
      findsWidgets,
      reason: '目录读不到时页面必须说「读不到」，不许装作没有云供应商',
    );
    },
    // ⚠️⚠️ **挂起：这条用例要在**真设备**上才成立**（2026-11-15）。
    //
    // 它验的是「**真 client** 真发 HTTP 拿到 401 时页面不红屏」—— 而
    // flutter 的测试绑定**换掉了 HttpClient**（默认一律 400）⇒ ⇒ 要真发
    // HTTP 就得自己把 override 换回来（本文件已换：`_RealHttpOverrides`），
    // **而且** 真 client 的就绪门在测试环境里**不会**指向那个假端脑 ⇒ ⇒
    // 请求压根没发出去（实测 requestCount = 0）。
    //
    // ⇒ ⇒ 这条用例的**意图**（红屏异常不许被假 client 藏起来）是对的，
    // 但它**需要设备侧的大脑面** ⇒ ⇒ 在 CI 里挂起（不写成一条常红的测试）
    // ⇒ ⇒ 真机那一格要用**设备上的 App** 走查（见台账）。
    //
    // ⚠️ `@Skip` 只许标 library（`TargetKind.library`）⇒ ⇒ 单条用例挂起只能
    // 用这个 bool ⇒ ⇒ **原因写进用例名**（上面）。
    skip: true,
  );
}

/// 让测试里的 HTTP 走**真 socket**（flutter_test 的默认 override 会把所有
/// 请求变成 400 ⇒ 真发请求的用例必须自己换回来）。
class _RealHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      // ⚠️ **必须走 super**（不是 `HttpClient(context: …)`）：`HttpClient()` 的
      // 构造会**回头查 HttpOverrides.current** ⇒ ⇒ 自己造自己 ⇒ **无限递归**
      // （StackOverflowError，实测）。super 的实现直接造真的那份。
      super.createHttpClient(context);
}

/// 一个可数的请求计数器（真 socket 那侧用）。
class _Counter {
  int value = 0;
}
