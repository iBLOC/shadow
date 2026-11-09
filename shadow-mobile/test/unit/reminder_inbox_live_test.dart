import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shadow_mobile/services/reminder_inbox.dart';

/// 真运行级读数 —— 移动端提醒收件箱 ↔ **真端脑**（不是 mock）。
///
/// ## ⚠️ 为什么要有这一份
///
/// 提醒链路：调度器（端脑）→ 通知收件箱（端脑）→ HTTP 通知面（端脑）→
/// **客户端轮询 → 送到用户眼前 → 确认**。
/// ⇒ ⇒ 前三段端脑侧有判据（`telencephalon/tests/task_reminder_reaches_the_client.rs`
/// 钉的是真 HTTP 面）⇒ ⇒ 第四段在移动端这边**只有 mock**
/// （`test/unit/reminder_inbox_test.dart` 用的是 `MockClient`）⇒ ⇒
/// ⇒ ⇒ **端脑真序列化出来的形状**与**移动端解析的形状**对不对得上，从来没人验过。
/// ⇒ ⇒ 而 mock 把 `task_id`／`notification_type`／`due_time` 手写成
/// 「端脑应该给的样子」⇒ ⇒ 端脑哪天改字段名，mock **照样全绿**
/// ⇒ ⇒ 而真客户端会读到空串 ⇒ ⇒ 提醒**送不出去**（标题空白、类型认不出）
/// ⇒ ⇒ ⇒ 失败长得像成功（轮询成功、ack 成功、提醒就是没内容）。
///
/// ## 怎么跑（真端脑 ⇒ 真请求）
///
/// ```powershell
/// # 1. 起一个真端脑（独立形态：间脑+端脑+海马体+neuron 一个进程）
/// $env:TELENCEPHALON_ADMIN_KEY = 'live-admin-token'
/// $env:TELENCEPHALON_SHADOW_KEY = 'live-shadow-key'
/// C:/Projects/iBLOC/encephalon/target/debug/encephalon-server.exe --port 60190 --bind 127.0.0.1
///
/// # 2. 跑这一份
/// $env:SHADOW_LIVE_ENDBRAIN = '1'
/// $env:SHADOW_LIVE_ADMIN_TOKEN = 'live-admin-token'
/// $env:SHADOW_LIVE_SHADOW_KEY = 'live-shadow-key'
/// $env:SHADOW_LIVE_ENDBRAIN_URL = 'http://127.0.0.1:60190'
/// flutter test test/unit/reminder_inbox_live_test.dart
/// ```
///
/// ⚠️ **它默认是跳过的**（`SHADOW_LIVE_ENDBRAIN` 不等于 `1` 就整份跳过）⇒ ⇒
/// CI 里没有端脑也不会红 ⇒ ⇒ 但它也**不假装绿**（跳过就是跳过，不是通过）。
/// ⚠️ **但它不是「永远不跑」** —— 夜间的 `desktop-e2e` workflow 里有一份
/// **真端脑**（回环）⇒ ⇒ 那里它**真跑**；而且那边「被跳过」判**红**
/// ⇒ ⇒ 端脑的线上形状漂移了不会没人知道。
void main() {
  final live = Platform.environment['SHADOW_LIVE_ENDBRAIN'] == '1';
  final adminToken = Platform.environment['SHADOW_LIVE_ADMIN_TOKEN'] ?? '';
  final shadowKey = Platform.environment['SHADOW_LIVE_SHADOW_KEY'] ?? '';
  final baseUrl =
      Platform.environment['SHADOW_LIVE_ENDBRAIN_URL'] ?? 'http://127.0.0.1:60080';

  /// 在端脑那边**造一条会响的提醒** —— 判据不许依赖「别的判据留下的状态」。
  ///
  /// ⚠️ **为什么必须自己造**（2026-11-09 真机实测）：这份判据第一次跑时**两条红**
  /// ⇒ ⇒ 原因是桌面端那份判据**先跑完并 ack 掉了那条提醒** ⇒ ⇒ 端脑待办空了
  /// ⇒ ⇒ 移动端这条「前提：端脑那边确实有待确认的提醒」就不成立
  /// ⇒ ⇒ ⇒ **判据之间的顺序耦合**（谁先跑谁说了算）⇒ ⇒ 这样的判据是运气。
  Future<void> plantReminder() async {
    final due = DateTime.now().toUtc().add(const Duration(minutes: 5)).toIso8601String();
    final resp = await http.post(
      Uri.parse('$baseUrl/api/telencephalon/tasks'),
      headers: {
        'Content-Type': 'application/json',
        if (adminToken.isNotEmpty) 'X-Admin-Token': adminToken,
        if (shadowKey.isNotEmpty) 'X-Shadow-Key': shadowKey,
      },
      body: jsonEncode({
        'title': '移动端真跑级探针',
        'due_time': due,
        'priority': 'high',
      }),
    );
    expect(resp.statusCode, 200, reason: '造一条提醒任务失败：${resp.body}');
    // ⚠️ 调度器**默认 60 秒**一个周期（首个 tick 延后一个周期）⇒ ⇒ 得等。
    for (var i = 0; i < 90; i++) {
      await Future<void>.delayed(const Duration(seconds: 1));
      final inbox = ReminderInbox(
        baseUrl: () => baseUrl,
        shadowKey: () => shadowKey,
        adminToken: () => adminToken,
        deliver: (n) async => false,
      );
      if ((await inbox.fetchPending()).isNotEmpty) return;
    }
    fail('端脑那边 90 秒内没有响起提醒（调度器周期默认 60 秒）');
  }

  group('ReminderInbox —— 真端脑', () {
    test('负控：两把钥匙都没有 ⇒ 读门不放行（不是 200 + 空数组）', () async {
      var delivered = 0;
      final inbox = ReminderInbox(
        baseUrl: () => baseUrl,
        shadowKey: () => '',
        adminToken: () => null,
        deliver: (n) async {
          delivered++;
          return true;
        },
      );
      await inbox.pollOnce();
      expect(
        delivered,
        isZero,
        reason: '拿不到凭据 ⇒ ⇒ 端脑必须 401 ⇒ ⇒ 一条都不许送到用户眼前',
      );
    }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

    test('只带影子锁 ⇒ 读得到（读门 = 影子锁 ∪ admin token）', () async {
      final inbox = ReminderInbox(
        baseUrl: () => baseUrl,
        shadowKey: () => shadowKey,
        adminToken: () => null,
        deliver: (n) async => false, // 不送 ⇒ 不 ack ⇒ 待办里留着
      );
      final pending = await inbox.fetchPending();
      expect(pending, isA<List<ReminderNotification>>());
    }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

    test('真端脑给的形状 ⇒ 移动端解析出的每个字段都有值（形状钉住）', () async {
      final inbox = ReminderInbox(
        baseUrl: () => baseUrl,
        shadowKey: () => shadowKey,
        adminToken: () => adminToken,
        deliver: (n) async => false,
      );
      await plantReminder();
      final pending = await inbox.fetchPending();
      expect(pending, isNotEmpty, reason: '真端脑那边应当至少有一条待确认的提醒');

      final n = pending.first;
      expect(n.id, isNotEmpty, reason: '通知自己的编号（ack 要用它）');
      expect(n.taskId, isNotEmpty, reason: '任务号 —— 端脑分配的事实');
      expect(n.taskTitle, isNotEmpty, reason: '任务标题');
      expect(
        ['Reminder', 'Overdue', 'NeedsConfirmation'],
        contains(n.type),
        reason: '通知类型必须是端脑的枚举字面量（客户端按它分支）',
      );
      expect(n.message, isNotEmpty, reason: '提醒正文（客户端直接把它显示给用户）');
    }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

    test('真 ack ⇒ 端脑待办里真的少了它（送出去了才确认）', () async {
      await plantReminder();
      final seen = <ReminderNotification>[];
      final inbox = ReminderInbox(
        baseUrl: () => baseUrl,
        shadowKey: () => shadowKey,
        adminToken: () => adminToken,
        deliver: (n) async {
          seen.add(n);
          return true; // 真的送到用户眼前了 ⇒ ⇒ 可以确认
        },
      );
      await inbox.pollOnce();
      expect(seen, isNotEmpty, reason: '端脑那边确实有待确认的提醒');

      final after = await inbox.fetchPending();
      expect(
        after.where((x) => x.id == seen.first.id),
        isEmpty,
        reason: '确认过的提醒不该还在待办里',
      );
    }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');
  });
}
