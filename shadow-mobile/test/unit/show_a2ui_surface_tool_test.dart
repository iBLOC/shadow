import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_en.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_zh.dart';
import 'package:shadow_mobile/l10n/current_l10n.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

import '../support/a2ui_fixture.dart';

/// 客户端工具 `show_a2ui_surface` —— **「模型在对话里点名要界面」**那条路。
///
/// ## 为什么钉它
///
/// 端脑把客户端声明的 `tools` 交给模型，模型决定调用时端脑发 `tool_call`，
/// **设备执行**，结果回传端脑喂回模型 ⇒ ⇒ 这条路一通，
/// 「对话中激活 Agent2UI」就不需要改协议。
///
/// ⚠️ **契约**（两端逐字一致）：
/// 执行结果 = `{ report, a2ui_events }`
/// ⇒ `a2ui_events` 是端脑 `POST /a2a` 发的**同一批事件**
/// （fixture `fixtures/a2ui/tasks_sse.txt`）
/// ⇒ ⇒ 移动端消费的是与桌面端**同一份字节**。
/// 端脑「这里能看什么」那种**纯文本**回复 —— **有事件，但没画界面**。
String _textOnlySse() {
  return 'data: {"result":{"kind":"task-status-update","taskId":"t","contextId":"c",'
      '"status":{"state":"completed","message":{"kind":"message","messageId":"m",'
      '"role":"agent","parts":[{"kind":"text","text":"这里能看什么"}]}},"final":true}}\n\n';
}

