import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

import 'shadow_key.dart';

/// 读回落盘的 admin token（宿主把它写在 `<filesDir>/admin.key`）。
///
/// ⚠️ 它**必须落盘**：端脑与 App 的生命周期不完全重合（大脑停了 App 还在，
/// 或反过来）⇒ 钥匙一变，两边就得重新对齐一次。
Future<String?> readAdminKey() async {
  final support = await getApplicationSupportDirectory();
  final file = File('${support.path}/admin.key');
  if (!file.existsSync()) return null;
  final key = (await file.readAsString()).trim();
  return key.isEmpty ? null : key;
}

/// 「手机上的 admin 面关上了没有」—— 这一条只测**门**。
///
/// ## 要证明的是什么
///
/// admin 面 = 端脑的**控制面**（`/api/telencephalon/admin/*`）：装 agent、
/// 增删启停 MCP server、**改 LLM 上游**（把大脑的模型流量指到别处）、
/// reset 测试。
///
/// ⚠️ **2026-10-31 真机证实过它当时是开着的**：端脑的 admin token 在手机上
/// 恒为**空串**（Android 进程设不了环境变量、也没有配置文件）⇒ 而
/// `verify_admin_token` 在 expected 为空串时只要求「请求里带 `X-Admin-Token`
/// 头」⇒ **空值**的头与空串 `ct_eq` 相等 ⇒ **过**。
///
/// ⇒ 实测（端脑面 40579，原始 socket）：**不带任何头 ⇒ 401**，
/// **空 `X-Admin-Token:` 头 ⇒ 200**（已装 agent 列表直接被列出来）。
///
/// ## 现在要钉的是两件事
///
/// 1. **门真的锁上了**：不带 token ⇒ 401；**空值 token ⇒ 401**（就是那个
///    绕过）；错 token ⇒ 401；对 token ⇒ 200。
/// 2. **App 自己没被自己锁在外面**：App 自己的客户端带着宿主给的那把 token
///    ⇒ 能读 admin 面。
///
/// ⚠️ 第 1 条是**安全不变量**、第 2 条是**可用性不变量** —— 只测一条都不够：
/// 只测第 1 条会得到一个「锁上了但 App 自己也用不了 admin 功能」的版本。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late int agentPort;
  late String adminToken;
  late String shadowKey;

  setUpAll(() async {
    // 走真实的 JNI 通道起端脑 —— 和 App 自己起它的那条路一模一样。
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
    expect(agentPort, greaterThan(0), reason: '端脑面没起来');

    // 宿主生成的两把钥匙：**不同的**两把（门闩 / 凭据）。
    adminToken = started?['adminToken'] as String? ?? '';
    expect(
      adminToken,
      isNotEmpty,
      reason: '宿主没有把 admin token 交回来 ⇒ admin 面仍然是敞开的',
    );
    shadowKey = started?['shadowKey'] as String? ?? '';
    expect(shadowKey, isNotEmpty, reason: '宿主没有把 shadow key 交回来');

    // 钥匙必须**落盘**（重启后不变）—— 端脑与 App 的生命周期不完全重合。
    expect(
      await readShadowKey(),
      shadowKey,
      reason: '落盘的钥匙与交回来的不一致 ⇒ 端脑与客户端会对不上',
    );
    expect(
      await readAdminKey(),
      adminToken,
      reason: 'admin token 没有落盘（或与交回来的不一致）⇒ 重启后端脑与客户端'
          '会各拿一把 ⇒ admin 面突然 401',
    );
  });

  /// ⚠️ **原始 socket** —— `package:http` 可能会**丢掉空值头**，那样测的
  /// 就不是「空值头」这条路了（而这正是那个绕过的形状）。
  Future<int> rawGet(String path, {String? adminHeader}) async {
    final socket = await Socket.connect('127.0.0.1', agentPort);
    final head = StringBuffer()
      ..write('GET $path HTTP/1.1\r\n')
      ..write('Host: 127.0.0.1:$agentPort\r\n')
      ..write('X-Shadow-Key: $shadowKey\r\n');
    if (adminHeader != null) {
      head.write('X-Admin-Token: $adminHeader\r\n');
    }
    head.write('Connection: close\r\n\r\n');
    socket.write(head.toString());
    await socket.flush();
    final chunks = <int>[];
    await socket.forEach(chunks.addAll);
    socket.destroy();
    final raw = utf8.decode(chunks, allowMalformed: true);
    final m = RegExp(r'^HTTP/1\.[01] (\d{3})').firstMatch(raw);
    return int.tryParse(m?.group(1) ?? '0') ?? 0;
  }

  const adminPath = '/api/telencephalon/admin/agents/installed';

  /// ⚠️ **原始 socket 的 POST** —— 同上：空值头不能被丢掉。
  ///
  /// ⚠️ `body` 必须是 **ASCII**（`Content-Length` 按字节算）。
  Future<int> rawPost(
    String path,
    String body, {
    String? adminHeader,
  }) async {
    final socket = await Socket.connect('127.0.0.1', agentPort);
    final head = StringBuffer()
      ..write('POST $path HTTP/1.1\r\n')
      ..write('Host: 127.0.0.1:$agentPort\r\n')
      ..write('X-Shadow-Key: $shadowKey\r\n')
      ..write('Content-Type: application/json\r\n')
      ..write('Content-Length: ${body.length}\r\n');
    if (adminHeader != null) {
      head.write('X-Admin-Token: $adminHeader\r\n');
    }
    head.write('Connection: close\r\n\r\n');
    socket.write(head.toString());
    socket.write(body);
    await socket.flush();
    final chunks = <int>[];
    await socket.forEach(chunks.addAll);
    socket.destroy();
    final raw = utf8.decode(chunks, allowMalformed: true);
    final m = RegExp(r'^HTTP/1\.[01] (\d{3})').firstMatch(raw);
    return int.tryParse(m?.group(1) ?? '0') ?? 0;
  }

  test('不带 token ⇒ 401（这就是「别的 App」那一路）', () async {
    expect(
      await rawGet(adminPath),
      401,
      reason: 'admin 面没上锁：不带 token 也放行了 ⇒ 同一台设备上任何别的 '
          'App 都能改这台手机的大脑（装 agent、改 LLM 上游、动 MCP）',
    );
  });

  test('空 token ⇒ 401（这正是手机上前那个绕过）', () async {
    expect(
      await rawGet(adminPath, adminHeader: ''),
      401,
      reason: '空的 X-Admin-Token 头被放行了 ⇒ admin 面在手机上是敞开的',
    );
  });

  test('错 token ⇒ 401', () async {
    expect(
      await rawGet(adminPath, adminHeader: '$adminToken-wrong'),
      401,
      reason: '错 token 也放行了 ⇒ 等于没锁',
    );
  });

  test('对 token ⇒ 200（App 自己仍然管得了自己的大脑）', () async {
    expect(
      await rawGet(adminPath, adminHeader: adminToken),
      200,
      reason: '带对 token 也被拒 ⇒ App 被自己锁在外面（它的 MCP/agent 管理'
          '功能在手机上就成 401 了）',
    );
  });

  test('两把钥匙互不相通：shadow key 不能当 admin token 用', () async {
    expect(
      await rawGet(adminPath, adminHeader: shadowKey),
      401,
      reason: '两把钥匙是两个域 ⇒ 一把钥匙不能开两扇门',
    );
  });

  // ---- 写路由（建 agent）------------------------------------------------
  //
  // ⚠️ 这条比读路由更危险：**建 agent** = 往你的大脑里塞一个它自己写的叶区
  // （= 往模型面前插一条自己写的路）。
  //
  // ⚠️ 端脑那边这三条路由以前写的是 `let _ = verify_admin_token(...)` ——
  // **`let _ =` 把鉴权结果丢掉了** ⇒ 带对的 token 能过、**带错的也能过、
  // 完全不带也能过** ⇒ 等于根本没有鉴权。

  test('写路由（建 agent）不带 token ⇒ 401', () async {
    expect(
      await rawPost(
        '/api/telencephalon/admin/agents/create',
        '{"name":"intruder","system_prompt":"you are an intruder"}',
      ),
      401,
      reason: '建 agent 这条路由以前**把鉴权结果丢掉了** ⇒ 同一台设备上任何'
          '别的 App 都能往你的大脑里塞一个它自己写的叶区',
    );
  });

  test('写路由（建 agent）空 token ⇒ 401', () async {
    expect(
      await rawPost(
        '/api/telencephalon/admin/agents/create',
        '{"name":"intruder","system_prompt":"you are an intruder"}',
        adminHeader: '',
      ),
      401,
      reason: '空的 X-Admin-Token 头被放行了 ⇒ 等于没锁',
    );
  });

  test('写路由（建 agent）错 token ⇒ 401', () async {
    expect(
      await rawPost(
        '/api/telencephalon/admin/agents/create',
        '{"name":"intruder","system_prompt":"you are an intruder"}',
        adminHeader: '$adminToken-wrong',
      ),
      401,
      reason: '错 token 也放行了 ⇒ 那条路由等于没有鉴权',
    );
  });

  test('写路由（建 agent）对 token ⇒ 过鉴权（400 名字为空，不会创建任何东西）',
      () async {
    expect(
      await rawPost(
        '/api/telencephalon/admin/agents/create',
        '{"name":"","system_prompt":"x"}',
        adminHeader: adminToken,
      ),
      400,
      reason: '带对 token 应该过鉴权（后面是 400「name is required」，不是 401）'
          '—— 用空名字是故意的：什么都不会被创建',
    );
  });
}
