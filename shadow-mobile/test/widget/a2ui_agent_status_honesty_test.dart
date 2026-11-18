import 'package:a2ui_core/a2ui_core.dart';
import 'package:a2ui_flutter/a2ui_flutter.dart';
import 'package:a2ui_flutter/basic_catalog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/a2ui/shadow_catalog.dart';

/// **「我们不知道」不许画成「没事」** —— 叶区状态那一格的诚实性。
///
/// ## 为什么手机这一侧最要紧
///
/// `AgentStatusIndicator` 在手机上**只显示颜色，不显示 status 文本**
/// （`lib/services/a2ui/shadow_catalog.dart` 的 builder
/// ⇒ 画出来的是 `Icon + Text(agentName)`，没有 status 字样）
/// ⇒ **颜色就是全部的话**。
///
/// 而端脑启动时自己种下 4 条**占位**叶区（prefrontal / temporal / parietal /
/// occipital）—— 它们**从来没被联系过** ⇒ 端脑在
/// `GET /api/telencephalon/agents` 上说的是 `"health_status":"unknown"`
/// ⇒ A2UI 那张面必须说同一句话（`telencephalon/src/a2a/a2ui_v1.rs`
/// 的 `agent_status` ⇒ 报 `unknown`）。
///
/// ⚠️ 以前目录里的 `switch` **没有 `unknown` 这一档** ⇒ 端脑发的 `unknown`
/// 落进 `default` ⇒ 而 `default` 是**绿色** ⇒
/// **「失败长得像成功」**：从没被联系过的叶区在手机上一片绿灯。
///
/// ⚠️ 而且端脑哪天**多说一个词**（客户端还不认识）⇒ 现在是**更响**的一种失败：
/// v1.0 的官方 SDK **按目录的 schema 校验** ⇒ 一个不在枚举里的 `status`
/// ⇒ **整个面被拒**（`VALIDATION_FAILED`）⇒ ⇒ 界面上**什么都不会有**
/// ⇒ ⇒ 更不会是一片绿灯（见下面第二条判据）。
void main() {
  MessageProcessor<ComponentImplementation> newProcessor() {
    return MessageProcessor<ComponentImplementation>(
      catalogs: <Catalog<ComponentImplementation, FunctionImplementation>>[
        basicCatalog(),
        shadowCatalog(),
      ],
      defaultVersion: A2uiProtocolVersion.v1_0,
      reportErrorsOnly: true,
    );
  }

  /// 一张只放「认识的那几个 status」的叶区面。
  Map<String, Object?> knownStatusesMessage() {
    return <String, Object?>{
      'version': '1.0',
      'createSurface': <String, Object?>{
        'surfaceId': 'shadow.agents',
        'catalogId': basicCatalogId,
        'components': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'root',
            'component': 'Column',
            'children': <String>['a0', 'a1', 'a2'],
          },
          <String, Object?>{
            'id': 'a0',
            'component': 'AgentStatusIndicator',
            'catalogId': shadowCatalogId,
            'agentName': 'parietal',
            'status': 'unknown',
            'message': 'not probed',
          },
          <String, Object?>{
            'id': 'a1',
            'component': 'AgentStatusIndicator',
            'catalogId': shadowCatalogId,
            'agentName': 'frontal',
            'status': 'idle',
          },
          <String, Object?>{
            // ⚠️ **连 status 都没说** ⇒ 更不许当成「就绪」。
            'id': 'a2',
            'component': 'AgentStatusIndicator',
            'catalogId': shadowCatalogId,
            'agentName': 'occipital',
          },
        ],
      },
    };
  }

  testWidgets('「不知道」的叶区不许画成绿灯（绿灯 = 就绪）', (
    WidgetTester tester,
  ) async {
    final processor = newProcessor();
    final created = <SurfaceModel<ComponentImplementation>>[];
    processor.model.onSurfaceCreated.subscribe(created.add);

    processor.processMessages(<Map<String, Object?>>[knownStatusesMessage()]);
    await tester.pump(); // 事件是异步投递的 ⇒ 先 flush

    expect(created, hasLength(1), reason: 'createSurface 应当触发一次「面建好了」');

    final surface = processor.model.getSurface('shadow.agents');
    expect(surface, isNotNull);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: A2uiSurface(surface: surface!)),
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

    // ⚠️ `idle`（就绪）**才是**绿的 ⇒ 上面的断言有分辨力，不是恒真。
    expect(
      colorOf('frontal'),
      Colors.green,
      reason: 'idle 必须是绿的 —— 否则上面那条断言就没有意义了',
    );
    expect(
      colorOf('occipital'),
      isNot(Colors.green),
      reason: '连 status 都没说 ⇒ 缺省必须是「不知道」，不是「就绪」',
    );

    // 形状也要分得开：`unknown` 与**缺 status** ⇒ 问号；`idle` ⇒ 圆点。
    expect(find.byIcon(Icons.help_outline), findsNWidgets(2));
    expect(find.byIcon(Icons.circle), findsOneWidget);

    processor.dispose();
  });

  testWidgets('端脑说了个客户端**还不认识**的词 ⇒ 整个面被拒（绝不落绿）', (
    WidgetTester tester,
  ) async {
    // ⚠️ **v1.0 的机制变了**：官方 SDK **按目录的 schema 校验**
    // ⇒ `status` 的枚举里没有 `brand-new-status` ⇒ **整条 createSurface 被拒**
    // ⇒ ⇒ 界面上**一个面都没有** ⇒ ⇒ 比「落绿」更诚实，但**必须响亮**。
    final processor = newProcessor();
    final errors = <A2uiRendererError>[];
    processor.model.onError.subscribe(errors.add);

    processor.processMessages(<Map<String, Object?>>[
      <String, Object?>{
        'version': '1.0',
        'createSurface': <String, Object?>{
          'surfaceId': 'shadow.agents',
          'catalogId': basicCatalogId,
          'components': <Map<String, Object?>>[
            <String, Object?>{
              'id': 'root',
              'component': 'Column',
              'children': <String>['a0'],
            },
            <String, Object?>{
              'id': 'a0',
              'component': 'AgentStatusIndicator',
              'catalogId': shadowCatalogId,
              'agentName': 'temporal',
              'status': 'brand-new-status',
            },
          ],
        },
      },
    ]);
    await tester.pump();

    // ✅ **响亮**：校验失败必须被报出来（不许静默忽略）。
    expect(errors, isNotEmpty, reason: '不认识的状态词必须被报出来');
    final message = errors.map((e) => e.message).join(' | ');
    expect(
      message,
      contains('AgentStatusIndicator'),
      reason: '错误里必须**点名**是哪个组件没过',
    );
    expect(
      message,
      contains('status'),
      reason: '错误里必须**点名**是哪个字段没过',
    );
    expect(
      message,
      contains('enum'),
      reason: '错误里必须说清是**枚举**不匹配（客户端不认识这个词）',
    );

    // ✅ **界面上不可能有绿灯** —— 面压根没建起来。
    expect(
      processor.model.getSurface('shadow.agents'),
      isNull,
      reason: '被拒的面不得留下半个 ⇒ 更不许画成一片绿灯',
    );

    processor.dispose();
  });
}
