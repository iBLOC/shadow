import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/capability_policy_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/widgets/settings/capability_grants_section.dart';

import 'test_helper.dart';

/// **设置页的能力授权** —— 每一项独立一档，外加系统权限的一键入口。
///
/// ⚠️ 这一层是**应用层**（每次询问 / 完全访问）；系统层（Android 的
/// READ_CALENDAR 等）由用户在**系统弹窗**里批 ⇒ ⇒ 两层是**串联**的。
/// ⇒ ⇒ 所以界面必须把系统权限的状态**一起显示出来**
/// ⇒ ⇒ 而且没授予时得给一个**一键**去授的入口（否则用户卡在那儿）。
void main() {
  testSetup();

  const channel = MethodChannel('com.ibloc.shadow/device_data');
  final calls = <String>[];

  /// 系统权限的**当前**状态 —— 可被「弹窗授予」当场改掉
  /// ⇒ ⇒ 界面那行才会从「未授予」变成「已授予」⇒ ⇒ 与真机同一条路。
  var osGranted = false;

  /// 「requestPermissionDetailed」回什么。
  /// null ⇒ ⇒ 原生**不认**这个方法 ⇒ ⇒ Dart 侧回「什么都没发生」。
  Map<String, Object?>? detailReply;

  void mockChannel({required bool granted, Map<String, Object?>? detail}) {
    osGranted = granted;
    detailReply = detail;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (call.method == 'hasPermission') return osGranted;
      if (call.method == 'requestPermissionDetailed') {
        final reply = detailReply;
        if (reply == null) return null;
        // 批了 ⇒ ⇒ 系统权限状态**当场**变 ⇒ ⇒ 界面刷新后要能看到。
        if (reply['granted'] == true) osGranted = true;
        return reply;
      }
      if (call.method == 'openAppSettings') return true;
      return null;
    });
  }

  setUp(() => calls.clear());

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Future<void> pump(WidgetTester tester) async {
    // ⚠️ shadcn 组件要 ShadTheme 祖先 ⇒ ⇒ 用仓库自带的装配助手
    // （与真机同一套色板），否则 `ShadTheme.of(context)` 直接抛。
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: getTestOverrides(),
        child: withShadTheme(
          MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh'), Locale('en')],
            locale: const Locale('zh'),
            home: const Scaffold(
              body: SingleChildScrollView(child: CapabilityGrantsSection()),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('五个能力各一行，默认全是「每次询问」', (
    WidgetTester tester,
  ) async {
    mockChannel(granted: true);
    await pump(tester);

    for (final label in [
      '读取日历',
      '写入日历',
      '读取联系人',
      '读取短信',
      '读取相册',
      // ⚠️ 「手机操作」也在这张表里 —— 它是移动端对标桌面端
      // computer-use 的那条腿（读屏 / 点击 / 滑动）。
      '手机操作',
    ]) {
      expect(find.text(label), findsOneWidget, reason: '$label 那一行不见了');
    }
    // ⚠️ 默认档位 = 每次询问（fail-closed）—— 六项各一个下拉。
    expect(find.text('每次询问'), findsNWidgets(6));
    expect(find.text('完全访问'), findsNothing);
  });

  testWidgets('系统权限没授予 ⇒ 每行都给出「去授权」入口', (
    WidgetTester tester,
  ) async {
    mockChannel(granted: false);
    await pump(tester);

    // ⚠️ 副标题是**整句**一个 Text ⇒ ⇒ 用包含匹配（精确匹配找不到）。
    expect(find.textContaining('系统权限未授予'), findsNWidgets(5));
    expect(find.text('去授权'), findsNWidgets(5));
    // ⚠️ 「手机操作」缺的不是「权限」而是「**无障碍服务**」那个开关
    // ⇒ ⇒ 说法必须不一样（说「系统权限未授予」会让用户去权限页里
    // 找一个**根本不存在**的开关）⇒ ⇒ 入口也是另一个词。
    expect(find.textContaining('无障碍服务未开启'), findsOneWidget);
    expect(find.text('去开启'), findsOneWidget);
  });

  testWidgets('系统权限已授予 ⇒ 没有「去授权」入口', (
    WidgetTester tester,
  ) async {
    mockChannel(granted: true);
    await pump(tester);

    expect(find.textContaining('系统权限已授予'), findsNWidgets(5));
    expect(find.text('去授权'), findsNothing);
    // ⚠️ 无障碍服务那一行**不受**这个 mock 影响（它走的是另一条通道）
    // ⇒ ⇒ 单测里它恒为「未开启」⇒ ⇒ 入口还在。
    expect(find.textContaining('无障碍服务未开启'), findsOneWidget);
  });

  testWidgets('点「去授权」⇒ **就地弹系统框**，不把人支去设置页', (
    WidgetTester tester,
  ) async {
    mockChannel(
      granted: false,
      detail: {
        'granted': true,
        'dialogShown': true,
        'permanentlyDenied': false,
      },
    );
    await pump(tester);

    await tester.tap(find.text('去授权').first);
    await tester.pumpAndSettle();

    expect(calls, contains('requestPermissionDetailed'));
    // ⚠️ **不许**跳系统设置页 —— 弹窗能解决的事，就不该把用户支走。
    expect(calls, isNot(contains('openAppSettings')));
    // 授权结果要**看得见**（否则用户点了按钮却不知道成没成）。
    expect(find.text('已授权'), findsOneWidget);
    // 授权之后那一行应当改口（状态真的跟上了）。
    expect(find.textContaining('系统权限已授予'), findsNWidgets(5));
  });

  testWidgets('用户点了拒绝 ⇒ 留在原地（下次还能再弹）', (
    WidgetTester tester,
  ) async {
    mockChannel(
      granted: false,
      detail: {
        'granted': false,
        'dialogShown': true,
        'permanentlyDenied': false,
      },
    );
    await pump(tester);

    await tester.tap(find.text('去授权').first);
    await tester.pumpAndSettle();

    expect(calls, contains('requestPermissionDetailed'));
    // ⚠️ 系统**愿意**弹框却没批 ⇒ ⇒ 那是用户点了拒绝
    // ⇒ ⇒ 下次还能弹 ⇒ ⇒ 不该跳设置页。
    expect(calls, isNot(contains('openAppSettings')));
    expect(find.text('已取消授权'), findsOneWidget);
  });

  testWidgets('系统弹不出来 ⇒ 先说清楚为什么，再去设置页', (
    WidgetTester tester,
  ) async {
    mockChannel(
      granted: false,
      detail: {
        'granted': false,
        'dialogShown': false,
        'permanentlyDenied': true,
      },
    );
    await pump(tester);

    await tester.tap(find.text('去授权').first);
    await tester.pumpAndSettle();

    // ⚠️ **不许**直接把人支走 ⇒ ⇒ 先把原因说清楚。
    expect(calls, isNot(contains('openAppSettings')));
    expect(find.text('需要到系统设置里开启'), findsOneWidget);

    await tester.tap(find.text('去设置'));
    await tester.pumpAndSettle();

    expect(calls, contains('openAppSettings'));
  });

  testWidgets('请求被顶掉 ⇒ 既不提示，也不跳设置页', (
    WidgetTester tester,
  ) async {
    mockChannel(
      granted: false,
      detail: {
        'granted': false,
        'dialogShown': false,
        'permanentlyDenied': false,
        'superseded': true,
      },
    );
    await pump(tester);

    await tester.tap(find.text('去授权').first);
    await tester.pumpAndSettle();

    // ⚠️ 顶掉 ≠ 「系统拒绝再弹」⇒ ⇒ 不许拿它当借口把用户送去设置页。
    expect(calls, isNot(contains('openAppSettings')));
    expect(find.text('已取消授权'), findsNothing);
    expect(find.text('需要到系统设置里开启'), findsNothing);
  });

  testWidgets('下拉里有**三档**：每次询问 / 完全访问 / 彻底关闭', (
    WidgetTester tester,
  ) async {
    mockChannel(granted: true);
    await pump(tester);

    // 打开第一行的下拉（点当前选中的那一项）。
    await tester.tap(find.text('每次询问').first);
    await tester.pumpAndSettle();

    expect(find.text('完全访问'), findsOneWidget);
    expect(find.text('彻底关闭'), findsOneWidget);
  });

  testWidgets('用户把「读取日历」设成「彻底关闭」⇒ 那一行立刻改口', (
    WidgetTester tester,
  ) async {
    mockChannel(granted: true);
    await pump(tester);

    // ⚠️ 走**真实的策略提供者**（而不是硬塞状态）⇒ ⇒ 与真机同一条路。
    final container = ProviderScope.containerOf(
      tester.element(find.byType(CapabilityGrantsSection)),
    );
    // ⚠️⚠️ **必须包在 runAsync 里** —— setMode 会**真的写文件**
    // ⇒ ⇒ 而 widget 测试跑在 **fake-async zone** 里 ⇒ ⇒ 真 I/O 的
    // 完成回调**进不来那个 zone** ⇒ ⇒ 直接 await 会**永远等不到**
    // ⇒ ⇒ 症状是「测试挂死」（不是失败 ⇒ ⇒ 整轮 CI 卡住）。
    //
    // runAsync = 「在真的异步世界里跑这段」⇒ ⇒ 文件写完才继续。
    await tester.runAsync(() async {
      await container
          .read(capabilityPolicyProvider.notifier)
          .setMode(Capability.calendarRead, AuthorizationMode.disabled);
    });
    await tester.pumpAndSettle();

    expect(find.text('彻底关闭'), findsOneWidget);
    expect(find.textContaining('模型看不到这个能力'), findsOneWidget);
    // ⚠️ 别的五行**不受影响** ⇒ ⇒ 分档是独立的。
    expect(find.text('每次询问'), findsNWidgets(5));
  });

  testWidgets('iOS 上短信那一行标成「当前平台不支持」且不给「去授权」入口', (
    WidgetTester tester,
  ) async {
    // ⚠️ iOS **没有公开的短信读取 API** ⇒ ⇒ 那个能力在 iOS 上根本不存在
    // ⇒ ⇒ 界面上要说明白，而不是让用户配一个永远不会被触发的档。
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      mockChannel(granted: false);
      await pump(tester);

      // ⚠️ iOS 上**两行**不支持：短信（没有公开的读取 API）
      // 与手机操作（没有等价于无障碍服务的那套 API）。
      expect(find.textContaining('当前平台不支持这个能力'), findsNWidgets(2));
      // ⚠️ 只有那两行没有「去授权」⇒ ⇒ 别的四行还有。
      expect(find.text('去授权'), findsNWidgets(4));
    } finally {
      // ⚠️ **必须在这个用例里还原**（不能靠 addTearDown）——
      // flutter_test 在**用例体之后、tearDown 之前**就检查
      // 「foundation 的 debug 变量有没有被改过」⇒ ⇒ 还原晚了就红。
      debugDefaultTargetPlatformOverride = null;
    }
  });
}