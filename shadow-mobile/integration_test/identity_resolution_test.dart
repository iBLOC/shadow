import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/providers/identity_provider.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'shadow_key.dart';

/// 「App 在真机上知不知道自己是谁」—— 这一条只测**客户端这一侧**。
///
/// 端脑那一侧（谁是这个账号）由 `account_export_test.dart` 对账。
/// 这里要钉的是另一件事：
///
/// ⚠️ **大脑冷启动要十几秒**（抽 Flutter 资源 + 加载 150MB 的 `.so` +
/// boot 端脑面），而单次身份解析有 15 秒的上界 ⇒ 启动那一次**大概率
/// 超时** ⇒ 如果失败之后**没有下一次**，身份就永远停在「背后没有人」、
/// 租户永远停在 `default` ⇒ **手机端还在往 `default` 桶写** ⇒
/// 桌面端读的是账号人格桶 ⇒ **两端其实没有读写同一份记忆**（还不报错）。
///
/// 所以这个文件按**冷启动的真实顺序**走两段：
/// 1. 大脑还没起来 ⇒ 解析回退 `default` 桶（兜底，不报错）；
/// 2. 大脑起来之后 ⇒ 再解析一次 ⇒ 落到**账号人格桶**。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');

  test('大脑还没起来 ⇒ 回退 default 桶（兜底，不报错）', () async {
    // 故意**不**起端脑 —— 这就是冷启动早期那一刻的样子。
    final client = TelencephalonClient(baseUrl: 'http://127.0.0.1:59999');
    final prefrontal = PrefrontalClient(baseUrl: 'http://127.0.0.1:60080');
    final notifier = IdentityNotifier(client, prefrontal);

    final tenant = await notifier.resolveWithRetry(
      attempts: 2,
      timeout: const Duration(seconds: 2),
      pause: const Duration(milliseconds: 200),
    );

    expect(tenant, 'default');
    expect(notifier.state.resolved, isFalse);
    expect(notifier.state.error, isNotNull);
  });

  test('大脑起来之后 ⇒ App 解析出账号人格，租户落在那个桶（不是 default）', () async {
    // 1) 起端脑 —— 走真实的 JNI 通道。
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
    final agentPort = started?['agentPort'] as int?;
    expect(agentPort ?? 0, greaterThan(0), reason: '端脑面没起来');

    // 2) 端脑自报的身份 —— **ground truth**。
    //
    // ⚠️ 端脑面**可能**要求 shadow key（`<filesDir>/shadow.key` 存在时）⇒
    // 这里跟 App 一样把它带上（App 那边是宿主在启动时交给 client 的）。
    // ⚠️ 端脑面上锁之前这个文件不存在 ⇒ key 为 null ⇒ 照旧按「不带 key」跑
    // （那时端脑面是敞开的）；上锁之后它自动变成一条真的断言。
    final key = await readShadowKey();
    final response = await http.get(
      Uri.parse('http://127.0.0.1:$agentPort/shadow/v1/identity'),
      headers: shadowKeyHeaders(key),
    );
    expect(response.statusCode, 200, reason: '端脑的身份端点答了 ${response.statusCode}');
    final identity = jsonDecode(response.body) as Map<String, dynamic>;
    expect(identity['identified'], isTrue, reason: '端脑没有身份');
    final persona = identity['persona'] as String;

    // 3) 走**App 自己那条路**：同一个 client、同一个 notifier ——
    //    客户端的租户必须落在那个人格桶上。
    final client = TelencephalonClient(baseUrl: 'http://127.0.0.1:$agentPort');
    client.setApiKey(key);
    final prefrontal = PrefrontalClient(baseUrl: 'http://127.0.0.1:60080');
    final notifier = IdentityNotifier(client, prefrontal);

    final tenant = await notifier.resolveWithRetry();

    expect(tenant, persona);
    expect(tenant, isNot('default'), reason: '租户不能停在 default —— 那是「背后没有人」的桶');
    // 租户真的落到海马体 client 上了（否则读写还是按 default 走）。
    expect(prefrontal.tenantId, persona);
    expect(notifier.state.identified, isTrue);
    expect(notifier.state.device, identity['device']);
  });
}
