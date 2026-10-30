import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 端脑任务（temporal lobe `TaskStore`）的客户端契约。
///
/// 这里的形状是 `telencephalon::lobes::task_store::Task` 的线上形状：
/// - `status` / `priority` 是 serde 的**变体名**（PascalCase）；
/// - 时间字段是 snake_case；
/// - 写操作要带 `X-Admin-Token`。
void main() {
  /// 造一个 JSON 响应。
  ///
  /// ⚠️ **必须带 `content-type: application/json`**：不带的话
  /// `package:http` 的 `Response` 按 **latin1** 编码响应体，中文会被
  /// `AsciiCodec` 直接拒掉。
  http.Response jsonResponse(Object body) => http.Response(
        jsonEncode(body),
        200,
        headers: const {'content-type': 'application/json; charset=utf-8'},
      );

  Map<String, dynamic> task({
    String id = 'task-1',
    String status = 'Pending',
    String priority = 'Medium',
  }) {
    return {
      'id': id,
      'title': '和客户开会',
      'description': '讨论项目进度',
      'status': status,
      'priority': priority,
      'due_time': '2026-10-31T09:00:00Z',
      'reminder': null,
      'tags': ['会议'],
      'created_at': '2026-10-30T00:00:00Z',
      'updated_at': '2026-10-30T01:00:00Z',
      'confirmed': false,
      'confirmation_points': ['确认时间'],
    };
  }

  group('TelencephalonClient 任务 API', () {
    test('listTasks() 读 /api/telencephalon/tasks 并解析 PascalCase 状态', () async {
      final paths = <String>[];
      final mock = http_testing.MockClient((request) async {
        paths.add('${request.method} ${request.url.path}');
        if (request.url.path == '/api/telencephalon/tasks') {
          return jsonResponse([task(status: 'InProgress', priority: 'High')]);
        }
        return http.Response('Not Found', 404);
      });
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:41235',
        client: mock,
      );

      final tasks = await client.listTasks();

      expect(paths, contains('GET /api/telencephalon/tasks'));
      expect(tasks, hasLength(1));
      expect(tasks.single.id, 'task-1');
      expect(tasks.single.title, '和客户开会');
      // ⚠️ 线上就是 PascalCase —— 客户端不能把它当成小写。
      expect(tasks.single.status, 'InProgress');
      expect(tasks.single.priority, 'High');
      expect(tasks.single.dueTime, isNotNull);
      expect(tasks.single.tags, ['会议']);
      expect(tasks.single.confirmed, isFalse);
      expect(tasks.single.confirmationPoints, ['确认时间']);
    });

    test('createTask() POST 标题 / 优先级 / 截止时间', () async {
      Map<String, dynamic>? sent;
      final mock = http_testing.MockClient((request) async {
        if (request.method == 'POST' &&
            request.url.path == '/api/telencephalon/tasks') {
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return jsonResponse(task());
        }
        return http.Response('Not Found', 404);
      });
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:41235',
        client: mock,
      );

      await client.createTask(
        title: '和客户开会',
        description: '讨论项目进度',
        priority: 'high',
        dueTime: '2026-10-31T09:00:00Z',
        tags: ['会议'],
      );

      expect(sent, isNotNull);
      expect(sent!['title'], '和客户开会');
      expect(sent!['description'], '讨论项目进度');
      expect(sent!['priority'], 'high');
      expect(sent!['due_time'], '2026-10-31T09:00:00Z');
      expect(sent!['tags'], ['会议']);
    });

    test('updateTaskStatus() 发的是 serde 变体名', () async {
      Map<String, dynamic>? sent;
      String? path;
      final mock = http_testing.MockClient((request) async {
        if (request.method == 'POST') {
          path = request.url.path;
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return jsonResponse(task(status: 'Completed'));
        }
        return http.Response('Not Found', 404);
      });
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:41235',
        client: mock,
      );

      await client.updateTaskStatus('task-1', TelencephalonTaskStatus.completed);

      expect(path, '/api/telencephalon/tasks/task-1/status');
      expect(sent!['status'], 'Completed');
    });

    test('confirmTask() 带 modifications 时把标题 / 优先级一起改', () async {
      Map<String, dynamic>? sent;
      String? path;
      final mock = http_testing.MockClient((request) async {
        if (request.method == 'POST') {
          path = request.url.path;
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return jsonResponse(task());
        }
        return http.Response('Not Found', 404);
      });
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:41235',
        client: mock,
      );

      await client.confirmTask(
        'task-1',
        confirmed: true,
        title: '改过的标题',
        priority: 'urgent',
      );

      expect(path, '/api/telencephalon/tasks/task-1/confirm');
      expect(sent!['task_id'], 'task-1');
      expect(sent!['confirmed'], true);
      final mods = sent!['modifications'] as Map<String, dynamic>;
      expect(mods['title'], '改过的标题');
      expect(mods['priority'], 'urgent');
    });

    test('deleteTask() DELETE 任务并接受 204', () async {
      String? method;
      String? path;
      final mock = http_testing.MockClient((request) async {
        method = request.method;
        path = request.url.path;
        return http.Response('', 204);
      });
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:41235',
        client: mock,
      );

      await client.deleteTask('task-1');

      expect(method, 'DELETE');
      expect(path, '/api/telencephalon/tasks/task-1');
    });

    test('端脑读不到时抛的是 TelencephalonException', () async {
      final mock = http_testing.MockClient((request) async {
        return http.Response('boom', 500);
      });
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:41235',
        client: mock,
      );

      expect(
        () => client.listTasks(),
        throwsA(isA<TelencephalonException>()),
      );
    });
  });
}
