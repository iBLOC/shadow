import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/widgets/chat/tool_call_card.dart';

import 'test_helper.dart';

/// **授权卡片必须说人话** —— 这是这一轮最后一块拼图。
///
/// 能力工具的**工具名**（`calendar_read_events`）与**工具描述**（一整段
/// 英文技术散文）都是**写给模型**的 ⇒ ⇒ 用户在「允许 / 拒绝」那两颗按钮
/// 面前看到它们，等于什么也没看懂 ⇒ ⇒ 这一层把它们翻成人话。
///
/// ⚠️ 同时钉住**不回归**：普通工具（`set_theme`）仍然是命令名 + 原始参数
/// ⇒ ⇒ 那是开发者看的形状，不该被改掉。
void main() {
  testSetup();

  Future<void> pumpCard(
    WidgetTester tester,
    ToolCallModel call, {
    Locale locale = const Locale('zh'),
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            // ⚠️ zh 需要 Cupertino 代理，否则 MaterialApp 会抛
            // 「CupertinoLocalizations delegate that supports zh was not found」。
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh'), Locale('en')],
          locale: locale,
          home: Scaffold(body: ToolCallCard(call: call)),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// 一个「正在等人点头」的能力工具调用。
  ToolCallModel awaiting({
    required String name,
    required Capability capability,
    Map<String, dynamic> args = const {},
    String? description,
  }) {
    return ToolCallModel(
      id: 'call-1',
      name: name,
      capability: capability,
      description: description,
      args: args,
      status: ToolCallStatus.awaitingApproval,
    );
  }

  testWidgets('能力工具：标题是「读取日历」，**不是**工具名', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'calendar_read_events',
        capability: Capability.calendarRead,
        description:
            'Read calendar events on this phone within a time range. Use when the user asks what is on their calendar.',
      ),
    );

    expect(find.text('读取日历'), findsOneWidget);
    expect(find.text('calendar_read_events'), findsNothing);
  });

  testWidgets('能力工具：说明是中文那句「要做什么」，不是英文工具描述', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'calendar_read_events',
        capability: Capability.calendarRead,
        description:
            'Read calendar events on this phone within a time range. Use when the user asks what is on their calendar.',
      ),
    );

    expect(find.text('要读取你手机上的日历事件'), findsOneWidget);
    expect(find.textContaining('Read calendar events'), findsNothing);
  });

  testWidgets('能力工具：参数说人话（「时间范围 …」），不是 `from: …`', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'calendar_read_events',
        capability: Capability.calendarRead,
        args: const {
          'from': '2026-11-02T09:00:00',
          'to': '2026-11-09T09:00:00',
        },
      ),
    );

    expect(find.text('时间范围 2026-11-02 09:00 ~ 2026-11-09 09:00'), findsOneWidget);
    expect(find.textContaining('from:'), findsNothing);
  });

  testWidgets('写日历：标题 + 开始时间说人话', (WidgetTester tester) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'calendar_write_event',
        capability: Capability.calendarWrite,
        args: const {'title': '站会', 'start': '2026-11-03T14:00:00'},
      ),
    );

    expect(find.text('写入日历'), findsOneWidget);
    expect(find.text('要往你手机上的日历里写一条日程'), findsOneWidget);
    expect(find.text('标题「站会」 · 2026-11-03 14:00 开始'), findsOneWidget);
  });

  testWidgets('读联系人：关键词说人话', (WidgetTester tester) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'contacts_search',
        capability: Capability.contacts,
        args: const {'query': '张'},
      ),
    );

    expect(find.text('读取联系人'), findsOneWidget);
    expect(find.text('姓名包含「张」'), findsOneWidget);
  });

  testWidgets('读短信 / 读相册：条数说人话', (WidgetTester tester) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'sms_read_messages',
        capability: Capability.sms,
        args: const {'limit': 12},
      ),
    );
    expect(find.text('最近 12 条短信'), findsOneWidget);

    await pumpCard(
      tester,
      awaiting(
        name: 'photos_list_recent',
        capability: Capability.photos,
        args: const {'limit': 8},
      ),
    );
    expect(find.text('最近 8 张图片'), findsOneWidget);
  });

  testWidgets('授权按钮是本地化的（不是硬编码英文）', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'calendar_read_events',
        capability: Capability.calendarRead,
      ),
    );

    expect(find.text('允许'), findsOneWidget);
    expect(find.text('拒绝'), findsOneWidget);
    expect(find.text('Allow'), findsNothing);
    expect(find.text('Deny'), findsNothing);
  });

  testWidgets('英文环境：跟着界面语言走', (WidgetTester tester) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'calendar_read_events',
        capability: Capability.calendarRead,
      ),
      locale: const Locale('en'),
    );

    expect(find.text('Read calendar'), findsOneWidget);
    expect(find.text('Read calendar events on this phone'), findsOneWidget);
    expect(find.text('Allow'), findsOneWidget);
  });

  testWidgets('普通工具**不回归**：仍是命令名 + 原始参数', (
    WidgetTester tester,
  ) async {
    final call = ToolCallModel(
      id: 'call-2',
      name: 'set_theme',
      description: 'Change the app theme colour',
      args: const {'color': '#4F46E5'},
      status: ToolCallStatus.succeeded,
      reported: true,
    );
    await pumpCard(tester, call);

    expect(find.text('set_theme'), findsOneWidget);
    expect(find.text('Change the app theme colour'), findsOneWidget);
    expect(find.textContaining('color:'), findsOneWidget);
  });

  testWidgets('手机操作：标题是「手机操作」，说明按**工具**区分', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'mobile_tap',
        capability: Capability.mobileUse,
        description: 'Tap one point on this phone screen.',
      ),
    );

    expect(find.text('手机操作'), findsOneWidget);
    expect(find.text('mobile_tap'), findsNothing);
    // ⚠️ 说明必须说清「要点」⇒ ⇒ 而不是含糊的「要操作这台手机」。
    expect(find.text('要点这台手机屏幕上的一个位置'), findsOneWidget);
  });

  testWidgets('手机操作：参数说人话（「位置 100, 200」），不是 `x: 100`', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      awaiting(
        name: 'mobile_tap',
        capability: Capability.mobileUse,
        args: const {'x': 100, 'y': 200},
      ),
    );

    expect(find.textContaining('位置 100, 200'), findsOneWidget);
    expect(find.textContaining('x:'), findsNothing);
  });

  testWidgets('手机操作：六个工具各说各的话（不许全一样）', (
    WidgetTester tester,
  ) async {
    final texts = <String>{};
    for (final name in [
      'mobile_read_screen',
      'mobile_tap',
      'mobile_long_press',
      'mobile_swipe',
      'mobile_find_and_click',
      'mobile_global_action',
    ]) {
      await pumpCard(
        tester,
        awaiting(name: name, capability: Capability.mobileUse),
      );
      final found = find.textContaining('这台手机');
      expect(found, findsWidgets, reason: '$name 的说明里没有「这台手机」');
      texts.add(tester.widget<Text>(found.first).data ?? '');
    }
    // ⚠️ 六个工具 ⇒ ⇒ 六句**不同**的话 —— 否则用户在「允许」那颗按钮
    // 前面根本不知道模型要干什么。
    expect(texts.length, 6);
  });
}