void main() {
  ClientToolRegistry registryWith({
    A2uiSurfaceEventFetcher? fetchSurfaceEvents,
    AppLocalizations Function()? l10nProvider,
  }) {
    return buildMobileClientTools(
      setAccentColor: (_) async {},
      setDarkMode: (_) async {},
      fetchSurfaceEvents:
          fetchSurfaceEvents ?? (_) async => const <Map<String, Object?>>[],
      l10nProvider: l10nProvider,
    );
  }

  group('已注册、参数声明', () {
    test('工具在注册表里', () {
      expect(registryWith().supports('show_a2ui_surface'), isTrue);
      expect(registryWith().lookup('show_a2ui_surface'), isNotNull);
    });

    test('参数声明告诉模型要一个 view —— enum 是 tasks / agents', () {
      final tools = toOpenAiTools(registryWith());
      final tool = tools.firstWhere(
        (t) => (t['function'] as Map)['name'] == 'show_a2ui_surface',
      );
      final parameters = (tool['function'] as Map)['parameters'] as Map;

      expect((parameters['properties'] as Map)['view'], {
        'type': 'string',
        'enum': ['tasks', 'agents'],
        'description':
            "Which interface to draw: 'tasks' = the task board, 'agents' = the registered agent list.",
      });
    });

    test('view 是必填 —— 没有它模型可以不带参数调', () {
      final tools = toOpenAiTools(registryWith());
      final tool = tools.firstWhere(
        (t) => (t['function'] as Map)['name'] == 'show_a2ui_surface',
      );
      final parameters = (tool['function'] as Map)['parameters'] as Map;

      expect(parameters['required'], ['view']);
    });

    test('⚠️ **这段字面量是跨端的契约** —— 桌面端有一模一样的一份', () {
      final tools = toOpenAiTools(registryWith());
      final tool = tools.firstWhere(
        (t) => (t['function'] as Map)['name'] == 'show_a2ui_surface',
      );

      expect(
        (tool['function'] as Map)['description'],
        'Show the user a generated interface inside the conversation (task board or agent list). Use it when the user asks to SEE their tasks or agents instead of listing them as text.',
      );
    });
  });

  group('执行', () {
    test('端脑的 SSE 字节 ⇒ 事件**逐字同形**于 fixture', () async {
      final service = a2uiFixtureService();
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
      );
      final result = await registry
          .lookup('show_a2ui_surface')!
          .execute(<String, dynamic>{'view': 'tasks'});

      final events = (result as Map)['a2ui_events'] as List;
      final expected = a2uiFixtureEvents();

      expect(events, hasLength(expected.length));
      // ⚠️ **形状逐字一致** —— 两端吃的是同一批事件。
      //    （这里断言的是**整个事件对象**，不是某几个字段 ⇒
      //    少一个字段、多包一层信封，都会被逮到。）
      expect(events.first, equals(expected.first));
      expect(events.last, equals(expected.last));
    });

    test('返回 {report, a2ui_events}；report 是**一句**，不是组件树', () async {
      final service = a2uiFixtureService();
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
      );
      final result =
          await registry.lookup('show_a2ui_surface')!.execute(
                <String, dynamic>{'view': 'tasks'},
              ) as Map;

      expect(result.keys, containsAll(<String>['report', 'a2ui_events']));
      expect(result['report'], isA<String>());
      expect((result['report'] as String).trim(), isNotEmpty);
      // ⚠️ **走真的 l10n** —— 强制英文 ⇒ 「硬编码中文」在**任何**机器上都红。
      expect(result['report'], AppLocalizationsEn().a2uiSurfaceReportTasks);
      // ⚠️ **模型不该看到整棵组件树** —— 那会让模型上下文被一堆 JSON 淹了。
      expect(result['report'], isNot(contains('surfaceUpdate')));
      expect(result['report'], isNot(contains('写周报')));
    });

    test('默认走**当前语言**（设备语言就是界面语言）', () async {
      final service = a2uiFixtureService();
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
      );
      final result =
          await registry.lookup('show_a2ui_surface')!.execute(
                <String, dynamic>{'view': 'tasks'},
              ) as Map;

      expect(result['report'], currentL10n().a2uiSurfaceReportTasks);
    });

    test('中文界面 ⇒ 那句话就是中文（不是硬编码，也不是英文）', () async {
      final service = a2uiFixtureService();
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
        l10nProvider: () => AppLocalizationsZh(),
      );
      final result =
          await registry.lookup('show_a2ui_surface')!.execute(
                <String, dynamic>{'view': 'tasks'},
              ) as Map;

      expect(result['report'], AppLocalizationsZh().a2uiSurfaceReportTasks);
      expect(result['report'], isNot(AppLocalizationsEn().a2uiSurfaceReportTasks));
    });

    test('认不出的 view ⇒ 当 tasks（宁可画错一块看板，也不要让这一轮失败）', () async {
      String? seen;
      final registry = registryWith(
        fetchSurfaceEvents: (view) async {
          seen = view;
          return const <Map<String, Object?>>[];
        },
      );

      await registry
          .lookup('show_a2ui_surface')!
          .execute(<String, dynamic>{'view': 'whatever'});

      expect(seen, 'tasks');
    });

    test('端脑只回纯文本（没画界面）⇒ **如实说**，不假装成功', () async {
      // 把 fixture 的 data 行去掉 ⇒ 端脑这次什么都没画。
      final service = a2uiFixtureService(
        body: readA2uiSseFixture().replaceAll(RegExp(r'data: .*'), ''),
      );
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
      );
      final result =
          await registry.lookup('show_a2ui_surface')!.execute(
                <String, dynamic>{'view': 'tasks'},
              ) as Map;

      expect(result['a2ui_events'], isEmpty);
      expect(
        result['report'],
        AppLocalizationsEn().a2uiSurfaceReportNoSurface,
      );
    });

    test('端脑只回**纯文本**（有事件，但**没画界面**）⇒ 如实说 + 把它的话带上', () async {
      // ⚠️ **有事件 ≠ 画出来了** —— 端脑只回纯文本时**也有事件**
      // （那条事件里没有 `beginRendering` ⇒ 没有根组件 ⇒ 画不出东西）。
      final service = a2uiFixtureService(body: _textOnlySse());
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
        l10nProvider: () => AppLocalizationsEn(),
      );
      final result =
          await registry.lookup('show_a2ui_surface')!.execute(
                <String, dynamic>{'view': 'tasks'},
              ) as Map;

      // 端脑**确实**回了一条事件（不是空响应）⇒ ⇒ 判据不能是「有没有事件」。
      expect((result['a2ui_events'] as List), hasLength(1));
      // ⚠️ **如实说没画界面**，并把**它自己的话**带给模型。
      expect(
        result['report'],
        AppLocalizationsEn().a2uiSurfaceReportNoSurfaceSaid('这里能看什么'),
      );
      expect(result['report'], contains('这里能看什么'));
    });
  });

  group('给模型看的那一份（pickReportPayload）', () {
    test('有 report ⇒ **只把 report 交出去**（组件树不进模型上下文）', () {
      final payload = pickReportPayload(<String, Object?>{
        'report': '已展开「任务看板」。',
        'a2ui_events': [
          <String, Object?>{'a': 1},
        ],
      });

      expect(payload, <String, Object?>{'report': '已展开「任务看板」。'});
    });

    test('没有 report ⇒ 原样回传（不把别人的结果改形状）', () {
      expect(
        pickReportPayload(<String, Object?>{'applied': 'accent'}),
        <String, Object?>{'applied': 'accent'},
      );
      expect(pickReportPayload('plain'), 'plain');
    });

    test('report 是空串 ⇒ 原样回传（空句不算摘要）', () {
      expect(
        pickReportPayload(<String, Object?>{'report': '  '}),
        <String, Object?>{'report': '  '},
      );
    });
  });

  group('界面那一半（surface id）', () {
    test('只有 beginRendering 才算数 ⇒ 画得出才进列表', () async {
      final service = a2uiFixtureService();
      addTearDown(service.dispose);

      final registry = registryWith(
        fetchSurfaceEvents: service.fetchSurfaceEvents,
      );
      final result =
          await registry.lookup('show_a2ui_surface')!.execute(
                <String, dynamic>{'view': 'tasks'},
              ) as Map;

      expect(
        a2uiSurfaceIdsFromToolResult(result),
        <String>['shadow.tasks'],
      );
    });

    test('只有 surfaceUpdate 没有 beginRendering ⇒ **不画半成品**', () {
      // 只留第一条（surfaceUpdate，没有 beginRendering）。
      final partial = <Map<String, Object?>>[a2uiFixtureEvents().first];

      expect(a2uiSurfaceIdsFromToolResult(<String, Object?>{
        'a2ui_events': partial,
      }), isEmpty);
    });
  });
}
