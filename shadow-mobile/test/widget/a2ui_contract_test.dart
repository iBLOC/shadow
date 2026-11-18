import 'dart:convert';
import 'dart:io';

import 'package:a2ui_core/a2ui_core.dart';
import 'package:a2ui_flutter/a2ui_flutter.dart';
import 'package:a2ui_flutter/basic_catalog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/a2ui/a2ui_agent_service.dart';
import 'package:shadow_mobile/services/a2ui/shadow_catalog.dart';

import '../support/a2ui_fixture.dart';

/// **跨端契约测试**：端脑产出的 A2UI 组件树，在客户端**真的渲染得出来**。
///
/// ## 为什么要有这个测试
///
/// A2UI 的失败模式**全是静默的**：
///
/// - SSE 的 JSON 里没有 `result` ⇒ 客户端**静默丢弃**
/// - A2UI 载荷不在 `status.message.parts[].data` ⇒ **静默丢弃**
/// - 载荷的 `data` 是**一串 JSON 文本**而不是对象 ⇒ **静默丢弃**
/// - 组件类型不在客户端目录里 ⇒ **只打一条日志**，然后画不出来
/// - v1.0 的**校验**没过 ⇒ 整条 `createSurface` 被拒 ⇒ **一个面都不会有**
///   ⇒ 界面上「什么都没有」⇒ **失败长得像成功**
///
/// ⇒ 「服务端返回 200」**证明不了任何事**。
/// 这个测试把服务端产出的**同一份字节**喂给客户端**真的**处理器，
/// 然后**渲染出来**，断言屏幕上真的有字。
///
/// ## 那份字节从哪来
///
/// `shadow/fixtures/a2ui/tasks_surface.json` —— 放在**跨端仓**里，
/// 两边读同一份：
///
/// - 端脑侧：`telencephalon/tests/a2ui.rs`
///   （断言它的产出**逐字**等于这份 fixture）
/// - 客户端侧（本文件）：断言这份 fixture **渲染得出来**
///
/// ⇒ 任一端改了协议而没改另一端，这个测试就会红。
void main() {
  /// 官方 SDK 的处理器 —— **两个目录都要注册**（标准组件走官方基础目录，
  /// 两个业务组件走自建目录）⇒ ⇒ v1.0 的「一个面里混多个目录」靠的就是它。
  MessageProcessor<ComponentImplementation> newProcessor() {
    return MessageProcessor<ComponentImplementation>(
      catalogs: <Catalog<ComponentImplementation, FunctionImplementation>>[
        basicCatalog(),
        shadowCatalog(),
      ],
      defaultVersion: A2uiProtocolVersion.v1_0,
      // ⚠️ 一条坏消息不许把整批带崩 ⇒ 只报不抛（错误走 onError）。
      reportErrorsOnly: true,
    );
  }

  testWidgets('共享 fixture ⇒ 真的建得出 surface，TaskCard 也**解析得到**', (
    WidgetTester tester,
  ) async {
    // ── 1. 契约 fixture（与端脑那份逐字节相同）────────────────────
    final contract = _readContractFixture();
    expect(
      contract,
      hasLength(1),
      reason: 'v1.0 的任务看板是**一条** `createSurface`'
          '（v0.8 那个「先递组件、再 beginRendering」的两条没了）',
    );

    final processor = newProcessor();
    final errors = <A2uiRendererError>[];
    processor.model.onError.subscribe(errors.add);

    processor.processMessages(contract);
    await tester.pump(); // 错误在微任务里才到 ⇒ 先 flush

    // ❗ **不许有任何错** —— 共享 fixture 是**两端共享的真相源**
    //    ⇒ ⇒ 它必须**一次就过**官方 SDK 的校验。
    expect(
      errors,
      isEmpty,
      reason: '共享 fixture 喂进官方 SDK 必须**一次就过**：'
          '${errors.map((e) => e.message).join(' | ')}',
    );

    // ✅ **真的建出面来**。
    final surface = processor.model.getSurface('shadow.tasks');
    expect(surface, isNotNull, reason: '共享 fixture 必须真的建出面来');
    expect(surface!.id, 'shadow.tasks');
    expect(
      surface.defaultCatalog?.id,
      basicCatalogId,
      reason: '面的默认目录是官方基础目录（标准组件从这儿来）',
    );

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: A2uiSurface(surface: surface))),
    );
    await tester.pump();

    // ✅ **TaskCard 解析得到**（不是一个空容器）—— 服务端产出的字上屏了。
    expect(
      find.text('写周报'),
      findsOneWidget,
      reason: '服务端产出的任务标题没出现在界面上 ⇒ TaskCard 没解析出来',
    );
    expect(
      find.text('本周进展汇总'),
      findsOneWidget,
      reason: '服务端产出的任务描述没出现在界面上 ⇒ TaskCard 没解析出来',
    );
    expect(
      find.text('HIGH'),
      findsOneWidget,
      reason: '服务端产出的优先级没出现在界面上 ⇒ TaskCard 没解析出来',
    );
    expect(find.byType(Card), findsOneWidget, reason: 'TaskCard 应该渲染成一张卡片');

    // ── **两个目录各归各位** ───────────────────────────────────
    // ⚠️ **不写死组件 id** —— 端脑改了 id（`task-0` → `task0`）这里也不受影响。
    final byType = <String, ComponentModel>{
      for (final c in surface.componentsModel.all) c.type: c,
    };
    expect(
      byType['TaskCard']?.catalog,
      shadowCatalogId,
      reason: '自建组件必须落在**自建目录**里',
    );
    expect(
      byType['Column']?.catalog,
      isNull,
      reason: '标准组件走**面的默认目录**（不点自己的目录）',
    );
    expect(byType['Text']?.catalog, isNull);

    processor.dispose();
  });

  testWidgets('负控：组件 id 带**连字符**（`task-0`）⇒ 官方必须**拒**', (
    WidgetTester tester,
  ) async {
    // ⚠️ **这一条钉住「id 形状」那一格** —— v1.0 的组件 id 必须是合法的
    //    **UAX #31** 标识符（`^[\\p{XID_Start}_]\\p{XID_Continue}*$`
    //    ⇒ **连字符不行**）⇒ ⇒ `task-0` / `agent-0` **不合法**
    //    ⇒ ⇒ 官方 SDK **拒收整条 `createSurface`** ⇒ ⇒ **一个面都不会有**。
    //
    // ⚠️ **端脑那侧必须用无连字符的 id**（`task0` / `agent0`）。
    final processor = newProcessor();
    final errors = <A2uiRendererError>[];
    processor.model.onError.subscribe(errors.add);

    processor.processMessages(<Map<String, Object?>>[
      _tasksMessage(cardId: 'task-0'),
    ]);
    await tester.pump();

    expect(errors, isNotEmpty, reason: '不合规的 id 必须被拒（而不是被忽略）');
    expect(
      errors.map((e) => e.message).join(' | '),
      contains('task-0'),
      reason: '错误里必须**点名**那个不合规的组件 id',
    );
    expect(
      processor.model.getSurface('shadow.tasks'),
      isNull,
      reason: '被拒的 createSurface 不得留下半个面 ⇒ 界面上一个面都没有',
    );
    processor.dispose();
  });

  testWidgets('负控：组件的目录键是 `catalogId`（`@catalogId` 会被拒）', (
    WidgetTester tester,
  ) async {
    // ⚠️ v1.0 的保留键只有 `@path` / `@call` 两个 ⇒ `@catalogId` 是
    //    「**未识别的保留指令**」⇒ ⇒ **整条消息被拒**（而不是「被忽略」）。
    // ⇒ ⇒ 端脑与客户端写目录键时**不许带 @**。
    final processor = newProcessor();
    final errors = <A2uiRendererError>[];
    processor.model.onError.subscribe(errors.add);

    processor.processMessages(<Map<String, Object?>>[
      _tasksMessage(cardId: 'task0', catalogKey: '@catalogId'),
    ]);
    await tester.pump();

    expect(errors, isNotEmpty, reason: '`@catalogId` 必须被拒（而不是被忽略）');
    expect(
      errors.map((e) => e.message).join(' | '),
      contains('@catalogId'),
      reason: '错误里必须**点名**那个未识别的保留键',
    );
    expect(processor.model.getSurface('shadow.tasks'), isNull);
    processor.dispose();
  });

  testWidgets('自建目录里只有**真实存在的两个**组件', (
    WidgetTester tester,
  ) async {
    // ⚠️ **旧判据钉的是六个死目录项**（MemoryCard / ProgressStepper /
    //    NotificationToast / ToolCallCard / ConversationBubble /
    //    QuickActionButton）—— 它们是**死定义**（端脑从不下发，客户端也从不用）
    //    ⇒ ⇒ 断言改成钉**真实存在的两个**。
    final catalog = shadowCatalog();

    expect(catalog.id, shadowCatalogId);
    expect(
      catalog.components.keys.toSet(),
      <String>{'TaskCard', 'AgentStatusIndicator'},
      reason: '自建目录只声明这两个组件',
    );
    expect(catalog.protocolVersion, A2uiProtocolVersion.v1_0);

    // 而且**两个都真的画得出来**（不是只在目录里挂着）。
    final processor = newProcessor();
    processor.processMessages(<Map<String, Object?>>[conformantAgentsMessage()]);
    await tester.pump();

    final surface = processor.model.getSurface('shadow.agents');
    expect(surface, isNotNull);
    final indicators =
        surface!.componentsModel.all.where((c) => c.type == 'AgentStatusIndicator');
    expect(indicators, hasLength(2));
    for (final component in indicators) {
      expect(component.catalog, shadowCatalogId);
    }

    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: A2uiSurface(surface: surface))),
    );
    await tester.pump();

    expect(find.text('parietal'), findsOneWidget);
    expect(find.text('frontal'), findsOneWidget);

    processor.dispose();
  });

  test('同一个 surface 重新 createSurface ⇒ 不会开出第二个 surface', () async {
    // ⚠️ 这是**客户端自己的一个坑**：端脑按视图给**稳定**的 surface id
    //    （`shadow.tasks`）⇒ 第二次请求同一个视图会**再来一条
    //    `createSurface`** ⇒ 旧 SDK 会再触发一次「surface 建好了」
    //    ⇒ 列表里出现两个一样的界面。
    //
    // ⚠️ **v1.0 的机制变了**：官方 SDK 直接**拒收**重复创建
    //    （`A2uiIntegrityError`）⇒ ⇒ 客户端这边**只会有一个 surface**。
    final service = A2uiAgentService(
      serverUrl: 'http://127.0.0.1:1/a2a',
      shadowKeyProvider: () => null,
    );
    addTearDown(service.dispose);

    service.ingestSurfaceEvents(conformantTasksEvents());
    await _waitUntil(() => service.surfaceIds.isNotEmpty);
    service.ingestSurfaceEvents(conformantTasksEvents());
    await _waitUntil(() => service.surfaceIds.isNotEmpty);

    expect(
      service.surfaceIds,
      <String>['shadow.tasks'],
      reason: '两次必须是**同一个** surface id —— 否则界面上会出现两份一样的界面',
    );
    expect(service.surfaceIds, hasLength(1));
  });
}

