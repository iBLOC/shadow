import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genui/genui.dart';
import 'package:shadow_mobile/services/genui/shadow_catalog.dart';

/// **跨端契约测试**：端脑产出的 A2UI 组件树，在客户端**真的渲染得出来**。
///
/// ## 为什么要有这个测试
///
/// A2UI 的失败模式**全是静默的**：
///
/// - SSE 的 JSON 里没有 `result` ⇒ 客户端**静默丢弃**（`sse_parser.dart:45-49`）
/// - A2UI 载荷不在 `status.message.parts[].data` ⇒ **静默丢弃**
///   （`a2ui_agent_connector.dart:182-186`）
/// - 组件类型不在客户端目录里 ⇒ **只打一条 severe 日志**，
///   然后渲染一个空 `Container`（`catalog.dart:64-70`）
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
  testWidgets('端脑产出的 A2UI 组件树在客户端真的渲染得出来', (
    WidgetTester tester,
  ) async {
    // ── 1. 读契约 fixture（与端脑那份逐字节相同）────────────────────
    final fixture = _readFixture();
    final payloads = (jsonDecode(fixture) as List<dynamic>)
        .map((e) => (e as Map).cast<String, Object?>())
        .toList();
    expect(payloads, hasLength(2), reason: 'fixture 应当是 surfaceUpdate + beginRendering 两条');

    // ── 2. 用**真的**处理器 + **真的**组件目录 ──────────────────────
    final processor = A2uiMessageProcessor(catalogs: [ShadowCatalog.create()]);
    final added = <SurfaceAdded>[];
    // ⚠️ broadcast stream 不重放 ⇒ 必须**先订阅**再喂消息。
    processor.surfaceUpdates.listen((update) {
      if (update is SurfaceAdded) added.add(update);
    });

    for (final payload in payloads) {
      processor.handleMessage(A2uiMessage.fromJson(payload));
    }

    // ⚠️ `A2uiMessageProcessor._surfaceUpdates` 是**普通 broadcast** controller
    // （`genui-0.7.0/lib/src/core/a2ui_message_processor.dart:96`，
    // 没有 `sync: true`）⇒ 事件是**异步投递**的（排在微任务里）。
    // 不 flush 一下就断言 ⇒ 看到的是空列表。
    await tester.pump();

    // ── 3. surface 真的被加进来了 ─────────────────────────────────
    expect(added, hasLength(1), reason: 'beginRendering 应当触发一次 SurfaceAdded');
    expect(added.single.surfaceId, 'shadow.tasks');

    final definition = added.single.definition;
    expect(definition.rootComponentId, 'root');

    // ── 4. 每个组件的类型都在客户端目录里 ──────────────────────────
    //    （不在 ⇒ `catalog.buildWidget` 只打一条 severe 日志、渲染空 Container
    //      ⇒ 「服务端产出了东西，屏幕上却什么都没有」）
    final catalogNames = ShadowCatalog.create().items.map((i) => i.name).toSet();
    for (final entry in definition.components.entries) {
      final type = entry.value.type;
      expect(
        catalogNames,
        contains(type),
        reason: '组件 ${entry.key} 的类型 "$type" 不在客户端目录里 ⇒ 渲染不出来',
      );
    }

    // ── 5. 根的子组件都能解析到（不能有悬空引用）────────────────────
    final root = definition.components['root'];
    expect(root, isNotNull);
    final rootComponent = root!.componentProperties['Column'];
    expect(rootComponent, isNotNull, reason: '根必须是 Column');
    final children = (rootComponent as Map)['children'] as List<dynamic>;
    expect(children, isNotEmpty);
    for (final childId in children.cast<String>()) {
      expect(
        definition.components.containsKey(childId),
        isTrue,
        reason: '根引用了不存在的子组件 "$childId"',
      );
    }

    // ── 6. 终极检验：**渲染出来**，屏幕上要有字 ─────────────────────
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GenUiSurface(host: processor, surfaceId: 'shadow.tasks'),
        ),
      ),
    );
    await tester.pump();

    // 任务描述与优先级来自**服务端产出的 JSON** ⇒ 它们出现在屏幕上
    // 就证明「服务端的字节 → 客户端的界面」这条链真的通了。
    expect(
      find.text('本周进展汇总'),
      findsOneWidget,
      reason: '服务端产出的任务描述没出现在界面上',
    );
    expect(
      find.text('HIGH'),
      findsOneWidget,
      reason: '服务端产出的优先级没出现在界面上',
    );
    expect(find.byType(Card), findsOneWidget, reason: 'TaskCard 应该渲染成一张卡片');

    processor.dispose();
  });

  testWidgets('同一个 surface 重新 beginRendering ⇒ 不会开出第二个 surface', (
    WidgetTester tester,
  ) async {
    // ⚠️ 这是**客户端自己的一个坑**：`_onSurfaceAdded` 以前是无条件 append，
    // 而端脑按视图给**稳定**的 surface id（`shadow.tasks`）⇒ 第二次请求
    // 同一个视图会再触发一次 `SurfaceAdded` ⇒ 列表里出现两个一样的 surface。
    // （见 `lib/services/genui/gen_ui_agent_service.dart` 的 `_onSurfaceAdded`。）
    final fixture = _readFixture();
    final payloads = (jsonDecode(fixture) as List<dynamic>)
        .map((e) => (e as Map).cast<String, Object?>())
        .toList();

    final processor = A2uiMessageProcessor(catalogs: [ShadowCatalog.create()]);
    final added = <SurfaceAdded>[];
    processor.surfaceUpdates.listen((update) {
      if (update is SurfaceAdded) added.add(update);
    });

    // 连喂两遍
    for (var round = 0; round < 2; round++) {
      for (final payload in payloads) {
        processor.handleMessage(A2uiMessage.fromJson(payload));
      }
    }
    await tester.pump(); // broadcast controller 异步投递 ⇒ 先 flush

    expect(added, hasLength(2), reason: '两次 beginRendering ⇒ 两次 SurfaceAdded（这是对的）');
    expect(
      added.map((a) => a.surfaceId).toSet(),
      {'shadow.tasks'},
      reason: '两次必须是**同一个** surface id —— 否则界面上会出现两份一样的界面',
    );

    processor.dispose();
  });
}

/// 找契约 fixture。
///
/// ⚠️ `flutter test` 的工作目录是**包根**（`shadow-mobile`），
/// 不是测试文件所在目录 ⇒ 相对路径要按包根算。
/// 但为了不把测试写死在某一个布局上，这里多试几个候选路径。
String _readFixture() {
  const relative = 'fixtures/a2ui/tasks_surface.json';
  final candidates = <File>[
    File('../$relative'), // shadow-mobile → shadow/
    File('../../$relative'), // 测试文件目录起算
    File(relative), // 已经在 shadow/ 里
  ];
  for (final candidate in candidates) {
    if (candidate.existsSync()) {
      return candidate.readAsStringSync();
    }
  }
  throw StateError(
    '找不到契约 fixture。试过：'
    '${candidates.map((f) => f.path).join(' | ')}'
    '（当前工作目录 ${Directory.current.path}）',
  );
}
