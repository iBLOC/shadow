import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'shadow_key.dart';

/// 「手机上的端脑面到底关上了没有」—— 这一条只测**门**。
///
/// ## 要证明的是什么
///
/// Android 进程**设不了环境变量**（zygote 决定、宿主注入不了）⇒ 手机上的
/// 端脑**没有配置文件** ⇒ `telencephalon.shadow.api_key` 取默认 `""` ⇒
/// `require_shadow_key` **全部放行** ⇒ 同一台设备上**任何别的 App** 都能打
/// 这张面，包括 `POST /shadow/v1/identity`（导入账号 ⇒ **换掉「这台机器是谁」**
/// ⇒ 记忆改写进另一个人格、而且**不报错**）。
///
/// 修法是：宿主生成一把钥匙（`<filesDir>/shadow.key`），**同一份**同时递给
/// 端脑（守门）和 App 自己的客户端（敲门）。
///
/// 所以这里要钉的是**两件事**：
///
/// 1. **门真的锁上了**：不带 key ⇒ 401（改之前是 200）；
/// 2. **App 自己没被自己锁在外面**：带 key ⇒ 200，身份解析照常。
///
/// ⚠️ 第 1 条是**安全不变量**、第 2 条是**可用性不变量** —— 只测一条都不够：
/// 只测第 1 条会得到一个「锁上了但 App 自己也连不上」的版本（症状是租户
/// 静默退回 `default` 桶、**不报错**）；只测第 2 条则等于没锁。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  late int agentPort;
  late String key;

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

    key = started?['shadowKey'] as String? ?? '';
    expect(
      key,
      isNotEmpty,
      reason: '宿主没有把 shadow key 交回来 ⇒ 端脑面仍然是敞开的',
    );

    // 钥匙必须**落盘**（重启后不变）—— 端脑与 App 的生命周期不完全重合。
    final onDisk = await readShadowKey();
    expect(
      onDisk,
      key,
      reason: '落盘的钥匙与交回来的不一致 ⇒ 端脑与客户端会对不上',
    );
  });

  Uri identityUri() => Uri.parse('http://127.0.0.1:$agentPort/shadow/v1/identity');

  test('不带 key ⇒ 401（这就是「别的 App」那一路）', () async {
    final response = await http.get(identityUri());
    expect(
      response.statusCode,
      401,
      reason: '端脑面没上锁：不带 key 也放行了 ⇒ 同一台设备上任何别的 App '
          '都能读这台机器是谁',
    );
  });

  test('错 key ⇒ 401', () async {
    final response = await http.get(
      identityUri(),
      headers: shadowKeyHeaders('$key-wrong'),
    );
    expect(response.statusCode, 401, reason: '错 key 也放行了 ⇒ 等于没锁');
  });

  test('对 key ⇒ 200（App 自己仍然连得上自己的大脑）', () async {
    final response = await http.get(
      identityUri(),
      headers: shadowKeyHeaders(key),
    );
    expect(response.statusCode, 200, reason: '带对 key 也被拒 ⇒ App 被自己锁在外面');
    final identity = jsonDecode(response.body) as Map<String, dynamic>;
    expect(identity['identified'], isTrue, reason: '端脑没有身份');
  });

  test('不带 key POST /shadow/v1/identity ⇒ 401 ⇒ 换不掉「这台机器是谁」', () async {
    // 先记下现在是谁 —— 这一条要证明的是「攻击者改不了」，不只是「被拒了」。
    final before = await http.get(
      identityUri(),
      headers: shadowKeyHeaders(key),
    );
    expect(before.statusCode, 200);
    final beforeIdentity = jsonDecode(before.body) as Map<String, dynamic>;

    // 攻击者那一路：没有钥匙，直接换人。
    final attack = await http.post(
      identityUri(),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({'code': 'not-a-real-account-code'}),
    );
    expect(
      attack.statusCode,
      401,
      reason: '换身份的端点没有上锁 ⇒ 别的 App 能把「这台机器是谁」换掉',
    );

    // 换不掉 —— 身份一个字都没变。
    final after = await http.get(
      identityUri(),
      headers: shadowKeyHeaders(key),
    );
    final afterIdentity = jsonDecode(after.body) as Map<String, dynamic>;
    expect(afterIdentity['persona'], beforeIdentity['persona']);
    expect(afterIdentity['principal'], beforeIdentity['principal']);
  });

  test('App 自己的客户端带上 key ⇒ 能读到身份（客户端这条路没被自己堵死）', () async {
    final client = TelencephalonClient(baseUrl: 'http://127.0.0.1:$agentPort');
    client.setApiKey(key);
    final identity = await client.getIdentity();
    expect(identity.identified, isTrue);
    expect(identity.persona, isNotNull);
    expect(identity.persona, isNot('default'), reason: '人格不能停在 default');
  });
}