/// 任务看板的 v1.0 消息 —— **卡片 id 与目录键可变**（负控要用）。
Map<String, Object?> _tasksMessage({
  required String cardId,
  String catalogKey = 'catalogId',
}) {
  return <String, Object?>{
    'version': '1.0',
    'createSurface': <String, Object?>{
      'surfaceId': 'shadow.tasks',
      'catalogId': basicCatalogId,
      'components': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'root',
          'component': 'Column',
          'children': <String>['title', cardId],
        },
        <String, Object?>{'id': 'title', 'component': 'Text', 'text': '# Tasks (1)'},
        <String, Object?>{
          'id': cardId,
          'component': 'TaskCard',
          catalogKey: shadowCatalogId,
          'title': '写周报',
          'description': '本周进展汇总',
          'status': 'in_progress',
          'priority': 'high',
        },
      ],
    },
  };
}

/// 等到 [predicate] 成立（上限 5 秒）。
Future<void> _waitUntil(bool Function() predicate) async {
  for (var i = 0; i < 100; i++) {
    if (predicate()) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  throw StateError('等待超时（5 秒）');
}

/// 读契约 fixture。
///
/// ⚠️ `flutter test` 的工作目录是**包根**（`shadow-mobile`），
/// 不是测试文件所在目录 ⇒ 相对路径要按包根算。
/// 但为了不把测试写死在某一个布局上，这里多试几个候选路径。
List<Map<String, Object?>> _readContractFixture() {
  const relative = 'fixtures/a2ui/tasks_surface.json';
  final candidates = <File>[
    File('../$relative'), // shadow-mobile → shadow/
    File('../../$relative'), // 测试文件目录起算
    File(relative), // 已经在 shadow/ 里
  ];
  for (final candidate in candidates) {
    if (candidate.existsSync()) {
      final decoded = jsonDecode(candidate.readAsStringSync());
      return (decoded as List<dynamic>)
          .map((e) => (e as Map).cast<String, Object?>())
          .toList();
    }
  }
  throw StateError(
    '找不到契约 fixture。试过：'
    '${candidates.map((f) => f.path).join(' | ')}'
    '（当前工作目录 ${Directory.current.path}）',
  );
}
