import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// **真运行级** —— 移动端端脑**任务面**：真客户端（移动端那份）＋ 真端脑进程 ＋ 真 HTTP。
///
/// 为什么要这一份：此前任务面的真跑读数只有**桌面端**那份客户端 ⇒ ⇒ 移动端那份客户端
/// （telencephalon_client.dart）的**请求体形状**（due_time / task_id / update / delete）
/// **从来没被真端脑验过** ⇒ ⇒ 组件级 mock 全绿也照样可能真打过去 4xx。
///
/// 怎么跑（PowerShell）：
///   1. 起一个**独立**端脑（端口别跟桌面端那个 60080 撞）：
///      C:/Projects/iBLOC/encephalon/target/debug/encephalon-server.exe --port 60180 --bind 127.0.0.1
///   2. 设环境变量后跑这一份：
///      SHADOW_LIVE_ENDBRAIN=1
///      SHADOW_LIVE_ADMIN_TOKEN=live-admin-token-20261109
///      SHADOW_LIVE_ENDBRAIN_URL=http://127.0.0.1:60180
///      SHADOW_LIVE_TASKS_FILE=C:/Projects/iBLOC/shadow/.local/live-tasks.json
///      flutter test test/unit/endbrain_task_face_live_test.dart
///
/// ⚠️ **它默认是跳过的**（SHADOW_LIVE_ENDBRAIN 不等于 1 就整份跳过）⇒ ⇒ CI 里没有端脑
/// 也不会红 ⇒ ⇒ 但它也**不假装绿**（跳过就是跳过，不是通过）。
void main() {
  final live = Platform.environment['SHADOW_LIVE_ENDBRAIN'] == '1';
  final adminToken = Platform.environment['SHADOW_LIVE_ADMIN_TOKEN'] ?? '';
  final shadowKey = Platform.environment['SHADOW_LIVE_SHADOW_KEY'] ?? '';
  final baseUrl =
      Platform.environment['SHADOW_LIVE_ENDBRAIN_URL'] ?? 'http://127.0.0.1:60080';
  final tasksFile = Platform.environment['SHADOW_LIVE_TASKS_FILE'] ?? '';

  late TelencephalonClient client;

  setUp(() {
    client = TelencephalonClient(
      baseUrl: baseUrl,
      apiKey: shadowKey.isEmpty ? null : shadowKey,
      adminToken: adminToken,
    );
  });

  /// 每条用例**自己造一条任务** ⇒ ⇒ 用例之间不互相依赖（谁先跑都一样）。
  Future<TelencephalonTask> makeTask(String label) async {
    final title = '真跑-$label-${DateTime.now().microsecondsSinceEpoch}';
    return client.createTask(title: title, priority: 'high');
  }

  test('写门负控：没有 admin token ⇒ 建任务被拒（401）', () async {
    final noKey = TelencephalonClient(
      baseUrl: baseUrl,
      apiKey: shadowKey.isEmpty ? null : shadowKey,
    );
    await expectLater(
      noKey.createTask(title: '没钥匙就不该建成'),
      throwsA(
        predicate(
          (e) => e is TelencephalonException && e.toString().contains('401'),
        ),
      ),
    );
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('建任务：线上形状钉住（id/标题/状态/优先级）', () async {
    final task = await makeTask('形状');
    expect(task.id, isNotEmpty, reason: '端脑没给任务号');
    expect(task.title, startsWith('真跑-形状-'));
    expect(task.status, 'Pending');
    expect(task.priority, 'High', reason: '优先级是 serde 变体名（PascalCase）');
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('截止时间：发出去的 due_time 真被端脑收下（不是被静默丢掉）', () async {
    final due = DateTime.now().toUtc().add(const Duration(hours: 2));
    final task = await client.createTask(
      title: '真跑-截止-${DateTime.now().microsecondsSinceEpoch}',
      dueTime: due.toIso8601String(),
      priority: 'medium',
    );
    expect(task.dueTime, isNotNull, reason: '截止时间没落进任务里');
    expect(
      task.dueTime!.toUtc().difference(due).inSeconds.abs(),
      lessThan(5),
      reason: '端脑把截止时间改成了别的东西',
    );
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('读回：刚建的那条在列表里，字段一致', () async {
    final created = await makeTask('读回');
    final tasks = await client.listTasks();
    final hit = tasks.where((t) => t.id == created.id).toList();
    expect(hit.length, 1, reason: '刚建的任务在列表里不见了');
    expect(hit.first.title, created.title);
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('确认：确认位真被端脑记下', () async {
    final created = await makeTask('确认');
    final confirmed = await client.confirmTask(created.id, confirmed: true);
    expect(confirmed.confirmed, isTrue, reason: '端脑没记下这次确认');
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('改：标题真被改掉（改完读回来是新标题）', () async {
    final created = await makeTask('改');
    final newTitle = '改过的-${DateTime.now().microsecondsSinceEpoch}';
    await client.updateTask(created.id, title: newTitle);
    final tasks = await client.listTasks();
    final hit = tasks.where((t) => t.id == created.id).toList();
    expect(hit.length, 1);
    expect(hit.first.title, newTitle, reason: '改完读回来还是旧标题');
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('删：删完列表里就没有它了', () async {
    final created = await makeTask('删');
    await client.deleteTask(created.id);
    final tasks = await client.listTasks();
    expect(tasks.where((t) => t.id == created.id).isEmpty, isTrue);
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');

  test('落盘：任务库文件里真有这条任务，且是**完整**的 JSON', () async {
    final created = await makeTask('落盘');
    expect(tasksFile, isNotEmpty,
        reason: '没给 SHADOW_LIVE_TASKS_FILE ⇒ 这条测不了');

    // 落盘是**异步**的 ⇒ ⇒ 给它一点时间。
    var raw = '';
    for (var i = 0; i < 40; i++) {
      final file = File(tasksFile);
      if (file.existsSync()) raw = await file.readAsString();
      if (raw.contains(created.id)) break;
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    expect(
      raw,
      contains(created.id),
      reason: '任务库文件里没有刚才那条任务 ⇒ 落盘没生效',
    );

    final decoded = jsonDecode(raw);
    expect(decoded, isA<Map<String, dynamic>>());
    expect((decoded as Map<String, dynamic>)['tasks'], isA<List>());
  }, skip: live ? false : '没有真端脑 ⇒ 跳过（不是通过）');
}
