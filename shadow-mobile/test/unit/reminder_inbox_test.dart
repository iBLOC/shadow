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
      // ⚠️ **要看得见「发了哪些请求」** —— 以前这条用例**一条断言都没有**
      //   ⇒ ⇒ 「不 ack」这个主张**没有任何东西在核**
      //   ⇒ ⇒ 用例名说了两件事，体里一件都没验。
      final requests = <String>[];
      final client = MockClient((request) async {
        requests.add('${request.method} ${request.url.path}');
        return http.Response('nope', 500);
      });
      final inbox = ReminderInbox(
        baseUrl: () => 'http://127.0.0.1:60080',
        shadowKey: () => null,
        adminToken: () => null,
        deliver: (n) async => true,
        httpClient: client,
      );

      // ⚠️ 「不抛」这件事**显式**断言 —— 以前它是「用例没红」这种隐含事实。
      await expectLater(inbox.pollOnce(), completes);

      // ⚠️ **端脑没回待办 ⇒ ⇒ 不许发 ack** —— 发了就是
      //   「确认掉一条用户根本没看到的提醒」⇒ ⇒ 提醒静悄悄消失。
      expect(
        requests.where((r) => r.contains('/ack')).toList(),
        isEmpty,
        reason: '端脑没回待办 ⇒ ⇒ 不许 ack（实际发了：$requests）',
      );
      // ⚠️ 而且**待办那条**确实问过了 —— 否则这条用例又变成「什么都没做」。
      expect(
        requests.where((r) => r.startsWith('GET ')).toList(),
        isNotEmpty,
        reason: '压根没去问端脑 ⇒ ⇒ 这一轮没验到任何东西',
      );
    });
  });
}
