import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/reminder_inbox.dart';

Map<String, dynamic> reminderJson(String id) => <String, dynamic>{
  'id': id,
  'task_id': 'task-$id',
  'task_title': '和客户开会',
  'notification_type': 'Reminder',
  'message': '⏰ 任务即将到期: 和客户开会',
  'timestamp': '2026-11-09T00:00:00Z',
  'due_time': null,
};

/// 一个**带 UTF-8 content-type** 的 JSON 响应。
///
/// ⚠️ 为什么不用 `http.Response(json, 200)`：它默认按 **latin1** 编码 body
/// ⇒ ⇒ 正文里的中文会**直接抛异常**（`Invalid argument (string)`）。
http.Response jsonResponse(Object body) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  group('ReminderInbox', () {
    test('delivers a pending reminder and acks it afterwards', () async {
      final acked = <List<dynamic>>[];
      final client = MockClient((request) async {
        if (request.method == 'GET') {
          return jsonResponse([reminderJson('1')]);
        }
        // ⚠️ `as List<String>` 会**抛**（jsonDecode 给的是 List<dynamic>）
        // ⇒ ⇒ 那次抛错会被生产代码的 catch 吞掉 ⇒ ⇒ 断言看起来像「没 ack」，
        // 其实是我的 mock 自己坏了。
        acked.add(
          (jsonDecode(request.body) as Map<String, dynamic>)['ids'] as List<dynamic>,
        );
        return jsonResponse({'acked': 1, 'pending': 0});
      });
      final delivered = <String>[];

      final inbox = ReminderInbox(
        baseUrl: () => 'http://127.0.0.1:60080',
        shadowKey: () => 'shadow-key',
        adminToken: () => 'admin-token',
        deliver: (n) async {
          delivered.add(n.id);
          return true;
        },
        httpClient: client,
      );

      await inbox.pollOnce();

      expect(delivered, ['1']);
      expect(acked, [['1']]);
    });

    test('does NOT ack a reminder that was not delivered', () async {
      // ⚠️ 核心纪律：送不出去 ⇒ ⇒ 不确认 ⇒ ⇒ 提醒留在待办里。
      final acked = <List<dynamic>>[];
      final client = MockClient((request) async {
        if (request.method == 'GET') {
          return jsonResponse([reminderJson('1')]);
        }
        // ⚠️ `as List<String>` 会**抛**（jsonDecode 给的是 List<dynamic>）
        // ⇒ ⇒ 那次抛错会被生产代码的 catch 吞掉 ⇒ ⇒ 断言看起来像「没 ack」，
        // 其实是我的 mock 自己坏了。
        acked.add(
          (jsonDecode(request.body) as Map<String, dynamic>)['ids'] as List<dynamic>,
        );
        return http.Response('{"acked":1,"pending":0}', 200);
      });

      final inbox = ReminderInbox(
        baseUrl: () => 'http://127.0.0.1:60080',
        shadowKey: () => 'shadow-key',
        adminToken: () => 'admin-token',
        deliver: (n) async => false,
        httpClient: client,
      );

      await inbox.pollOnce();

      expect(acked, isEmpty);
    });

    test('carries both door keys, and no empty header', () async {
      Map<String, String>? seen;
      final client = MockClient((request) async {
        seen = request.headers;
        return http.Response('[]', 200);
      });

      final inbox = ReminderInbox(
        baseUrl: () => 'http://127.0.0.1:60080',
        shadowKey: () => '  ',
        adminToken: () => 'admin-token',
        deliver: (n) async => true,
        httpClient: client,
      );

      await inbox.pollOnce();

      expect(seen?['X-Shadow-Key'], isNull, reason: '空白影子锁不许当成一把钥匙');
      expect(seen?['X-Admin-Token'], 'admin-token');
    });

    test('a failing poll does not throw and does not ack', () async {
      final client = MockClient((request) async => http.Response('nope', 500));
      final inbox = ReminderInbox(
        baseUrl: () => 'http://127.0.0.1:60080',
        shadowKey: () => null,
        adminToken: () => null,
        deliver: (n) async => true,
        httpClient: client,
      );

      await inbox.pollOnce();
    });
  });
}
