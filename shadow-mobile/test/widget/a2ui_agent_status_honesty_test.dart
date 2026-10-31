import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genui/genui.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// **「我们不知道」不许画成「没事」** —— 叶区状态那一格的诚实性。
///
/// ## 为什么手机这一侧最要紧
///
/// `AgentStatusIndicator` 在手机上**只显示颜色，不显示 status 文本**
/// （`lib/services/genui/shadow_catalog.dart` 的 widgetBuilder
/// ⇒ 画出来的是 `Icon + Text(agentName)`，没有 status 字样）
/// ⇒ **颜色就是全部的话**。
///
/// 而端脑启动时自己种下 4 条**占位**叶区（prefrontal / temporal / parietal /
/// occipital）—— 它们**从来没被联系过** ⇒ 端脑在
/// `GET /api/telencephalon/agents` 上说的是 `"health_status":"unknown"`
/// ⇒ A2UI 那张面必须说同一句话（`telencephalon/src/a2a/a2ui.rs`
/// 的 `agent_status` ⇒ 报 `unknown`）。
///
/// ⚠️ 以前目录里的 `switch` **没有 `unknown` 这一档** ⇒ 端脑发的 `unknown`
/// 落进 `default` ⇒ 而 `default` 是**绿色** ⇒
/// **「失败长得像成功」**：从没被联系过的叶区在手机上一片绿灯。
///
/// ⚠️ 而且端脑哪天**多说一个词**（客户端还不认识）⇒ 同样落进 `default`
/// ⇒ 同样一片绿灯 ⇒ 所以 `default` 自己也必须不许落绿。
void main() {
  testWidgets('「不知道」的叶区不许画成绿灯（绿灯 = 就绪）', (
    WidgetTester tester,
  ) async {
    final processor = A2uiMessageProcessor(catalogs: [ShadowCatalog.create()]);
    final added = <SurfaceAdded>[];
    processor.surfaceUpdates.listen((update) {
      if (update is SurfaceAdded) added.add(update);
    });

    processor.handleMessage(
      A2uiMessage.fromJson({
        'surfaceUpdate': {
          'surfaceId': 'shadow.agents',
          'components': [
            {
              'id': 'root',
              'component': {
                'Column': {
                  'children': ['a0', 'a1', 'a2', 'a3'],
                },
              },
            },
            {
              'id': 'a0',
              'component': {
                'AgentStatusIndicator': {
                  'agentName': 'parietal',
                  'status': 'unknown',
                  'message': 'not probed',
                },
              },
            },
            {
              'id': 'a1',
              'component': {
                'AgentStatusIndicator': {
                  'agentName': 'temporal',
                  'status': 'brand-new-status',
                },
              },
            },
            {
              'id': 'a2',
              'component': {
                'AgentStatusIndicator': {
                  'agentName': 'frontal',
                  'status': 'idle',
                },
              },
            },
            {
              // ⚠️ **连 status 都没说** ⇒ 更不许当成「就绪」。
              'id': 'a3',
              'component': {
                'AgentStatusIndicator': {
                  'agentName': 'occipital',
                },
              },
            },
          ],
        },
      }),
    );
    processor.handleMessage(
      A2uiMessage.fromJson({
        'beginRendering': {'surfaceId': 'shadow.agents', 'root': 'root'},
      }),
    );
    await tester.pump(); // broadcast controller 异步投递 ⇒ 先 flush

    expect(added, hasLength(1), reason: 'beginRendering 应当触发一次 SurfaceAdded');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GenUiSurface(host: processor, surfaceId: 'shadow.agents'),
        ),
      ),
    );
    await tester.pump();

    Color colorOf(String name) =>
        tester.widget<Text>(find.text(name)).style?.color ?? Colors.transparent;

    // ⚠️ 手机上**只显示颜色** ⇒ 颜色 = 全部的话 ⇒ 落绿就是撒谎。
    expect(
      colorOf('parietal'),
      isNot(Colors.green),
      reason: '端脑说 unknown（从没被探活过）⇒ 手机上不许显示成绿灯',
    );
    expect(
      colorOf('temporal'),
      isNot(Colors.green),
      reason: '端脑说了个客户端还不认识的词 ⇒ 同样不许落回绿灯',
    );

    // ⚠️ `idle`（就绪）**才是**绿的 ⇒ 上面的断言有分辨力，不是恒真。
    expect(
      colorOf('frontal'),
      Colors.green,
      reason: 'idle 必须是绿的 —— 否则上面两条断言就没有意义了',
    );
    expect(
      colorOf('occipital'),
      isNot(Colors.green),
      reason: '连 status 都没说 ⇒ 缺省必须是「不知道」，不是「就绪」',
    );

    // 形状也要分得开：`unknown`、不认识的词、以及**缺 status** ⇒ 问号；
    // `idle` ⇒ 圆点。
    expect(find.byIcon(Icons.help_outline), findsNWidgets(3));
    expect(find.byIcon(Icons.circle), findsOneWidget);

    processor.dispose();
  });
}
