import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/providers/engine_models_provider.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 本地模型面（neuron's `/v1/models*`）的**地址归属**。
///
/// ⚠️ 背景（2026-11-02）：这一半以前把地址**写死**成
/// `http://localhost:60080`（`prefrontalBaseUrlProvider`）⇒ ⇒
///
/// - 内嵌大脑接管时，端脑面在**随机端口**上 ⇒ 这一半打错；
/// - 用户把大脑配到远端 ⇒ 这一半还在打本机 ⇒ 「供应商来自新大脑、
///   本地模型来自老机器」—— 同一个页面两张脸。
///
/// ⇒ ⇒ 桌面端上一轮已把同一族的旁路删掉（`neuronUrl()`）⇒ 移动端这一半
/// 必须跟**端脑面的真相源**走（客户端对象恒定、地址可变 ⇒ 用回调现取）。
void main() {
  test('端脑面换地址 ⇒ 本地模型这一半跟着换', () {
    var current = 'http://127.0.0.1:60080';
    final notifier = EngineModelsNotifier(baseUrlFn: () => current);

    expect(notifier.baseUrl, 'http://127.0.0.1:60080');

    // 内嵌大脑接管（随机端口）。
    current = 'http://127.0.0.1:43210';
    expect(notifier.baseUrl, 'http://127.0.0.1:43210');

    // 用户把大脑配到远端。
    current = 'http://192.168.1.50:60080';
    expect(notifier.baseUrl, 'http://192.168.1.50:60080');
  });

  test('请求真的打在当前地址上（尾斜杠归一化）', () async {
    final seen = <String>[];
    final mock = MockClient((req) async {
      seen.add(req.url.toString());
      return http.Response(jsonEncode({'data': []}), 200);
    });

    final notifier =
        EngineModelsNotifier(baseUrl: 'http://127.0.0.1:60080/', client: mock);
    await notifier.refresh();

    expect(seen, isNotEmpty);
    expect(seen.first, 'http://127.0.0.1:60080/v1/models');
    expect(seen.every((u) => u.startsWith('http://127.0.0.1:60080/')), isTrue);
  });

  test('provider 接的是**端脑面**（client），不是写死的 60080', () {
    final fake = TelencephalonClient(baseUrl: 'http://127.0.0.1:1111');
    final container = ProviderContainer(overrides: [
      telencephalonClientProvider.overrideWithValue(fake),
    ]);
    addTearDown(container.dispose);

    final notifier = container.read(engineModelsProvider.notifier);
    expect(notifier.baseUrl, 'http://127.0.0.1:1111');

    fake.setBaseUrl('http://127.0.0.1:2222');
    expect(notifier.baseUrl, 'http://127.0.0.1:2222');
  });
}
