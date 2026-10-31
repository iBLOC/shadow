import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/widgets/chat/agent2ui_view.dart';

import 'test_helper.dart';

/// Agent2UI 的**空态文案**必须说实话。
///
/// ## 为什么钉这个
///
/// 2026-10-31 的多端 A2UI 可用性评估撞出一条：
///
/// - 端脑**根本不产出 A2UI**（`telencephalon/src/**` grep `a2ui|genui` 零命中；
///   A2A 网关只做文本，`api/a2a_gateway.rs:133-136` 明写「Non-text parts are dropped」）；
/// - 移动端那个入口以前只判 `ids.isEmpty` ⇒ **没连上**、**连上了但服务端没产出**
///   两种情况都显示「Agent2UI 就绪 / 问我任何问题」；
/// - ⇒ 用户被明确告知「就绪」，然后永远等不到任何界面。
///
/// 「宣称就绪却永远空白」比「没有这个入口」更伤 —— 它承诺了一个不存在的能力。
///
/// 这个文件钉住：**没连上就不许说「就绪」**。
void main() {
  testSetup();

  Future<void> pumpAgent2UI(
    WidgetTester tester, {
    required ConnectionStatus status,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
          a2uiConnectionStatusProvider.overrideWith(
            (ref) => Stream.value(status),
          ),
          surfaceIdsProvider.overrideWith(
            (ref) => Stream.value(const <String>[]),
          ),
        ],
        child: const MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: [Locale('en')],
          locale: Locale('en'),
          // ⚠️ 必须包一层 `Scaffold`：
          // ① `MaterialApp.home` **不自带 Material**（只有 Scaffold/Dialog 才有）
          //    ⇒ 里面的 `TextField` 会抛「No Material widget found」；
          // ② 生产环境里 `Agent2UIView` 就在 `chat_screen.dart:190` 的
          //    `Scaffold.body > Column > Expanded` 里 ⇒ 这里要与生产同构。
          home: Scaffold(body: Agent2UIView()),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('没连上时，空态说的是「连不上」而不是「就绪」', (
    WidgetTester tester,
  ) async {
    // 未连接：这是默认状态，也是真机上最常见的状态
    // （A2UI 的地址写死 localhost:60080，手机上必然连不上）。
    await pumpAgent2UI(tester, status: ConnectionStatus.disconnected);

    final l10n = l10nOf(tester);

    // ❌ 不能说「就绪」—— 服务端根本没产出，连接也没建立。
    expect(find.text(l10n.agent2uiReady), findsNothing);
    // ❌ 也不能说「我会为您生成界面」—— 端脑根本不产出 A2UI，那是假承诺。
    expect(find.text(l10n.askMeAnything), findsNothing);
    // ✅ 说实话：连不上。
    expect(find.text(l10n.agent2uiNoConnection), findsOneWidget);
    // 状态栏仍然负责「连上了没」—— 它是**唯一**说这句话的地方
    // （空态不复读状态栏，否则同一句话会在屏幕上出现两次）。
    expect(find.text(l10n.disconnected), findsOneWidget);
  });

  testWidgets('连接中时，空态说的是「正在等」', (WidgetTester tester) async {
    await pumpAgent2UI(tester, status: ConnectionStatus.connecting);

    final l10n = l10nOf(tester);

    expect(find.text(l10n.agent2uiReady), findsNothing);
    expect(find.text(l10n.askMeAnything), findsNothing);
    expect(find.text(l10n.agent2uiWaiting), findsOneWidget);
    // 「正在连接 Shadow...」只出现在状态栏。
    expect(find.text(l10n.connectingToShadow), findsOneWidget);
  });

  testWidgets('连上了但服务端没给内容 ⇒ 说「还没生成界面」，也不是「就绪」', (
    WidgetTester tester,
  ) async {
    await pumpAgent2UI(tester, status: ConnectionStatus.connected);

    final l10n = l10nOf(tester);

    // 「就绪」这句话今天是**假的** —— 端脑不产出 A2UI。
    expect(find.text(l10n.agent2uiReady), findsNothing);
    expect(find.text(l10n.askMeAnything), findsNothing);
    expect(find.text(l10n.agent2uiNoSurface), findsOneWidget);
    // 状态栏说的是「已连接到 Shadow A2A 服务器」，与空态文案不重样。
    expect(find.text(l10n.connectedToShadowA2AServer), findsOneWidget);
  });
}
