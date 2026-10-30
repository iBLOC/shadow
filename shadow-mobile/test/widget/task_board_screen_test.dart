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
      'confirmed': true,
      'confirmation_points': ['把会开完'],
    };
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
          // Pending ⇒ 落在第一列（待规划），看板上能直接看到。
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
}
