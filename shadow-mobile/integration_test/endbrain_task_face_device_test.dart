import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// **真机级** —— 移动端端脑任务面：真设备 ＋ **App 进程内那份真端脑** ＋ 真 HTTP。
///
/// 为什么要这条：此前这条链路的读数只到**本机 host 级**（flutter test 跑在
/// 桌面上 ⇒ 那个「真端脑」是本机进程，**不是手机里的那份**）⇒ ⇒ 而手机里那份
/// 是 App 私有目录 ＋ 嵌进去的 so ⇒ ⇒ 地址、钥匙、落盘点**全都不同**。
///
/// 端脑的启动走的是 **App 自己那条路**（JNI 通道 start）⇒ ⇒ 测的就是用户
/// 手机上真正在跑的那一份。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late int agentPort;
  late String adminToken;
  late String shadowKey;
  late TelencephalonClient client;

  setUpAll(() async {
    Map<dynamic, dynamic>? started;
    for (var attempt = 0; attempt < 30; attempt++) {
      started = await channel.invokeMethod<Map<dynamic, dynamic>>(
        'start',
        {'port': 0},
      );
      final port = started?['agentPort'] as int?;
      if (started?['success'] == true && (port ?? 0) > 0) break;
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    agentPort = started?['agentPort'] as int? ?? 0;
    expect(agentPort, greaterThan(0), reason: '端脑面没起来（App 里那份）');
    adminToken = started?['adminToken'] as String? ?? '';
    shadowKey = started?['shadowKey'] as String? ?? '';
    expect(adminToken, isNotEmpty, reason: '宿主没有把 admin token 交回来');
    client = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:$agentPort',
      apiKey: shadowKey,
      adminToken: adminToken,
    );
  });

  /// 每条用例**自己造一条任务** ⇒ ⇒ 用例之间**不互相依赖**（谁先跑都一样）。
  Future<TelencephalonTask> makeTask(String label) async {
    final title =
        '真机-$label-${DateTime.now().microsecondsSinceEpoch}';
    return client.createTask(title: title, priority: 'high');
  }

  test('读门负控：设备上的端脑有影子锁 ⇒ 没钥匙 ⇒ 401', () async {
    // ⚠️ **与本机 host 级那条不同**：host 级那边「影子锁为空 ⇒ 读面开着」
    // ⇒ ⇒ 而**手机上的端脑**是宿主（App）启动的 ⇒ ⇒ 宿主**一定**配了影子锁
    // ⇒ ⇒ 读门是**关着**的 ⇒ ⇒ 这里钉的是「关着」这一侧。
    final anon = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:$agentPort',
    );
    await expectLater(
      anon.listTasks(),
      throwsA(
        predicate(
          (e) => e is TelencephalonException && e.toString().contains('401'),
        ),
      ),
    );
  });

  test('带影子锁就能读（App 自己没被自己锁在外面）', () async {
    final withKey = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:$agentPort',
      apiKey: shadowKey,
    );
    final tasks = await withKey.listTasks();
    expect(tasks, isA<List<TelencephalonTask>>());
  });

  test('写门负控：没有 admin token ⇒ 建任务被拒（401）', () async {
    final noKey = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:$agentPort',
      apiKey: shadowKey,
    );
    await expectLater(
      noKey.createTask(title: '没钥匙就不该建成'),
      throwsA(
        predicate(
          (e) => e is TelencephalonException && e.toString().contains('401'),
        ),
      ),
    );
  });

  test('建任务：线上形状钉住（id/标题/状态/优先级）', () async {
    final task = await makeTask('形状');
    expect(task.id, isNotEmpty, reason: '端脑没给任务号');
    expect(task.title, startsWith('真机-形状-'));
    expect(task.status, 'Pending');
    expect(task.priority, 'High', reason: '优先级是 serde 变体名（PascalCase）');
  });

  test('截止时间：发出去的 due_time 真被端脑收下（不是被静默丢掉）', () async {
    final due = DateTime.now().toUtc().add(const Duration(hours: 2));
    final task = await client.createTask(
      title: '真机-截止-${DateTime.now().microsecondsSinceEpoch}',
      dueTime: due.toIso8601String(),
      priority: 'medium',
    );
    expect(task.dueTime, isNotNull, reason: '截止时间没落进任务里');
    expect(
      task.dueTime!.toUtc().difference(due).inSeconds.abs(),
      lessThan(5),
      reason: '端脑把截止时间改成了别的东西',
    );
  });

  test('读回：刚建的那条在列表里，字段一致', () async {
    final created = await makeTask('读回');
    final tasks = await client.listTasks();
    final hit = tasks.where((t) => t.id == created.id).toList();
    expect(hit.length, 1, reason: '刚建的任务在列表里不见了');
    expect(hit.first.title, created.title);
  });

  test('确认：确认位真被端脑记下', () async {
    final created = await makeTask('确认');
    final confirmed = await client.confirmTask(created.id, confirmed: true);
    expect(confirmed.confirmed, isTrue, reason: '端脑没记下这次确认');
  });

  test('改：标题真被改掉（改完读回来是新标题）', () async {
    final created = await makeTask('改');
    final newTitle = '改过的-${DateTime.now().microsecondsSinceEpoch}';
    await client.updateTask(created.id, title: newTitle);
    final tasks = await client.listTasks();
    final hit = tasks.where((t) => t.id == created.id).toList();
    expect(hit.length, 1);
    expect(hit.first.title, newTitle, reason: '改完读回来还是旧标题');
  });

  test('删：删完列表里就没有它了', () async {
    final created = await makeTask('删');
    await client.deleteTask(created.id);
    final tasks = await client.listTasks();
    expect(tasks.where((t) => t.id == created.id).isEmpty, isTrue);
  });

  test('真机级落盘：任务库真在 App 私有目录里，且是**完整**的 JSON', () async {
    final created = await makeTask('落盘');

    // 落盘点：端脑把任务库写在 providers.json **旁边**（宿主指了同一个目录）
    // ⇒ ⇒ 找 App 私有目录下的 tasks.json（Android 上 support 目录＝filesDir）。
    File? found;
    for (final dir in [
      await getApplicationSupportDirectory(),
      await getApplicationDocumentsDirectory(),
    ]) {
      found = await _findTasksFile(dir);
      if (found != null) break;
    }
    expect(
      found,
      isNotNull,
      reason: 'App 私有目录里没有 tasks.json ⇒ 手机上的端脑任务**不落盘**',
    );

    // 落盘是**异步**的（写完任务才刷盘）⇒ ⇒ 给它一点时间。
    var raw = '';
    for (var i = 0; i < 40; i++) {
      raw = await found!.readAsString();
      if (raw.contains(created.id)) break;
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    expect(
      raw,
      contains(created.id),
      reason: 'tasks.json 里没有刚才那条任务 ⇒ 落盘没生效',
    );

    // 完整 JSON（不是半个文件）⇒ ⇒ 「先截断再写」那种坑不会发生在这儿。
    final decoded = jsonDecode(raw);
    expect(decoded, isA<Map<String, dynamic>>());
    expect((decoded as Map<String, dynamic>)['tasks'], isA<List>());
  });
}

/// 递归（浅）找 tasks.json —— 只在 App 私有目录里找，不越界。
Future<File?> _findTasksFile(Directory dir, {int depth = 0}) async {
  if (depth > 2) return null;
  final direct = File('${dir.path}/tasks.json');
  if (direct.existsSync()) return direct;
  try {
    for (final entity in dir.listSync()) {
      if (entity is Directory) {
        final hit = await _findTasksFile(entity, depth: depth + 1);
        if (hit != null) return hit;
      }
    }
  } catch (_) {
    // 读不到就当没有 ⇒ 让断言去说话。
  }
  return null;
}
