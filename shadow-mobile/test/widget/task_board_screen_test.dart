import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/task_board_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/widgets/task_edit_dialog.dart';
import 'test_helper.dart';

void main() {
  testSetup();

  /// 造一个 JSON 响应。
  ///
  /// ⚠️ **必须带 `content-type: application/json`**：不带的话
  /// `package:http` 的 `Response` 会按 **latin1** 编码响应体（RFC 2616
  /// 的老规矩），中文标题会被 `AsciiCodec` 直接拒掉
  /// （`Invalid argument (string): Contains invalid characters.`）。
  /// 真实服务端回的就是 `application/json; charset=utf-8`。
  http.Response jsonResponse(Object body) => http.Response(
        jsonEncode(body),
        200,
        headers: const {'content-type': 'application/json; charset=utf-8'},
      );

  /// 端脑（temporal lobe）返回的一条任务。
  ///
  /// ⚠️ `status` / `priority` 是 serde 的**变体名**（PascalCase）——
  /// 线上就是这么发的，客户端得认。
  Map<String, dynamic> telencephalonTask({
    String id = 'task-1',
    String title = '端脑里的任务',
    String status = 'InProgress',
    String priority = 'High',
    bool confirmed = true,
  }) {
    return {
      'id': id,
      'title': title,
      'description': '来自端脑的描述',
      'status': status,
      'priority': priority,
      'due_time': '2026-10-31T09:00:00Z',
      'reminder': null,
      'tags': ['会议'],
      'created_at': '2026-10-30T00:00:00Z',
      'updated_at': '2026-10-30T01:00:00Z',
      'confirmed': confirmed,
      'confirmation_points': ['把会开完'],
    };
  }

  /// 用给定 mock 起一块看板，返回 provider 容器（读 state 用）。
  /// [locale] 缺省 en；中文化用例传 Locale('zh')。
  Future<ProviderContainer> pumpBoardWith(
    WidgetTester tester,
    http_testing.MockClient mock, {
    Locale locale = const Locale('en'),
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          telencephalonProvider.overrideWith(
            (ref) => TelencephalonNotifier(
              client: TelencephalonClient(
                baseUrl: 'http://127.0.0.1:41235',
                client: mock,
              ),
            ),
          ),
        ],
        child: MaterialApp(
          // ⚠️ 用复数版 delegates（Material＋Cupertino＋Widgets 三件自动齐）
          // —— zh 面上缺 Cupertino 本地化会直接抛 Widgets 异常（en 走
          // DefaultCupertinoLocalizations 不炸，zh 一炸）。
          // ⚠️ 生成的 AppLocalizations.delegate 必须自己带上 —— 复数版里
          // 没有 it；挤掉它 AppLocalizations.of(context) 就是 null，
          // 看板整页炸（en 也一样炸）。
          localizationsDelegates: const [
            AppLocalizations.delegate,
            ...GlobalMaterialLocalizations.delegates,
          ],
          supportedLocales: const [Locale('en'), Locale('zh')],
          locale: locale,
          home: const TaskBoardScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return ProviderScope.containerOf(
      tester.element(find.byType(TaskBoardScreen)),
    );
  }

  /// 按住 [cardTitle] 卡片 600ms（>500ms 长按阈值）起拖，
  /// 拖到 [columnTitle] 列表头上松手。
  Future<void> longPressDragTo(
    WidgetTester tester,
    String cardTitle,
    String columnTitle,
  ) async {
    // 先取坐标再起手势 —— 拖起之后卡片与浮卡同名，find 会撞车。
    final start = tester.getCenter(find.text(cardTitle));
    final target = tester.getCenter(find.text(columnTitle));
    final gesture = await tester.startGesture(start);
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveBy(target - start);
    await tester.pump();
    await gesture.moveBy(const Offset(1, 1));
    await tester.pump();
    await gesture.up();
    await tester.pump();
  }

  group('TaskBoardScreen Widget Tests', () {
    testWidgets('renders task board screen with app bar', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('shows kanban columns', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );

      expect(find.byIcon(Icons.add), findsWidgets);
    });

    testWidgets('shows add task button in column', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );

      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('can tap add button in kanban column', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );

      final addIcons = find.byIcon(Icons.add);
      expect(addIcons, findsWidgets);

      await tester.tap(addIcons.first);
      await tester.pumpAndSettle();

      // 标题 + 截止时间两个输入框。
      expect(find.byType(TextField), findsNWidgets(2));
    });
  });

  /// 任务看板的数据源必须是**端脑**。
  ///
  /// ⚠️ 这是一条**回归测试**：以前这里走的是前额叶方言的
  /// `/hippocampus/api/tasks`，而 `PrefrontalClient` 的 baseUrl 恒为
  /// `http://localhost:60080`（桌面 sidecar 的端口，手机上没人监听），
  /// 移动端又不编本地海马体 ⇒ 真机上「任务获取失败」。
  group('TaskBoardScreen 数据源', () {
    testWidgets('从端脑读任务，不碰前额叶方言', (WidgetTester tester) async {
      final requested = <String>[];
      final mock = http_testing.MockClient((request) async {
        requested.add('${request.method} ${request.url.path}');
        if (request.url.path == '/api/telencephalon/tasks') {
          // Pending ＋ 已确认 ⇒ 落在「待办」列，看板上能直接看到。
          return jsonResponse([telencephalonTask(status: 'Pending')]);
        }
        return http.Response('Not Found', 404);
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            telencephalonProvider.overrideWith(
              (ref) => TelencephalonNotifier(
                client: TelencephalonClient(
                  baseUrl: 'http://127.0.0.1:41235',
                  client: mock,
                ),
              ),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        requested,
        contains('GET /api/telencephalon/tasks'),
        reason: '任务看板必须走端脑方言 —— 嵌入式大脑的端脑面只有这一条任务路由',
      );
      expect(
        requested.where((r) => r.contains('/hippocampus/')),
        isEmpty,
        reason: '移动端不编本地海马体，前额叶方言的 /hippocampus/api/* 一条路由都没有',
      );

      // 端脑返回的任务真的渲染出来了。
      expect(find.text('端脑里的任务'), findsOneWidget);
    });

    testWidgets('端脑任务落到「进行中」列（InProgress → in-progress）', (
      WidgetTester tester,
    ) async {
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks') {
          return jsonResponse([telencephalonTask(status: 'InProgress')]);
        }
        return http.Response('Not Found', 404);
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            telencephalonProvider.overrideWith(
              (ref) => TelencephalonNotifier(
                client: TelencephalonClient(
                  baseUrl: 'http://127.0.0.1:41235',
                  client: mock,
                ),
              ),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final state = ProviderScope.containerOf(
        tester.element(find.byType(TaskBoardScreen)),
      )
          .read(tasksNotifierProvider);

      expect(state.tasks.length, 1);
      expect(state.tasks.single.status, TaskBoardColumn.inProgress);
      expect(state.tasks.single.priority, 'high');
      expect(state.tasks.single.confirmed, isTrue);
      expect(state.tasks.single.dueTime, isNotNull);
    });

    testWidgets('端脑读不到时给出可见的错误提示', (WidgetTester tester) async {
      final mock = http_testing.MockClient((request) async {
        return http.Response('boom', 500);
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            telencephalonProvider.overrideWith(
              (ref) => TelencephalonNotifier(
                client: TelencephalonClient(
                  baseUrl: 'http://127.0.0.1:41235',
                  client: mock,
                ),
              ),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const TaskBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 错误横幅 —— 用户得看得到「取不到」，而不是对着空看板发呆。
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });
  });

  /// 长按拖拽改状态（2026-11-11 新增）。
  ///
  /// 手势模拟：按住卡片超过 kLongPressTimeout（500ms）⇒ LongPressDraggable
  /// 接管 ⇒ 移动到目标列 ⇒ 松手 ⇒ DragTarget.onAcceptWithDetails。
  /// 列宽 280 ＋ 边距 16 ⇒ 步进 312：Backlog [16,296]／To do [312,592]／
  /// In progress [608,888]（默认 800x600 测试视口里第 3 列中心 748 仍在屏内）
  /// ⇒ 从第一列拖到第三列已经跨过中间的「To do」，是完整的一条拖拽链路。
  group('TaskBoardScreen 长按拖拽改状态', () {
    testWidgets('从「To do」拖到「In progress」⇒ 发端脑 update，卡片落进目标列', (
      WidgetTester tester,
    ) async {
      final posts = <http.Request>[];
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks' &&
            request.method == 'GET') {
          return jsonResponse([telencephalonTask(status: 'Pending')]);
        }
        if (request.method == 'POST' &&
            request.url.path.endsWith('/update')) {
          posts.add(request);
          return jsonResponse(telencephalonTask(status: 'Completed'));
        }
        return http.Response('Not Found', 404);
      });

      final container = await pumpBoardWith(tester, mock);
      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.todo,
      );

      // ⚠️ 目标列必须在 800x600 测试视口**内**：第 4 列「Done」中心 x≈1044
      // 在屏外 ⇒ 松手落在没有 DragTarget 的地方 ⇒ 拖拽被静默取消。
      // 「In progress」（第 3 列，中心 x≈748）是屏内最远的一条完整链路。
      await longPressDragTo(tester, '端脑里的任务', 'In progress');
      await tester.pumpAndSettle();

      expect(posts, hasLength(1), reason: '落到别的列 ⇒ 必须恰好发一次 update');
      expect(posts.single.url.path, '/api/telencephalon/tasks/task-1/update');
      final body = jsonDecode(posts.single.body) as Map<String, dynamic>;
      expect(
        body['status'],
        'InProgress',
        reason: '请求体状态 ＝ 落列的映射（In progress ⇒ InProgress，serde 变体名），'
            '发小写会被端脑 400',
      );
      expect(
        body.containsKey('title'),
        isFalse,
        reason: '只改状态 ⇒ 请求体不许夹带别的字段（端脑「先全解析、后动库」）',
      );
      expect(body.containsKey('priority'), isFalse);

      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.done,
        reason: '拖完之后卡片要真的落在目标列 —— 不是请求发了、界面不动',
      );
    });

    testWidgets('拖起又放回原列 ⇒ 不发请求，状态不动', (WidgetTester tester) async {
      var updateCalls = 0;
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks' &&
            request.method == 'GET') {
          return jsonResponse([telencephalonTask(status: 'InProgress')]);
        }
        if (request.method == 'POST') {
          updateCalls += 1;
          return jsonResponse(telencephalonTask(status: 'InProgress'));
        }
        return http.Response('Not Found', 404);
      });

      final container = await pumpBoardWith(tester, mock);
      await longPressDragTo(tester, '端脑里的任务', 'In progress');
      await tester.pumpAndSettle();

      expect(
        updateCalls,
        0,
        reason: '原列放下 ＝ 状态没变 ⇒ 不许发请求（发了也是空改）',
      );
      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.inProgress,
      );
      expect(find.byIcon(Icons.error_outline), findsNothing);
    });

    testWidgets('拖过去但端脑拒绝 ⇒ 卡片留在原列，失败看得见', (
      WidgetTester tester,
    ) async {
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks' &&
            request.method == 'GET') {
          return jsonResponse([telencephalonTask(status: 'Pending')]);
        }
        if (request.method == 'POST') {
          return http.Response('boom', 500);
        }
        return http.Response('Not Found', 404);
      });

      final container = await pumpBoardWith(tester, mock);
      await longPressDragTo(tester, '端脑里的任务', 'In progress');
      await tester.pumpAndSettle();

      expect(container.read(tasksNotifierProvider).error, isNotNull);
      expect(
        find.byIcon(Icons.error_outline),
        findsOneWidget,
        reason: '失败必须可见 —— 不能「拖过去了、界面装作成功」',
      );
      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.todo,
        reason: '端脑真值没变 ⇒ 卡片必须留在原列',
      );

      // SnackBar 的自动关闭定时器还挂着 ⇒ 不排掉会以「Timer still pending」收场。
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    });

    testWidgets('Pending ＋ 已确认 ⇒ 落「To do」列（拖拽语义的承载列）', (
      WidgetTester tester,
    ) async {
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks') {
          return jsonResponse([telencephalonTask(status: 'Pending')]);
        }
        return http.Response('Not Found', 404);
      });

      final container = await pumpBoardWith(tester, mock);

      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.todo,
        reason: 'fixture 默认 confirmed:true ⇒ 已确认的 Pending 进「待办」，'
            '否则「待办」列永远是空的，拖进去的任务会被弹回「待规划」',
      );
    });

    testWidgets('Pending ＋ 未确认 ⇒ 留「Backlog」列', (WidgetTester tester) async {
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks') {
          return jsonResponse([
            telencephalonTask(status: 'Pending', confirmed: false),
          ]);
        }
        return http.Response('Not Found', 404);
      });

      final container = await pumpBoardWith(tester, mock);

      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.backlog,
        reason: '没确认过的任务端脑不会调度 ⇒ 它还是「待规划」的事',
      );
    });

    testWidgets('未确认的任务拖进「To do」⇒ 发 Pending，卡片落回「Backlog」', (
      WidgetTester tester,
    ) async {
      final posts = <http.Request>[];
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks' &&
            request.method == 'GET') {
          return jsonResponse([
            telencephalonTask(status: 'Pending', confirmed: false),
          ]);
        }
        if (request.method == 'POST' &&
            request.url.path.endsWith('/update')) {
          posts.add(request);
          return jsonResponse(
            telencephalonTask(status: 'Pending', confirmed: false),
          );
        }
        return http.Response('Not Found', 404);
      });

      final container = await pumpBoardWith(tester, mock);
      await longPressDragTo(tester, '端脑里的任务', 'To do');
      await tester.pumpAndSettle();

      final body = jsonDecode(posts.single.body) as Map<String, dynamic>;
      expect(
        body['status'],
        'Pending',
        reason: '「To do」没有独立的服务端状态 ⇒ 映射回 Pending（本来就是这个映射）',
      );
      expect(
        container.read(tasksNotifierProvider).tasks.single.status,
        TaskBoardColumn.backlog,
        reason: '没确认过 ⇒ 端脑真值还是 Pending＋false ⇒ 卡片如实落回「待规划」。'
            '要让它进「待办」，去详情里点确认 —— 拖拽不代做确认',
      );
    });
  });

  /// 中文化：状态／优先级的**机器形状**（'in-progress'、'InProgress'、
  /// 'high'）不许直接上屏 —— 显示要走本地化，机器 id 只进请求体与日志页。
  group('TaskBoardScreen 中文化（不漏英文机器值）', () {
    testWidgets('zh：看板列头与卡片优先级是中文', (WidgetTester tester) async {
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks') {
          return jsonResponse([
            telencephalonTask(status: 'Pending', priority: 'High'),
          ]);
        }
        return http.Response('Not Found', 404);
      });

      await pumpBoardWith(tester, mock, locale: const Locale('zh'));
      final l10n = l10nOf(tester);

      expect(find.text(l10n.taskStatusTodo), findsOneWidget);
      expect(find.text(l10n.taskStatusBacklog), findsOneWidget);
      expect(find.text(l10n.priorityHigh), findsOneWidget);
      // 机器形状不许上屏。
      expect(find.text('high'), findsNothing);
      expect(find.text('in-progress'), findsNothing);
      expect(find.text('backlog'), findsNothing);
    });

    testWidgets('zh：详情弹窗的状态 chip／概览行是中文', (
      WidgetTester tester,
    ) async {
      final mock = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/tasks') {
          return jsonResponse([
            telencephalonTask(status: 'InProgress', priority: 'High'),
          ]);
        }
        return http.Response('Not Found', 404);
      });

      await pumpBoardWith(tester, mock, locale: const Locale('zh'));
      final l10n = l10nOf(tester);

      // 点卡片打开详情（顺带回归：拖拽上线后轻点仍是打开详情）。
      await tester.tap(find.text('端脑里的任务'));
      await tester.pumpAndSettle();

      expect(
        find.text(l10n.taskStatusInProgress),
        findsWidgets,
        reason: '状态 chip 与概览行都该显示「进行中」',
      );
      expect(find.text(l10n.priorityHigh), findsWidgets);
      expect(find.text('in-progress'), findsNothing, reason: '列 id 不许上屏');
      expect(find.text('InProgress'), findsNothing, reason: 'serde 变体名不许上屏');
      expect(find.text('high'), findsNothing);
    });

    testWidgets('zh：编辑弹窗的状态下拉框显示中文', (WidgetTester tester) async {
      // 直接泵编辑弹窗：这一格要验的是「下拉框显示什么文案」，
      // 不是「点两层弹窗能不能点到」（那条链路脆，tap 落点容易飘）。
      // 生产路径（详情弹窗 → 编辑按钮）由详情用例覆盖打开方式，
      // 这里只验下拉框自己的显示。
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              ...GlobalMaterialLocalizations.delegates,
            ],
            supportedLocales: const [Locale('en'), Locale('zh')],
            locale: const Locale('zh'),
            home: Scaffold(
              body: TaskEditDialog(
                task: TaskInfo(
                  id: 'task-1',
                  title: '端脑里的任务',
                  status: TaskBoardColumn.inProgress,
                  priority: 'high',
                  createdAt: DateTime(2026, 11, 11),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(l10nOf(tester).taskStatusInProgress),
        findsOneWidget,
        reason: '下拉框选中项要显示「进行中」，不是 InProgress',
      );
      expect(find.text('InProgress'), findsNothing);
    });

    test('serverStatusOf 同时认得 UI 列 id 与端脑 serde 变体名', () {
      // serde 变体名（编辑弹窗直接传进来）—— 只认带连字符的写法时，
      // 'InProgress'/'Overdue' 会被 default 吞成 Pending：请求 200、
      // 库里存错状态。
      expect(serverStatusOf('InProgress'), TelencephalonTaskStatus.inProgress);
      expect(serverStatusOf('Overdue'), TelencephalonTaskStatus.overdue);
      expect(serverStatusOf('Completed'), TelencephalonTaskStatus.completed);
      expect(serverStatusOf('Cancelled'), TelencephalonTaskStatus.cancelled);
      expect(serverStatusOf('Pending'), TelencephalonTaskStatus.pending);
      // UI 列 id（看板拖拽落列传的是这一族）—— 老映射不许变。
      expect(serverStatusOf('in-progress'), TelencephalonTaskStatus.inProgress);
      expect(serverStatusOf('done'), TelencephalonTaskStatus.completed);
      expect(serverStatusOf('failed'), TelencephalonTaskStatus.overdue);
      expect(serverStatusOf('cancelled'), TelencephalonTaskStatus.cancelled);
      expect(serverStatusOf('todo'), TelencephalonTaskStatus.pending);
    });
  });
}
